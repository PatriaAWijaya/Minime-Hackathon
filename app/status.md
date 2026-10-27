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
