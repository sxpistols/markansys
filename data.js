/* data.js — Data contoh (DESIGN.md Bagian 9).
   Semua angka di sini adalah DATA CONTOH (dummy) dari dokumen desain,
   bukan data pasar live. Di UI selalu berlabel "Dummy".
   Struktur dibuat agar nanti bisa diganti sumber live (mis. JSON dari
   GitHub Actions seperti DOIntelligence) tanpa mengubah layar. */
"use strict";

const DATA = {
  meta: { updated: "6 Nov 2026, 14:32 WIB", idxDelayed: true, source: "IDX (tertunda 15 mnt)" },

  portfolio: {
    total: 1284560000, modal: 1150000000, profit: 134560000, profitPct: 11.70,
    best: { kode: "BBCA", nama: "Bank Central Asia", chg: 18.4 },
    worst: { kode: "GOTO", nama: "GoTo Gojek Tokopedia", chg: -22.1 },
    // Seri histori disintesis (DESIGN hanya memberi total) — berlabel Dummy.
    history: {
      labels: ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov"],
      values: [1150, 1170, 1155, 1200, 1190, 1230, 1220, 1250, 1240, 1270, 1284.56],
      unit: "Rp T"
    },
    allocation: [
      { label: "Saham IDX", pct: 58, color: "var(--chart-1)" },
      { label: "Kripto", pct: 14, color: "var(--chart-2)" },
      { label: "Emas", pct: 12, color: "var(--chart-3)" },
      { label: "Reksa Dana", pct: 10, color: "var(--chart-4)" },
      { label: "Kas", pct: 6, color: "var(--chart-5)" }
    ]
  },

  positions: [
    { kode: "BBCA", nama: "Bank Central Asia", jumlah: 20000, satuan: "lembar", avg: 8210, harga: 9725, nilai: 194500000, pnl: 30300000, pnlPct: 18.4, bobot: 15.1 },
    { kode: "BBRI", nama: "Bank Rakyat Indonesia", jumlah: 40000, satuan: "lembar", avg: 4050, harga: 4180, nilai: 167200000, pnl: 5200000, pnlPct: 3.2, bobot: 13.0 },
    { kode: "TLKM", nama: "Telkom Indonesia", jumlah: 50000, satuan: "lembar", avg: 3020, harga: 2810, nilai: 140500000, pnl: -10500000, pnlPct: -7.0, bobot: 10.9 },
    { kode: "BMRI", nama: "Bank Mandiri", jumlah: 15000, satuan: "lembar", avg: 5600, harga: 5950, nilai: 89250000, pnl: 5250000, pnlPct: 6.3, bobot: 6.9 },
    { kode: "GOTO", nama: "GoTo Gojek Tokopedia", jumlah: 600000, satuan: "lembar", avg: 87, harga: 68, nilai: 40800000, pnl: -11400000, pnlPct: -21.8, bobot: 3.2 },
    { kode: "BTC", nama: "Bitcoin", jumlah: 0.08, satuan: "BTC", avg: 1300000000, harga: 1520000000, nilai: 121600000, pnl: 17600000, pnlPct: 16.9, bobot: 9.5 },
    { kode: "Emas Antam", nama: "PT Aneka Tambang", jumlah: 100, satuan: "gram", avg: 1350000, harga: 1520000, nilai: 152000000, pnl: 17000000, pnlPct: 12.6, bobot: 11.8 }
  ],

  watchlist: [
    { kode: "BBCA", nama: "Bank Central Asia", harga: 9725, chgRp: 120, chgPct: 1.25, sumber: "IDX (tertunda 15 mnt)", update: "14:32 WIB" },
    { kode: "BBRI", nama: "Bank Rakyat Indonesia", harga: 4180, chgRp: 20, chgPct: 0.48, sumber: "IDX (tertunda 15 mnt)", update: "14:32 WIB" },
    { kode: "BMRI", nama: "Bank Mandiri", harga: 5950, chgRp: -25, chgPct: -0.42, sumber: "IDX (tertunda 15 mnt)", update: "14:32 WIB" },
    { kode: "TLKM", nama: "Telkom Indonesia", harga: 2810, chgRp: -30, chgPct: -1.06, sumber: "IDX (tertunda 15 mnt)", update: "14:32 WIB" },
    { kode: "ASII", nama: "Astra International", harga: 4840, chgRp: 40, chgPct: 0.83, sumber: "IDX (tertunda 15 mnt)", update: "14:32 WIB" },
    { kode: "GOTO", nama: "GoTo Gojek Tokopedia", harga: 68, chgRp: -2, chgPct: -2.86, sumber: "IDX (tertunda 15 mnt)", update: "14:32 WIB" },
    { kode: "BTC", nama: "Bitcoin", harga: 1520000000, chgRp: 31270000, chgPct: 2.10, sumber: "Penyedia kripto", update: "14:35 WIB" },
    { kode: "ETH", nama: "Ethereum", harga: 52400000, chgRp: 724000, chgPct: 1.40, sumber: "Penyedia kripto", update: "14:35 WIB" }
  ],

  ranking: [
    { kode: "BBCA", nama: "Bank Central Asia", total: 82, fund: 88, tekn: 76, sent: 80, rek: "Layak Diteliti", alasan: "Laba stabil, ROE tinggi, tren harga naik." },
    { kode: "BBRI", nama: "Bank Rakyat Indonesia", total: 74, fund: 79, tekn: 68, sent: 75, rek: "Layak Diteliti", alasan: "Dividen konsisten, valuasi masih wajar." },
    { kode: "ASII", nama: "Astra International", total: 66, fund: 70, tekn: 61, sent: 67, rek: "Pantau", alasan: "Valuasi murah, momentum belum kuat." },
    { kode: "TLKM", nama: "Telkom Indonesia", total: 48, fund: 60, tekn: 35, sent: 46, rek: "Pantau", alasan: "Dividen baik, tren harga melemah." },
    { kode: "GOTO", nama: "GoTo Gojek Tokopedia", total: 31, fund: 28, tekn: 30, sent: 36, rek: "Hindari Dulu", alasan: "Belum stabil mencetak laba." }
  ],
  weights: { fund: 50, tekn: 35, sent: 15 },

  bbca: {
    kode: "BBCA", nama: "Bank Central Asia", harga: 9725, chgPct: 1.25,
    per: 22.4, pbv: 4.1, roe: 20.3, divYield: 2.6, labaYoY: 8.5,
    rsi: 62, support: 9400, resistance: 10000,
    alasan: "Bank dengan laba konsisten dan biaya dana murah. Harga bergerak di atas rata-rata 200 hari, tapi valuasi sudah tidak murah.",
    fundReasons: ["Laba stabil dan ROE 20,3%.", "Dividen konsisten 2,6% per tahun."],
    teknReasons: ["Harga di atas MA 200 hari.", "RSI 62, belum jenuh beli."],
    sentReasons: ["Berita kuartal ketiga cenderung positif.", "Skor sentimen +0,58."],
    sentiment: 0.58,
    // 20 candle sintetis (Dummy) — rentang 9.400–10.000.
    ohlc: [
      [9420, 9510, 9400, 9480], [9480, 9560, 9460, 9530], [9530, 9580, 9490, 9510],
      [9510, 9540, 9440, 9470], [9470, 9550, 9450, 9530], [9530, 9620, 9510, 9590],
      [9590, 9650, 9560, 9610], [9610, 9680, 9590, 9660], [9660, 9700, 9600, 9620],
      [9620, 9680, 9600, 9660], [9660, 9720, 9640, 9700], [9700, 9760, 9680, 9720],
      [9720, 9780, 9700, 9740], [9740, 9800, 9720, 9780], [9780, 9840, 9760, 9810],
      [9810, 9860, 9780, 9820], [9820, 9880, 9800, 9850], [9850, 9900, 9830, 9880],
      [9880, 9930, 9860, 9900], [9900, 9960, 9880, 9725]
    ]
  },

  dcf: {
    kode: "BBCA", hargaPasar: 9725, nilaiWajar: 10350, mos: 6.0,
    growth: 8, terminal: 3.5, wacc: 10.5,
    // Grid sensitivitas (WACC x pertumbuhan terminal) dari DESIGN §9.
    sensWacc: [9.5, 10.5, 11.5], sensTerm: [2.5, 3.5, 4.5],
    sensGrid: [
      [10900, 11900, 13200],
      [9600, 10350, 11300],
      [8700, 9300, 10000]
    ]
  },

  project: {
    nama: "Kedai Kopi Cabang Bandung", investasi: 2000000000, umur: 5,
    arusKas: [450000000, 550000000, 650000000, 750000000, 850000000],
    pajak: 22, bunga: 11,
    // Asumsi rumus (terbuka, bisa diubah): biaya ekuitas 14%, bunga utang 11%.
    biayaEkuitas: 14,
    schemes: [
      { label: "50% utang : 50% ekuitas", utang: 50 },
      { label: "30% utang : 70% ekuitas", utang: 30 },
      { label: "100% modal sendiri", utang: 0 },
      { label: "70% utang : 30% ekuitas", utang: 70 }
    ],
    lainnya: ["Gudang Pendingin Sidoarjo", "Kos Eksklusif Yogyakarta", "Pabrik Keripik Singkong Lampung"]
  },

  alerts: [
    { id: 1, aset: "BBCA", nama: "Bank Central Asia", kondisi: "Naik ke", target: 10000, harga: 9725, aktif: true },
    { id: 2, aset: "TLKM", nama: "Telkom Indonesia", kondisi: "Turun ke", target: 2700, harga: 2810, aktif: true },
    { id: 3, aset: "BTC", nama: "Bitcoin", kondisi: "Naik ke", target: 1600000000, harga: 1520000000, aktif: true }
  ],
  alertHistory: [
    { teks: "BBRI mencapai Rp 4.200", waktu: "4 Nov 2026, 10:14 WIB", kanal: "Email" },
    { teks: "ASII turun ke Rp 4.800", waktu: "30 Okt 2026, 13:02 WIB", kanal: "Di aplikasi" }
  ],

  news: [
    { judul: "Laba bank besar tumbuh di kuartal ketiga", sumber: "Kontan", tanggal: "5 Nov 2026", sentimen: "Positif", skor: 0.62, aset: ["BBCA", "BBRI", "BMRI"],
      ringkasan: "Laba bank-bank besar naik pada kuartal ketiga 2026." },
    { judul: "Telkom restrukturisasi anak usaha, investor menunggu rincian", sumber: "Bisnis Indonesia", tanggal: "5 Nov 2026", sentimen: "Netral", skor: 0.04, aset: ["TLKM"],
      ringkasan: "Telkom merestrukturisasi anak usaha, investor menunggu rincian lebih lanjut." },
    { judul: "Saham teknologi tertekan arus jual asing", sumber: "CNBC Indonesia", tanggal: "4 Nov 2026", sentimen: "Negatif", skor: -0.48, aset: ["GOTO"],
      ringkasan: "Arus jual asing menekan saham teknologi." }
  ],
  sentimentByAsset: [
    { kode: "BBCA", skor: 0.58 }, { kode: "BBRI", skor: 0.41 },
    { kode: "TLKM", skor: -0.12 }, { kode: "GOTO", skor: -0.44 }, { kode: "BTC", skor: 0.30 }
  ],

  team: {
    periode: "Okt 2026", target: 2400000000, capaian: 2136000000, pct: 89,
    anggota: [
      { nama: "Rina Wulandari", target: 600000000, capaian: 654000000, pct: 109, status: "Di atas target" },
      { nama: "Bagas Pratama", target: 600000000, capaian: 552000000, pct: 92, status: "Hampir tercapai" },
      { nama: "Sari Anggraeni", target: 600000000, capaian: 498000000, pct: 83, status: "Perlu perhatian" },
      { nama: "Dimas Hidayat", target: 600000000, capaian: 432000000, pct: 72, status: "Di bawah target" }
    ],
    // Tren disintesis (Dummy).
    tren: {
      labels: ["Mei", "Jun", "Jul", "Agu", "Sep", "Okt"],
      agregat: [78, 81, 84, 82, 87, 89],
      rina: [95, 98, 102, 100, 106, 109],
      bagas: [80, 84, 86, 85, 90, 92],
      sari: [72, 76, 78, 77, 81, 83],
      dimas: [64, 66, 70, 68, 71, 72]
    },
    temuan: "Penurunan terbesar terjadi pada segmen UMKM Jawa Timur; konversi lead turun 6 poin dibanding bulan lalu."
  },

  ai: {
    konteks: "Sedang melihat: Detail BBCA",
    jawaban: "Skor 82 artinya BBCA tampak kuat dari tiga sisi: keuangannya sehat, harganya sedang naik, dan beritanya cenderung positif. Tapi harganya sudah tidak murah, jadi pelajari dulu sebelum membeli. Ini bukan nasihat investasi.",
    saran: ["Apa arti PER 22,4x?", "Apa risikonya?", "Bandingkan dengan BBRI"]
  },

  names: [
    { nama: "Telaah Investasi", alasan: "Menekankan analisis mendalam sebelum memutuskan." },
    { nama: "Kompas Modal", alasan: "Penunjuk arah untuk modal dan investasi." },
    { nama: "Pandu Cuan", alasan: "Panduan santai menuju cuan." }
  ]
};

