# Build plan — Minime-Hackathon

Scope rule (from the hackathon's "new work only" rule for the Indie track):
only work in this repo, built 27 Oct – 4 Nov 2026, is presented. Nothing is
copied from the main Minime repository.

## Model router (27 Oct 2026, Addendum Kanon Router)

- Primary: Muse via the Meta Model API, for every agent.
- Fallback 1: Gemini via the Google API (not via Ollama).
- Fallback 2 (local): DeepSeek via Ollama (127.0.0.1:11434).
- QC: different model family from the maker (Muse → Gemini; Gemini down →
  DeepSeek local). Pass: score ≥ 75, zero hard violations, max 2 revisions.
- Costs based on Maverick/Flash/Sonnet are suspended until the Phase 0
  gate re-baselines them from actual prices and CostLedger measurements.

## Phases — 27 Oct to 2 Nov 2026 (build plan; pace updated 27 Oct: 2 phases/day attempted)

- **Phase 0 — Foundation, Tue 27 Oct: EXECUTED, gate NOT fully passed.**
  Repo contracts (JSON v1), model router, append-only CostLedger +
  hard limit, service-level policy engine for gates GS/GSTP/GKonten,
  DB-backed queue + SSE progress, one sample job end-to-end with
  CostRecord and trace ID, zero credentials in repo — all built and
  mock-tested (see `docs/fase-0-log.md` and `docs/fase-0-gate-results.md`).
  Gate NOT passed: live verification of all three router paths on one
  test brand and cost re-baselining are pending Patria-only
  prerequisites (Meta credit claim + card + spend limit, Gemini key,
  Ollama + DeepSeek on Patria's MacBook). No live metric is claimed
  until those tests pass.
- **Phase 1 — Decisions, Tue 27 Oct (draft) / gate after live tests:**
  Intake → Research → Business Strategy → STP, stopping at GS/GSTP
  gates. No production before GSTP approval; exactly one Approved STP
  active per product. Draft preparation may proceed; gates are NOT
  approved on Patria's behalf.
- **Phase 2 — Image production, Wed 28 Oct (morning, 2/day pace):**
  7-day calendar from the approved STP, CreativeBrief JSON per item,
  text-free image generation, deterministic template overlay (so
  typography is correct), QC, then GKonten per item (Approve /
  text-only edit via cheap recompose / Regenerate / Reject with reason).
- **Phase 3 — Carousel + Postiz draft, Wed 28 Oct (afternoon):**
  Carousel as an Image derivative (hook → body → CTA, per-slide
  review), approved items enter Postiz as DRAFT only (never live
  publish in this demo), status read back per channel, cost dashboard
  from CostLedger. Negative gate tests must pass. If Image is unstable,
  Carousel is cut first.
- **Phase 4 — Loop proof, Thu 29 Oct (morning):** public Form → CRM
  Leads (capture, dedupe, scoring 1–5) → draft Outreach batch with
  GTemplate/GBatch. NO live sending. WhatsApp stays Phase A (Email +
  manual click-to-chat only); Instagram DM is manual draft only.
- **Phase 5 — Eval harness + dress rehearsal, Thu 29 Oct (afternoon):**
  live harness on the golden set — routing quality, task success,
  latency, cost per task, QC score per model — plus a full end-to-end
  rehearsal. Targets are measured, not claimed.
- **Phase 6 — Freeze + submission-ready, Fri 30 Oct (2/day pace):**
  code freeze, demo README + demo script, build log per phase, cut
  list, final push only after a deep zero-error check. 31 Oct – 2 Nov
  become buffer (fixes, second rehearsal, demo video). No submission
  on 30 Oct.

## Buffer — 3–4 Nov 2026

- 31 Oct – 2 Nov: buffer — fixes, second rehearsal, demo video
  preparation (only work actually built in this repo).
- Tue 3 Nov: record the 3-minute demo video final, showing ONLY work built
  in this repo during the event.
- Wed 4 Nov: final submission before 4 Nov 2026, 9:00 PM ET
  (5 Nov 2026, 09:00 WIB). The submission form has no draft save — only a
  final Submit button — so every field must be complete before clicking.

## Cut list (in order, if time runs short)

1. Video (Reels/Talking Head) — already cut.
2. Live Outreach sending — draft + gates only.
3. Carousel — cut if Image is unstable.
4. Full CRM / automatic Follow Up — capture + scoring + pipeline only.
5. Live Postiz publishing — draft only.
6. Full Finance dashboard and Insight Pack — CostLedger summary only.

## Stack (confirmed at Phase 0, 27 Oct 2026)

TypeScript, NestJS on the Fastify adapter, SQLite (Node `node:sqlite`)
for the job queue, JSONL CostLedger. No Express, no LangGraph in V1.
A thin dashboard/UI, if built, is a later phase and is not claimed
before it exists.
