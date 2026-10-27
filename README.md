# Minime-Hackathon

Demo app built **from scratch** for the **Meta Global AI Developer Hackathon 2026**
(Indie Developer track, theme: Build for Your World).

## What it is

A Meta-native agent orchestrator demo: a short brief goes in, Muse models
(via the Meta Model API) route the work across a small team of AI agents,
nothing consequential happens without a human approval gate, and a live
evaluation harness reports routing quality, task success, latency, and cost
per completed task.

Demo scope (27 Oct – 2 Nov 2026 build plan): a vertical slice of the
Aplikasi Konten MVP — one product becomes one week of scheduled draft
content through Intake → Research → Business Strategy → STP → Image →
Postiz draft, plus an internal loop proof (public Form → CRM Leads →
draft Outreach batch, with no live sending). No video, no live outreach
sending, no live publishing, and no customer mini-app in this demo window.

## Model router (27 Oct 2026)

Canon: Addendum Kanon Router (27 Oct 2026), which replaces the router
sections of the Aplikasi Konten specification documents.

- **Primary: Muse via the Meta Model API** — first route for every agent
  (Orchestrator, Research, Strategy, STP, Creative, Distribution, Leads &
  CRM, Outreach, Finance).
- **Fallback 1: Gemini via the Google API** — used when Muse is unavailable.
  Gemini is not a local model and is not run via Ollama.
- **Fallback 2 (local): DeepSeek via Ollama** — an open-weight DeepSeek
  model running locally on the user's machine via Ollama
  (127.0.0.1:11434). This is the only local agent in the chain. Marginal
  cost is near zero; quality is below the cloud models, and that is
  reported honestly, never claimed as equal.
- **QC rule (unchanged):** QC must use a different model family from the
  maker. Maker Muse → QC Gemini; if Gemini is down → QC DeepSeek local.
  Pass threshold: score ≥ 75 and zero hard violations, max 2 revision
  rounds, then escalation to a human.
- **Costs:** earlier cost figures based on Maverick/Flash/Sonnet are
  suspended as official figures until the Phase 0 gate re-baselines them
  from actual Muse/Gemini prices and CostLedger measurements. Until then,
  only costs actually measured in CostLedger may be reported.
- **No credentials in this repo.** Keys live in environment/vault only.

## Provenance (why judges can trust this is new work)

- This repository was created on **27 Oct 2026**, inside the hackathon
  building period (**27 Oct – 4 Nov 2026**).
- Every commit in this repository was made during that period.
- No code was copied from the main Minime repository. The main Minime repo
  (PatriaAWijaya/minime) is **not** part of this submission; only the work in
  this repo is presented.
- Built by Mimi, Patria A. Wijaya's AI agent, during the event.

## Status (27 Oct 2026 — Phase 0 executed, gate not fully passed)

Phase 0 foundation is built and mock-tested in this repo (contracts JSON
v1, model router, append-only CostLedger + hard limit, service-level
policy engine for GS/GSTP/GKonten, DB-backed queue + SSE, one sample job
end-to-end with CostRecord and trace ID; `tsc` 0 errors, gate-test 8/8
PASS on labelled mocks, credential scan passed). The Phase 0 gate is
NOT fully passed: live tests of the three router paths and cost
re-baselining are pending Patria-only prerequisites (Meta Model API
$150 credit claim + linked card + spend limit, Gemini key via
environment, Ollama + DeepSeek on Patria's MacBook). Until those live
tests pass, no live latency, cost, or QC score is claimed, and Phase 1
is draft preparation only — no gate is approved on Patria's behalf.
Build phases are tracked in PLAN.md. Demo video (3 minutes) and
submission follow before the deadline: **4 Nov 2026, 9:00 PM ET**.

## Submission

- Track: Indie Developer
- Theme: Build for Your World
- Repository: https://github.com/PatriaAWijaya/Minime-Hackathon (public)
