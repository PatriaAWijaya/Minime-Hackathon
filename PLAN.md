# Build plan — Minime-Hackathon

Scope rule (from the hackathon's "new work only" rule for the Indie track):
only work in this repo, built 27 Oct – 4 Nov 2026, is presented. Nothing is
copied from the main Minime repository.

## Model router (27 Oct 2026, Addendum Kanon Router)

- Primary: Muse via the Meta Model API, for every agent.
- Fallback 1: Gemini via the Google API (`gemini-3.1-flash-lite`, not via
  Ollama; key sent as `?key=` query parameter).
- Fallback 2 (local): DeepSeek via Ollama (`deepseek-r1:1.5b`,
  127.0.0.1:11434; the 7b variant fails GPU inference on the 8 GB M1).
- Fallback 3 (local): Qwen via Ollama (`qwen2.5:3b`), only if the
  DeepSeek local model fails.
- QC: different model family from the maker (Muse → Gemini; Gemini →
  Meta; DeepSeek/Qwen → Gemini). Pass: score ≥ 75, zero hard
  violations, max 2 revisions.
- Costs based on Maverick/Flash/Sonnet are suspended until the Phase 0
  gate re-baselines them from actual prices and CostLedger measurements.

## Phases — 27 Oct to 2 Nov 2026 (build plan; pace updated 27 Oct: 2 phases/day attempted)

- **Phase 0 — Foundation, Tue 27 Oct: EXECUTED, gate CONDITIONALLY PASSED 27 Oct 15:04 WIB (Patria).**
  Repo contracts (JSON v1), model router, append-only CostLedger +
  hard limit, service-level policy engine for gates GS/GSTP/GKonten,
  DB-backed queue + SSE progress, one sample job end-to-end with
  CostRecord and trace ID, zero credentials in repo — all built and
  mock-tested (see `docs/fase-0-log.md` and `docs/fase-0-gate-results.md`).
  Gate CONDITIONALLY PASSED by Patria 27 Oct 2026 15:04 WIB (record
  docs/fase-0-gate-conditional-approval.json): the two remaining
  conditions are live Muse verification and full cost re-baselining
  (both pending, see below). Since the morning
  report, the Ollama leg is proven live (DeepSeek 1.5b GPU 4.2 s,
  Qwen 3b 2.5 s) and the Gemini leg is proven live through the router
  code (with intermittent provider HTTP 503 "high demand" in the same
  session). Still pending: live Muse (Meta credit claim + card +
  spend limit, Patria-only) and full cost re-baselining. No live Muse
  metric is claimed until those tests pass.
- **Phase 1 — Decisions, Tue 27 Oct (EXECUTED live; GSTP APPROVED 27 Oct 12:04 WIB):**
  Intake → Research → Business Strategy → STP, stopping at GS/GSTP
  gates. No production before GSTP approval; exactly one Approved STP
  active per product. Executed 27 Oct siang via Gemini (v1: 1.551 tokens), then deepened
  to v2 the same afternoon (4.660 tokens, 4 live Gemini calls:
  Research + BehaviourResearch + Strategy + STP) with digital
  behaviour, on-screen duration, media exposure, content types,
  transaction methods, touch points, pain points + solutions, and
  monthly + digital-payment spending. STP status draft, approvals
  empty, production blocked — output in docs/fase-1-output.json. Gates are NOT approved on Patria's behalf;
  GSTP APPROVED by Patria 27 Oct 2026 12:04 WIB (record:
  docs/fase-1-gstp-approval.json) — Fase 2 is now unblocked by the
  gate. GS (Strategy) was not separately recorded as approved.
- **Phase 2 — Calendar + CreativeBriefs, Tue 27 Oct siang: EXECUTED live, GKonten APPROVED ~13:06 WIB.**
  7-day calendar from the approved STP + 7 CreativeBriefs (live Gemini,
  3.604 tokens), QC rule score 100/100 for all 7 items (a structural
  score — it does not validate image semantics; two production notes
  were accepted in the approval record: item-03's visual prompt depicts
  a QR code, which in production must be a real deterministic overlay,
  and item-01 carries a video/transition nuance but is a static-image
  brief). Images left null with imageStatus pending-provider (provider
  = Muse Image provisional, price pending Meta activation). Output
  docs/fase-2-output.json; approval docs/fase-2-gkonten-approval.json.
  The draft file was not edited (approvals are append-only).
- **Phase UI — Application UI draft, added Tue 27 Oct AFTER GKonten (NEW PHASE, Patria's order):**
  Draft-first UI for user interaction (docs/ui-draft.md): 7 screens
  (Projects → Intake → Research & Strategy → STP/GSTP → 7-day
  Calendar → Brief & QC/GKonten → Distribution Draft & Cost/Trace),
  one primary action per section, human gates surfaced as
  Approve/Revise/Reject, costs in IDR first, no autopublish. Final
  app must be installable on BOTH macOS (.dmg) and Windows (.msi)
  from one codebase; proposed stack Tauri 2 + Svelte 5 (PROVISIONAL,
  Patria decides; Electron is the recorded alternative). Built from
  scratch in this repo (Indie new-work rule — no old-project code).
  Gate for this phase: Patria's approval of the UI design itself.
  REVISED 27 Oct siang (Patria: revisi arah): v1 (7 sequential
  screens) is SUPERSEDED by v2 — Personal Assistant with Prime
  Agent, agents + harness skills, Kanban mode, N8N-like agent
  connection canvas (user-addable edges), and Media Studio mode
  (Image / Carousel / Reels / Talking Head, ready-to-post status).
  Design: docs/ui-draft-v2.md. Clickable prototype v2:
  prototype-v2/index.html (dummy TEST data, simulated decisions).
  MAIN LAYOUT v3 (27 Oct siang, Patria: 'mulai dari UI utama'):
  4-column main window — icon-only sidebar (Home, Search, Kanban,
  Graph, Library, Media Studio, Planner, Settings at bottom; names
  on hover) + Agent column grouped per project (Prime always
  active; others auto-activated by Prime or added/deactivated by
  user; same agent may appear in several projects at once) +
  group-chat window (User + Prime + sub-agents, all results
  curated by Prime) + Detail panel (customize agent condition +
  skills); resizable column widths + independent scrollbars.
  Spec: docs/ui-main-layout.md. Clickable prototype v3:
  prototype-v3/index.html (dummy, simulated). v3 was superseded by v4,
  then v5 (below); revisions are deferred under the 27 Oct 15:02 UI stop.
  INTERACTIVE v4 (27 Oct siang, Patria: 'lanjut buat prototipe, kita
  akan revisi dari situ'): prototype-v4/index.html — v3 layout with
  working in-browser interactions (project switch, Kanban drag, graph
  drag + add edge, media filters, carousel slides, talking-head script
  edit, timeline playhead, library actions).
  PROTOTYPE v5 (27 Oct sore, attachment-driven):
  prototype-v5/index.html — Muse-style dark UI with 6 rail icons
  processed from attachments (white line-art, 128px data URIs; Media
  Studio & Settings SVG fallbacks), Kanban styled like the attachment,
  n8n-style graph canvas, WhatsApp-style composer then replaced by an
  attachment-style single pill, attachment-style agent list (Local top
  bar, + icon only), attachment-style main UI (centered 'Today 2:31
  PM' header, dark bubbles without avatars, attachment-style Detail
  panel: Name/Title/Instructions/Brain/Knows/Does), monochrome theme
  with single violet accent #B214FF. A verification audit found and
  fixed one stale reference (emojiPanel in waToggleAttach). UI STOP
  27 Oct 15:02 WIB (Patria: 'sementara UI kita cukupkan, UI akan kita
  sempurnakan nanti') — no further UI work until Patria orders
  refinement; the UI design gate itself is therefore still formally
  unapproved, with revisions deferred.
  v1 doc is kept as history only.
  Phase 3 is PAUSED until Patria orders it to resume after the UI
  draft decision.
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
Clickable UI prototypes v1–v5 exist (dummy/simulated,
prototype-v5/index.html current); the real installable app is NOT
built yet — that is post-design-approval work.
