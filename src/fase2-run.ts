/**
 * CLI runner for Phase 2 (calendar + briefs, GKonten pending).
 * Reads model keys from the environment (never printed). Requires
 * docs/fase-1-gstp-approval.json to exist with an approved GSTP.
 * Writes the output to docs/fase-2-output.json.
 * Usage: npm run fase2 (allowMock via FASE2_ALLOW_MOCK=1 for tests)
 */
import * as fs from 'fs';
import { runFase2 } from './fase2';

async function main(): Promise<void> {
  const allowMock = process.env.FASE2_ALLOW_MOCK === '1';
  const out = await runFase2({
    allowMock,
    dataDir: 'data',
    approvalPath: process.env.FASE2_APPROVAL_PATH || 'docs/fase-1-gstp-approval.json',
    researchPath: process.env.FASE2_RESEARCH_PATH || 'docs/fase-1-output.json',
  });
  fs.mkdirSync('docs', { recursive: true });
  fs.writeFileSync('docs/fase-2-output.json', JSON.stringify(out, null, 2));
  console.log(JSON.stringify({
    traceId: out.traceId,
    productId: out.productId,
    calendar: out.calendar,
    briefs: (out.briefs as Array<Record<string, unknown>>).map((b) => ({ itemId: b.itemId, day: b.day, textOverlay: b.textOverlay, channelSizes: b.channelSizes, imageStatus: b.imageStatus })),
    qc: out.qc,
    contentBlocked: out.contentBlocked,
    modelCalls: out.modelCalls,
    gateStatus: out.gateStatus,
  }, null, 2));
}

main().catch((e) => {
  console.error('Fase 2 FAILED:', e instanceof Error ? e.message : String(e));
  process.exit(1);
});
