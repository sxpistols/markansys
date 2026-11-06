# Asisten Analisis Investasi — Implementasi HTML

Implementasi web dari desain FigCraft `Asisten Analisis Investasi v1.0 — Ready for Dev`.
Aplikasi statis (HTML + CSS + JS, tanpa build step), siap deploy ke GitHub Pages.

## Jalankan lokal

```bash
cd asisten-analisis-investasi
python3 -m http.server 8000
# buka http://localhost:8000
```

Membuka `index.html` langsung dari file juga bisa (tidak ada fetch),
tapi font Inter butuh internet (Google Fonts, ada fallback system-ui).

## Deploy ke GitHub Pages

1. Buat repo baru di GitHub, misal `asisten-analisis-investasi`.
2. Push semua file di folder ini ke branch `main` (root repo).
3. Di repo: **Settings → Pages → Build and deployment → Deploy from a branch**
   → Branch `main`, folder `/ (root)` → **Save**.
4. Tunggu 1–2 menit. URL: `https://<username>.github.io/asisten-analisis-investasi/`

## Struktur

| File | Isi |
|---|---|
| `index.html` | Shell: sidebar, topbar, panel AI, modal, toast |
| `styles.css` | Token warna Dark/Light (CSS variables), komponen, responsif |
| `data.js` | Data contoh (DESIGN.md Bagian 9) + format angka Indonesia |
| `charts.js` | Grafik SVG tanpa dependensi (area, donat, batang, candle, garis) |
| `app.js` | Router hash, 12 layar, interaksi, rumus DCF & proyek |

## Yang sudah interaktif

- **Tema Dark/Light beneran berganti** (tombol bulan di topbar, tersimpan di perangkat).
- Navigasi 12 layar via sidebar / bottom bar (mobile).
- Layar 2: tab Saham IDX/Kripto, pencarian, tambah ke Watchlist.
- Layar 3: filter sektor & skor, ubah bobot (50/35/15) — skor total & peringkat dihitung ulang; baris bisa diperluas.
- Layar 4: 3 tab (Fundamental/Teknikal/Sentimen), grafik candlestick, tombol ke DCF & Buat Alert.
- Layar 5: slider pertumbuhan/terminal/WACC menghitung ulang nilai wajar, MoS, tabel proyeksi, dan heatmap sensitivitas secara live.
- Layar 6: input proyek (investasi, umur, arus kas, pajak, bunga) menghitung ulang WACC/NPV/IRR/payback/DSCR per skema dan peringkat.
- Layar 7: toggle alert, hapus alert, modal Buat Alert, tab Riwayat.
- Layar 8: filter aset & sentimen pada berita.
- Layar 9: unggah laporan (dibaca lokal, tidak diunggah ke server).
- Panel AI: slide-over di semua layar (bottom sheet di mobile), jawaban contoh dari kata kunci.
- Layar 12: pilih nama aplikasi (tersimpan di perangkat, bisa dikembalikan).

## Catatan jujur (beda dari angka contoh FigCraft)

Angka contoh di desain adalah ilustrasi, bukan hasil rumus. Implementasi memakai
rumus transparan, jadi beberapa nilai berubah — kesimpulan akhirnya tetap sama:

1. **DCF (Layar 5):** model Gordon 5 tahun eksplisit. Dikalibrasi supaya kasus dasar
   (pertumbuhan 8%, terminal 3,5%, WACC 10,5%) = **Rp 10.350** persis. Grid sensitivitas
   dihitung ulang dari model saat slider berubah (nilai `sensGrid` di `data.js` hanya
   dipakai sebagai bentuk grid 3×3, bukan sebagai tabel statis). **Perubahan asumsi
   2026-11-06:** nilai terminal kini dihitung dari arus kas tahun ke-5, `TV = FCF5 /
   (WACC − pertumbuhan terminal)`, tanpa satu tahun pertumbuhan terminal tambahan
   (sebelumnya `FCF5 × (1+terminal) / (WACC − terminal)`). Perubahan minimal ini
   mendekatkan grid ke tabel acuan FigCraft (DESIGN §9), tapi **tidak mereproduksi
   kesembilan sel** — tidak ada satu varian model Gordon yang diuji (horizon 3–40
   tahun, TV dari FCF5 vs FCF6, diskonto mid-year, pertumbuhan memudar) yang cocok
   dalam ±Rp 50; grid FigCraft kemungkinan ditulis tangan, bukan hasil satu rumus.
   Residu vs FigCraft (Rp): WACC 9,5% → −122 / +199 / +748; 10,5% → −197 / 0 /
   +312; 11,5% → −365 / −261 / −56 (kolom terminal 2,5% / 3,5% / 4,5%). Sel tengah
   tetap Rp 10.350 persis.
