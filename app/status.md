# status.md — MiniMe App Build

## Current state (27 Oct 2026 sore)
- Repo: NestJS backend + fase runners (Fase 0 conditional, Fase 1
  + GSTP approved, Fase 2 + GKonten approved, Fase 3 + 7 Postiz
  drafts as DRAFT-only). `tsc` 0 errors, gate-test 13/13, scan
  passed, prototype JS checks passed (audit 27 Oct sore).
- UI: prototype v5 single-file build (`prototype-v5/build/
  minime-v5.html`, ~209 KB): Muse-style dark UI, monochrome +
  pastel pink `#FFD1DC`, Kanban 5 kolom, Graph gaya n8n, Media
  Studio + full Video Editor view (click-only, dummy data),
  agent list + Detail only in Home window.
- App shell: BUILT + LAUNCHED 27 Oct sore (Tahap A). Bundle:
  `app/src-tauri/target/debug/bundle/macos/MiniMe.app` di
  MacBook (HEAD 08b8e3b, proses PID 22069 hidup saat
  verifikasi). Frontend = build v5 statis (dummy data).
- Live test: aplikasi desktop sudah bisa dibuka di MacBook;
  klik sudah teruji di mesin DOM (jsdom, lolos) dan proses
  app hidup; konfirmasi visual jendela + klik di tangan
  Patria (satu-satunya yang tidak bisa diverifikasi remote).
- B1 (27 Okt sore): scaffold Svelte 5 + Vite lolos build
  (svelte 5.57.3, vite 6.4.5; mount terverifikasi di dist,
  base './' OK). frontendDist masih prototype-v5/build
  sampai B2 (menghindari regresi live-test).
- B2 (27 Okt sore): migrasi mekanis v5 -> Svelte LENGKAP
  (App.svelte + app.css + lib/v5logic.js, logika tidak
  diubah; parity jsdom 16/16 lolos). frontendDist kini
  ../dist; rebuild MacBook rantai v3 berjalan.
- B3 (27 Okt sore): chat via router di-bundle ke
  frontend (delegate hook di sendChat; kunci di
  localStorage; gate status + guard GBatch). Parity +
  rig B3 lolos; tes live Gemini lolos; rantai v4 berjalan.
- B4 (27 Okt sore): Kanban TEST Kopi + Planner dari
  artefak nyata (Fase 1–3 + record Postiz; rig B4
  28/28 lolos). Rantai v5 berjalan.
- B5 (27 Okt sore): composer Planner -> draf Postiz
  nyata (draft-only; /api/public/v1 + kunci raw;
  rig B5 15/15 lolos). Rantai v6 berjalan.
- B6 (27 Okt sore): AUDIT LOLOS — tsc 0, gate 13/13,
  scan lolos, svelte-check 0 error (55->54 warning a11y),
  parity + rig B3/B4/B5 hijau. Rantai v7 sukses, app
  jalan PID 24681.
- AUDIT MENDETAIL (27 Okt sore, perintah Patria 19:10):
  vonis LOLOS, nol error (tsc 0, gate 13/13, scan lolos,
  svelte-check 0 error, cargo check segar lolos, semua rig
  hijau). Rantai v9 berjalan.
- SCROLLBAR PER-KOLOM (27 Okt sore, perintah Patria
  19:12): rantai tinggi diperbaiki di #app (file baru
  layout-scroll.css, app.css tetap verbatim); window
  tak lagi scroll, tiap kolom scroll sendiri, composer
  menempel bawah. Rantai v9 sukses, app jalan PID 25603.
