import 'reflect-metadata';
import * as fs from 'fs';
import { runSample } from './pipeline';

/**
 * Sample runner. By default it uses the labelled mock provider
 * (MOCK_SAMPLE=1) so the structure can be proven without a live key.
 * Set MOCK_SAMPLE=0 to attempt the live chain — it will fail visibly
 * when no live provider is configured, which is the honest outcome
 * until Patria's claim/card and Ollama are ready.
 */
async function main() {
  const allowMock = process.env.MOCK_SAMPLE !== '0';
  const out = await runSample({ allowMock, humanApprover: 'phase-0-test-harness (TEST product only)', dataDir: 'data' });
  fs.mkdirSync('docs', { recursive: true });
  fs.writeFileSync('docs/fase-0-sample-output.json', JSON.stringify(out, null, 2));
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(out, null, 2));
}
main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