2. **Proyek (Layar 6):** WACC = bobot ekuitas × 14% + bobot utang × bunga (11%),
   **tanpa tax shield** — mengikuti tabel acuan FigCraft. Bukti: skema 100% modal
   WACC-nya 14,00% di kedua sisi (jadi biaya ekuitas = 14%), sementara 50:50 di
   FigCraft 12,55% = 0,5×14% + 0,5×11,1% — artinya FigCraft praktis tidak memakai
   tax shield (klaim audit lama "biaya ekuitas ≈16,5%" salah, karena tidak konsisten
   dengan skema 100% modal). Pajak (22%) tetap ditampilkan sebagai data proyek tapi
   tidak memengaruhi WACC pada model ini. Hasil vs FigCraft: 50:50 → WACC 12,50%
   (residu −0,05), NPV +Rp 231 jt (+3); 30:70 → 13,10% (+0,02), +Rp 195 jt (−1);
   100% → 14,00% (0), +Rp 142 jt (0); 70:30 → 11,90% (−0,12), +Rp 268 jt (+7).
   **Skema terbaik tetap 50:50, dan 70:30 tetap diskualifikasi** (DSCR di bawah 1,3x).
   DSCR = arus kas tahun 1 / (bunga tahun 1 + pokok/umur): 50:50 = 1,45x (sama
   persis, dipakai sebagai jangkar), 70:30 = 1,04x (FigCraft 1,15x, residu −0,11),
   **30:70 = 2,42x vs FigCraft 1,80x (residu +0,62) — tidak tereproduksi.** Kandidat
   definisi lain yang diuji (cicilan anuitas 11%/14,2%/20%, grace period 1–2 tahun,
   pokok dibayar menaik/menurun/balloon, bunga atas saldo rata-rata, arus kas setelah
   pajak) semuanya lebih jauh dari ketiganya sekaligus atau merusak jangkar 1,45x;
   satu-satunya yang cocok adalah cicilan dengan komponen tetap ~Rp 141 jt/tahun,
   tapi angka itu tidak ada sumbernya di desain sehingga tidak dipakai (bukan
   fabrikasi data). Jawaban contoh panel AI sudah disamakan dengan hasil hitungan
   baru (NPV 50:50 +Rp 231 jt, DSCR 70:30 1,04x).
3. **Peringkat (Layar 3):** total contoh (82/74/66/48/31) dipakai apa adanya pada bobot
   default, karena tidak persis sama dengan rumus bobot (mis. TLKM 49,15 vs 48 di desain).
   Bila bobot diubah, total dihitung ulang dari rumus.
4. **Donat alokasi (Layar 1):** pusat donat tertulis **Rp 1,28 M** (miliar), bukan
   "Rp 1,28 T" seperti di desain — total portofolio Rp 1.284.560.000 = 1,28 miliar.
   Desain sendiri tidak konsisten (kartu KPI menulis M, donat menulis T).
5. **Data:** semua angka pasar adalah data contoh berlabel **Dummy** (DESIGN.md Bagian 9).
   Tidak ada data live. Seri histori, candle, dan tren tim disintesis.
6. **MA 50/200 (Layar 4):** dengan 20 candle contoh, yang digambar adalah MA 5 dan MA 10;
   dijelaskan di layar. MACD tidak ada pada data contoh (slot "—").

## Langkah berikut (opsional)

- **Data live:** pola yang sama seperti DOIntelligence — GitHub Actions mengambil
  harga dari Yahoo Finance/CoinGecko ke JSON di branch `data`, lalu `data.js`
  memuat JSON itu bila tersedia (fallback ke data contoh). Beri tahu saya bila mau
  dibuatkan.
- **Nama repo & domain:** ganti nama repo sesuai selera; URL Pages mengikuti nama repo.
