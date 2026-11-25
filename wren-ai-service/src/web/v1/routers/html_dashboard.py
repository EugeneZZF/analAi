"""DB-GPT-inspired AI HTML Dashboard generator with Bento Dark Analytics UI."""

import html
import json
import logging
import os
import re
from typing import Any, Dict, List

from fastapi import APIRouter
from litellm import acompletion
from pydantic import BaseModel

from src.config import settings
from src.web.v1.services.skills import SkillsService

logger = logging.getLogger("wren-ai-service")
router = APIRouter()
_dashboard_skills_service = SkillsService()


def _resolve_dashboard_llm_config() -> Dict[str, Any]:
    """Resolve LLM model, api_base, and api_key for HTML dashboard generation."""
    ollama_base = (os.getenv("OLLAMA_API_BASE") or "").strip()
    ollama_model = (os.getenv("OLLAMA_MODEL") or "").strip()
    if ollama_base and ollama_model:
        return {
            "model": ollama_model,
            "api_base": ollama_base,
            "api_key": None,
            "use_json_format": False,
        }

    for component in getattr(settings, "components", []) or []:
        llm_cfg = getattr(component, "llm", None)
        if llm_cfg and getattr(llm_cfg, "model", None):
            model = llm_cfg.model
            kwargs = getattr(llm_cfg, "kwargs", None) or {}
            api_base = kwargs.get("api_base") or getattr(llm_cfg, "api_base", None)
            api_key_env = getattr(llm_cfg, "api_key", None)
            api_key = os.getenv(api_key_env) if isinstance(api_key_env, str) and api_key_env in os.environ else api_key_env
            if not api_key:
                api_key = os.getenv("DEEPSEEK_API_KEY") or os.getenv("LLM_OPENAI_API_KEY")
            is_ollama = model.startswith("ollama")
            return {
                "model": model,
                "api_base": api_base,
                "api_key": None if is_ollama else api_key,
                "use_json_format": not is_ollama,
            }

    return {
        "model": "deepseek/deepseek-chat",
        "api_base": "https://api.deepseek.com/v1",
        "api_key": os.getenv("DEEPSEEK_API_KEY") or os.getenv("LLM_OPENAI_API_KEY"),
        "use_json_format": True,
    }

SPEC_SYSTEM_PROMPT = """You are a senior BI Data Visualization architect.
Given a user's original question, the executed SQL, column metadata, and sample rows, design an insightful dashboard specification in JSON that STRICTLY answers the user's question.

Return ONLY valid JSON with this exact schema:
{
  "title": "Dashboard title strictly matching the user's question",
  "subtitle": "Short 1-line analytical summary",
  "insights": [
    {"title": "Short headline (e.g. Рост выручки на 14,8%)", "detail": "1 concise explanatory line", "trend": "up|down"}
  ],
  "column_labels": {
    "exact_column_name": "Human-readable label in Russian (e.g. order_count -> Заказы, total_revenue -> Выручка, week_start -> Неделя)"
  },
  "kpis": [
    {"label": "Metric name", "field": "exact_numeric_column_name", "agg": "sum|avg|last|max|min", "filter_field": null, "filter_value": null}
  ],
  "charts": [
    {
      "title": "Chart title",
      "subtitle": "Short description",
      "chart_type": "bar|area|line|donut|pie|scatter",
      "x_field": "exact_column_name",
      "y_fields": ["exact_numeric_column_name"],
      "filter_field": null,
      "filter_value": null,
      "horizontal": false,
      "forecast_periods": 0
    }
  ]
}

Rules:
1. Use ONLY exact column names present in `Columns`.
2. Provide 3 concise items in `insights` grounded in the sample data (each with `trend: "up"` or `"down"`).
3. Provide 3-4 KPIs using exact numeric column names.
4. Provide 2-3 focused charts:
   - For time-series / forecast questions ("на следующей неделе", "прогноз", "динамика"), include a `bar` chart for period dynamics AND an `area`/`line` chart with `forecast_periods: 1` (or requested N) for the forecast!
   - If there is a category/channel/status dimension, include a `donut` chart for structure/shares.
   - If the dataset has a `section` column from UNION ALL, create one chart per meaningful section using `filter_field: "section"` and `filter_value: "<value>"`, with `x_field` set to the label column.
5. ALWAYS populate `column_labels` for EVERY column with natural Russian names.
"""


class HtmlDashboardRequest(BaseModel):
    question: str
    sql: str = ""
    columns: List[Dict[str, Any]]
    rows: List[Dict[str, Any]]


def _safe_json_for_script(data: Any) -> str:
    return (
        json.dumps(data, ensure_ascii=False, default=str)
        .replace("<", "\\u003c")
        .replace(">", "\\u003e")
        .replace("&", "\\u0026")
    )


def _extract_json(raw: str) -> Dict[str, Any]:
    text = raw.strip()
    fence = re.search(r"```(?:json)?\s*(\{[\s\S]*\})\s*```", text, re.I)
    if fence:
        text = fence.group(1)
    else:
        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end != -1:
            text = text[start : end + 1]
    return json.loads(text)


def _enforce_forecast_intent(question: str, spec: Dict[str, Any]) -> None:
    q = (question or "").lower()
    forecast_markers = (
        "прогноз",
        "следующ",
        "будущ",
        "будут",
        "будет",
        "ожида",
        "предска",
        "forecast",
        "predict",
        "next week",
        "next month",
    )
    if not any(m in q for m in forecast_markers):
        return
    charts = spec.get("charts") or []
    has_forecast = any(int(c.get("forecast_periods") or 0) > 0 for c in charts)
    if not has_forecast:
        for chart in charts:
            if chart.get("chart_type") in ("line", "area"):
                chart["forecast_periods"] = 1
                has_forecast = True
                break
    if not has_forecast and charts:
        first = dict(charts[0])
        first["chart_type"] = "area"
        first["forecast_periods"] = 1
        first["title"] = f"Прогноз: {first.get('title', 'динамика')}"
        charts.append(first)


