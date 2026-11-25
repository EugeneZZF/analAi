"""DB-GPT-inspired AI HTML Dashboard generator for WrenAI."""

import html
import json
import logging
import os
import re
from typing import Any, Dict, List, Optional

from fastapi import APIRouter
from litellm import acompletion
from pydantic import BaseModel

logger = logging.getLogger("wren-ai-service")
router = APIRouter()

SPEC_SYSTEM_PROMPT = """You are a senior BI Data Visualization architect.
Given a user's original question, the executed SQL, column metadata, and sample rows, design an insightful dashboard specification in JSON that STRICTLY answers the user's question.

Return ONLY valid JSON with this exact schema:
{
  "title": "Dashboard title strictly matching the user's question",
  "subtitle": "Short 1-line analytical summary",
  "insight": "1-2 sentences directly answering the user's question based on the data",
  "column_labels": {
    "exact_column_name": "Human-readable label in the user's language (e.g. order_count -> Количество заказов, total_revenue -> Выручка, week_start -> Неделя)"
  },
  "kpis": [
    {"label": "Metric name", "field": "exact_column_name", "agg": "sum|avg|count|max|min|last", "filter_field": null, "filter_value": null}
  ],
  "charts": [
    {
      "title": "Chart title",
      "subtitle": "Short description",
      "chart_type": "area|line|bar|pie|donut|scatter",
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
2. Build the dashboard STRICTLY for the user's question:
   - If the user asks about future performance or forecasting ("на следующей неделе", "в следующем месяце", "прогноз", "будут", "ожидается", "forecast", "next week", "next month"), you MUST set `forecast_periods: 1` (or N if specified) on the time-series charts, put the primary revenue/sales metric first, and set `agg: "last"` or `"avg"` for relevant KPIs.
   - If the user asks for a comparison or ranking (top products, categories, customers), use `bar` (with `horizontal: true` for long names) or `donut` for shares.
3. If the dataset has a `section` (or similar discriminator) column from a UNION ALL query, create one chart per meaningful section using `filter_field: "section"` and `filter_value: "<value>"`, with `x_field` set to the label/dimension column (NOT `section`).
4. Include 2-4 KPIs and 2-3 focused charts. Never invent column names.
5. ALWAYS populate `column_labels` for EVERY column in `Columns` with natural, human-readable names in the user's language (e.g., `order_count` -> `Количество заказов`, `total_revenue` -> `Выручка`, `avg_order_value` -> `Средний чек`, `total_quantity` -> `Продано единиц`, `week_start` -> `Неделя`).
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


def _render_dashboard_html(
    spec: Dict[str, Any],
    columns: List[Dict[str, Any]],
    rows: List[Dict[str, Any]],
    sql: str,
) -> str:
    col_names = [c["name"] for c in columns if "name" in c]
    if not col_names and rows:
        col_names = list(rows[0].keys())

    safe_title = html.escape(str(spec.get("title") or "WrenAI Dashboard"))
    safe_subtitle = html.escape(str(spec.get("subtitle") or ""))
    safe_insight = html.escape(str(spec.get("insight") or ""))
    safe_sql = html.escape(sql.strip()) if sql else ""

    payload_json = _safe_json_for_script(
        {
            "columns": col_names,
            "column_labels": spec.get("column_labels") or {},
            "rows": rows,
            "kpis": spec.get("kpis") or [],
            "charts": spec.get("charts") or [],
        }
    )

    subtitle_html = f'<p class="subtitle">{safe_subtitle}</p>' if safe_subtitle else ""
    insight_html = (
        f'<div class="insight-banner"><strong>Вывод по запросу:</strong> {safe_insight}</div>'
        if safe_insight
        else ""
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
      --bg: #080909; --surface: #141414; --border: #262626;
      --text: #f5f5f5; --muted: #a3a3a3; --accent: #FF8500;
      --accent-soft: rgba(255, 133, 0, 0.14);
      --positive: #22C55E; --negative: #EF4444;
    }}
    [data-theme="light"] {{
      --bg: #f8fafc; --surface: #ffffff; --border: #e2e8f0;
      --text: #0f172a; --muted: #64748b; --accent: #FF8500;
      --accent-soft: rgba(255, 133, 0, 0.1);
      --positive: #22C55E; --negative: #EF4444;
    }}
    * {{ box-sizing: border-box; }}
    body {{ margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: var(--bg); color: var(--text); padding: 18px; }}
    header {{ display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }}
    h1 {{ margin: 0; font-size: 1.3rem; font-weight: 700; }}
    .subtitle {{ margin: 4px 0 0; color: var(--muted); font-size: 0.9rem; }}
    button.btn {{ cursor: pointer; background: var(--surface); color: var(--text); border: 1px solid var(--border); padding: 6px 11px; border-radius: 7px; font-size: 0.82rem; }}
    button.btn:hover {{ border-color: var(--accent); color: var(--accent); }}
    .kpi-grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(175px, 1fr)); gap: 12px; margin-bottom: 16px; }}
    .kpi-card {{ background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 12px 14px; }}
    .kpi-label {{ font-size: 0.75rem; color: var(--muted); text-transform: uppercase; }}
    .kpi-value {{ font-size: 1.3rem; font-weight: 700; margin-top: 4px; }}
    .kpi-delta {{ font-size: 0.78rem; color: var(--accent); margin-top: 2px; font-weight: 600; }}
    .kpi-delta.pos {{ color: var(--positive); }}
    .kpi-delta.neg {{ color: var(--negative); }}
    .insight-banner {{ background: var(--accent-soft); border-left: 4px solid var(--accent); padding: 10px 14px; border-radius: 8px; margin-bottom: 16px; font-size: 0.9rem; }}
    .charts-grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(420px, 1fr)); gap: 14px; margin-bottom: 16px; }}
    @media (max-width: 520px) {{ .charts-grid {{ grid-template-columns: 1fr; }} }}
    .card {{ background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 14px; }}
    .chart-title {{ font-weight: 600; font-size: 0.98rem; margin-bottom: 2px; }}
    .chart-sub {{ font-size: 0.8rem; color: var(--muted); margin-bottom: 8px; }}
    .chart-box {{ width: 100%; height: 320px; }}
    .table-toolbar {{ display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-bottom: 10px; flex-wrap: wrap; }}
    .search-input {{ padding: 6px 10px; border: 1px solid var(--border); border-radius: 7px; background: var(--bg); color: var(--text); font-size: 0.85rem; }}
    .table-wrap {{ overflow-x: auto; max-height: 360px; border: 1px solid var(--border); border-radius: 8px; }}
    table {{ width: 100%; border-collapse: collapse; font-size: 0.84rem; }}
    th, td {{ padding: 8px 10px; border-bottom: 1px solid var(--border); text-align: left; white-space: nowrap; }}
    th {{ position: sticky; top: 0; background: var(--surface); cursor: pointer; }}
    tr:hover td {{ background: var(--accent-soft); }}
    .sql-panel {{ margin-top: 14px; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 10px 14px; }}
    .sql-panel summary {{ cursor: pointer; font-weight: 600; color: var(--muted); font-size: 0.85rem; }}
    .sql-panel pre {{ margin: 10px 0 0; padding: 10px; background: var(--bg); border-radius: 6px; overflow-x: auto; font-size: 0.8rem; }}
  </style>
</head>
<body>
  <header>
    <div><h1>{safe_title}</h1>{subtitle_html}</div>
    <button class="btn" id="themeToggle" type="button">Тема: Тёмная</button>
  </header>
  {insight_html}
  <section id="kpiGrid" class="kpi-grid"></section>
  <section id="chartsGrid" class="charts-grid"></section>
  <section class="card">
    <div class="table-toolbar">
      <strong>Таблица данных (<span id="rowCountLabel">0</span>)</strong>
      <div style="display:flex; gap:8px; flex-wrap:wrap;">
        <input id="searchInput" class="search-input" type="search" placeholder="Поиск..." />
        <button class="btn" id="exportCsvBtn" type="button">Скачать CSV</button>
      </div>
    </div>
    <div class="table-wrap"><table id="dataTable"><thead></thead><tbody></tbody></table></div>
  </section>
  {sql_block}
  <script>
    const PAYLOAD = {payload_json};
    const chartInstances = [];

    const RU_MONTHS_GEN = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Нояб", "Дек"];
    const RU_MONTHS_NOM = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
    const FALLBACK_LABELS = {{
      order_count: "Количество заказов",
      orders_count: "Количество заказов",
      orders: "Количество заказов",
      total_revenue: "Общая выручка",
      revenue: "Выручка",
      total_amount: "Сумма заказов",
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
      order_status: "Статус заказа",
      customer_name: "Клиент",
      product_name: "Товар"
    }};

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
        if (mIdx >= 0 && mIdx < 12) return `${{RU_MONTHS_NOM[mIdx]}} ${{ym[1]}}`;
      }}
      return s;
    }}

    function fmtNum(v) {{
      if (!Number.isFinite(v)) return String(v);
      if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(2) + "M";
      return v.toLocaleString("ru-RU", {{ maximumFractionDigits: 2 }});
    }}

    function filterRows(rows, field, value) {{
      if (!field || value === null || value === undefined) return rows;
      return rows.filter((r) => String(r[field]) === String(value));
    }}

    function renderKPIs() {{
      const grid = document.getElementById("kpiGrid");
      PAYLOAD.kpis.forEach((k) => {{
        const sub = filterRows(PAYLOAD.rows, k.filter_field, k.filter_value);
        const vals = sub.map((r) => Number(r[k.field])).filter((n) => Number.isFinite(n));
        let val = sub.length;
        if (k.agg === "sum") val = vals.reduce((a, b) => a + b, 0);
        else if (k.agg === "avg") val = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
        else if (k.agg === "max") val = vals.length ? Math.max(...vals) : 0;
        else if (k.agg === "min") val = vals.length ? Math.min(...vals) : 0;
        else if (k.agg === "last") val = vals.length ? vals[vals.length - 1] : 0;
        const card = document.createElement("div");
        card.className = "kpi-card";
        card.innerHTML = '<div class="kpi-label"></div><div class="kpi-value"></div>';
        card.querySelector(".kpi-label").textContent = k.label || k.field;
        card.querySelector(".kpi-value").textContent = fmtNum(val);
        grid.appendChild(card);
      }});

      const fChart = PAYLOAD.charts.find((c) => Number(c.forecast_periods || 0) > 0 && c.y_fields && c.y_fields.length);
      if (fChart) {{
        const sub = filterRows(PAYLOAD.rows, fChart.filter_field, fChart.filter_value);
        const yCol = fChart.y_fields[0];
        const vals = sub.map((r) => Number(r[yCol])).filter((n) => Number.isFinite(n));
        if (vals.length >= 2) {{
          const preds = linearForecast(vals, 1);
          const lastX = sub[sub.length - 1][fChart.x_field];
          const prevX = sub[sub.length - 2][fChart.x_field];
          const nextX = nextLabel(lastX, prevX);
          const lastVal = vals[vals.length - 1];
          const diffPct = lastVal ? (((preds[0] - lastVal) / lastVal) * 100).toFixed(1) : "0.0";
          const isUp = Number(diffPct) >= 0;
          const sign = isUp ? "+" : "";
          const card = document.createElement("div");
          card.className = "kpi-card";
          card.innerHTML = '<div class="kpi-label"></div><div class="kpi-value"></div><div class="kpi-delta"></div>';
          card.querySelector(".kpi-label").textContent = `Прогноз (${{formatHumanDate(nextX)}}): ${{colLabel(yCol)}}`;
          card.querySelector(".kpi-value").textContent = fmtNum(preds[0]);
          const deltaEl = card.querySelector(".kpi-delta");
          deltaEl.classList.add(isUp ? "pos" : "neg");
          deltaEl.textContent = `${{sign}}${{diffPct}}% к пред. периоду`;
          grid.appendChild(card);
        }}
      }}
      if (!grid.children.length) grid.style.display = "none";
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

    function buildOption(spec, rows, isDark) {{
      const textColor = isDark ? "#e2e8f0" : "#0f172a";
      const toolbox = {{ feature: {{ saveAsImage: {{ title: "PNG" }} }}, right: 6 }};
      const xField = spec.x_field;
      const yFields = (spec.y_fields || []).filter((f) => PAYLOAD.columns.includes(f));
      if (!yFields.length) return null;

      const lbl = (v) => formatHumanDate(v);

      if (spec.chart_type === "pie" || spec.chart_type === "donut") {{
        const yCol = yFields[0];
        return {{
          backgroundColor: "transparent",
          tooltip: {{ trigger: "item", formatter: "{{b}}: {{c}} ({{d}}%)" }},
          legend: {{ bottom: 0, type: "scroll", textStyle: {{ color: textColor }} }},
          toolbox,
          series: [{{
            name: colLabel(yCol),
            type: "pie",
            radius: spec.chart_type === "donut" ? ["42%", "68%"] : "66%",
            center: ["50%", "46%"],
            data: rows.map((r) => ({{ name: lbl(r[xField]), value: Number(r[yCol] ?? 0) }}))
          }}]
        }};
      }}

      const rawX = rows.map((r) => String(r[xField] ?? "").slice(0, 10));
      const fPeriods = Number(spec.forecast_periods || 0);
      const rawForecast = [];
      if (fPeriods > 0 && rawX.length >= 2) {{
        let prev = rawX[rawX.length - 2];
        let cur = rawX[rawX.length - 1];
        for (let i = 0; i < fPeriods; i++) {{
          const nxt = nextLabel(cur, prev);
          rawForecast.push(nxt);
          prev = cur;
          cur = nxt;
        }}
      }}
      const allCats = [...rawX.map(lbl), ...rawForecast.map((d) => lbl(d) + " (прогноз)")];
      const series = [];
      const hasForecast = rawForecast.length > 0;
      const isLineOrArea = spec.chart_type === "line" || spec.chart_type === "area";
      yFields.forEach((yCol) => {{
        const friendly = colLabel(yCol);
        const vals = rows.map((r) => Number(r[yCol] ?? 0));
        const preds = hasForecast ? linearForecast(vals, rawForecast.length) : [];
        const isUp = preds.length && vals.length ? preds[preds.length - 1] >= vals[vals.length - 1] : true;
        const fColor = isUp ? "#22C55E" : "#EF4444";
        if (isLineOrArea) {{
          series.push({{
            name: friendly,
            type: "line",
            lineStyle: {{ color: "#FF8500", width: 2.5 }},
            itemStyle: {{ color: "#FF8500" }},
            areaStyle: spec.chart_type === "area" ? {{ color: "#FF8500", opacity: 0.18 }} : undefined,
            smooth: true,
            data: hasForecast ? [...vals, ...Array(preds.length).fill(null)] : vals
          }});
          if (hasForecast) {{
            series.push({{
              name: friendly + " (прогноз)",
              type: "line",
              smooth: true,
              lineStyle: {{ color: fColor, width: 3 }},
              itemStyle: {{ color: fColor }},
              areaStyle: spec.chart_type === "area" ? {{ color: fColor, opacity: 0.2 }} : undefined,
              data: [...Array(Math.max(0, vals.length - 1)).fill(null), vals[vals.length - 1], ...preds]
            }});
          }}
        }} else {{
          const combined = hasForecast
            ? [...vals, ...preds.map((v) => ({{ value: v, itemStyle: {{ color: fColor }} }}))]
            : vals;
          series.push({{
            name: friendly,
            type: spec.chart_type,
            itemStyle: {{ color: "#FF8500" }},
            data: combined
          }});
        }}
      }});

      const catAx = {{ type: "category", data: allCats, axisLabel: {{ color: textColor, rotate: !spec.horizontal && allCats.length > 7 ? 25 : 0 }} }};
      const valAx = {{ type: "value", axisLabel: {{ color: textColor }} }};
      return {{
        backgroundColor: "transparent",
        color: ["#FF8500", "#22C55E", "#38BDF8", "#A855F7", "#EF4444"],
        tooltip: {{
          trigger: "axis",
          formatter: (params) => {{
            const items = (Array.isArray(params) ? params : [params]).filter((p) => p.value !== null && p.value !== undefined && p.value !== "-");
            if (!items.length) return "";
            const head = `<b>${{items[0].axisValueLabel}}</b>`;
            const lines = items.map((p) => `${{p.marker}} ${{p.seriesName}}: <b>${{fmtNum(Number(p.value))}}</b>`);
            return [head, ...lines].join("<br/>");
          }}
        }},
        legend: {{ bottom: 0, type: "scroll", textStyle: {{ color: textColor }} }},
        toolbox,
        grid: {{ left: 52, right: 18, top: 20, bottom: 44, containLabel: true }},
        xAxis: spec.horizontal ? valAx : catAx,
        yAxis: spec.horizontal ? catAx : valAx,
        series
      }};
    }}

    function renderCharts() {{
      const grid = document.getElementById("chartsGrid");
      grid.innerHTML = "";
      chartInstances.length = 0;
      const isDark = document.documentElement.getAttribute("data-theme") === "dark";
      PAYLOAD.charts.forEach((spec) => {{
        const subRows = filterRows(PAYLOAD.rows, spec.filter_field, spec.filter_value);
        if (!subRows.length) return;
        const card = document.createElement("div");
        card.className = "card";
        card.innerHTML = '<div class="chart-title"></div><div class="chart-sub"></div><div class="chart-box"></div>';
        card.querySelector(".chart-title").textContent = spec.title || "";
        card.querySelector(".chart-sub").textContent = spec.subtitle || "";
        const box = card.querySelector(".chart-box");
        grid.appendChild(card);
        if (typeof echarts === "undefined") {{
          box.textContent = "Apache ECharts CDN недоступен.";
          return;
        }}
        const opt = buildOption(spec, subRows, isDark);
        if (!opt) return;
        const inst = echarts.init(box, isDark ? "dark" : null);
        inst.setOption(opt);
        chartInstances.push(inst);
      }});
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
          if (v == null) td.textContent = "—";
          else if (typeof v === "number") td.textContent = v.toLocaleString("ru-RU", {{ maximumFractionDigits: 2 }});
          else if (/^\\d{{4}}-\\d{{2}}/.test(String(v))) td.textContent = formatHumanDate(v);
          else td.textContent = String(v);
          tr.appendChild(td);
        }});
        tbody.appendChild(tr);
      }});
    }}

    document.getElementById("searchInput").addEventListener("input", (e) => {{ searchTerm = e.target.value; renderTable(); }});
    document.getElementById("exportCsvBtn").addEventListener("click", () => {{
      const rows = getFilteredRows();
      const esc = (v) => '"' + String(v ?? "").replace(/"/g, '""') + '"';
      const csv = "\\uFEFF" + [PAYLOAD.columns.map(esc).join(","), ...rows.map((r) => PAYLOAD.columns.map((c) => esc(r[c])).join(","))].join("\\n");
      const url = URL.createObjectURL(new Blob([csv], {{ type: "text/csv;charset=utf-8;" }}));
      const a = document.createElement("a"); a.href = url; a.download = "wren_dashboard.csv"; a.click(); URL.revokeObjectURL(url);
    }});
    document.getElementById("themeToggle").addEventListener("click", () => {{
      const root = document.documentElement;
      const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      document.getElementById("themeToggle").textContent = next === "dark" ? "Тема: Тёмная" : "Тема: Светлая";
      chartInstances.forEach((inst) => inst.dispose());
      renderCharts();
    }});
    window.addEventListener("resize", () => chartInstances.forEach((inst) => inst.resize()));
    renderKPIs();
    renderCharts();
    renderTable();
  </script>
</body>
</html>"""


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
    for chart in spec.get("charts") or []:
        if chart.get("chart_type") in ("line", "area", "bar") and not chart.get("forecast_periods"):
            chart["forecast_periods"] = 1


