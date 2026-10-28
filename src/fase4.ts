/**
 * Phase 4 — Form -> CRM Leads (capture, dedupe, scoring 1-5,
 * pipeline, draft Outreach batch). NO live sending, by construction:
 * - This module imports NO Postiz client, NO WhatsApp API, NO fetch,
 *   and defines NO send/publish/schedule function. Outreach output
 *   is draft records only (status 'draft', published false,
 *   sent false). A WhatsApp draft carries a manual click-to-chat
 *   link (wa.me) for a human to click — Phase A, exactly as the
 *   canon requires; an Instagram draft is text only, for manual
 *   copy-paste. Nothing here ever contacts an external service.
 * - Gate discipline: like Fase 3, this module REQUIRES Patria's
 *   approved GSTP (docs/fase-1-gstp-approval.json) AND approved
 *   GKonten (docs/fase-2-gkonten-approval.json) for TEST-BRAND-001,
 *   imported (never invented). Without either it throws GateError
 *   and produces nothing. GBatch stays locked: the batch is draft
 *   only, and gbatchApproved is recorded as false unless Patria
 *   approves a batch id elsewhere — this module never approves one.
 * - GTemplate is NOT approved by this module: the single outreach
 *   template text is emitted as a draft for Patria's review, and
 *   gtemplateApproval is recorded as null (pending Patria).
 * - Scoring is RULE-BASED, not model-based: every point comes from
 *   a documented keyword/signal rule applied to the fixture, so
 *   every score is auditable and reproducible, and Fase 4 costs
 *   zero model calls (liveModelCalls 0, ledger unchanged).
 * - Leads are a FICTIONAL fixture for TEST Kopi Surabaya (TEST
 *   brand, TEST numbers/emails, labelled test: true throughout).
 *   No real person's data is involved. The fixture is written
 *   during the event, in this repo, like every other TEST artifact.
 */

import * as fs from 'fs';
import { CostLedger } from './ledger';
import { PolicyEngine, GateError, Gate } from './policy';
import { JobQueue } from './queue';

export interface Fase4Options {
  dataDir: string;
  gkontenApprovalPath: string;
  gstpApprovalPath: string;
}

export interface RawLead {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  channel: 'WhatsApp' | 'Instagram' | 'Form' | 'Referral';
  message: string;
  firstContact: string;
  repeatContact: boolean;
  referredBy: string | null;
}

/** Fictional TEST fixture for TEST Kopi Surabaya. Numbers use the
 *  0812-0000-xxxx block and emails use contoh.test — both clearly
 *  non-real, labelled test: true in every output record. Two
 *  intentional duplicate pairs (phone-format variant, email-case
 *  variant) prove the dedupe rules; one name-only pair proves that
 *  name alone never auto-merges. */
