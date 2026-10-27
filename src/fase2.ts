/**
 * Phase 2 — Calendar + Production briefs (from the APPROVED STP).
 * Gate discipline:
 * - This module REQUIRES an approved GSTP record file (default
 *   docs/fase-1-gstp-approval.json, approved by Patria). Without a
 *   record with gate GSTP + decision approved for this product, it
 *   throws GateError and produces nothing. The in-memory approval it
 *   registers is an IMPORT of Patria's record (approver = the record's
 *   approver), never an approval granted by this code.
 * - It produces a 7-day calendar + one CreativeBrief per day, each
 *   QC-scored deterministically (maker = live provider family,
 *   qc = 'rule': a rule check, NOT a live LLM QC call — live LLM QC
 *   is Phase 5 harness work, and claiming Meta QC here would be
 *   false because Meta is not active).
 * - It does NOT generate images: the image provider (Muse Image,
 *   provisional) is pending Meta activation, so every brief carries
 *   image: null + imageStatus 'pending-provider'. No placeholder is
 *   ever presented as a generated image.
 * - It records NO GKonten approval: the calendar + briefs stop at
 *   the GKonten gate for Patria's own decision (Fase 3 is the
 *   Postiz draft step and must not start before GKonten).
 * With allowMock=true every model step is the labelled mock provider.
 */
import * as fs from 'fs';
import { validateContract } from './contracts';
import { CostLedger } from './ledger';
import { PolicyEngine, GateError } from './policy';
import { JobQueue } from './queue';
import { ModelRouter, routerConfigFromEnv } from './router';
import { scoreQc } from './qc';

export interface Fase2Options {
  allowMock: boolean;
  dataDir: string;
  approvalPath: string;
  researchPath: string;
}

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

