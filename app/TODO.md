# TODO.md — MiniMe App Build

## Tahap A — shell (in progress, 27 Oct 2026 sore)
- [x] Protocol docs: AGENTS.md, status.md, rule.md, TODO.md, PLAN.md
- [x] Tauri shell scaffold (`app/src-tauri/`) + config + capabilities
- [x] FrontendDist points at `prototype-v5/build` (no duplicate copy)
- [x] JSON validation + credential scan pass
- [x] Commit + push (SHA pair recorded)
- [x] Clone/pull repo on MacBook, verify toolchain (cargo, tauri CLI)
- [x] `tauri build --debug` on MacBook, verify `.app` bundle
- [x] Launch app on MacBook, verify process alive + window opens
- [ ] Live click test: Home → Kanban → Graph → Home (columns rule)
  (verifikasi visual/klik oleh Patria di MacBook)

## Uji konsistensi (after Tahap A)
- [x] `npx tsc` 0 errors, gate-test all pass, scan passed
- [x] tauri.conf.json valid; frontendDist content == current v5 build
- [x] Bundle exists, app launches, nav/columns/theme behave
  (remote: bundle + proses hidup; visual/klik: Patria, lihat di bawah)
- [x] Log entry + push
- [ ] Konfirmasi visual Patria: jendela app + klik Home→Kanban→Home
  (kolom rule) di MacBook

## Tahap B — full wiring (after the audit, gated sub-phases)
- [x] B1: Svelte 5 scaffold + Vite (`base: './'`) + mount
  (vite build lolos 1,34 dtk, dist JS 31 KB, base './'
  terverifikasi; frontendDist switch di B2)
- [x] B2: Migrate v5 views into Svelte components (parity check vs v5)
  (migrasi mekanis + parity jsdom 16/16; frontendDist
  ../dist; rebuild MacBook v3 sukses, app Svelte jalan PID 23154)
- [x] B3: Frontend ↔ backend API (chat via router, gates, approvals)
  (router di-bundle ke frontend; parity + rig B3 lolos;
  tes live Gemini lolos; rebuild MacBook v4 sukses, app jalan PID 23734)
- [x] B4: Kanban/Planner data from backend (no more hardcoded cards)
  (diturunkan dari artefak Fase 1–3 + record Postiz;
  rig B4 28/28 lolos; rebuild MacBook v5 sukses, app jalan PID 24065)
- [x] B5: Postiz drafts from the app (draft-only, unchanged rule)
  (composer Planner -> draf nyata via /api/public/v1;
  rig B5 15/15 lolos; uji live MacBook menunggu kunci Patria;
  rebuild MacBook v6 sukses, app jalan PID 24427)
- [x] B6: Full wiring audit (zero-error gate) + log + push
- [x] B7: i18n ID/EN/ZH — kamus + selector Pengaturan + instruksi bahasa ke router + log + push
  (audit LOLOS: tsc 0, gate 13/13, scan lolos, svelte-check
  0 error, semua rig hijau; rebuild MacBook rantai v10 live PID 26752)
- [x] Hapus kalimat gerbang dari panel Detail (perintah Patria 19:39) + log + push
  (bundle terverifikasi 0 kemunculan kalimat; live ikut rantai v11)
- [x] Media Studio 4 tab (perintah Patria 19:42): menu Video Editor terpisah dihapus,
  tab Script/Image/Voice/Video + log + push
  (rig-ms 20/20 lolos; svelte-check 0 error, warning 54 -> 38;
  rebuild MacBook rantai v11 sukses, app jalan PID 27300)
- [x] Voice Editor wiring VoiceStudio (perintah Patria 20:09): klien API lokal + UI Clone + log + push
  (rig-vs 14/14 lolos; svelte-check 0 error; CSP + :3900;
  rebuild MacBook rantai v12 sukses, app jalan PID 28629;
  bukti live menunggu VoiceStudio.app dibuka Patria)
- [x] Hapus 6 kalimat catatan (perintah Patria 20:35) + log + push
  (bundle terverifikasi 0 kemunculan; rebuild MacBook rantai v13 sukses, app jalan PID 29831)
- [x] Video engine Tier 1 (perintah Patria 20:40) + audit detail (perintah Patria 20:49) + log + push
  (semua gerbang hijau; rebuild MacBook rantai v14 sukses, app jalan PID 30714;
  bukti live klik Render menunggu Patria; Tier 2-3 antre berikutnya)
- [x] Tier 2 (1/3): probe + asset library + log + push
  (video_probe + video_asset_hash + panel Aset; rebuild MacBook rantai v15 sukses, app jalan PID 31841;
  bukti live klik panel Aset menunggu Patria; Tier 2 (2/3) + (3/3) antre berikutnya)
- [x] Tier 2 (2/3): audio mix/ducking + caption ASS sidecar + log + push
  (ducking sidechaincompress/amix via asplit + Simpan ASS; rebuild MacBook rantai v16 sukses, app jalan PID 32865;
  bukti live klik ducking + Simpan ASS menunggu Patria; burn-in caption BLOKIR ffmpeg tanpa subtitles/drawtext;
  Tier 2 (3/3) transkripsi antre berikutnya)

## Parked (Patria's call)
- [ ] `.dmg` distribution build
- [ ] Video editor engines (see `docs/video-editor-engines.md`)
- [ ] Images for the 7 Postiz drafts (needs image provider decision)
