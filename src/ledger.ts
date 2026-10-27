/**
 * CostLedger (Phase 0, Block D): append-only JSONL ledger.
 * Records are never edited or deleted by this code. A hard limit is
 * enforced BEFORE a run may record a new costed call: if the projected
 * total would exceed the limit, the call is refused with CostLimitError.
 * Cost units are USD. Mock calls record cost 0 and are flagged mock=true
 * so no mock figure can ever be reported as a measured live cost.
 */
import * as fs from 'fs';
import * as path from 'path';

export interface CostRecord {
  traceId: string;
  timestamp: string;
  agent: string;
  provider: 'meta' | 'gemini' | 'ollama' | 'mock';
  family: 'meta' | 'gemini' | 'deepseek' | 'qwen' | 'mock';
  model: string;
  promptTokens: number | null;
  completionTokens: number | null;
  costUsd: number | null;
  mock: boolean;
  fallbackFrom: string | null;
}

export class CostLimitError extends Error {
  constructor(limit: number, total: number) {
    super(`cost hard limit exceeded: limit ${limit}, projected total ${total}`);
    this.name = 'CostLimitError';
  }
}

export class CostLedger {
  private file: string;
  private hardLimit: number;

  constructor(file: string, hardLimit: number) {
    this.file = file;
    this.hardLimit = hardLimit;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (!fs.existsSync(file)) fs.writeFileSync(file, '');
  }

  append(record: CostRecord): void {
    const total = this.totalUsd();
    const next = total + (record.costUsd ?? 0);
    if (this.hardLimit > 0 && next > this.hardLimit) {
      throw new CostLimitError(this.hardLimit, next);
    }
    fs.appendFileSync(this.file, JSON.stringify(record) + '\n');
  }

  all(): CostRecord[] {
    const raw = fs.readFileSync(this.file, 'utf8').trim();
    if (!raw) return [];
    return raw.split('\n').map((l) => JSON.parse(l) as CostRecord);
  }

  totalUsd(): number {
    return this.all().reduce((s, r) => s + (r.costUsd ?? 0), 0);
  }

  summary(): { records: number; totalUsd: number; mockRecords: number } {
    const all = this.all();
    return {
      records: all.length,
      totalUsd: this.totalUsd(),
      mockRecords: all.filter((r) => r.mock).length,
    };
  }
}
