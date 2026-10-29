// B4 — Kanban data DERIVED from real pipeline artifacts
// (snapshot per 27 Okt 2026), not hand-written dummy. Sources:
//   docs/fase-1-output.json (research + strategy stages)
//   docs/fase-2-output.json (7-day calendar + 7 briefs)
//   docs/fase-3-output.json (7 carousels, 21 slides, per-slide QC, imageStatus)
//   docs/fase-3-postiz-drafts.json (7 real Postiz drafts: postIds + dates)
//   docs/fase-4-output.json (12 raw TEST leads -> 10 deduped, scores,
//     pipeline, 6 draft Outreach records; TEST/fictional, draft-only)
//   gates.ts (GSTP/GKonten approved, GBatch pending)
// Snapshot honesty: these JSONs are bundled at build time. Re-running
// Fase 2/3 or creating new drafts does NOT refresh the app until the
// next build (live refresh is future work, not B4). The TEST Produk
// Digital project keeps its dummy board — no artifacts exist for it
// (disclosed in the log/report, not hidden).
import fase1 from '../../../docs/fase-1-output.json';
import fase2 from '../../../docs/fase-2-output.json';
import fase3 from '../../../docs/fase-3-output.json';
import postizRecord from '../../../docs/fase-3-postiz-drafts.json';
import fase4 from '../../../docs/fase-4-output.json';
import { GATES } from './gates.js';
import { tr } from './i18n.js';

export interface KanbanCard {
  t: string;
  a: string;
  c: number;
}

// Column indices mirror v5logic KCOLS order:
// 0 Antrian, 1 Dikerjakan, 2 Butuh Approval, 3 Revisi, 4 Selesai.
const COL = { antrian: 0, dikerjakan: 1, approval: 2, revisi: 3, selesai: 4 };

const f1 = fase1 as { stages: string[] };
const f2 = fase2 as { calendar: unknown[]; briefs: unknown[] };
const f3 = fase3 as {
  carousels: Array<{
    itemId: string;
    day: number;
    theme: string;
    slides: Array<{ qc?: { score?: number; passes?: boolean } }>;
  }>;
  imageStatus: string;
};
const rec = postizRecord as {
  created: string;
  channel: { platform: string; name: string };
  drafts: Array<{ itemId: string; day: number; date: string; postId: string; status: string }>;
};

const nDays = f2.calendar.length;
const nBriefs = f2.briefs.length;
const nCarousels = f3.carousels.length;
const allSlides = f3.carousels.flatMap((c) => c.slides);
const nSlides = allSlides.length;
const qcScores = allSlides.map((s) => s.qc?.score ?? 0);
const qcMin = qcScores.length ? Math.min(...qcScores) : 0;
const carouselDone =
  nCarousels > 0 && allSlides.length > 0 && allSlides.every((s) => s.qc?.passes === true);
const nDrafts = rec.drafts.length;
const draftsDone = nDrafts > 0 && rec.drafts.every((d) => d.status === 'draft');
const imageStatus = f3.imageStatus;

export function kopiKanban(): KanbanCard[] {
  return [
    { t: tr('kb.label.research'), a: 'Riset', c: f1.stages.includes('done') ? COL.selesai : COL.dikerjakan },
    { t: tr('kb.label.stp'), a: 'Strategi', c: GATES.GSTP.approved ? COL.selesai : COL.approval },
    { t: tr('kb.label.calendar', { nDays, nBriefs }), a: 'Kreatif', c: GATES.GKonten.approved ? COL.selesai : COL.approval },
    { t: tr('kb.label.carousel', { nCarousels, nSlides, qcMin }), a: 'Kreatif', c: carouselDone ? COL.selesai : COL.revisi },
    { t: tr('kb.label.images', { nSlides, imageStatus }), a: 'Media', c: imageStatus === 'pending-provider' ? COL.antrian : COL.dikerjakan },
    { t: tr('kb.label.drafts', { nDrafts }), a: 'Distribusi', c: draftsDone ? COL.selesai : COL.dikerjakan },
    { t: tr('kb.label.publish'), a: 'Distribusi', c: GATES.GBatch.approved ? COL.selesai : COL.approval },
  ];
}

// Campaign tab data, DERIVED from the real Fase 4 artifact (same
// build-time snapshot honesty as Kanban above). No live
// campaigns, no sending: Leads Generator holds draft campaign types
// only; CRM shows the Fase 4 pipeline; Outreach shows its draft
// batch; Follow Up has no sequences yet (later phase).
export interface CampaignLead {
  id: string;
  name: string;
  channel: string;
  score: number;
  stage: string;
}

export interface CampaignDraft {
  leadId: string;
  leadName: string;
  stage: string;
  score: number;
  channel: string;
  text: string;
  waLink: string | null;
}

const f4 = fase4 as {
  counts: { raw: number; deduped: number; merged: number; candidates: number; drafts: number };
  leads: Array<{ id: string; name: string; channel: string; score: number; stage: string }>;
  pipeline: Record<string, string[]>;
  outreachDrafts: Array<{ leadId: string; leadName: string; stage: string; score: number; channel: string; text: string; waLink: string | null }>;
};

export function campaignCounts(): { raw: number; deduped: number; merged: number; candidates: number; drafts: number } {
  return f4.counts;
}

export function campaignLeads(): CampaignLead[] {
  return f4.leads.map((l) => ({ id: l.id, name: l.name, channel: l.channel, score: l.score, stage: l.stage }));
}

export function campaignPipeline(): Array<{ stage: string; ids: string[] }> {
  return Object.keys(f4.pipeline).map((stage) => ({ stage, ids: f4.pipeline[stage] }));
}

export function campaignDrafts(): CampaignDraft[] {
  return f4.outreachDrafts.map((d) => ({ leadId: d.leadId, leadName: d.leadName, stage: d.stage, score: d.score, channel: d.channel, text: d.text, waLink: d.waLink }));
}