def _render_dashboard_html(
    spec: Dict[str, Any],
    columns: List[Dict[str, Any]],
    rows: List[Dict[str, Any]],
    sql: str,
) -> str:
    col_names = [c["name"] for c in columns if "name" in c]
    if not col_names and rows:
        col_names = list(rows[0].keys())

    safe_title = html.escape(str(spec.get("title") or "Аналитика данных"))
    safe_subtitle = html.escape(str(spec.get("subtitle") or "AI-дашборд на основе SQL-выборки"))
    safe_sql = html.escape(sql.strip()) if sql else ""

    payload_json = _safe_json_for_script(
        {
            "columns": col_names,
            "column_labels": spec.get("column_labels") or {},
            "rows": rows,
            "kpis": spec.get("kpis") or [],
            "charts": spec.get("charts") or [],
            "insights": spec.get("insights") or [],
        }
    )

    sql_block = (
        f'<details class="sql-panel"><summary>SQL-запрос · строк: {len(rows)}</summary>'
        f"<pre><code>{safe_sql}</code></pre></details>"
        if safe_sql
        else ""
    )

    return f"""<!DOCTYPE html>
<html lang="ru" data-theme="dark">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{safe_title}</title>
  <script src="https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js"></script>
  <style>
    :root {{
      --bg: #080909;
      --surface: #141414;
      --surface-inset: #191919;
      --border: #222222;
      --border-soft: #2a2a2a;
      --text: #f5f5f5;
      --muted: #8c8c8c;
      --accent: #FF8500;
      --accent-soft: rgba(255, 133, 0, 0.14);
      --positive: #22C55E;
      --positive-soft: rgba(34, 197, 94, 0.14);
      --negative: #EF4444;
      --negative-soft: rgba(239, 68, 68, 0.14);
    }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      padding: 16px;
      font-variant-numeric: tabular-nums;
    }}
    ::-webkit-scrollbar {{ width: 6px; height: 6px; }}
    ::-webkit-scrollbar-track {{ background: #0d0d0d; }}
    ::-webkit-scrollbar-thumb {{ background: #2b2b2b; border-radius: 4px; }}

    header {{
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      margin-bottom: 14px;
      flex-wrap: wrap;
    }}
    h1 {{ margin: 0; font-size: 1.25rem; font-weight: 700; letter-spacing: -0.01em; }}
    .subtitle {{ margin: 2px 0 0; color: var(--muted); font-size: 0.84rem; }}
    .btn {{
      cursor: pointer;
      background: var(--surface);
      color: var(--text);
      border: 1px solid var(--border-soft);
      padding: 7px 12px;
      border-radius: 10px;
      font-size: 0.8rem;
      font-weight: 500;
      transition: border-color 0.2s, color 0.2s;
    }}
    .btn:hover {{ border-color: var(--accent); color: var(--accent); }}
    .btn-accent-outline {{
      width: 100%;
      background: rgba(255, 133, 0, 0.06);
      color: var(--accent);
      border: 1px solid rgba(255, 133, 0, 0.45);
      padding: 10px 14px;
      border-radius: 10px;
      font-size: 0.84rem;
      font-weight: 600;
      cursor: pointer;
      margin-top: 10px;
      transition: background 0.2s;
    }}
    .btn-accent-outline:hover {{ background: rgba(255, 133, 0, 0.14); }}

    .kpi-grid {{
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(215px, 1fr));
      gap: 12px;
      margin-bottom: 12px;
    }}
    .kpi-card {{
      position: relative;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 14px 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
      transition: border-color 0.18s ease;
    }}
    .kpi-card:hover {{ border-color: rgba(255, 133, 0, 0.55); }}
    .kpi-left {{ min-width: 0; flex: 1; }}
    .kpi-head {{ display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }}
    .kpi-icon {{
      width: 24px; height: 24px; border-radius: 7px;
      background: var(--accent-soft); color: var(--accent);
      display: inline-flex; align-items: center; justify-content: center;
      font-size: 12px; flex-shrink: 0;
    }}
    .kpi-label {{ font-size: 0.78rem; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }}
    .kpi-value {{ font-size: 1.32rem; font-weight: 700; letter-spacing: -0.02em; line-height: 1.2; white-space: nowrap; }}
    .kpi-delta {{ font-size: 0.74rem; margin-top: 5px; font-weight: 600; display: flex; align-items: center; gap: 4px; white-space: nowrap; }}
    .kpi-delta.pos {{ color: var(--positive); }}
    .kpi-delta.neg {{ color: var(--negative); }}
    .kpi-spark {{ width: 82px; height: 36px; flex-shrink: 0; }}
    [data-tooltip] {{ position: relative; cursor: help; }}
    [data-tooltip]:hover::after {{
      content: attr(data-tooltip);
      position: absolute;
      left: 50%;
      bottom: calc(100% + 8px);
      transform: translateX(-50%);
      background: #1b1b1b;
      color: #f5f5f5;
      border: 1px solid rgba(255, 133, 0, 0.5);
      border-radius: 8px;
      padding: 6px 10px;
      font-size: 0.76rem;
      font-weight: 500;
      line-height: 1.35;
      white-space: normal;
      width: max-content;
      max-width: 260px;
      z-index: 50;
      box-shadow: 0 8px 20px rgba(0, 0, 0, 0.55);
      pointer-events: none;
    }}
    .kpi-card[data-tooltip]:hover::after {{
      bottom: auto;
      top: calc(100% + 8px);
    }}

    .bento-mid {{
      display: grid;
      grid-template-columns: 1.45fr 1fr;
      gap: 12px;
      margin-bottom: 12px;
    }}
    .bento-mid.has-insights {{
      grid-template-columns: 1.35fr 1fr 0.92fr;
    }}
    .bento-bottom {{
      display: grid;
      grid-template-columns: 1fr 1.35fr;
      gap: 12px;
      margin-bottom: 12px;
    }}
    .bento-bottom.no-forecast {{
      grid-template-columns: 1fr;
    }}
    @media (max-width: 1020px) {{
      .bento-mid, .bento-mid.has-insights, .bento-bottom {{ grid-template-columns: 1fr; }}
    }}

    .card {{
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 16px;
      display: flex;
      flex-direction: column;
    }}
    .card-header {{
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 10px;
      margin-bottom: 6px;
    }}
    .card-title {{ font-weight: 600; font-size: 0.96rem; display: flex; align-items: center; gap: 7px; }}
    .card-hero {{ display: flex; align-items: center; gap: 8px; margin-top: 4px; margin-bottom: 4px; }}
    .hero-num {{ font-size: 1.25rem; font-weight: 700; }}
    .pill {{
      font-size: 0.74rem; font-weight: 600; padding: 2px 8px; border-radius: 999px;
    }}
    .pill.pos {{ background: var(--positive-soft); color: var(--positive); }}
    .pill.neg {{ background: var(--negative-soft); color: var(--negative); }}
    .chart-box {{ width: 100%; height: 270px; flex: 1; }}

    .donut-wrap {{ display: flex; align-items: center; gap: 12px; flex: 1; min-height: 255px; }}
    .donut-canvas {{ position: relative; flex: 1; height: 255px; min-width: 170px; }}
    .donut-center {{
      position: absolute; inset: 0; display: flex; flex-direction: column;
      align-items: center; justify-content: center; pointer-events: none;
      font-weight: 700; font-size: 1.02rem; text-align: center;
    }}
    .donut-center small {{ font-size: 0.7rem; color: var(--muted); font-weight: 500; }}
    .donut-legend {{ width: 44%; display: flex; flex-direction: column; gap: 10px; }}
    .legend-row {{ display: flex; justify-content: space-between; align-items: center; font-size: 0.8rem; gap: 6px; }}
    .legend-left {{ display: flex; align-items: center; gap: 7px; min-width: 0; }}
    .legend-dot {{ width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }}
    .legend-name {{ color: #d4d4d4; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }}
    .legend-pct {{ font-weight: 600; color: var(--text); }}

    .insights-list {{ display: flex; flex-direction: column; gap: 9px; flex: 1; margin-top: 6px; }}
    .insight-item {{
      background: var(--surface-inset);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 10px 12px;
      display: flex;
      gap: 10px;
      align-items: flex-start;
    }}
    .ins-badge {{
      width: 24px; height: 24px; border-radius: 50%;
      display: inline-flex; align-items: center; justify-content: center;
      font-size: 12px; font-weight: 700; flex-shrink: 0; margin-top: 1px;
    }}
    .ins-badge.up {{ background: var(--positive-soft); color: var(--positive); border: 1px solid rgba(34,197,94,0.3); }}
    .ins-badge.down {{ background: var(--negative-soft); color: var(--negative); border: 1px solid rgba(239,68,68,0.3); }}
    .ins-title {{ font-size: 0.82rem; font-weight: 600; color: var(--text); line-height: 1.3; }}
    .ins-detail {{ font-size: 0.75rem; color: var(--muted); margin-top: 2px; line-height: 1.35; }}

    .table-toolbar {{ display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 10px; flex-wrap: wrap; }}
    .table-toggle {{ cursor: pointer; user-select: none; display: inline-flex; align-items: center; gap: 6px; transition: color 0.15s; }}
    .table-toggle:hover {{ color: var(--accent); }}
    .table-card.collapsed .table-toolbar {{ margin-bottom: 0; }}
    .table-card.collapsed .table-wrap,
    .table-card.collapsed .search-input {{ display: none; }}
    .search-input {{
      padding: 5px 10px; border: 1px solid var(--border-soft); border-radius: 8px;
      background: #0d0d0d; color: var(--text); font-size: 0.78rem; width: 150px;
    }}
    .table-wrap {{ overflow-x: auto; max-height: 290px; }}
    table {{ width: 100%; border-collapse: collapse; font-size: 0.8rem; }}
    th, td {{ padding: 9px 8px; border-bottom: 1px solid var(--border); text-align: left; white-space: nowrap; }}
    th {{ position: sticky; top: 0; background: var(--surface); color: var(--muted); font-weight: 500; cursor: pointer; font-size: 0.75rem; }}
    th:hover {{ color: var(--accent); }}
    tr:last-child td {{ border-bottom: none; }}
    tr:hover td {{ background: rgba(255, 133, 0, 0.06); }}
    .td-pos {{ color: var(--positive); font-weight: 600; }}
    .td-neg {{ color: var(--negative); font-weight: 600; }}

    .forecast-legend {{ display: flex; align-items: center; gap: 14px; font-size: 0.76rem; color: var(--muted); }}
    .fl-item {{ display: inline-flex; align-items: center; gap: 6px; }}
    .fl-dot {{ width: 8px; height: 8px; border-radius: 50%; background: var(--accent); }}
    .fl-dash {{ width: 16px; border-top: 2px dashed #ffffff; }}

    .sql-panel {{
      background: var(--surface); border: 1px solid var(--border);
      border-radius: 12px; padding: 10px 14px;
    }}
    .sql-panel summary {{ cursor: pointer; font-weight: 600; color: var(--muted); font-size: 0.8rem; }}
    .sql-panel pre {{ margin: 10px 0 0; padding: 10px; background: #0d0d0d; border-radius: 8px; overflow-x: auto; font-size: 0.78rem; color: #d4d4d4; }}
  </style>
</head>
<body>
  <header>
    <div>
      <h1>{safe_title}</h1>
      <p class="subtitle">{safe_subtitle}</p>
    </div>
    <button class="btn" id="exportCsvTop" type="button">Скачать CSV</button>
  </header>

  <section id="kpiGrid" class="kpi-grid"></section>

  <section id="bentoMid" class="bento-mid has-insights"></section>

  <section id="bentoBottom" class="bento-bottom">
    <div class="card table-card" id="detailsCard">
      <div class="table-toolbar">
        <div class="card-title table-toggle" id="detailsToggle" title="Нажмите, чтобы скрыть или показать таблицу">
          <span id="detailsArrow">▾</span> Детализация (<span id="rowCountLabel">0</span>)
        </div>
        <input id="searchInput" class="search-input" type="search" placeholder="Поиск..." />
      </div>
      <div class="table-wrap"><table id="dataTable"><thead></thead><tbody></tbody></table></div>
    </div>
    <div id="forecastSlot"></div>
  </section>

  {sql_block}

  <script>
    const PAYLOAD = {payload_json};
    const chartInstances = [];

    const RU_MONTHS_GEN = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Нояб", "Дек"];
    const RU_MONTHS_NOM = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Нояб", "Дек"];
    const FALLBACK_LABELS = {{
      order_count: "Заказы",
      orders_count: "Заказы",
      orders: "Заказы",
      total_revenue: "Выручка",
      revenue: "Выручка",
      total_amount: "Выручка",
      avg_order_value: "Средний чек",
      avg_order_amount: "Средний чек",
      total_quantity: "Продано единиц",
      quantity: "Количество",
      units: "Единиц",
      week_start: "Неделя",
      order_week: "Неделя",
      week: "Неделя",
      order_month: "Месяц",
      month: "Месяц",
      order_date: "Дата",
      category: "Категория",
      city: "Город",
      country: "Страна",
      payment_method: "Способ оплаты",
      order_status: "Статус",
      customer_name: "Клиент",
      product_name: "Товар"
    }};
    const KPI_ICONS = ["₽", "🛒", "💳", "📊"];
    const DONUT_COLORS = ["#FF8500", "#FB923C", "#737373", "#404040", "#262626"];

    function colLabel(col) {{
      return (PAYLOAD.column_labels && PAYLOAD.column_labels[col]) || FALLBACK_LABELS[col] || col;
    }}

    function formatHumanDate(val) {{
      if (val === null || val === undefined || val === "") return "N/A";
      const s = String(val).trim();
      const ymd = s.match(/^(\\d{{4}})-(\\d{{2}})-(\\d{{2}})/);
      if (ymd) {{
        const mIdx = Number(ymd[2]) - 1;
        const day = Number(ymd[3]);
        if (mIdx >= 0 && mIdx < 12) return `${{day}} ${{RU_MONTHS_GEN[mIdx]}}`;
      }}
      const ym = s.match(/^(\\d{{4}})-(\\d{{2}})$/);
      if (ym) {{
        const mIdx = Number(ym[2]) - 1;
        if (mIdx >= 0 && mIdx < 12) return `${{RU_MONTHS_NOM[mIdx]}}`;
      }}
      return s;
    }}

    function fmtNum(v) {{
      if (!Number.isFinite(v)) return String(v);
      if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(2).replace(".", ",") + " млн";
      return v.toLocaleString("ru-RU", {{ maximumFractionDigits: 2 }});
    }}

    function filterRows(rows, field, value) {{
      if (!field || value === null || value === undefined) return rows;
      return rows.filter((r) => String(r[field]) === String(value));
    }}

    function nextLabel(last, prev) {{
      const s = String(last || "").slice(0, 10);
      const p = String(prev || "").slice(0, 10);
      const ymd = s.match(/^(\\d{{4}})-(\\d{{2}})-(\\d{{2}})$/);
      if (ymd) {{
        const dtLast = new Date(s + "T00:00:00Z");
        const pMatch = p.match(/^(\\d{{4}})-(\\d{{2}})-(\\d{{2}})$/);
        if (pMatch) {{
          const dtPrev = new Date(p + "T00:00:00Z");
          const diffDays = Math.round((dtLast - dtPrev) / 86400000);
          if (diffDays >= 28 && diffDays <= 31) {{
            dtLast.setUTCMonth(dtLast.getUTCMonth() + 1);
            return dtLast.toISOString().slice(0, 10);
          }}
          if (diffDays >= 1) {{
            dtLast.setUTCDate(dtLast.getUTCDate() + diffDays);
            return dtLast.toISOString().slice(0, 10);
          }}
        }}
        dtLast.setUTCDate(dtLast.getUTCDate() + 7);
        return dtLast.toISOString().slice(0, 10);
      }}
      const ym = s.match(/^(\\d{{4}})-(\\d{{2}})$/);
      if (ym) {{
        let y = Number(ym[1]), m = Number(ym[2]) + 1;
        if (m > 12) {{ m = 1; y += 1; }}
        return String(y).padStart(4, "0") + "-" + String(m).padStart(2, "0");
      }}
      return s + " +1";
    }}

    function linearForecast(vals, periods) {{
      const n = vals.length;
      if (n < 2 || periods <= 0) return [];
      const xm = (n - 1) / 2, ym = vals.reduce((a, b) => a + b, 0) / n;
      let den = 0, num = 0;
      for (let i = 0; i < n; i++) {{ den += (i - xm) ** 2; num += (i - xm) * (vals[i] - ym); }}
      const slope = den ? num / den : 0, inter = ym - slope * xm;
      return Array.from({{ length: periods }}, (_, k) => Math.max(0, Math.round((inter + slope * (n + k)) * 100) / 100));
    }}

    function buildSparkSvg(vals, isPositive, idx) {{
      const pts = vals.slice(-10);
      if (pts.length < 2) return "";
      const w = 88, h = 38, pad = 4;
      const min = Math.min(...pts), max = Math.max(...pts);
      const span = max - min || 1;
      const coords = pts.map((v, i) => [
        pad + (i / (pts.length - 1)) * (w - pad * 2),
        h - pad - ((v - min) / span) * (h - pad * 2)
      ]);
      const lineD = coords.map((c, i) => `${{i === 0 ? "M" : "L"}}${{c[0].toFixed(1)}},${{c[1].toFixed(1)}}`).join(" ");
      const areaD = `${{lineD}} L${{coords[coords.length - 1][0].toFixed(1)}},${{h}} L${{coords[0][0].toFixed(1)}},${{h}} Z`;
      const stroke = isPositive ? "#22C55E" : "#EF4444";
      const gid = `spg_${{idx}}`;
      return `<svg class="kpi-spark" viewBox="0 0 ${{w}} ${{h}}" fill="none">
        <defs>
          <linearGradient id="${{gid}}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="${{stroke}}" stop-opacity="0.35" />
            <stop offset="100%" stop-color="${{stroke}}" stop-opacity="0" />
          </linearGradient>
        </defs>
        <path d="${{areaD}}" fill="url(#${{gid}})" />
        <path d="${{lineD}}" stroke="${{stroke}}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
      </svg>`;
    }}

    function renderKPIs() {{
      const grid = document.getElementById("kpiGrid");
      const kpiList = (PAYLOAD.kpis || []).slice(0, 4);
      kpiList.forEach((k, idx) => {{
        const sub = filterRows(PAYLOAD.rows, k.filter_field, k.filter_value);
        const vals = sub.map((r) => Number(r[k.field])).filter((n) => Number.isFinite(n));
        if (!vals.length) return;
        let val = vals[vals.length - 1];
        if (k.agg === "sum") val = vals.reduce((a, b) => a + b, 0);
        else if (k.agg === "avg") val = vals.reduce((a, b) => a + b, 0) / vals.length;
        else if (k.agg === "max") val = Math.max(...vals);
        else if (k.agg === "min") val = Math.min(...vals);

        let deltaPct = null;
        if (vals.length >= 2 && vals[vals.length - 2] !== 0) {{
          deltaPct = ((vals[vals.length - 1] - vals[vals.length - 2]) / Math.abs(vals[vals.length - 2])) * 100;
        }}
        const isPos = deltaPct === null ? true : deltaPct >= 0;
        const card = document.createElement("div");
        card.className = "kpi-card";
        const deltaHtml = deltaPct !== null
          ? `<div class="kpi-delta ${{isPos ? "pos" : "neg"}}">${{isPos ? "▲" : "▼"}} ${{isPos ? "+" : ""}}${{deltaPct.toFixed(1).replace(".", ",")}}% к пред. периоду</div>`
          : `<div class="kpi-delta pos">Всего записей: ${{vals.length}}</div>`;
        card.innerHTML = `
          <div class="kpi-left">
            <div class="kpi-head">
              <span class="kpi-icon">${{KPI_ICONS[idx % KPI_ICONS.length]}}</span>
              <span class="kpi-label"></span>
            </div>
            <div class="kpi-value"></div>
            ${{deltaHtml}}
          </div>
          ${{buildSparkSvg(vals, isPos, idx)}}
        `;
        const fullLabel = k.label || colLabel(k.field);
        const exactVal = Number(val).toLocaleString("ru-RU", {{ maximumFractionDigits: 2 }});
        card.setAttribute("data-tooltip", `${{fullLabel}}: ${{exactVal}}`);
        card.setAttribute("title", `${{fullLabel}}: ${{exactVal}}`);
        card.querySelector(".kpi-label").textContent = fullLabel;
        card.querySelector(".kpi-value").textContent = fmtNum(val);
        grid.appendChild(card);
      }});
    }}

    function createBarCard(spec, subRows) {{
      const yCol = spec.y_fields[0];
      const vals = subRows.map((r) => Number(r[yCol] ?? 0));
      const totalOrLast = vals.reduce((a, b) => a + b, 0);
      const last = vals[vals.length - 1] ?? 0, prev = vals[vals.length - 2] ?? last;
      const pct = prev ? ((last - prev) / Math.abs(prev)) * 100 : 0;
      const isPos = pct >= 0;

      const card = document.createElement("div");
      card.className = "card";
      card.innerHTML = `
        <div class="card-header">
          <div>
            <div class="card-title">${{spec.title || colLabel(yCol)}}</div>
            <div class="card-hero">
              <span class="hero-num">${{fmtNum(totalOrLast)}}</span>
              <span class="pill ${{isPos ? "pos" : "neg"}}">${{isPos ? "▲ +" : "▼ "}}${{pct.toFixed(1).replace(".", ",")}}%</span>
            </div>
          </div>
        </div>
        <div class="chart-box"></div>
      `;
      const box = card.querySelector(".chart-box");
      setTimeout(() => {{
        if (typeof echarts === "undefined") return;
        const inst = echarts.init(box);
        const cats = subRows.map((r) => formatHumanDate(r[spec.x_field]));
        inst.setOption({{
          backgroundColor: "transparent",
          tooltip: {{
            trigger: "axis",
            backgroundColor: "#1b1b1b",
            borderColor: "#333333",
            textStyle: {{ color: "#f5f5f5", fontSize: 12 }}
          }},
          grid: {{ left: 48, right: 14, top: 18, bottom: 28, containLabel: true }},
          xAxis: {{
            type: "category",
            data: cats,
            axisLine: {{ lineStyle: {{ color: "#262626" }} }},
            axisTick: {{ show: false }},
            axisLabel: {{ color: "#8c8c8c", fontSize: 11, rotate: cats.length > 9 ? 25 : 0 }}
          }},
          yAxis: {{
            type: "value",
            splitLine: {{ lineStyle: {{ color: "#1f1f1f", type: "dashed" }} }},
            axisLabel: {{ color: "#737373", fontSize: 11, formatter: (v) => fmtNum(v) }}
          }},
          series: [{{
            name: colLabel(yCol),
            type: "bar",
            barMaxWidth: 28,
            itemStyle: {{
              borderRadius: [6, 6, 0, 0],
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                {{ offset: 0, color: "#FFA336" }},
                {{ offset: 0.55, color: "#FF8500" }},
                {{ offset: 1, color: "#4D1F02" }}
              ])
            }},
            data: vals
          }}]
        }});
        chartInstances.push(inst);
      }}, 0);
      return card;
    }}

    function createDonutCard(spec, subRows) {{
      const yCol = spec.y_fields[0];
      const topRows = subRows.slice(0, 5);
      const items = topRows.map((r) => ({{ name: formatHumanDate(r[spec.x_field]), value: Math.max(0, Number(r[yCol] ?? 0)) }}));
      const total = items.reduce((a, b) => a + b.value, 0) || 1;

      const card = document.createElement("div");
      card.className = "card";
      const legendHtml = items.map((it, i) => `
        <div class="legend-row" data-tooltip="${{it.name}}: ${{fmtNum(it.value)}} (${{((it.value / total) * 100).toFixed(1).replace(".", ",")}}%)" title="${{it.name}}: ${{fmtNum(it.value)}}">
          <div class="legend-left">
            <span class="legend-dot" style="background:${{DONUT_COLORS[i % DONUT_COLORS.length]}}"></span>
            <span class="legend-name">${{it.name}}</span>
          </div>
          <span class="legend-pct">${{((it.value / total) * 100).toFixed(1).replace(".", ",")}}%</span>
        </div>
      `).join("");

      card.innerHTML = `
        <div class="card-header"><div class="card-title">${{spec.title || "Структура"}}</div></div>
        <div class="donut-wrap">
          <div class="donut-canvas">
            <div class="chart-box" style="height:255px;"></div>
            <div class="donut-center"><span>${{fmtNum(total)}}</span><small>${{colLabel(yCol)}}</small></div>
          </div>
          <div class="donut-legend">${{legendHtml}}</div>
        </div>
      `;
      const box = card.querySelector(".chart-box");
      setTimeout(() => {{
        if (typeof echarts === "undefined") return;
        const inst = echarts.init(box);
        inst.setOption({{
          backgroundColor: "transparent",
          color: DONUT_COLORS,
          tooltip: {{ trigger: "item", backgroundColor: "#1b1b1b", borderColor: "#333", textStyle: {{ color: "#f5f5f5" }} }},
          series: [{{
            type: "pie",
            radius: ["60%", "82%"],
            label: {{ show: false }},
            itemStyle: {{ borderColor: "#141414", borderWidth: 2 }},
            data: items
          }}]
        }});
        chartInstances.push(inst);
      }}, 0);
      return card;
    }}

    function createInsightsCard() {{
      const card = document.createElement("div");
      card.className = "card";
      const insights = (PAYLOAD.insights && PAYLOAD.insights.length)
        ? PAYLOAD.insights.slice(0, 3)
        : [{{ title: "Данные успешно загружены", detail: `Проанализировано строк: ${{PAYLOAD.rows.length}}`, trend: "up" }}];

      const listHtml = insights.map((ins) => {{
        const isUp = ins.trend !== "down";
        return `
          <div class="insight-item">
            <span class="ins-badge ${{isUp ? "up" : "down"}}">${{isUp ? "↑" : "↓"}}</span>
            <div>
              <div class="ins-title">${{ins.title || ""}}</div>
              <div class="ins-detail">${{ins.detail || ""}}</div>
            </div>
          </div>
        `;
      }}).join("");

      card.innerHTML = `
        <div class="card-header"><div class="card-title"><span style="color:#FF8500;">✦</span> Инсайты AI</div></div>
        <div class="insights-list">${{listHtml}}</div>
        <button class="btn-accent-outline" id="insightsExportBtn" type="button">Скачать отчёт CSV →</button>
      `;
      card.querySelector("#insightsExportBtn").addEventListener("click", exportCsv);
      return card;
    }}

    function createForecastCard(spec, subRows) {{
      const yCol = spec.y_fields[0];
      const rawX = subRows.map((r) => String(r[spec.x_field] ?? "").slice(0, 10));
      const vals = subRows.map((r) => Number(r[yCol] ?? 0));
      const fPeriods = Math.max(1, Number(spec.forecast_periods || 1));
      const rawForecast = [];
      if (rawX.length >= 2) {{
        let prev = rawX[rawX.length - 2], cur = rawX[rawX.length - 1];
        for (let i = 0; i < fPeriods; i++) {{
          const nxt = nextLabel(cur, prev);
          rawForecast.push(nxt);
          prev = cur; cur = nxt;
        }}
      }}
      const preds = linearForecast(vals, rawForecast.length);
      const lastVal = vals[vals.length - 1] ?? 0;
      const predLast = preds[preds.length - 1] ?? lastVal;
      const diffPct = lastVal ? ((predLast - lastVal) / Math.abs(lastVal)) * 100 : 0;
      const isPos = diffPct >= 0;
      const targetLabel = rawForecast.length ? formatHumanDate(rawForecast[rawForecast.length - 1]) : "след. период";

      const card = document.createElement("div");
      card.className = "card";
      card.innerHTML = `
        <div class="card-header">
          <div>
            <div class="card-title">${{spec.title || "Прогноз: " + colLabel(yCol)}}</div>
            <div class="card-hero">
              <span class="hero-num">${{fmtNum(predLast)}}</span>
              <span class="pill ${{isPos ? "pos" : "neg"}}">Прогноз на ${{targetLabel}}: ${{isPos ? "+" : ""}}${{diffPct.toFixed(1).replace(".", ",")}}%</span>
            </div>
          </div>
          <div class="forecast-legend">
            <span class="fl-item"><span class="fl-dot"></span> Факт</span>
            <span class="fl-item"><span class="fl-dash"></span> Прогноз (AI)</span>
          </div>
        </div>
        <div class="chart-box"></div>
      `;
      const box = card.querySelector(".chart-box");
      setTimeout(() => {{
        if (typeof echarts === "undefined") return;
        const inst = echarts.init(box);
        const cats = [...rawX.map(formatHumanDate), ...rawForecast.map(formatHumanDate)];
        const histSeries = [...vals, ...Array(preds.length).fill(null)];
        const forecastSeries = [...Array(Math.max(0, vals.length - 1)).fill(null), lastVal, ...preds];
        inst.setOption({{
          backgroundColor: "transparent",
          tooltip: {{
            trigger: "axis",
            backgroundColor: "#1b1b1b",
            borderColor: "#333",
            textStyle: {{ color: "#f5f5f5", fontSize: 12 }},
            formatter: (params) => {{
              const items = (Array.isArray(params) ? params : [params]).filter((p) => p.value !== null && p.value !== undefined && p.value !== "-");
              if (!items.length) return "";
              return `<b>${{items[0].axisValueLabel}}</b><br/>` + items.map((p) => `${{p.marker}} ${{p.seriesName}}: <b>${{fmtNum(Number(p.value))}}</b>`).join("<br/>");
            }}
          }},
          grid: {{ left: 48, right: 18, top: 18, bottom: 28, containLabel: true }},
          xAxis: {{
            type: "category",
            data: cats,
            axisLine: {{ lineStyle: {{ color: "#262626" }} }},
            axisTick: {{ show: false }},
            axisLabel: {{ color: "#8c8c8c", fontSize: 11, rotate: cats.length > 9 ? 25 : 0 }}
          }},
          yAxis: {{
            type: "value",
            splitLine: {{ lineStyle: {{ color: "#1f1f1f", type: "dashed" }} }},
            axisLabel: {{ color: "#737373", fontSize: 11, formatter: (v) => fmtNum(v) }}
          }},
          series: [
            {{
              name: "Факт",
              type: "line",
              smooth: true,
              symbol: "circle",
              symbolSize: 6,
              lineStyle: {{ color: "#FF8500", width: 2.5 }},
              itemStyle: {{ color: "#FF8500" }},
              areaStyle: {{
                color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                  {{ offset: 0, color: "rgba(255, 133, 0, 0.32)" }},
                  {{ offset: 1, color: "rgba(255, 133, 0, 0.01)" }}
                ])
              }},
              data: histSeries
            }},
            {{
              name: "Прогноз (AI)",
              type: "line",
              smooth: true,
              symbol: "circle",
              symbolSize: 8,
              lineStyle: {{ color: "#FFFFFF", width: 2.5, type: "dashed" }},
              itemStyle: {{ color: isPos ? "#22C55E" : "#EF4444", borderColor: "#FFFFFF", borderWidth: 2 }},
              data: forecastSeries
            }}
          ]
        }});
        chartInstances.push(inst);
      }}, 0);
      return card;
    }}

    function renderBento() {{
      const mid = document.getElementById("bentoMid");
      const bottom = document.getElementById("bentoBottom");
      const fSlot = document.getElementById("forecastSlot");
      const charts = PAYLOAD.charts || [];

      const barSpec = charts.find((c) => c.chart_type === "bar") || charts.find((c) => !c.forecast_periods);
      const donutSpec = charts.find((c) => c.chart_type === "donut" || c.chart_type === "pie");
      const forecastSpec = charts.find((c) => Number(c.forecast_periods || 0) > 0);

      if (barSpec) {{
        const sub = filterRows(PAYLOAD.rows, barSpec.filter_field, barSpec.filter_value);
        if (sub.length >= 2) mid.appendChild(createBarCard(barSpec, sub));
      }}
      if (donutSpec) {{
        const sub = filterRows(PAYLOAD.rows, donutSpec.filter_field, donutSpec.filter_value);
        if (sub.length >= 2) mid.appendChild(createDonutCard(donutSpec, sub));
      }} else if (barSpec) {{
        const sub = filterRows(PAYLOAD.rows, barSpec.filter_field, barSpec.filter_value);
        if (sub.length >= 2) mid.appendChild(createDonutCard({{ ...barSpec, title: "Структура: " + colLabel(barSpec.y_fields[0]) }}, sub.slice(-4)));
      }}
      mid.appendChild(createInsightsCard());
      if (mid.children.length === 1) {{
        mid.classList.remove("has-insights");
        mid.style.gridTemplateColumns = "1fr";
      }} else if (mid.children.length === 2) {{
        mid.classList.remove("has-insights");
      }}

      let hasRenderedForecast = false;
      if (forecastSpec) {{
        const sub = filterRows(PAYLOAD.rows, forecastSpec.filter_field, forecastSpec.filter_value);
        if (sub.length >= 2) {{
          fSlot.appendChild(createForecastCard(forecastSpec, sub));
          hasRenderedForecast = true;
        }}
      }}
      if (!hasRenderedForecast) {{
        fSlot.style.display = "none";
        bottom.classList.add("no-forecast");
      }}
    }}

    let sortCol = null, sortAsc = true, searchTerm = "";
    function getFilteredRows() {{
      let filtered = PAYLOAD.rows;
      if (searchTerm) {{
        const q = searchTerm.toLowerCase();
        filtered = filtered.filter((r) => PAYLOAD.columns.some((c) => String(r[c] ?? "").toLowerCase().includes(q)));
      }}
      if (sortCol) {{
        filtered = [...filtered].sort((a, b) => {{
          const va = a[sortCol], vb = b[sortCol];
          if (va === vb) return 0;
          if (va == null) return 1;
          if (vb == null) return -1;
          if (typeof va === "number" && typeof vb === "number") return sortAsc ? va - vb : vb - va;
          return sortAsc ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
        }});
      }}
      return filtered;
    }}
    function renderTable() {{
      const thead = document.querySelector("#dataTable thead"), tbody = document.querySelector("#dataTable tbody");
      const rows = getFilteredRows();
      document.getElementById("rowCountLabel").textContent = String(rows.length);
      thead.innerHTML = "";
      const trH = document.createElement("tr");
      PAYLOAD.columns.forEach((col) => {{
        const th = document.createElement("th");
        th.textContent = colLabel(col) + (sortCol === col ? (sortAsc ? " ▲" : " ▼") : "");
        th.onclick = () => {{ sortCol === col ? (sortAsc = !sortAsc) : ((sortCol = col), (sortAsc = true)); renderTable(); }};
        trH.appendChild(th);
      }});
      thead.appendChild(trH);
      tbody.innerHTML = "";
      rows.forEach((r) => {{
        const tr = document.createElement("tr");
        PAYLOAD.columns.forEach((col) => {{
          const td = document.createElement("td");
          const v = r[col];
          if (v == null || v === "") td.textContent = "—";
          else if (/^\\d{{4}}-\\d{{2}}/.test(String(v))) td.textContent = formatHumanDate(v);
          else if (typeof v === "number" || /^-?\\d+(\\.\\d+)?$/.test(String(v).trim())) td.textContent = Number(v).toLocaleString("ru-RU", {{ maximumFractionDigits: 2 }});
          else td.textContent = String(v);
          tr.appendChild(td);
        }});
        tbody.appendChild(tr);
      }});
    }}
    function exportCsv() {{
      const rows = getFilteredRows();
      const esc = (v) => '"' + String(v ?? "").replace(/"/g, '""') + '"';
      const csv = "\\uFEFF" + [PAYLOAD.columns.map((c) => esc(colLabel(c))).join(","), ...rows.map((r) => PAYLOAD.columns.map((c) => esc(r[c])).join(","))].join("\\n");
      const url = URL.createObjectURL(new Blob([csv], {{ type: "text/csv;charset=utf-8;" }}));
      const a = document.createElement("a"); a.href = url; a.download = "wren_dashboard.csv"; a.click(); URL.revokeObjectURL(url);
    }}

    document.getElementById("searchInput").addEventListener("input", (e) => {{ searchTerm = e.target.value; renderTable(); }});
    document.getElementById("detailsToggle").addEventListener("click", () => {{
      const card = document.getElementById("detailsCard");
      const arrow = document.getElementById("detailsArrow");
      const collapsed = card.classList.toggle("collapsed");
      arrow.textContent = collapsed ? "▸" : "▾";
      setTimeout(notifyHeight, 50);
    }});
    document.getElementById("exportCsvTop").addEventListener("click", exportCsv);
    function notifyHeight() {{
      try {{
        const h = Math.max(360, Math.min(1200, document.documentElement.scrollHeight + 16));
        window.parent.postMessage({{ type: "wren-dashboard-height", height: h }}, "*");
      }} catch (_e) {{}}
    }}

    window.addEventListener("resize", () => {{
      chartInstances.forEach((inst) => inst.resize());
      notifyHeight();
    }});

    renderKPIs();
    renderBento();
    renderTable();
    setTimeout(notifyHeight, 120);
    setTimeout(notifyHeight, 500);
  </script>
</body>
</html>"""