- KONFIRMASI VISUAL (27 Okt 19:19 WIB, Patria): window + klik + resize/scrollbar baru DISETUJUI.
- B7 i18n (27 Okt sore, perintah Patria 19:18): kamus EN/ZH + selector Pengaturan + instruksi bahasa ke router — SELESAI, rig-b7 17/17 lolos; rantai v10 live PID 26752 (HEAD remote 3658292).
- Hapus kalimat gerbang dari panel Detail (27 Okt 19:39, perintah Patria): kalimat "Gerbang (GSTP/GKonten/GBatch) tidak bisa dimatikan dari panel ini." dihapus dari template Detail; bundle terverifikasi 0 kemunculan; kode lokal a599e64 <-> remote 68c5c65.
- Media Studio 4 tab (27 Okt 19:42, perintah Patria): menu Video Editor terpisah dihapus dari rail; Media Studio kini 4 tab bergantian — Script Editor (pad naskah tersimpan lokal), Image Editor (grid + filter + status generator), Voice Editor (aset suara + tombol Suara), Video Editor (editor lengkap ve2 + toolbar) — SELESAI, rig-ms 20/20 lolos; rantai v11 live PID 27300 (HEAD remote b9beca9). Default tab Video (PROVISIONAL).
- Voice Editor wiring VoiceStudio (27 Okt 20:09, perintah Patria): klien API lokal :3900 + UI Clone gaya VoiceStudio (status, voice, TTS, clone referensi, model, player + unduh) — SELESAI, rig-vs 14/14 lolos; rantai v12 live PID 28629 (HEAD remote ec05496). Engine offline saat build (VoiceStudio.app tertutup); bukti live menunggu Patria buka app-nya.
- Hapus 6 kalimat catatan (27 Okt 20:35, perintah Patria): subjudul Media Studio, catatan Script, notice status generator, catatan proses VoiceStudio, notice pola Diffusion, notice daftar engine — SELESAI, bundle 0 kemunculan; rantai v13 live PID 29831 (HEAD remote 6f1ce50).
- Video engine Tier 1 (27 Okt 20:40, perintah Patria) + audit detail (27 Okt 20:49, perintah Patria): model timeline + compiler FFmpeg murni + Rust render/QC/capture + panel Render tab Video — SELESAI, semua gerbang hijau (tsc 0, gate-test 13/13, scan PASSED, build pass, svelte-check 0 error, cargo check exit 0, clippy 0 warning, uji compiler 20 assert, rig 8/8, i18n 261 key x 3 nihil mati); rantai v14 live PID 30714 (HEAD remote d787f8b). Bukti pipeline: render manual argv compiler = 5.0 dtk persis. Bukti live klik Render menunggu Patria.
- Tier 2 (1/3) probe + asset library (27 Okt malam, perintah Patria 20:47): video_probe + video_asset_hash (SHA-256) + panel Asset Library tab Video — SELESAI, semua gerbang hijau (tsc 0, gate-test 13/13, scan PASSED, build pass, svelte-check 0 error, cargo check exit 0, clippy 0 warning, compile 23 assert, parity-rebuilt 10/10, rig-t2 17/17, i18n 270 key x 3 nihil mati); rantai v15 live PID 31841 (HEAD remote a0fdadc). Catatan: rig lama hilang karena /tmp wipe, dibangun ulang; modul lama tak tersentuh. Bukti live klik panel Aset menunggu Patria.
- Tier 2 (2/3) audio mix/ducking + caption ASS sidecar (27 Okt malam, perintah Patria 20:47): track voice/musik + ducking sidechaincompress/amix (fan-out asplit) + generator ASS + Rust video_write_ass + seksi Simpan ASS — SELESAI, semua gerbang hijau (tsc 0, gate-test 13/13, scan PASSED, build pass, svelte-check 0 error, cargo check exit 0, clippy 0 warning, compile 23/23 + 16/16, rig-t2b 16/16, rig-t2 17/17, parity 10/10, i18n 283 key x 3 nihil mati); rantai v16 live PID 32865 (HEAD remote bfc737e). Bukti ducking manual: minime-t2-duck-bukti.mp4 3.0 dtk (h264+aac). BLOKIR: burn-in caption tidak bisa (ffmpeg MacBook tanpa subtitles/drawtext) — yang jadi ASS sidecar; butuh keputusan Patria. Bukti live klik ducking + Simpan ASS menunggu Patria.
- Hapus panel status gerbang + catatan Planner + judul/catatan composer Postiz (28 Okt dini hari, perintah Patria): panel `.gate-status` (injeksi Planner + Settings) + `planner.notice` + `planner.composer.title/note` dihapus total; 13 key x 3 dihapus (i18n 283 -> 270 key x 3, nihil mati/duplikat/selisih). YANG TETAP: GATES + requireGate (penguncian gerbang tetap jalan), textarea + tombol composer (buat draf Postiz dari app tetap bisa), heading Gerbang di Settings, record approval + 7 draf Postiz (tidak dihapus — hanya teks UI). Verifikasi: build, svelte-check 0 error, tsc 0, gate-test 13/13, scan PASSED, bundle 0 kemunculan, rig-del 9/9. Rantai v17 live PID 41353 (HEAD remote fd39a54). CATATAN: /tmp ter-wipe KEDUA kalinya — rig lama (jsdom-test2) hilang lagi; rig-del dibangun baru di /tmp/jsdom-del; pemindahan harness rig ke repo makin mendesak.

- Sidebar Cost + ikon Cost/Setting (28 Okt dini hari, perintah Patria): tombol rail Cost baru (ikon gear + $ kiriman Patria) + view-cost tabel biaya per model — Muse Spark 1.3 aktual (1 panggilan, 34/684 token, $0,00295 ~Rp53,5) + Gemini 3.1 Flash-Lite Fase 1-3 (7 panggilan, 10.859 token, rincian menunggu dashboard, rentang $0,0027-$0,0163 ~Rp49-Rp296) + total (8 panggilan, 11.577 token, $0,00565-$0,01925 ~Rp102,5-Rp349,5); tombol Settings ganti ikon hamburger kiriman Patria (invert CSS karena rail gelap, file apa adanya); i18n 286 kunci x 3 nihil mati; verifikasi build + svelte-check 0 error + tsc 0 + gate-test 13/13 + scan PASSED + rig-cost 16/16. Rantai v18 live PID 42171 (HEAD remote e7d2cc2). SISA: rincian token Gemini menunggu hasil dashboard Google Cloud.

