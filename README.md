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
- **Fallback 1: Gemini via the Google API** (`gemini-3.1-flash-lite`) —
  used when Muse is unavailable. Gemini is not a local model and is not
  run via Ollama. Its key is sent as a `?key=` query parameter (the
  placement the Secure Vault surrogate mechanism supports; header
  placement was tried and is not compatible with it).
- **Fallback 2 (local): DeepSeek via Ollama** (`deepseek-r1:1.5b`) — an
  open-weight DeepSeek model running locally on the user's machine via
  Ollama (127.0.0.1:11434). Marginal cost is near zero; quality is
  below the cloud models, and that is reported honestly, never claimed
  as equal. The larger `deepseek-r1:7b` is installed on the same
  machine but fails GPU inference there (Metal out-of-memory on an
  8 GB M1), so it is NOT the default.
- **Fallback 3 (local): Qwen via Ollama** (`qwen2.5:3b`) — tried only if
  the DeepSeek local model fails. Also local and free.
- **QC rule (unchanged):** QC must use a different model family from the
  maker. Maker Muse → QC Gemini; maker Gemini → QC Meta; maker DeepSeek
  or Qwen → QC Gemini. Pass threshold: score ≥ 75 and zero hard
  violations, max 2 revision rounds, then escalation to a human.
  (In the Phase 0 sample, QC is deterministic scoring with those
  families, not yet a live LLM QC call — that is Phase 5 harness work.)
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
NOT fully passed, but its legs are no longer all pending: the Ollama
leg is proven live on Patria's MacBook (DeepSeek 1.5b GPU in 4.2 s,
Qwen 3b in 2.5 s), and the Gemini leg is proven live through the router
code (gemini-3.1-flash-lite, measured tokens; note: the provider
returned intermittent HTTP 503 "high demand" during the same session,
so Gemini reliability at peak times is a known provider condition and
the chain correctly falls through to local Ollama when it happens).
What is still pending: live Muse (Meta $150 credit claim + linked card
+ spend limit, Patria-only) and full cost re-baselining from actual
prices. Until those pass, no live Muse latency, cost, or QC score is
claimed, and Phase 1's GSTP was approved by Patria himself on
27 Oct 2026 12:04 WIB (record docs/fase-1-gstp-approval.json) — no
gate was ever approved on Patria's behalf. Build phases are tracked in PLAN.md. Demo video
(3 minutes) and submission follow before the deadline:
**4 Nov 2026, 9:00 PM ET**.

## Submission

- Track: Indie Developer
- Theme: Build for Your World
- Repository: https://github.com/PatriaAWijaya/Minime-Hackathon (public)
