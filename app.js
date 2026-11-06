/* app.js — Asisten Analisis Investasi (implementasi HTML dari DESIGN.md).
   Aplikasi statis tanpa build step: buka index.html atau deploy ke GitHub Pages.
   Data contoh dari data.js (berlabel Dummy). Rumus DCF dan proyek dihitung
   langsung di browser; asumsi rumus ditulis terbuka di layar terkait. */
"use strict";

/* ---------- Util ---------- */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const MINUS = "−";

/* ---------- State ---------- */
const state = {
  theme: localStorage.getItem("aai-theme") || "dark",
  appName: localStorage.getItem("aai-name") || "Asisten Analisis Investasi",
  weights: { ...DATA.weights },
  dcf: { growth: DATA.dcf.growth, terminal: DATA.dcf.terminal, wacc: DATA.dcf.wacc },
  project: {
    investasi: DATA.project.investasi, umur: DATA.project.umur,
    arusKas: [...DATA.project.arusKas], pajak: DATA.project.pajak, bunga: DATA.project.bunga
  },
  alerts: DATA.alerts.map((a) => ({ ...a })),
  watchlist: DATA.watchlist.map((w) => ({ ...w })),
  watchTab: "IDX",
  detailTab: "fundamental",
  alertTab: "aktif",
  teamMember: "Semua",
  teamPeriode: "Okt 2026",
  teamUpload: null,
  query: "",
  newsFilter: { aset: "Semua", sentimen: "Semua" },
  sectorFilter: "Semua", scoreFilter: "Semua",
  expandedRank: "BBCA",
  aiOpen: false
};

/* ---------- Toast & modal ---------- */
function toast(msg) {
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = msg;
  $("#toastRoot").appendChild(t);
  setTimeout(() => t.remove(), 3200);
}
function openModal(html) {
  $("#modalRoot").innerHTML = `<div class="modal-backdrop" data-action="modal-backdrop"><div class="modal" role="dialog" aria-modal="true">${html}</div></div>`;
}
function closeModal() { $("#modalRoot").innerHTML = ""; }

/* ---------- Rumus DCF (model Gordon, 5 tahun eksplisit) ---------- */
function dcfIndexValue(g, gt, w) {
  // FCF indeks: tahun 0 = 100, tumbuh g per tahun selama 5 tahun.
  let pv = 0;
  for (let t = 1; t <= 5; t++) pv += (100 * Math.pow(1 + g, t)) / Math.pow(1 + w, t);
  const fcf5 = 100 * Math.pow(1 + g, 5);
  const tv = (fcf5 * (1 + gt)) / (w - gt);
  pv += tv / Math.pow(1 + w, 5);
  return pv;
}
// Kalibrasi: nilai wajar dasar (g=8%, terminal 3,5%, WACC 10,5%) = Rp 10.350.
const DCF_SCALE = DATA.dcf.nilaiWajar / dcfIndexValue(0.08, 0.035, 0.105);
function dcfValue(gPct, gtPct, wPct) {
  return DCF_SCALE * dcfIndexValue(gPct / 100, gtPct / 100, wPct / 100);
}
function dcfProjection(gPct, wPct) {
  const g = gPct / 100, w = wPct / 100, rows = [];
  for (let t = 1; t <= 5; t++) {
    const fcf = 100 * Math.pow(1 + g, t);
    const df = 1 / Math.pow(1 + w, t);
    rows.push({ tahun: t, fcf, df, pv: fcf * df });
  }
  return rows;
}

/* ---------- Rumus proyek ---------- */
function irr(cashflows) {
  // Bisection: NPV(r) = 0.
  let lo = -0.9, hi = 5, flo = npvAt(cashflows, lo);
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2, fm = npvAt(cashflows, mid);
    if (Math.abs(fm) < 0.01) return mid;
    if ((flo > 0) === (fm > 0)) { lo = mid; flo = fm; } else hi = mid;
  }
  return (lo + hi) / 2;
}
function npvAt(cashflows, r) {
  return cashflows.reduce((acc, cf, t) => acc + cf / Math.pow(1 + r, t), 0);
}
function projectMath() {
  const p = state.project;
  const ke = DATA.project.biayaEkuitas / 100, kd = p.bunga / 100, tax = p.pajak / 100;
  const cfs = [-p.investasi, ...p.arusKas.slice(0, p.umur)];
  const irrVal = irr(cfs);
  // Payback (tanpa diskon): interpolasi tahun arus kumulatif melewati nol.
  let kum = -p.investasi, payback = null;
  for (let t = 0; t < p.umur; t++) {
    const prev = kum; kum += p.arusKas[t];
    if (kum >= 0 && payback === null) payback = t + (prev === 0 ? 0 : -prev / p.arusKas[t]);
  }
  const rows = DATA.project.schemes.map((s) => {
    const wD = s.utang / 100, wE = 1 - wD;
    const wacc = wE * ke + wD * kd * (1 - tax);
    const npv = npvAt(cfs, wacc);
    const utangRp = p.investasi * wD;
    // DSCR = arus kas tahun 1 / (bunga tahun 1 + pokok/umur).
    const ds = utangRp * kd + (p.umur > 0 ? utangRp / p.umur : 0);
    const dscr = utangRp > 0 && ds > 0 ? p.arusKas[0] / ds : null;
    return { ...s, wacc: wacc * 100, npv, irr: irrVal * 100, payback, dscr };
  });
  const qualified = rows.filter((r) => r.dscr === null || r.dscr >= 1.3);
  const best = qualified.length ? qualified.reduce((a, b) => (b.npv > a.npv ? b : a)) : null;
  rows.forEach((r, i) => {
    r.rank = r.dscr !== null && r.dscr < 1.3 ? null : qualified.slice().sort((a, b) => b.npv - a.npv).findIndex((x) => x.label === r.label) + 1;
    r.isBest = best && best.label === r.label;
    r.disqualified = r.dscr !== null && r.dscr < 1.3;
  });
  return { rows, best, irr: irrVal * 100, payback, cfs };
}

/* ---------- Router & navigasi ---------- */
const NAV = [
  { route: "ringkasan", label: "Ringkasan", ico: "▦" },
  { route: "watchlist", label: "Watchlist", ico: "★" },
  { route: "analisis", label: "Analisis Saham", ico: "▮▮▮" },
  { route: "dcf", label: "Valuasi DCF", ico: "▤" },
  { route: "proyek", label: "Analisis Proyek", ico: "▢" },
  { route: "alert", label: "Alert Harga", ico: "🔔" },
  { route: "sentimen", label: "Sentimen Berita", ico: "☰" },
  { route: "tim", label: "Modul Tim", ico: "👥" },
  { route: "ai", label: "Panel Asisten AI", ico: "✦" },
  { route: "keadaan", label: "Keadaan Khusus", ico: "◐" },
  { route: "nama", label: "Usulan Nama", ico: "✎" }
];
const TITLES = {
  ringkasan: "Ringkasan Portofolio", watchlist: "Watchlist & Harga Pasar",
  analisis: "Analisis & Pemilihan Saham", detail: "Detail Analisis Saham", dcf: "Valuasi Saham (DCF)",
  proyek: "Analisis Proyek", alert: "Alert Harga", sentimen: "Sentimen Berita",
  tim: "Modul Tim", ai: "Panel Asisten AI", keadaan: "Keadaan Khusus", nama: "Usulan Nama"
};
const BOTTOM = [
  { route: "ringkasan", label: "Ringkasan", ico: "▦" },
  { route: "watchlist", label: "Watchlist", ico: "★" },
  { route: "analisis", label: "Analisis", ico: "▮▮▮" },
  { route: "alert", label: "Alert", ico: "🔔" },
  { route: "lainnya", label: "Lainnya", ico: "⋯" }
];

