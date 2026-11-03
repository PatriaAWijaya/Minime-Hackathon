/**
 * Fase 5 — Eval harness (live, golden set) + dress rehearsal.
 *
 * Measures, never claims. Every metric below comes from a real call
 * recorded in this run (or is explicitly marked unavailable):
 *   - routing quality: expected maker vs provider actually served + fallbackFrom
 *   - task success: maker call succeeded AND structural checks passed
 *   - latency: milliseconds around each call, maker and QC separately
 *   - cost per task: tokens + USD from the provider response, via CostLedger
 *   - QC score per model: deterministic scoreQc (structural) AND a live
 *     cross-family LLM judgement, recorded separately (never mixed).
 *
 * Standing rules honoured here:
 *   - DRAFT ONLY. No publishing, no outreach sending, no live trading.
 *     The rehearsal asserts draft.published === false and throws otherwise.
 *   - Mock is a control, never a live result. In live mode any mock
 *     record in the ledger is reported as contamination (must be 0).
 *   - M1 (hard limit): the ledger already refuses an append whose
 *     projected total exceeds the limit (CostLimitError). This harness
 *     adds the missing half — a PRE-CALL guard (assertBudget) that
 *     refuses to make the next call once the total reaches the limit,
 *     so money is never spent first and refused after. Both halves are
 *     proven by the tiny-limit proof run (zero API spend).
 *   - M14 (usage recording): Fase 1-3 totals could not be reproduced
 *     from artifacts because runners dropped per-call usage. This
 *     harness writes EVERY call (maker + QC + rehearsal steps) into
 *     the output JSON and the same ledger file, then reconciles:
 *     ledger total == sum of recorded call costs.
 *   - A case that fails does not abort the run: the failure is the
 *     data (e.g. Ollama visibly unavailable in this VM, Anthropic
 *     reachable only via the desktop app's Tauri invoke). Cases with
 *     expectedUnavailable=true succeed exactly when they fail visibly
 *     with the expected reason — that is the correct behaviour, and
 *     claiming otherwise would be a fake measurement.
 *   - Transient provider errors (503/429-class: HTTP 503/429, high
 *     demand, overloaded, rate limit) are retried ONCE after 60s, per
 *     the Gemini connector's own retry rule. Both attempts are
 *     recorded in the output's `retries` array; a second failure
 *     stands as the result. Non-transient errors are never retried
 *     (the generic word "unavailable" is NOT a trigger — it also
 *     covers providers that are simply down, e.g. Ollama in this VM).
 *   - Exit contract: the runner exits 0 when the harness completed all
 *     cases + rehearsal (results recorded, including failures), and
 *     non-zero only when the harness itself crashed (missing golden
 *     file, ledger unwritable). Per-case success lives in the output.
 */
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import { CostLedger, CostLimitError } from './ledger';
import { scoreQc } from './qc';
import {
  LiveUnavailableError,
  ModelRouter,
  routerConfigFromEnv,
  type CallResult,
  type ProviderId,
} from './router';
import { runSample } from './pipeline';

export type MakerId = 'meta' | 'gemini' | 'ollama' | 'anthropic' | 'chain' | 'mock';

export interface GoldenCase {
  id: string;
  task: string;
  prompt: string;
  maker: MakerId;
  qcProvider: 'meta' | 'gemini';
  minLength: number;
  visualQc: boolean;
  /** When set, the case succeeds exactly by failing visibly for this reason. */
  expectedUnavailable?: string;
}

export interface CaseResult {
  id: string;
  task: string;
  makerExpected: MakerId;
  makerOk: boolean;
  makerError: string | null;
  provider: ProviderId | null;
  family: string | null;
  model: string | null;
  fallbackFrom: string | null;
  latencyMs: number | null;
  promptTokens: number | null;
  completionTokens: number | null;
  costUsd: number | null;
  outputLength: number;
  outputPreview: string;
  checksMinLength: boolean;
  qcDeterministic: { score: number; hardViolations: string[]; passes: boolean } | null;
  qcLlm: {
    score: number | null;
    reason: string | null;
    provider: string | null;
    latencyMs: number | null;
    promptTokens: number | null;
    completionTokens: number | null;
    costUsd: number | null;
    error: string | null;
  };
  success: boolean;
}

