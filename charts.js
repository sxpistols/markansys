/* charts.js — Grafik Chart.js v4 (menggantikan SVG buatan tangan).
   ------------------------------------------------------------------
   KONTRAK API (dipakai app.js):
   - Setiap fungsi mengembalikan string HTML berisi
     `<canvas data-chart-id="c-N">` di dalam `.chart-wrap` (scoreMeter:
     `<span class="chart-wrap-inline">`), dan mendaftarkan konfigurasinya
     via queueChart(id, config). Warna diambil dari CSS variables SAAT
     fungsi dipanggil (helper cssVar / themeColors) — jadi setelah ganti
     tema, integrator WAJIB me-render ulang layar lalu memanggil
     destroyCharts() + mountCharts().
   - mountCharts(): instansiasi semua chart yang terdaftar DAN ada di DOM
     saat ini. Entri antrean yang canvas-nya sudah tidak ada di DOM
     dihapus (navigasi). Mengembalikan jumlah chart yang berhasil mount.
   - destroyCharts(): hancurkan semua instance hidup (dipanggil sebelum
     render ulang / sebelum mount ulang). Antrean config dipertahankan.
   - Tooltip: NATIVE Chart.js saja, tanpa tooltip custom.
   - Sizing: responsive, maintainAspectRatio:false; tinggi wrapper
     mengikuti proporsi FigCraft (Histori 235px, Arus Kas/NPV/Tren 180px,
     Candle 200px, Tim sempit 160px).

   DEPENDENSI (di-vendor W1, di-load SEBELUM charts.js di index.html):
   - Chart.js v4 UMD  -> global `Chart`
   - chartjs-chart-financial UMD (v0.2.1): TIDAK membuat global; ia
     me-register CandlestickController/OhlcController sendiri saat
     di-load (jadi cukup <script src> sebelum charts.js). ensureChartPlugins()
     hanya jaring pengaman bila build ESM/CJS dipakai.
   - chartjs-chart-matrix UMD (v3.1.0) -> global `chartjs-chart-matrix`
     (dipakai heatmapMatrix() via heatmapMatrixConfig()). Juga
     me-register sendiri saat di-load.
   Bila Chart belum ter-load saat mountCharts() dipanggil, mount dilewati
   dengan console.warn (tidak throw).

   HEATMAP: heatmapMatrix() memakai Chart.js matrix via
   heatmapMatrixConfig() (plugin matrix ter-vendor W1, terverifikasi
   ter-load). Sel aktif berbingkai, tooltip native.

   ANGKA/DATA: file ini hanya me-render; tidak ada angka yang diubah.
   fmtRp/fmtNum adalah global dari data.js (di-load sebelum charts.js).
*/
"use strict";