function currentRoute() {
  const h = location.hash.replace(/^#/, "").split("?")[0];
  const ok = NAV.some((n) => n.route === h) || h === "detail";
  return ok ? h : "ringkasan";
}
function renderNav() {
  const r = currentRoute();
  $("#nav").innerHTML = NAV.map((n) =>
    `<button class="nav-item ${r === n.route ? "active" : ""}" data-route="${n.route}"><span class="ico">${n.ico}</span>${n.label}</button>`
  ).join("");
  $("#bottombar").innerHTML = BOTTOM.map((n) =>
    `<button data-route="${n.route}" class="${r === n.route ? "active" : ""}"><span class="ico">${n.ico}</span>${n.label}</button>`
  ).join("");
}
function render() {
  const r = currentRoute();
  renderNav();
  $("#pageTitle").textContent = TITLES[r] || "Ringkasan Portofolio";
  const brandSub = $("#brandSub");
  if (state.appName === "Asisten Analisis Investasi") {
    $("#brandName").textContent = "Asisten Analisis";
    brandSub.textContent = "Investasi";
    brandSub.style.display = "";
  } else {
    $("#brandName").textContent = state.appName;
    brandSub.textContent = "";
    brandSub.style.display = "none";
  }
  const fn = SCREENS[r] || SCREENS.ringkasan;
  $("#view").innerHTML = fn();
  afterRender(r);
  if (r === "ai") openAI();
  window.scrollTo(0, 0);
}
function go(route) {
  if (route === "lainnya") { openLainnya(); return; }
  if (route === "ai") { openAI(); return; }
  location.hash = "#" + route;
}

/* ---------- Panel Asisten AI ---------- */
const AI_RULES = [
  { k: ["per 22", "per ", "valuasi", "murah", "mahal"], a: "PER 22,4x artinya harga saham 22,4 kali laba per saham setahun. Untuk bank besar seperti BBCA, angka ini di atas rata-rata pasar, jadi sahamnya tidak bisa dibilang murah. Bandingkan dengan PBV 4,1x dan ROE 20,3% untuk gambaran lengkap. Ini bukan nasihat investasi." },
  { k: ["risiko"], a: "Risiko utama BBCA: valuasi sudah tidak murah (PER 22,4x), jadi kabar buruk bisa memukul harga lebih dalam. Risiko lain: perlambatan kredit dan perubahan suku bunga. Sisi baiknya, laba stabil dan biaya dana murah. Ini bukan nasihat investasi." },
  { k: ["banding", "bbri"], a: "BBCA vs BBRI: skor BBCA 82 (Kuat), BBRI 74 (Kuat). BBCA unggul di ROE 20,3% dan tren harga, BBRI unggul di dividen yang konsisten dan valuasi yang masih wajar. Keduanya Layak Diteliti menurut peringkat. Ini bukan nasihat investasi." },
  { k: ["skor", "82"], a: DATA.ai.jawaban },
  { k: ["dcf", "nilai wajar", "10350"], a: "Nilai wajar BBCA Rp 10.350 dihitung dari asumsi pertumbuhan arus kas 8%, pertumbuhan terminal 3,5%, dan WACC 10,5%. Harga pasar Rp 9.725 berada 6,0% di bawah nilai wajar, jadi saham tampak wajar cenderung murah. Ubah asumsi di Layar 5 untuk melihat angkanya berubah. Ini bukan nasihat investasi." },
  { k: ["proyek", "kedai kopi", "skema"], a: "Skema terbaik untuk Kedai Kopi Cabang Bandung adalah 50% utang dan 50% ekuitas: NPV +Rp 228 jt dengan DSCR 1,45x, masih di atas batas aman 1,3x. Skema 70% utang NPV-nya paling tinggi tapi diskualifikasi karena DSCR 1,15x. Lihat Layar 6 untuk perbandingan lengkap." },
  { k: ["goto", "hindari"], a: "GOTO mendapat skor 31 (Lemah) dan rekomendasi Hindari Dulu karena belum stabil mencetak laba. Harganya turun 22,1% dari modal awal portofolio contoh. Ini bukan nasihat investasi." },
  { k: ["halo", "hai", "selamat"], a: "Halo! Saya bisa menjelaskan skor saham, arti PER, risiko, perbandingan saham, valuasi DCF, dan analisis proyek. Silakan tanya, atau ketuk salah satu saran di bawah." }
];
function aiAnswer(q) {
  const s = q.toLowerCase();
  for (const r of AI_RULES) if (r.k.some((k) => s.includes(k))) return r.a;
  return "Saya belum punya jawaban contoh untuk itu. Coba tanya tentang skor BBCA, arti PER, risiko, perbandingan dengan BBRI, valuasi DCF, atau analisis proyek. Ini bukan nasihat investasi.";
}
function aiAddMsg(text, who) {
  const box = $("#aiMessages");
  const d = document.createElement("div");
  d.className = "msg msg-" + who;
  d.textContent = text;
  box.appendChild(d);
  box.scrollTop = box.scrollHeight;
}
function aiAsk(q) {
  if (!q.trim()) return;
  aiAddMsg(q.trim(), "user");
  $("#aiInput").value = "";
  setTimeout(() => aiAddMsg(aiAnswer(q), "ai"), 350);
}
function openAI() {
  state.aiOpen = true;
  $("#aiPanel").hidden = false;
  $("#aiOverlay").hidden = false;
  const ctxRoute = currentRoute() === "ai" ? "detail" : currentRoute();
  $("#aiContext").textContent = "Sedang melihat: " + (TITLES[ctxRoute] || "Ringkasan Portofolio");
  if (!$("#aiMessages").children.length) {
    aiAddMsg(DATA.ai.jawaban, "ai");
    $("#aiChips").innerHTML = DATA.ai.saran.map((s) => `<button class="chip" data-chip="${esc(s)}">${esc(s)}</button>`).join("");
  }
  if (window.innerWidth > 900) $("#aiInput").focus();
}
function closeAI() {
  state.aiOpen = false;
  $("#aiPanel").hidden = true;
  $("#aiOverlay").hidden = true;
}
function openLainnya() {
  const items = NAV.filter((n) => !BOTTOM.some((b) => b.route === n.route));
  openModal(`<h2>Layar lainnya</h2>` + items.map((n) =>
    `<button class="nav-item" data-route="${n.route}" data-action="modal-nav"><span class="ico">${n.ico}</span>${n.label}</button>`
  ).join(""));
}

/* ---------- Komponen kecil ---------- */
function badgeChg(pct) {
  const cls = pct > 0 ? "badge-up" : pct < 0 ? "badge-down" : "badge-neutral";
  return `<span class="badge ${cls}">${fmtPct(pct)}%</span>`;
}
function scoreCell(s) {
  return `<span class="score" style="color:${scoreColor(s)}">${s}</span><span class="score-label">${scoreLabel(s)}</span>`;
}
function disclaimer() {
  return `<p class="small" style="margin-top:24px">Informasi ini bersifat analisis pendukung, bukan nasihat investasi. Keputusan sepenuhnya ada pada Anda.</p>`;
}
function srcTag() {
  return `<span class="badge badge-dummy">Dummy</span>`;
}
function filteredRows(rows, keys) {
  const q = state.query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((r) => keys.some((k) => String(r[k] || "").toLowerCase().includes(q)));
}

/* ---------- Layar 01 — Ringkasan Portofolio ---------- */
function sRingkasan() {
  const p = DATA.portfolio;
  const pos = filteredRows(DATA.positions, ["kode", "nama"]);
  const hist = areaChart({
    w: 640, h: 200, values: p.history.values, labels: p.history.labels,
    ymin: 1100, ymax: 1300, id: "hist",
    formatY: (v) => "Rp " + fmtNum(v / 1000, 2) + " M"
  });
  const alloc = p.allocation;
  const donutSvg = donut({ size: 180, thick: 26, segments: alloc.map((a) => ({ value: a.pct, color: a.color })) });
  const rows = pos.map((r) => `
    <tr class="clickable" data-action="goto-detail" data-kode="${r.kode}">
      <td><strong>${r.kode}</strong><div class="sub">${esc(r.nama)}</div></td>
      <td class="num">${fmtNum(r.jumlah, Number.isInteger(r.jumlah) ? 0 : 2)} ${r.satuan}</td>
      <td class="num">${fmtRp(r.avg)}</td>
      <td class="num">${fmtRp(r.harga)}</td>
      <td class="num">${fmtRp(r.nilai)}</td>
      <td class="num ${r.pnl >= 0 ? "up" : "down"}">${r.pnl >= 0 ? "+" : "−"}${fmtSingkat(Math.abs(r.pnl))}<div class="sub">${fmtPct(r.pnlPct)}%</div></td>
      <td class="num">${fmtNum(r.bobot, 1)}%</td>
    </tr>`).join("");
  return `
  <div class="grid grid-4">
    <div class="card"><div class="kpi-label">Total Nilai</div><div class="kpi-value">${fmtSingkat(p.total)}</div>
      <div class="kpi-sub">${badgeChg(p.profitPct)}<span>modal ${fmtSingkat(p.modal)}</span></div></div>
    <div class="card"><div class="kpi-label">Untung / Rugi</div><div class="kpi-value">+${fmtSingkat(p.profit)}</div>
      <div class="kpi-sub">${badgeChg(p.profitPct)}<span>vs modal awal</span></div></div>
    <div class="card"><div class="kpi-label">Aset Terbaik</div><div class="kpi-value">${p.best.kode}</div>
      <div class="kpi-sub">${badgeChg(p.best.chg)}<span>${esc(p.best.nama)}</span></div></div>
    <div class="card"><div class="kpi-label">Aset Terburuk</div><div class="kpi-value">${p.worst.kode}</div>
      <div class="kpi-sub">${badgeChg(p.worst.chg)}<span>${esc(p.worst.nama)}</span></div></div>
  </div>
  <div class="grid grid-2-1 mt">
    <div class="card">
      <div class="card-head"><h2>Histori Portofolio</h2>${srcTag()}</div>
      <div class="chart-wrap">${hist}</div>
      <div class="card-foot">Sumbu Y mulai Rp 1,10 M, data dummy (seri disintesis).</div>
    </div>
    <div class="card">
      <div class="card-head"><h2>Alokasi per Kelas Aset</h2></div>
      <div class="donut-flex">
        <div class="donut-box">${donutSvg}<div class="donut-center"><strong>${fmtSingkat(p.total)}</strong><span class="small">Total</span></div></div>
        <div class="legend">${alloc.map((a) => `<div class="legend-row"><span class="swatch" style="background:${a.color}"></span>${a.label}<span class="val">${a.pct}%</span></div>`).join("")}</div>
      </div>
      <div class="card-foot">Saham IDX mendominasi &middot; Data dummy</div>
    </div>
  </div>
  <div class="card mt">
    <div class="card-head"><h2>Posisi Portofolio</h2><button class="btn btn-primary btn-small" data-action="toast" data-msg="Tambah posisi belum tersedia di versi contoh.">Tambah Posisi</button></div>
    <table><thead><tr><th>Aset</th><th class="num">Jumlah</th><th class="num">Rata-rata Beli</th><th class="num">Harga Terkini</th><th class="num">Nilai</th><th class="num">Untung/Rugi</th><th class="num">Bobot</th></tr></thead>
    <tbody>${rows || `<tr><td colspan="7" class="muted">Tidak ada posisi yang cocok dengan pencarian.</td></tr>`}</tbody></table>
    <div class="card-foot">Sumber: IDX (tertunda 15 mnt) &middot; ${DATA.meta.updated} &nbsp; <span class="badge badge-delayed">Tertunda 15 mnt</span> ${srcTag()}</div>
  </div>
  <div class="card mt">
    <div class="card-head"><h2>&#10022; Ringkasan AI</h2></div>
    <p style="color:var(--text-primary)">Portofolio naik 11,70% dari modal awal. BBCA menjadi penyumbang keuntungan terbesar, sementara GOTO masih menahan kinerja. Alokasi saham IDX 58% mendominasi. Pertimbangkan diversifikasi bila ingin mengurangi risiko.</p>
  </div>
  ${disclaimer()}`;
}

/* ---------- Layar 02 — Watchlist & Harga Pasar ---------- */
function sWatchlist() {
  const tabs = [["IDX", "Saham IDX"], ["Kripto", "Kripto"], ["Global", "Saham Global"], ["Emas", "Emas"], ["Forex", "Forex"], ["Reksa", "Reksa Dana"]];
  let rows = state.watchlist;
  if (state.watchTab === "IDX") rows = rows.filter((r) => !["BTC", "ETH"].includes(r.kode));
  else if (state.watchTab === "Kripto") rows = rows.filter((r) => ["BTC", "ETH"].includes(r.kode));
  else rows = [];
  rows = filteredRows(rows, ["kode", "nama"]);
  const body = rows.length ? rows.map((r) => {
    const up = r.chgPct >= 0;
    return `<tr class="clickable" data-action="goto-detail" data-kode="${r.kode}">
      <td><strong>${r.kode}</strong><div class="sub">${esc(r.nama)}</div></td>
      <td class="num">${fmtRp(r.harga)}</td>
      <td class="num ${up ? "up" : "down"}">${up ? "+" : "−"}${fmtSingkat(Math.abs(r.chgRp)).replace("Rp ", "Rp ")}</td>
      <td class="num ${up ? "up" : "down"}">${fmtPct(r.chgPct, 2)}%</td>
      <td class="muted">&mdash;</td><td class="muted">&mdash;</td>
      <td>${esc(r.sumber)}</td><td>${r.update}</td>
      <td><button class="icon-btn" data-action="bell" data-kode="${r.kode}" title="Buat alert untuk ${r.kode}" aria-label="Buat alert">&#128276;</button></td>
    </tr>`;
  }).join("") : `<tr><td colspan="9" class="muted">Tab ini berlabel Segera. Data belum tersedia di versi contoh.</td></tr>`;
  return `
  <div class="tabs">${tabs.map(([k, lb]) => `<button class="tab ${state.watchTab === k ? "active" : ""}" data-action="watch-tab" data-tab="${k}">${lb}${(k !== "IDX" && k !== "Kripto") ? '<span class="soon">Segera</span>' : ""}</button>`).join("")}</div>
  <div class="row" style="margin-bottom:16px; flex-wrap:wrap">
    <div class="search-box" style="flex:1; min-width:220px"><span aria-hidden="true">&#128269;</span><input id="watchSearch" type="search" placeholder="Cari kode atau nama&hellip;" value="${esc(state.query)}" aria-label="Cari watchlist"></div>
    <button class="btn btn-primary" data-action="add-watchlist">Tambah ke Watchlist</button>
    <button class="btn btn-ghost" data-action="toast" data-msg="Data diperbarui: ${DATA.meta.updated}.">Segarkan</button>
    <span class="badge badge-delayed">Tertunda 15 mnt</span><span class="small">Data IDX tertunda 15 menit</span>
  </div>
  <div class="card"><table>
    <thead><tr><th>Kode</th><th class="num">Harga</th><th class="num">Perubahan (Rp)</th><th class="num">Perubahan %</th><th>Sparkline 7 hari</th><th>Volume</th><th>Sumber</th><th>Update</th><th>Aksi</th></tr></thead>
    <tbody>${body}</tbody></table>
    <div class="card-foot">Volume dan sparkline 7 hari tidak ada pada data contoh. Harga BTC/ETH memakai format ringkas.</div>
  </div>
  ${disclaimer()}`;
}

/* ---------- Layar 03 — Analisis & Pemilihan Saham ---------- */
function rankTotals() {
  const w = state.weights, d = DATA.weights;
  // Bobot default: pakai total contoh dari DESIGN.md apa adanya (angka
  // contoh tidak persis sama dengan rumus bobot). Bila pengguna mengubah
  // bobot, total dihitung ulang dari rumus bobot.
  if (w.fund === d.fund && w.tekn === d.tekn && w.sent === d.sent)
    return [...DATA.ranking].sort((a, b) => b.total - a.total);
  return DATA.ranking.map((r) => ({
    ...r,
    total: Math.round((w.fund * r.fund + w.tekn * r.tekn + w.sent * r.sent) / 100)
  })).sort((a, b) => b.total - a.total);
}
function reasonCards(r) {
  const b = DATA.bbca;
  const fund = r.kode === "BBCA" ? b.fundReasons : [`Skor fundamental ${r.fund} (${scoreLabel(r.fund)}).`, r.alasan];
  const tekn = r.kode === "BBCA" ? b.teknReasons : [`Skor teknikal ${r.tekn} (${scoreLabel(r.tekn)}).`, "Lihat grafik di Layar 04 untuk tren harga."];
  const sent = r.kode === "BBCA" ? b.sentReasons : [`Skor sentimen ${r.sent} (${scoreLabel(r.sent)}).`, "Lihat berita terkait di Layar 08."];
  const card = (title, score, points) => `<div class="reason"><h3>${title}</h3><div class="reason-score" style="color:${scoreColor(score)}">${score}</div>${points.map((p) => `<p style="margin-bottom:6px">${esc(p)}</p>`).join("")}<button class="btn btn-ghost btn-small" data-action="goto-detail" data-kode="${r.kode}">Lihat detail</button></div>`;
  return `<div class="grid grid-3" style="margin:12px 0 20px">${card("Fundamental", r.fund, fund)}${card("Teknikal", r.tekn, tekn)}${card("Sentimen", r.sent, sent)}</div>`;
}
function sAnalisis() {
  const w = state.weights;
  const SECTOR = { BBCA: "Perbankan", BBRI: "Perbankan", ASII: "Otomotif", TLKM: "Telekomunikasi", GOTO: "Teknologi" };
  let rows = rankTotals();
  if (state.sectorFilter !== "Semua") rows = rows.filter((r) => SECTOR[r.kode] === state.sectorFilter);
  if (state.scoreFilter !== "Semua")
    rows = rows.filter((r) => state.scoreFilter === "Kuat" ? r.total >= 70 : state.scoreFilter === "Netral" ? r.total >= 40 && r.total < 70 : r.total < 40);
  rows = filteredRows(rows, ["kode", "nama"]);
  const body = rows.map((r, i) => {
    const recCls = r.rek === "Layak Diteliti" ? "badge-up" : r.rek === "Pantau" ? "badge-warn" : "badge-down";
    const open = state.expandedRank === r.kode;
    return `<tr class="clickable" data-action="toggle-rank" data-kode="${r.kode}">
      <td class="num">${i + 1}</td>
      <td><strong>${r.kode}</strong><div class="sub">${esc(r.nama)}</div></td>
      <td>${scoreCell(r.total)}</td><td>${scoreCell(r.fund)}</td><td>${scoreCell(r.tekn)}</td><td>${scoreCell(r.sent)}</td>
      <td><span class="badge ${recCls}">${r.rek}</span></td><td>${esc(r.alasan)}</td></tr>
    ${open ? `<tr><td></td><td colspan="7">${reasonCards(r)}</td></tr>` : ""}`;
  }).join("");
  return `
  <div class="grid grid-3">
    <div class="card"><h3>Fundamental</h3><p>Kesehatan keuangan perusahaan: laba, utang, dividen.</p></div>
    <div class="card"><h3>Teknikal</h3><p>Arah harga dan momentum dari grafik.</p></div>
    <div class="card"><h3>Sentimen</h3><p>Nada berita dan media tentang saham ini.</p></div>
  </div>
  <div class="row mt" style="flex-wrap:wrap">
    <select class="input" style="width:180px" id="sectorFilter" aria-label="Filter sektor">
      ${["Semua", "Perbankan", "Telekomunikasi", "Teknologi", "Otomotif"].map((s) => `<option ${state.sectorFilter === s ? "selected" : ""}>${s}</option>`).join("")}
    </select>
    <select class="input" style="width:180px" id="scoreFilter" aria-label="Filter skor">
      ${["Semua", "Kuat", "Netral", "Lemah"].map((s) => `<option ${state.scoreFilter === s ? "selected" : ""}>${s}</option>`).join("")}
    </select>
    <span class="muted" style="margin-left:auto">Bobot: Fundamental ${w.fund}%, Teknikal ${w.tekn}%, Sentimen ${w.sent}%</span>
    <button class="btn btn-ghost" data-action="edit-weights">Ubah Bobot</button>
  </div>
  <div class="card mt"><table>
    <thead><tr><th class="num">#</th><th>Saham</th><th>Skor Total</th><th>Fundamental</th><th>Teknikal</th><th>Sentimen</th><th>Rekomendasi</th><th>Alasan utama</th></tr></thead>
    <tbody>${body || `<tr><td colspan="8" class="muted">Tidak ada saham yang cocok dengan filter.</td></tr>`}</tbody></table>
    <div class="card-foot">Klik baris untuk melihat alasan per lensa. Skor dihitung dari bobot di atas.</div>
  </div>
  ${disclaimer()}`;
}

/* ---------- Layar 04 — Detail Analisis Saham (BBCA) ---------- */
function ma(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i++) {
    if (i < n - 1) { out.push(null); continue; }
    out.push(arr.slice(i - n + 1, i + 1).reduce((a, b) => a + b, 0) / n);
  }
  return out.filter((v) => v !== null);
}
function sDetail() {
  const b = DATA.bbca;
  const closes = b.ohlc.map((c) => c[3]);
  const ma5 = ma(closes, 5), ma10 = ma(closes, 10);
  // MA dihitung dari candle sintetis; garis mulai dari candle ke-5 / ke-10.
  const pad = (arr, n) => [...Array(n - 1).fill(null), ...arr];
  const chart = candleChart({
    w: 720, h: 300, ohlc: b.ohlc, lo: 9350, hi: 10050,
    support: b.support, resistance: b.resistance,
    maFast: pad(ma5, 5),
    maSlow: pad(ma10, 10)
  });
  const tab = state.detailTab;
  let tabBody = "";
  if (tab === "fundamental") {
    tabBody = `
    <div class="grid grid-3">
      <div class="card"><h3>Valuasi</h3><p>PER <strong class="num">22,4x</strong><br>PBV <strong class="num">4,1x</strong></p><p class="small">PER: harga dibagi laba per saham. PBV: harga dibagi nilai buku per saham.</p></div>
      <div class="card"><h3>Profitabilitas</h3><p>ROE <strong class="num">20,3%</strong><br>Laba <strong class="num">+8,5% YoY</strong></p><p class="small">ROE: laba bersih dibagi ekuitas. YoY: dibanding tahun lalu.</p></div>
      <div class="card"><h3>Dividen</h3><p>Yield <strong class="num">2,6%</strong></p><p class="small">Dividen tahunan dibagi harga saham saat ini.</p></div>
    </div>
    <div class="card mt"><h3>Mengapa penilaian ini?</h3><p>${esc(b.alasan)}</p>
      <div class="grid grid-3" style="margin-top:12px">
        <div>Fundamental <strong style="color:${scoreColor(88)}">88 Kuat</strong></div>
        <div>Teknikal <strong style="color:${scoreColor(76)}">76 Kuat</strong></div>
        <div>Sentimen <strong style="color:${scoreColor(80)}">80 Kuat</strong></div>
      </div></div>`;
  } else if (tab === "teknikal") {
    tabBody = `
    <div class="grid grid-3">
      <div class="card"><h3>Tren</h3><p>Harga di atas MA 200 hari.<br><span class="small">Garis pada grafik: MA 5 dan MA 10 dari 20 candle contoh (MA 50/200 butuh data lebih panjang).</span></p></div>
      <div class="card"><h3>Momentum</h3><p>RSI <strong class="num">62</strong> (netral-kuat)</p><p class="small">RSI di atas 70 berarti jenuh beli, di bawah 30 jenuh jual.</p></div>
      <div class="card"><h3>Support / Resistance</h3><p>Support <strong class="num">${fmtRp(b.support)}</strong><br>Resistance <strong class="num">${fmtRp(b.resistance)}</strong> (+2,8% dari harga kini)</p></div>
    </div>
    <div class="card mt"><h3>MACD</h3><p class="muted">&mdash;</p><p class="small">Data MACD tidak ada pada data contoh.</p></div>`;
  } else {
    tabBody = `
    <div class="card"><h3>Skor Sentimen: +0,58</h3>
      ${scoreMeter({ w: 320, value: 0.58 })}
      <p style="margin-top:12px">Cenderung positif. Skor −1 sampai +1; positif bila di atas 0,15.</p></div>
    ${DATA.news.map((n) => `
    <div class="card mt"><div class="row space-between"><strong>${esc(n.judul)}</strong><span class="badge ${n.sentimen === "Positif" ? "badge-up" : n.sentimen === "Negatif" ? "badge-down" : "badge-neutral"}">${n.sentimen}</span></div>
    <p class="small">${esc(n.sumber)}, ${n.tanggal} &middot; Skor ${n.skor > 0 ? "+" : ""}${fmtNum(n.skor, 2)}</p>
    <p>${esc(n.ringkasan)}</p></div>`).join("")}`;
  }
  return `
  <div class="row" style="flex-wrap:wrap">
    <div><h2 style="font-size:28px">BBCA &middot; Bank Central Asia</h2><p class="muted" style="margin:4px 0 0">Skor total ${scoreCell(82)} &middot; ${fmtRp(b.harga)} (${fmtPct(b.chgPct)})</p></div>
    <div class="row" style="margin-left:auto; flex-wrap:wrap">
      <button class="btn btn-primary" data-action="goto" data-route="dcf">Hitung Valuasi (DCF)</button>
      <button class="btn btn-secondary" data-action="open-alert-modal" data-kode="BBCA">Buat Alert</button>
      <button class="btn btn-ghost" data-action="toast" data-msg="BBCA sudah ada di Watchlist.">Tambah ke Watchlist</button>
    </div>
  </div>
  <div class="card mt">
    <div class="card-head"><h2>Grafik Harga</h2>${srcTag()}</div>
    <div class="chart-wrap">${chart}</div>
    <div class="card-foot">20 candle sintetis (Dummy). MA 5 (biru muda) dan MA 10 (oranye) dari penutupan sintetis.</div>
  </div>
  <div class="tabs mt">
    ${[["fundamental", "Fundamental"], ["teknikal", "Teknikal"], ["sentimen", "Sentimen"]].map(([k, lb]) =>
      `<button class="tab ${tab === k ? "active" : ""}" data-action="detail-tab" data-tab="${k}">${lb}</button>`).join("")}
  </div>
  ${tabBody}
  ${disclaimer()}`;
}

