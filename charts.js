/* charts.js — Grafik D3.js v7 (migrasi dari library chart lama; ini
   satu-satunya penyebutan nama library lama di file ini).
   ------------------------------------------------------------------
   KONTRAK API (dipakai app.js — nama fungsi + signature SAMA seperti
   versi lama; integrator TIDAK berubah):
   - Setiap fungsi mengembalikan string HTML berisi SVG INLINE di dalam
     `.chart-wrap` (scoreMeter: `<span class="chart-wrap-inline">`).
     SVG: width="100%" height="100%", viewBox="0 0 W H",
     preserveAspectRatio="none" (meregang ke lebar container, seperti
     perilaku canvas dulu) — KECUALI areaChart dengan opsi `uniform: true`
     (grafik Histori): wrapper memakai aspect-ratio viewBox dan
     preserveAspectRatio="xMidYMid meet" supaya teks TIDAK terdistorsi
     saat container lebih lebar/sempit dari viewBox (temuan responsif
     2026-11-07: label sumbu-X melebar saat fullscreen). Garis
     grid/sumbu memakai vector-effect="non-scaling-stroke" supaya
     tebalnya stabil.
   - Warna diambil dari CSS variables SAAT fungsi dipanggil (helper
     cssVar / themeColors) — jadi setelah ganti tema, integrator WAJIB
     me-render ulang layar (render() sudah memanggil destroyCharts()
     sebelum render dan mountCharts() sesudahnya).
   - queueChart(id, config): no-op (dipertahankan supaya app.js yang
     memanggilnya tidak perlu diubah; D3 dirender langsung jadi string,
     tidak ada antrean instance).
   - mountCharts(): memasang SATU delegated tooltip listener (idempotent,
     guard flag) dan mengembalikan 0. destroyCharts(): menyembunyikan
     tooltip. Keduanya aman dipanggil berulang kali.
   - Tooltip: SATU div bersama #d3Tip; tiap elemen interaktif membawa
     atribut data-tip (isi HTML, baris dipisah <br>); listener
     mouseover/mousemove/mouseout terdelegasi di document.
   - Sizing: tinggi wrapper mengikuti proporsi FigCraft (Histori 235px,
     Arus Kas/NPV/Tren 180px, Candle 200px, Tim sempit 160px).

   DEPENDENSI (di-vendor, di-load SEBELUM charts.js di index.html):
   - D3.js v7 UMD -> global `d3` (scale, line, area, arc, pie saja;
     tidak ada seleksi DOM — string SVG dibangun manual).
   Bila `d3` belum ter-load saat fungsi chart dipanggil, fungsi melempar
   ReferenceError yang jelas (tidak diam-diam mengembalikan string kosong).

   ANGKA/DATA: file ini hanya me-render; tidak ada angka yang diubah.
   fmtRp/fmtNum adalah global dari data.js (di-load sebelum charts.js).
*/
"use strict";