export const FASE4_FIXTURE: RawLead[] = [
  { id: 'L01', name: 'Budi', phone: '0812-0000-0001', email: null, channel: 'WhatsApp', message: 'Halo, berapa harga es kopi susu?', firstContact: '2026-10-28T09:00:00+07:00', repeatContact: false, referredBy: null },
  { id: 'L02', name: 'Budi', phone: '+62812-0000-0001', email: null, channel: 'WhatsApp', message: 'Bisa pesan 2 gelas?', firstContact: '2026-10-28T09:40:00+07:00', repeatContact: false, referredBy: null },
  { id: 'L03', name: 'Sari', phone: null, email: 'sari@contoh.test', channel: 'Form', message: 'Mau tanya menu dan lokasi gerai', firstContact: '2026-10-28T10:05:00+07:00', repeatContact: false, referredBy: null },
  { id: 'L04', name: 'Sari', phone: null, email: 'SARI@contoh.test', channel: 'Form', message: 'Ada promo?', firstContact: '2026-10-28T10:30:00+07:00', repeatContact: false, referredBy: null },
  { id: 'L05', name: 'Andi', phone: null, email: null, channel: 'Instagram', message: 'Kak, es kopinya ready jam berapa?', firstContact: '2026-10-28T11:00:00+07:00', repeatContact: false, referredBy: null },
  { id: 'L06', name: 'Andi', phone: null, email: null, channel: 'Instagram', message: 'Bisa kirim ke kos saya?', firstContact: '2026-10-28T11:20:00+07:00', repeatContact: false, referredBy: null },
  { id: 'L07', name: 'Dewi', phone: '0812-0000-0007', email: null, channel: 'WhatsApp', message: 'Saya mau pesan sekarang 3 gelas, bayar QRIS, antar ke Jl. Kenanga 12', firstContact: '2026-10-28T12:00:00+07:00', repeatContact: true, referredBy: null },
  { id: 'L08', name: 'Rina', phone: '0812-0000-0008', email: null, channel: 'Referral', message: 'Teman saya rekomen es kopi susu ini, berapa harganya?', firstContact: '2026-10-28T13:00:00+07:00', repeatContact: false, referredBy: 'Teman' },
  { id: 'L09', name: 'Fajar', phone: '0812-0000-0009', email: null, channel: 'WhatsApp', message: 'Ok', firstContact: '2026-10-28T14:00:00+07:00', repeatContact: false, referredBy: null },
  { id: 'L10', name: 'Maya', phone: null, email: 'maya@contoh.test', channel: 'Form', message: 'Saya mau pesan sekarang untuk acara kantor, 20 gelas, bisa kirim?', firstContact: '2026-10-28T15:00:00+07:00', repeatContact: false, referredBy: null },
  { id: 'L11', name: 'Gilang', phone: null, email: null, channel: 'Instagram', message: 'Keren konsepnya', firstContact: '2026-10-28T16:00:00+07:00', repeatContact: false, referredBy: null },
  { id: 'L12', name: 'Putri', phone: '0812-0000-0012', email: null, channel: 'WhatsApp', message: 'Harga? Lokasi? Buka jam berapa?', firstContact: '2026-10-28T17:00:00+07:00', repeatContact: false, referredBy: null },
];

/** Outreach template (GTemplate draft — pending Patria's approval,
 *  recorded as null, never invented). One template, slot-filled per
 *  lead; the offer (es kopi susu Rp15.000, chat order, QRIS) is the
 *  approved TEST Kopi offer, nothing else is claimed. */
export const GTEMPLATE_TEXT =
  'Halo {nama}, terima kasih sudah menghubungi TEST Kopi Surabaya! Es kopi susu kami Rp15.000 — pesan lewat chat ini, bayar pakai QRIS. Mau saya bantu pesan sekarang?';

const INTENT_KEYWORDS = ['harga', 'pesan', 'order', 'beli', 'antar', 'kirim', 'lokasi', 'buka', 'menu'];
const HIGH_INTENT_KEYWORDS = ['pesan sekarang', 'qris', 'bayar', 'antar ke', 'alamat'];

export function normalizePhone(phone: string | null): string | null {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('62')) digits = '0' + digits.slice(2);
  return digits || null;
}

export function normalizeEmail(email: string | null): string | null {
  if (!email) return null;
  const clean = email.trim().toLowerCase();
  return clean || null;
}

export function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

function scoreLead(lead: {
  name: string;
  phone: string | null;
  email: string | null;
  messages: string[];
  repeatContact: boolean;
  referredBy: string | null;
}): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 1;
  if (lead.name.trim() && (lead.phone || lead.email)) {
    score += 1;
    reasons.push('completeness: nama + kontak (telepon/email) tersedia');
  }
  const text = lead.messages.join(' ').toLowerCase();
  if (INTENT_KEYWORDS.some((k) => text.includes(k))) {
    score += 1;
    reasons.push('intent: pesan mengandung kata niat beli (harga/pesan/order/beli/antar/kirim/lokasi/buka/menu)');
  }
  if (lead.repeatContact || lead.referredBy) {
    score += 1;
    reasons.push(lead.repeatContact ? 'repeat: kontak berulang' : 'referral: datang lewat referensi');
  }
  if (HIGH_INTENT_KEYWORDS.some((k) => text.includes(k))) {
    score += 1;
    reasons.push('high-intent: pesan mengandung aksi beli (pesan sekarang/QRIS/bayar/antar ke/alamat)');
  }
  return { score: Math.min(5, Math.max(1, score)), reasons };
}