- Hapus sufiks judul Library + note ve.lib.note (28 Okt dini hari, perintah Patria): judul jadi 'Library' saja (3 bahasa) + paragraf penjelas di colhead Library dihapus + kunci ve.lib.note x3 dihapus (i18n 285 kunci x 3 nihil mati); tombol 'Gunakan' + 'Perbaiki Lanjut' tetap berfungsi. Verifikasi build + svelte-check 0 error + tsc 0 + gate-test 13/13 + scan PASSED + rig-libdel 8/8. Rantai v19 live PID 43276 (HEAD remote 04e8dd5).

- Sapuan hapus teks + seksi (28 Okt dini hari, 4 perintah Patria): teks Search/Kanban/Graph + judul Graph jadi 'Graph'; seksi bawah Graph dihapus total (detail node, form koneksi, daftar edge; kanvas + Run + notice simulasi tetap); judul Planner jadi 'Planner' + note aset ve2 + 3 note Cost dihapus; composer Planner dihapus total (textarea + tombol + notice; draf baru hanya lewat dashboard Postiz; 7 draf + tabel + record tidak disentuh). i18n 285 -> 263 kunci x 3 nihil mati; verifikasi tiap commit hijau + rig-graphdel 14/14, rig-del3 8/8, rig-del4 5/5. Rantai v20 live PID 43975 (HEAD remote 6133652).

- Bagian 2 ditutup (keputusan Patria 28 Okt ~04:36): Gemini Fase 1-3 tertagih $0 free tier, total Cost jadi $0,00295/Rp53,5; rincian input/output dicatat tak dapat direkonstruksi, kolom in/out jadi '—'. Header Cost dihapus (judul 'Cost' saja, subjudul hilang). i18n 261 kunci x 3. Rantai v21 live PID 44380 (HEAD remote a440c85). Pernyataan lolos PENUH Fase 0 tetap menunggu Patria.

- Cost jadi Billing (perintah Patria + screenshot Billing Meta 28 Okt 04:37): menu rail Billing dengan ikon kartu kredit SVG (cost-icon.png dihapus); view tabel diganti 3 kartu — Pemakaian tercatat, Kredit & pembayaran ($150.00 / Rp 0 / belum ditambahkan), Batas belanja (hard limit $5 + pemakaian $0,00295); tanpa tombol aksi palsu. i18n 270 kunci x 3. Rantai v22 live PID 44647 (HEAD remote f75f9b0).

- FASE 0 LOLOS PENUH (pernyataan Patria 28 Okt ~11:20 WIB, 'Fase 0 lengkap'). Pembersihan audit: export mati createPostizDraft dihapus + cargo fmt video.rs; i18n 269 kunci x 3. Rantai v23 live PID 46181 (HEAD remote 27e9e68).

- Ikon rail: Home -> Chat + ikon terlampir Kanban/Media Studio LIVE rantai v24 PID 47306 (kode lokal c94eaeb <-> remote 759fe33; bundle 186.92 kB; rig-icons 8/8).

- List agen collapsible per project LIVE rantai v25 (kode lokal 8457991 <-> remote 36ca072; rig-groups 12/12).
- Ikon macOS: icon.icns di repo (lokal 527ff61 <-> remote e671d8e); bundel debug ditambal icon.icns + CFBundleIconFile di rantai v26, LIVE PID 55237 (bundler debug tidak menyertakan ikon secara native).

- Pembersihan audit ke-2: 2 kunci i18n mati dihapus, i18n 267 kunci x 3, LIVE rantai v27 PID 58260 (kode lokal 0befc8b <-> remote 3fd091c; rig-billing 4/4).

- Fase 4 SELESAI 28 Okt: 12 lead FIKSI -> 10 deduped, skor 1-5 rule-based, pipeline, 6 draf Outreach (0 kirim, 0 model call); gate-test 14/14.

- Menu Campaign LIVE rantai v28 PID 61514: tombol rail ikon megafon + 4 tab (Leads Generator, Leads & CRM PROVISIONAL, Outreach, Follow Up); CRM/Outreach dari data Fase 4 asli; i18n 280 kunci x 3; rig-campaign 17/17 (kode lokal 48ce788 <-> remote 344a27f).

## Phase recommendations (see PLAN.md for acceptance criteria)
1. **Tahap A — shell (now):** Tauri 2 shell + v5 static frontend,
   debug `.app` on the MacBook, launch + click live test.
   No Node deps, no Svelte mount yet (deliberate: fastest live
   test, zero dead weight).
2. **Uji konsistensi (right after Tahap A):** full zero-error
   audit of repo + app shell (tsc, gate-test, scan, config
   validity, frontendDist == current v5 build, bundle exists,
   app launches, nav/columns behave).
3. **Tahap B — full wiring (after the audit):** Svelte 5
   migration of the v5 UI into components, then frontend ↔
   backend wiring (chat via router, gates, Kanban/Planner data,
   Postiz drafts) in gated sub-phases. NOT one giant commit.

## Open items (Patria's decisions, not the agent's)
- Final test brand, image provider + price, submission team
  name/composition, Kanban 5 vs 3 columns, `.dmg` distribution.
- Meta $150 credit verification (blocked on Patria's dashboard
  check), live Muse test, full cost re-baseline, Fase 0 full pass.
- Video editor engines build order (`docs/video-editor-engines.md`).
