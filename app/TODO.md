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
- [ ] B6: Full wiring audit (zero-error gate) + log + push

## Parked (Patria's call)
- [ ] `.dmg` distribution build
- [ ] Video editor engines (see `docs/video-editor-engines.md`)
- [ ] Images for the 7 Postiz drafts (needs image provider decision)
