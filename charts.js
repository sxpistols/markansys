/* charts.js — Grafik SVG tanpa dependensi.
   Semua grafik digambar sebagai SVG inline supaya mengikuti token warna
   (CSS variables) dan bisa diekspor. */
"use strict";

function svgEl(w, h, inner) {
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-hidden="true">${inner}</svg>`;
}

/* Grafik area (histori portofolio / arus kas kumulatif). */
function areaChart({ w = 640, h = 200, values, labels, ymin, ymax, color = "var(--chart-1)", formatY = (v) => v, id = "g" }) {
  const padL = 52, padB = 22, padT = 8, padR = 8;
  const lo = ymin !== undefined ? ymin : Math.min(...values) * 0.98;
  const hi = ymax !== undefined ? ymax : Math.max(...values) * 1.02;
  const X = (i) => padL + (i / (values.length - 1)) * (w - padL - padR);
  const Y = (v) => padT + (1 - (v - lo) / (hi - lo)) * (h - padB - padT);
  const pts = values.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(" ");
  const area = `${padL},${Y(lo)} ` + pts + ` ${X(values.length - 1).toFixed(1)},${Y(lo)}`;
  let grid = "";
  const ticks = 4;
  for (let t = 0; t <= ticks; t++) {
    const v = lo + ((hi - lo) * t) / ticks;
    const y = Y(v);
    grid += `<line x1="${padL}" y1="${y}" x2="${w - padR}" y2="${y}" stroke="var(--border-default)" stroke-width="1"/>` +
      `<text x="${padL - 6}" y="${y + 4}" text-anchor="end" class="axis-label">${formatY(v)}</text>`;
  }
  let xlabels = "";
  labels.forEach((lb, i) => {
    if (i % Math.ceil(labels.length / 6) === 0)
      xlabels += `<text x="${X(i)}" y="${h - 4}" text-anchor="middle" class="axis-label">${lb}</text>`;
  });
  return svgEl(w, h,
    `<defs><linearGradient id="ag${id}" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="${color}" stop-opacity="0.28"/>` +
    `<stop offset="1" stop-color="${color}" stop-opacity="0.02"/></linearGradient></defs>` +
    grid +
    `<polygon points="${area}" fill="url(#ag${id})"/>` +
    `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>` +
    `<circle cx="${X(values.length - 1)}" cy="${Y(values[values.length - 1])}" r="4" fill="${color}"/>` +
    xlabels);
}

/* Donat — memakai stroke-dasharray pada lingkaran (stabil di semua browser). */
function donut({ size = 180, thick = 26, segments }) {
  const r = (size - thick) / 2, c = 2 * Math.PI * r, cx = size / 2;
  const total = segments.reduce((a, s) => a + s.value, 0);
  let off = 0, circles = "";
  segments.forEach((s) => {
    const len = (s.value / total) * c;
    circles += `<circle cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke="${s.color}" stroke-width="${thick}" ` +
      `stroke-dasharray="${len.toFixed(1)} ${(c - len).toFixed(1)}" stroke-dashoffset="${(-off).toFixed(1)}" transform="rotate(-90 ${cx} ${cx})"/>`;
    off += len;
  });
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-hidden="true">${circles}</svg>`;
}

/* Batang vertikal (NPV per skema, capaian tim). */
function vBars({ w = 640, h = 220, values, labels, colors, formatV = (v) => v, baselineZero = true }) {
  const padB = 24, padT = 28, padL = 8, padR = 8;
  const max = Math.max(...values, 0), min = baselineZero ? 0 : Math.min(...values, 0);
  const Y = (v) => padT + (1 - (v - min) / (max - min || 1)) * (h - padB - padT);
  const n = values.length, slot = (w - padL - padR) / n, bw = Math.min(24, slot * 0.5);
  let out = `<line x1="${padL}" y1="${Y(0)}" x2="${w - padR}" y2="${Y(0)}" stroke="var(--border-strong)" stroke-width="1"/>`;
  values.forEach((v, i) => {
    const x = padL + slot * i + (slot - bw) / 2;
    const col = colors ? colors[i] : "var(--chart-1)";
    out += `<rect x="${x.toFixed(1)}" y="${Y(Math.max(v, 0)).toFixed(1)}" width="${bw}" height="${Math.abs(Y(v) - Y(0)).toFixed(1)}" rx="4" fill="${col}"/>` +
      `<text x="${(x + bw / 2).toFixed(1)}" y="${(Y(Math.max(v, 0)) - 8).toFixed(1)}" text-anchor="middle" class="axis-label" fill="var(--text-primary)">${formatV(v)}</text>` +
      `<text x="${(x + bw / 2).toFixed(1)}" y="${h - 6}" text-anchor="middle" class="axis-label">${labels[i]}</text>`;
  });
  return svgEl(w, h, out);
}