@router.post("/html-dashboard")
async def generate_html_dashboard(req: HtmlDashboardRequest) -> Dict[str, Any]:
    if not req.rows:
        return {"ok": False, "error": "Dataset is empty"}

    sample_rows = req.rows[:25]
    skills_section = ""
    try:
        matched_skills = _dashboard_skills_service.match_skills(query=req.question)
        if matched_skills:
            skills_text = "\n\n".join(
                f"### Skill: {s.name}\n{s.content}" for s in matched_skills
            )
            skills_section = f"\n\nActive Analytical Skills:\n{skills_text}"
    except Exception as exc:
        logger.warning("Failed to match skills for HTML dashboard: %s", exc)

    user_prompt = (
        f"User Question: {req.question}\n\n"
        f"SQL:\n{req.sql}\n\n"
        f"Columns: {json.dumps(req.columns, ensure_ascii=False)}\n\n"
        f"Total Rows: {len(req.rows)}\n"
        f"Sample Rows:\n{json.dumps(sample_rows, ensure_ascii=False, default=str)}"
        f"{skills_section}"
    )

    llm_cfg = _resolve_dashboard_llm_config()
    completion_kwargs: Dict[str, Any] = {
        "model": llm_cfg["model"],
        "messages": [
            {"role": "system", "content": SPEC_SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": 0.1,
        "max_tokens": 1500,
        "timeout": 60,
    }
    if llm_cfg.get("api_base"):
        completion_kwargs["api_base"] = llm_cfg["api_base"]
    if llm_cfg.get("api_key"):
        completion_kwargs["api_key"] = llm_cfg["api_key"]
    if llm_cfg.get("use_json_format", True):
        completion_kwargs["response_format"] = {"type": "json_object"}

    resp = await acompletion(**completion_kwargs)

    spec = _extract_json(resp.choices[0].message.content or "{}")
    _enforce_forecast_intent(req.question, spec)
    html_doc = _render_dashboard_html(spec, req.columns, req.rows, req.sql)
    return {"ok": True, "html": html_doc}
