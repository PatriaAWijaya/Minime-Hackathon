/**
 * CLI runner for Phase 3 (carousel + Postiz DRAFT only).
 * Reads model keys from the environment (never printed). Requires
 * docs/fase-2-gkonten-approval.json (approved GKonten) AND
 * docs/fase-1-gstp-approval.json (approved GSTP).
 * Writes the output to docs/fase-3-output.json.
 * Postiz live drafts happen only when POSTIZ_URL + POSTIZ_API_KEY
 * are set; otherwise drafts are saved with status pending-postiz.
 * Nothing here ever publishes or schedules anything.
 * Usage: npm run fase3 (allowMock via FASE3_ALLOW_MOCK=1 for tests)
 */
import * as fs from 'fs';
import { runFase3 } from './fase3';

async function main(): Promise<void> {
  const allowMock = process.env.FASE3_ALLOW_MOCK === '1';
  const out = await runFase3({
    allowMock,
    dataDir: 'data',
    gkontenApprovalPath: process.env.FASE3_GKONTEN_PATH || 'docs/fase-2-gkonten-approval.json',
    gstpApprovalPath: process.env.FASE3_GSTP_PATH || 'docs/fase-1-gstp-approval.json',
    fase2Path: process.env.FASE3_FASE2_PATH || 'docs/fase-2-output.json',
  });
  fs.mkdirSync('docs', { recursive: true });
  fs.writeFileSync('docs/fase-3-output.json', JSON.stringify(out, null, 2));
  console.log(JSON.stringify({
    traceId: out.traceId,
    productId: out.productId,
    carousels: (out.carousels as Array<Record<string, unknown>>).map((c) => ({ itemId: c.itemId, day: c.day, slides: (c.slides as unknown[]).length })),
    carouselQc: out.carouselQc,
    postizDrafts: (out.postizDrafts as Array<Record<string, unknown>>).map((d) => ({ itemId: d.itemId, status: d.status, draftId: d.draftId })),
    postizLive: out.postizLive,
    published: out.published,
    modelCalls: out.modelCalls,
    gateStatus: out.gateStatus,
  }, null, 2));
}

main().catch((e) => {
  console.error('Fase 3 FAILED:', e instanceof Error ? e.message : String(e));
  process.exit(1);
});
