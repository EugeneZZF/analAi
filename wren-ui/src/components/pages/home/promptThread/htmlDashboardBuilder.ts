export interface PreviewColumn {
  name: string;
  type: string;
}

export interface HtmlDashboardInput {
  title: string;
  sql?: string;
  columns: PreviewColumn[];
  rows: Record<string, any>[];
}

const escapeHtml = (value: string): string =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const safeJsonForScript = (data: unknown): string =>
  JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');

const isNumericType = (type: string): boolean => {
  const t = (type || '').toUpperCase();
  return (
    t.includes('INT') ||
    t.includes('DOUBLE') ||
    t.includes('FLOAT') ||
    t.includes('DECIMAL') ||
    t.includes('NUMERIC') ||
    t.includes('REAL') ||
    t.includes('NUMBER')
  );
};

const isNumericValue = (val: any): boolean =>
  typeof val === 'number' && Number.isFinite(val);

const looksLikeDateLabel = (val: any): boolean => {
  if (val === null || val === undefined) return false;
  const s = String(val).trim();
  return /^\d{4}-\d{2}(-\d{2})?/.test(s);
};

const formatPeriodLabel = (val: any): string => {
  const s = String(val ?? '').trim();
  const match = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) {
    // If timestamp is at midnight (e.g. 2026-01-01 00:00:00), keep YYYY-MM-DD or YYYY-MM
    return match[1];
  }
  return s || 'NULL';
};

const nextMonthOrDayLabel = (lastLabel: string): string => {
  const ym = lastLabel.match(/^(\d{4})-(\d{2})$/);
  if (ym) {
    let year = Number(ym[1]);
    let month = Number(ym[2]) + 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
    return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
  }
  const ymd = lastLabel.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (ymd) {
    const dt = new Date(`${ymd[1]}-${ymd[2]}-${ymd[3]}T00:00:00Z`);
    if (ymd[3] === '01') {
      dt.setUTCMonth(dt.getUTCMonth() + 1);
    } else {
      dt.setUTCDate(dt.getUTCDate() + 1);
    }
    return dt.toISOString().slice(0, 10);
  }
  return `${lastLabel} +1`;
};

const computeLinearForecast = (values: number[]): number | null => {
  const n = values.length;
  if (n < 2) return null;
  const xMean = (n - 1) / 2;
  const yMean = values.reduce((a, b) => a + b, 0) / n;
  let denom = 0;
  let num = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = i - xMean;
    denom += dx * dx;
    num += dx * (values[i] - yMean);
  }
  const slope = denom ? num / denom : 0;
  const intercept = yMean - slope * xMean;
  return Math.max(0, Math.round((intercept + slope * n) * 100) / 100);
};

