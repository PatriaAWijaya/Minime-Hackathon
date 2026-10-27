# Hasil Gerbang Fase 0 (checklist rencana kegiatan)

Diperbarui 27 Okt 2026 ~11:30 WIB — pembaruan ini tidak mengubah vonis:
Fase 0 tetap TIDAK LOLOS GERBANG PENUH, hanya bukti per kakinya yang
diperbarui dengan pengukuran live yang sudah dilakukan.

| # | Kriteria gerbang | Status | Bukti |
|---|---|---|---|
| 1 | Repo ter-push dan terbaca-balik; scan nol kredensial | LOLOS | Remote HEAD `bb551db`, tree identik dengan lokal (`fa50e32`), terverifikasi baca-balik via ls-remote; `npm run scan` PASSED |
| 2 | Kontrak JSON v1 tervalidasi; 1 job contoh selesai dengan CostRecord + trace ID | LOLOS (mock) | gate-test + `docs/fase-0-sample-output.json`, `mock: true`, draft `published: false` |
| 3 | Tiga jalur router teruji live dan hasilnya tercatat per jalur | TIDAK LOLOS PENUH — SEBAGIAN TERBUKTI | Ollama live LOLOS di MacBook target (deepseek-r1:1.5b GPU 4,2 detik, 112 token; qwen2.5:3b 2,5 detik). Gemini live LOLOS lewat konektor (gemini-3.1-flash-lite, 21 token input + 65 output, ~3 detik) — TETAPI bukan lewat kode router: router memakai header `x-goog-api-key`, sementara kredensial Secure Vault hanya berlaku lewat `?key=` + surrogate yang ditukar Sentinel di egress; jadi tes live lewat kode router masih tertunda sampai plumbing auth itu diadaptasi. Muse live TERTUNDA (klaim/kartu Meta belum selesai, Patria-only). |
| 4 | Fallback teruji sengaja; QC lintas-keluarga teruji | SEBAGIAN — rantai lokal LOLOS, QC live tertunda | Rantai lokal deepseek 1.5b -> qwen 3b teruji mock-server (primer gagal HTTP 500 -> hasil qwen, family qwen, fallbackFrom primer, cost 0; keduanya gagal -> LiveUnavailableError). Pemetaan QC lintas-keluarga teruji di mock (termasuk qwen -> Gemini). QC live tertunda (butuh Meta). |
| 5 | Policy Engine menolak produksi sebelum GSTP dan publish tanpa approval batch | LOLOS | Gate-test uji negatif + HTTP 403 |
| 6 | Provider gambar pertama + harga aktual tercatat; status Postiz tercatat; biaya re-baseline dari ledger | TIDAK LOLOS PENUH — SEBAGIAN | Postiz: TERCATAT — terinstal di `~/postiz-mac/postiz-mac/` (v2.25.1, 17 Okt) dan `Postiz.app` di Desktop, TETAPI tidak berjalan (tidak ada proses, port 4007 kosong, Docker daemon tidak jalan; port 5000 yang listen adalah Control Center macOS/AirPlay, bukan Postiz). Provider gambar = Muse Image (PROVISIONAL, harga tertunda — menunggu Meta aktif). Re-baseline parsial: Ollama cost Rp0 (latensi terukur di atas); Gemini 86 token per tugas singkat, biaya ilustratif ~$0,0001 per tugas singkat pada tarif publikasi sekunder $0,25/1M input + $1,50/1M output (bukan tarif ledger resmi — perlu konfirmasi halaman pricing Google sebelum dipakai sebagai angka ledger). Ledger repo sejauh ini masih mock USD 0. |
| 7 | Log build Fase 0 ditulis; daftar potong/penundaan ditulis jujur | LOLOS | `docs/fase-0-log.md` (diperbarui s.d. fallback Qwen + temuan auth Gemini + status Postiz) |

## Vonis Fase 0

**FASE 0 TIDAK LOLOS GERBANG PENUH.** Fondasi kode (Blok B–G) berdiri dan
teruji dengan mock yang dilabeli, kaki Ollama kini terbukti live di mesin
target, dan Gemini terbukti live lewat konektor — tetapi dua kunci gerbang
masih tertunda: (1) tes live lewat kode router untuk Gemini (plumbing
auth) dan untuk Muse (klaim/kartu), (2) re-baseline biaya penuh dari
harga aktual. Sesuai rencana, Fase 1 TIDAK boleh dimulai dengan klaim
bahwa gerbang Fase 0 sudah lolos. Yang boleh dilanjutkan tanpa klaim palsu:

- Persiapan Fase 1 dengan brand uji TEST dan STP draf (tanpa persetujuan
  gate atas nama Patria).
- Pengulangan tes live begitu prasyarat Patria-only selesai dan plumbing
  auth Gemini diadaptasi.
- Push begitu cek mendalam lolos (pola yang sudah terbukti).

## Yang dipotong / ditunda di Fase 0 (bukan disembunyikan)

- Tes live Muse lewat kode router: TERTUNDA (klaim/kartu Meta, Patria-only).
- Tes live Gemini lewat kode router: TERTUNDA (plumbing auth: header vs
  `?key=` + surrogate; live lewat konektor sudah terbukti, bukan
  pengganti tes kode router).
- Re-baseline biaya penuh: TERTUNDA (hanya parsial Ollama + Gemini di atas).
- Verifikasi API Postiz: BELUM DILAKUKAN (instans tidak berjalan; butuh
  Docker + start Postiz, diputuskan di Fase 3, bukan gerbang Fase 0).
- Video, kirim Outreach nyata, publish live, Mini-App: tetap DIPOTONG
  sesuai Rencana Build (bukan bagian Fase 0).
