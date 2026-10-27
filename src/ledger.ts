/**
 * CostLedger (Phase 0, Block D): append-only JSONL ledger.
 * Records are never edited or deleted by this code. A hard limit is
 * enforced BEFORE a run may record a new costed call: if the projected
 * total would exceed the limit, the call is refused with CostLimitError.
 * The SOURCE unit is USD (providers bill in USD — that cannot be
 * changed), but the REPORTING unit is IDR wherever possible (standing
 * rule, Patria 27 Oct 2026): every record carries costIdr, converted
 * at the ledger's usdIdrRate, and summary() reports totalIdr first.
 * When no rate is set, costIdr/totalIdr are null — never guessed.
 * Mock calls record cost 0 (Rp0) and are flagged mock=true so no mock
 * figure can ever be reported as a measured live cost.
 */
import * as fs from 'fs';
import * as path from 'path';
import { parseUsdIdrRate, toIdr } from './currency';

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
  /** IDR equivalent at the ledger's rate; null when rate or cost is unknown. */
  costIdr: number | null;
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
  /** IDR per USD at conversion time; null = rate not set, no conversion. */
  readonly usdIdrRate: number | null;

  constructor(file: string, hardLimit: number, usdIdrRate?: number | null) {
    this.file = file;
    this.hardLimit = hardLimit;
    // undefined = read from env; explicit null = no rate on purpose.
    this.usdIdrRate = usdIdrRate === undefined ? parseUsdIdrRate(process.env) : usdIdrRate;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (!fs.existsSync(file)) fs.writeFileSync(file, '');
  }

  append(record: CostRecord): void {
    const total = this.totalUsd();
    const next = total + (record.costUsd ?? 0);
    if (this.hardLimit > 0 && next > this.hardLimit) {
      throw new CostLimitError(this.hardLimit, next);
    }
    // Fill the IDR side at the ledger's rate; a record written without
    // a rate keeps costIdr null rather than a guessed conversion.
    // Mock records cost 0 in both currencies.
    const withIdr: CostRecord = {
      ...record,
      costIdr: record.mock ? 0 : toIdr(record.costUsd, this.usdIdrRate),
    };
    fs.appendFileSync(this.file, JSON.stringify(withIdr) + '\n');
  }

  all(): CostRecord[] {
    const raw = fs.readFileSync(this.file, 'utf8').trim();
    if (!raw) return [];
    return raw.split('\n').map((l) => {
      const r = JSON.parse(l) as CostRecord;
      // Back-compat: records written before the IDR rule get their
      // conversion computed on read when a rate is available.
      if (r.costIdr === undefined) {
        r.costIdr = r.mock ? 0 : toIdr(r.costUsd, this.usdIdrRate);
      }
      return r;
    });
  }

  totalUsd(): number {
    return this.all().reduce((s, r) => s + (r.costUsd ?? 0), 0);
  }

  /** Total in IDR, or null when any non-mock record lacks a conversion. */
  totalIdr(): number | null {
    if (this.usdIdrRate === null) return null;
    let sum = 0;
    for (const r of this.all()) {
      if (r.costIdr === null || r.costIdr === undefined) return null;
      sum += r.costIdr;
    }
    return Math.round(sum * 100) / 100;
  }

  summary(): {
    records: number;
    totalUsd: number;
    totalIdr: number | null;
    usdIdrRate: number | null;
    hardLimitIdr: number | null;
    mockRecords: number;
  } {
    const all = this.all();
    return {
      records: all.length,
      totalUsd: this.totalUsd(),
      totalIdr: this.totalIdr(),
      usdIdrRate: this.usdIdrRate,
      hardLimitIdr: this.hardLimit > 0 ? toIdr(this.hardLimit, this.usdIdrRate) : null,
      mockRecords: all.filter((r) => r.mock).length,
    };
  }
}
