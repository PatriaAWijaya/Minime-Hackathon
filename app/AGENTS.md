# AGENTS.md — MiniMe App Build (Minime-Hackathon)

Operating manual for building the MiniMe desktop app. This file is the
project's build prompt made concrete: any agent working on the app
reads this first, then `status.md`, `rule.md`, `TODO.md`, `PLAN.md`.

## What this app is
MiniMe, built from scratch for the Meta Global AI Developer Hackathon
2026 (Indie track, new work only, building period 27 Oct – 4 Nov 2026).
Agent orchestrator demo: brief → routing (Muse via Meta Model API,
fallback Gemini via Google API, fallback local DeepSeek/Qwen via
Ollama) → human approval gates → live evaluation harness.

## Stack (locked 27 Oct 2026 sore, by Patria)
- Desktop shell: **Tauri 2** (Rust backend, WebView frontend).
- Frontend framework: **Svelte 5** (locked as the framework decision;
  Tahap A ships the v5 static UI as the frontend, Svelte mounting +
  components land in Tahap B — see PLAN.md).
- Backend services: NestJS on Fastify (repo root `src/`, already
  built: router, ledger, policy/gates, queue, Postiz draft client).
- Repo: `PatriaAWijaya/Minime-Hackathon` (public, branch main).
  No copy-paste from old Minime code, ever (Indie new-work-only).

## How work proceeds
1. One phase at a time, in PLAN.md order. Review each phase before
   the next starts; never branch into parallel variants.
2. Zero-error gate per phase: `npx tsc`, `npm run gate-test`,
   `npm run scan`, prototype/app JS checks — all must pass before
   push. Push + log only when the check passes with zero errors.
3. Gates are Patria's alone. Never approve GSTP, GKonten, Fase 0,
   or any gate on his behalf. NOTE (koreksi audit v66): the app does
   NOT enforce gates in code — the old requireGate() was dead code
   and was removed. What authorizes a send in the app is the user's
   explicit click at that moment (Publish now / schedule with
   double-confirm for batch); there is no general live-send approval
   and no code gate. The Node runners (repo root src/policy.ts)
   enforce gates server-side; the Tauri app only records live usage
   and warns past the $5 self-imposed display limit.
4. Every change lands in `docs/fase-0-log.md` (master log) and the
   relevant PLAN/README/status notes, then is pushed with its SHA
   pair recorded (local ↔ remote, trees identical).
5. Builds run on Patria's MacBook (this VM has no Rust and no macOS
   toolchain). Debug builds first (`tauri build --debug`); a `.dmg`
   only when Patria asks for distribution.

## Where things live
- `app/src-tauri/` — Tauri shell (Rust + config + capabilities).
- `app/src/` — current UI source (Svelte 5 + v5logic, migrated
  from prototype v5 in Tahap B2); `app/dist/` is the Vite build
  that Tauri serves (frontendDist points there; prototype-v5/
  was archived out of the repo 28 Okt 2026, history kept in git).
- `src/` (repo root) — NestJS backend + fase runners.
- `docs/` — canon docs, gate records, engine list, master log.

## Standing decisions the build must respect
- Theme (Patria 30 Okt 2026): default follows the desktop
  (`prefers-color-scheme`, resolved by JS to `data-theme` on `<html>`);
  user override System/Dark/Light in Settings (`minime.theme`).
  Dark = Dark Violet Glass (violet-tinted glass surfaces + blur, violet
  accent); Light = clean light with the same violet accent. Implemented
  via `--t-*` variables in `layout-scroll.css`; `app.css` stays verbatim.
  Logo/icon MiniMe used as-is.
- Navigation: agent list + Detail panel ONLY in the Home window;
  other windows use full width (`.no-nav` toggled by showView).
- Postiz: draft-only by default. The single exception is the batch
  schedule step, explicitly ordered by Patria 28 Okt 2026
  ("jadwalkan otomatis ke postiz dengan persetujuan user"):
  per-card upload + schedule with double-confirm approval.
  SUPERSEDED 29 Okt 2026 17:01 by Patria's order: native scheduling
  + autopost replaces Postiz entirely (v61-v64); Postiz removed
  from the app in v63. The native Planner keeps the same rule:
  single posts draft-only, autopost only in scheduled-batch mode
  with Patria's approval at the start of the batch.
- Costs: report in Rupiah whenever possible; null when no rate
  (never guessed). Hard limit $5: NOT enforced by the app —
  correction (audit v66): the app records live usage and WARNS past
  $5; hard enforcement lives only in the Node runners' ledger.
  The $5 limit is a self-imposed display limit, not a block, because
  the active Meta credit is $150.
- Compact but powerful: no unused dependencies, no duplicate
  artifacts, no dead code shipped.