/* ---------- Layar 05 — Valuasi Saham (DCF) ---------- */
function sDCF() {
  const d = state.dcf;
  const fv = dcfValue(d.growth, d.terminal, d.wacc);
  const mos = ((fv - DATA.dcf.hargaPasar) / DATA.dcf.hargaPasar) * 100;
  const verdict = mos >= 5 ? "Wajar cenderung murah" : mos >= -5 ? "Wajar" : "Mahal";
  const proj = dcfProjection(d.growth, d.wacc);
  const grid = DATA.dcf.sensGrid.map((row, i) =>
    row.map((_, j) => Math.round(dcfValue(d.growth, DATA.dcf.sensTerm[j], DATA.dcf.sensWacc[i]))));
  const minV = Math.min(...grid.flat()), maxV = Math.max(...grid.flat());
  const slider = (label, key, min, max, step, unit) => `
    <div class="field"><label>${label} <strong class="num" style="float:right">${fmtNum(d[key], 1)}${unit}</strong></label>
    <input type="range" min="${min}" max="${max}" step="${step}" value="${d[key]}" data-dcf="${key}" aria-label="${label}"></div>`;
  return `
  <div class="row" style="margin-bottom:16px; flex-wrap:wrap">
    <select class="input" style="width:320px" aria-label="Pilih saham"><option>BBCA &mdash; Bank Central Asia</option></select>
    <span class="muted">Harga pasar ${fmtRp(DATA.dcf.hargaPasar)}</span>
  </div>
  <div class="grid grid-2-1">
    <div class="card"><h2>Asumsi</h2>
      ${slider("Pertumbuhan arus kas (tahun 1-5)", "growth", 0, 15, 0.5, "%")}
      ${slider("Pertumbuhan terminal", "terminal", 0, 6, 0.5, "%")}
      ${slider("WACC", "wacc", 7, 15, 0.5, "%")}
      <div class="field"><label>Jumlah saham</label><input class="input" value="&mdash;" disabled></div>
      <div class="field"><label>Kas dan utang bersih</label><input class="input" value="&mdash;" disabled></div>
      <p class="small">Jumlah saham dan kas tidak ada pada data contoh.</p>
      <button class="btn btn-ghost" data-action="dcf-reset">Reset</button>
    </div>
    <div class="stack">
      <div class="card">
        <div class="kpi-label">Nilai Wajar per Saham</div>
        <div id="dcfFairValue" style="font-size:40px;line-height:48px;font-weight:700">${fmtRp(Math.round(fv))}</div>
        <p style="margin-top:8px">Harga pasar ${fmtRp(DATA.dcf.hargaPasar)}</p>
        <div class="row"><span class="badge badge-up" id="dcfMos">Margin of Safety ${fmtPct(mos)}%</span><strong class="up" id="dcfVerdict">${verdict}</strong></div>
      </div>
      <div class="card"><h2>Penjelasan AI</h2>
        <p id="dcfExpl">Nilai wajar ${fmtRp(Math.round(fv))} dihitung dari asumsi pertumbuhan arus kas ${fmtNum(d.growth, 1)}%, pertumbuhan terminal ${fmtNum(d.terminal, 1)}%, dan WACC ${fmtNum(d.wacc, 1)}%. Harga pasar ${fmtRp(DATA.dcf.hargaPasar)} berada ${fmtNum(Math.abs(mos), 1)}% ${mos >= 0 ? "di bawah" : "di atas"} nilai wajar, jadi saham tampak ${verdict.toLowerCase()}.</p>
        <p class="small">Ubah asumsi di panel kiri untuk melihat nilai wajar berubah.</p></div>
    </div>
  </div>
  <div class="card mt">
    <div class="card-head"><h2>Proyeksi Arus Kas</h2>${srcTag()}</div>
    <p class="small">Arus kas bebas dalam indeks (tahun 0 = 100), dihitung dari pertumbuhan ${fmtNum(d.growth, 1)}% dan WACC ${fmtNum(d.wacc, 1)}%</p>
    <table><thead><tr><th></th>${proj.map((r) => `<th class="num">Tahun ${r.tahun}</th>`).join("")}</tr></thead><tbody id="dcfProjBody">
      <tr><td>Arus kas bebas (indeks)</td>${proj.map((r) => `<td class="num">${fmtNum(r.fcf, 1)}</td>`).join("")}</tr>
      <tr><td>Faktor diskonto</td>${proj.map((r) => `<td class="num">${fmtNum(r.df, 3)}</td>`).join("")}</tr>
      <tr><td>Nilai kini (indeks)</td>${proj.map((r) => `<td class="num">${fmtNum(r.pv, 1)}</td>`).join("")}</tr>
    </tbody></table>
  </div>
  <div class="grid grid-2 mt">
    <div class="card"><h2>Sensitivitas Nilai Wajar</h2><p class="small">WACC x pertumbuhan terminal (Rp). Dihitung ulang dari model saat slider berubah.</p>
      <div class="heatmap" id="dcfHeat" style="margin-top:12px">
        <div></div>${DATA.dcf.sensTerm.map((t) => `<div class="hm-head">${fmtNum(t, 1)}%</div>`).join("")}
        ${grid.map((row, i) => `<div class="hm-row">${fmtNum(DATA.dcf.sensWacc[i], 1)}%</div>${row.map((v, j) => {
          const t = (v - minV) / (maxV - minV || 1);
          const active = DATA.dcf.sensWacc[i] === d.wacc && DATA.dcf.sensTerm[j] === d.terminal;
          return `<div class="hm-cell ${active ? "active" : ""}" style="background:color-mix(in srgb, var(--surface-card) ${Math.round((1 - t) * 100)}%, var(--primary-default) ${Math.round(t * 100)}%)">${fmtRp(v)}</div>`;
        }).join("")}`).join("")}
      </div>
    </div>
    <div class="card"><h2>Cara Membaca</h2>
      <p>Sel paling gelap adalah nilai wajar tertinggi. Sel berbingkai adalah asumsi saat ini: WACC ${fmtNum(d.wacc, 1)}% dan pertumbuhan terminal ${fmtNum(d.terminal, 1)}%.</p>
      <p>Nilai wajar naik bila WACC turun atau pertumbuhan terminal naik.</p>
      <p>Nilai terminal dihitung dari arus kas tahun ke-6 dibagi selisih WACC dan pertumbuhan terminal.</p></div>
  </div>
  ${disclaimer()}`;
}

