/**
 * CLI runner for Phase 5 (eval harness + dress rehearsal).
 * Reads the golden set JSON, runs every case + the rehearsal, writes
 * docs/fase-5-output.json. Exits 0 when the harness completed (results
 * recorded, including per-case failures); non-zero only when the
 * harness itself crashed. Live Meta calls use META_API_KEY from the
 * environment (the custom.meta surrogate pattern — never a raw key).
 * Live Gemini calls go through the custom.legacy-gemini generate.py
 * (auth handled inside that helper, never via env).
 * Usage: npm run fase5  (FASE5_ALLOW_MOCK=1 for the structure proof)
 */
import * as fs from 'fs';
import { runFase5, type GoldenCase } from './fase5';

async function main(): Promise<void> {
  const allowMock = process.env.FASE5_ALLOW_MOCK === '1';
  const goldenPath = process.env.FASE5_GOLDEN_PATH || 'docs/fase-5-golden-set.json';
  const outPath = process.env.FASE5_OUT || 'docs/fase-5-output.json';
  const dataDir = process.env.FASE5_DATA_DIR || 'data/fase5';
  const hardLimitUsd = Number(process.env.COST_HARD_LIMIT_USD ?? 5);
  const geminiScript =
    process.env.FASE5_GEMINI_SCRIPT ||
    '/home/hatch/workspace/custom-connectors/custom.legacy-gemini/bin/generate.py';

  const cases = JSON.parse(fs.readFileSync(goldenPath, 'utf8')) as GoldenCase[];
  if (!Array.isArray(cases) || cases.length === 0) {
    throw new Error(`golden set kosong atau bukan array: ${goldenPath}`);
  }
  fs.mkdirSync('docs', { recursive: true });
  const out = await runFase5({ cases, allowMock, dataDir, hardLimitUsd, geminiScript });
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  const m = out.metrics as {
    casesTotal: number;
    casesSuccess: number;
    ledger: { totalUsd: number; totalIdr: number | null; records: number };
    reconciliation: { match: boolean; mockContamination: boolean };
  };
  console.log(JSON.stringify({
    traceId: out.traceId,
    cases: `${m.casesSuccess}/${m.casesTotal} sukses`,
    ledgerTotalUsd: m.ledger.totalUsd,
    ledgerTotalIdr: m.ledger.totalIdr,
    ledgerRecords: m.ledger.records,
    reconciliationMatch: m.reconciliation.match,
    mockContamination: m.reconciliation.mockContamination,
    rehearsalOk: (out.rehearsal as { ok?: boolean }).ok,
    outPath,
  }, null, 2));
}

main().catch((e) => {
  console.error('Fase 5 FAILED:', e instanceof Error ? e.message : String(e));
  process.exit(1);
});