const formatCompactNumber = (num: number): string => {
  if (!Number.isFinite(num)) return String(num);
  if (Math.abs(num) >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(2)}M`;
  }
  if (Math.abs(num) >= 1_000) {
    return num.toLocaleString('ru-RU', { maximumFractionDigits: 2 });
  }
  return Number.isInteger(num) ? String(num) : num.toFixed(2);
};

export function buildHtmlDashboardDocument({
  title,
  sql,
  columns,
  rows,
}: HtmlDashboardInput): string {
  const colNames = columns.map((c) => c.name);
  const numericCols = columns
    .filter(
      (c) =>
        isNumericType(c.type) ||
        (rows.length > 0 && isNumericValue(rows[0][c.name])),
    )
    .map((c) => c.name);

  const dimensionCol =
    colNames.find((name) => !numericCols.includes(name)) || colNames[0];

  const isTimeSeries =
    rows.length >= 2 && looksLikeDateLabel(rows[0]?.[dimensionCol]);

  const primaryMetric = numericCols[0] || null;
  const secondaryMetrics = numericCols.slice(1, 3);

  const kpis: { label: string; value: string; delta?: string }[] = [
    { label: 'Строк в выборке', value: String(rows.length) },
  ];

  if (primaryMetric) {
    const vals = rows.map((r) => Number(r[primaryMetric] ?? 0));
    const sum = vals.reduce((a, b) => a + b, 0);
    const avg = vals.length ? sum / vals.length : 0;
    kpis.push({
      label: `Сумма: ${primaryMetric}`,
      value: formatCompactNumber(sum),
      delta: `Среднее: ${formatCompactNumber(avg)}`,
    });

    if (isTimeSeries) {
      const pred = computeLinearForecast(vals);
      const lastLabel = formatPeriodLabel(rows[rows.length - 1][dimensionCol]);
      const nextLabel = nextMonthOrDayLabel(lastLabel);
      if (pred !== null) {
        kpis.push({
          label: `Прогноз (${nextLabel})`,
          value: formatCompactNumber(pred),
          delta: `Линейный тренд по ${primaryMetric}`,
        });
      }
    }
  }

  if (secondaryMetrics[0]) {
    const col = secondaryMetrics[0];
    const sum = rows.reduce((a, r) => a + Number(r[col] ?? 0), 0);
    kpis.push({
      label: `Сумма: ${col}`,
      value: formatCompactNumber(sum),
    });
  }

  const xLabels = rows.map((r) => formatPeriodLabel(r[dimensionCol]));
  const forecastLabel = isTimeSeries
    ? nextMonthOrDayLabel(xLabels[xLabels.length - 1])
    : null;

  const charts: any[] = [];
  if (primaryMetric) {
    const histVals = rows.map((r) => Number(r[primaryMetric] ?? 0));
    const predVal = isTimeSeries ? computeLinearForecast(histVals) : null;
    charts.push({
      title: isTimeSeries
        ? `${primaryMetric}: динамика и прогноз`
        : `${primaryMetric} по ${dimensionCol}`,
      type: isTimeSeries ? 'area' : 'bar',
      xLabels,
      forecastLabel: predVal !== null ? forecastLabel : null,
      series: [
        {
          name: primaryMetric,
          values: histVals,
          forecastValue: predVal,
        },
      ],
    });
  }

  if (secondaryMetrics.length > 0) {
    charts.push({
      title: `Дополнительные метрики (${secondaryMetrics.join(', ')})`,
      type: 'bar',
      xLabels,
      forecastLabel: null,
      series: secondaryMetrics.map((m) => ({
        name: m,
        values: rows.map((r) => Number(r[m] ?? 0)),
        forecastValue: null,
      })),
    });
  } else if (primaryMetric && rows.length <= 12) {
    charts.push({
      title: `Распределение: ${primaryMetric}`,
      type: 'donut',
      xLabels,
      forecastLabel: null,
      series: [
        {
          name: primaryMetric,
          values: rows.map((r) => Number(r[primaryMetric] ?? 0)),
          forecastValue: null,
        },
      ],
    });
  }

  const payload = {
    columns: colNames,
    rows,
    kpis,
    charts,
  };

  const safeTitle = escapeHtml(title || 'WrenAI HTML Dashboard');
  const safeSql = sql ? escapeHtml(sql.trim()) : '';
  const payloadJson = safeJsonForScript(payload);

  const sqlSection = safeSql
    ? `<details class="sql-panel">
        <summary>SQL-запрос · строк: ${rows.length}</summary>
        <pre><code>${safeSql}</code></pre>
      </details>`
    : '';

  return `<!DOCTYPE html>
<html lang="ru" data-theme="dark">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${safeTitle}</title>
  <script src="https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js"></script>
  <style>
    :root {
      --bg: #f8fafc;
      --surface: #ffffff;
      --border: #e2e8f0;
      --text: #0f172a;
      --muted: #64748b;
      --accent: #FF8500;
      --accent-soft: rgba(255, 133, 0, 0.12);
      --positive: #22C55E;
      --negative: #EF4444;
    }
    [data-theme="dark"] {
      --bg: #080909;
      --surface: #141414;
      --border: #222222;
      --text: #F5F5F5;
      --muted: #8C8C8C;
      --accent: #FF8500;
      --accent-soft: rgba(255, 133, 0, 0.14);
      --positive: #22C55E;
      --negative: #EF4444;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      padding: 18px;
    }
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      margin-bottom: 16px;
      flex-wrap: wrap;
    }
    h1 { margin: 0; font-size: 1.25rem; font-weight: 700; }
    button.btn {
      cursor: pointer;
      background: var(--surface);
      color: var(--text);
      border: 1px solid var(--border);
      padding: 6px 11px;
      border-radius: 7px;
      font-size: 0.82rem;
    }
    button.btn:hover { border-color: var(--accent); color: var(--accent); }
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(175px, 1fr));
      gap: 12px;
      margin-bottom: 16px;
    }
    .kpi-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 12px 14px;
    }
    .kpi-label { font-size: 0.75rem; color: var(--muted); text-transform: uppercase; }
    .kpi-value { font-size: 1.3rem; font-weight: 700; margin-top: 4px; }
    .kpi-delta { font-size: 0.78rem; color: var(--accent); margin-top: 2px; }
    .charts-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
      gap: 14px;
      margin-bottom: 16px;
    }
    @media (max-width: 520px) { .charts-grid { grid-template-columns: 1fr; } }
    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 14px;
    }
    .chart-box { width: 100%; height: 340px; }
    .table-toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
      margin-bottom: 10px;
      flex-wrap: wrap;
    }
    .search-input {
      padding: 6px 10px;
      border: 1px solid var(--border);
      border-radius: 7px;
      background: var(--bg);
      color: var(--text);
      font-size: 0.85rem;
    }
    .table-wrap { overflow-x: auto; max-height: 360px; border: 1px solid var(--border); border-radius: 8px; }
    table { width: 100%; border-collapse: collapse; font-size: 0.84rem; }
    th, td { padding: 8px 10px; border-bottom: 1px solid var(--border); text-align: left; white-space: nowrap; }
    th { position: sticky; top: 0; background: var(--surface); cursor: pointer; }
    tr:hover td { background: var(--accent-soft); }
    .sql-panel {
      margin-top: 14px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 10px 14px;
    }
    .sql-panel summary { cursor: pointer; font-weight: 600; color: var(--muted); font-size: 0.85rem; }
    .sql-panel pre { margin: 10px 0 0; padding: 10px; background: var(--bg); border-radius: 6px; overflow-x: auto; font-size: 0.8rem; }
  </style>