/* ---------- Layar 06 — Analisis Proyek & Skema Pembiayaan ---------- */
function sProyek() {
  const p = state.project;
  const m = projectMath();
  const npvChart = vBars({
    w: 640, h: 200,
    values: m.rows.map((r) => Math.round(r.npv / 1e6)),
    labels: m.rows.map((r) => r.label.split(" ")[0] + " " + r.label.split(" ")[1]),
    colors: m.rows.map((r) => r.disqualified ? "var(--state-warning)" : "var(--chart-1)"),
    formatV: (v) => "+Rp " + fmtNum(v) + " jt"
  });
  const cum = m.cfs.reduce((acc, cf, i) => { acc.push((acc[i - 1] || 0) + cf); return acc; }, []);
  const cumChart = areaChart({
    w: 640, h: 200, values: cum.map((v) => v / 1e6),
    labels: ["Tahun 0", "Tahun 1", "Tahun 2", "Tahun 3", "Tahun 4", "Tahun 5"],
    ymin: -2100, ymax: 1400, color: "var(--chart-1)", id: "cum",
    formatY: (v) => fmtNum(v)
  });
  const schemeCards = m.rows.map((r) => `
    <div class="card" style="${r.isBest ? "border:2px solid var(--primary-default)" : ""}">
      ${r.isBest ? `<span class="badge badge-up">Peringkat 1</span>` : ""}
      <p style="margin:10px 0 4px"><strong>${r.label}</strong></p>
      <div class="kpi-value">WACC ${fmtNum(r.wacc, 2)}%</div>
      <p class="${r.npv >= 0 ? "up" : "down"}" style="margin:4px 0">NPV +${fmtSingkat(r.npv)}</p>
      <p class="small">DSCR min. ${r.dscr === null ? "&mdash;" : fmtNum(r.dscr, 2) + "x"}${r.disqualified ? ' <span class="badge badge-down">Risiko</span>' : ""}</p>
    </div>`).join("");
  const trows = m.rows.map((r) => `
    <tr><td class="num">${r.disqualified ? "&mdash;" : r.rank}</td><td>${r.label}</td>
    <td class="num">${fmtNum(r.wacc, 2)}%</td><td class="num up">+${fmtSingkat(r.npv)}</td>
    <td class="num">${fmtNum(r.irr, 1)}%</td><td class="num">${fmtNum(r.payback, 1)} tahun</td>
    <td class="num ${r.dscr !== null && r.dscr < 1.3 ? "down" : ""}">${r.dscr === null ? "&mdash;" : fmtNum(r.dscr, 2) + "x"}</td>
    <td>${r.isBest ? '<span class="badge badge-up">Terbaik</span>' : r.disqualified ? '<span class="badge badge-down">Risiko</span>' : "&mdash;"}</td></tr>`).join("");
  const cfInputs = p.arusKas.map((v, i) =>
    `<div class="field"><label>Arus kas tahun ${i + 1} (Rp)</label><input class="input num" type="number" step="50000000" value="${v}" data-pcf="${i}"></div>`).join("");
  return `
  <div class="row" style="margin-bottom:16px; flex-wrap:wrap">
    <select class="input" style="width:320px" aria-label="Pilih proyek"><option>${esc(DATA.project.nama)}</option>${DATA.project.lainnya.map((n) => `<option disabled>${esc(n)} (segera)</option>`).join("")}</select>
    <button class="btn btn-ghost" data-action="toast" data-msg="Proyek baru belum tersedia di versi contoh.">Proyek Baru</button>
    <div style="margin-left:auto" class="row">
      <button class="btn btn-ghost" data-action="print">Ekspor PDF</button>
      <button class="btn btn-primary" data-action="toast" data-msg="Analisis disimpan (contoh).">Simpan Analisis</button>
    </div>
  </div>
  <div class="card"><h2>Detail Proyek</h2>
    <div class="grid grid-3" style="margin-top:12px">
      <div class="field"><label>Investasi awal (Rp)</label><input class="input num" type="number" step="100000000" value="${p.investasi}" data-project="investasi"></div>
      <div class="field"><label>Umur proyek (tahun)</label><input class="input num" type="number" min="1" max="10" value="${p.umur}" data-project="umur"></div>
      <div class="field"><label>Pajak (%)</label><input class="input num" type="number" step="1" value="${p.pajak}" data-project="pajak"></div>
      <div class="field"><label>Bunga utang (%)</label><input class="input num" type="number" step="0.5" value="${p.bunga}" data-project="bunga"></div>
      <div class="field"><label>Nilai sisa</label><input class="input" value="&mdash;" disabled></div>
      <div class="field"><label>Biaya ekuitas (asumsi)</label><input class="input" value="14% (tetap)" disabled></div>
    </div>
    <div class="grid grid-3">${cfInputs}</div>
    <p class="small">Rumus: WACC = bobot ekuitas &times; 14% + bobot utang &times; bunga &times; (1 &minus; pajak). DSCR = arus kas tahun 1 / (bunga tahun 1 + pokok/umur). Skema diskualifikasi bila DSCR di bawah 1,3x.</p>
  </div>
  <div class="grid grid-4 mt">${schemeCards}</div>
  <div class="card mt"><h2>Perbandingan Skema</h2>
    <table><thead><tr><th class="num">Peringkat</th><th>Skema</th><th class="num">WACC</th><th class="num">NPV</th><th class="num">IRR proyek</th><th class="num">Payback</th><th class="num">DSCR min.</th><th>Status</th></tr></thead>
    <tbody>${trows}</tbody></table>
    <p class="warn-text" style="margin-top:12px">Skema 70% utang punya NPV tertinggi tetapi didiskualifikasi dari peringkat atas karena DSCR di bawah batas aman 1,3x.</p>
  </div>
  <div class="card mt"><h2>NPV per Skema</h2><p class="small">Juta rupiah, garis dasar nol</p><div class="chart-wrap">${npvChart}</div>
    <p class="warn-text">Skema 70% utang: NPV tertinggi, tetapi DSCR di bawah batas aman.</p></div>
  <div class="card mt"><h2>Arus Kas Kumulatif (Payback)</h2><p class="small">Juta rupiah, tanpa diskon &middot; Payback ${fmtNum(m.payback, 1)} tahun</p><div class="chart-wrap">${cumChart}</div></div>
  ${m.best ? `<div class="card mt"><h2>Skema Terbaik: ${m.best.label}</h2><p><span class="badge badge-up">Peringkat 1</span></p>
    <p>NPV tinggi dengan beban cicilan masih aman (DSCR ${fmtNum(m.best.dscr, 2)}x, di atas batas 1,3x). WACC ${fmtNum(m.best.wacc, 2)}%, lebih rendah dari 100% modal sendiri (${fmtNum(m.rows.find((r) => r.utang === 0).wacc, 2)}%). Payback ${fmtNum(m.payback, 1)} tahun, sama dengan skema lain.</p></div>` : ""}
  ${disclaimer()}`;
}

