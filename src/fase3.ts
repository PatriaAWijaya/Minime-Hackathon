/**
 * Phase 3 — Carousel + Postiz DRAFT only (from APPROVED content).
 * Gate discipline:
 * - This module REQUIRES two Patria approval records: an approved
 *   GSTP (docs/fase-1-gstp-approval.json) AND an approved GKonten
 *   (docs/fase-2-gkonten-approval.json), both for TEST-BRAND-001.
 *   Without either, it throws GateError and produces nothing. The
 *   in-memory approvals it registers are IMPORTS of Patria's
 *   records (approver = each record's approver), never approvals
 *   granted by this code.
 * - Carousel is an Image derivative: for each approved calendar
 *   item it produces exactly 3 slides (hook -> body -> CTA) with a
 *   text-free image prompt and a deterministic template overlay
 *   (<=120 chars) per slide. It does NOT generate images: the
 *   image provider (Muse Image, provisional) is pending Meta
 *   activation, so every slide carries image: null +
 *   imageStatus 'pending-provider'. No placeholder is ever
 *   presented as a generated image.
 * - Postiz drafts are DRAFT ONLY, via PostizDraftClient, which has
 *   no publish/schedule method by construction. A draft is created
 *   live only when POSTIZ_URL + POSTIZ_API_KEY are set in the
 *   environment; otherwise the draft payload is saved in the output
 *   with status 'pending-postiz' and published stays false.
 * - It records NO new gate approval: GKonten was Patria's decision,
 *   and nothing here publishes, schedules, or sends anything.
 * With allowMock=true every model step is the labelled mock provider.
 */
import * as fs from 'fs';
import { CostLedger } from './ledger';
import { PolicyEngine, GateError, Gate } from './policy';
import { JobQueue } from './queue';
import { ModelRouter, routerConfigFromEnv } from './router';
import { scoreQc } from './qc';
import { PostizDraftClient, PostizDraftPayload } from './postiz';