function escAttr(s) { return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;"); }
function escHtml(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

const FONT = "Geist, Inter, system-ui, sans-serif";
/* Pembulatan koordinat supaya string SVG tetap pendek. */
const r2 = (v) => Math.round(v * 100) / 100;
/* Perkiraan lebar teks (px) pada font 11px — dipakai untuk margin kiri
   sumbu-Y dan lebar chip label target (tanpa DOM tidak ada measureText). */
const measureW = (s) => String(s).length * 6.2 + 10;

/* ---------- Registry (dulu antrean library lama; kini no-op) ---------- */
let __chartSeq = 0;
function nextId() { return "c-" + (++__chartSeq); }
/* No-op: D3 dirender langsung jadi string SVG; app.js tetap boleh
   memanggil queueChart() seperti dulu. */
function queueChart(id, config) { /* sengaja kosong */ }

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

/* Warna teks di atas sel heatmap: latar terang -> teks primer, latar
   gelap -> putih (port dari plugin heatmap versi lama). */
function textOnCell(bg, t) {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(bg || "");
  if (!m) return "#FFFFFF";
  const lum = (0.2126 * +m[1] + 0.7152 * +m[2] + 0.0722 * +m[3]) / 255;
  return lum > 0.6 ? t.textPrimary : "#FFFFFF";
}

/* Angka bertanda dengan koma desimal Indonesia, mis. "+0,58" / "−0,44". */
function signedNum(v, dec = 2) {
  const s = (typeof fmtNum === "function" ? fmtNum(v, dec) : String(v)).replace(/^-/, "−");
  return (v >= 0 ? "+" : "") + s;
}
function fmtRpSafe(v) { return (typeof fmtRp === "function" ? fmtRp(v) : String(v)); }
function fmtNumSafe(v, d) { return (typeof fmtNum === "function" ? fmtNum(v, d) : String(v)); }

/* ---------- Tooltip bersama (pengganti tooltip native) ---------- */
/* SATU div #d3Tip + SATU delegated listener di document. Tiap elemen
   interaktif membawa data-tip (HTML, baris dipisah <br>). mountCharts()
   memasang listener secara idempotent; destroyCharts() menyembunyikan
   tooltip. */
let __tipInstalled = false;
let __tipEl = null;

function ensureTooltip() {
  if (typeof document === "undefined") return null;
  try {
    if (__tipEl && document.body && typeof document.body.contains === "function" && document.body.contains(__tipEl)) return __tipEl;
    const ex = (typeof document.getElementById === "function") ? document.getElementById("d3Tip") : null;
    if (ex) { __tipEl = ex; return ex; }
    const div = document.createElement("div");
    div.id = "d3Tip";
    div.className = "d3-tip";
    div.setAttribute("style", "position:fixed;left:0;top:0;z-index:9999;pointer-events:none;display:none;max-width:280px;padding:8px 10px;font:12px/1.5 Geist,Inter,system-ui,sans-serif;background:var(--surface-raised,#F0F3F9);color:var(--text-secondary,#475569);border:1px solid var(--border-strong,#C5CFE0);border-radius:8px;box-shadow:0 4px 16px rgba(15,23,42,.18);");
    if (document.body) document.body.appendChild(div);
    __tipEl = div;
    return div;
  } catch (e) { return null; }
}

function __tipPos(x, y) {
  const tip = ensureTooltip();
  if (!tip) return;
  let w = 0, h = 0;
  try { w = tip.offsetWidth || 0; h = tip.offsetHeight || 0; } catch (e) { /* abaikan */ }
  const vw = (typeof window !== "undefined" && window.innerWidth) || 1024;
  const vh = (typeof window !== "undefined" && window.innerHeight) || 768;
  let left = x + 12, top = y + 12;
  if (w && left + w > vw - 8) left = Math.max(8, x - w - 12);
  if (h && top + h > vh - 8) top = Math.max(8, y - h - 12);
  tip.style.left = left + "px";
  tip.style.top = top + "px";
}

function __tipShow(html, x, y) {
  const tip = ensureTooltip();
  if (!tip) return;
  tip.innerHTML = html;
  tip.style.display = "block";
  __tipPos(x, y);
}

function __tipHide() {
  if (__tipEl) { try { __tipEl.style.display = "none"; } catch (e) { /* abaikan */ } }
}

function __tipTarget(e) {
  const el = e && e.target;
  if (!el || typeof el.closest !== "function") return null;
  try { return el.closest("[data-tip]"); } catch (err) { return null; }
}

function installTipListeners() {
  if (__tipInstalled) return;
  if (typeof document === "undefined" || typeof document.addEventListener !== "function") return;
  __tipInstalled = true;
  document.addEventListener("mouseover", (e) => {
    const el = __tipTarget(e);
    if (!el) return;
    __tipShow(el.getAttribute("data-tip") || "", e.clientX || 0, e.clientY || 0);
  });
  document.addEventListener("mousemove", (e) => {
    if (!__tipEl || __tipEl.style.display === "none") return;
    __tipPos(e.clientX || 0, e.clientY || 0);
  });
  document.addEventListener("mouseout", (e) => {
    const rel = e && e.relatedTarget;
    if (rel && typeof rel.closest === "function") {
      try { if (rel.closest("[data-tip]")) return; } catch (err) { /* abaikan */ }
    }
    __tipHide();
  });
}

/* Pasang tooltip terdelegasi (idempotent). Tidak ada lagi instance chart
   untuk di-mount — string SVG sudah ada di DOM sejak render(). */
function mountCharts() { installTipListeners(); return 0; }

/* Sembunyikan tooltip (dipanggil sebelum render ulang layar). */
function destroyCharts() { __tipHide(); }

/* ---------- Pembungkus SVG ---------- */
/* fit "none" (default): wrapper tinggi tetap H px, SVG meregang ke lebar
   container (perilaku lama, seperti canvas dulu) — teks ikut meregang
   bila aspek container ≠ aspek viewBox. fit "meet": wrapper mengikuti
   aspek viewBox (aspect-ratio), SVG diskala seragam — teks TIDAK
   terdistorsi di layar lebar/sempit. Dipakai grafik Histori (temuan
   responsif 2026-11-07: label sumbu-X melebar saat fullscreen). */
/* svgWrap: SEMUA grafik skala seragam (meet + aspect-ratio) secara default.
   Dulu default-nya "none" (preserveAspectRatio="none") sehingga isi SVG
   ditarik mengikuti wadah: bila lebar wadah ≠ aspek viewBox, teks sumbu
   jadi ketarik horizontal (temuan 2026-11-07: label "NPV per Skema" dan
   "Arus Kas Kumulatif" di layar Proyek). Dengan "meet", teks tidak pernah
   distorsi; tinggi wadah mengikuti aspek viewBox. */
function svgWrap(inner, W, H, extra = "", fit = "meet") {
  if (fit === "meet") {
    return `<div class="chart-wrap" style="position:relative;aspect-ratio:${W}/${H};${extra}"><svg width="100%" height="100%" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img">${inner}</svg></div>`;
  }
  return `<div class="chart-wrap" style="position:relative;height:${H}px;${extra}"><svg width="100%" height="100%" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img">${inner}</svg></div>`;
}

/* Garis grid horizontal + label sumbu-Y. ys = nilai data, y = scale. */
function yGridAndLabels(t, y, tickVals, fmtTick, x0, x1, labelX) {
  let s = "";
  tickVals.forEach((v) => {
    const yy = r2(y(v));
    s += `<line x1="${r2(x0)}" y1="${yy}" x2="${r2(x1)}" y2="${yy}" stroke="${t.borderDefault}" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
    s += `<text x="${r2(labelX)}" y="${r2(yy + 4)}" text-anchor="end" font-size="11" fill="${t.textMuted}" font-family="${FONT}">${escHtml(fmtTick(v))}</text>`;
  });
  return s;
}

/* Margin kiri dinamis dari label tick sumbu-Y terpanjang (versi lama
   mengukur otomatis; di sini diperkirakan 6.2px/karakter pada font 11px). */
function leftMargin(tickLabels) {
  return Math.min(96, Math.max(40, ...tickLabels.map((s) => measureW(s))));
}

/* ---------- Grafik area (histori portofolio / arus kas kumulatif) ---------- */
/* Tinggi mengikuti normalisasi lama: Histori 235px, Arus Kas ("cum") 180px. */
function areaChart({ w = 1024, h = 180, values, labels, ymin, ymax, color = "var(--chart-1)", formatY = (v) => v, id = "g" }) {
  const t = themeColors();
  const col = resolveColor(color, t.chart1);
  const H = id === "cum" ? 180 : 235;
  const W = w;
  const n = values.length;
  const lo = ymin !== undefined ? ymin : Math.min(...values) * 0.98;
  const hi = ymax !== undefined ? ymax : Math.max(...values) * 1.02;
  const labs = labels && labels.length ? labels.slice() : values.map((_, i) => String(i + 1));
  const yTicks = d3.scaleLinear().domain([lo, hi]).range([0, 1]).ticks(5);
  const M = { t: 10, r: 10, b: 24, l: leftMargin(yTicks.map((v) => formatY(v))) };
  const iw = W - M.l - M.r, ih = H - M.t - M.b;
  const x = d3.scalePoint().domain(d3.range(n)).range([M.l, M.l + iw]).padding(0.05);
  const y = d3.scaleLinear().domain([lo, hi]).range([M.t + ih, M.t]);
  const gid = nextId();
  const line = d3.line().x((_, i) => x(i)).y((v) => y(v));
  const area = d3.area().x((_, i) => x(i)).y0(M.t + ih).y1((v) => y(v));
  const step = Math.max(1, Math.ceil(n / 6));
  let s = `<defs><linearGradient id="ag-${gid}" x1="0" y1="0" x2="0" y2="1">`
    + `<stop offset="0%" stop-color="${escAttr(col)}" stop-opacity="0.28"/>`
    + `<stop offset="100%" stop-color="${escAttr(col)}" stop-opacity="0.02"/>`
    + `</linearGradient></defs>`;
  s += yGridAndLabels(t, y, yTicks, formatY, M.l, M.l + iw, M.l - 6);
  d3.range(0, n, step).forEach((i) => {
    s += `<text x="${r2(x(i))}" y="${H - 6}" text-anchor="middle" font-size="11" fill="${t.textMuted}" font-family="${FONT}">${escHtml(labs[i])}</text>`;
  });
  s += `<path d="${area(values)}" fill="url(#ag-${gid})"/>`;
  s += `<path d="${line(values)}" fill="none" stroke="${escAttr(col)}" stroke-width="2" vector-effect="non-scaling-stroke"/>`;
  /* Titik hover tak terlihat di tiap titik (tooltip) + titik nyata r=4
     hanya di titik terakhir, seperti dulu. */
  values.forEach((v, i) => {
    const tip = `${labs[i]}: ${formatY(v)}`;
    s += `<circle cx="${r2(x(i))}" cy="${r2(y(v))}" r="10" fill="transparent" data-tip="${escAttr(tip)}"/>`;
  });
  s += `<circle cx="${r2(x(n - 1))}" cy="${r2(y(values[n - 1]))}" r="4" fill="${escAttr(col)}" data-tip="${escAttr(`${labs[n - 1]}: ${formatY(values[n - 1])}`)}"/>`;
  return svgWrap(s, W, H, "");
}

/* ---------- Donat ---------- */
/* center (opsional): {title, sub} atau array baris teks (string atau
   {text, bold}). */
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
  const S = size;
  const total = segments.reduce((a, s) => a + s.value, 0) || 1;
  const cx = S / 2, cy = S / 2;
  const outer = S / 2 - 1;
  const inner = Math.max(0, outer - thick);
  const data = segments
    .map((s, i) => ({ label: s.label || `Segmen ${i + 1}`, value: s.value, color: resolveColor(s.color, t.chart1) }))
    .filter((s) => s.value > 0); /* segmen 0 dilewati (hindari NaN) */
  const pie = d3.pie().value((d) => d.value).sort(null).padAngle(0.02);
  const arc = d3.arc().innerRadius(inner).outerRadius(outer).cornerRadius(4);
  let s = pie(data).map((a) => {
    const pct = Math.round((a.data.value / total) * 100);
    return `<path d="${arc(a)}" fill="${escAttr(a.data.color)}" data-tip="${escAttr(`${a.data.label}: ${a.data.value} (${pct}%)`)}"/>`;
  }).join("");
  const lines = normalizeCenter(center);
  const heights = lines.map((ln) => (ln.bold ? 26 : 18));
  const totalH = heights.reduce((a, b) => a + b, 0);
  let yy = cy - totalH / 2;
  lines.forEach((ln, i) => {
    const y = yy + heights[i] / 2;
    yy += heights[i];
    s += `<text x="${r2(cx)}" y="${r2(y)}" text-anchor="middle" dominant-baseline="central" font-size="${ln.bold ? 20 : 12}" font-weight="${ln.bold ? 700 : 400}" fill="${ln.bold ? t.textPrimary : t.textMuted}" font-family="${FONT}">${escHtml(ln.text)}</text>`;
  });
  return svgWrap(s, S, S, `width:${S}px;`);
}

/* ---------- Batang vertikal (NPV per skema, capaian tim) ---------- */
/* Label nilai di atas tiap batang (jarak 4px), KECUALI bila garis target
   memotong kotak hurufnya atau label terpotong tepi atas — maka pindah
   ke DALAM batang (teks putih). Garis target putus-putus + label di atas
   CHIP latar solid (chip menutup segmen garis di belakang teks). Bila
   target > nilai maks, skala-Y diperluas supaya garis tetap terlihat.
   Headroom 20% di atas nilai maks dipertahankan dari perbaikan terakhir. */
function vBars({ w = 1024, h = 180, values, labels, colors, formatV = (v) => v, baselineZero = true, target, targetLabel }) {
  const t = themeColors();
  const H = w >= 500 ? 180 : 160;
  const W = w;
  const maxV = Math.max(...values, 0, target !== undefined ? target : -Infinity);
  const minV = baselineZero ? 0 : Math.min(...values, 0);
  const yMax = (maxV === minV ? minV + 1 : maxV) * 1.2;
  const yTickVals = d3.scaleLinear().domain([minV, yMax]).range([0, 1]).ticks(5);
  const M = { t: 12, r: 10, b: 24, l: leftMargin(yTickVals.map((v) => formatV(v))) };
  const iw = W - M.l - M.r, ih = H - M.t - M.b;
  const top = M.t, bottom = M.t + ih, right = M.l + iw;
  const x = d3.scaleBand().domain(d3.range(values.length)).range([M.l, right]).paddingInner(0.4).paddingOuter(0.2);
  const y = d3.scaleLinear().domain([minV, yMax]).range([bottom, top]);
  const y0 = y(0);
  const targetY = target !== undefined ? y(target) : null;
  let s = yGridAndLabels(t, y, yTickVals, formatV, M.l, right, M.l - 6);
  labels.forEach((lb, i) => {
    s += `<text x="${r2(x(i) + x.bandwidth() / 2)}" y="${H - 6}" text-anchor="middle" font-size="11" fill="${t.textMuted}" font-family="${FONT}">${escHtml(lb)}</text>`;
  });
  /* Batang: lebar kategori ~60% x 90% (seperti dulu), maks 24px, rx 4. */
  values.forEach((v, i) => {
    const bw = Math.min(x.bandwidth() * 0.9, 24);
    const bx = x(i) + (x.bandwidth() - bw) / 2;
    const by = v >= 0 ? y(v) : y0;
    const bh = Math.abs(y(v) - y0);
    const col = resolveColor(colors ? colors[i] : "var(--chart-1)", t.chart1);
    s += `<rect x="${r2(bx)}" y="${r2(by)}" width="${r2(bw)}" height="${r2(bh)}" rx="4" fill="${escAttr(col)}" data-tip="${escAttr(`${labels[i]}: ${formatV(v)}`)}"/>`;
  });
  /* Garis target (setelah batang, sebelum chip/label nilai). */
  if (target !== undefined && targetY >= top && targetY <= bottom) {
    const label = targetLabel || ("Target " + formatV(target));
    const tw = label.length * 6.2;
    const ly = Math.max(top + 12, targetY - 6);
    s += `<line x1="${r2(M.l)}" y1="${r2(targetY)}" x2="${r2(right)}" y2="${r2(targetY)}" stroke="${t.warning}" stroke-width="1.5" stroke-dasharray="5 4" vector-effect="non-scaling-stroke"/>`;
    s += `<rect x="${r2(right - 2 - tw - 8)}" y="${r2(ly - 13)}" width="${r2(tw + 12)}" height="17" rx="2" fill="${t.surfaceCard}"/>`;
    s += `<text x="${r2(right - 2)}" y="${r2(ly)}" text-anchor="end" font-size="11" fill="${t.warning}" font-family="${FONT}">${escHtml(label)}</text>`;
  }
  /* Label nilai (setelah garis target supaya tidak tertutup chip). */
  values.forEach((v, i) => {
    const cx = x(i) + x.bandwidth() / 2;
    const text = formatV(v);
    if (v >= 0) {
      const barY = y(v);
      const emTop = barY - 15, emBottom = barY - 4;
      const hitsTarget = targetY !== null && targetY >= emTop + 1 && targetY <= emBottom;
      const clipsTop = emTop < top + 1;
      if (hitsTarget || clipsTop) {
        s += `<text x="${r2(cx)}" y="${r2(barY + 6)}" text-anchor="middle" dominant-baseline="hanging" font-size="11" fill="#FFFFFF" font-family="${FONT}">${escHtml(text)}</text>`;
      } else {
        s += `<text x="${r2(cx)}" y="${r2(emBottom)}" text-anchor="middle" font-size="11" fill="${t.textPrimary}" stroke="${t.surfaceCard}" stroke-width="4" paint-order="stroke" font-family="${FONT}">${escHtml(text)}</text>`;
      }
    } else {
      const barBase = y(v);
      s += `<text x="${r2(cx)}" y="${r2(barBase + 6)}" text-anchor="middle" dominant-baseline="hanging" font-size="11" fill="${t.textPrimary}" stroke="${t.surfaceCard}" stroke-width="4" paint-order="stroke" font-family="${FONT}">${escHtml(text)}</text>`;
    }
  });
  return svgWrap(s, W, H);
}

/* ---------- Gauge skor sentimen (-1 s.d. +1) ---------- */
/* Setengah lingkaran atas (busur 180° dari kiri ke kanan lewat atas),
   track + busur nilai; teks nilai + label di dalam busur. */
function scoreMeter({ w = 320, value }) {
  const t = themeColors();
  const W = w, H = Math.round(w / 2);
  const frac = Math.max(0, Math.min(1, (value + 1) / 2));
  const col = value >= 0.15 ? t.up : value <= -0.15 ? t.down : t.flat;
  const label = value >= 0.15 ? "Cenderung positif" : value <= -0.15 ? "Cenderung negatif" : "Netral";
  const signed = signedNum(value, 2);
  const cx = W / 2, cy = H;
  const outer = H - 2, inner = outer * 0.7; /* cutout ~70% */
  const arc = d3.arc().innerRadius(inner).outerRadius(outer);
  const track = arc({ startAngle: -Math.PI / 2, endAngle: Math.PI / 2 });
  const tip = `Skor sentimen<br>${signed} · ${label}`;
  let s = `<path d="${track}" fill="${t.borderDefault}" data-tip="${escAttr(tip)}"/>`;
  if (frac > 0) {
    const val = arc({ startAngle: -Math.PI / 2, endAngle: -Math.PI / 2 + frac * Math.PI });
    s += `<path d="${val}" fill="${col}" data-tip="${escAttr(tip)}"/>`;
  }
  s += `<text x="${r2(cx)}" y="${r2(cy - 30)}" text-anchor="middle" font-size="20" font-weight="700" fill="${t.textPrimary}" font-family="${FONT}">${escHtml(signed)}</text>`;
  s += `<text x="${r2(cx)}" y="${r2(cy - 10)}" text-anchor="middle" font-size="12" fill="${t.textMuted}" font-family="${FONT}">${escHtml(label)}</text>`;
  return `<span class="chart-wrap-inline" style="position:relative;display:inline-block;width:${W}px;height:${H}px"><svg width="100%" height="100%" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img">${s}</svg></span>`;
}

/* ---------- Candlestick + MA 50/200 + support/resistance ---------- */
/* Sumbu-x: label "1".."N" (data ohlc tidak punya tanggal). MA 50/200
   sebagai polyline 1.5px (nilai null memutus garis). Support/resistance:
   garis putus-putus [4,4] + label teks rata kanan, HANYA bila y dalam
   chart (y >= top+10 dan y <= bottom). */
function candleChart({ w = 1024, h = 200, ohlc, maFast = [], maSlow = [], ma50 = [], ma200 = [], support, resistance, lo, hi }) {
  const t = themeColors();
  const W = w, H = 200;
  const norm = ohlc.map((c, i) => {
    const o = c.o !== undefined ? c.o : c[0];
    const hh = c.h !== undefined ? c.h : c[1];
    const l = c.l !== undefined ? c.l : c[2];
    const cl = c.c !== undefined ? c.c : c[3];
    return { x: i, o, h: hh, l, c: cl };
  });
  const maF = ma50.length ? ma50 : maFast;
  const maS = ma200.length ? ma200 : maSlow;
  const N = norm.length;
  const fmt = (v) => fmtRpSafe(v);
  const yTickVals = d3.scaleLinear().domain([lo, hi]).range([0, 1]).ticks(5);
  const M = { t: 10, r: 10, b: 24, l: leftMargin(yTickVals.map((v) => "Rp " + fmtNumSafe(v))) };
  const iw = W - M.l - M.r, ih = H - M.t - M.b;
  const top = M.t, bottom = M.t + ih, right = M.l + iw;
  const x = d3.scaleBand().domain(d3.range(N)).range([M.l, right]).paddingInner(0.15);
  const y = d3.scaleLinear().domain([lo, hi]).range([bottom, top]);
  const bw = Math.min(x.bandwidth() * 0.7, 16);
  let s = yGridAndLabels(t, y, yTickVals, (v) => "Rp " + fmtNumSafe(v), M.l, right, M.l - 6);
  const xStep = Math.max(1, Math.ceil(N / 8));
  d3.range(0, N, xStep).forEach((i) => {
    s += `<text x="${r2(x(i) + x.bandwidth() / 2)}" y="${H - 6}" text-anchor="middle" font-size="11" fill="${t.textMuted}" font-family="${FONT}">${i + 1}</text>`;
  });
  /* Candle: wick + body, tooltip OHLC (+ MA / Support / Resistance). */
  norm.forEach((d, i) => {
    const cx = x(i) + x.bandwidth() / 2;
    const up = d.c >= d.o;
    const col = up ? t.up : t.down;
    const yO = y(d.o), yC = y(d.c);
    const bodyTop = Math.min(yO, yC);
    const bodyH = Math.max(1, Math.abs(yC - yO));
    const lines = [`Candle ${i + 1}`, `Buka ${fmt(d.o)}`, `Tertinggi ${fmt(d.h)}`, `Terendah ${fmt(d.l)}`, `Tutup ${fmt(d.c)}`];
    const m50 = maF[i], m200 = maS[i];
    if (m50 !== null && m50 !== undefined) lines.push(`MA 50 ${fmt(m50)}`);
    if (m200 !== null && m200 !== undefined) lines.push(`MA 200 ${fmt(m200)}`);
    if (support !== undefined) lines.push(`Support ${fmt(support)}`);
    if (resistance !== undefined) lines.push(`Resistance ${fmt(resistance)}`);
    s += `<g data-tip="${escAttr(lines.join("<br>"))}">`
      + `<line x1="${r2(cx)}" y1="${r2(y(d.h))}" x2="${r2(cx)}" y2="${r2(y(d.l))}" stroke="${col}" stroke-width="1" vector-effect="non-scaling-stroke"/>`
      + `<rect x="${r2(cx - bw / 2)}" y="${r2(bodyTop)}" width="${r2(bw)}" height="${r2(bodyH)}" fill="${col}"/>`
      + `</g>`;
  });
  /* MA 50/200: garis putus bila nilai null (defined). */
  const maLine = (arr, col) => {
    if (!arr || !arr.length) return "";
    const line = d3.line()
      .x((_, i) => x(i) + x.bandwidth() / 2)
      .y((v) => y(v))
      .defined((v) => v !== null && v !== undefined);
    const d = line(arr);
    return d ? `<path d="${d}" fill="none" stroke="${escAttr(col)}" stroke-width="1.5" vector-effect="non-scaling-stroke"/>` : "";
  };
  s += maLine(maF, resolveColor("var(--chart-5)", t.chart5));
  s += maLine(maS, resolveColor("var(--chart-4)", t.chart4));
  /* Support / Resistance: garis + label rata kanan (bila y dalam chart). */
  const sr = (val, text, col) => {
    if (val === undefined || !Number.isFinite(val)) return "";
    const yy = y(val);
    if (yy < top + 10 || yy > bottom) return "";
    return `<line x1="${r2(M.l)}" y1="${r2(yy)}" x2="${r2(right)}" y2="${r2(yy)}" stroke="${col}" stroke-width="1" stroke-dasharray="4 4" vector-effect="non-scaling-stroke"/>`
      + `<text x="${r2(right - 2)}" y="${r2(yy - 4)}" text-anchor="end" font-size="11" fill="${col}" stroke="${t.surfaceCard}" stroke-width="3" paint-order="stroke" font-family="${FONT}">${escHtml(text)}</text>`;
  };
  s += sr(support, "Support " + fmt(support), t.down);
  s += sr(resistance, "Resistance " + fmt(resistance), t.up);
  return svgWrap(s, W, H);
}

/* ---------- Grafik garis multi-seri (tren tim) ---------- */
/* Garis per seri (2px) + titik (r=3) di tiap bulan; tooltip per titik
   menampilkan SEMUA seri pada bulan itu. Legenda tetap HTML di app.js. */
function multiLine({ w = 1024, h = 180, series, labels, names = [], ymin = 60, ymax = 115 }) {
  const t = themeColors();
  const W = w, H = 180;
  const yTicks = d3.scaleLinear().domain([ymin, ymax]).range([0, 1]).ticks(5);
  const M = { t: 10, r: 10, b: 24, l: leftMargin(yTicks.map((v) => v + "%")) };
  const iw = W - M.l - M.r, ih = H - M.t - M.b;
  const x = d3.scalePoint().domain(d3.range(labels.length)).range([M.l, M.l + iw]).padding(0.05);
  const y = d3.scaleLinear().domain([ymin, ymax]).range([M.t + ih, M.t]);
  let s = yGridAndLabels(t, y, yTicks, (v) => v + "%", M.l, M.l + iw, M.l - 6);
  labels.forEach((lb, i) => {
    s += `<text x="${r2(x(i))}" y="${H - 6}" text-anchor="middle" font-size="11" fill="${t.textMuted}" font-family="${FONT}">${escHtml(lb)}</text>`;
  });
  series.forEach((sr, si) => {
    const col = resolveColor(sr.color, t.chart1);
    const line = d3.line().x((_, i) => x(i)).y((v) => y(v));
    s += `<path d="${line(sr.values)}" fill="none" stroke="${escAttr(col)}" stroke-width="2" vector-effect="non-scaling-stroke"/>`;
    sr.values.forEach((v, i) => {
      const tipLines = [labels[i], ...series.map((sj, j) => `${names[j] || `Seri ${j + 1}`}: ${sj.values[i]}%`)];
      s += `<circle cx="${r2(x(i))}" cy="${r2(y(v))}" r="3" fill="${escAttr(col)}" stroke="${t.surfaceCard}" stroke-width="1.5" data-tip="${escAttr(tipLines.join("<br>"))}"/>`;
    });
  });
  return svgWrap(s, W, H);
}

/* ---------- Heatmap DCF (grid 3x3) ---------- */
/* rows = label WACC ["9,5%","10,5%","11,5%"], cols = label terminal
   ["2,5%","3,5%","4,5%"], values = grid 3x3 angka, active = {r,c}.
   PENTING — susunan visual dipertahankan dari versi lama yang sudah
   terverifikasi: baris 0 (WACC 9,5%) di BAWAH, baris 2 (11,5%) di ATAS
   (dulu sumbu-y reverse:true); kolom 0 (2,5%) di KIRI, kolom 2 (4,5%)
   di KANAN. Label kolom di BAWAH grid (dulu sumbu-x di bawah), label
   baris di KIRI. */
function heatmapMatrix({ rows, cols, values, active, formatV }) {
  const t = themeColors();
  const fmt = formatV || ((v) => String(v));
  const W = 480, H = 180;
  const flat = values.flat();
  const minV = Math.min(...flat), maxV = Math.max(...flat);
  const M = { t: 8, r: 8, b: 22, l: 48 };
  const gap = 6;
  const nR = rows.length, nC = cols.length;
  const cw = (W - M.l - M.r - gap * (nC - 1)) / nC;
  const ch = (H - M.t - M.b - gap * (nR - 1)) / nR;
  let s = "";
  rows.forEach((lb, r) => {
    const yy = M.t + (nR - 1 - r) * (ch + gap) + ch / 2;
    s += `<text x="${M.l - 6}" y="${r2(yy)}" text-anchor="end" dominant-baseline="central" font-size="11" fill="${t.textMuted}" font-family="${FONT}">${escHtml(lb)}</text>`;
  });
  cols.forEach((lb, c) => {
    const xx = M.l + c * (cw + gap) + cw / 2;
    s += `<text x="${r2(xx)}" y="${H - 6}" text-anchor="middle" font-size="11" fill="${t.textMuted}" font-family="${FONT}">${escHtml(lb)}</text>`;
  });
  values.forEach((row, r) => row.forEach((v, c) => {
    const xx = M.l + c * (cw + gap);
    const yy = M.t + (nR - 1 - r) * (ch + gap); /* baris 0 di BAWAH */
    const tt = (v - minV) / (maxV - minV || 1);
    const bg = mixHex(t.surfaceCard, t.primary, tt);
    const isAct = !!active && active.r === r && active.c === c;
    const tip = `${rows[r]} × ${cols[c]}: ${fmt(v)}`;
    s += `<rect x="${r2(xx)}" y="${r2(yy)}" width="${r2(cw)}" height="${r2(ch)}" rx="3" fill="${escAttr(bg)}"${isAct ? ` stroke="${t.primary}" stroke-width="2"` : ""} data-tip="${escAttr(tip)}"/>`;
    s += `<text x="${r2(xx + cw / 2)}" y="${r2(yy + ch / 2)}" text-anchor="middle" dominant-baseline="central" font-size="12" font-weight="600" fill="${textOnCell(bg, t)}" font-family="${FONT}">${escHtml(fmt(v))}</text>`;
  }));
  return svgWrap(s, W, H);
}

/* ---------- Batang horizontal divergen (skor sentimen per aset) ---------- */
/* BARU untuk halaman Sentimen: SATU chart batang horizontal, domain x
   [-1, 1], garis nol vertikal di tengah. items diurutkan DESC di dalam
   fungsi. Positif -> kanan (hijau), negatif -> kiri (merah). */
function divergingBars({ items }) {
  const t = themeColors();
  const sorted = items.slice().sort((a, b) => b.value - a.value);
  const rowH = 36, labelW = 52, valueW = 56, topPad = 14;
  const W = 640, H = topPad + Math.max(1, sorted.length) * rowH;
  const x = d3.scaleLinear().domain([-1, 1]).range([labelW + 8, W - valueW]);
  const zero = x(0);
  const up = resolveColor("var(--market-up)", t.up);
  const down = resolveColor("var(--market-down)", t.down);
  let s = `<line x1="${r2(zero)}" y1="0" x2="${r2(zero)}" y2="${H}" stroke="${t.borderStrong}" stroke-width="1" vector-effect="non-scaling-stroke"/>`
    + `<text x="${r2(zero)}" y="10" text-anchor="middle" font-size="10" fill="${t.textMuted}" font-family="${FONT}">0</text>`;
  sorted.forEach((it, i) => {
    const cy = topPad + i * rowH + rowH / 2;
    const bh = 20;
    const bx = it.value >= 0 ? zero : x(it.value);
    const bw = Math.abs(x(it.value) - zero);
    const col = it.value >= 0 ? up : down;
    const signed = signedNum(it.value, 2);
    const tip = `${it.label}: ${signed}`;
    const valX = it.value >= 0 ? x(it.value) + 6 : x(it.value) - 6;
    const anchor = it.value >= 0 ? "start" : "end";
    s += `<g data-tip="${escAttr(tip)}">`
      + `<text x="0" y="${r2(cy)}" dominant-baseline="central" font-size="12" font-weight="600" fill="${t.textPrimary}" font-family="${FONT}">${escHtml(it.label)}</text>`
      + `<rect x="${r2(bx)}" y="${r2(cy - bh / 2)}" width="${r2(Math.max(bw, 1))}" height="${bh}" rx="3" fill="${escAttr(col)}"/>`
      + `<text x="${r2(valX)}" y="${r2(cy)}" text-anchor="${anchor}" dominant-baseline="central" font-size="11" fill="${t.textPrimary}" font-family="${FONT}">${escHtml(signed)}</text>`
      + `</g>`;
  });
  return svgWrap(s, W, H);
}

/* Ekspor untuk pengujian node (tidak berpengaruh di browser). */
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    areaChart, donut, vBars, scoreMeter, candleChart, multiLine,
    heatmapMatrix, divergingBars,
    queueChart, mountCharts, destroyCharts, ensureTooltip,
    cssVar, resolveColor, themeColors, parseHex, hexA, mixHex,
    normalizeCenter, textOnCell, signedNum
  };
}