/* ---------- Layar 07 — Alert Harga ---------- */
function sAlert() {
  const tab = state.alertTab;
  let body = "";
  if (tab === "aktif") {
    const rows = state.alerts.map((a) => {
      const jarak = ((a.target - a.harga) / a.harga) * 100;
      return `<tr>
      <td><strong>${a.aset}</strong><div class="sub">${esc(a.nama)}</div></td>
      <td>${a.kondisi}</td><td class="num">${fmtRp(a.target)}</td><td class="num">${fmtRp(a.harga)}</td>
      <td class="num ${jarak >= 0 ? "up" : "down"}">${fmtPct(jarak)}%</td>
      <td><label class="toggle"><input type="checkbox" data-alert-toggle="${a.id}" ${a.aktif ? "checked" : ""} aria-label="Aktifkan alert ${a.aset}"><span class="track"></span></label></td>
      <td><button class="icon-btn" data-action="del-alert" data-id="${a.id}" title="Hapus alert" aria-label="Hapus alert">&times;</button></td></tr>`;
    }).join("");
    body = `<table><thead><tr><th>Aset</th><th>Kondisi</th><th class="num">Harga Target</th><th class="num">Harga Terkini</th><th class="num">Jarak ke Target</th><th>Status</th><th>Aksi</th></tr></thead>
    <tbody>${rows || `<tr><td colspan="7" class="muted">Belum ada alert aktif. Buat alert baru.</td></tr>`}</tbody></table>`;
  } else {
    body = DATA.alertHistory.map((h) => `
    <div class="row space-between" style="padding:12px 0;border-bottom:1px solid var(--border-default)">
      <div><strong>${esc(h.teks)}</strong><div class="sub">${h.waktu}</div></div>
      <span class="badge badge-neutral">${h.kanal}</span></div>`).join("");
  }
  return `
  <div class="row space-between" style="margin-bottom:16px">
    <div class="tabs" style="margin-bottom:0">
      <button class="tab ${tab === "aktif" ? "active" : ""}" data-action="alert-tab" data-tab="aktif">Aktif</button>
      <button class="tab ${tab === "riwayat" ? "active" : ""}" data-action="alert-tab" data-tab="riwayat">Riwayat Terpicu</button>
    </div>
    <button class="btn btn-primary" data-action="open-alert-modal">Buat Alert</button>
  </div>
  <div class="card">${body}</div>
  ${disclaimer()}`;
}

