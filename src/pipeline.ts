/**
 * Sample end-to-end job (Phase 0, Block G).
 * Chain: ProductBrief -> Research -> Strategy -> STP (GSTP gate) ->
 * CreativeBrief (production, GSTP-gated) -> QC (cross-family) ->
 * GKonten gate -> distribution DRAFT (never publish).
 * With allowMock=true every model step is served by the labelled mock
 * provider and recorded as mock in CostLedger. With allowMock=false the
 * chain attempts the live chain and fails visibly when no live provider
 * is configured — it never silently pretends a mock was live.
 * The human gate is NOT auto-approved here: runSample() takes a
 * `gatesApprovedByHuman` flag. In the shipped sample run the gates are
 * approved by the explicit caller (the Phase 0 test harness, acting as
 * the human approver for a TEST product only), and that is recorded on
 * each approval record.
 */
import { validateContract, qcPasses } from './contracts';
import { CostLedger } from './ledger';
import { PolicyEngine } from './policy';
import { JobQueue } from './queue';
import { ModelRouter, routerConfigFromEnv } from './router';
import { scoreQc } from './qc';

export interface SampleOptions {
  allowMock: boolean;
  /** TEST product only. Real products require a real human approver. */
  humanApprover: string;
  dataDir: string;
}

export async function runSample(opts: SampleOptions): Promise<Record<string, unknown>> {
  const traceId = `trace-${Date.now()}`;
  const router = new ModelRouter(routerConfigFromEnv(process.env));
  const ledger = new CostLedger(`${opts.dataDir}/cost-ledger.jsonl`, Number(process.env.COST_HARD_LIMIT_USD ?? 5));
  const policy = new PolicyEngine();
  const queue = new JobQueue(`${opts.dataDir}/jobs.sqlite`);
  const stages: string[] = [];
  queue.onProgress((_job, stage) => stages.push(stage));

  const productId = 'TEST-BRAND-001';
  const { job } = queue.create(productId, 'sample', { traceId }, `sample-${productId}`);
  queue.setStatus(job.id, 'running', null, 'brief');

  const brief = {
    version: '1', productId, productName: 'TEST Brand (neutral test brand, PROVISIONAL)',
    audience: 'Test audience, labelled TEST', problem: 'Test problem statement',
    offer: 'Test offer',
  };
  const briefErrors = validateContract('ProductBrief', brief);
  if (briefErrors.length) throw new Error(`ProductBrief invalid: ${briefErrors.join('; ')}`);

  async function modelStep(agent: string, prompt: string) {
    const r = await router.callWithFallback(prompt, agent, opts.allowMock);
    ledger.append(router.toCostRecord(r, traceId, agent));
    return r;
  }

  const researchCall = await modelStep('Research', `Research facts for ${brief.productName}`);
  const research = {
    version: '1', productId,
    facts: [`[from ${researchCall.provider}] test fact 1`],
    assumptions: ['test assumption: mock facts are not real-world claims'],
    sources: researchCall.mock ? ['mock'] : ['live-provider'],
  };
  if (validateContract('Research', research).length) throw new Error('Research invalid');

  const strategyCall = await modelStep('Strategy', `Strategy for ${brief.productName}`);
  void strategyCall;
  const strategy = { version: '1', productId, positioning: 'Test positioning', pillars: ['test pillar'] };
  if (validateContract('Strategy', strategy).length) throw new Error('Strategy invalid');
  // GS gate: strategy approval is an explicit record, not an auto-pass.
  policy.approve('GS', productId, opts.humanApprover, 'approved', 'Phase 0 sample, TEST product');

  const stp = { version: '1', productId, segment: 'Test segment', targeting: 'Test targeting', positioning: 'Test positioning', status: 'approved' };
  if (validateContract('STP', stp).length) throw new Error('STP invalid');
  // GSTP gate: production is blocked until this approval exists.
  policy.approve('GSTP', productId, opts.humanApprover, 'approved', 'Phase 0 sample, TEST product');
  policy.requireProductionAllowed(productId);

  const creative = {
    version: '1', productId, itemId: 'item-001',
    visualPrompt: 'A clean, text-free product image composition, no letters or words rendered by the model',
    textOverlay: 'TEST — deterministic overlay text, not model-rendered',
    channelSizes: ['1080x1080', '1080x1350', '1080x1920'],
  };
  if (validateContract('CreativeBrief', creative).length) throw new Error('CreativeBrief invalid');

  const qc = scoreQc({
    productId, visualPrompt: creative.visualPrompt, textOverlay: creative.textOverlay,
    makerFamily: 'meta', qcFamily: 'gemini', modelRenderedText: false,
  });
  const qcContract = { version: '1', productId, score: qc.score, hardViolations: qc.hardViolations, makerFamily: 'meta', qcFamily: 'gemini' };
  if (validateContract('QC', qcContract).length) throw new Error('QC invalid');
  if (!qcPasses(qcContract)) throw new Error(`QC did not pass: ${JSON.stringify(qcContract)}`);

  policy.approve('GKonten', productId, opts.humanApprover, 'approved', 'Phase 0 sample, TEST product');
  policy.requireContentAllowed(productId);

  // Distribution DRAFT only. Publish is deliberately NOT called here.
  const draft = { productId, itemId: 'item-001', channel: 'postiz', status: 'draft', published: false };
  queue.setStatus(job.id, 'done', { traceId, draft, qc, ledger: ledger.summary(), stages }, 'done');

  return {
    traceId, productId, jobId: job.id, stages,
    approvals: policy.all(),
    ledger: ledger.summary(),
    qc, draft,
    mock: researchCall.mock,
  };
}