/** M1 pre-call guard: refuse BEFORE spending once the total hits the limit. */
export function assertBudget(ledger: CostLedger, limit: number): void {
  const total = ledger.totalUsd();
  if (limit > 0 && total >= limit) {
    throw new CostLimitError(limit, total);
  }
}

function geminiViaScript(script: string, prompt: string): CallResult {
  const started = Date.now();
  let stdout: string;
  try {
    stdout = execFileSync(
      'python3',
      [script, '--model', 'gemini-3.1-flash-lite', '--json'],
      { input: prompt, encoding: 'utf8', timeout: 180000, maxBuffer: 10 * 1024 * 1024 },
    ) as string;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new LiveUnavailableError('gemini', `generate.py failed: ${msg.slice(0, 300)}`);
  }
  let data: unknown = null;
  try {
    data = JSON.parse(stdout);
  } catch {
    const a = stdout.indexOf('{');
    const b = stdout.lastIndexOf('}');
    if (a >= 0 && b > a) {
      try { data = JSON.parse(stdout.slice(a, b + 1)); } catch { /* fall through */ }
    }
  }
  if (!data || typeof data !== 'object') {
    throw new LiveUnavailableError('gemini', 'generate.py output did not parse as JSON');
  }
  const o = data as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    promptFeedback?: { blockReason?: string };
  };
  if (o.promptFeedback?.blockReason) {
    throw new LiveUnavailableError('gemini', `blocked: ${o.promptFeedback.blockReason}`);
  }
  const text = o.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  // Gemini free tier = $0 by Patria's 28 Oct 2026 decision (audit v66 $-B1),
  // NOT because the tariff is zero. Tokens are still recorded.
  return {
    text,
    provider: 'gemini',
    family: 'gemini',
    model: 'gemini-3.1-flash-lite',
    latencyMs: Date.now() - started,
    mock: false,
    fallbackFrom: null,
    promptTokens: o.usageMetadata?.promptTokenCount ?? null,
    completionTokens: o.usageMetadata?.candidatesTokenCount ?? null,
    costUsd: 0,
  };
}

async function callMaker(
  router: ModelRouter,
  geminiScript: string,
  maker: MakerId,
  prompt: string,
  agent: string,
  allowMock = false,
): Promise<CallResult> {
  switch (maker) {
    case 'meta':
      return router.callMeta(prompt, agent);
    case 'gemini':
      return geminiViaScript(geminiScript, prompt);
    case 'ollama':
      return router.callOllama(prompt);
    case 'anthropic':
      throw new LiveUnavailableError(
        'anthropic',
        'Tauri invoke tidak tersedia (Anthropic hanya lewat app desktop)',
      );
    case 'chain':
      return router.callWithFallback(prompt, agent, allowMock);
    case 'mock':
      return router.callMock(prompt, agent);
  }
}

function qcFamilyFor(actualFamily: string): 'meta' | 'gemini' {
  return actualFamily === 'gemini' ? 'meta' : 'gemini';
}

function parseVisualLines(text: string): { visualPrompt: string; textOverlay: string } {
  const vp = text.match(/^VISUAL PROMPT:\s*(.+)$/im);
  const to = text.match(/^TEXT OVERLAY:\s*(.+)$/im);
  return { visualPrompt: (vp?.[1] ?? '').trim(), textOverlay: (to?.[1] ?? '').trim() };
}

function parseLlmScore(text: string): { score: number | null; reason: string | null } {
  const m = text.match(/SKOR:\s*(\d{1,3})/i);
  const r = text.match(/ALASAN:\s*(.+)$/im);
  const score = m ? Number(m[1]) : null;
  return {
    score: score !== null && score >= 0 && score <= 100 ? score : null,
    reason: (r?.[1] ?? '').trim().slice(0, 200) || null,
  };
}

