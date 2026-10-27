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
- (Diisi setelah percobaan push Git Data API — jangan diisi dengan klaim
  sebelum percobaan benar-benar jalan dan terbaca-balik.)