@router.post("/html-dashboard")
async def generate_html_dashboard(req: HtmlDashboardRequest) -> Dict[str, Any]:
    if not req.rows:
        return {"ok": False, "error": "Dataset is empty"}

    sample_rows = req.rows[:25]
    user_prompt = (
        f"User Question: {req.question}\n\n"
        f"SQL:\n{req.sql}\n\n"
        f"Columns: {json.dumps(req.columns, ensure_ascii=False)}\n\n"
        f"Total Rows: {len(req.rows)}\n"
        f"Sample Rows:\n{json.dumps(sample_rows, ensure_ascii=False, default=str)}"
    )

    api_key = os.getenv("DEEPSEEK_API_KEY") or os.getenv("LLM_OPENAI_API_KEY")
    resp = await acompletion(
        model="deepseek/deepseek-chat",
        api_base="https://api.deepseek.com/v1",
        api_key=api_key,
        messages=[
            {"role": "system", "content": SPEC_SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        response_format={"type": "json_object"},
        temperature=0.1,
        max_tokens=1500,
        timeout=60,
    )

    spec = _extract_json(resp.choices[0].message.content or "{}")
    _enforce_forecast_intent(req.question, spec)
    html_doc = _render_dashboard_html(spec, req.columns, req.rows, req.sql)
    return {"ok": True, "html": html_doc}