/* ---------- Format angka Indonesia (DESIGN §4) ---------- */
function fmtRp(n, desimal = 0) {
  return "Rp " + Number(n).toLocaleString("id-ID", { minimumFractionDigits: desimal, maximumFractionDigits: desimal });
}
function fmtNum(n, desimal = 0) {
  return Number(n).toLocaleString("id-ID", { minimumFractionDigits: desimal, maximumFractionDigits: desimal });
}
function fmtPct(n, desimal = 1) {
  const v = Math.abs(n).toLocaleString("id-ID", { minimumFractionDigits: desimal, maximumFractionDigits: desimal });
  return (n > 0 ? "+" : n < 0 ? "−" : "") + v;
}
function fmtSingkat(n) {
  const a = Math.abs(n);
  if (a >= 1e12) return "Rp " + (n / 1e12).toLocaleString("id-ID", { maximumFractionDigits: 2 }) + " T";
  if (a >= 1e9) return "Rp " + (n / 1e9).toLocaleString("id-ID", { maximumFractionDigits: 2 }) + " M";
  if (a >= 1e6) return "Rp " + (n / 1e6).toLocaleString("id-ID", { maximumFractionDigits: 2 }) + " jt";
  return fmtRp(n);
}
function scoreColor(s) { return s >= 70 ? "var(--market-up)" : s >= 40 ? "var(--state-warning)" : "var(--market-down)"; }
function scoreLabel(s) { return s >= 70 ? "Kuat" : s >= 40 ? "Netral" : "Lemah"; }
function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