/* Batang horizontal (skor sentimen -1 sampai +1 dengan garis tengah). */
function scoreMeter({ w = 320, value }) {
  const mid = w / 2, x = mid + (value / 1) * (w / 2 - 8);
  const col = value >= 0.15 ? "var(--market-up)" : value <= -0.15 ? "var(--market-down)" : "var(--market-flat)";
  return svgEl(w, 24,
    `<line x1="0" y1="12" x2="${w}" y2="12" stroke="var(--border-default)" stroke-width="4" stroke-linecap="round"/>` +
    `<line x1="${mid}" y1="4" x2="${mid}" y2="20" stroke="var(--border-strong)" stroke-width="1"/>` +
    `<circle cx="${x.toFixed(1)}" cy="12" r="7" fill="${col}"/>`);
}

/* Candlestick + garis MA dan support/resistance. */
function candleChart({ w = 720, h = 300, ohlc, maFast = [], maSlow = [], support, resistance, lo, hi }) {
  const padL = 56, padB = 22, padT = 10, padR = 12;
  const X = (i) => padL + (i + 0.5) * ((w - padL - padR) / ohlc.length);
  const Y = (v) => padT + (1 - (v - lo) / (hi - lo)) * (h - padB - padT);
  const bw = Math.max(4, ((w - padL - padR) / ohlc.length) * 0.55);
  let out = "";
  [9400, 9600, 9800, 10000].forEach((gv) => {
    out += `<line x1="${padL}" y1="${Y(gv)}" x2="${w - padR}" y2="${Y(gv)}" stroke="var(--border-default)" stroke-width="1"/>` +
      `<text x="${padL - 6}" y="${Y(gv) + 4}" text-anchor="end" class="axis-label">Rp ${fmtNum(gv)}</text>`;
  });
  // Support / resistance
  out += `<line x1="${padL}" y1="${Y(support)}" x2="${w - padR}" y2="${Y(support)}" stroke="var(--market-down)" stroke-width="1" stroke-dasharray="4 4"/>` +
    `<text x="${w - padR}" y="${Y(support) - 5}" text-anchor="end" class="axis-label" fill="var(--market-down)">Support ${fmtRp(support)}</text>` +
    `<line x1="${padL}" y1="${Y(resistance)}" x2="${w - padR}" y2="${Y(resistance)}" stroke="var(--market-up)" stroke-width="1" stroke-dasharray="4 4"/>` +
    `<text x="${w - padR}" y="${Y(resistance) - 5}" text-anchor="end" class="axis-label" fill="var(--market-up)">Resistance ${fmtRp(resistance)}</text>`;
  // Candles
  ohlc.forEach((c, i) => {
    const [o, hh, l, cl] = c;
    const up = cl >= o, col = up ? "var(--market-up)" : "var(--market-down)";
    const x = X(i);
    out += `<line x1="${x}" y1="${Y(hh)}" x2="${x}" y2="${Y(l)}" stroke="${col}" stroke-width="1.5"/>` +
      `<rect x="${(x - bw / 2).toFixed(1)}" y="${Y(Math.max(o, cl)).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(1, Math.abs(Y(o) - Y(cl))).toFixed(1)}" fill="${col}"/>`;
  });
  const line = (arr, col) => {
    let out = "", seg = [];
    const flush = () => {
      if (seg.length > 1) out += `<polyline points="${seg.join(" ")}" fill="none" stroke="${col}" stroke-width="1.5"/>`;
      seg = [];
    };
    arr.forEach((v, i) => {
      if (v === null || v === undefined) { flush(); return; }
      seg.push(`${X(i).toFixed(1)},${Y(v).toFixed(1)}`);
    });
    flush();
    return out;
  };
  out += line(maFast, "var(--chart-5)") + line(maSlow, "var(--chart-4)");
  return svgEl(w, h, out);
}

/* Grafik garis multi-seri (tren tim). */
function multiLine({ w = 640, h = 220, series, labels, ymin = 60, ymax = 115 }) {
  const padL = 40, padB = 22, padT = 10, padR = 8;
  const X = (i) => padL + (i / (labels.length - 1)) * (w - padL - padR);
  const Y = (v) => padT + (1 - (v - ymin) / (ymax - ymin)) * (h - padB - padT);
  let out = "";
  [60, 80, 100, 115].forEach((gv) => {
    out += `<line x1="${padL}" y1="${Y(gv)}" x2="${w - padR}" y2="${Y(gv)}" stroke="var(--border-default)" stroke-width="1"/>` +
      `<text x="${padL - 6}" y="${Y(gv) + 4}" text-anchor="end" class="axis-label">${gv}%</text>`;
  });
  series.forEach((s) => {
    const pts = s.values.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(" ");
    out += `<polyline points="${pts}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round"/>`;
  });
  labels.forEach((lb, i) => {
    out += `<text x="${X(i)}" y="${h - 4}" text-anchor="middle" class="axis-label">${lb}</text>`;
  });
  return svgEl(w, h, out);
}
