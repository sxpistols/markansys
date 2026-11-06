/* charts.js — Grafik SVG tanpa dependensi.
   Semua grafik digambar sebagai SVG inline supaya mengikuti token warna
   (CSS variables) dan bisa diekspor. */
"use strict";

function escAttr(s) { return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;"); }

function svgEl(w, h, inner, attrs = "") {
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" style="aspect-ratio:${w} / ${h}"${attrs} role="img" aria-hidden="true">${inner}</svg>`;
}

/* Grafik area (histori portofolio / arus kas kumulatif). */
function areaChart({ w = 1024, h = 180, values, labels, ymin, ymax, color = "var(--chart-1)", formatY = (v) => v, id = "g" }) {
  /* G2: viewBox dinormalisasi di dalam fungsi (bukan di pemanggil) agar
     tinggi render mendekati FigCraft: Histori ~3,3:1 (plot FigCraft
     632×~195), Arus Kas kumulatif ~5,7:1 (plot FigCraft ~1012×~170). */
  if (id === "cum") { w = 1024; h = 180; } else { w = 768; h = 235; }
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
  /* G1: tooltip hover (pola multiLine): data-tips berisi teks per titik,
     garis panduan .ac-guide digerakkan handler di app.js. */
  const tips = values.map((v, i) => `${labels[i]}: ${formatY(v)}`);
  const dataAttrs = ` class="area-chart" data-labels="${escAttr(JSON.stringify(labels))}" data-tips="${escAttr(JSON.stringify(tips))}" data-padl="${padL}" data-padr="${padR}"`;
  return svgEl(w, h,
    `<defs><linearGradient id="ag${id}" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="${color}" stop-opacity="0.28"/>` +
    `<stop offset="1" stop-color="${color}" stop-opacity="0.02"/></linearGradient></defs>` +
    grid +
    `<line class="ac-guide" x1="${X(0).toFixed(1)}" y1="${padT}" x2="${X(0).toFixed(1)}" y2="${h - padB}" stroke="var(--border-strong)" stroke-width="1" stroke-dasharray="3 3" visibility="hidden"/>` +
    `<polygon points="${area}" fill="url(#ag${id})"/>` +
    `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>` +
    `<circle cx="${X(values.length - 1)}" cy="${Y(values[values.length - 1])}" r="4" fill="${color}"/>` +
    xlabels, dataAttrs) + `<div class="chart-tip" data-generic hidden></div>`;
}

/* Donat — memakai stroke-dasharray pada lingkaran (stabil di semua browser). */
function donut({ size = 180, thick = 26, segments }) {
  const r = (size - thick) / 2, c = 2 * Math.PI * r, cx = size / 2;
  const total = segments.reduce((a, s) => a + s.value, 0);
  let off = 0, circles = "";
  segments.forEach((s, i) => {
    const len = (s.value / total) * c;
    /* G1: segmen bisa di-hover; handler di app.js membaca legenda kartu
       untuk label, data-v dipakai sebagai fallback. */
    circles += `<circle class="donut-seg" data-i="${i}" data-v="${s.value}" cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke="${s.color}" stroke-width="${thick}" ` +
      `stroke-dasharray="${len.toFixed(1)} ${(c - len).toFixed(1)}" stroke-dashoffset="${(-off).toFixed(1)}" transform="rotate(-90 ${cx} ${cx})"/>`;
    off += len;
  });
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-hidden="true">${circles}</svg>` +
    `<div class="chart-tip" data-generic hidden></div>`;
}

/* Batang vertikal (NPV per skema, capaian tim). target: garis target opsional (mis. Rp 600 jt). */
function vBars({ w = 1024, h = 180, values, labels, colors, formatV = (v) => v, baselineZero = true, target, targetLabel }) {
  /* G2: viewBox dinormalisasi di dalam fungsi. Kartu lebar (NPV Layar 6)
     jadi 1024×180 (~5,7:1, plot FigCraft ~1012×~170); kartu sempit
     (Capaian Tim, w<=500) dipertahankan lebarnya dengan tinggi 160
     (plot FigCraft ~392×~150). */
  if (w >= 500) { w = 1024; h = 180; } else { h = 160; }
  const padB = 24, padT = 28, padL = 8, padR = 8;
  const max = Math.max(...values, 0), min = baselineZero ? 0 : Math.min(...values, 0);
  const Y = (v) => padT + (1 - (v - min) / (max - min || 1)) * (h - padB - padT);
  const n = values.length, slot = (w - padL - padR) / n, bw = Math.min(24, slot * 0.5);
  let out = `<line x1="${padL}" y1="${Y(0)}" x2="${w - padR}" y2="${Y(0)}" stroke="var(--border-strong)" stroke-width="1"/>`;
  if (target !== undefined && target <= max) {
    const yt = Y(target);
    out += `<line x1="${padL}" y1="${yt.toFixed(1)}" x2="${w - padR}" y2="${yt.toFixed(1)}" stroke="var(--state-warning)" stroke-width="1.5" stroke-dasharray="5 4"/>` +
      `<text x="${w - padR}" y="${Math.max(12, yt - 6).toFixed(1)}" text-anchor="end" class="axis-label" fill="var(--state-warning)">${targetLabel || ("Target " + formatV(target))}</text>`;
  }
  values.forEach((v, i) => {
    const x = padL + slot * i + (slot - bw) / 2;
    const col = colors ? colors[i] : "var(--chart-1)";
    /* G1: tooltip hover — data-tip dibaca handler umum di app.js. */
    const tip = `<div class="tip-title">${escAttr(labels[i])}</div><div class="tip-row">${escAttr(formatV(v))}</div>`;
    out += `<rect class="vb-bar" data-tip="${escAttr(tip)}" x="${x.toFixed(1)}" y="${Y(Math.max(v, 0)).toFixed(1)}" width="${bw}" height="${Math.abs(Y(v) - Y(0)).toFixed(1)}" rx="4" fill="${col}"/>` +
      `<text x="${(x + bw / 2).toFixed(1)}" y="${(Y(Math.max(v, 0)) - 8).toFixed(1)}" text-anchor="middle" class="axis-label" fill="var(--text-primary)" style="paint-order:stroke;stroke:var(--surface-card);stroke-width:4px;stroke-linejoin:round">${formatV(v)}</text>` +
      `<text x="${(x + bw / 2).toFixed(1)}" y="${h - 6}" text-anchor="middle" class="axis-label">${labels[i]}</text>`;
  });
  return svgEl(w, h, out) + `<div class="chart-tip" data-generic hidden></div>`;
}

/* Batang horizontal (skor sentimen -1 sampai +1 dengan garis tengah). */
function scoreMeter({ w = 320, value }) {
  const mid = w / 2, x = mid + (value / 1) * (w / 2 - 8);
  const col = value >= 0.15 ? "var(--market-up)" : value <= -0.15 ? "var(--market-down)" : "var(--market-flat)";
  /* G1: tooltip hover — dibungkus span berposisi relatif agar .chart-tip
     punya acuan posisi (dipakai di kartu Layar 4 dan baris Layar 8). */
  const label = value >= 0.15 ? "Cenderung positif" : value <= -0.15 ? "Cenderung negatif" : "Netral";
  const signed = (value >= 0 ? "+" : "") + value.toFixed(2);
  const tip = `<div class="tip-title">Skor sentimen</div><div class="tip-row">${signed} &middot; ${label}</div>`;
  return `<span class="chart-wrap-inline">` + svgEl(w, 24,
    `<line x1="0" y1="12" x2="${w}" y2="12" stroke="var(--border-default)" stroke-width="4" stroke-linecap="round"/>` +
    `<line x1="${mid}" y1="4" x2="${mid}" y2="20" stroke="var(--border-strong)" stroke-width="1"/>` +
    `<circle cx="${x.toFixed(1)}" cy="12" r="7" fill="${col}"/>`, ` data-tip="${escAttr(tip)}"`) +
    `<div class="chart-tip" data-generic hidden></div></span>`;
}

/* Candlestick + garis MA dan support/resistance. */
function candleChart({ w = 1024, h = 200, ohlc, maFast = [], maSlow = [], ma50 = [], ma200 = [], support, resistance, lo, hi }) {
  /* Kontrak data (klarifikasi koordinator): ohlc berisi OBJEK {o,h,l,c}
     (200 candle deterministik dari Worker A); array [o,h,l,c] lama tetap
     didukung sebagai fallback. MA diterima sebagai ma50/ma200 terpisah,
     dengan maFast/maSlow sebagai fallback kompatibilitas. */
  /* G2: viewBox dinormalisasi di dalam fungsi (pemanggil di sDetail tidak
     diubah): 1024×200 (~5,1:1, plot FigCraft ~1012×~200). */
  w = 1024; h = 200;
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
  // Candles — data bisa berbentuk array [o,h,l,c] (lama) atau objek
  // {o,h,l,c} (format baru dari worker lain). Field yang tidak ada
  // dilewati: candle tetap dapat di-hover dengan nilai yang tersedia,
  // dan fungsi tidak pernah crash karena format data.
  const slot = (w - padL - padR) / ohlc.length;
  ohlc.forEach((c, i) => {
    const o = c.o !== undefined ? c.o : c[0];
    const hh = c.h !== undefined ? c.h : c[1];
    const l = c.l !== undefined ? c.l : c[2];
    const cl = c.c !== undefined ? c.c : c[3];
    const x = X(i);
    if ([o, hh, l, cl].every((v) => Number.isFinite(v))) {
      const up = cl >= o, col = up ? "var(--market-up)" : "var(--market-down)";
      out += `<line x1="${x}" y1="${Y(hh)}" x2="${x}" y2="${Y(l)}" stroke="${col}" stroke-width="1.5"/>` +
        `<rect x="${(x - bw / 2).toFixed(1)}" y="${Y(Math.max(o, cl)).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(1, Math.abs(Y(o) - Y(cl))).toFixed(1)}" fill="${col}"/>`;
    }
    /* G1: area hover transparan per candle + tooltip OHLC. */
    const tipRows = [["Buka", o], ["Tertinggi", hh], ["Terendah", l], ["Tutup", cl]]
      .filter(([, v]) => Number.isFinite(v))
      .map(([k, v]) => `<div class="tip-row">${k} <b>${fmtRp(v)}</b></div>`).join("");
    out += `<rect class="cd-hit" data-tip="${escAttr(`<div class="tip-title">Candle ${i + 1}</div>${tipRows}`)}" x="${(x - slot / 2).toFixed(1)}" y="${padT}" width="${slot.toFixed(1)}" height="${(h - padB - padT).toFixed(1)}" fill="transparent"/>`;
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
  const maF = ma50.length ? ma50 : maFast;
  const maS = ma200.length ? ma200 : maSlow;
  out += line(maF, "var(--chart-5)") + line(maS, "var(--chart-4)");
  return svgEl(w, h, out) + `<div class="chart-tip" data-generic hidden></div>`;
}

/* Grafik garis multi-seri (tren tim). Titik di tiap bulan + data untuk tooltip hover. */
function multiLine({ w = 1024, h = 180, series, labels, names = [], ymin = 60, ymax = 115 }) {
  /* G2: viewBox dinormalisasi di dalam fungsi (pemanggil di sTim tidak
     diubah): 1024×180 (~5,7:1, plot FigCraft 1024×~170). Handler tooltip
     di app.js membaca lebar dari viewBox, bukan hardcoded 640. */
  w = 1024; h = 180;
  const padL = 40, padB = 22, padT = 10, padR = 8;
  const X = (i) => padL + (i / (labels.length - 1)) * (w - padL - padR);
  const Y = (v) => padT + (1 - (v - ymin) / (ymax - ymin)) * (h - padB - padT);
  let out = "";
  [60, 80, 100, 115].forEach((gv) => {
    out += `<line x1="${padL}" y1="${Y(gv)}" x2="${w - padR}" y2="${Y(gv)}" stroke="var(--border-default)" stroke-width="1"/>` +
      `<text x="${padL - 6}" y="${Y(gv) + 4}" text-anchor="end" class="axis-label">${gv}%</text>`;
  });
  out += `<line class="ml-guide" x1="${X(0)}" y1="${padT}" x2="${X(0)}" y2="${h - padB}" stroke="var(--border-strong)" stroke-width="1" stroke-dasharray="3 3" visibility="hidden"/>`;
  series.forEach((s, si) => {
    const pts = s.values.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(" ");
    out += `<polyline points="${pts}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round"/>`;
    s.values.forEach((v, i) => {
      out += `<circle class="ml-dot" data-i="${i}" data-s="${si}" cx="${X(i).toFixed(1)}" cy="${Y(v).toFixed(1)}" r="3" fill="${s.color}" stroke="var(--surface-card)" stroke-width="1.5"/>`;
    });
  });
  labels.forEach((lb, i) => {
    out += `<text x="${X(i)}" y="${h - 4}" text-anchor="middle" class="axis-label">${lb}</text>`;
  });
  const dataAttrs = ` class="ml-chart" data-labels="${escAttr(JSON.stringify(labels))}" data-names="${escAttr(JSON.stringify(names))}" data-series="${escAttr(JSON.stringify(series.map((s) => s.values)))}" data-colors="${escAttr(JSON.stringify(series.map((s) => s.color)))}"`;
  return svgEl(w, h, out, dataAttrs) + `<div class="chart-tip" hidden></div>`;
}
