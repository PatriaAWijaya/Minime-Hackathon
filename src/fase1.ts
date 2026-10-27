/**
 * Phase 1 — Decisions (Intake -> Research -> Strategy -> STP).
 * This is a DRAFT pipeline, not an approval pipeline:
 * - It produces a Research, Strategy, and STP draft for a TEST brand.
 * - It records NO approval (no GS, no GSTP) — the human gate owner
 *   (Patria) must approve, revise, or reject the STP themselves.
 * - Production is deliberately blocked: STP.status is 'draft', and
 *   PolicyEngine.requireProductionAllowed() throws GateError for it.
 * - Model output is labelled draft and unverified: the Research step
 *   is instructed NOT to fabricate statistics, URLs, or citations.
 *   Anything it asserts must be verified by a human before GSTP.
 * With allowMock=true every model step is the labelled mock provider.
 * With allowMock=false the live chain is attempted (Meta -> Gemini ->
 * Ollama local) and fails visibly when no live provider answers.
 */
import { validateContract } from './contracts';
import { CostLedger } from './ledger';
import { PolicyEngine, GateError } from './policy';
import { JobQueue } from './queue';
import { ModelRouter, routerConfigFromEnv } from './router';

export interface Fase1Options {
  allowMock: boolean;
  dataDir: string;
  /** Test brand brief. Defaults to the provisional fictional TEST brand. */
  brief?: {
    productId: string;
    productName: string;
    audience: string;
    problem: string;
    offer: string;
  };
}

export const TEST_BRIEF = {
  productId: 'TEST-BRAND-001',
  productName: 'TEST Kopi Surabaya (FIKSI — brand uji, bukan klien nyata)',
  audience: 'Mahasiswa dan pekerja muda Surabaya, 18–30 tahun, yang mencari es kopi susu terjangkau untuk sehari-hari',
  problem: 'Kopi kafe terasa mahal untuk konsumsi harian, sementara warung kopi tradisional sering tidak konsisten rasa dan kebersihannya',
  offer: 'Es kopi susu Rp15.000, rasa konsisten, disajikan cepat, bisa dipesan lewat chat',
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced ? fenced[1] : text).trim();
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('model output contained no JSON object');
  return JSON.parse(candidate.slice(start, end + 1));
}

function asStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x));
  if (typeof v === 'string') return [v];
  return [];
}