/* ---------- Layar 08 — Sentimen Berita ---------- */
function sSentimen() {
  const counts = { Positif: 0, Netral: 0, Negatif: 0 };
  DATA.news.forEach((n) => counts[n.sentimen]++);
  const total = DATA.news.length;
  const donutSvg = donut({
    size: 180, thick: 26,
    segments: [
      { value: counts.Positif, color: "var(--market-up)" },
      { value: counts.Netral, color: "var(--market-flat)" },
      { value: counts.Negatif, color: "var(--market-down)" }
    ]
  });
  let news = DATA.news;
  if (state.newsFilter.aset !== "Semua") news = news.filter((n) => n.aset.includes(state.newsFilter.aset));
  if (state.newsFilter.sentimen !== "Semua") news = news.filter((n) => n.sentimen === state.newsFilter.sentimen);
  news = filteredRows(news, ["judul", "sumber"]);
  return `
  <div class="grid grid-2">
    <div class="card"><h2>Ringkasan Sentimen Pasar</h2>
      <div class="donut-flex" style="margin-top:12px">
        <div class="donut-box">${donutSvg}<div class="donut-center"><strong>${total}</strong><span class="small">berita</span></div></div>
        <div class="legend">
          <div class="legend-row"><span class="swatch" style="background:var(--market-up)"></span>Positif<span class="val">${Math.round((counts.Positif / total) * 100)}%</span></div>
          <div class="legend-row"><span class="swatch" style="background:var(--market-flat)"></span>Netral<span class="val">${Math.round((counts.Netral / total) * 100)}%</span></div>
          <div class="legend-row"><span class="swatch" style="background:var(--market-down)"></span>Negatif<span class="val">${Math.round((counts.Negatif / total) * 100)}%</span></div>
        </div>
      </div>
      <div class="card-foot">Berdasarkan ${total} berita pada data contoh</div>
    </div>
    <div class="card"><h2>Skor per Aset</h2>
      ${DATA.sentimentByAsset.map((s) => `
      <div class="row" style="margin-top:14px"><span style="width:52px"><strong>${s.kode}</strong></span>
      ${scoreMeter({ w: 220, value: s.skor })}
      <span class="num ${s.skor >= 0.15 ? "up" : s.skor <= -0.15 ? "down" : ""}" style="width:56px;text-align:right">${s.skor > 0 ? "+" : ""}${fmtNum(s.skor, 2)}</span></div>`).join("")}
      <div class="card-foot">Skor −1 sampai +1. Positif bila di atas 0,15.</div>
    </div>
  </div>
  <div class="row mt" style="flex-wrap:wrap">
    <select class="input" style="width:180px" id="newsAset" aria-label="Filter aset">
      ${["Semua", "BBCA", "BBRI", "BMRI", "TLKM", "GOTO"].map((a) => `<option ${state.newsFilter.aset === a ? "selected" : ""}>${a}</option>`).join("")}
    </select>
    <select class="input" style="width:180px" id="newsSentimen" aria-label="Filter sentimen">
      ${["Semua", "Positif", "Netral", "Negatif"].map((s) => `<option ${state.newsFilter.sentimen === s ? "selected" : ""}>${s}</option>`).join("")}
    </select>
  </div>
  ${news.map((n) => `
  <div class="card mt" data-news><div class="row space-between"><strong>${esc(n.judul)}</strong>
    <span class="row"><span class="badge ${n.sentimen === "Positif" ? "badge-up" : n.sentimen === "Negatif" ? "badge-down" : "badge-neutral"}">${n.sentimen}</span>
    <span class="num ${n.skor >= 0 ? "up" : "down"}">${n.skor > 0 ? "+" : ""}${fmtNum(n.skor, 2)}</span></span></div>
    <p class="small">${esc(n.sumber)}, ${n.tanggal}</p>
    <p>${esc(n.ringkasan)}</p>
    <div class="row space-between"><span>${n.aset.map((a) => `<span class="badge badge-neutral">${a}</span>`).join(" ")}</span>
    <a href="#" data-action="toast" data-msg="Tautan artikel asli tidak tersedia di data contoh.">Baca artikel asli</a></div></div>`).join("") ||
    `<div class="card mt"><p class="muted">Tidak ada berita yang cocok dengan filter.</p></div>`}
  <p class="small" style="margin-top:24px">Skor sentimen dihitung otomatis dan bisa keliru. Hanya media terpercaya yang ditampilkan.</p>
  ${disclaimer()}`;
}

/* ---------- Layar 09 — Modul Tim ---------- */
function sTim() {
  const t = DATA.team;
  const member = state.teamMember;
  const anggota = member === "Semua" ? t.anggota : t.anggota.filter((a) => a.nama === member);
  const barColor = (a) => a.pct >= 100 ? "var(--market-up)" : a.pct >= 90 ? "var(--chart-1)" : "var(--state-warning)";
  const statusBadge = (a) => a.pct >= 100 ? "badge-up" : a.pct >= 90 ? "badge-info" : "badge-warn";
  const barChart = vBars({
    w: 392, h: 240,
    values: anggota.map((a) => Math.round(a.capaian / 1e6)),
    labels: anggota.map((a) => a.nama.split(" ")[0]),
    colors: anggota.map((a) => a.pct >= 100 ? "var(--chart-2)" : a.pct >= 90 ? "var(--chart-1)" : "var(--chart-4)"),
    formatV: (v) => "Rp " + fmtNum(v) + " jt",
    target: 600, targetLabel: "Target Rp 600 jt"
  });
  const trend = multiLine({
    w: 640, h: 220,
    series: [
      { values: t.tren.agregat, color: "var(--chart-1)" },
      { values: t.tren.rina, color: "var(--chart-2)" },
      { values: t.tren.bagas, color: "var(--chart-3)" },
      { values: t.tren.sari, color: "var(--chart-4)" },
      { values: t.tren.dimas, color: "var(--chart-6)" }
    ],
    names: ["Agregat", "Rina", "Bagas", "Sari", "Dimas"],
    labels: t.tren.labels
  });
  return `
  <div class="row" style="margin-bottom:24px">
    <select class="input" id="teamPeriode" style="width:160px" aria-label="Periode">
      <option${state.teamPeriode === "Okt 2026" ? " selected" : ""}>Okt 2026</option>
      <option${state.teamPeriode === "Sep 2026" ? " selected" : ""}>Sep 2026</option>
    </select>
    <select class="input" id="teamMember" style="width:200px" aria-label="Anggota">
      <option value="Semua"${member === "Semua" ? " selected" : ""}>Semua Anggota</option>
      ${t.anggota.map((a) => `<option value="${a.nama}"${member === a.nama ? " selected" : ""}>${a.nama}</option>`).join("")}
    </select>
  </div>
  <div class="grid grid-4">
    <div class="card"><div class="kpi-label">Capaian vs Target</div><div class="kpi-value">${t.pct}%</div><div class="kpi-sub">Periode ${t.periode}</div></div>
    <div class="card"><div class="kpi-label">Total Capaian</div><div class="kpi-value">${fmtSingkat(t.capaian)}</div><div class="kpi-sub">Target ${fmtSingkat(t.target)}</div></div>
    <div class="card"><div class="kpi-label">Di Atas Target</div><div class="kpi-value">1 anggota</div><div class="kpi-sub">Rina Wulandari (109%)</div></div>
    <div class="card"><div class="kpi-label">Di Bawah Target</div><div class="kpi-value">1 anggota</div><div class="kpi-sub">Dimas Hidayat (72%)</div></div>
  </div>
  <div class="grid grid-tim mt">
    <div class="card"><h2>Capaian per Anggota</h2>
      <table><thead><tr><th>Anggota</th><th class="num">Target</th><th class="num">Capaian</th><th class="num">Persentase</th><th>Status</th></tr></thead>
      <tbody>${anggota.map((a) => `
        <tr><td><strong>${a.nama}</strong></td><td class="num">${fmtSingkat(a.target)}</td><td class="num">${fmtSingkat(a.capaian)}</td>
        <td class="num">${a.pct}%</td>
        <td><span class="badge ${statusBadge(a)}">${a.status}</span></td></tr>`).join("")}</tbody></table>
    </div>
    <div class="card"><h2>Capaian vs Target</h2>
      <div class="chart-wrap">${barChart}</div>
      <div class="card-foot">Garis target Rp 600 jt per anggota. Warna batang mengikuti status capaian.</div>
    </div>
  </div>
  <div class="card mt"><h2>Progres vs Target</h2>
    ${anggota.map((a) => `
    <div class="prog-row"><span class="prog-name">${a.nama}</span>
      <span class="prog-track"><span class="prog-fill" style="width:${Math.min(a.pct, 100)}%;background:${barColor(a)}"></span></span>
      <span class="prog-pct">${a.pct}%</span></div>`).join("")}
  </div>
  <div class="card mt"><div class="row" style="justify-content:space-between"><h2>Tren Capaian (Mei–Okt 2026)</h2><span class="badge badge-dummy">Dummy</span></div>
    <div class="chart-wrap">${trend}</div>
    <div class="legend" style="flex-direction:row;flex-wrap:wrap;gap:16px;margin-top:8px">
      ${[["Agregat", "var(--chart-1)"], ["Rina", "var(--chart-2)"], ["Bagas", "var(--chart-3)"], ["Sari", "var(--chart-4)"], ["Dimas", "var(--chart-6)"]].map(([n, c]) => `<span class="legend-row"><span class="swatch" style="background:${c}"></span>${n}</span>`).join("")}
    </div>
  </div>
  <div class="grid grid-2 mt">
    <div class="card"><h2>Unggah Laporan</h2>
      <label class="dropzone" for="fileUpload">Seret file CSV atau XLSX ke sini
      <input type="file" id="fileUpload" accept=".csv,.xlsx,.xls"></label>
      <button class="btn btn-secondary" type="button" data-action="pick-file" style="margin-top:12px">Pilih File</button>
      <p class="small" style="margin-top:12px">File hanya dibaca di perangkat ini dan tidak diunggah ke server.</p></div>
    <div class="card"><h2>Hasil Analisis Otomatis</h2><p>${esc(t.temuan)}</p>
      ${state.teamUpload ? `<p class="small" style="margin-top:8px">File ${esc(state.teamUpload.name)}: ${state.teamUpload.rows} baris data dibaca.</p>` : ""}
      <p class="small">Unggah laporan untuk temuan lainnya.</p></div>
  </div>
  ${disclaimer()}`;
}

/* ---------- Layar 11 — Keadaan Khusus ---------- */
function sKeadaan() {
  return `
  <div class="grid grid-2">
    <div class="card"><p class="small">Kosong</p><h3>Belum ada saham di watchlist</h3>
      <p>Tambahkan saham untuk memantau harganya di sini.</p>
      <button class="btn btn-primary" data-action="goto" data-route="watchlist">Tambah ke Watchlist</button></div>
    <div class="card"><p class="small">Memuat</p><h3>Memuat data&hellip;</h3>
      <div style="margin-top:16px"><div class="skeleton" style="width:90%"></div><div class="skeleton" style="width:70%"></div><div class="skeleton" style="width:80%"></div></div></div>
    <div class="card" id="gagalCard"><p class="small">Gagal</p><h3>Data tidak dapat dimuat</h3>
      <p>Periksa koneksi lalu coba lagi.</p>
      <button class="btn btn-primary" data-action="retry-load">Coba lagi</button></div>
    <div class="card"><p class="small">Tertunda</p><span class="badge badge-delayed">Tertunda 15 mnt</span>
      <h3 style="margin-top:12px">Data IDX tertunda 15 menit</h3>
      <p>Harga yang ditampilkan adalah harga 15 menit lalu.</p>
      <p class="small">Terakhir diperbarui ${DATA.meta.updated}</p></div>
  </div>
  ${disclaimer()}`;
}