export async function runFase2(opts: Fase2Options): Promise<Record<string, unknown>> {
  const traceId = `trace-fase2-${Date.now()}`;
  const productId = 'TEST-BRAND-001';

  // GSTP gate: read Patria's approval record, never invent one.
  let approval: Record<string, unknown>;
  try {
    approval = JSON.parse(fs.readFileSync(opts.approvalPath, 'utf8')) as Record<string, unknown>;
  } catch {
    throw new GateError('GSTP', `no GSTP approval record found at ${opts.approvalPath}`);
  }
  if (approval.gate !== 'GSTP' || approval.decision !== 'approved' || approval.productId !== productId) {
    throw new GateError('GSTP', `approval record at ${opts.approvalPath} is not an approved GSTP for ${productId}`);
  }
  const approvedStp = approval.approvedStp as Record<string, unknown>;
  const policy = new PolicyEngine();
  // Import Patria's record into the engine (approver = record approver).
  policy.approve('GSTP', productId, String(approval.approver ?? 'unknown'), 'approved', `imported from ${opts.approvalPath}`);
  policy.requireProductionAllowed(productId);

  let researchContext = '';
  try {
    const prev = JSON.parse(fs.readFileSync(opts.researchPath, 'utf8')) as Record<string, unknown>;
    const r = prev.research as Record<string, unknown> | undefined;
    if (r) {
      researchContext = `Behaviour digital: ${(r.behaviourDigital as string[] ?? []).join(' | ')}. Paparan media: ${(r.paparanMedia as string[] ?? []).join(' | ')}. Jenis konten: ${(r.jenisKonten as string[] ?? []).join(' | ')}. Cara transaksi: ${(r.caraTransaksi as string[] ?? []).join(' | ')}. Touch points: ${(r.touchPoints as string[] ?? []).join(' | ')}. Pain point + solusi: ${(r.painPoints as string[] ?? []).join(' | ')}. Spending bulanan: ${(r.spendingBulanan as string[] ?? []).join(' | ')}. Spending digital: ${(r.spendingDigital as string[] ?? []).join(' | ')}.`;
    }
  } catch {
    researchContext = '(no prior research file found; using approved STP only)';
  }

  const router = new ModelRouter(routerConfigFromEnv(process.env));
  const ledger = new CostLedger(`${opts.dataDir}/cost-ledger.jsonl`, Number(process.env.COST_HARD_LIMIT_USD ?? 5));
  const queue = new JobQueue(`${opts.dataDir}/jobs.sqlite`);
  const stages: string[] = [];
  queue.onProgress((_job, stage) => stages.push(stage));
  const { job } = queue.create(productId, 'fase2', { traceId }, `fase2-${productId}`);
  queue.setStatus(job.id, 'running', null, 'calendar');

  async function modelStep(agent: string, prompt: string, attempts = 3): Promise<{ text: string; provider: string; model: string; mock: boolean }> {
    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        const r = await router.callWithFallback(prompt, agent, opts.allowMock);
        ledger.append(router.toCostRecord(r, traceId, agent));
        return { text: r.text, provider: r.provider, model: r.model, mock: r.mock };
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e));
        if (/503/.test(lastError.message) && attempt < attempts) {
          await sleep(3000 * attempt);
          continue;
        }
        throw lastError;
      }
    }
    throw lastError ?? new Error('model step failed');
  }

  const calendarCall = await modelStep(
    'Calendar',
    `Kamu agen Calendar untuk brand fiksi uji TEST Kopi Surabaya. STP yang SUDAH DISETUJUI (GSTP): segmen: ${approvedStp.segment}. Targeting: ${approvedStp.targeting}. Positioning: ${approvedStp.positioning}. Konteks riset: ${researchContext}. Tugasmu: susun kalender konten 7 hari (Hari 1-7) dalam format JSON saja, tanpa teks lain: {"days": [{"day": 1, "theme": "...", "pillar": "...", "contentType": "...", "channel": "...", "touchPoint": "...", "hook": "...", "cta": "..."}]}. Aturan: 7 hari persis, tema berbeda tiap hari, mencakup semua pilar strategi (kenyamanan digital, konsistensi kualitas, efisiensi urban), mencakup jenis konten yang direspons (video pendek, testimoni, promo, edukasi ringan), channel utama WhatsApp Status + Reels/TikTok + chat, CTA selalu mengarah ke pesan WhatsApp / pembayaran QRIS, hook singkat dan spesifik (bukan klise), tanpa angka statistik atau klaim yang dikarang.`,
  );
  const calendarJson = (opts.allowMock || calendarCall.mock
    ? { days: Array.from({ length: 7 }, (_, i) => ({ day: i + 1, theme: `[mock] tema hari ${i + 1}`, pillar: '[mock] pilar', contentType: '[mock] konten', channel: 'WhatsApp Status', touchPoint: '[mock] touch point', hook: '[mock] hook', cta: 'Pesan via WhatsApp' })) }
    : extractJson(calendarCall.text)) as Record<string, unknown>;
  const days = (calendarJson.days as unknown[]) ?? [];
  if (days.length !== 7) throw new Error(`calendar must have exactly 7 days, got ${days.length}`);
  queue.setStatus(job.id, 'running', null, 'briefs');

  const briefsCall = await modelStep(
    'Briefs',
    `Kamu agen Production untuk brand fiksi uji TEST Kopi Surabaya. Kalender 7 hari: ${JSON.stringify(days)}. Positioning yang disetujui: ${approvedStp.positioning}. Tugasmu: untuk SETIAP hari, berikan CreativeBrief dalam format JSON saja, tanpa teks lain: {"briefs": [{"itemId": "item-01", "day": 1, "visualPrompt": "...", "textOverlay": "...", "channelSizes": ["1080x1080"]}]}. Aturan keras untuk visualPrompt: deskripsikan gambar TANPA teks, huruf, angka, atau logo bertulisan apa pun yang dirender oleh model gambar — teks hanya boleh muncul sebagai overlay template terpisah (textOverlay), BUKAN digambar oleh model. textOverlay maksimal 80 karakter, berisi brand + tawaran/CTA (mis. TEST Kopi, harga, pesan via WhatsApp). channelSizes sesuai channel hari itu (Reels/TikTok/Status: 1080x1920; Feed: 1080x1080). Harus ada 7 brief, itemId item-01 s.d. item-07, day 1 s.d. 7 berurutan.`,
  );
  const briefsJson = (opts.allowMock || briefsCall.mock
    ? { briefs: Array.from({ length: 7 }, (_, i) => ({ itemId: `item-0${i + 1}`, day: i + 1, visualPrompt: '[mock] komposisi gambar tanpa teks, produk es kopi susu di meja terang', textOverlay: 'TEST Kopi — Pesan via WhatsApp', channelSizes: ['1080x1080'] })) }
    : extractJson(briefsCall.text)) as Record<string, unknown>;
  const rawBriefs = (briefsJson.briefs as unknown[]) ?? [];
  if (rawBriefs.length !== 7) throw new Error(`must have exactly 7 briefs, got ${rawBriefs.length}`);

  const briefs: Record<string, unknown>[] = [];
  const qcResults: Record<string, unknown>[] = [];
  const makerFamily = calendarCall.mock ? 'mock' : (calendarCall.provider === 'gemini' ? 'gemini' : calendarCall.provider);
  for (const b of rawBriefs) {
    const brief = b as Record<string, unknown>;
    const creative = {
      version: '1',
      productId,
      itemId: String(brief.itemId ?? ''),
      visualPrompt: String(brief.visualPrompt ?? ''),
      textOverlay: String(brief.textOverlay ?? ''),
      channelSizes: asStringArray(brief.channelSizes),
    };
    const errors = validateContract('CreativeBrief', creative);
    if (errors.length) throw new Error(`CreativeBrief invalid (${creative.itemId}): ${errors.join('; ')}`);
    // QC is deterministic rule scoring (not a live LLM call).
    const qc = scoreQc({
      productId,
      visualPrompt: creative.visualPrompt,
      textOverlay: creative.textOverlay,
      makerFamily: String(makerFamily),
      qcFamily: 'rule',
      modelRenderedText: false,
    });
    const qcContract = { version: '1', productId, score: qc.score, hardViolations: qc.hardViolations, makerFamily: String(makerFamily), qcFamily: 'rule' };
    if (validateContract('QC', qcContract).length) throw new Error(`QC invalid (${creative.itemId})`);
    briefs.push({ ...creative, day: brief.day, image: null, imageStatus: 'pending-provider' });
    qcResults.push({ itemId: creative.itemId, ...qc });
  }
  const allQcPass = qcResults.every((q) => q.passes === true);
  if (!allQcPass) throw new Error('Fase 2 QC failed for at least one brief — stopping before GKonten');

  // GKonten gate: NO approval is recorded here. No distribution draft
  // is created. Fase 3 must wait for Patria's GKonten decision.
  let contentBlocked = false;
  try {
    policy.requireContentAllowed(productId);
  } catch (e) {
    if (e instanceof GateError) contentBlocked = true;
    else throw e;
  }
  if (!contentBlocked) throw new Error('Fase 2 bug: content was allowed without GKonten approval');

  queue.setStatus(job.id, 'done', { traceId, briefs, qcResults }, 'done');
  return {
    traceId,
    productId,
    jobId: job.id,
    stages,
    gstpApproval: { gate: approval.gate, decision: approval.decision, approver: approval.approver, source: opts.approvalPath },
    approvedStp,
    calendar: days,
    briefs,
    qc: qcResults,
    imageStatus: 'pending-provider',
    imageNote: 'Tidak ada gambar yang dihasilkan pada Fase 2: provider gambar (Muse Image, provisional) menunggu aktivasi Meta; tidak ada placeholder yang diklaim sebagai gambar hasil generate.',
    gkontenApproval: [],
    contentBlocked,
    ledger: ledger.summary(),
    modelCalls: {
      calendar: { provider: calendarCall.provider, model: calendarCall.model, mock: calendarCall.mock },
      briefs: { provider: briefsCall.provider, model: briefsCall.model, mock: briefsCall.mock },
    },
    mock: calendarCall.mock,
    gateStatus: 'MENUNGGU GKONTEN — kalender + brief di atas adalah DRAF produksi, QC rule lolos, tetapi belum ada persetujuan konten dan belum ada draf distribusi; Fase 3 menunggu keputusan GKonten Patria.',
  };
}