export async function runFase1(opts: Fase1Options): Promise<Record<string, unknown>> {
  const traceId = `trace-fase1-${Date.now()}`;
  const brief = opts.brief ?? TEST_BRIEF;
  const router = new ModelRouter(routerConfigFromEnv(process.env));
  const ledger = new CostLedger(`${opts.dataDir}/cost-ledger.jsonl`, Number(process.env.COST_HARD_LIMIT_USD ?? 5));
  const policy = new PolicyEngine();
  const queue = new JobQueue(`${opts.dataDir}/jobs.sqlite`);
  const stages: string[] = [];
  queue.onProgress((_job, stage) => stages.push(stage));

  const { job } = queue.create(brief.productId, 'fase1', { traceId }, `fase1-${brief.productId}`);
  queue.setStatus(job.id, 'running', null, 'brief');

  const briefContract = { version: '1', ...brief };
  const briefErrors = validateContract('ProductBrief', briefContract);
  if (briefErrors.length) throw new Error(`ProductBrief invalid: ${briefErrors.join('; ')}`);

  async function modelStep(agent: string, prompt: string, attempts = 3): Promise<{ text: string; provider: string; model: string; mock: boolean }> {
    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        const r = await router.callWithFallback(prompt, agent, opts.allowMock);
        ledger.append(router.toCostRecord(r, traceId, agent));
        return { text: r.text, provider: r.provider, model: r.model, mock: r.mock };
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e));
        // Transient provider overload (HTTP 503) is retried; anything
        // else fails fast so a wrong key/config is never masked.
        if (/503/.test(lastError.message) && attempt < attempts) {
          await sleep(3000 * attempt);
          continue;
        }
        throw lastError;
      }
    }
    throw lastError ?? new Error('model step failed');
  }

  const researchCall = await modelStep(
    'Research',
    `Kamu agen Research untuk brand berikut (semua konteks ini adalah FIKSI untuk uji alur, bukan data klien nyata): ${brief.productName}. Audiens: ${brief.audience}. Masalah: ${brief.problem}. Tawaran: ${brief.offer}. Tugasmu: berikan riset DRAF dalam format JSON saja, tanpa teks lain: {"facts": ["..."], "assumptions": ["..."], "sources_to_verify": ["..."]}. Aturan keras: JANGAN mengarang angka statistik, URL, kutipan, atau nama riset. Fakta harus kualitatif dan ditandai sebagai draf yang perlu verifikasi manusia. Di sources_to_verify, tulis JENIS sumber yang harus dicek (misal: observasi lapangan, wawancara pelanggan), bukan URL palsu. Berikan 4-5 fakta, 2-3 asumsi, 2-3 jenis sumber.`,
  );
  const researchJson = (opts.allowMock || researchCall.mock
    ? { facts: ['[mock] draf fakta uji'], assumptions: ['[mock] asumsi uji'], sources_to_verify: ['[mock] sumber uji'] }
    : extractJson(researchCall.text)) as Record<string, unknown>;
  const research = {
    version: '1',
    productId: brief.productId,
    facts: asStringArray(researchJson.facts),
    assumptions: [...asStringArray(researchJson.assumptions), 'DRAF model — semua fakta di atas belum terverifikasi manusia dan tidak boleh dikutip sebagai data resmi sebelum GSTP.'],
    sources: asStringArray(researchJson.sources_to_verify),
  };
  const researchErrors = validateContract('Research', research);
  if (researchErrors.length) throw new Error(`Research invalid: ${researchErrors.join('; ')}`);
  queue.setStatus(job.id, 'running', null, 'research');

  const strategyCall = await modelStep(
    'Strategy',
    `Kamu agen Strategy untuk brand fiksi uji: ${brief.productName}. Audiens: ${brief.audience}. Masalah: ${brief.problem}. Tawaran: ${brief.offer}. Riset draf (belum terverifikasi): ${research.facts.join(' | ')}. Tugasmu: berikan strategi DRAF dalam format JSON saja, tanpa teks lain: {"positioning": "satu kalimat positioning", "pillars": ["pilar 1", "pilar 2", "pilar 3"]}. Positioning harus satu janji utama untuk satu audiens utama.`,
  );
  const strategyJson = (opts.allowMock || strategyCall.mock
    ? { positioning: '[mock] positioning uji', pillars: ['[mock] pilar uji'] }
    : extractJson(strategyCall.text)) as Record<string, unknown>;
  const strategy = {
    version: '1',
    productId: brief.productId,
    positioning: String(strategyJson.positioning ?? ''),
    pillars: asStringArray(strategyJson.pillars),
  };
  const strategyErrors = validateContract('Strategy', strategy);
  if (strategyErrors.length) throw new Error(`Strategy invalid: ${strategyErrors.join('; ')}`);
  queue.setStatus(job.id, 'running', null, 'strategy');
  // GS gate: NO approval is recorded here. Strategy stays a draft
  // until the human gate owner approves it explicitly.

  const stpCall = await modelStep(
    'STP',
    `Kamu agen STP untuk brand fiksi uji: ${brief.productName}. Positioning draf: ${strategy.positioning}. Pilar: ${strategy.pillars.join(', ')}. Tugasmu: berikan STP DRAF dalam format JSON saja, tanpa teks lain: {"segment": "...", "targeting": "...", "positioning": "..."}. Segment harus spesifik (bukan "semua orang"), targeting satu segmen utama, positioning satu kalimat yang bisa diuji.`,
  );
  const stpJson = (opts.allowMock || stpCall.mock
    ? { segment: '[mock] segmen uji', targeting: '[mock] targeting uji', positioning: '[mock] positioning uji' }
    : extractJson(stpCall.text)) as Record<string, unknown>;
  const stp = {
    version: '1',
    productId: brief.productId,
    segment: String(stpJson.segment ?? ''),
    targeting: String(stpJson.targeting ?? ''),
    positioning: String(stpJson.positioning ?? ''),
    status: 'draft',
  };
  const stpErrors = validateContract('STP', stp);
  if (stpErrors.length) throw new Error(`STP invalid: ${stpErrors.join('; ')}`);

  // GSTP gate: NO approval is recorded here. Production must fail.
  let productionBlocked = false;
  try {
    policy.requireProductionAllowed(brief.productId);
  } catch (e) {
    if (e instanceof GateError) productionBlocked = true;
    else throw e;
  }
  if (!productionBlocked) throw new Error('Fase 1 bug: production was allowed without GSTP approval');

  queue.setStatus(job.id, 'done', { traceId, stp, productionBlocked }, 'done');
  return {
    traceId,
    productId: brief.productId,
    jobId: job.id,
    stages,
    brief: briefContract,
    research,
    strategy,
    stp,
    approvals: policy.all(),
    productionBlocked,
    ledger: ledger.summary(),
    modelCalls: {
      research: { provider: researchCall.provider, model: researchCall.model, mock: researchCall.mock },
      strategy: { provider: strategyCall.provider, model: strategyCall.model, mock: strategyCall.mock },
      stp: { provider: stpCall.provider, model: stpCall.model, mock: stpCall.mock },
    },
    mock: researchCall.mock,
    gateStatus: 'MENUNGGU GSTP — STP di atas adalah DRAF, belum disetujui, dan produksi diblokir sampai Patria menyetujui/merevisi/menolaknya.',
  };
}