function escAttr(s) { return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;"); }

/* ---------- Registry antrean + instance hidup ---------- */
let __chartSeq = 0;
const __chartQueue = new Map(); /* id -> config Chart.js */
const __chartLive = new Map();  /* id -> { chart, el } */
const __registeredPlugins = new Set();

function nextId() { return "c-" + (++__chartSeq); }

function queueChart(id, config) { __chartQueue.set(id, config); }

/* ---------- Warna dari CSS variables (tema dark/light) ---------- */
function cssVar(name, fallback = "") {
  try {
    if (typeof document === "undefined" || !document.documentElement) return fallback;
    if (typeof getComputedStyle === "undefined") return fallback;
    const v = getComputedStyle(document.documentElement).getPropertyValue(name);
    return (v && v.trim()) || fallback;
  } catch (e) { return fallback; }
}

/* "var(--chart-1)" -> nilai computed; warna lain diteruskan apa adanya. */
function resolveColor(c, fallback) {
  if (typeof c !== "string") return c;
  const m = /^\s*var\(\s*(--[\w-]+)\s*(?:,\s*(.+?))?\s*\)\s*$/.exec(c);
  if (!m) return c;
  return cssVar(m[1], (m[2] || fallback || "").trim() || c);
}

function themeColors() {
  return {
    textPrimary: cssVar("--text-primary", "#0F172A"),
    textSecondary: cssVar("--text-secondary", "#475569"),
    textMuted: cssVar("--text-muted", "#64748B"),
    borderDefault: cssVar("--border-default", "#E1E7F0"),
    borderStrong: cssVar("--border-strong", "#C5CFE0"),
    surfaceCard: cssVar("--surface-card", "#FFFFFF"),
    surfaceRaised: cssVar("--surface-raised", "#F0F3F9"),
    warning: cssVar("--state-warning", "#B45309"),
    up: cssVar("--market-up", "#059669"),
    down: cssVar("--market-down", "#DC2626"),
    flat: cssVar("--market-flat", "#64748B"),
    primary: cssVar("--primary-default", "#2563EB"),
    chart1: cssVar("--chart-1", "#2563EB"),
    chart2: cssVar("--chart-2", "#059669"),
    chart3: cssVar("--chart-3", "#7C3AED"),
    chart4: cssVar("--chart-4", "#D97706"),
    chart5: cssVar("--chart-5", "#0284C7"),
    chart6: cssVar("--chart-6", "#64748B")
  };
}

/* ---------- Helper warna ---------- */
function parseHex(color) {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(color || "").trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((ch) => ch + ch).join("");
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function hexA(color, alpha) {
  const rgb = parseHex(color);
  return rgb ? `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})` : color;
}

function mixHex(a, b, t) {
  const pa = parseHex(a), pb = parseHex(b);
  if (!pa || !pb) return b;
  const m = (x, y) => Math.round(x + (y - x) * t);
  return `rgb(${m(pa[0], pb[0])},${m(pa[1], pb[1])},${m(pa[2], pb[2])})`;
}

/* ---------- Helper umum Chart.js ---------- */
function tooltipStyle(t) {
  return {
    backgroundColor: t.surfaceRaised,
    titleColor: t.textPrimary,
    bodyColor: t.textSecondary,
    borderColor: t.borderStrong,
    borderWidth: 1,
    padding: 10,
    boxPadding: 4,
    titleFont: { size: 12, weight: "600" },
    bodyFont: { size: 12 }
  };
}

const AXIS_FONT = { size: 11 };

function chartWrap(id, height, extra = "") {
  return `<div class="chart-wrap" style="position:relative;height:${height}px;${extra}"><canvas data-chart-id="${escAttr(id)}"></canvas></div>`;
}

/* Daftarkan controller plugin UMD bila global-nya tersedia DAN belum
   terdaftar. Catatan hasil verifikasi (npm chartjs-chart-financial
   0.2.1, chartjs-chart-matrix 3.1.0): KEDUA UMD me-register sendiri
   saat di-load (financial: Chart.register(CandlestickController,
   OhlcController, ...); matrix: Chart.register(MatrixController,
   MatrixElement) + global `chartjs-chart-matrix`). UMD financial TIDAK
   membuat global `ChartFinancial`. Fungsi ini hanya jaring pengaman
   bila vendor memakai build ESM/CJS; getController dipakai untuk
   memastikan tidak ada registrasi ganda. */
function __controllerRegistered(id) {
  try { return !!Chart.registry.getController(id); } catch (e) { return false; }
}

function ensureChartPlugins() {
  if (typeof Chart === "undefined") return;
  const g = typeof globalThis !== "undefined" ? globalThis : {};
  try {
    const fin = g.ChartFinancial || g["chartjs-chart-financial"];
    if (fin && fin.CandlestickController && fin.CandlestickElement &&
        !__controllerRegistered("candlestick") && !__registeredPlugins.has("candlestick")) {
      Chart.register(fin.CandlestickController, fin.CandlestickElement);
      __registeredPlugins.add("candlestick");
    }
  } catch (e) { /* plugin finansial opsional di sini; mount akan gagal jelas */ }
  try {
    const mat = g.ChartMatrix || g["chartjs-chart-matrix"];
    if (mat && mat.MatrixController && mat.MatrixElement &&
        !__controllerRegistered("matrix") && !__registeredPlugins.has("matrix")) {
      Chart.register(mat.MatrixController, mat.MatrixElement);
      __registeredPlugins.add("matrix");
    }
  } catch (e) { /* matrix hanya dipakai heatmapMatrixConfig() */ }
}

/* Instansiasi semua chart yang terdaftar DAN ada di DOM saat ini. */
function mountCharts() {
  if (typeof document === "undefined") return 0;
  if (typeof Chart === "undefined") {
    if (typeof console !== "undefined") console.warn("[charts] Chart.js belum ter-load; mountCharts dilewati.");
    return 0;
  }
  ensureChartPlugins();
  const t = themeColors();
  try {
    Chart.defaults.font.family = "'Inter', system-ui, sans-serif";
    Chart.defaults.color = t.textMuted;
    Chart.defaults.borderColor = t.borderDefault;
  } catch (e) { /* abaikan */ }
  let mounted = 0;
  for (const [id, config] of Array.from(__chartQueue.entries())) {
    const canvas = document.querySelector(`canvas[data-chart-id="${id}"]`);
    const live = __chartLive.get(id);
    if (!canvas) {
      if (live) { try { live.chart.destroy(); } catch (e) { /* abaikan */ } __chartLive.delete(id); }
      __chartQueue.delete(id);
      continue;
    }
    if (live && live.el === canvas) continue; /* sudah ter-mount */
    if (live) { try { live.chart.destroy(); } catch (e) { /* abaikan */ } __chartLive.delete(id); }
    /* Canvas yang chart-nya gagal di tengah konstruksi (mis. plugin
       crash) tetap terdaftar di Chart.js — hancurkan dulu supaya
       `new Chart` tidak melempar "Canvas is already in use". */
    try {
      const stale = Chart.getChart(canvas);
      if (stale) stale.destroy();
    } catch (e) { /* abaikan */ }
    try {
      const chart = new Chart(canvas, config);
      __chartLive.set(id, { chart, el: canvas });
      mounted++;
    } catch (e) {
      if (typeof console !== "undefined") console.error("[charts] gagal mount", id, e);
    }
  }
  return mounted;
}

/* Hancurkan semua instance hidup. Dipanggil integrator sebelum render
   ulang layar (render() mengganti #view.innerHTML). Antrean config
   dipertahankan supaya mountCharts() bisa dipakai lagi setelah render. */
function destroyCharts() {
  for (const { chart } of __chartLive.values()) {
    try { chart.destroy(); } catch (e) { /* abaikan */ }
  }
  __chartLive.clear();
}

/* ---------- Grafik area (histori portofolio / arus kas kumulatif) ---------- */
/* Tinggi mengikuti normalisasi lama: Histori 235px, Arus Kas ("cum") 180px. */
function areaChart({ w = 1024, h = 180, values, labels, ymin, ymax, color = "var(--chart-1)", formatY = (v) => v, id = "g" }) {
  const t = themeColors();
  const col = resolveColor(color, t.chart1);
  const height = id === "cum" ? 180 : 235;
  const cid = nextId();
  const lo = ymin !== undefined ? ymin : Math.min(...values) * 0.98;
  const hi = ymax !== undefined ? ymax : Math.max(...values) * 1.02;
  const labs = labels && labels.length ? labels.slice() : values.map((_, i) => String(i + 1));
  const config = {
    type: "line",
    data: {
      labels: labs,
      datasets: [{
        data: values.slice(),
        borderColor: col,
        backgroundColor: (ctx) => {
          const { chart } = ctx;
          const { ctx: c, chartArea } = chart;
          if (!chartArea) return hexA(col, 0.28);
          const g = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
          g.addColorStop(0, hexA(col, 0.28));
          g.addColorStop(1, hexA(col, 0.02));
          return g;
        },
        fill: true,
        tension: 0,
        borderWidth: 2,
        pointRadius: (ctx) => (ctx.dataIndex === values.length - 1 ? 4 : 0),
        pointHoverRadius: 4,
        pointBackgroundColor: col,
        pointBorderColor: col
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          ...tooltipStyle(t),
          callbacks: {
            title: (items) => items[0].label,
            label: (ctx) => `${ctx.label}: ${formatY(ctx.parsed.y)}`
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          border: { display: false },
          ticks: { color: t.textMuted, font: AXIS_FONT, maxTicksLimit: 6, maxRotation: 0 }
        },
        y: {
          min: lo, max: hi,
          grid: { color: t.borderDefault },
          border: { display: false },
          ticks: { color: t.textMuted, font: AXIS_FONT, maxTicksLimit: 5, callback: (v) => formatY(v) }
        }
      }
    }
  };
  queueChart(cid, config);
  return chartWrap(cid, height);
}

/* ---------- Donat ---------- */
/* center (opsional): {title, sub} atau array baris teks (string atau
   {text, bold}). Bila diisi, teks tengah digambar plugin inline — call
   site bisa memindahkan overlay HTML .donut-center ke param ini. */
function normalizeCenter(center) {
  if (!center) return [];
  if (Array.isArray(center)) {
    return center.map((ln, i) => (typeof ln === "string" ? { text: ln, bold: i === 0 } : ln))
      .filter((ln) => ln && ln.text !== undefined && ln.text !== null && ln.text !== "");
  }
  if (typeof center === "object") {
    return [{ text: center.title, bold: true }, { text: center.sub }]
      .filter((ln) => ln.text !== undefined && ln.text !== null && ln.text !== "");
  }
  if (typeof center === "string") return [{ text: center, bold: true }];
  return [];
}

function donut({ size = 180, thick = 26, segments, center }) {
  const t = themeColors();
  const total = segments.reduce((a, s) => a + s.value, 0) || 1;
  const cid = nextId();
  const lines = normalizeCenter(center);
  const centerPlugin = lines.length ? {
    id: "donutCenter",
    afterDraw(chart) {
      const meta = chart.getDatasetMeta(0);
      const arc = meta.data[0];
      if (!arc) return;
      const { ctx } = chart;
      const heights = lines.map((ln) => (ln.bold ? 26 : 18));
      const totalH = heights.reduce((a, b) => a + b, 0);
      let y = arc.y - totalH / 2;
      ctx.save();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      lines.forEach((ln, i) => {
        ctx.font = ln.bold
          ? "700 20px Inter, system-ui, sans-serif"
          : "400 12px Inter, system-ui, sans-serif";
        ctx.fillStyle = ln.bold ? t.textPrimary : t.textMuted;
        ctx.fillText(String(ln.text), arc.x, y + heights[i] / 2);
        y += heights[i];
      });
      ctx.restore();
    }
  } : null;
  const config = {
    type: "doughnut",
    data: {
      labels: segments.map((s, i) => s.label || `Segmen ${i + 1}`),
      datasets: [{
        data: segments.map((s) => s.value),
        backgroundColor: segments.map((s) => resolveColor(s.color, t.chart1)),
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      cutout: `${Math.round((1 - (2 * thick) / size) * 100)}%`,
      plugins: {
        legend: { display: false },
        tooltip: {
          ...tooltipStyle(t),
          callbacks: {
            label: (ctx) => {
              const v = ctx.parsed;
              const pct = Math.round((v / total) * 100);
              return ` ${ctx.label}: ${v} (${pct}%)`;
            }
          }
        }
      }
    },
    plugins: centerPlugin ? [centerPlugin] : []
  };
  queueChart(cid, config);
  return chartWrap(cid, size, `width:${size}px;`);
}

/* ---------- Batang vertikal (NPV per skema, capaian tim) ---------- */
/* Label nilai di atas tiap batang digambar plugin inline dengan halo
   (stroke warna kartu) supaya tetap terbaca bila garis target melewatinya
   — kasus label "Rp 552 jt" yang dulu tertabrak garis target. Garis
   target putus-putus + label digambar plugin inline yang sama (tanpa
   dependensi annotation). Bila target > nilai maks, skala-Y diperluas
   supaya garis tetap terlihat (dulu target > maks tidak digambar). */
function vBars({ w = 1024, h = 180, values, labels, colors, formatV = (v) => v, baselineZero = true, target, targetLabel }) {
  const t = themeColors();
  const height = w >= 500 ? 180 : 160;
  const cid = nextId();
  const maxV = Math.max(...values, 0, target !== undefined ? target : -Infinity);
  const minV = baselineZero ? 0 : Math.min(...values, 0);
  const barColors = values.map((_, i) => resolveColor(colors ? colors[i] : "var(--chart-1)", t.chart1));
  const valuePlugin = {
    id: "vBarValues",
    afterDatasetsDraw(chart) {
      const { ctx, chartArea } = chart;
      const meta = chart.getDatasetMeta(0);
      ctx.save();
      ctx.font = "11px Inter, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.strokeStyle = t.surfaceCard;
      ctx.lineWidth = 4;
      ctx.lineJoin = "round";
      meta.data.forEach((bar, i) => {
        const v = values[i];
        const text = formatV(v);
        const x = bar.x;
        if (v >= 0) {
          ctx.textBaseline = "bottom";
          const y = bar.y - 6;
          ctx.strokeText(text, x, y);
          ctx.fillStyle = t.textPrimary;
          ctx.fillText(text, x, y);
        } else {
          ctx.textBaseline = "top";
          const y = bar.base + 6;
          ctx.strokeText(text, x, y);
          ctx.fillStyle = t.textPrimary;
          ctx.fillText(text, x, y);
        }
      });
      /* Garis target putus-putus + label (halo yang sama). */
      if (target !== undefined) {
        const yScale = chart.scales.y;
        const y = yScale.getPixelForValue(target);
        if (y >= chartArea.top && y <= chartArea.bottom) {
          ctx.strokeStyle = t.warning;
          ctx.lineWidth = 1.5;
          ctx.setLineDash([5, 4]);
          ctx.beginPath();
          ctx.moveTo(chartArea.left, y);
          ctx.lineTo(chartArea.right, y);
          ctx.stroke();
          ctx.setLineDash([]);
          const label = targetLabel || ("Target " + formatV(target));
          ctx.textAlign = "right";
          ctx.textBaseline = "bottom";
          const ly = Math.max(chartArea.top + 12, y - 6);
          ctx.strokeStyle = t.surfaceCard;
          ctx.lineWidth = 4;
          ctx.lineJoin = "round";
          ctx.strokeText(label, chartArea.right - 2, ly);
          ctx.fillStyle = t.warning;
          ctx.fillText(label, chartArea.right - 2, ly);
        }
      }
      ctx.restore();
    }
  };
  const config = {
    type: "bar",
    data: {
      labels: labels.slice(),
      datasets: [{
        data: values.slice(),
        backgroundColor: barColors,
        borderRadius: 4,
        maxBarThickness: 24,
        categoryPercentage: 0.6,
        barPercentage: 0.9
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: "index", intersect: false },
      layout: { padding: { top: 8 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          ...tooltipStyle(t),
          callbacks: { label: (ctx) => `${ctx.label}: ${formatV(ctx.parsed.y)}` }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          border: { display: false },
          ticks: { color: t.textMuted, font: AXIS_FONT, maxRotation: 0 }
        },
        y: {
          min: minV,
          max: maxV === minV ? minV + 1 : maxV,
          grid: { color: t.borderDefault },
          border: { display: false },
          ticks: { color: t.textMuted, font: AXIS_FONT, maxTicksLimit: 5, callback: (v) => formatV(v) }
        }
      }
    },
    plugins: [valuePlugin]
  };
  queueChart(cid, config);
  return chartWrap(cid, height);
}

/* ---------- Gauge skor sentimen (-1 s.d. +1) ---------- */
/* Setengah lingkaran atas: doughnut circumference 180, rotation 270
   (0 derajat = atas, searah jarum jam). Nilai + label digambar plugin
   inline di dalam busur. */
function scoreMeter({ w = 320, value }) {
  const t = themeColors();
  const frac = Math.max(0, Math.min(1, (value + 1) / 2));
  const col = value >= 0.15 ? t.up : value <= -0.15 ? t.down : t.flat;
  const label = value >= 0.15 ? "Cenderung positif" : value <= -0.15 ? "Cenderung negatif" : "Netral";
  const signed = (value >= 0 ? "+" : "") + value.toFixed(2);
  const cid = nextId();
  const height = Math.round(w / 2);
  const centerPlugin = {
    id: "gaugeCenter",
    afterDraw(chart) {
      const meta = chart.getDatasetMeta(0);
      const arc = meta.data[0];
      if (!arc) return;
      const { ctx } = chart;
      ctx.save();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "700 20px Inter, system-ui, sans-serif";
      ctx.fillStyle = t.textPrimary;
      ctx.fillText(signed, arc.x, arc.y - 14);
      ctx.font = "400 12px Inter, system-ui, sans-serif";
      ctx.fillStyle = t.textMuted;
      ctx.fillText(label, arc.x, arc.y + 8);
      ctx.restore();
    }
  };
  const config = {
    type: "doughnut",
    data: {
      datasets: [{
        data: [frac, 1 - frac],
        backgroundColor: [col, t.borderDefault],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      rotation: 270,
      circumference: 180,
      cutout: "70%",
      plugins: {
        legend: { display: false },
        tooltip: {
          ...tooltipStyle(t),
          callbacks: {
            title: () => "Skor sentimen",
            label: () => ` ${signed} · ${label}`
          }
        }
      }
    },
    plugins: [centerPlugin]
  };
  queueChart(cid, config);
  return `<span class="chart-wrap-inline" style="position:relative;display:inline-block;width:${w}px;height:${height}px"><canvas data-chart-id="${escAttr(cid)}"></canvas></span>`;
}

/* ---------- Candlestick + MA 50/200 + support/resistance ---------- */
/* Sumbu-x: category scale dengan label "1".."N" (data ohlc tidak punya
   tanggal; TIDAK butuh date adapter). MA 50/200 sebagai dataset garis di
   chart yang sama; support/resistance sebagai dataset garis putus-putus
   (tanpa dependensi annotation) + label teks via plugin inline. ohlc
   berbentuk array {o,h,l,c} (array [o,h,l,c] lama tetap didukung). */
function candleChart({ w = 1024, h = 200, ohlc, maFast = [], maSlow = [], ma50 = [], ma200 = [], support, resistance, lo, hi }) {
  const t = themeColors();
  const cid = nextId();
  const norm = ohlc.map((c, i) => {
    const o = c.o !== undefined ? c.o : c[0];
    const hh = c.h !== undefined ? c.h : c[1];
    const l = c.l !== undefined ? c.l : c[2];
    const cl = c.c !== undefined ? c.c : c[3];
    return { x: i, o, h: hh, l, c: cl };
  });
  const maF = ma50.length ? ma50 : maFast;
  const maS = ma200.length ? ma200 : maSlow;
  const labels = norm.map((_, i) => String(i + 1));
  const fmt = (v) => (typeof fmtRp === "function" ? fmtRp(v) : String(v));
  const srLabelPlugin = {
    id: "srLabels",
    afterDatasetsDraw(chart) {
      const { ctx, chartArea } = chart;
      const yScale = chart.scales.y;
      ctx.save();
      ctx.font = "11px Inter, system-ui, sans-serif";
      ctx.textAlign = "right";
      ctx.textBaseline = "bottom";
      ctx.lineJoin = "round";
      const draw = (val, text, color) => {
        if (val === undefined || !Number.isFinite(val)) return;
        const y = yScale.getPixelForValue(val);
        if (y < chartArea.top + 10 || y > chartArea.bottom) return;
        ctx.strokeStyle = t.surfaceCard;
        ctx.lineWidth = 4;
        ctx.strokeText(text, chartArea.right - 2, y - 4);
        ctx.fillStyle = color;
        ctx.fillText(text, chartArea.right - 2, y - 4);
      };
      draw(support, "Support " + fmt(support), t.down);
      draw(resistance, "Resistance " + fmt(resistance), t.up);
      ctx.restore();
    }
  };
  const config = {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          type: "candlestick",
          label: "Harga",
          data: norm,
          color: { up: t.up, down: t.down, unchanged: t.flat },
          borderColor: { up: t.up, down: t.down, unchanged: t.flat }
        },
        {
          type: "line",
          label: "MA 50",
          data: maF.slice(),
          borderColor: resolveColor("var(--chart-5)", t.chart5),
          backgroundColor: resolveColor("var(--chart-5)", t.chart5),
          borderWidth: 1.5,
          pointRadius: 0,
          spanGaps: false
        },
        {
          type: "line",
          label: "MA 200",
          data: maS.slice(),
          borderColor: resolveColor("var(--chart-4)", t.chart4),
          backgroundColor: resolveColor("var(--chart-4)", t.chart4),
          borderWidth: 1.5,
          pointRadius: 0,
          spanGaps: false
        },
        {
          type: "line",
          label: "Support",
          data: support !== undefined ? norm.map(() => support) : [],
          borderColor: t.down,
          backgroundColor: t.down,
          borderWidth: 1,
          borderDash: [4, 4],
          pointRadius: 0
        },
        {
          type: "line",
          label: "Resistance",
          data: resistance !== undefined ? norm.map(() => resistance) : [],
          borderColor: t.up,
          backgroundColor: t.up,
          borderWidth: 1,
          borderDash: [4, 4],
          pointRadius: 0
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        /* Legenda MA 50/MA 200 sudah ada sebagai HTML di app.js (di bawah
           grafik); legenda Chart.js dimatikan supaya tidak dobel. */
        legend: { display: false },
        tooltip: {
          ...tooltipStyle(t),
          filter: (item) => item.datasetIndex === 0 ||
            (item.parsed && item.parsed.y !== null && item.parsed.y !== undefined),
          callbacks: {
            title: (items) => `Candle ${items[0].label}`,
            label: (ctx) => {
              if (ctx.datasetIndex === 0) {
                const d = ctx.raw;
                return [
                  `Buka ${fmt(d.o)}`,
                  `Tertinggi ${fmt(d.h)}`,
                  `Terendah ${fmt(d.l)}`,
                  `Tutup ${fmt(d.c)}`
                ];
              }
              return ` ${ctx.dataset.label} ${fmt(ctx.parsed.y)}`;
            }
          }
        }
      },
      scales: {
        x: {
          type: "category",
          grid: { display: false },
          border: { display: false },
          ticks: { color: t.textMuted, font: AXIS_FONT, maxTicksLimit: 8, maxRotation: 0, autoSkip: true }
        },
        y: {
          min: lo, max: hi,
          grid: { color: t.borderDefault },
          border: { display: false },
          ticks: {
            color: t.textMuted, font: AXIS_FONT, maxTicksLimit: 5,
            callback: (v) => "Rp " + (typeof fmtNum === "function" ? fmtNum(v) : v)
          }
        }
      }
    },
    plugins: [srLabelPlugin]
  };
  queueChart(cid, config);
  return chartWrap(cid, 200);
}

/* ---------- Grafik garis multi-seri (tren tim) ---------- */
/* Titik di tiap bulan + legenda nama series: legenda HTML sudah ada di
   app.js di bawah grafik (jadi legend Chart.js display:false); nama
   series tampil di tooltip native. */
function multiLine({ w = 1024, h = 180, series, labels, names = [], ymin = 60, ymax = 115 }) {
  const t = themeColors();
  const cid = nextId();
  const config = {
    type: "line",
    data: {
      labels: labels.slice(),
      datasets: series.map((s, i) => {
        const col = resolveColor(s.color, t.chart1);
        return {
          label: names[i] || `Seri ${i + 1}`,
          data: s.values.slice(),
          borderColor: col,
          backgroundColor: col,
          fill: false,
          tension: 0,
          borderWidth: 2,
          pointRadius: 3,
          pointHoverRadius: 5,
          pointBackgroundColor: col,
          pointBorderColor: t.surfaceCard,
          pointBorderWidth: 1.5
        };
      })
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          ...tooltipStyle(t),
          callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${ctx.parsed.y}%` }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          border: { display: false },
          ticks: { color: t.textMuted, font: AXIS_FONT, maxRotation: 0 }
        },
        y: {
          min: ymin, max: ymax,
          grid: { color: t.borderDefault },
          border: { display: false },
          ticks: { color: t.textMuted, font: AXIS_FONT, maxTicksLimit: 5, callback: (v) => v + "%" }
        }
      }
    }
  };
  queueChart(cid, config);
  return chartWrap(cid, 180);
}

/* ---------- Heatmap DCF (Chart.js matrix) ---------- */
/* Mengembalikan canvas matrix via heatmapMatrixConfig() + queueChart.
   Bentuk config:
     heatmapMatrix({ rows, cols, values, active, formatV })
     - rows: [label baris, ...]   (mis. ["9,5%", "10,5%", "11,5%"] — WACC)
     - cols: [label kolom, ...]   (mis. ["2,5%", "3,5%", "4,5%"] — terminal)
     - values: [[angka, ...], ...] (3x3, baris = rows, kolom = cols)
     - active: { r, c }           (sel asumsi saat ini; opsional)
     - formatV: (v) => string     (default fmtRp)
   Label rows/cols sudah diformat pemanggil (string). */
function heatmapMatrix({ rows, cols, values, active, formatV }) {
  const id = nextId();
  queueChart(id, heatmapMatrixConfig({ rows, cols, values, active, formatV }));
  return chartWrap(id, 180);
}

/* Bentuk config Chart.js matrix (dipakai heatmapMatrix() di atas).
   updateDCF() di app.js membangun ulang innerHTML #dcfHeat via
   dcfHeatHTML() tiap slider berubah, lalu mountCharts() dipanggil —
   jadi canvas heatmap ter-mount ulang dengan config baru. */
function heatmapMatrixConfig({ rows, cols, values, active, formatV }) {
  const t = themeColors();
  const fmt = formatV || ((v) => String(v));
  const flat = values.flat();
  const minV = Math.min(...flat), maxV = Math.max(...flat);
  const data = [];
  values.forEach((row, r) => row.forEach((v, c) => data.push({ x: c, y: r, v })));
  return {
    type: "matrix",
    data: {
      datasets: [{
        data,
        backgroundColor: (ctx) => {
          const v = ctx.raw.v;
          const tt = (v - minV) / (maxV - minV || 1);
          return mixHex(t.surfaceCard, t.primary, tt);
        },
        borderColor: (ctx) => (active && ctx.raw.x === active.c && ctx.raw.y === active.r ? t.primary : "transparent"),
        borderWidth: (ctx) => (active && ctx.raw.x === active.c && ctx.raw.y === active.r ? 2 : 0),
        width: ({ chart }) => ((chart.chartArea || {}).width || 300) / cols.length - 6,
        height: ({ chart }) => ((chart.chartArea || {}).height || 180) / rows.length - 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          ...tooltipStyle(t),
          callbacks: {
            title: () => "",
            label: (ctx) => ` ${rows[ctx.raw.y]} × ${cols[ctx.raw.x]}: ${fmt(ctx.raw.v)}`
          }
        }
      },
      scales: {
        x: {
          type: "category",
          labels: cols,
          grid: { display: false },
          border: { display: false },
          ticks: { color: t.textMuted, font: AXIS_FONT }
        },
        y: {
          type: "category",
          labels: rows,
          reverse: true,
          grid: { display: false },
          border: { display: false },
          ticks: { color: t.textMuted, font: AXIS_FONT }
        }
      }
    }
  };
}

/* Ekspor untuk pengujian node (tidak berpengaruh di browser). */
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    areaChart, donut, vBars, scoreMeter, candleChart, multiLine,
    heatmapMatrix, heatmapMatrixConfig,
    queueChart, mountCharts, destroyCharts,
    cssVar, resolveColor, themeColors,
    __queue: __chartQueue, __live: __chartLive
  };
}