/** One documented retry for transient provider errors; see header. */
async function withTransientRetry<T>(
  fn: () => Promise<T>,
  onTransient: (errMsg: string) => void,
): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // NOTE (koreksi pasca-run 2): kata "unavailable" SENGAJA tidak dipakai
    // sebagai pemicu retry — LiveUnavailableError adalah kelas error umum
    // semua provider (termasuk Ollama yang memang down), sehingga run 2
    // sempat me-retry probe Ollama 60 detik tanpa guna (hasil tetap sama,
    // hanya runtime +60 detik). Pemicu retry hanya sinyal transien 503/429.
    if (/503|429|high demand|overloaded|rate limit/i.test(msg)) {
      onTransient(msg);
      await new Promise((r) => setTimeout(r, 60000));
      return await fn();
    }
    throw e;
  }
}

function readLedgerRecords(file: string): Array<Record<string, unknown>> {
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter((l) => l.trim().length > 0)
    .map((l) => {
      try { return JSON.parse(l) as Record<string, unknown>; } catch { return {}; }
    });
}

export interface Fase5Options {
  cases: GoldenCase[];
  allowMock: boolean;
  dataDir: string;
  hardLimitUsd: number;
  geminiScript: string;
}

export async function runFase5(opts: Fase5Options): Promise<Record<string, unknown>> {
  const traceId = `fase5-${Date.now()}`;
  const startedAt = new Date().toISOString();
  const router = new ModelRouter(routerConfigFromEnv(process.env));
  const ledgerFile = `${opts.dataDir}/cost-ledger.jsonl`;
  const ledger = new CostLedger(ledgerFile, opts.hardLimitUsd);

  // M1 proof (zero API spend): append-time refusal + pre-call guard refusal.
  // Proof files are run scratch, not evidence (the booleans land in the
  // output JSON): remove them first so reusing a dataDir re-proves from
  // zero instead of tripping on the previous run's guard record.
  for (const f of [`${opts.dataDir}/limit-proof.jsonl`, `${opts.dataDir}/limit-proof-guard.jsonl`]) {
    try { fs.rmSync(f, { force: true }); } catch { /* scratch cleanup is best-effort */ }
  }
  const proofLedger = new CostLedger(`${opts.dataDir}/limit-proof.jsonl`, 0.000001);
  let appendRefused = false;
  try {
    proofLedger.append({
      traceId: `${traceId}-proof`, timestamp: new Date().toISOString(), agent: 'proof',
      provider: 'mock', family: 'mock', model: 'mock',
      promptTokens: null, completionTokens: null, costUsd: 0.01, costIdr: null,
      mock: true, fallbackFrom: null,
    });
  } catch (e) {
    appendRefused = e instanceof CostLimitError;
  }
  const guardLedger = new CostLedger(`${opts.dataDir}/limit-proof-guard.jsonl`, 0.000001);
  guardLedger.append({
    traceId: `${traceId}-proof-guard`, timestamp: new Date().toISOString(), agent: 'proof',
    provider: 'mock', family: 'mock', model: 'mock',
    promptTokens: null, completionTokens: null, costUsd: 0.000001, costIdr: null,
    mock: true, fallbackFrom: null,
  });
  let guardRefused = false;
  try {
    assertBudget(guardLedger, 0.000001);
  } catch (e) {
    guardRefused = e instanceof CostLimitError;
  }

  const results: CaseResult[] = [];
  const retries: Array<{ caseId: string; phase: string; attempt: number; error: string }> = [];
  for (const c of opts.cases) {
    const agent = `fase5-${c.id}`;
    let maker: CallResult | null = null;
    let makerError: string | null = null;
    // Mock mode proves structure, not content: all makers become the
    // labelled mock provider, EXCEPT expectedUnavailable cases, which
    // keep their real caller so the visible failure is still proven.
    const effectiveMaker: MakerId =
      opts.allowMock && !c.expectedUnavailable ? 'mock' : c.maker;
    try {
      assertBudget(ledger, opts.hardLimitUsd);
      maker = await withTransientRetry(
        () => callMaker(router, opts.geminiScript, effectiveMaker, c.prompt, agent, opts.allowMock),
        (msg) => retries.push({ caseId: c.id, phase: 'maker', attempt: 1, error: msg.slice(0, 300) }),
      );
      ledger.append(router.toCostRecord(maker, traceId, agent));
    } catch (e) {
      makerError = e instanceof Error ? e.message : String(e);
    }

    const expectedFail =
      !!c.expectedUnavailable &&
      makerError !== null &&
      (makerError.includes('LiveUnavailableError') ||
        makerError.includes('unavailable') ||
        makerError.includes('Tauri') ||
        makerError.includes('ECONNREFUSED') ||
        makerError.includes('127.0.0.1'));

    let qcDeterministic: CaseResult['qcDeterministic'] = null;
    // Mock mode skips deterministic QC: mock text never follows the
    // VISUAL PROMPT / TEXT OVERLAY format, so scoring it would only
    // prove that the mock is not a real model (already known).
    if (maker && c.visualQc && !opts.allowMock) {
      const { visualPrompt, textOverlay } = parseVisualLines(maker.text);
      const qc = scoreQc({
        productId: c.id,
        visualPrompt,
        textOverlay,
        makerFamily: maker.family,
        qcFamily: qcFamilyFor(maker.family),
        modelRenderedText: false,
      });
      qcDeterministic = { score: qc.score, hardViolations: qc.hardViolations, passes: qc.passes };
    }

    let qcLlm: CaseResult['qcLlm'] = { score: null, reason: null, provider: null, latencyMs: null, promptTokens: null, completionTokens: null, costUsd: null, error: null };
    if (maker && !opts.allowMock) {
      const qcProvider = qcFamilyFor(maker.family);
      const qcPrompt =
        `Nilai output berikut untuk tugas "${c.task}" dengan kriteria: relevan dengan brief, lengkap, dan siap dipakai sebagai draf. ` +
        `Jawab persis dengan format:\nSKOR: <angka 0-100>\nALASAN: <satu kalimat>\n\nOUTPUT:\n${maker.text.slice(0, 3000)}`;
      try {
        assertBudget(ledger, opts.hardLimitUsd);
        const qr = await withTransientRetry(
          () => callMaker(router, opts.geminiScript, qcProvider, qcPrompt, `${agent}-qc`),
          (msg) => retries.push({ caseId: c.id, phase: 'qc', attempt: 1, error: msg.slice(0, 300) }),
        );
        ledger.append(router.toCostRecord(qr, traceId, `${agent}-qc`));
        const parsed = parseLlmScore(qr.text);
        qcLlm = {
          score: parsed.score,
          reason: parsed.reason,
          provider: qr.provider,
          latencyMs: qr.latencyMs,
          promptTokens: qr.promptTokens,
          completionTokens: qr.completionTokens,
          costUsd: qr.costUsd,
          error: parsed.score === null ? 'LLM QC score tidak ter-parse dari jawaban' : null,
        };
      } catch (e) {
        qcLlm = { score: null, reason: null, provider: null, latencyMs: null, promptTokens: null, completionTokens: null, costUsd: null, error: e instanceof Error ? e.message : String(e) };
      }
    } else if (maker && opts.allowMock) {
      qcLlm = { score: null, reason: null, provider: null, latencyMs: null, promptTokens: null, completionTokens: null, costUsd: null, error: 'mock mode: LLM QC dilewati' };
    }

    // Mock mode checks structure only (non-empty output); the length
    // thresholds apply to live runs, where real models write real text.
    const checksMinLength = maker !== null &&
      (opts.allowMock ? maker.text.length > 0 : maker.text.length >= c.minLength);
    const success = expectedFail
      ? true
      : maker !== null &&
        checksMinLength &&
        (qcDeterministic === null || qcDeterministic.passes);
    results.push({
      id: c.id,
      task: c.task,
      makerExpected: c.maker,
      makerOk: maker !== null,
      makerError,
      provider: maker?.provider ?? null,
      family: maker?.family ?? null,
      model: maker?.model ?? null,
      fallbackFrom: maker?.fallbackFrom ?? null,
      latencyMs: maker?.latencyMs ?? null,
      promptTokens: maker?.promptTokens ?? null,
      completionTokens: maker?.completionTokens ?? null,
      costUsd: maker?.costUsd ?? null,
      outputLength: maker?.text.length ?? 0,
      outputPreview: maker ? maker.text.slice(0, 300) : '',
      checksMinLength,
      qcDeterministic,
      qcLlm,
      success,
    });
  }

  // Dress rehearsal: the full Phase 0 sample chain, live, TEST product only.
  const ledgerLinesBefore = readLedgerRecords(ledgerFile).length;
  let rehearsal: Record<string, unknown> = {};
  try {
    const out = await runSample({
      allowMock: opts.allowMock,
      humanApprover: 'fase-5-rehearsal (TEST product only)',
      dataDir: opts.dataDir,
    });
    const draft = out.draft as { published?: boolean } | undefined;
    if (draft && draft.published !== false) {
      throw new Error('REHEARSAL SAFETY: draft.published bukan false — rehearsal dibatalkan');
    }
    const newRecords = readLedgerRecords(ledgerFile).slice(ledgerLinesBefore);
    rehearsal = {
      ok: true,
      traceId: out.traceId,
      stages: out.stages,
      qc: out.qc,
      draftPublished: draft?.published ?? null,
      mock: out.mock,
      ledgerRecords: newRecords,
    };
  } catch (e) {
    rehearsal = { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  // M14 reconciliation: ledger total must equal the sum of recorded calls.
  const ledgerRecords = readLedgerRecords(ledgerFile);
  const recordedSum = ledgerRecords.reduce(
    (s, r) => s + (typeof r.costUsd === 'number' ? r.costUsd : 0),
    0,
  );
  const ledgerTotal = ledger.totalUsd();
  const mockRecords = ledgerRecords.filter((r) => r.mock === true).length;

  const byProvider: Record<string, { calls: number; ok: number; fallbacks: number; avgLatencyMs: number | null; totalCostUsd: number }> = {};
  for (const r of results) {
    const key = r.provider ?? 'none';
    const b = byProvider[key] ?? { calls: 0, ok: 0, fallbacks: 0, avgLatencyMs: null, totalCostUsd: 0 };
    b.calls += 1;
    if (r.makerOk) b.ok += 1;
    if (r.fallbackFrom) b.fallbacks += 1;
    b.totalCostUsd += r.costUsd ?? 0;
    byProvider[key] = b;
  }
  for (const key of Object.keys(byProvider)) {
    const lat = results
      .filter((r) => (r.provider ?? 'none') === key && r.latencyMs !== null)
      .map((r) => r.latencyMs as number);
    byProvider[key].avgLatencyMs = lat.length > 0
      ? Math.round(lat.reduce((a, b) => a + b, 0) / lat.length)
      : null;
  }
  const llmScores = results
    .map((r) => r.qcLlm.score)
    .filter((s): s is number => s !== null);
  const finishedAt = new Date().toISOString();

  return {
    traceId,
    startedAt,
    finishedAt,
    hardLimitUsd: opts.hardLimitUsd,
    allowMock: opts.allowMock,
    ledgerFile,
    limitProof: { appendRefused, guardRefused },
    retries,
    cases: results,
    rehearsal,
    metrics: {
      casesTotal: results.length,
      casesSuccess: results.filter((r) => r.success).length,
      byProvider,
      llmQc: {
        scored: llmScores.length,
        avg: llmScores.length > 0 ? Math.round(llmScores.reduce((a, b) => a + b, 0) / llmScores.length) : null,
        min: llmScores.length > 0 ? Math.min(...llmScores) : null,
        max: llmScores.length > 0 ? Math.max(...llmScores) : null,
      },
      ledger: ledger.summary(),
      reconciliation: {
        ledgerTotalUsd: ledgerTotal,
        recordedSumUsd: Math.round(recordedSum * 1e9) / 1e9,
        match: Math.abs(ledgerTotal - recordedSum) < 1e-9,
        mockRecords,
        mockContamination: !opts.allowMock && mockRecords > 0,
      },
    },
  };
}