export function stageForScore(score: number): string {
  if (score >= 5) return 'Prioritas';
  if (score === 4) return 'Prospek';
  if (score === 3) return 'Nurture';
  return 'Dingin';
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

interface CanonicalLead {
  id: string;
  name: string;
  phone: string | null;
  phoneNormalized: string | null;
  email: string | null;
  channel: string;
  firstContact: string;
  messages: string[];
  repeatContact: boolean;
  referredBy: string | null;
  mergedFrom: string[];
  test: boolean;
}

export async function runFase4(opts: Fase4Options): Promise<Record<string, unknown>> {
  const traceId = `trace-fase4-${Date.now()}`;
  const productId = 'TEST-BRAND-001';

  // Gates: import Patria's GSTP + GKonten records, never invent one.
  const gkonten = readApproval(opts.gkontenApprovalPath, 'GKonten', productId);
  const gstp = readApproval(opts.gstpApprovalPath, 'GSTP', productId);
  const policy = new PolicyEngine();
  policy.approve('GSTP', productId, String(gstp.approver ?? 'unknown'), 'approved', `imported from ${opts.gstpApprovalPath}`);
  policy.approve('GKonten', productId, String(gkonten.approver ?? 'unknown'), 'approved', `imported from ${opts.gkontenApprovalPath}`);
  policy.requireProductionAllowed(productId);
  policy.requireContentAllowed(productId);
  const gbatchApproved = policy.isApproved('GBatch', productId);

  const ledger = new CostLedger(`${opts.dataDir}/cost-ledger.jsonl`, Number(process.env.COST_HARD_LIMIT_USD ?? 5));
  const queue = new JobQueue(`${opts.dataDir}/jobs.sqlite`);
  const stages: string[] = [];
  queue.onProgress((_job, stage) => stages.push(stage));
  const { job } = queue.create(productId, 'fase4', { traceId }, `fase4-${productId}`);
  queue.setStatus(job.id, 'running', null, 'capture-dedupe');

  // Capture + dedupe, in firstContact order; first occurrence wins.
  // Rule 1 (phone): same normalized phone merges.
  // Rule 2 (email+name): same normalized email AND same normalized
  //   name merges (for leads without a phone).
  // Name alone NEVER merges — it is flagged as a candidate for
  // human review instead.
  const canonical: CanonicalLead[] = [];
  const byPhone = new Map<string, CanonicalLead>();
  const byEmailName = new Map<string, CanonicalLead>();
  const dedupeLog: Array<Record<string, unknown>> = [];
  for (const raw of FASE4_FIXTURE) {
    const phoneN = normalizePhone(raw.phone);
    const emailN = normalizeEmail(raw.email);
    const nameN = normalizeName(raw.name);
    let target: CanonicalLead | undefined;
    let rule = '';
    if (phoneN && byPhone.has(phoneN)) {
      target = byPhone.get(phoneN);
      rule = 'phone';
    } else if (emailN && byEmailName.has(`${emailN}|${nameN}`)) {
      target = byEmailName.get(`${emailN}|${nameN}`);
      rule = 'email+name';
    }
    if (target) {
      dedupeLog.push({ mergedId: raw.id, intoId: target.id, rule });
      target.messages.push(raw.message);
      // A merge proves a second contact from the same person.
      target.repeatContact = true;
      if (!target.phone && raw.phone) target.phone = raw.phone;
      if (!target.email && raw.email) target.email = raw.email;
      if (!target.referredBy && raw.referredBy) target.referredBy = raw.referredBy;
      target.mergedFrom.push(raw.id);
      target.phoneNormalized = normalizePhone(target.phone);
      target.email = normalizeEmail(target.email);
      continue;
    }
    const lead: CanonicalLead = {
      id: raw.id,
      name: raw.name,
      phone: raw.phone,
      phoneNormalized: phoneN,
      email: emailN,
      channel: raw.channel,
      firstContact: raw.firstContact,
      messages: [raw.message],
      repeatContact: raw.repeatContact,
      referredBy: raw.referredBy,
      mergedFrom: [],
      test: true,
    };
    canonical.push(lead);
    if (phoneN) byPhone.set(phoneN, lead);
    if (emailN) byEmailName.set(`${emailN}|${nameN}`, lead);
  }

  // Name-only candidates: same normalized name, no shared phone or
  // email, both still canonical — flagged, never auto-merged.
  const candidates: Array<Record<string, unknown>> = [];
  for (let i = 0; i < canonical.length; i++) {
    for (let j = i + 1; j < canonical.length; j++) {
      const a = canonical[i];
      const b = canonical[j];
      if (normalizeName(a.name) !== normalizeName(b.name)) continue;
      const sharedPhone = a.phoneNormalized && b.phoneNormalized && a.phoneNormalized === b.phoneNormalized;
      const sharedEmail = a.email && b.email && a.email === b.email;
      if (!sharedPhone && !sharedEmail) {
        candidates.push({
          leadIds: [a.id, b.id],
          reason: 'same normalized name, no shared phone/email — requires human review, NOT auto-merged',
        });
      }
    }
  }

  // Scoring (rule-based) + pipeline stage.
  queue.setStatus(job.id, 'running', null, 'scoring-pipeline');
  const leads = canonical.map((c) => {
    const { score, reasons } = scoreLead(c);
    return {
      id: c.id,
      name: c.name,
      phone: c.phone,
      phoneNormalized: c.phoneNormalized,
      email: c.email,
      channel: c.channel,
      firstContact: c.firstContact,
      score,
      scoreReasons: reasons,
      stage: stageForScore(score),
      mergedFrom: c.mergedFrom,
      test: true,
    };
  });
  const pipeline: Record<string, string[]> = { Prioritas: [], Prospek: [], Nurture: [], Dingin: [] };
  for (const l of leads) pipeline[l.stage].push(l.id);

  // Draft Outreach batch (GTemplate draft, score >= 3 only).
  // WhatsApp drafts carry a manual click-to-chat link (Phase A);
  // all other channels carry text only. Nothing is sent.
  queue.setStatus(job.id, 'running', null, 'outreach-drafts');
  const outreachDrafts = leads
    .filter((l) => l.score >= 3)
    .map((l) => {
      const text = GTEMPLATE_TEXT.replace('{nama}', l.name);
      let waLink: string | null = null;
      if (l.channel === 'WhatsApp' && l.phoneNormalized) {
        const intl = l.phoneNormalized.startsWith('0') ? '62' + l.phoneNormalized.slice(1) : l.phoneNormalized;
        waLink = `https://wa.me/${intl}?text=${encodeURIComponent(text)}`;
      }
      return {
        leadId: l.id,
        leadName: l.name,
        stage: l.stage,
        score: l.score,
        channel: l.channel,
        template: 'GTemplate-v1 (draft, pending Patria approval)',
        text,
        waLink,
        status: 'draft',
        published: false,
        sent: false,
        test: true,
      };
    });

  const out = {
    traceId,
    productId,
    jobId: job.id,
    stages,
    gstpApproval: { gate: gstp.gate, decision: gstp.decision, approver: gstp.approver, source: opts.gstpApprovalPath },
    gkontenApproval: { gate: gkonten.gate, decision: gkonten.decision, approver: gkonten.approver, source: opts.gkontenApprovalPath },
    gtemplateApproval: null,
    gtemplateNote: 'Template Outreach (GTemplate-v1) emitted as a draft for Patria review; approval is Patria-only and is NOT recorded here.',
    gbatchApproved,
    gbatchNote: gbatchApproved
      ? 'GBatch approved elsewhere — this module still sends nothing; drafts stay drafts.'
      : 'GBatch NOT approved (locked) — the batch is draft-only by construction; no send path exists in this module.',
    leadsRaw: FASE4_FIXTURE.map((r) => ({ ...r, test: true })),
    dedupeLog,
    candidates,
    leads,
    pipeline,
    outreachDrafts,
    counts: {
      raw: FASE4_FIXTURE.length,
      deduped: leads.length,
      merged: dedupeLog.length,
      candidates: candidates.length,
      drafts: outreachDrafts.length,
    },
    ledger: ledger.summary(),
    modelCalls: {},
    liveModelCalls: 0,
    scoring: 'rule-based (no model calls; every point traceable to a documented rule)',
    published: false,
    sent: false,
    gateStatus: 'FASE 4 DRAF SAJA — lead ditangkap, didedupe, diskor, dan dipetakan ke pipeline; batch Outreach hanya draf (status draft, TIDAK dipublish, TIDAK dikirim); tidak ada jalur kirim di modul ini.',
  };
  queue.setStatus(job.id, 'done', out, 'done');
  return out;
}