/* ---------- Layar 12 — Usulan Nama ---------- */
function sNama() {
  return `
  <div class="card"><p style="color:var(--text-primary);margin:0">Nama kerja tetap dipakai di seluruh UI: <strong>Asisten Analisis Investasi</strong>. Tiga usulan di bawah ini hanya alternatif.</p></div>
  <div class="grid grid-3 mt">
    ${DATA.names.map((n) => `
    <div class="card"><h2>${n.nama}</h2><p>${n.alasan}</p>
      <button class="btn btn-ghost" data-action="pick-name" data-name="${esc(n.nama)}">Pilih nama ini</button></div>`).join("")}
  </div>
  <div class="card mt"><p style="margin:0">Nama terpilih saat ini: <strong id="currentName">${esc(state.appName)}</strong>
  ${state.appName !== "Asisten Analisis Investasi" ? ` &nbsp;<button class="btn btn-ghost btn-small" data-action="pick-name" data-name="Asisten Analisis Investasi">Kembalikan ke nama kerja</button>` : ""}</p>
  <p class="small" style="margin-top:8px">Pilihan tersimpan di perangkat ini (localStorage) dan hanya mengubah tampilan nama di aplikasi ini.</p></div>
  ${disclaimer()}`;
}

/* ---------- Peta layar ---------- */
const SCREENS = {
  ringkasan: sRingkasan, watchlist: sWatchlist, analisis: sAnalisis, detail: sDetail,
  dcf: sDCF, proyek: sProyek, alert: sAlert, sentimen: sSentimen, tim: sTim,
  keadaan: sKeadaan, nama: sNama,
  ai: () => sDetail()
};

/* ---------- Pembaruan live untuk slider DCF (tanpa render ulang) ---------- */
function updateDCF() {
  const d = state.dcf;
  const fv = dcfValue(d.growth, d.terminal, d.wacc);
  const mos = ((fv - DATA.dcf.hargaPasar) / DATA.dcf.hargaPasar) * 100;
  const verdict = mos >= 5 ? "Wajar cenderung murah" : mos >= -5 ? "Wajar" : "Mahal";
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set("dcfFairValue", fmtRp(Math.round(fv)));
  set("dcfMos", "Margin of Safety " + fmtPct(mos) + "%");
  set("dcfVerdict", verdict);
  set("dcfExpl", `Nilai wajar ${fmtRp(Math.round(fv))} dihitung dari asumsi pertumbuhan arus kas ${fmtNum(d.growth, 1)}%, pertumbuhan terminal ${fmtNum(d.terminal, 1)}%, dan WACC ${fmtNum(d.wacc, 1)}%. Harga pasar ${fmtRp(DATA.dcf.hargaPasar)} berada ${fmtNum(Math.abs(mos), 1)}% ${mos >= 0 ? "di bawah" : "di atas"} nilai wajar, jadi saham tampak ${verdict.toLowerCase()}.`);
  const proj = dcfProjection(d.growth, d.wacc);
  const pb = document.getElementById("dcfProjBody");
  if (pb) pb.innerHTML =
    `<tr><td>Arus kas bebas (indeks)</td>${proj.map((r) => `<td class="num">${fmtNum(r.fcf, 1)}</td>`).join("")}</tr>` +
    `<tr><td>Faktor diskonto</td>${proj.map((r) => `<td class="num">${fmtNum(r.df, 3)}</td>`).join("")}</tr>` +
    `<tr><td>Nilai kini (indeks)</td>${proj.map((r) => `<td class="num">${fmtNum(r.pv, 1)}</td>`).join("")}</tr>`;
  const heat = document.getElementById("dcfHeat");
  if (heat) {
    const grid = DATA.dcf.sensGrid.map((row, i) => row.map((_, j) => Math.round(dcfValue(d.growth, DATA.dcf.sensTerm[j], DATA.dcf.sensWacc[i]))));
    const minV = Math.min(...grid.flat()), maxV = Math.max(...grid.flat());
    heat.innerHTML = `<div></div>${DATA.dcf.sensTerm.map((t) => `<div class="hm-head">${fmtNum(t, 1)}%</div>`).join("")}` +
      grid.map((row, i) => `<div class="hm-row">${fmtNum(DATA.dcf.sensWacc[i], 1)}%</div>${row.map((v, j) => {
        const t = (v - minV) / (maxV - minV || 1);
        const active = DATA.dcf.sensWacc[i] === d.wacc && DATA.dcf.sensTerm[j] === d.terminal;
        return `<div class="hm-cell ${active ? "active" : ""}" style="background:color-mix(in srgb, var(--surface-card) ${Math.round((1 - t) * 100)}%, var(--primary-default) ${Math.round(t * 100)}%)">${fmtRp(v)}</div>`;
      }).join("")}`).join("");
  }
  $$("[data-dcf]").forEach((el) => {
    const lab = el.closest(".field")?.querySelector("strong");
    if (lab) lab.textContent = fmtNum(state.dcf[el.dataset.dcf], 1) + "%";
  });
}

/* ---------- Modal: ubah bobot, buat alert, tambah watchlist ---------- */
function openWeightsModal() {
  const w = state.weights;
  openModal(`<h2>Ubah Bobot Skor</h2>
  <p class="muted">Total bobot harus 100%. Skor total dihitung ulang dan peringkat diurutkan kembali.</p>
  <div class="field"><label>Fundamental (%)</label><input class="input num" type="number" id="wFund" value="${w.fund}" min="0" max="100"></div>
  <div class="field"><label>Teknikal (%)</label><input class="input num" type="number" id="wTekn" value="${w.tekn}" min="0" max="100"></div>
  <div class="field"><label>Sentimen (%)</label><input class="input num" type="number" id="wSent" value="${w.sent}" min="0" max="100"></div>
  <div class="modal-actions"><button class="btn btn-ghost" data-action="close-modal">Batal</button>
  <button class="btn btn-primary" data-action="save-weights">Simpan Bobot</button></div>`);
}
function openAlertModal(kode) {
  const codes = [...new Set([...state.watchlist.map((w) => w.kode), ...DATA.ranking.map((r) => r.kode)])];
  openModal(`<h2>Buat Alert</h2>
  <div class="field"><label>Aset</label><select class="input" id="alAset">${codes.map((c) => `<option ${c === kode ? "selected" : ""}>${c}</option>`).join("")}</select></div>
  <div class="field"><label>Kondisi</label><select class="input" id="alKondisi"><option>Naik ke</option><option>Turun ke</option></select></div>
  <div class="field"><label>Harga target (Rp)</label><input class="input num" type="number" id="alTarget" placeholder="cth. 10000"></div>
  <div class="field"><label>Kanal notifikasi</label>
    <label class="check-row"><input type="checkbox" id="alEmail" checked> Email</label>
    <label class="check-row"><input type="checkbox" id="alApp" checked> Di aplikasi</label></div>
  <div class="field"><label>Catatan (opsional)</label><textarea class="input" id="alNote" rows="2" placeholder="cth. Pantau sebelum RUPS"></textarea></div>
  <div class="modal-actions"><button class="btn btn-ghost" data-action="close-modal">Batal</button>
  <button class="btn btn-primary" data-action="save-alert">Simpan Alert</button></div>`);
}
function openAddWatchlistModal() {
  const existing = new Set(state.watchlist.map((w) => w.kode));
  const extra = [["UNVR", "Unilever Indonesia", 2850], ["ICBP", "Indofood CBP", 11200], ["AMRT", "Sumber Alfaria Trijaya", 2900]]
    .filter(([c]) => !existing.has(c));
  if (!extra.length) { toast("Semua saham contoh sudah ada di Watchlist."); return; }
  openModal(`<h2>Tambah ke Watchlist</h2>
  <p class="muted">Harga memakai data contoh (Dummy).</p>
  <div class="field"><label>Saham</label><select class="input" id="wlKode">${extra.map(([c, n, h]) => `<option value="${c}">${c} — ${n} (${fmtRp(h)})</option>`).join("")}</select></div>
  <div class="modal-actions"><button class="btn btn-ghost" data-action="close-modal">Batal</button>
  <button class="btn btn-primary" data-action="save-watchlist">Tambah</button></div>`);
}

