/**
 * CLI runner for Phase 4 (Form -> CRM Leads, draft Outreach only).
 * Requires docs/fase-1-gstp-approval.json (approved GSTP) AND
 * docs/fase-2-gkonten-approval.json (approved GKonten).
 * Writes the output to docs/fase-4-output.json.
 * Nothing here ever sends, publishes, or schedules anything:
 * Outreach output is draft records only.
 * Usage: npm run fase4
 */
import * as fs from 'fs';
import { runFase4 } from './fase4';

async function main(): Promise<void> {
  const out = await runFase4({
    dataDir: 'data',
    gkontenApprovalPath: process.env.FASE4_GKONTEN_PATH || 'docs/fase-2-gkonten-approval.json',
    gstpApprovalPath: process.env.FASE4_GSTP_PATH || 'docs/fase-1-gstp-approval.json',
  });
  fs.mkdirSync('docs', { recursive: true });
  fs.writeFileSync('docs/fase-4-output.json', JSON.stringify(out, null, 2));
  console.log(JSON.stringify({
    traceId: out.traceId,
    productId: out.productId,
    counts: out.counts,
    dedupeLog: out.dedupeLog,
    candidates: out.candidates,
    pipeline: out.pipeline,
    outreachDrafts: (out.outreachDrafts as Array<Record<string, unknown>>).map((d) => ({ leadId: d.leadId, stage: d.stage, status: d.status, published: d.published, sent: d.sent })),
    gtemplateApproval: out.gtemplateApproval,
    gbatchApproved: out.gbatchApproved,
    published: out.published,
    sent: out.sent,
    liveModelCalls: out.liveModelCalls,
    gateStatus: out.gateStatus,
  }, null, 2));
}

main().catch((e) => {
  console.error('Fase 4 FAILED:', e instanceof Error ? e.message : String(e));
  process.exit(1);
});
