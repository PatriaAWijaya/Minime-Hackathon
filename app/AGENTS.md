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
   or any gate on his behalf. Code enforces gates (GateError),
   never invents approvals.
4. Every change lands in `docs/fase-0-log.md` (master log) and the
   relevant PLAN/README/status notes, then is pushed with its SHA
   pair recorded (local ↔ remote, trees identical).
5. Builds run on Patria's MacBook (this VM has no Rust and no macOS
   toolchain). Debug builds first (`tauri build --debug`); a `.dmg`
   only when Patria asks for distribution.

## Where things live
- `app/src-tauri/` — Tauri shell (Rust + config + capabilities).
- `prototype-v5/` — current UI source; `prototype-v5/build/` holds
  the single-file build that Tahap A serves as the frontend
  (frontendDist points there; no duplicate copy).
- `src/` (repo root) — NestJS backend + fase runners.
- `docs/` — canon docs, gate records, engine list, master log.

## Standing decisions the build must respect
- Theme: monochrome + pastel pink accent `#FFD1DC` (dark `#262626`
  text on accent surfaces). Logo/icon MiniMe used as-is.
- Navigation: agent list + Detail panel ONLY in the Home window;
  other windows use full width (`.no-nav` toggled by showView).
- Postiz: draft-only. No publish/schedule path exists by
  construction; adding one needs Patria's explicit order.
- Costs: report in Rupiah whenever possible; null when no rate
  (never guessed). Hard limit $5 enforced by the ledger.
- Compact but powerful: no unused dependencies, no duplicate
  artifacts, no dead code shipped.
