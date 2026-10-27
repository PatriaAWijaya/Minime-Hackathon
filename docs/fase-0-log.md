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