export interface Fase3Options {
  allowMock: boolean;
  dataDir: string;
  gkontenApprovalPath: string;
  gstpApprovalPath: string;
  fase2Path: string;
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

function readApproval(path: string, gate: Gate, productId: string): Record<string, unknown> {
  let approval: Record<string, unknown>;
  try {
    approval = JSON.parse(fs.readFileSync(path, 'utf8')) as Record<string, unknown>;
  } catch {
    throw new GateError(gate, `no ${gate} approval record found at ${path}`);
  }
  if (approval.gate !== gate || approval.decision !== 'approved' || approval.productId !== productId) {
    throw new GateError(gate, `approval record at ${path} is not an approved ${gate} for ${productId}`);
  }
  return approval;
}

export async function runFase3(opts: Fase3Options): Promise<Record<string, unknown>> {
  const traceId = `trace-fase3-${Date.now()}`;
  const productId = 'TEST-BRAND-001';

  // Gates: import Patria's GSTP + GKonten records, never invent one.
  const gkonten = readApproval(opts.gkontenApprovalPath, 'GKonten', productId);
  const gstp = readApproval(opts.gstpApprovalPath, 'GSTP', productId);
  const policy = new PolicyEngine();
  policy.approve('GSTP', productId, String(gstp.approver ?? 'unknown'), 'approved', `imported from ${opts.gstpApprovalPath}`);
  policy.approve('GKonten', productId, String(gkonten.approver ?? 'unknown'), 'approved', `imported from ${opts.gkontenApprovalPath}`);
  policy.requireProductionAllowed(productId);
  policy.requireContentAllowed(productId);

  let fase2: Record<string, unknown>;
  try {
    fase2 = JSON.parse(fs.readFileSync(opts.fase2Path, 'utf8')) as Record<string, unknown>;
  } catch {
    throw new Error(`no Fase 2 output found at ${opts.fase2Path}`);
  }
  const calendar = (fase2.calendar as unknown[]) ?? [];
  const briefs = (fase2.briefs as unknown[]) ?? [];
  if (calendar.length !== 7 || briefs.length !== 7) {
    throw new Error(`Fase 3 needs 7 calendar items + 7 briefs, got ${calendar.length} + ${briefs.length}`);
  }
  const briefByItem = new Map<string, Record<string, unknown>>();
  for (const b of briefs) {
    const br = b as Record<string, unknown>;
    briefByItem.set(String(br.itemId), br);
  }

  const router = new ModelRouter(routerConfigFromEnv(process.env));
  const ledger = new CostLedger(`${opts.dataDir}/cost-ledger.jsonl`, Number(process.env.COST_HARD_LIMIT_USD ?? 5));
  const queue = new JobQueue(`${opts.dataDir}/jobs.sqlite`);
  const stages: string[] = [];
  queue.onProgress((_job, stage) => stages.push(stage));
  const { job } = queue.create(productId, 'fase3', { traceId }, `fase3-${productId}`);
  queue.setStatus(job.id, 'running', null, 'carousel');

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

  const itemsForPrompt = calendar.map((c) => {
    const cal = c as Record<string, unknown>;
    const br = briefByItem.get(String((briefs.find((b) => (b as Record<string, unknown>).day === cal.day) as Record<string, unknown> | undefined)?.itemId ?? '')) ?? {};
    return {
      itemId: br.itemId,
      day: cal.day,
      theme: cal.theme,
      hook: cal.hook,
      cta: cal.cta,
      channel: cal.channel,
      visualPrompt: br.visualPrompt,
      textOverlay: br.textOverlay,
    };
  });

  const carouselCall = await modelStep(
    'Carousel',
    `Kamu agen Creative untuk brand fiksi uji TEST Kopi Surabaya. Kalender + brief yang SUDAH DISETUJUI (GKonten): ${JSON.stringify(itemsForPrompt)}. Tugasmu: untuk SETIAP item, buat carousel 3 slide dalam format JSON saja, tanpa teks lain: {"carousels": [{"itemId": "item-01", "day": 1, "slides": [{"role": "hook", "overlayText": "...", "imagePrompt": "..."}, {"role": "body", "overlayText": "...", "imagePrompt": "..."}, {"role": "cta", "overlayText": "...", "imagePrompt": "..."}]}]}. Aturan keras: harus ada 7 carousel, itemId item-01 s.d. item-07, day 1 s.d. 7 berurutan, tiap carousel tepat 3 slide dengan role berurutan hook -> body -> cta. overlayText maksimal 120 karakter, berisi hook/isi/CTA yang setia pada tema, hook, dan CTA item aslinya; slide CTA selalu mengarah ke pesan WhatsApp / pembayaran QRIS. imagePrompt mendeskripsikan gambar TANPA teks, huruf, angka, atau logo bertulisan apa pun yang dirender model — teks hanya sebagai overlay template terpisah, BUKAN digambar model. Tanpa URL, tanpa angka statistik, tanpa klaim harga selain yang sudah ada di brief.`,
  );
  const carouselJson = (opts.allowMock || carouselCall.mock
    ? {
        carousels: itemsForPrompt.map((it) => ({
          itemId: it.itemId,
          day: it.day,
          slides: [
            { role: 'hook', overlayText: String(it.hook ?? '').slice(0, 120), imagePrompt: `${String(it.visualPrompt ?? '')} — carousel hook frame` },
            { role: 'body', overlayText: String(it.textOverlay ?? '').slice(0, 120), imagePrompt: `${String(it.visualPrompt ?? '')} — carousel body frame` },
            { role: 'cta', overlayText: String(it.cta ?? '').slice(0, 120), imagePrompt: `${String(it.visualPrompt ?? '')} — carousel cta frame` },
          ],
        })),
      }
    : extractJson(carouselCall.text)) as Record<string, unknown>;
  const rawCarousels = (carouselJson.carousels as unknown[]) ?? [];
  if (rawCarousels.length !== 7) throw new Error(`must have exactly 7 carousels, got ${rawCarousels.length}`);

  const makerFamily = carouselCall.mock ? 'mock' : (carouselCall.provider === 'gemini' ? 'gemini' : carouselCall.provider);
  const carousels: Record<string, unknown>[] = [];
  const carouselQc: Record<string, unknown>[] = [];
  for (const c of rawCarousels) {
    const car = c as Record<string, unknown>;
    const itemId = String(car.itemId ?? '');
    const slides = (car.slides as unknown[]) ?? [];
    if (slides.length !== 3) throw new Error(`carousel ${itemId} must have exactly 3 slides, got ${slides.length}`);
    const roles = slides.map((s) => (s as Record<string, unknown>).role);
    if (roles.join(',') !== 'hook,body,cta') throw new Error(`carousel ${itemId} slide roles must be hook,body,cta in order, got ${roles.join(',')}`);
    const cal = calendar.find((x) => {
      const br = briefByItem.get(itemId);
      return br !== undefined && (x as Record<string, unknown>).day === br.day;
    }) as Record<string, unknown> | undefined;
    const cleanSlides = slides.map((s) => {
      const sl = s as Record<string, unknown>;
      const overlayText = String(sl.overlayText ?? '');
      const imagePrompt = String(sl.imagePrompt ?? '');
      if (!overlayText.trim() || overlayText.length > 120) throw new Error(`carousel ${itemId} slide ${sl.role}: overlayText must be non-empty and <=120 chars`);
      if (imagePrompt.trim().length < 20) throw new Error(`carousel ${itemId} slide ${sl.role}: imagePrompt too short`);
      if (/https?:\/\//.test(overlayText) || /https?:\/\//.test(imagePrompt)) throw new Error(`carousel ${itemId} slide ${sl.role}: URLs are forbidden`);
      const qc = scoreQc({
        productId,
        visualPrompt: imagePrompt,
        textOverlay: overlayText,
        makerFamily: String(makerFamily),
        qcFamily: 'rule',
        modelRenderedText: false,
      });
      if (!qc.passes) throw new Error(`carousel ${itemId} slide ${sl.role}: QC failed (${qc.hardViolations.join(',') || `score ${qc.score}`})`);
      return { role: sl.role, overlayText, imagePrompt, image: null, imageStatus: 'pending-provider', qc: { score: qc.score, hardViolations: qc.hardViolations, passes: qc.passes } };
    });
    carousels.push({
      itemId,
      day: car.day,
      channel: cal?.channel ?? null,
      theme: cal?.theme ?? null,
      slides: cleanSlides,
    });
    carouselQc.push({ itemId, slides: cleanSlides.map((s) => ({ role: s.role, score: (s.qc as Record<string, unknown>).score, passes: (s.qc as Record<string, unknown>).passes })) });
  }
  const allQcPass = carouselQc.every((q) => (q.slides as Array<Record<string, unknown>>).every((s) => s.passes === true));
  if (!allQcPass) throw new Error('Fase 3 carousel QC failed for at least one slide — stopping before Postiz drafts');

  // Postiz drafts: DRAFT ONLY. Live creation happens only when the
  // Postiz URL + API key are configured; otherwise payloads are
  // saved with status pending-postiz and nothing is published.
  queue.setStatus(job.id, 'running', null, 'postiz-drafts');
  const postizUrl = process.env.POSTIZ_URL ?? '';
  const postizKey = process.env.POSTIZ_API_KEY ?? '';
  const postizDrafts: Record<string, unknown>[] = [];
  let postizLive = false;
  for (const car of carousels) {
    const slides = car.slides as Array<Record<string, unknown>>;
    const hook = slides.find((s) => s.role === 'hook');
    const cta = slides.find((s) => s.role === 'cta');
    const caption = `${String(hook?.overlayText ?? '')}\n\n${String(cta?.overlayText ?? '')}`;
    const payload: PostizDraftPayload = {
      type: 'draft',
      caption,
      itemId: String(car.itemId),
      day: Number(car.day),
      channel: String(car.channel ?? ''),
      slides: slides.map((s) => ({ role: s.role as 'hook' | 'body' | 'cta', overlayText: String(s.overlayText), imagePrompt: String(s.imagePrompt) })),
      images: null,
      imageStatus: 'pending-provider',
    };
    if (postizUrl && postizKey) {
      try {
        const client = new PostizDraftClient(postizUrl, postizKey);
        const created = await client.createDraft(payload);
        postizLive = true;
        postizDrafts.push({ ...payload, status: 'created', draftId: created.draftId, published: false });
      } catch (e) {
        postizDrafts.push({ ...payload, status: 'failed', draftId: null, published: false, error: e instanceof Error ? e.message : String(e) });
      }
    } else {
      postizDrafts.push({
        ...payload,
        status: 'pending-postiz',
        draftId: null,
        published: false,
        reason: 'Postiz API key (pos_) belum tersedia di environment — draf tersimpan di output ini dan siap dibuat sebagai DRAF (bukan publish) setelah key ada.',
      });
    }
  }

  queue.setStatus(job.id, 'done', { traceId, carousels, postizDrafts }, 'done');
  return {
    traceId,
    productId,
    jobId: job.id,
    stages,
    gstpApproval: { gate: gstp.gate, decision: gstp.decision, approver: gstp.approver, source: opts.gstpApprovalPath },
    gkontenApproval: { gate: gkonten.gate, decision: gkonten.decision, approver: gkonten.approver, source: opts.gkontenApprovalPath },
    carousels,
    carouselQc,
    postizDrafts,
    postizLive,
    published: false,
    imageStatus: 'pending-provider',
    imageNote: 'Tidak ada gambar yang dihasilkan pada Fase 3: provider gambar (Muse Image, provisional) menunggu aktivasi Meta; slide carousel membawa imagePrompt + overlay template, gambar null pending-provider.',
    ledger: ledger.summary(),
    modelCalls: {
      carousel: { provider: carouselCall.provider, model: carouselCall.model, mock: carouselCall.mock },
    },
    mock: carouselCall.mock,
    gateStatus: postizLive
      ? 'FASE 3 DIKIRIM SEBAGAI DRAF — carousel lolos QC, draf Postiz dibuat (status draft, TIDAK dipublish, TIDAK dijadwalkan); tidak ada kiriman live.'
      : 'FASE 3 DRAF TERTUNDA DI POSTIZ — carousel lolos QC dan payload draf tersimpan di output ini (status pending-postiz), tetapi belum ada draf di Postiz karena API key belum tersedia; tidak ada yang dipublish.',
  };
}
