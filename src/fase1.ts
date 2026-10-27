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

  // Behaviour research (deepening, Patria 27 Okt siang): because this
  // brand will be targeted mostly digitally, the STP must rest on
  // observed digital behaviour, not demographics alone. This step is
  // mandatory in the research output and covers, in qualitative terms
  // only (no invented hours, percentages, URLs, or citations):
  // - behaviourDigital: daily digital routine, including long
  //   on-screen duration (lama durasi on screen) as a qualitative
  //   trait to be verified, not a measured number;
  // - paparanMedia: types of media exposure they actually encounter;
  // - jenisKonten: types of content they consume and respond to;
  // - caraTransaksi: ways they actually pay/order today;
  // - touchPoints: the full journey from discovery to repeat/share;
  // - painPoints: each pain point paired with how this brand solves it;
  // - spendingBulanan: monthly spending behaviour for this category
  //   (frequency x price sensitivity, in qualitative terms — exact
  //   amounts are hypotheses to verify, never stated as measured data);
  // - spendingDigital: spending through digital payments (methods,
  //   habits, barriers) as a consideration for digital targeting.
  const behaviourCall = await modelStep(
    'BehaviourResearch',
    `Kamu agen Behaviour Research untuk brand fiksi uji: ${brief.productName}. Audiens: ${brief.audience}. Masalah: ${brief.problem}. Tawaran: ${brief.offer}. Riset draf: ${research.facts.join(' | ')}. Brand ini akan banyak ditargetkan SECARA DIGITAL, jadi STP harus bertumpu pada behaviour, bukan hanya demografi. Berikan riset behaviour DRAF dalam format JSON saja, tanpa teks lain: {"behaviourDigital": ["..."], "paparanMedia": ["..."], "jenisKonten": ["..."], "caraTransaksi": ["..."], "touchPoints": ["..."], "painPoints": ["..."], "spendingBulanan": ["..."], "spendingDigital": ["..."]}. Aturan keras: JANGAN mengarang angka jam, persentase, statistik, nominal pasti, URL, atau kutipan — semua deskripsi harus kualitatif dan ditandai sebagai draf yang perlu verifikasi lapangan (survei/wawancara). Bila menyebut nominal, hanya boleh sebagai HIPOTESIS yang dirujuk ke harga tawaran yang sudah diketahui (Rp15.000 per cup) dan harus ditulis "hipotesis, perlu verifikasi". Isi yang wajib muncul: (1) behaviourDigital — rutinitas digital harian termasuk durasi on-screen yang PANJANG sebagai sifat kualitatif (mis. ponsel hampir selalu di tangan sepanjang hari, cek ponsel berulang) tanpa angka jam; (2) paparanMedia — jenis paparan media yang mereka temui sehari-hari (mis. reels, status WhatsApp, feed, video pendek, rekomendasi teman); (3) jenisKonten — jenis konten yang mereka konsumsi dan respons (hiburan, edukasi singkat, promo, review, dll); (4) caraTransaksi — cara mereka memesan dan membayar saat ini (chat, QRIS, e-wallet, tunai, dll sebagai jenis, bukan angka); (5) touchPoints — urutan titik sentuh dari menemukan brand sampai repeat/share/komplain; (6) painPoints — setiap pain point ditulis bersama solusi yang bisa diberikan brand ini, format: "Pain di [touch point]: ... -> diselesaikan dengan ..."; (7) spendingBulanan — pola spending bulanan untuk kategori ini: frekuensi beli yang berulang membuat pengeluaran kecil per transaksi terakumulasi menjadi signifikan per bulan, sensitivitas harga, dan trade-off yang mereka buat (mis. mengurangi frekuensi vs pindah ke opsi lebih murah) — semuanya kualitatif, tanpa total nominal yang diklaim sebagai data; (8) spendingDigital — spending melalui pembayaran digital: metode yang dipakai, kebiasaan (mis. lebih mudah mengeluarkan uang kecil lewat dompet digital karena tidak terasa seperti tunai), dan hambatan (saldo, biaya, sinyal, kepercayaan). Berikan 4-6 butir per bidang.`,
  );
  const behaviourJson = (opts.allowMock || behaviourCall.mock
    ? {
        behaviourDigital: ['[mock] behaviour digital uji'],
        paparanMedia: ['[mock] paparan media uji'],
        jenisKonten: ['[mock] jenis konten uji'],
        caraTransaksi: ['[mock] cara transaksi uji'],
        touchPoints: ['[mock] touch point uji'],
        painPoints: ['[mock] pain point uji -> diselesaikan dengan [mock] solusi uji'],
        spendingBulanan: ['[mock] spending bulanan uji'],
        spendingDigital: ['[mock] spending digital uji'],
      }
    : extractJson(behaviourCall.text)) as Record<string, unknown>;
  const behaviour = {
    behaviourDigital: asStringArray(behaviourJson.behaviourDigital),
    paparanMedia: asStringArray(behaviourJson.paparanMedia),
    jenisKonten: asStringArray(behaviourJson.jenisKonten),
    caraTransaksi: asStringArray(behaviourJson.caraTransaksi),
    touchPoints: asStringArray(behaviourJson.touchPoints),
    painPoints: asStringArray(behaviourJson.painPoints),
    spendingBulanan: asStringArray(behaviourJson.spendingBulanan),
    spendingDigital: asStringArray(behaviourJson.spendingDigital),
  };
  // Merge behaviour into the research record (extra fields are allowed
  // by the Research contract, which only checks its required fields).
  Object.assign(research, behaviour);
  queue.setStatus(job.id, 'running', null, 'behaviour');

  const strategyCall = await modelStep(
    'Strategy',
    `Kamu agen Strategy untuk brand fiksi uji: ${brief.productName}. Audiens: ${brief.audience}. Masalah: ${brief.problem}. Tawaran: ${brief.offer}. Riset draf (belum terverifikasi): ${research.facts.join(' | ')}. Behaviour digital draf: ${behaviour.behaviourDigital.join(' | ')}. Paparan media: ${behaviour.paparanMedia.join(' | ')}. Jenis konten yang direspons: ${behaviour.jenisKonten.join(' | ')}. Cara transaksi saat ini: ${behaviour.caraTransaksi.join(' | ')}. Pain point + solusi: ${behaviour.painPoints.join(' | ')}. Tugasmu: berikan strategi DRAF dalam format JSON saja, tanpa teks lain: {"positioning": "satu kalimat positioning", "pillars": ["pilar 1", "pilar 2", "pilar 3"]}. Positioning harus satu janji utama untuk satu audiens utama, dan minimal satu pilar harus menjawab behaviour digital (targeting digital) dan satu pilar harus menjawab pain point terbesar.`,
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
    `Kamu agen STP untuk brand fiksi uji: ${brief.productName}. Positioning draf: ${strategy.positioning}. Pilar: ${strategy.pillars.join(', ')}. Behaviour digital draf: ${behaviour.behaviourDigital.join(' | ')}. Touch points: ${behaviour.touchPoints.join(' | ')}. Cara transaksi: ${behaviour.caraTransaksi.join(' | ')}. Spending bulanan draf: ${behaviour.spendingBulanan.join(' | ')}. Spending digital draf: ${behaviour.spendingDigital.join(' | ')}. Tugasmu: berikan STP DRAF dalam format JSON saja, tanpa teks lain: {"segment": "...", "targeting": "...", "positioning": "..."}. Segment harus spesifik (bukan "semua orang") dan mencakup behaviour digital serta pola spendingnya, targeting satu segmen utama DENGAN jalur digital utamanya (platform/touch point mana yang dipakai untuk menjangkau mereka) dan pertimbangan spendingnya (harga per transaksi vs akumulasi bulanan, pembayaran digital), positioning satu kalimat yang bisa diuji.`,
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
      behaviour: { provider: behaviourCall.provider, model: behaviourCall.model, mock: behaviourCall.mock },
      strategy: { provider: strategyCall.provider, model: strategyCall.model, mock: strategyCall.mock },
      stp: { provider: stpCall.provider, model: stpCall.model, mock: stpCall.mock },
    },
    mock: researchCall.mock,
    gateStatus: 'MENUNGGU GSTP — STP di atas adalah DRAF, belum disetujui, dan produksi diblokir sampai Patria menyetujui/merevisi/menolaknya.',
  };
}
