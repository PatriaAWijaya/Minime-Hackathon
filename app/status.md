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
