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
import { runFase2 } from '../fase2';
import { runFase3 } from '../fase3';
import { runFase4 } from '../fase4';
import { PostizDraftClient } from '../postiz';
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
  // Chain failure must name every provider's failure, not just the last
  // (a Gemini 503 must never be masked by the final Ollama error).
  try {
    await router.callWithFallback('hi', 'Test', false);
    assert.fail('chain should have failed');
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    assert.ok(msg.includes('meta:') && msg.includes('gemini:') && msg.includes('ollama:'), `chain error must name all providers, got: ${msg}`);
    assert.ok(e instanceof LiveUnavailableError);
  }
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
  clean('data/test-gate/jobs.sqlite');
  clean('data/test-gate/cost-ledger.jsonl');
  const sample = await runSample({ allowMock: true, humanApprover: 'phase-0-test-harness (TEST product only)', dataDir: 'data/test-gate' });
  assert.strictEqual(sample.mock, true, 'sample in this run is mock — must be reported as mock');
  assert.ok((sample as { draft: { published: boolean } }).draft.published === false, 'sample must end in draft, never publish');
  assert.ok(Array.isArray(sample.stages) && (sample.stages as string[]).includes('done'));
  ok('sample job end-to-end (mock, draft-only, trace + ledger)');

  // Phase 1 (draft only) — mock run must produce a draft STP, record
  // NO approval, and leave production blocked.
  clean('data/test-gate/jobs.sqlite');
  clean('data/test-gate/cost-ledger.jsonl');
  const fase1 = await runFase1({ allowMock: true, dataDir: 'data/test-gate' });
  assert.strictEqual((fase1.stp as { status: string }).status, 'draft', 'Fase 1 STP must be draft, never approved by code');
  const fase1Research = fase1.research as Record<string, unknown>;
  for (const field of ['behaviourDigital', 'paparanMedia', 'jenisKonten', 'caraTransaksi', 'touchPoints', 'painPoints', 'spendingBulanan', 'spendingDigital']) {
    assert.ok(Array.isArray(fase1Research[field]) && (fase1Research[field] as unknown[]).length > 0, `Fase 1 research must include ${field}`);
  }
  assert.deepStrictEqual(fase1.approvals, [], 'Fase 1 must record no approval on Patria behalf');
  assert.strictEqual(fase1.productionBlocked, true, 'production must be blocked without GSTP');
  assert.strictEqual(fase1.mock, true, 'Fase 1 test run is mock — must be reported as mock');
  ok('fase1 draft: STP draft, no approval, production blocked');

  // Phase 2 (mock) — requires a GSTP approval record, produces 7
  // briefs with QC passing, image pending, and NO GKonten approval.
  // The test approval fixture below is a TEST fixture only, not a
  // real Patria approval; the real record lives in docs/.
  clean('data/test-gate/jobs.sqlite');
  clean('data/test-gate/cost-ledger.jsonl');
  fs.writeFileSync('data/fase2-test-approval.json', JSON.stringify({ gate: 'GSTP', decision: 'approved', productId: 'TEST-BRAND-001', approver: 'test-harness', approvedStp: { segment: 'test segment', targeting: 'test targeting', positioning: 'test positioning' } }));
  const fase2 = await runFase2({ allowMock: true, dataDir: 'data/test-gate', approvalPath: 'data/fase2-test-approval.json', researchPath: 'docs/fase-1-output.json' });
  assert.strictEqual((fase2.calendar as unknown[]).length, 7, 'Fase 2 calendar must have 7 days');
  assert.strictEqual((fase2.briefs as unknown[]).length, 7, 'Fase 2 must have 7 briefs');
  assert.ok((fase2.qc as Array<{ passes: boolean }>).every((q) => q.passes), 'all Fase 2 QC must pass');
  assert.strictEqual(fase2.imageStatus, 'pending-provider', 'Fase 2 must not claim a generated image');
  assert.deepStrictEqual(fase2.gkontenApproval, [], 'Fase 2 must record no GKonten approval');
  assert.strictEqual(fase2.contentBlocked, true, 'distribution must be blocked without GKonten');
  await assert.rejects(() => runFase2({ allowMock: true, dataDir: 'data/test-gate', approvalPath: 'data/no-such-approval.json', researchPath: 'docs/fase-1-output.json' }), GateError, 'Fase 2 without GSTP record must be blocked');
  ok('fase2: 7-day calendar + 7 briefs, QC pass, image pending, GKonten pending, no-GSTP blocked');

  // Phase 3 (mock) — requires approved GSTP + GKonten records,
  // produces 7 carousels (3 slides each, QC pass, image pending)
  // and Postiz DRAFT payloads only (pending-postiz without a key,
  // never published). The Postiz client itself has no publish
  // method by construction; a live draft is verified against a
  // local capture server, not against real Postiz.
  fs.writeFileSync('data/fase3-test-gkonten.json', JSON.stringify({ gate: 'GKonten', decision: 'approved', productId: 'TEST-BRAND-001', approver: 'test-harness' }));
  const fase3 = await runFase3({ allowMock: true, dataDir: 'data/test-gate', gkontenApprovalPath: 'data/fase3-test-gkonten.json', gstpApprovalPath: 'data/fase2-test-approval.json', fase2Path: 'docs/fase-2-output.json' });
  assert.strictEqual((fase3.carousels as unknown[]).length, 7, 'Fase 3 must have 7 carousels');
  for (const c of fase3.carousels as Array<Record<string, unknown>>) {
    const slides = c.slides as Array<Record<string, unknown>>;
    assert.strictEqual(slides.length, 3, 'each carousel must have exactly 3 slides');
    assert.deepStrictEqual(slides.map((s) => s.role), ['hook', 'body', 'cta'], 'slide roles must be hook,body,cta in order');
    for (const s of slides) {
      assert.ok(String(s.overlayText).length > 0 && String(s.overlayText).length <= 120, 'overlay must be non-empty and <=120 chars');
      assert.strictEqual(s.image, null, 'carousel slide image must be null pending provider');
      assert.strictEqual(s.imageStatus, 'pending-provider', 'carousel slide imageStatus must be pending-provider');
    }
  }
  assert.ok((fase3.carouselQc as Array<Record<string, unknown>>).every((q) => (q.slides as Array<Record<string, unknown>>).every((s) => s.passes === true)), 'all Fase 3 carousel QC must pass');
  assert.strictEqual((fase3.postizDrafts as Array<Record<string, unknown>>).length, 7, 'Fase 3 must have 7 Postiz draft payloads');
  assert.ok((fase3.postizDrafts as Array<Record<string, unknown>>).every((d) => d.type === 'draft' && d.status === 'pending-postiz' && d.published === false), 'without a key, all drafts must be pending-postiz and unpublished');
  assert.strictEqual(fase3.published, false, 'Fase 3 must never publish');
  assert.strictEqual(fase3.postizLive, false, 'Fase 3 without a key must not be live');
  await assert.rejects(() => runFase3({ allowMock: true, dataDir: 'data/test-gate', gkontenApprovalPath: 'data/no-such-gkonten.json', gstpApprovalPath: 'data/fase2-test-approval.json', fase2Path: 'docs/fase-2-output.json' }), GateError, 'Fase 3 without GKonten record must be blocked');
  await assert.rejects(() => runFase3({ allowMock: true, dataDir: 'data/test-gate', gkontenApprovalPath: 'data/fase3-test-gkonten.json', gstpApprovalPath: 'data/no-such-gstp.json', fase2Path: 'docs/fase-2-output.json' }), GateError, 'Fase 3 without GSTP record must be blocked');
  ok('fase3: 7 carousels x 3 slides, QC pass, image pending, drafts pending-postiz, unpublished, no-gate blocked');

  // Phase 4 (rule-based, no model calls) — requires approved GSTP +
  // GKonten records, captures 12 fictional TEST leads, dedupes to
  // 10 (2 merges), flags 1 name-only candidate pair without
  // merging, scores 1-5 with auditable reasons, stages by score,
  // and emits draft Outreach only (score >= 3, never sent).
  const fase4 = await runFase4({ dataDir: 'data/test-gate', gkontenApprovalPath: 'data/fase3-test-gkonten.json', gstpApprovalPath: 'data/fase2-test-approval.json' });
  assert.strictEqual((fase4.counts as Record<string, unknown>).raw, 12, 'Fase 4 must capture 12 raw leads');
  assert.strictEqual((fase4.counts as Record<string, unknown>).deduped, 10, 'Fase 4 must dedupe to 10 leads');
  assert.strictEqual((fase4.counts as Record<string, unknown>).merged, 2, 'Fase 4 must merge exactly 2 duplicates');
  assert.deepStrictEqual((fase4.dedupeLog as Array<Record<string, unknown>>).map((d) => [d.mergedId, d.intoId, d.rule]), [['L02', 'L01', 'phone'], ['L04', 'L03', 'email+name']], 'dedupe log must match the fixture pairs');
  assert.strictEqual((fase4.candidates as unknown[]).length, 1, 'Fase 4 must flag exactly 1 name-only candidate pair');
  assert.deepStrictEqual((fase4.candidates as Array<Record<string, unknown>>)[0].leadIds, ['L05', 'L06'], 'candidate pair must be the two Andi leads');
  const leads4 = fase4.leads as Array<Record<string, unknown>>;
  assert.ok(leads4.every((l) => (l.score as number) >= 1 && (l.score as number) <= 5), 'all scores must be within 1-5');
  const byId4 = new Map(leads4.map((l) => [l.id as string, l]));
  assert.strictEqual(byId4.get('L07')?.score, 5, 'Dewi must score 5');
  assert.strictEqual(byId4.get('L07')?.stage, 'Prioritas', 'score 5 must stage Prioritas');
  assert.deepStrictEqual((fase4.pipeline as Record<string, string[]>).Prioritas, ['L07'], 'pipeline Prioritas must hold only L07');
  assert.strictEqual((fase4.counts as Record<string, unknown>).drafts, 6, 'Fase 4 must emit 6 outreach drafts (score >= 3)');
  assert.ok((fase4.outreachDrafts as Array<Record<string, unknown>>).every((d) => d.status === 'draft' && d.published === false && d.sent === false), 'all outreach drafts must be unsent drafts');
  assert.ok(!(fase4.outreachDrafts as Array<Record<string, unknown>>).some((d) => (d.stage as string) === 'Dingin'), 'no outreach draft for Dingin leads');
  assert.strictEqual(fase4.published, false, 'Fase 4 must never publish');
  assert.strictEqual(fase4.sent, false, 'Fase 4 must never send');
  assert.strictEqual(fase4.liveModelCalls, 0, 'Fase 4 must use zero model calls');
  assert.strictEqual(fase4.gtemplateApproval, null, 'Fase 4 must not invent a GTemplate approval');
  assert.strictEqual(fase4.gbatchApproved, false, 'GBatch must stay locked in the test run');
  await assert.rejects(() => runFase4({ dataDir: 'data/test-gate', gkontenApprovalPath: 'data/no-such-gkonten.json', gstpApprovalPath: 'data/fase2-test-approval.json' }), GateError, 'Fase 4 without GKonten record must be blocked');
  await assert.rejects(() => runFase4({ dataDir: 'data/test-gate', gkontenApprovalPath: 'data/fase3-test-gkonten.json', gstpApprovalPath: 'data/no-such-gstp.json' }), GateError, 'Fase 4 without GSTP record must be blocked');
  ok('fase4: 12 raw -> 10 deduped, 2 merges, 1 candidate pair, scores 1-5, pipeline, 6 drafts unsent, 0 model calls, no-gate blocked');

  // Postiz draft-only client: live draft shape against a capture
  // server; no publish/schedule method may exist on the client.
  const http = await import('node:http');
  let captured: Record<string, unknown> = {};
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try { captured = JSON.parse(body) as Record<string, unknown>; } catch { captured = {}; }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ id: 'draft-test-123' }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as { port: number }).port;
  const postizClient = new PostizDraftClient(`http://127.0.0.1:${port}`, 'pos_testkey');
  const created = await postizClient.createDraft({ type: 'draft', caption: 'hook\n\ncta', itemId: 'item-01', day: 1, channel: 'Instagram/TikTok', slides: [{ role: 'hook', overlayText: 'hook', imagePrompt: 'a sufficiently long text-free image prompt here' }], images: null, imageStatus: 'pending-provider' });
  assert.strictEqual(created.draftId, 'draft-test-123', 'Postiz client must parse the draft id');
  assert.strictEqual(captured.type, 'draft', 'Postiz request must be a draft, never a publish');
  assert.strictEqual((postizClient as unknown as Record<string, unknown>).publish, undefined, 'Postiz client must have no publish method');
  assert.strictEqual((postizClient as unknown as Record<string, unknown>).schedule, undefined, 'Postiz client must have no schedule method');
  assert.throws(() => new PostizDraftClient(`http://127.0.0.1:${port}`, ''), /API key is required/, 'Postiz client without a key must refuse to construct');
  await new Promise<void>((resolve) => server.close(() => resolve()));
  ok('postiz client: draft-only shape, no publish/schedule method, key required');

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
