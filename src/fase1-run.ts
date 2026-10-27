/**
 * CLI runner for Phase 1 (draft only). Reads model keys from the
 * environment (never from this file, never printed). Writes the draft
 * output to docs/fase-1-output.json. Exits non-zero on any failure so
 * a failed run is never mistaken for a draft.
 * Usage: npm run fase1  (allowMock via FASE1_ALLOW_MOCK=1 for tests)
 */
import * as fs from 'fs';
import { runFase1 } from './fase1';

async function main(): Promise<void> {
  const allowMock = process.env.FASE1_ALLOW_MOCK === '1';
  const out = await runFase1({ allowMock, dataDir: 'data' });
  fs.mkdirSync('docs', { recursive: true });
  fs.writeFileSync('docs/fase-1-output.json', JSON.stringify(out, null, 2));
  console.log(JSON.stringify({
    traceId: out.traceId,
    productId: out.productId,
    stp: out.stp,
    approvals: out.approvals,
    productionBlocked: out.productionBlocked,
    modelCalls: out.modelCalls,
    gateStatus: out.gateStatus,
  }, null, 2));
}

main().catch((e) => {
  console.error('Fase 1 FAILED:', e instanceof Error ? e.message : String(e));
  process.exit(1);
});