/* ---------- Delegasi event ---------- */
document.addEventListener("click", (e) => {
  const nav = e.target.closest("[data-route]");
  if (nav && !nav.closest("#modalRoot")) { go(nav.dataset.route); return; }
  const el = e.target.closest("[data-action]");
  if (!el) return;
  const a = el.dataset.action;
  if (a === "goto-detail") {
    if (el.dataset.kode === "BBCA") location.hash = "#detail";
    else toast("Detail lengkap baru tersedia untuk BBCA di versi contoh.");
  } else if (a === "goto") go(el.dataset.route);
  else if (a === "toast") toast(el.dataset.msg || "OK");
  else if (a === "close-modal") closeModal();
  else if (a === "modal-backdrop" && e.target === el) closeModal();
  else if (a === "modal-nav") { closeModal(); go(el.dataset.route); }
  else if (a === "watch-tab") { state.watchTab = el.dataset.tab; render(); }
  else if (a === "toggle-rank") { state.expandedRank = state.expandedRank === el.dataset.kode ? null : el.dataset.kode; render(); }
  else if (a === "detail-tab") { state.detailTab = el.dataset.tab; render(); }
  else if (a === "alert-tab") { state.alertTab = el.dataset.tab; render(); }
  else if (a === "edit-weights") openWeightsModal();
  else if (a === "save-weights") {
    const f = +$("#wFund").value || 0, t = +$("#wTekn").value || 0, s = +$("#wSent").value || 0;
    if (f + t + s !== 100) { toast("Total bobot harus 100% (saat ini " + (f + t + s) + "%)."); return; }
    state.weights = { fund: f, tekn: t, sent: s };
    closeModal(); render(); toast("Bobot diperbarui, peringkat dihitung ulang.");
  } else if (a === "dcf-reset") { state.dcf = { growth: DATA.dcf.growth, terminal: DATA.dcf.terminal, wacc: DATA.dcf.wacc }; render(); }
  else if (a === "open-alert-modal") openAlertModal(el.dataset.kode);
  else if (a === "save-alert") {
    const target = +$("#alTarget").value;
    if (!target || target <= 0) { toast("Isi harga target yang valid."); return; }
    const aset = $("#alAset").value;
    const wl = state.watchlist.find((w) => w.kode === aset);
    state.alerts.unshift({ id: Date.now(), aset, nama: wl ? wl.nama : aset, kondisi: $("#alKondisi").value, target, harga: wl ? wl.harga : 0, aktif: true });
    state.alertTab = "aktif";
    closeModal(); render(); toast("Alert " + aset + " disimpan.");
  } else if (a === "del-alert") {
    state.alerts = state.alerts.filter((x) => x.id !== +el.dataset.id);
    render(); toast("Alert dihapus.");
  } else if (a === "add-watchlist") openAddWatchlistModal();
  else if (a === "save-watchlist") {
    const map = { UNVR: ["Unilever Indonesia", 2850], ICBP: ["Indofood CBP", 11200], AMRT: ["Sumber Alfaria Trijaya", 2900] };
    const c = $("#wlKode").value;
    state.watchlist.push({ kode: c, nama: map[c][0], harga: map[c][1], chgRp: 0, chgPct: 0, sumber: "IDX (tertunda 15 mnt)", update: DATA.meta.updated });
    closeModal(); render(); toast(c + " ditambahkan ke Watchlist.");
  } else if (a === "bell") openAlertModal(el.dataset.kode);
  else if (a === "pick-name") {
    state.appName = el.dataset.name;
    localStorage.setItem("aai-name", state.appName);
    render(); toast("Nama aplikasi diubah menjadi " + state.appName + ".");
  } else if (a === "retry-load") {
    const card = $("#gagalCard");
    card.innerHTML = `<p class="small">Memuat</p><div style="margin-top:16px"><div class="skeleton" style="width:90%"></div><div class="skeleton" style="width:70%"></div></div>`;
    setTimeout(() => { card.innerHTML = `<p class="small">Berhasil</p><h3>Data berhasil dimuat</h3><p>Koneksi kembali normal. Data terakhir ${DATA.meta.updated}.</p>`; }, 1200);
  } else if (a === "print") window.print();
  else if (a === "pick-file") { const f = $("#fileUpload"); if (f) f.click(); }
});

document.addEventListener("input", (e) => {
  const el = e.target;
  if (el.matches("[data-dcf]")) { state.dcf[el.dataset.dcf] = +el.value; updateDCF(); return; }
  if (el.id === "globalSearch" || el.id === "watchSearch") {
    state.query = el.value;
    const other = el.id === "globalSearch" ? $("#watchSearch") : $("#globalSearch");
    if (other && other.value !== el.value) other.value = el.value;
    applyQuery(el.value);
  }
});
document.addEventListener("change", (e) => {
  const el = e.target;
  if (el.matches("[data-project]")) {
    state.project[el.dataset.project] = +el.value || 0;
    render();
  } else if (el.matches("[data-pcf]")) {
    const i = +el.dataset.pcf;
    state.project.arusKas[i] = +el.value || 0;
    render();
  } else if (el.matches("[data-alert-toggle]")) {
    const a = state.alerts.find((x) => x.id === +el.dataset.alertToggle);
    if (a) { a.aktif = el.checked; toast("Alert " + a.aset + (a.aktif ? " diaktifkan." : " dimatikan.")); }
  } else if (el.id === "sectorFilter") { state.sectorFilter = el.value; render(); }
  else if (el.id === "scoreFilter") { state.scoreFilter = el.value; render(); }
  else if (el.id === "newsAset") { state.newsFilter.aset = el.value; render(); }
  else if (el.id === "newsSentimen") { state.newsFilter.sentimen = el.value; render(); }
  else if (el.id === "teamPeriode") {
    if (el.value === "Sep 2026") { toast("Data contoh hanya tersedia untuk Okt 2026."); state.teamPeriode = "Okt 2026"; }
    else state.teamPeriode = el.value;
    render();
  }
  else if (el.id === "teamMember") { state.teamMember = el.value; render(); }
  else if (el.id === "fileUpload" && el.files.length) {
    processTeamFile(el.files[0]);
    el.value = "";
  }
});

/* ---------- Unggah laporan tim (baca CSV di perangkat, tanpa unggah) ---------- */
function processTeamFile(file) {
  const name = file.name;
  const ext = name.split(".").pop().toLowerCase();
  if (ext === "csv") {
    const reader = new FileReader();
    reader.onload = () => {
      const lines = String(reader.result).split(/\r?\n/).filter((l) => l.trim() !== "");
      const rows = Math.max(0, lines.length - 1); // baris pertama = header
      state.teamUpload = { name, rows };
      toast("Laporan " + name + " dibaca: " + rows + " baris data. File hanya dibaca di perangkat ini.");
      render();
    };
    reader.onerror = () => toast("Gagal membaca " + name + ".");
    reader.readAsText(file);
  } else if (ext === "xlsx" || ext === "xls") {
    toast("File " + name + " diterima. Isi XLSX belum bisa dianalisis di perangkat ini — simpan sebagai CSV untuk analisis otomatis.");
  } else {
    toast("Format tidak didukung. Unggah file CSV atau XLSX.");
  }
}
document.addEventListener("dragover", (e) => {
  const dz = e.target.closest && e.target.closest(".dropzone");
  if (dz) { e.preventDefault(); dz.classList.add("dragging"); }
});
document.addEventListener("dragleave", (e) => {
  const dz = e.target.closest && e.target.closest(".dropzone");
  if (dz) dz.classList.remove("dragging");
});
document.addEventListener("drop", (e) => {
  const dz = e.target.closest && e.target.closest(".dropzone");
  if (!dz) return;
  e.preventDefault();
  dz.classList.remove("dragging");
  const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
  if (f) processTeamFile(f);
});

/* ---------- Tooltip grafik garis (hover di chart) ---------- */
function chartTipHide(svg) {
  if (!svg) return;
  const tip = svg.parentElement && svg.parentElement.querySelector(".chart-tip");
  if (tip) tip.hidden = true;
  const guide = svg.querySelector(".ml-guide");
  if (guide) guide.setAttribute("visibility", "hidden");
  svg.querySelectorAll(".ml-dot").forEach((d) => d.setAttribute("r", "3"));
}
document.addEventListener("mousemove", (e) => {
  const svg = e.target.closest && e.target.closest(".ml-chart");
  if (!svg) return;
  const rect = svg.getBoundingClientRect();
  const labels = JSON.parse(svg.dataset.labels);
  const names = JSON.parse(svg.dataset.names);
  const series = JSON.parse(svg.dataset.series);
  const colors = JSON.parse(svg.dataset.colors);
  const W = 640, padL = 40, padR = 8;
  const vx = ((e.clientX - rect.left) / rect.width) * W;
  let i = Math.round((vx - padL) / ((W - padL - padR) / (labels.length - 1)));
  i = Math.max(0, Math.min(labels.length - 1, i));
  const X = padL + (i / (labels.length - 1)) * (W - padL - padR);
  const guide = svg.querySelector(".ml-guide");
  if (guide) { guide.setAttribute("x1", X.toFixed(1)); guide.setAttribute("x2", X.toFixed(1)); guide.setAttribute("visibility", "visible"); }
  svg.querySelectorAll(".ml-dot").forEach((d) => d.setAttribute("r", +d.dataset.i === i ? "5.5" : "3"));
  const tip = svg.parentElement && svg.parentElement.querySelector(".chart-tip");
  if (tip) {
    tip.innerHTML = `<div class="tip-title">${labels[i]} 2026</div>` + names.map((n, si) =>
      `<div class="tip-row"><span class="tip-dot" style="background:${colors[si]}"></span>${n}<b>${series[si][i]}%</b></div>`).join("");
    tip.hidden = false;
    const wrap = svg.parentElement.getBoundingClientRect();
    const left = Math.min(e.clientX - wrap.left + 14, Math.max(0, wrap.width - 190));
    tip.style.left = left + "px";
    tip.style.top = Math.max(4, e.clientY - wrap.top - 12) + "px";
  }
});
document.addEventListener("mouseout", (e) => {
  const svg = e.target.closest && e.target.closest(".ml-chart");
  if (svg && !(e.relatedTarget && svg.contains(e.relatedTarget))) chartTipHide(svg);
});
function applyQuery(q) {
  const needle = q.trim().toLowerCase();
  $$("#view tbody tr").forEach((tr) => {
    tr.style.display = !needle || tr.textContent.toLowerCase().includes(needle) ? "" : "none";
  });
  $$("#view [data-news]").forEach((card) => {
    card.style.display = !needle || card.textContent.toLowerCase().includes(needle) ? "" : "none";
  });
}

document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); $("#globalSearch").focus(); }
  if (e.key === "Escape") { closeModal(); closeAI(); }
  if (e.key === "Enter" && e.target.id === "aiInput") aiAsk(e.target.value);
});

/* ---------- Tema ---------- */
function applyTheme() {
  document.documentElement.dataset.theme = state.theme;
  $("#themeToggle").innerHTML = state.theme === "dark" ? "&#9790;" : "&#9788;";
  $("#themeToggle").title = state.theme === "dark" ? "Ganti ke Light" : "Ganti ke Dark";
}
$("#themeToggle").addEventListener("click", () => {
  state.theme = state.theme === "dark" ? "light" : "dark";
  localStorage.setItem("aai-theme", state.theme);
  applyTheme();
});
$("#aiOpenBtn").addEventListener("click", openAI);
$("#aiCloseBtn").addEventListener("click", closeAI);
$("#aiOverlay").addEventListener("click", closeAI);
$("#aiSendBtn").addEventListener("click", () => aiAsk($("#aiInput").value));
$("#aiChips").addEventListener("click", (e) => {
  const chip = e.target.closest("[data-chip]");
  if (chip) aiAsk(chip.dataset.chip);
});
$("#globalSearch").addEventListener("input", (e) => { state.query = e.target.value; });

/* ---------- Init ---------- */
function afterRender(route) {
  // Elemen DCF sudah punya id di markup (dcfFairValue, dcfMos, dcfVerdict,
  // dcfExpl, dcfProjBody, dcfHeat); updateDCF menargetkannya langsung.
  if (route === "dcf") updateDCF();
}
window.addEventListener("hashchange", render);
applyTheme();
render();
