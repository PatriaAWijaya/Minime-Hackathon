// B4 — Kanban/Planner data DERIVED from real pipeline artifacts
// (snapshot per 27 Okt 2026), not hand-written dummy. Sources:
//   docs/fase-1-output.json (research + strategy stages)
//   docs/fase-2-output.json (7-day calendar + 7 briefs)
//   docs/fase-3-output.json (7 carousels, 21 slides, per-slide QC, imageStatus)
//   docs/fase-3-postiz-drafts.json (7 real Postiz drafts: postIds + dates)
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
import { GATES } from './gates.js';

export interface KanbanCard {
  t: string;
  a: string;
  c: number;
}

export interface PlannerRow {
  item: string;
  ch: string;
  when: string;
  st: string;
  postId: string;
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

export const KOPI_KANBAN: KanbanCard[] = [
  { t: 'Riset pasar & behaviour', a: 'Riset', c: f1.stages.includes('done') ? COL.selesai : COL.dikerjakan },
  { t: 'STP v2', a: 'Strategi', c: GATES.GSTP.approved ? COL.selesai : COL.approval },
  { t: `Kalender ${nDays} hari + ${nBriefs} brief`, a: 'Kreatif', c: GATES.GKonten.approved ? COL.selesai : COL.approval },
  { t: `Carousel ${nCarousels} item (${nSlides} slide, QC ${qcMin})`, a: 'Kreatif', c: carouselDone ? COL.selesai : COL.revisi },
  { t: `Gambar ${nSlides} slide (${imageStatus})`, a: 'Media', c: imageStatus === 'pending-provider' ? COL.antrian : COL.dikerjakan },
  { t: `Draf Postiz (${nDrafts} draf)`, a: 'Distribusi', c: draftsDone ? COL.selesai : COL.dikerjakan },
  { t: 'Terbit live (butuh GBatch)', a: 'Distribusi', c: GATES.GBatch.approved ? COL.selesai : COL.approval },
];

const ID_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

/**
 * Render a record date exactly as stored (UTC). The Postiz record's
 * dates are Zulu; converting silently to WIB would misstate them.
 */
function fmtUtc(iso: string): string {
  const d = new Date(iso);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${d.getUTCDate()} ${ID_MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()} ${hh}:${mm} UTC`;
}

const themeByItem = new Map(f3.carousels.map((c) => [c.itemId, c.theme]));

export const PLANNER_REAL: PlannerRow[] = rec.drafts.map((dr) => ({
  item: `Hari ${dr.day} — ${themeByItem.get(dr.itemId) ?? dr.itemId}`,
  ch: `Instagram · ${rec.channel.name}`,
  when: fmtUtc(dr.date),
  st: 'DRAF',
  postId: dr.postId,
}));

export const BACKEND_DATA_NOTE =
  `Snapshot per 27 Okt 2026: Fase 1–3 + ${nDrafts} draf Postiz (record ${rec.created}).`;
