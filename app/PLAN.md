# PLAN.md — MiniMe App Build

## Goal
A runnable MiniMe desktop app on Patria's MacBook for live testing,
then full wiring to the real backend — built from scratch during
the hackathon, Indie new-work-only.

## Tahap A — shell (SELESAI; mount verified di B1)
**Scope:** Tauri 2 shell + the v5 single-file UI as a static
frontend. No Node dependencies, no Svelte mount yet (deliberate:
fastest live test, zero dead weight). Svelte 5 stays the locked
framework decision; mounting + components are Tahap B.
**Files:** `app/src-tauri/` (Cargo.toml, build.rs, src/main.rs,
tauri.conf.json, capabilities/default.json), `app/.gitignore`.
**Config choices:**
- productName `MiniMe`, identifier `com.minime.hackathon`,
  version `0.1.0`, window label `main` (1280×800).
- `frontendDist`: `../dist` (relative to `src-tauri/` =
  repo `app/dist`) — Vite build output, single source of truth,
  no duplicate copy (prototype-v5/ archived 28 Okt 2026).
- Explicit CSP allowing what the static UI needs (inline scripts
  + styles, `data:` images, Tauri IPC) so a restrictive default
  can never silently break the prototype JS.
- Bundle target `app` (bare `.app`, fastest debug cycle; `.dmg`
  only when Patria asks).
**Acceptance:** JSON parses; scan passes; repo pushed; MacBook
clone/pull succeeds; `tauri build --debug` succeeds; `.app`
bundle exists; app launches (process alive); click test
Home → Kanban → Graph → Home shows the columns rule working.

## Uji konsistensi (after Tahap A, before any wiring)
Full zero-error audit: repo checks (tsc, gate-test, scan) +
app checks (config validity, frontendDist == current v5 build (saat itu; kini ../dist),
bundle, launch, nav/columns/theme). Log + push. Wiring starts
only on a clean audit.

## Tahap B — full wiring (gated sub-phases, after the audit)
- **B1:** Svelte 5 + Vite scaffold (`base: './'`), mount verified.
- **B2:** v5 views → Svelte components, parity-checked against v5
  (same views, same theme, same nav rule, same handlers).
- **B3:** Chat via router (Meta → Gemini → Ollama) + gate
  enforcement in the UI (no approval invented by code).
- **B4:** Kanban/Planner backed by backend data, not hardcoded HTML.
- **B5:** Postiz drafts from the app (draft-only by default; batch schedule step authorized separately 28 Okt, double-confirm).
- **B6:** Full wiring audit (zero-error gate) + log + push.
- **B7:** i18n ID/EN/ZH — kamus + selector Pengaturan + instruksi bahasa ke router + log + push.
Each sub-phase is reviewed before the next starts. No sub-phase
is skipped, and no gate is self-approved.

## Non-goals for this build
- No `.dmg`/`.msi` distribution, no auto-updater, no installer.
- No live trading, no autoposting, no WhatsApp API sending.
- No copy of old Minime code, no vendored third-party UI code.
