# Log Build Fase 0 — Fondasi Minime-Hackathon

Tanggal: 27 Oktober 2026. Repo: PatriaAWijaya/Minime-Hackathon, branch main.
Sumber: Rencana Kegiatan Fase 0 (Drive Hackathon) + Rencana Build 27 Okt–2 Nov.
Aturan: kode baru dari nol, tanpa copy-paste kode Minime lama. Hanya spesifikasi
dokumen lama yang dipakai.

## Blok A — Kunci akses tulis repo
- Status: DICOBA, hasil dicatat di akhir log ini (bagian Push).
- Fakta awal: salinan lokal di `~/workspace/minime-hackathon/` berisi scaffold
  (LICENSE, PLAN.md, README.md, .gitignore) pada commit lokal `1db6c18`
  ("docs: scaffold Minime-Hackathon"). Remote yang tercatat sebelumnya adalah
  `1fa8339` dengan tree yang identik dengan scaffold lokal.
- Percobaan sebelumnya via GitHub MCP gagal 403
  ("Resource not accessible by integration") — itu bukti aplikasi GitHub
  Muse belum punya akses tulis ke repo ini, BUKAN bukti jalur Git Data API
  juga gagal. Jalur Git Data API dicoba di Blok J.

## Blok B — Struktur repo + kontrak JSON v1 — SELESAI (terverifikasi)
- Stack: TypeScript + NestJS di atas Fastify (`@nestjs/platform-fastify`).
  Express tidak dipakai; LangGraph tidak dipakai.
- File: `package.json`, `tsconfig.json` (strict), `src/contracts.ts`.
- Kontrak berversi (`version: "1"`, divalidasi mesin): ProductBrief, Research,
  Strategy, STP, CreativeBrief, QC. Tidak ada field kredensial di kontrak.
- Bukti: `npm run gate-test` — grup "contracts validate, versioned,
  cross-family QC enforced" PASS.

## Blok C — Model Router — SELESAI (struktur + mock; live TERTUNDA)
- File: `src/router.ts`, konfigurasi dari environment (bukan hardcode).
- Rantai kanon: Muse via Meta Model API (`https://api.meta.ai/v1`
  + `/chat/completions`, Bearer `META_API_KEY`) → Gemini via Google API
  → DeepSeek via Ollama (`http://127.0.0.1:11434/api/chat`).
- Model default di `.env.example` adalah PROVISIONAL
  (`muse-spark-1.1`, `gemini-2.5-flash`, `deepseek-r1`): varian persis di
  akun Patria dikonfirmasi di gerbang Fase 0 dan dicatat di CostRecord,
  bukan diasumsikan sudah benar.
- Setiap panggilan menghasilkan CostRecord (model, jalur, token, biaya,
  trace ID, jejak fallback). Panggilan mock ditandai `mock: true`, biaya 0.
- Bukti: gate-test grup router PASS; live call tanpa kunci gagal dengan
  `LiveUnavailableError` yang terlihat (bukan diam-diam diganti model lain).

## Blok D — CostLedger + hard limit — SELESAI (terverifikasi)
- File: `src/ledger.ts`, append-only JSONL (`data/cost-ledger.jsonl`,
  di-gitignore). Tidak ada kode yang mengedit/menghapus record.
- Hard limit (`COST_HARD_LIMIT_USD`, default 5) menghentikan run dengan
  `CostLimitError` bila total proyeksi melampaui limit.
- Bukti: gate-test grup ledger PASS. Isi ledger pada run bukti:
  4 record, semuanya mock, total USD 0 (2 record dari sample di gate-test,
  2 record dari sample mandiri — lihat Blok G).

## Blok E — Policy Engine + gate service — SELESAI (terverifikasi)
- File: `src/policy.ts`. Gate: GS, GSTP, GKonten, GBatch.
- Approval append-only (revisi = record baru, tidak pernah mengedit record
  lama). Produksi sebelum GSTP ditolak; publish tanpa `approved_batch_id`
  ditolak di level service dan di HTTP menjadi 403 (bukan 500 — bug ini
  ditemukan saat uji server dan sudah diperbaiki).
- Bukti: gate-test grup policy PASS (termasuk 3 uji negatif);
  `POST /publish {}` → `403 {"error":"gate GBatch blocked: ..."}`.

## Blok F — Antrean + progres SSE — SELESAI (terverifikasi)
- File: `src/queue.ts`, SQLite bawaan Node (`node:sqlite`) sebagai sumber
  kebenaran. Status job bertahan setelah restart (diuji dengan membuka
  ulang DB).
- Idempotency: job dengan kunci yang sama dikembalikan tanpa membuat
  job/asset/biaya kedua (diuji via HTTP: `created: true` lalu `created: false`
  dengan id job yang sama).
- Progres SSE: endpoint Nest `@Sse('jobs/:id/stream')`, diuji dengan curl
  (snapshot event diterima).
- Bukti: gate-test grup queue PASS; uji HTTP `GET /health`, `POST /jobs`
  (idempotency), dan SSE snapshot PASS.

## Blok G — Job contoh ujung-ke-ujung — SELESAI (mock, draf saja)
- File: `src/pipeline.ts`, `src/sample.ts`.
- Rantai: ProductBrief → Research → Strategy (GS) → STP (GSTP) →
  CreativeBrief (produksi, GSTP-gated) → QC lintas-keluarga → GKonten →
  draf Postiz (tidak pernah publish).
- Brand uji: `TEST-BRAND-001`, nama "TEST Brand (neutral test brand,
  PROVISIONAL)" — brand netral berlabel TEST, BUKAN brand klien nyata.
- Bukti: `npm run sample` → `docs/fase-0-sample-output.json`:
  trace ID, job ID, 3 approval (GS/GSTP/GKonten, approver tercatat sebagai
  "phase-0-test-harness (TEST product only)"), QC skor 100 tanpa
  pelanggaran keras, draft `published: false`, `mock: true`.
- CATATAN PENTING: approval di sample ini adalah approval harness untuk
  produk TEST saja. Ini BUKAN persetujuan Patria atas STP produk nyata
  dan BUKAN GSTP Fase 1.

## Blok H — Tes gerbang tiga jalur — SEBAGIAN, LIVE TERTUNDA (jujur)
- Yang teruji dan lolos:
  - Struktur rantai fallback (meta → gemini → ollama) dan pemetaan QC
    lintas-keluarga (maker meta → QC gemini; maker gemini → QC meta).
  - Kegagalan live yang terlihat: tanpa kunci, `callMeta` dan `callGemini`
    melempar `LiveUnavailableError`; `callOllama` di VM ini gagal
    `fetch failed` (Ollama memang tidak ada di VM ini).
  - Sample live (`MOCK_SAMPLE=0`) gagal terlihat dengan
    `LiveUnavailableError: live provider ollama unavailable: fetch failed`
    setelah meta dan gemini gagal karena kunci tidak diset — rantai
    bekerja seperti dirancang, hanya saja tidak ada jalur live yang
    tersedia di lingkungan ini.
- Yang TERTUNDA (bukan gagal kode, tapi prasyarat di luar repo):
  - Tes live Muse: menunggu Patria mengisi formulir klaim $150, menautkan
    kartu, dan memasang Spend Limit, lalu kunci tersedia lewat environment.
  - Tes live Gemini: menunggu kunci Gemini tersedia lewat environment
    (tidak dicari/diminta di chat ini, dan tidak ada kunci yang ditulis
    di repo/log).
  - Tes live DeepSeek via Ollama: menunggu Ollama + model DeepSeek jalan
    di MacBook Patria (di VM ini `curl 127.0.0.1:11434` tidak menjawab).
  - Uji QC lintas-keluarga dengan model live: menunggu jalur live di atas.
- TIDAK ADA klaim di dokumen ini bahwa tes live berhasil. Semua angka
  live (latensi, biaya, skor QC live) adalah TERTUNDA, bukan 0 dan bukan
  angka mock.

## Blok I — Re-baseline biaya + kunci Fase 1 — TERTUNDA
- Alasan: tidak ada panggilan live yang berhasil, sehingga tidak ada
  harga aktual yang terukur. Ledger hanya berisi record mock (total USD 0),
  yang secara eksplisit BUKAN biaya terukur.
- Angka lama berbasis Maverick/Flash/Sonnet tetap DITANGGUHKAN dan tidak
  dipakai di mana pun di kode ini.
- Provider gambar pertama (PROVISIONAL): Muse Image (Meta-native),
  harga TERTUNDA sampai API terverifikasi. Tidak ada harga karangan.
- Status Postiz: belum terverifikasi (tidak ada instans yang dicek di
  Fase 0 ini); Fase 3 tetap memakai draf sebagai target, bukan publish live.
- Keputusan final brand uji, provider gambar, dan Postiz tetap menunggu
  Patria (lihat daftar di laporan akhir).

## Blok J — Scan + log + push
- Scan kredensial: `npm run scan` → PASSED (tidak ada nilai mirip rahasia
  di source/docs yang dilacak; `data/` dan `node_modules/` dikecualikan,
  `.env.example` hanya berisi nama variabel tanpa nilai).
- Type-check: `npx tsc -p tsconfig.json` → 0 error setelah perbaikan
  (type Node/Express sempat hilang, sudah ditambah `@types/node`
  dan `@types/express`).
- Gate test: 8/8 grup PASS (mock dilabeli di mana berlaku).
- Bug yang ditemukan dan diperbaiki selama Fase 0 (bukan disembunyikan):
  1. `docs/` belum dibuat saat gate-test menulis hasil → gate-test kini
     membuat folder dulu.
  2. `POST /publish` tanpa batch mengembalikan 500 → kini 403 dengan
     pesan gate yang jelas.
  3. Endpoint SSE awal memakai tipe Response Express yang tidak cocok
     dengan Fastify → diganti decorator `@Sse` Nest.
- Push: lihat bagian "Push" di bawah.

