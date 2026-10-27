/**
 * Phase 0 gate tests. Run with: npm run gate-test
 * Every test asserts a real behaviour. Live-provider tests are
 * PENDING-style: they assert that a live call FAILS VISIBLY when its
 * key is absent, and they never count a mock as a live success.
 * Run from the repo root so data/ paths resolve.
 */
import * as assert from 'assert';
import * as fs from 'fs';
import { validateContract, qcPasses } from '../contracts';
import { CostLedger, CostLimitError } from '../ledger';
import { PolicyEngine, GateError } from '../policy';
import { JobQueue } from '../queue';
import { ModelRouter, routerConfigFromEnv, LiveUnavailableError } from '../router';
import { scoreQc } from '../qc';
import { runSample } from '../pipeline';
import { runFase1 } from '../fase1';
import { toIdr, formatIdr, parseUsdIdrRate } from '../currency';

function clean(p: string) {
  try { fs.rmSync(p, { recursive: true, force: true }); } catch { /* noop */ }
}

async function main() {
  const results: string[] = [];
  const ok = (name: string) => { results.push(`PASS ${name}`); console.log(`PASS ${name}`); };

  // Block B — contracts
  assert.deepStrictEqual(validateContract('ProductBrief', { version: '1', productId: 'x', productName: 'y', audience: 'a', problem: 'p', offer: 'o' }), []);
  assert.ok(validateContract('ProductBrief', { version: '1', productId: 'x' }).length > 0);
  assert.ok(validateContract('QC', { version: '1', productId: 'x', score: 90, hardViolations: [], makerFamily: 'meta', qcFamily: 'meta' }).length > 0, 'same-family QC must be rejected');
  assert.ok(qcPasses({ version: '1', productId: 'x', score: 80, hardViolations: [], makerFamily: 'meta', qcFamily: 'gemini' }));
  assert.ok(!qcPasses({ version: '1', productId: 'x', score: 74, hardViolations: [], makerFamily: 'meta', qcFamily: 'gemini' }));
  ok('contracts validate, versioned, cross-family QC enforced');

  // Block D — ledger append-only + hard limit
  clean('data/test-ledger.jsonl');
  const ledger = new CostLedger('data/test-ledger.jsonl', 1);
  ledger.append({ traceId: 't1', timestamp: new Date().toISOString(), agent: 'Test', provider: 'mock', family: 'mock', model: 'mock', promptTokens: null, completionTokens: null, costUsd: 0, costIdr: null, mock: true, fallbackFrom: null });
  assert.strictEqual(ledger.summary().records, 1);
  assert.throws(() => ledger.append({ traceId: 't1', timestamp: new Date().toISOString(), agent: 'Test', provider: 'meta', family: 'meta', model: 'm', promptTokens: 1, completionTokens: 1, costUsd: 2, costIdr: null, mock: false, fallbackFrom: null }), CostLimitError);
  ok('cost ledger append-only + hard limit stops the run');

  // Block E — policy gates + negative tests
  const policy = new PolicyEngine();
  assert.throws(() => policy.requireProductionAllowed('P1'), GateError, 'production before GSTP must be rejected');
  assert.throws(() => policy.requirePublishAllowed(null), GateError, 'publish without batch must be rejected');
  assert.throws(() => policy.requirePublishAllowed('nope'), GateError, 'publish with unapproved batch must be rejected');
  policy.approve('GSTP', 'P1', 'tester', 'approved');
  policy.requireProductionAllowed('P1');
  const batch = policy.approve('GBatch', 'P1', 'tester', 'approved');
  policy.requirePublishAllowed(batch.id);
  ok('policy gates enforced at service level, negative tests pass');

  // Block F — queue idempotency + persistence
  clean('data/test-jobs.sqlite');
  const q1 = new JobQueue('data/test-jobs.sqlite');
  const a = q1.create('P1', 'sample', {}, 'idem-1');
  const b = q1.create('P1', 'sample', {}, 'idem-1');
  assert.strictEqual(a.created, true);
  assert.strictEqual(b.created, false);
  assert.strictEqual(a.job.id, b.job.id, 'duplicate job must not create a second job');
  q1.setStatus(a.job.id, 'done', { done: true });
  const q2 = new JobQueue('data/test-jobs.sqlite');
  assert.strictEqual(q2.get(a.job.id)?.status, 'done', 'status must survive a restart (DB source of truth)');
  ok('queue idempotent + DB-persistent');

  // Block C/H — router: live unavailable fails visibly, mock is labelled
  const router = new ModelRouter({ ...routerConfigFromEnv({}), metaApiKey: null, geminiApiKey: null });
  await assert.rejects(() => router.callMeta('hi', 't'), LiveUnavailableError);
  await assert.rejects(() => router.callGemini('hi'), LiveUnavailableError);
  await assert.rejects(() => router.callWithFallback('hi', 'Test', false));
  const mock = router.callMock('hi', 'Test');
  assert.strictEqual(mock.mock, true);
  assert.strictEqual(router.qcProviderFor('meta'), 'gemini');
  assert.strictEqual(router.qcProviderFor('gemini'), 'meta');
  assert.strictEqual(router.qcProviderFor('qwen'), 'gemini');
  assert.strictEqual(router.qcProviderFor('deepseek'), 'gemini');
  assert.strictEqual(routerConfigFromEnv({}).ollamaModel, 'deepseek-r1:1.5b');
  assert.strictEqual(routerConfigFromEnv({}).ollamaFallbackModel, 'qwen2.5:3b');
  ok('router live-unavailable fails visibly; mock labelled; QC cross-family mapping correct');

  // Ollama reachability (VM): must fail visibly, not be claimed live.
  let ollamaFailed = false;
  try { await router.callOllama('hi'); } catch (e) { ollamaFailed = e instanceof LiveUnavailableError; }
  assert.strictEqual(ollamaFailed, true, 'Ollama in this VM must fail visibly (it lives on Patria MacBook)');
  ok('ollama live probe fails visibly in this VM (expected, recorded as pending)');

  // Block G — sample job with mock, end to end
  clean('data/jobs.sqlite');
  clean('data/cost-ledger.jsonl');
  const sample = await runSample({ allowMock: true, humanApprover: 'phase-0-test-harness (TEST product only)', dataDir: 'data' });
  assert.strictEqual(sample.mock, true, 'sample in this run is mock — must be reported as mock');
  assert.ok((sample as { draft: { published: boolean } }).draft.published === false, 'sample must end in draft, never publish');
  assert.ok(Array.isArray(sample.stages) && (sample.stages as string[]).includes('done'));
  ok('sample job end-to-end (mock, draft-only, trace + ledger)');

  // Phase 1 (draft only) — mock run must produce a draft STP, record
  // NO approval, and leave production blocked.
  clean('data/jobs.sqlite');
  clean('data/cost-ledger.jsonl');
  const fase1 = await runFase1({ allowMock: true, dataDir: 'data' });
  assert.strictEqual((fase1.stp as { status: string }).status, 'draft', 'Fase 1 STP must be draft, never approved by code');
  const fase1Research = fase1.research as Record<string, unknown>;
  for (const field of ['behaviourDigital', 'paparanMedia', 'jenisKonten', 'caraTransaksi', 'touchPoints', 'painPoints', 'spendingBulanan', 'spendingDigital']) {
    assert.ok(Array.isArray(fase1Research[field]) && (fase1Research[field] as unknown[]).length > 0, `Fase 1 research must include ${field}`);
  }
  assert.deepStrictEqual(fase1.approvals, [], 'Fase 1 must record no approval on Patria behalf');
  assert.strictEqual(fase1.productionBlocked, true, 'production must be blocked without GSTP');
  assert.strictEqual(fase1.mock, true, 'Fase 1 test run is mock — must be reported as mock');
  ok('fase1 draft: STP draft, no approval, production blocked');

  // Rupiah reporting (standing rule, Patria 27 Oct 2026): IDR first,
  // USD only as source; no conversion without a rate, ever.
  assert.strictEqual(toIdr(5, 18137), 90685);
  assert.strictEqual(toIdr(0.0001, 18137), 1.81);
  assert.strictEqual(toIdr(null, 18137), null);
  assert.strictEqual(toIdr(5, null), null);
  assert.strictEqual(formatIdr(90685), 'Rp90.685');
  assert.strictEqual(formatIdr(1.81), 'Rp1,81');
  assert.strictEqual(parseUsdIdrRate({ USD_IDR_RATE: '18137' }), 18137);
  assert.strictEqual(parseUsdIdrRate({}), null);
  assert.strictEqual(parseUsdIdrRate({ USD_IDR_RATE: 'bukan-angka' }), null);
  clean('data/idr-test-ledger.jsonl');
  const idrLedger = new CostLedger('data/idr-test-ledger.jsonl', 5, 18137);
  idrLedger.append({ traceId: 't', timestamp: '2026-10-27T00:00:00Z', agent: 'Test', provider: 'gemini', family: 'gemini', model: 'gemini-3.1-flash-lite', promptTokens: 10, completionTokens: 10, costUsd: 0.0001, costIdr: null, mock: false, fallbackFrom: null });
  idrLedger.append({ traceId: 't', timestamp: '2026-10-27T00:00:00Z', agent: 'Test', provider: 'mock', family: 'mock', model: 'mock', promptTokens: null, completionTokens: null, costUsd: 0, costIdr: null, mock: true, fallbackFrom: null });
  const idrSummary = idrLedger.summary();
  assert.strictEqual(idrSummary.totalIdr, 1.81);
  assert.strictEqual(idrSummary.hardLimitIdr, 90685);
  assert.strictEqual(idrSummary.usdIdrRate, 18137);
  const noRateLedger = new CostLedger('data/idr-test-ledger.jsonl', 5, null);
  assert.strictEqual(noRateLedger.summary().totalIdr, null, 'without a rate, IDR total must be null, not guessed');
  ok('rupiah reporting: conversion, format, null-rate honesty, ledger IDR');

  // QC scoring
  const qc = scoreQc({ productId: 'P1', visualPrompt: 'a sufficiently long text-free visual prompt here', textOverlay: 'TEST', makerFamily: 'meta', qcFamily: 'gemini', modelRenderedText: false });
  assert.strictEqual(qc.passes, true);
  const bad = scoreQc({ productId: 'P1', visualPrompt: 'x', textOverlay: 'y', makerFamily: 'meta', qcFamily: 'gemini', modelRenderedText: true });
  assert.strictEqual(bad.passes, false);
  ok('qc scoring: pass and hard-violation rejection');

  fs.mkdirSync('docs', { recursive: true });
  fs.writeFileSync('docs/fase-0-test-results.txt', results.join('\n') + '\n');
  console.log(`\nALL ${results.length} GATE TEST GROUPS PASSED (mock-labelled where applicable)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