</head>
<body>
  <header>
    <h1>${safeTitle}</h1>
    <button class="btn" id="themeToggle" type="button">Тема: Тёмная</button>
  </header>
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
  ${sqlSection}
  <script>
    const PAYLOAD = ${payloadJson};
    const chartInstances = [];

    function renderKPIs() {
      const grid = document.getElementById("kpiGrid");
      PAYLOAD.kpis.forEach((k) => {
        const card = document.createElement("div");
        card.className = "kpi-card";
        card.innerHTML = '<div class="kpi-label"></div><div class="kpi-value"></div>';
        card.querySelector(".kpi-label").textContent = k.label;
        card.querySelector(".kpi-value").textContent = k.value;
        if (k.delta) {
          const d = document.createElement("div");
          d.className = "kpi-delta";
          d.textContent = k.delta;
          card.appendChild(d);
        }
        grid.appendChild(card);
      });
    }

    function buildOption(spec) {
      const isDark = document.documentElement.getAttribute("data-theme") === "dark";
      const textColor = isDark ? "#F5F5F5" : "#0f172a";
      const palette = ["#FF8500", "#22C55E", "#EF4444", "#FFA033", "#737373", "#4ADE80"];
      const toolbox = { feature: { saveAsImage: { title: "PNG" } }, right: 6 };

      if (spec.type === "donut") {
        const s = spec.series[0];
        return {
          color: palette,
          backgroundColor: "transparent",
          title: { text: spec.title, textStyle: { color: textColor, fontSize: 14 } },
          tooltip: { trigger: "item", formatter: "{b}: {c} ({d}%)" },
          legend: { bottom: 0, type: "scroll", textStyle: { color: textColor } },
          toolbox,
          series: [{
            type: "pie",
            radius: ["42%", "68%"],
            center: ["50%", "48%"],
            data: spec.xLabels.map((lbl, idx) => ({ name: lbl, value: s.values[idx] }))
          }]
        };
      }

      const categories = spec.forecastLabel ? [...spec.xLabels, spec.forecastLabel] : spec.xLabels;
      const series = [];
      spec.series.forEach((s) => {
        const hist = spec.forecastLabel ? [...s.values, null] : s.values;
        series.push({
          name: s.name,
          type: spec.type === "area" ? "line" : spec.type,
          areaStyle: spec.type === "area" ? { opacity: 0.22 } : undefined,
          smooth: spec.type === "line" || spec.type === "area",
          data: hist
        });
        if (spec.forecastLabel && s.forecastValue !== null) {
          const bridge = s.values[s.values.length - 1];
          series.push({
            name: s.name + " (прогноз)",
            type: "line",
            smooth: true,
            lineStyle: { type: "dashed", width: 2.5 },
            data: [...Array(Math.max(0, s.values.length - 1)).fill(null), bridge, s.forecastValue]
          });
        }
      });

      return {
        color: palette,
        backgroundColor: "transparent",
        title: { text: spec.title, textStyle: { color: textColor, fontSize: 14 } },
        tooltip: { trigger: "axis" },
        legend: { bottom: 0, type: "scroll", textStyle: { color: textColor } },
        toolbox,
        grid: { left: 52, right: 20, top: 48, bottom: 44, containLabel: true },
        xAxis: { type: "category", data: categories, axisLabel: { color: textColor, rotate: categories.length > 8 ? 25 : 0 } },
        yAxis: { type: "value", axisLabel: { color: textColor } },
        series
      };
    }

    function renderCharts() {
      const grid = document.getElementById("chartsGrid");
      grid.innerHTML = "";
      chartInstances.length = 0;
      const isDark = document.documentElement.getAttribute("data-theme") === "dark";
      PAYLOAD.charts.forEach((spec) => {
        const card = document.createElement("div");
        card.className = "card";
        const box = document.createElement("div");
        box.className = "chart-box";
        card.appendChild(box);
        grid.appendChild(card);
        if (typeof echarts === "undefined") {
          box.textContent = "Apache ECharts недоступен (проверьте сеть). Данные доступны в таблице ниже.";
          return;
        }
        const inst = echarts.init(box, isDark ? "dark" : null);
        inst.setOption(buildOption(spec));
        chartInstances.push(inst);
      });
    }

    let sortCol = null;
    let sortAsc = true;
    let searchTerm = "";

    function getFilteredRows() {
      let filtered = PAYLOAD.rows;
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        filtered = filtered.filter((r) => PAYLOAD.columns.some((c) => String(r[c] ?? "").toLowerCase().includes(q)));
      }
      if (sortCol) {
        filtered = [...filtered].sort((a, b) => {
          const va = a[sortCol], vb = b[sortCol];
          if (va === vb) return 0;
          if (va == null) return 1;
          if (vb == null) return -1;
          if (typeof va === "number" && typeof vb === "number") return sortAsc ? va - vb : vb - va;
          return sortAsc ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
        });
      }
      return filtered;
    }

    function renderTable() {
      const thead = document.querySelector("#dataTable thead");
      const tbody = document.querySelector("#dataTable tbody");
      const rows = getFilteredRows();
      document.getElementById("rowCountLabel").textContent = String(rows.length);
      thead.innerHTML = "";
      const trHead = document.createElement("tr");
      PAYLOAD.columns.forEach((col) => {
        const th = document.createElement("th");
        th.textContent = col + (sortCol === col ? (sortAsc ? " ▲" : " ▼") : "");
        th.onclick = () => { sortCol === col ? (sortAsc = !sortAsc) : ((sortCol = col), (sortAsc = true)); renderTable(); };
        trHead.appendChild(th);
      });
      thead.appendChild(trHead);
      tbody.innerHTML = "";
      rows.forEach((r) => {
        const tr = document.createElement("tr");
        PAYLOAD.columns.forEach((col) => {
          const td = document.createElement("td");
          td.textContent = r[col] == null ? "NULL" : String(r[col]);
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
    }

    document.getElementById("searchInput").addEventListener("input", (e) => { searchTerm = e.target.value; renderTable(); });
    document.getElementById("exportCsvBtn").addEventListener("click", () => {
      const rows = getFilteredRows();
      const esc = (v) => '"' + String(v ?? "").replace(/"/g, '""') + '"';
      const csv = "\\uFEFF" + [PAYLOAD.columns.map(esc).join(","), ...rows.map((r) => PAYLOAD.columns.map((c) => esc(r[c])).join(","))].join("\\n");
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = "wren_dashboard.csv";
      a.click();
      URL.revokeObjectURL(url);
    });
    document.getElementById("themeToggle").addEventListener("click", () => {
      const root = document.documentElement;
      const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      document.getElementById("themeToggle").textContent = next === "dark" ? "Тема: Тёмная" : "Тема: Светлая";
      chartInstances.forEach((inst) => inst.dispose());
      renderCharts();
    });
    window.addEventListener("resize", () => chartInstances.forEach((inst) => inst.resize()));

    renderKPIs();
    renderCharts();
    renderTable();
  </script>
</body>
</html>`;
}