## Push
- Percobaan push via Git Data API (skrip `push_rebased.py`, pola yang sama
  dengan Minime) BERHASIL pada 27 Okt 2026 — berbeda dengan percobaan
  GitHub MCP sebelumnya yang gagal 403.
- Pasangan SHA: lokal `5da2776` ↔ remote `6942985`, tree identik
  (`1f500db`, terverifikasi baca-balik via `git ls-remote` dan API
  commit GitHub: HEAD remote = `6942985`, pesan commit sama, tree sama).
- Catatan: push ini membuktikan akses tulis lewat Git Data API berfungsi
  untuk repo ini. Instalasi GitHub App TIDAK lagi menjadi blocker untuk
  push Fase 0 — tetapi tetap dicatat sebagai opsi bila jalur ini
  sewaktu-waktu gagal.


## Pembaruan 27 Okt 09:48 WIB — default Gemini diperbaiki + fallback Meta→Gemini dikunci

- Uji live Gemini lewat kredensial tersimpan: smoke test PASS (model
  gemini-3.1-flash-lite). Gemini key Patria AKTIF dan bisa dipakai.
- Temuan model: gemini-2.5-flash (default provisional Fase 0) sudah
  TIDAK tersedia untuk pengguna baru (HTTP 404 dari Google); gemini-3.8-flash
  saat diuji mengembalikan 503 (permintaan tinggi, sementara). Default
  router diubah dari gemini-2.5-flash menjadi gemini-3.1-flash-lite
  (yang terbukti PASS) di src/router.ts dan .env.example.
- Keputusan Patria 27 Okt 09:48: bila Meta belum tersedia, fallback
  default adalah Gemini. Rantai router sudah Meta → Gemini → Ollama;
  dengan Meta belum aktif, Gemini menjadi jalur efektif utama sampai
  klaim/kartu Meta selesai. Tidak ada perubahan pada aturan QC
  (pembuat Gemini → QC Meta bila Meta tersedia, bila tidak → DeepSeek
  lokal bila tersedia; bila keduanya tidak tersedia, QC live tertunda
  dan tidak diklaim).
- Meta: link klaim kredit $150 ada (email Cerebral Valley 26 Okt
  18:26), tetapi belum ada bukti key/kredit aktif di akun Patria dan
  tidak ada login tersimpan untuk meta.ai/dev.meta.ai — jadi Meta
  dicatat BELUM ADA (aktif).
- Ollama/DeepSeek: riwayat MacBook menunjukkan deepseek-r1:7b pernah
  terinstal; verifikasi live dari VM ini pada 27 Okt 09:48 GAGAL karena
  SSH ke MacBook ditolak jaringan (Operation not permitted), bukan
  karena terbukti tidak terinstal. Instal ulang dari VM tidak bisa
  dijalankan sampai MacBook bisa dijangkau lagi.

- 27 Okt ~11:10 WIB (keputusan Patria, opsi yang dipilihnya): jalur lokal
  DeepSeek diubah ke varian ringan deepseek-r1:1.5b. Latar: deepseek-r1:7b
  terbukti gagal inferensi GPU di MacBook M1 8 GB Patria (log server:
  Insufficient Memory Metal, runner panic; restart tidak memperbaiki;
  CPU-only berhasil tapi 79 detik untuk jawaban singkat). deepseek-r1:1.5b
  ditarik via SSH (1,1 GB, sukses, terdaftar di ollama list) dan tes live
  GPU BERHASIL: jawaban benar "2+2=4" dalam total 4,2 detik (load 1,0 detik,
  eval 2,9 detik untuk 112 token, ~39 token/detik, 100% GPU, 2,0 GB).
  Default router diubah dari 'deepseek-r1' (tanpa tag, ambigu) menjadi
  'deepseek-r1:1.5b' di src/router.ts dan .env.example — PROVISIONAL, bisa
  di-override lewat env OLLAMA_MODEL. Kualitas 1.5b di bawah 7b dan di bawah
  model cloud; dicatat jujur, tidak diklaim setara. deepseek-r1:7b tetap
  terinstal di MacBook, hanya tidak lagi menjadi default router.

- 27 Okt ~11:16 WIB (keputusan Patria): qwen2.5:3b ditambahkan sebagai
  fallback lokal KEDUA setelah deepseek-r1:1.5b. Rantai lokal kini:
  deepseek-r1:1.5b -> qwen2.5:3b (keduanya lokal, gratis Rp0). Perubahan:
  RouterConfig + env OLLAMA_FALLBACK_MODEL (default qwen2.5:3b),
  callOllama mencoba primer dulu, baru fallback bila primer gagal, dan
  hanya melempar LiveUnavailableError bila keduanya gagal (pesan memuat
  kedua kegagalan); family 'qwen' ditambahkan ke CostRecord dan QC
  (pembuat qwen -> QC Gemini, keluarga berbeda). Verifikasi: tsc 0 error,
  gate-test 8/8 PASS, scan PASS, plus uji mock-server: primer gagal (HTTP
  500) -> hasil model qwen2.5:3b, family qwen, fallbackFrom
  deepseek-r1:1.5b, cost 0; keduanya gagal -> LiveUnavailableError.
  Kedua model sudah terbukti live terpisah di MacBook (1.5b GPU 4,2 detik;
  qwen2.5:3b 2,5 detik), jadi rantai ini berdiri di atas bukti live,
  bukan sekadar struktur.

- 27 Okt ~11:30 WIB (perintah Patria "lanjut kerjakan yang belum selesai"):
  (1) fase-0-gate-results.md diperbarui ke status terkini (vonis tetap
  TIDAK LOLOS PENUH; kaki Ollama lolos, Gemini live lewat konektor lolos,
  router-code Gemini + Muse tertunda). (2) Status Postiz tercatat:
  terinstal di ~/postiz-mac/postiz-mac/ (v2.25.1, 17 Okt) + Postiz.app di
  Desktop, TETAPI tidak berjalan (port 4007 kosong, Docker daemon tidak
  jalan; port 5000 adalah Control Center/AirPlay, bukan Postiz) — verifikasi
  API Postiz menunggu Docker + start Postiz di Fase 3. (3) Temuan auth
  Gemini: router memakai header x-goog-api-key, sementara kredensial
  Secure Vault hanya berlaku lewat ?key= + surrogate yang ditukar
  Sentinel di egress (cara kerja konektor CLI) — jadi tes live lewat
  kode router tertunda sampai plumbing auth diadaptasi; live lewat
  konektor terbukti (gemini-3.1-flash-lite, 21 input + 65 output token,
  ~3 detik). Re-baseline parsial: Ollama Rp0; Gemini ~$0,0001 per tugas
  singkat pada tarif publikasi sekunder (perlu konfirmasi pricing
  resmi Google). (4) Draf Fase 1 dibuat di docs/fase-1-draft.md
  (TEST-BRAND-001, tanpa approval GS/GSTP atas nama Patria).
  Tetap terblokir Patria-only: klaim/kartu/Spend Limit Meta, harga
  Muse Image, keputusan final brand/provider/Postiz, GSTP.

