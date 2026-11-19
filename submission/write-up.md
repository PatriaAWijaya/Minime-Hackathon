# Write-up Siap Tempel — Minime-Hackathon (EN)

Semua teks di bawah dalam bahasa Inggris, siap tempel ke formulir
Cerebral Valley. Diperbarui ke realitas 4 Nov 2026 (Fase 0–5 + app live v246).

## One-line pitch

Minime is a local-first desktop app that gives a solo founder five
persistent AI teammates — research, strategy, creative, finance, and
code — with a human approving every consequential step.

## Problem statement

In Indonesia, important work often begins with a short message. Solo
founders and small teams do not lack AI text generation — they lack a
way to turn an incomplete brief into coordinated, accountable teamwork.
Briefs get lost in chat, no one owns the next step, and publishing
happens without approval. Minime fixes the loop, not just the output:
one brief becomes owned tasks, artifacts pass between specialist
agents, quality is checked by a different model family, and nothing
publishes without human approval.

## Project description

Minime-Hackathon is a desktop app (Tauri 2 + Svelte 5) built from scratch
during the event window, 27 Oct–4 Nov 2026. A user types one brief; the
coordinator (Mimi) splits it into tasks for five specialist agents —
Research, Strategy, Creative, Finance, and Code Builder — shown on a
Kanban board and a live agent graph. Agents work persistently in the
background; their artifacts (research, STP strategy, creative briefs,
carousels, video plans) accumulate in a Library and flow into a native
Planner. Publishing is draft-only by default: a single post never
auto-publishes, scheduled batches publish only after batch approval,
and due drafts carry an H-3 reminder with per-item confirmation.
A Media Studio adds voice (TTS + cloning) and visuals to approved work.
All state is local-first; every agent's reasoning runs through the
model router described below.

Proven in-event results: Fase 1 research + strategy + STP approved;
Fase 2 seven-day calendar + 7 briefs; Fase 3 seven carousels x 3 slides
with QC 100/100 and 7 drafts (draft-only, never published); Fase 4
lead pipeline (12 raw leads deduped to 10, 2 merges, 6 drafts unsent);
Fase 5 live evaluation harness (golden set, 8 cases): final run 7/8,
the only failure a Gemini 503 on the carousel case, which succeeded in
run 1 — so all 8 case types proved successful across the two runs;
cross-family LLM QC averaged 89 across 5 scored cases; Meta maker 5/5
at 11,798 ms average; ledger $0.0427 of the $5 limit, reconciled,
0 mock; end-to-end rehearsal live with QC 100 and draftPublished false.
Library-to-Planner flow live in v246 (drafts save without a hosting key;
public-URL conversion only at publish time).
Live performance work: SSE streaming, parallel fan-out, model-pin
respect, circuit breaker, append-only chat rendering.

## Meta product usage description

Every agent in Minime reasons through Meta's Muse Spark 1.3 via the Meta
Model API, which serves as the CEO/coordinator model and the first hop
of the router for all agents. When Muse is unavailable, the router falls
back in order to Gemini, then Anthropic Claude, then local Ollama models
— with a circuit breaker that skips a provider after two failures.
Quality control is cross-family by design: the QC agent that checks an
output always runs on a different model family than the one that made
it. The $150 Meta Model API credit funded the live evaluation runs
(Fase 5 harness: routing quality, task success, latency, cost per task).

## Why Meta's models matter

The whole product is a coordination problem, not a generation problem.
Five specialist agents plus a QC gate need one strong, fast coordinator
that can split briefs, judge handoffs, and keep the loop accountable —
that is the job Muse Spark does here. Without a capable central model,
the multi-agent loop collapses into disconnected chats. Meta's models
make the "one person supervising five teammates" pattern real on a
local-first desktop app, with cloud-grade reasoning and a fallback chain
that keeps the app working when any single provider fails.

## Pagar klaim (JANGAN ditulis di formulir)

- Jangan klaim traction, pengguna berbayar, atau penghematan terukur.
- Jangan klaim pemakaian SAM 3.1 (tidak dipakai app ini).
- Jangan klaim fitur Minime pra-event (repo Minime utama bukan submission).