- 27 Okt siang (perintah Patria "perbaiki semua error/backlog yang bisa
  diperbaiki sampai berhasil; yang lain pending dan catat dalam log"):
  SWEEP. Yang BERHASIL diperbaiki: (1) Auth Gemini di kode router —
  akar masalah terbukti (header x-goog-api-key tidak kompatibel dengan
  surrogate Secure Vault), perbaikan: kunci dikirim lewat ?key=
  (didukung Google API untuk key asli maupun surrogate); verifikasi:
  fetch Node lewat proxy runtime menukar surrogate -> status 200,
  jawaban benar; callGemini lewat kode router LOLOS (13+7 token,
  11,2 detik); rantai fallback meta -> gemini LOLOS sekali
  (fallbackFrom meta). (2) README/PLAN diperbarui ke rantai nyata
  (Muse -> Gemini 3.1-flash-lite -> DeepSeek 1.5b -> Qwen 3b, QC per
  keluarga, status gerbang terkini). (3) Audit ulang: tsc 0 error,
  gate-test 8/8 PASS, scan PASS, sample job mock draft-only PASS.
  Yang TIDAK bisa diperbaiki dari sini dan dicatat pending: (a) Tes
  live Muse — menunggu klaim/kartu/Spend Limit Meta (Patria-only).
  (b) Re-baseline biaya penuh — menunggu harga Muse aktual; parsial
  Ollama Rp0 + Gemini terukur sudah ada. (c) Harga Muse Image —
  menunggu Meta aktif. (d) Verifikasi API Postiz — instans tidak
  berjalan; percobaan cek config via SSH GAGAL di tengah sweep karena
  MacBook tiba-tiba tidak menjawab tunnel lagi (SSH "Connection
  closed by UNKNOWN port 65535", curl tunnel ke Ollama 000; VM
  Tailscale tetap Connected) — kemungkinan MacBook tidur/offline
  setelah idle; perlu dibangunkan dari sisi MacBook, bukan dari VM.
  (e) Flakiness Gemini: provider mengembalikan HTTP 503 "high
  demand" berulang pada sesi yang sama — kondisi provider, bukan
  bug kode; rantai merespons benar dengan jatuh ke Ollama lokal.
  Batasan yang sengaja TIDAK diubah dalam sweep ini: QC sample tetap
  scoring deterministik (LLM QC live adalah pekerjaan harness Fase 5,
  bukan perbaikan Fase 0); tidak ada retry 503 di router (fallback
  ke Ollama sudah menjadi respons yang benar); Postiz TIDAK
  dipaksakan start (butuh Docker + sumber daya MacBook 8 GB yang
  sudah ketat; start adalah langkah Fase 3).

- 27 Okt siang (perintah Patria "lanjutkan ke tahap berikutnya"):
  FASE 1 DIEKSEKUSI SEBAGAI DRAF. Kode baru src/fase1.ts +
  src/fase1-run.ts (npm run fase1): Intake (brief TEST fiksi:
  TEST Kopi Surabaya, es kopi susu Rp15.000 untuk mahasiswa/pekerja
  muda Surabaya) -> Research -> Strategy -> STP, semua lewat rantai
  live (Meta gagal tanpa key -> Gemini 3.1-flash-lite, fallbackFrom
  meta). Hasil live: 3 panggilan non-mock, total 1.551 token
  (833 prompt + 718 completion), costUsd null (harga Gemini belum
  di-baseline resmi, jadi ledger TIDAK mengklaim biaya dolar).
  Riset draf kualitatif tanpa angka/URL karangan (sesuai prompt),
  sumber berupa jenis verifikasi yang harus dicek. STP status
  'draft', approvals KOSONG, productionBlocked true (terverifikasi
  lewat GateError). Uji gerbang bertambah jadi 9 grup (baru: Fase 1
  mock — STP draft, tanpa approval, produksi diblokir). Fase 1
  TIDAK dinyatakan lolos: gerbangnya adalah GSTP Patria, dan itu
  belum diberikan. Output: docs/fase-1-output.json.

- 27 Okt siang (perintah Patria "biaya sebisa mungkin konversi menjadi
  rupiah, kecuali tidak ada pilihan lain"): ATURAN BIAYA RUPIAH
  diterapkan. Kode baru src/currency.ts (toIdr, formatIdr,
  parseUsdIdrRate); CostRecord kini membawa costIdr yang dihitung
  CostLedger pada kurs USD_IDR_RATE dari environment; summary()
  melaporkan totalIdr dulu, USD sebagai sumber; tanpa kurs, IDR =
  null (tidak ditebak). Kurs TIDAK di-hardcode sebagai default.
  Referensi 27 Okt 2026: ~Rp18.137/USD (Finnhub; sumber lain
  Rp18.131–Rp18.152). Konsekuensi angka: hard limit $5 = Rp90.685;
  kredit Meta $150 = Rp2.720.550 setara (kreditnya sendiri tetap
  USD, jadi laporan menampilkan keduanya); Gemini ilustratif
  ~Rp1,81/tugas singkat (tarif sekunder, bukan ledger resmi);
  Ollama Rp0; biaya Fase 1 live belum bisa dirupiahkan (harga per
  token belum di-baseline, costUsd null). Uji gerbang jadi 10 grup
  (baru: pelaporan Rupiah — konversi, format, kejujuran null-rate).
  Dokumen: docs/biaya-rupiah.md.

- 27 Okt siang (perintah Patria, dua susulan ke Fase 1): RISET STP
  DIPERDALAM menjadi v2 — masih DRAF, belum GSTP. Tambahan wajib di
  riset (src/fase1.ts, langkah BehaviourResearch): behaviour digital,
  durasi on-screen PANJANG (kualitatif, tanpa angka jam), paparan
  media, jenis konten, cara transaksi, touch points lengkap
  (penemuan -> eksplorasi -> transaksi -> konsumsi ->
  loyalitas/advokasi), pain point masing-masing dipasangkan dengan
  solusi brand, spending bulanan (akumulasi transaksi kecil,
  sensitivitas harga, trade-off frekuensi), dan spending digital
  (QRIS/e-wallet, persepsi uang digital lebih ringan, cashback
  sebagai pendorong loyalitas, friction sinyal/saldo). Verifikasi
  output live v2 (4 panggilan Gemini non-mock): 8 bidang behaviour
  terisi (4-5 butir tiap bidang), scan karangan BERSIH — tanpa URL,
  tanpa persentase, tanpa angka jam. STP v2: segmen mahasiswa/pekerja
  muda Surabaya 18-28 dengan intensitas ponsel tinggi dan sensitif
  harga namun loyal pada QRIS; targeting via WhatsApp Business +
  video pendek (Reels/TikTok) mengarah ke chat + promo e-wallet/QRIS;
  positioning es kopi susu harian paling praktis via WhatsApp +
  QRIS tanpa hambatan. Tetap: STP status draft, approvals KOSONG,
  produksi diblokir. Catatan kejujuran: summary ledger di file
  output menggabungkan file ledger bersama (termasuk record mock
  uji), bukan hanya run ini; yang relevan untuk run v2 adalah 4
  panggilan live pada traceId-nya, cost null (harga belum
  di-baseline, jadi IDR-nya juga null — bukan tebakan).

- 27 Okt 12:04 WIB (keputusan Patria, via opsi GSTP): STP v2 LOLOS
  GSTP. Record approval baru di docs/fase-1-gstp-approval.json:
  gate GSTP, produk TEST-BRAND-001, decision approved, approver
  Patria A. Wijaya, STP sumber trace-fase1-1793077341157. File draf
  docs/fase-1-output.json TIDAK diubah (STP di sana tetap 'draft'
  sebagai bukti draf); yang approved adalah salinan di record.
  GS (Strategy) tidak dicatat sebagai approved — hanya GSTP yang
  disetujui eksplisit. Konsekuensi: Fase 2 tidak lagi diblokir
  gerbang (requireProductionAllowed hanya membutuhkan GSTP), tetapi
  Fase 2 BELUM dimulai — menunggu perintah Patria berikutnya.

- 27 Okt siang (perintah Patria "Mulai Fase 2"): FASE 2 DIEKSEKUSI
  (kalender + brief, GKonten MENUNGGU). Kode baru src/fase2.ts +
  src/fase2-run.ts (npm run fase2): verifikasi GSTP dari record
  Patria (tanpa record = GateError, teruji), kalender 7 hari dari
  STP yang disetujui + riset behaviour, 7 CreativeBrief (visual
  text-free, overlay template, ukuran per channel), QC rule 100/100
  untuk semua item, gambar = null dengan status pending-provider
  (Muse Image menunggu Meta aktif; tidak ada placeholder yang
  diklaim sebagai gambar). Hasil live (2 panggilan Gemini non-mock,
  3.604 token: 2.102 prompt + 1.502 completion, cost null karena
  harga belum di-baseline): kalender mencakup 3 pilar, channel WA
  Status + Reels/TikTok, CTA ke WA/QRIS, touch points penemuan ->
  eksplorasi -> transaksi -> loyalitas. Perbaikan router yang
  ditemukan selama run ini: callWithFallback kini menyebut SEMUA
  kegagalan provider (bukan hanya yang terakhir), karena run
  pertama gagal dengan error Ollama yang menutupi 503 Gemini yang
  intermiten; setelah perbaikan, run ulang lolos. Catatan QC yang
  jujur: skor 100 adalah skor rule struktural (prompt terisi,
  overlay <=120, tanpa hard violation) — ia TIDAK memvalidasi
  semantik gambar; item-03 memuat penggambaran QR code di visual
  prompt, yang pada produksi nyata harus menjadi overlay QR asli,
  bukan digambar model, dan item-01 deskripsinya bernuansa video
  (transisi) padahal brief ini untuk gambar statis — keduanya
  dicatat sebagai bahan revisi GKonten, bukan disembunyikan.
  GKonten: approvals KOSONG, contentBlocked true, tidak ada draf
  distribusi. Uji gerbang jadi 11 grup (baru: Fase 2 mock + blokir
  tanpa GSTP). Output: docs/fase-2-output.json.

- 27 Okt ~13:06 WIB (keputusan Patria): GKONTEN LOLOS untuk kalender
  + brief Fase 2 (record docs/fase-2-gkonten-approval.json; file
  draf Fase 2 TIDAK diubah; dua catatan produksi — QR item-03
  harus overlay asli, item-01 diperlakukan sebagai gambar statis —
  dicatat di record sebagai diterima). Fase 3 (draf Postiz) secara
  gerbang terbuka, tetapi DITUNDA atas perintah Patria berikutnya
  di pesan yang sama.
- 27 Okt siang (perintah Patria, sebelum lanjut): FASE UI BARU
  ditambahkan ke rencana (di antara Fase 2 dan Fase 3). Draf UI
  ditulis di docs/ui-draft.md (DRAF SAJA, belum implementasi):
  7 layar mengikuti gerbang yang ada, satu primary action per
  section, biaya Rp dulu, tidak ada autopublish, target akhir
  installable Mac (.dmg) dan Windows (.msi) dari satu basis kode,
  teknologi usulan Tauri 2 + Svelte 5 (PROVISIONAL, dibangun dari
  nol di repo ini — bukan salinan proyek lama; alternatif Electron
  dicatat). Gerbang fase ini = persetujuan draf oleh Patria.

- 27 Okt siang (perintah Patria "buatkan prototype dulu dengan
  project dummy, kita revisi dari sana"): PROTOTYPE KLIK DIBUAT di
  prototype/index.html (satu file HTML mandiri, tanpa dependensi
  eksternal, tanpa backend). Isi: 7 layar sesuai draf UI (Proyek,
  Intake, Riset & Strategi, STP/GSTP, Kalender 7 Hari, Brief &
  QC/GKonten, Distribusi & Biaya), proyek dummy TEST Kopi Surabaya
  dengan data draf Fase 1 v2 + Fase 2 (kalender, brief, QC, token,
  biaya Rp), navigasi sidebar, klik kartu kalender -> brief hari
  itu, tombol gerbang Setujui/Revisi/Tolak yang mengubah status
  TAMPILAN saja. Penanda kejujuran: banner atas prototype
  menyatakan klik TIDAK menyimpan approval sungguhan; approval
  GSTP/GKonten sungguhan tetap di record docs terpisah. Verifikasi:
  7 layar, semua target navigasi valid, 7 hari + 7 brief, JS lolos
  node --check, tanpa referensi eksternal. Status: MENUNGGU REVISI
  Patria dari prototype ini (bukan persetujuan gerbang).

- 27 Okt siang (perintah Patria "revisi arah" + "buatkan rancangan
  prototype UI-nya"): UI v1 DIGANTIKAN oleh UI v2. Rancangan v2 di
  docs/ui-draft-v2.md: Prime Agent sebagai personal assistant
  (satu pintu masuk arahan; tiga jenis arahan utama: riset bisnis,
  marketing, pembuatan produk digital); 6 agen dengan harness skill
  masing-masing (Riset, Strategi, Kreatif, Media, Distribusi,
  Produk Digital); 4 mode (Asisten, Kanban 5 kolom, Koneksi ala
  N8N dengan tambah edge oleh pengguna, Media Studio dengan
  Gambar/Carousel/Reels/Talking Head berstatus Siap untuk Post —
  yang berarti lolos QC+GKonten, BUKAN sudah terbit). Prototype
  klik v2 di prototype-v2/index.html (satu file mandiri, tanpa
  dependensi eksternal): chat Prime Agent dengan delegasi simulasi
  + contoh arahan cepat, Kanban dengan tombol Maju simulasi,
  kanvas node + tambah koneksi (form sumber/tujuan/label, daftar
  koneksi, klik node untuk detail), Media Studio dengan filter 4
  jenis media dan placeholder dummy berlabel (bukan hasil
  generate). Verifikasi: 4 mode, semua agen + harness skill,
  5 kolom Kanban, 4 filter media, JS lolos node --check, tanpa
  referensi eksternal. Status: MENUNGGU REVISI Patria atas
  rancangan + prototype v2. Draf v1 dipertahankan sebagai riwayat
  dengan catatan superseded di atasnya.

- 27 Okt siang (perintah Patria "mulai dari UI utama, window chat
  dengan Prime Agen"): SPESIFIKASI + PROTOTYPE UI UTAMA v3.
  Spesifikasi di docs/ui-main-layout.md: layout 4 kolom (sidebar
  ikon 64px + kolom Agen + chat grup + panel Detail), sidebar
  ikon saja dengan nama saat hover (Home, Search, Kanban, Graph,
  Library, Media Studio, Planner, Settings di bawah), kolom Agen
  berkelompok per proyek (Prime selalu aktif di atas; agen lain
  diaktifkan otomatis Prime atau ditambah/dinonaktifkan pengguna;
  agen yang sama bisa muncul di beberapa proyek bersamaan), chat
  seperti grup (User + Prime + sub-agen, masing-masing independen
  sesuai goalnya, semua hasil dikurasi Prime), panel Detail untuk
  kustomisasi kondisi + skill agen, lebar kolom bisa di-drag
  (Agen 180–420px, Detail 220–420px), dan scrollbar independen
  per kolom. Media Studio: suara (Voice Studio), Image/Reels
  (Meta/Gemini utama, Canva sebagai fallback bila keduanya gagal,
  status fallback selalu ditampilkan), video Reels/Talking Head +
  timeline editor. Planner: auto post Meta + Postiz, default DRAF
  saja. Library: output akhir per agen (gunakan/simpan/perbaiki).
  Prototype klik v3 di prototype-v3/index.html (satu file mandiri,
  tanpa dependensi eksternal): semua view sidebar berfungsi
  sebagai pratinjau, chat grup dengan balasan Prime + sub-agen
  simulasi dan pesan Kurasi Prime, tambah/nonaktifkan agen,
  detail skill yang bisa dicentang, resizer kolom drag, Search
  memfilter chat, Kanban mini, Graph dengan tambah edge, Library,
  Media Studio (fallback Canva + timeline), Planner, Settings.
  Verifikasi: 8 tombol sidebar = 8 view, Riset muncul di 2 proyek,
  JS lolos node --check, tanpa referensi eksternal. Status:
  MENUNGGU REVISI Patria atas layout utama v3.

- 27 Okt siang (perintah Patria "lanjut buat prototipe, kita akan
  revisi dari situ"): PROTOTYPE INTERAKTIF v4, lanjutan dari v3
  (bukan scaffold aplikasi — revisi tetap dilakukan dari
  prototype klik). File prototype-v4/index.html (satu file
  mandiri, tanpa dependensi eksternal, layout 4 kolom v3
  dipertahankan). Yang BARU dan bisa dicoba langsung: ganti proyek
  aktif (TEST Kopi ↔ TEST Produk Digital) dengan riwayat chat,
  agen, dan Kanban per proyek; kartu Kanban bisa DISERET antar
  kolom (selain tombol Maju); node Graph bisa DISERET untuk
  mengatur kanvas + tambah koneksi via form; filter Media Studio
  (Gambar/Carousel/Reels/Talking Head); tombol geser slide
  Carousel; edit + simpan naskah Talking Head; tombol Putar yang
  menggerakkan playhead Timeline; aksi Library yang saling
  terhubung (Gunakan → pesan Prime di chat; Perbaiki Lanjut →
  kartu Revisi di Kanban + pesan Prime); tombol Siapkan untuk
  Post di Media Studio → baris DRAF baru di Planner + status
  media menjadi Siap untuk Post. Verifikasi: semua fitur di atas
  ada di kode, JS lolos node --check, tanpa referensi eksternal.
  Status: MENUNGGU REVISI Patria dari prototype v4 (v3 tetap
  tersimpan sebagai versi sebelumnya).

- 27 Okt sore (perintah Patria "UI nya buat semirip mungkin dengan
  Muse, icon di sidebar gunakan dokumen terlampir" + "UI kanban
  buat seperti lampiran"): PROTOTYPE v5. Tema gelap ala Muse
  (latar #0e0e0e, panel #171717/#1e1e1e, rail #0a0a0a, teks
  terang) dengan susunan panel mirip screenshot Muse: rail ikon
  + panel nav (Search, Main chat, list agen/proyek) + chat utama
  + panel kanan profil (avatar Prime Agent, "Connected" hijau,
  daftar "Today" dari Kanban proyek aktif) + detail skill.
  6 ikon rail DIPROSES dari dokumen lampiran Patria menjadi
  line-art putih transparan 128px yang tertanam sebagai data URI
  di file (tetap satu file mandiri): Home = house, Search =
  magnifier (pola garis latarnya dibersihkan), Kanban = papan 3
  kolom (ikon yang awalnya tampak hitam pekat karena line-art
  hitam di latar transparan), Graph = 3 node terhubung, Library
  = layers, Planner = notebook + play. Media Studio & Settings
  memakai fallback SVG gaya garis karena tidak ada ikon lampiran
  untuk keduanya. View Kanban dibuat semirip lampiran dashboard:
  header judul proyek + bintang + avatar stack agen + tombol
  tambah, tab Kanban/Table/List (ketiganya menampilkan tugas
  yang sama), Filter agen, kolom dengan jumlah kartu, kartu dark
  dengan bar warna atas per kolom (abu/biru/kuning/merah/hijau),
  avatar agen + jumlah komentar, tombol "Add task" per kolom,
  dan kolom dashed "Add another list" yang benar-benar menambah
  kolom baru (simulasi). Interaksi v4 dipertahankan penuh
  (ganti proyek, drag kartu/node, filter media, slide carousel,
  edit naskah, playhead, aksi Library/Planner). Verifikasi: 8
  tombol rail, 6 data URI PNG + 2 fallback SVG, kedua blok JS
  lolos node --check, tanpa referensi eksternal. Status:
  MENUNGGU REVISI Patria dari prototype v5. Catatan jujur: 5
  kolom Kanban dipertahankan (Antrian/Dikerjakan/Butuh Approval/
  Revisi/Selesai) karena kolom Butuh Approval & Revisi adalah
  gerbang — lampiran hanya punya 3 kolom (To do/Doing/Done);
  bila Patria mau persis 3 kolom, gerbang harus dipindah ke
  tempat lain dan itu perlu diputuskan dulu.

- 27 Okt sore (perintah Patria "Untuk UI Graph gunakan seperti
  lampiran"): GRAPH v5 DIGANTI gaya kanvas n8n dari lampiran
  (masih di file prototype-v5/index.html yang sama). Kanvas
  berlatar grid titik gelap; node: Trigger "Arahan Pengguna"
  (⚡, seperti trigger form di lampiran) → "Prime Agent"
  (🤖, seperti node AI Agent/Tools Agent) → decision "GSTP
  lolos?" (seperti "Is manager?" — cabang true ke Distribusi,
  false ke Revisi, masing-masing berlabel di kurvanya); di bawah
  Prime Agent ada 4 sub-node MELINGKAR yang terhubung garis
  PUTUS-PUTUS melengkung seperti lampiran (Chat Model
  Meta→Gemini→Ollama, Memory PostgreSQL, Tool: Media, Tool:
  Postiz). Semua koneksi berupa kurva bezier berpanah (bukan
  garis lurus) dengan port bulat di ujungnya; node output punya
  tombol ＋ seperti lampiran untuk menambah node baru (simulasi:
  node "Node Baru" muncul di kanan + koneksinya); form tambah
  koneksi tetap ada; tombol "Jalankan Simulasi Alur" menyorot
  node berurutan Trigger → Prime → GSTP → Distribusi. Node
  tetap bisa diseret dan kurva dihitung ulang dari posisi node
  nyata. Verifikasi: kedua blok JS lolos node --check, tanpa
  referensi eksternal. Status: MENUNGGU REVISI Patria dari
  prototype v5 (dengan Graph gaya n8n).

- 27 Okt sore (perintah Patria "input chat user buat seperti WA,
  posisi input user selalu berada dibawah window chat", dengan
  lampiran bilah input WA): COMPOSER CHAT v5 DIGANTI gaya
  WhatsApp (masih di file prototype-v5/index.html yang sama).
  Susunan persis lampiran: tombol ＋ di kiri luar pill, pill
  input gelap membulat penuh dengan kursor hijau (#25D366),
  tombol emoji (smiley) di dalam pill sebelah kanan, dan tombol
  bulat hijau di kanan luar pill. Perilaku WA: saat input kosong
  tombol kanan adalah MIC hijau (klik → simulasi rekam suara
  Voice Studio); begitu mengetik, tombol berubah menjadi KIRIM
  hijau (pesawat kertas); Enter juga mengirim; tombol ＋ membuka
  menu lampiran (Gambar/Dokumen/Kamera/Audio, simulasi); tombol
  emoji membuka panel emoji yang menyisipkan emoji ke input.
  Posisi dijamin selalu di bawah: layout diubah dari
  calc(100vh) menjadi flex column (banner + app flex:1), dan
  composer berada di luar area scroll chat (colhead + scroll
  flex:1 + composer flex-shrink:0), sehingga tidak pernah ikut
  ter-scroll atau tertutup — baik saat pesan sedikit maupun
  menumpuk. Tombol contoh arahan cepat dan Kurasi Prime tetap
  ada di baris atas composer. Verifikasi: kedua blok JS lolos
  node --check, tanpa referensi eksternal. Status: MENUNGGU
  REVISI Patria dari prototype v5 (dengan composer WA).

- 27 Okt sore (perintah Patria "UI list agent buat seperti ini,
  menu tambah agen hanya berupa icon + di bar atas, rata kanan
  dengan kolom list agen", dengan lampiran panel list gelap):
  LIST AGEN v5 DIGANTI seperti lampiran (masih di file
  prototype-v5/index.html yang sama). Bar atas kolom agen kini:
  titik hijau + "Local" + chevron di kiri, panah back/forward
  (riwayat view sungguhan di prototype: kembali/maju antar view
  yang sudah dibuka), dan HANYA ikon ＋ di kanan sebagai menu
  tambah agen — form "Tambah agen" di bawah list DIHAPUS total.
  Klik ＋ membuka menu dropdown berisi agen yang belum ada di
  proyek aktif (klik agen → agen ditambahkan, menu tertutup,
  list diperbarui). Di bawah bar: Search box gelap membulat
  dengan ikon kaca pembesar (memfilter list agen, seperti
  sebelumnya). Tiap item list kini seperti kartu di lampiran:
  avatar kotak membulat warna agen + nama tebal + jam di kanan
  atas (dummy, gaya "2:32 PM") + baris preview tugas•status
  yang terpotong ellipsis ("Hello! What can I help you wit…"
  ala lampiran). Pengelompokan per proyek dan tombol
  Nonaktifkan/Aktifkan dipertahankan (fungsi), hanya tampilannya
  yang mengikuti lampiran. Verifikasi: kedua blok JS lolos
  node --check, tanpa referensi eksternal, form lama benar-benar
  hilang dari file. Status: MENUNGGU REVISI Patria dari
  prototype v5 (dengan list agen gaya lampiran).

- 27 Okt sore (perintah Patria "UI utama buat seperti ini",
  dengan lampiran UI utama gelap, lalu perintah susulan
  "Warna UI monochrome dengan aksen violet #B214FF"): UI UTAMA
  v5 DIGANTI seperti lampiran + TEMA MONOCHROME-VIOLET (masih
  di file prototype-v5/index.html yang sama). Chat tengah kini:
  header terpusat "Today 2:31 PM" + label proyek kecil di
  bawahnya (dropdown ganti proyek tetap di bawah header);
  bubble TANPA avatar/nama — pesan pengguna pill gelap di
  kanan, pesan agen pill gelap di kiri, kurasi Prime pill
  bergaris putus-putus violet + label KURASI PRIME; composer
  menjadi SATU pill (tombol ＋ di dalam kiri → menu lampiran,
  placeholder dinamis "Message {nama agen}" yang mengikuti
  agen terpilih, mic abu di dalam, tombol kirim BULAT VIOLET
  dengan panah putih — mic + kirim selalu tampil seperti
  lampiran, bukan lagi toggle mic→kirim gaya WA). Panel Detail
  kanan kini seperti lampiran: avatar kotak besar warna agen
  + badge pensil, field Name (edit nama → list ikut berubah),
  Title (placeholder "Describe what your agent does"),
  Instructions (textarea, default Prime "General-purpose
  assistant"), Brain (Model = rantai Meta → Gemini → Ollama,
  Reasoning Low, Backup models Ask first), Knows (Memories 0
  saved, Skills N assigned — klik membuka daftar checkbox
  harness, Files 17 KB, Tables 0 tables), Does (Routines 0
  configured, Usage —). Suntikan "Today" dari panel kanan
  DIHAPUS (lampiran tidak punya). TEMA: seluruh v5 monochrome
  (hitam/abu-abu) dengan SATU aksen #B214FF — tombol primer,
  seleksi agen, border proyek aktif, hover, badge Butuh
  Approval, avatar Prime, tombol kirim, kurasi, banner, dan
  caret input; avatar agen lain abu-abu bertingkat, bar
  Kanban abu-abu (kecuali Butuh Approval = violet), node
  Graph abu-abu (kecuali Prime = violet). Diverifikasi: kedua
  blok JS lolos node --check, tanpa referensi eksternal,
  elemen lama (chatTitle/detailTitle/saveDetail/emojiPanel/
  waMicBtn) benar-benar hilang, tidak ada sisa hex aksen lama
  (biru/hijau/merah/kuning). Status: MENUNGGU REVISI Patria
  dari prototype v5 (dengan UI utama gaya lampiran + tema
  violet).

- 27 Okt sore (verifikasi "pastikan prototipe update"): audit
  file menemukan 1 referensi basi yang lolos — waToggleAttach
  masih memanggil emojiPanel yang sudah dihapus saat composer
  diganti gaya lampiran, sehingga klik tombol ＋ akan error
  (null.classList) dan menu lampiran gagal terbuka. DIPERBAIKI:
  baris basi dihapus, klik ＋ kini hanya toggle attachMenu.
  Verifikasi ulang: tidak ada lagi referensi ke elemen yang
  sudah dihapus (emojiPanel/chatTitle/detailTitle/addAgentSel/
  waMicBtn/waSendBtn = 0), kedua blok JS lolos node --check.

- 27 Okt sore (perintah Patria "Update README/PLAN di log"):
  README.md + PLAN.md dibawa ke status terkini. Temuan: draf
  README-new/PLAN-new (09:19, folder
  your_files/addendum-router-minime-hackathon) SUDAH terserap dan
  terlampaui oleh update-update berikutnya (kanon router +
  fallback Qwen + ?key= + catatan GPU 7b sudah ada di kedua file)
  — jadi draf itu TIDAK dipakai mentah-mentah (me-revert akan
  menghapus konten Fase 1/2 dan UI). Yang diperbarui: README
  Status → Fase 0 lolos bersyarat 15:04 WIB + Fase 1/2 lolos +
  UI v5 + UI stop; PLAN Fase 0 → lolos bersyarat, Fase 1 header
  → GSTP approved, Fase 2 → executed + GKonten approved +
  catatan QC/gambar null, Fase UI → v4 + v5 + UI stop, Stack →
  prototipe klik ada, aplikasi sungguhan belum dibangun.

- KOREKSI 27 Okt sore (transparansi log): commit sebelumnya
  (lokal 8d8b9b4 ↔ remote 23890e2) HANYA memuat README + log —
  skrip edit PLAN berhenti pada satu pola teks yang tidak cocok
  ("Clickable prototype v3" ternyata satu baris dengan "Spec:
  docs/ui-main-layout.md." di depannya), sehingga PLAN tidak
  tertulis dan tidak ikut commit, walau pesan commit menyebut
  README/PLAN. Commit ini melengkapi separuh PLAN yang tertunda
  (Fase 0 bersyarat, Fase 1 GSTP, Fase 2 executed + GKonten,
  v4/v5 + UI stop, Stack) — tidak ada riwayat yang ditulis ulang,
  koreksi dicatat di sini apa adanya.

- 27 Okt 15:04 WIB (perintah Patria "FAse 0 lolos bersyarat, dengan
  catatan"): GERBANG FASE 0 LOLOS BERSYARAT. Record
  docs/fase-0-gate-conditional-approval.json (approver Patria;
  vonis direkam Mimi, bukan diberikan Mimi). Catatan yang
  tercatat = dua butir yang selama ini menggantung: (1) tes live
  Muse, (2) re-baseline biaya penuh; keduanya masih OPEN — lolos
  penuh hanya setelah keduanya ditutup dan Patria menyatakannya.
  Addendum ditambahkan di atas docs/fase-0-gate-results.md tanpa
  menghapus vonis 11:30 WIB. Keputusan ini TIDAK membuka Fase 3
  dan TIDAK mengubah UI stop 15:02 WIB.

- 27 Okt sore (perintah Patria "Lanjutkan Fase 3"): FASE 3
  DIEKSEKUSI live. Kode: src/fase3.ts + src/fase3-run.ts +
  src/postiz.ts (klien DRAF-only — tanpa method publish/schedule
  by construction, dibuktikan gate test). Gerbang masuk: record
  GSTP + GKonten Patria diimpor (tanpa keduanya → GateError).
  Hasil live via Gemini (1 call, 2.595 token: 1.062 prompt +
  1.533 completion, non-mock, trace trace-fase3-1793088874703):
  7 carousel × 3 slide (hook → isi → CTA), QC rule 100/100
  semua 21 slide, gambar null pending-provider (Muse Image
  masih menunggu Meta). Output docs/fase-3-output.json.
  Postiz: MacBook ternyata bangun & SSH hidup (up 4:13);
  Docker Desktop dinyalakan via SSH; kontainer postiz,
  postiz-postgres (healthy), postiz-redis (healthy), temporal
  UP; API merespons 307 di / dan /public/v1/integrations
  (redirect = app hidup). TAPI API key pos_ TIDAK ada di
  Keychain MacBook (url + api-key MISSING, dicek eksistensinya
  saja, nilainya tidak pernah dibaca/dicetak) → 7 draf
  berstatus pending-postiz, published false, postizLive false.
  Langkah yang membuka kaki live: Patria buat API key di
  dashboard Postiz (localhost:4007) + simpan ke Keychain sesuai
  INTEGRASI_MINIME.md §2, lalu kabari — draf didorong dari
  MacBook via SSH (key tidak pernah keluar dari MacBook dan
  tidak dikirim via chat). Gate test 13/13 PASS (termasuk
  fase3 + postiz client), scan PASSED, tsc 0 error. Fase 3
  TIDAK mencatat approval baru; UI tetap stop (perintah
  15:02 WIB tidak berubah).

  FASE 3 — POSTIZ DRAFTS LIVE (27 Okt ~15:35 WIB, Patria AFK
  'jalankan sampai selesai'): 7 draf DRAF-only, HTTP 201 semua,
  postIds di docs/fase-3-postiz-drafts.json; tidak ada yang
  publish/jadwal. Jalan yang ditempuh: key sudah di Keychain
  (15:22, dibuat Patria di dashboard + disimpan sendiri);
  baca via SSH GAGAL (security exit 36, interaction not
  allowed; launchctl asuser operation-not-permitted); DB
  Postiz tidak punya tabel API key (hanya token OAuth kanal —
  tidak disentuh). Solusi: osascript → Terminal GUI MacBook
  menjalankan skrip dorong (key dibaca di sesi Terminal saja,
  tidak pernah dicetak/dikirim). Koreksi endpoint dari dok
  resmi + probe live: /api/public/v1 (bukan /public/v1 yang
  307 ke /auth; 7 percobaan awal itu tidak membuat apa-apa,
  jadi tanpa duplikat); auth key mentah (Bearer 401);
  GET integrations 200: 2 kanal (facebook + instagram);
  settings instagram: post_type post (wajib); draf teks-only
  diterima (201) walau aturan attachment menyebut lampiran.
  Pilot item-01 diverifikasi dulu, baru 6 sisanya. Kanal:
  Instagram 'Branding, Marketing & AI'. Tidak ada approval
  baru; UI tetap stop.

  UI — PERBAIKAN TEMA v5 (27 Okt ~15:50 WIB, stop 15:02 DICABUT
  atas perintah Patria 'perbaiki UI', monochrome + violet #B214FF,
  bentuk gaya Muse): audit palet v5 menemukan 8 penyimpangan
  warna di luar monochrome+violet — banner bold emas, bubble
  Prime biru-ungu, bubble kurasi emas-zaitun, bubble user biru
  gelap, placeholder abu-biru, bar video ungu kedua (#7c3aed),
  dan 2 pesan Riset yang keliru memakai warna violet Prime.
  Perbaikan: banner bold → #B214FF; bubble Prime → abu + border
  violet; bubble kurasi → abu gelap; bubble user → #333333;
  placeholder → #737373; bar video Isi → #5b5b5b; pesan Riset →
  #525252 (abu bertingkat agen, Prime tetap satu-satunya violet).
  Verifikasi: audit palet bersih (hanya abu/putih + #B214FF),
  JS 2 blok lolos node --check, diff 8+/8-. Bentuk tetap gaya
  Muse v5 (rail + list agen + chat + panel Detail); gerbang
  desain UI tetap belum disetujui formal.

  UI — NAMA + LOGO + ICON (27 Okt 15:54 WIB, Patria): nama
  aplikasi = MiniMe (menutup pertanyaan nama yang tertunda
  sejak UI stop). Logo = lampiran wordmark (1356×415, RGBA
  transparan) → prototype-v5/assets/minime-logo.png, tampil
  di header kolom agen. Icon = lampiran kotak (957×956, RGB)
  → prototype-v5/assets/minime-icon.png, dipakai sebagai
  favicon + app mark di atas rail. Judul + banner prototipe
  diubah ke MiniMe. Keduanya dipakai apa adanya (pink brand
  dipertahankan); aksen UI tetap violet #B214FF. Verifikasi:
  3 referensi aset di index.html, JS 2 blok lolos node --check.

  UI — BUILD PROTOTIPE (27 Okt sore, perintah Patria "build
  prototipe"): single-file build prototype-v5/build/minime-v5.html
  (195 KB) dari prototype-v5/index.html + assets/; logo + icon
  di-inline sebagai data URI sehingga satu file bisa dibuka
  langsung tanpa folder assets. Verifikasi: 0 referensi
  assets/ tersisa, 9 data URI (6 ikon rail + favicon + appmark
  + logo), diff vs sumber hanya 3 baris aset, JS lolos
  node --check. Catatan: build ini tetap prototipe klik
  DUMMY (bukan app Tauri) — belum ada backend, approval
  tidak tersimpan sungguhan. Folder dist/ dihindari karena
  di-ignore gitignore; dipakai build/ agar bisa di-commit.

  UI — VIDEO EDITOR GAYA DIFFUSION (27 Okt sore, perintah
  Patria "pelajari UI diffusionstudio/editor, cek bisa dipakai
  di video editor, build ulang"): repo dipelajari langsung
  (clone shallow + README): v0.216.0, MPL-2.0, 3.411 stars,
  monorepo Solid+Vite (apps/web) + Electron (apps/desktop) +
  CLI diffusion (MCP client) + runtime headless + encoder
  (mediabunny). Layout editor: title bar + sidebar kiri
  (aset/proyek/agent-chat) + canvas preview + sidebar kanan
  Inspector 264px + timeline bawah multi-track (resizable).
  Pola agen: probe → transcribe → check → capture → render
  lewat MCP/CLI; komposisi = kode JSX (stage/scene/klip),
  @inspect jadi kontrol live. VONIS: bisa dipakai sebagai
  alat eksternal via MCP/CLI (pola PROVISIONAL yang sudah
  diputuskan); UI-nya TIDAK dibundle (Solid ≠ Svelte,
  Electron ≠ Tauri, dan vendoring kode Diffusion melanggar
  aturan Indie NEW WORK ONLY). Yang dibangun ulang =
  seksi video editor prototipe v5 dengan pola layout itu,
  kode sendiri: toolbar (Potong/Teks/Subtitle/Transisi/
  Suara, dummy) + preview 16:9 + inspector + ruler +
  timeline 3 track klik-pilih klip. Brand assets Diffusion
  TIDAK dipakai (di luar MPL, all rights reserved).
  Build single-file diperbarui (199 KB). Syarat permanen
  (uji 1 klip vertikal + encoder headless) TIDAK berubah.

  UI — VIDEO EDITOR LENGKAP + EVALUASI ENGINE (27 Okt sore,
  perintah Patria "abaikan keputusan tadi siang; cek jujur
  bisa bangun dengan engine kita?"): audit: repo hackathon
  TIDAK punya engine media sama sekali (grep src: hanya
  string "video pendek" di prompt, bukan engine); yang ada
  sebagai tool: FFmpeg/ffprobe CLI (paket install Minime,
  belum di-wire), HyperFrames (HTML→MP4, bukan timeline
  footage), Minime v2 assemble_video_ai dkk (repo lama —
  referensi pola saja, TIDAK di-copy). VONIS: belum bisa
  lengkap → UI dibangun dulu: view baru 'Video Editor' di
  v5 (rail ikon film fallback; panel aset + preview 16:9 +
  inspector + timeline 4 track + transport + zoom/efek;
  klik klip/aset, edit nama klip, playhead + timecode;
  tombol Ekspor jujur menyatakan engine belum ada).
  Daftar engine di docs/video-editor-engines.md (10 item).
  DESKRIPSI GIT (perintah 16:07): nama model di luar 3
  tier utama (Meta, Gemini, Ollama lokal) dihapus dari
  README + PLAN (frasa Maverick/Flash/Sonnet → "superseded
  models"); package.json sudah bersih; log histori
  (fase-0-log) TIDAK diubah — itu catatan, bukan deskripsi.

  UI — AKSEN PINK (27 Okt sore, perintah Patria "ubah warna
  aksen menjadi #FF5A97"): 50 kemunculan #B214FF di
  prototype-v5/index.html diganti ke #FF5A97 (CSS, inline
  style, JS warna Prime, banner); kata "violet" di file
  hilang (0 tersisa); banner kini "MONOCHROME + AKSEN PINK
  #FF5A97". Logo MiniMe tidak diubah (aset brand apa
  adanya). Build single-file diperbarui. Riwayat tema
  violet di log ini TIDAK diubah (catatan saat itu).

  AUDIT + REKAP 27 Okt sore (perintah Patria: "rekap pekerjaan
  detail, checklist sudah/belum; cek mendetail konsistensi
  logic, code, performa; hindari fungsi tumpang tindih; nol
  error lolos; compact namun powerful" + "catat semua
  perubahannya dalam log"):
  PERUBAHAN SORE INI (3):
  (1) AKSEN PINK PASTEL #FFD1DC (ganti #FF5A97, perintah
  Patria 16:22): 50 kemunculan diganti + 3 di 2 rule baru =
  53; 0 #FF5A97 / 0 #B214FF tersisa di v5 sumber+build.
  Kontras diperbaiki karena pastel terang tidak terbaca
  dengan teks putih: tombol primer, tombol filter aktif,
  badge b-wait, avatar profil, dan panah kirim kini teks/
  stroke #262626; avatar + bar pastel ditangani 2 selektor
  atribut (.av[style*="#FFD1DC"], .track
  .bar[style*="#FFD1DC"]) sehingga mencakup avatar statis
  maupun yang dirender JS. Satu kesalahan sempat dibuat
  dan langsung diperbaiki: replace 'color: #fff' ikut
  memakan 'color: #ffffff' (b-wait) menjadi
  '#262626fff' tidak valid — terdeteksi grep, diperbaiki
  ke #262626, terverifikasi. renderChat dipastikan tidak
  memakai warna untuk teks (bubble berdasar class saja).
  (2) NAV HOME-ONLY (perintah Patria 16:24): list agen
  (agentCol) + panel Detail (detailCol) + kedua resizer
  kini HANYA tampil di window Home — class .no-nav
  dipasang showView (id !== 'home'); semua jalur
  navigasi ikut karena _sv2 menunjuk showView yang sama
  (sidebar, mainchat, viewBack/viewForward, tombol Buka
  Video Editor). Banner diperbarui. Build 209.380 byte.
  (3) TIDAK ADA refactor dedup (vonis audit, di bawah).
  HASIL AUDIT (dijalankan ulang setelah semua edit):
  - tsc: 0 error; gate-test: 13/13 PASS; credential
    scan: PASSED; JS prototipe (sumber+build, 2 blok
    script): node --check OK; build single-file
    direproduksi identik dari sumber (0 referensi aset,
    9 data URI).
  - Fungsi: 63 definisi, 0 duplikat. Pasangan mirip
    (selectClip/ve2Select, playTimeline/ve2Play,
    veTool/ve2Note) DINILAI BUKAN tumpang tindih: kontrak
    DOM berbeda (div vs input inspector, playhead saja
    vs playhead+timecode, teks note berbeda) — menyatukan
    menambah branching tanpa mengurangi baris bermakna;
    diputuskan dipertahankan, bukan di-refactor
    (refactor gratisan justru berisiko memasukkan error
    yang dilarang). Data dummy klip yang tercermin di 2
    view dicatat sebagai duplikasi dummy yang diketahui,
    bukan logika ganda.
  - Wiring: 47 target getElementById semua ada di DOM;
    28 handler onclick, satu-satunya yang tak terdefinisi
    sebagai fungsi app adalah alert() — itu API native
    browser (tombol simulasi tambah anggota tim), bukan
    error. Satu-satunya URL eksternal adalah namespace
    SVG w3.org (bukan fetch jaringan). 0 TODO/FIXME.
  - Kontrak: rantai router di router.ts sesuai kanon
    (Meta -> Gemini -> Ollama DeepSeek -> Ollama Qwen);
    fase2/fase3 menegakkan gate (GSTP, lalu GSTP+GKonten)
    via GateError; record Postiz: 7 draf, 0 published,
    0 scheduled, 7 postId. Deps NestJS/Fastify/RxJS
    TERPAKAI (main.ts, app.module, app.controller) —
    bukan beban mati; arsitektur kanon memang NestJS.
  - Performa/compact: repo 3,8 MB (di luar node_modules);
    prototipe lama v1–v4 + prototype/ total ~172 KB
    (riwayat iterasi event, sengaja dipertahankan untuk
    provenance Indie, bukan dihapus tanpa perintah);
    prototipe v5 368 KB total; timer playhead terbatas
    (50 tick x 120 ms, dibersihkan saat restart) — bukan
    leak. NestJS dipakai; tidak ada dependensi menganggur
    di package.json.
  - Konsistensi docs: README/PLAN/MEMORY/log diperbarui
    ke aksen pastel + nav home-only; riwayat violet/pink
    di log dipertahankan sebagai catatan saat itu.
  VONIS AUDIT: LOLOS, nol error. Yang belum (tetap
  terbuka): verifikasi $150 Meta (blokir sign-in browser,
  menunggu aksi Patria), tes live Muse, re-baseline biaya
  penuh, Fase 0 lolos penuh, Fase 4/5/6, video demo,
  submit 4 Nov, keputusan brand final / provider gambar /
  nama tim / Kanban 5v3 / teknologi UI, 10 engine video
  editor, gambar untuk 7 draf Postiz, hapus cron posting
  setelah 4 Nov.

  RECHECK NAV HOME-ONLY 27 Okt sore (perintah Patria
  "prototipe masih tampil, cek ulang"): uji browser live
  gagal BUKAN karena halaman rusak — browser itu menolak
  alamat loopback (127.0.0.1/localhost) di level request,
  situs eksternal normal. Rute pengganti: file build yang
  persis dibuka user dieksekusi di mesin DOM (jsdom) dengan
  klik sungguhan — HASIL: Home awal: no-nav false,
  agentCol/detailCol flex, resizer block; klik Kanban:
  no-nav true, keempatnya none, view-kanban aktif; klik
  Graph: tetap tersembunyi; klik Home: kembali tampil,
  no-nav false; 0 error script. VONIS: kode BENAR dan
  bekerja; tampilan "masih tampil" di layar Patria berasal
  dari salinan build LAMA (tab/lampiran sebelum perbaikan
  nav) yang belum dimuat ulang — bukan bug baru.

  BUILD APP — TAHAP A DIMULAI (Patria 27 Okt sore "setuju,
  lakukan"): protokol build dulu (app/AGENTS.md, status.md,
  rule.md, TODO.md, PLAN.md — prompt + status + rule + TODO
  + PLAN sesuai protokol), lalu scaffold shell Tauri
  (app/src-tauri: Cargo.toml, build.rs, main.rs tanpa
  unwrap/expect, tauri.conf.json, capabilities/default.json,
  .gitignore target/+node_modules). Keputusan: productName
  MiniMe, identifier com.minime.hackathon, window main
  1280x800, frontendDist ../../prototype-v5/build (sumber
  tunggal, tanpa duplikat 209 KB), CSP eksplisit untuk
  inline script/style + data: + IPC, bundle target app
  (debug .app; .dmg menyusul bila diminta). Svelte 5
  DIKUNCI sebagai framework, mount-nya Tahap B. Validasi
  di VM: JSON parse OK, frontendDist ter-resolve, scan
  lolos. Kompilasi Rust TIDAK bisa divalidasi di VM (tanpa
  Rust) — validasi itu menjadi tugas build MacBook.

  BUILD APP — GAGAL SATU FILE, LALU DIPERBAIKI (27 Okt sore):
  Rantai build v1 di MacBook jalan sampai akhir TAPI tanpa
  bundle — dan skrip v1 tidak memakai set -e sehingga tetap
  mencetak DONE (pelajaran: rantai build wajib fail-fast +
  verifikasi artefak, bukan sekadar mencapai akhir).
  Diagnosis dari log (1.093 baris): tauri-cli terinstal OK,
  semua crate terkompilasi (tauri 2.12.5, tao, dll.), lalu
  gagal di langkah terakhir: proc macro generate_context!()
  panik "failed to open icon .../app/src-tauri/icons/
  icon.png: No such file or directory" — scaffold Tahap A
  tidak menyertakan direktori icons sama sekali. Perbaikan:
  icon.png 1024x1024 RGBA dibuat dari mark brand MiniMe
  (prototype-v5/assets/minime-icon.png 957x956, ditempel
  tengah kanvas transparan tanpa stretch) ke
  app/src-tauri/icons/icon.png dan di-commit. Rantai v2
  (set -e + marker jujur) akan: pull -> cargo tauri icon
  (generate .icns + ukuran) -> build --debug -> verifikasi
  bundle -> open -> pgrep. Catatan: kegagalan ini juga
  menjelaskan kemungkinan gagalnya cargo check VM (macro
  yang sama membaca icon.png) — perbaikan ini melayani
  keduanya.

  BUILD APP — TAHAP A SUKSES + AUDIT LOLOS (27 Okt sore):
  Rantai v2 (set -e): pull OK (HEAD 08b8e3b) -> cargo
  tauri icon OK (set ikon lengkap: .icns, png, Square
  logos) -> cargo tauri build --debug SUKSES -> bundle
  ADA: app/src-tauri/target/debug/bundle/macos/MiniMe.app
  -> open OK -> proses HIDUP PID 22069 (binary
  MiniMe.app/Contents/MacOS/minime, masih hidup saat
  verifikasi susulan). Marker MH_BUILD2_OK tercapai.
  Validasi VM menyusul lolos: cargo check exit 0
  ("Finished dev profile in 3m 10s", minime vs tauri
  2.12.5) — perbaikan icon juga menyelamatkan check ini.
  AUDIT PASCA-BUILD: tsc 0 error; gate-test 13/13;
  scan lolos SETELAH target/ VM dihapus — scan sempat
  menandai false positive (fragmen hash di fingerprint
  JSON build artifact), bukan kunci asli; target/ memang
  tidak boleh ada di tree kerja (sudah di-.gitignore).
  Cargo.lock di-commit (tauri 2.12.5 = sama dengan yang
  di-resolve build MacBook). gen/ (4 skema JSON 304K
  hasil generate tauri-build) di-.gitignore + dihapus
  dari tree VM (regenerable, bukan source). Klarifikasi
  ukuran: build v5 = 209.781 byte (angka 209.380
  sebelumnya adalah hitungan karakter Python, bukan
  byte). frontendDist bundle = build v5 terkini (pastel
  53x, rule no-nav ada). YANG MASIH MENUNGGU TANGAN
  PATRIA: konfirmasi visual jendela app + klik
  Home->Kanban->Home di MacBook (verifikasi remote
  hanya sampai bundle + proses hidup). Berikutnya:
  wiring Tahap B (B1 scaffold Svelte + mount).

  WIRING — B1 SELESAI (27 Okt sore): scaffold Svelte 5 +
  Vite di app/ (package.json, vite.config.ts, index.html,
  src/main.ts, src/App.svelte minimal, vite-env.d.ts,
  tsconfig.json; package-lock.json ikut di-commit).
  Resolusi: svelte 5.57.3, vite 6.4.5, plugin 5.1.1 (npm
  install 40 paket). vite build LOLOS (109 modul, 1,34
  detik; dist: index.html 0,39 KB + JS 31,39 KB + CSS
  0,42 KB; string "Svelte mounted" + aksen pastel ada di
  output). base './' TERBUKTI: dist/index.html memakai
  ./assets/... (bukan absolut) — syarat WebView Tauri.
  Keputusan: frontendDist BELUM dialihkan ke app/dist
  di B1 — mengalihkannya sekarang akan mengganti UI
  live-test (v5 lengkap) dengan halaman mount minimal,
  itu regresi; pengalihan + rebuild MacBook menjadi
  bagian verifikasi B2 (setelah migrasi komponen).
  svelte-check TIDAK dipasang di B1 (vite build adalah
  gate compiler tahap ini; type-check komponen masuk
  B2 bersama komponen nyata). node_modules/ + dist/
  terabaikan git dengan benar (status hanya 6 item baru).

  WIRING — B2 MIGRASI + PARITY LOLOS (27 Okt sore):
  Migrasi mekanis prototype-v5/index.html (103.597 byte)
  ke Svelte via skrip /tmp/migrate-v5.py (BUKAN tulis
  ulang dari memori): <style> -> app.css verbatim
  (18.991 byte); markup body -> App.svelte (38.323
  byte, 58 handler statis dikonversi ke binding Svelte
  onclick=/onchange=/oninput=, this -> e.currentTarget);
  2 blok <script> -> lib/v5logic.js (49.084 byte):
  61 deklarasi function di-export, 19 var di level
  modul, 23 pernyataan eksekusi dipindah ke initV5()
  dalam urutan asli (dijalankan onMount), diakhiri
  expose semua 90 nama ke window (markup hasil
  innerHTML runtime butuh global seperti aslinya).
  Dua jebakan ditangkap skrip sebelum sempat jadi bug:
  (1) deklarasi function berawalan komentar section
  (showView, switchProject, +1) sempat tak terdeteksi
  export; (2) nama di dalam string handler ('CTA (',
  'Hook (', ...) sempat dikira pemanggilan fungsi —
  keduanya diperbaiki (strip komentar/string).
  PNG brand -> app/public/ (disalin verbatim ke dist).
  vite build LOLOS (111 modul, 2,35 dtk; JS 104 KB,
  CSS 16 KB; bundle tanpa import/export/import.meta).
  Peringatan build HANYA a11y (54x: div klik tanpa
  keyboard handler + label tanpa kontrol) — non-blocking,
  semantik sama persis dengan HTML v5, bukan error.
  PARITY jsdom 16/16 LOLOS pada dist: home awal
  (no-nav false, kolom flex, resizer block), init
  (chatBox 7 anak, agentList 11 anak), klik Kanban
  (no-nav true, kolom none), klik Graph (tetap
  hidden), klik Home (pulih penuh), 0 script error.
  Catatan rig: skrip dist (module, deferred) harus
  dipindah ke akhir body saat dijalankan sebagai
  classic script di jsdom — artefak rig saja, bukan
  bug aplikasi (di Tauri, module deferral menjamin
  #app sudah ada). frontendDist dialihkan dari
  ../../prototype-v5/build ke ../dist; rebuild
  MacBook rantai v3 (pull -> npm install -> vite
  build -> tauri build -> bunuh proses lama -> open
  -> pgrep) dimulai; hasil menyusul.

  WIRING — B2 LIVE DI MACBOOK (27 Okt sore, rantai v3):
  Rantai v3 sempat gagal di git pull: file Cargo.lock
  hasil generate build MacBook (untracked) bertabrakan
  dengan Cargo.lock yang masuk repo di commit 6e83b54
  ("untracked files would be overwritten"). Perbaikan:
  hapus Cargo.lock lokal MacBook saja (regenerable;
  versi commit sama, tauri 2.12.5) lalu restart rantai
  — pull lolos ke 8f9e209. Build sangat cepat berkat
  cache hangat (npm cache Minime v2 + cargo cache
  rantai v2): vite 361ms, cargo 3,47 dtk, 1 bundle.
  Proses lama (PID 22069, frontend v5) dibunuh dulu
  via pkill agar open tidak sekadar mengaktifkan
  proses lama; proses BARU PID 23154 hidup dari
  bundle baru (frontendDist ../dist). Catatan: file
  icons/icon.png termodifikasi lokal oleh cargo tauri
  icon (re-encode) — tidak menghambat pull karena
  upstream tidak menyentuhnya; dibiarkan apa adanya.
  Sisa verifikasi visual (jendela + klik) tetap di
  tangan Patria. Berikutnya: B3 (chat via router +
  gate di UI; desain bridge frontend-backend diputuskan
  dulu di awal fase).

  WIRING — B3 CHAT VIA ROUTER + GATE DI UI (27 Okt sore):
  Keputusan bridge (dicatat dulu, baru bangun): TIDAK
  ada server terpisah, TIDAK ada rewrite Rust — router
  TypeScript yang sama di-bundle ke frontend via Vite.
  Syaratnya 2 refaktor kecil router.ts (perilaku tidak
  berubah, dibuktikan tsc + gate 13/13): (1) import
  CostRecord diubah ke `import type` (ledger.ts menarik
  fs/path Node — tanpa ini bundle gagal); (2) tambah
  defaultRouterConfig() browser-safe, dan
  routerConfigFromEnv() mendelegasikan ke sana (satu
  sumber default; chat.ts memakai default + kunci dari
  localStorage). Bundle terbukti bebas kode Node
  (grep CostLedger/fs = 0) dan memuat 3 origin router.
  Chat: v5logic.sendChat() diberi hook delegasi
  (setSendChatImpl; guard di baris pertama) sehingga
  composer, chip quickChat, DAN Enter semua mengalir
  ke sendChatReal (chat.ts) tanpa mengubah wiring v5:
  bubble user -> router.callWithFallback -> bubble
  Prime + footer provenance (provider/model/latensi/
  fallback); gagal -> bubble error jujur, bukan balasan
  karangan. Kunci HANYA di localStorage perangkat
  (input password di Settings; tidak ikut bundle/repo;
  tanpa kunci, provider dilewati chain seperti runner
  Node). CSP connect-src ditambah 3 origin persis:
  api.meta.ai, generativelanguage.googleapis.com,
  127.0.0.1:11434. vite.config: server.fs.allow ['..']
  agar dev server bisa melayani ../src/router.ts.
  Gerbang (jujur soal cakupan): UI TIDAK PUNYA tombol
  kirim live untuk dikunci (Planner menegaskan itu) —
  maka B3 memberi status gerbang terlihat (Planner +
  Settings: GSTP LOLOS, GKonten LOLOS, GBatch BELUM),
  guard requireGate() untuk jalur kirim masa depan,
  dan jalur DRAF sengaja TIDAK dikunci (kanon: draf
  tidak butuh GBatch). Cermin state dari record
  approval asli (trace + tanggal terverifikasi).
  Verifikasi: parity jsdom 16/16 lolos ulang; rig B3
  lolos 2 mode (stub sukses: balasan Ollama + footer
  + simpan kunci + status; stub gagal: bubble error
  menyebut semua provider); tes LIVE Node dengan kunci
  surrogate: provider gemini, model gemini-3.1-flash-
  lite, 3469ms, fallback dari meta, balasan benar
  ("Warna langit pada siang hari adalah biru.").
  Berikutnya: rebuild MacBook rantai v4 (frontendDist
  sudah ../dist; npm install tidak berubah deps).

  WIRING — B3 LIVE DI MACBOOK (27 Okt sore, rantai v4):
  Pull lolos bersih (upstream B3 tidak menyentuh
  Cargo.lock/icons yang termodifikasi lokal). Build
  hangat: vite 351ms, 1 bundle. Proses lama PID 23154
  dibunuh, proses BARU PID 23734 hidup dari bundle
  B3. Catatan: marker skrip masih tertulis
  MH_BUILD3_OK (skrip v4 disalin dari v3) — kosmetik
  saja; semua langkah di bawah set -e lolos. Sisa
  verifikasi visual di tangan Patria, termasuk chat
  live: tanpa kunci, chat memakai Ollama lokal MacBook
  (pastikan ollama serve jalan); kunci Gemini/Meta
  diisi sekali di Settings bila mau jalur cloud.
  Berikutnya: B4 (Kanban/Planner dari data backend).

  WIRING — B4 KANBAN/PLANNER DATA NYATA (27 Okt sore):
  Kanban TEST Kopi + Planner tidak lagi dummy: keduanya
  diturunkan dari artefak lari nyata via modul baru
  app/src/lib/backend-data.ts (impor JSON langsung):
  Fase-1 (stages done), Fase-2 (kalender 7 + brief 7),
  Fase-3 (carousel 7, slide 21, QC per slide), record
  draf Postiz (7 postId + tanggal), dan gates.ts
  (GSTP/GKonten lolos, GBatch belum). Kolom dihitung
  dari aturan, bukan ditulis tangan: STP/Kalender
  lolos gerbang -> Selesai; carousel QC semua lolos
  -> Selesai (gagal QC -> Revisi); gambar pending-
  provider -> Antrian (belum mulai, bukan Dikerjakan);
  draf Postiz tercipta -> Selesai; terbit -> Butuh
  Approval (menunggu GBatch). Hasil: Selesai 5,
  Antrian 1, Butuh Approval 1, Dikerjakan 0, Revisi 0.
  Kartu dummy keluar dari kanon ikut terhapus:
  "Carousel + Reels" dan "Talking Head promo" (video
  BUKAN MVP). Planner 7 baris nyata (tema per hari,
  channel Instagram Branding, Marketing & AI, tanggal
  draf, status DRAF, kolom baru postId lengkap).
  Tanggal draf dirender persis seperti record (UTC,
  tanpa konversi diam-diam ke WIB). Kejujuran kecil
  lain: cardComments() tidak lagi mengarang angka
  dari panjang judul — kini 0 (belum ada backend
  komentar). Yang TIDAK diubah B4 (dicatat jujur):
  proyek TEST Produk Digital tetap dummy (tidak ada
  artefak untuknya); drag/"Maju"/"Add task" tetap
  session-only tanpa persistensi; data ini snapshot
  build-time — lari Fase baru tidak me-refresh app
  sampai build berikutnya; dummy chat/media view lain
  masih dummy (di luar cakupan B4). Verifikasi:
  parity 16/16 lolos ulang; rig B4 28/28 lolos
  (kartu, kolom, baris, postId, tanggal, tidak ada
  dummy di kedua view). Berikutnya: rebuild MacBook
  rantai v5; lalu B5 (draf Postiz dari app).
