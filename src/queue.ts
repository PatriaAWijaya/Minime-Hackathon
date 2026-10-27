/**
 * Queue (Phase 0, Block F): SQLite (Node built-in node:sqlite) is the
 * source of truth for jobs. Status survives a process restart because it
 * is read from the DB, not from memory. Idempotency: creating a job with
 * an idempotency key that already exists returns the existing job and
 * creates NO duplicate asset or cost. Progress is emitted via a simple
 * listener list that the HTTP layer turns into SSE.
 */
import { DatabaseSync } from 'node:sqlite';
import * as fs from 'fs';
import * as path from 'path';

export type JobStatus = 'queued' | 'running' | 'done' | 'failed' | 'waiting_gate';

export interface Job {
  id: string;
  productId: string;
  kind: string;
  status: JobStatus;
  idempotencyKey: string;
  payload: string;
  result: string | null;
  createdAt: string;
  updatedAt: string;
}

export class JobQueue {
  private db: DatabaseSync;
  private listeners: Array<(job: Job, stage: string) => void> = [];

  constructor(file: string) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec(
      `CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY, productId TEXT, kind TEXT, status TEXT,
        idempotencyKey TEXT UNIQUE, payload TEXT, result TEXT,
        createdAt TEXT, updatedAt TEXT
      )`,
    );
  }

  onProgress(fn: (job: Job, stage: string) => void): void {
    this.listeners.push(fn);
  }

  offProgress(fn: (job: Job, stage: string) => void): void {
    this.listeners = this.listeners.filter((f) => f !== fn);
  }

  private emit(job: Job, stage: string): void {
    for (const fn of this.listeners) fn(job, stage);
  }

  private rowToJob(row: Record<string, unknown>): Job {
    return row as unknown as Job;
  }

  create(productId: string, kind: string, payload: Record<string, unknown>, idempotencyKey: string): { job: Job; created: boolean } {
    const existing = this.db.prepare('SELECT * FROM jobs WHERE idempotencyKey = ?').get(idempotencyKey) as Record<string, unknown> | undefined;
    if (existing) return { job: this.rowToJob(existing), created: false };
    const now = new Date().toISOString();
    const id = `job-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    this.db.prepare('INSERT INTO jobs VALUES (?,?,?,?,?,?,?,?,?)').run(id, productId, kind, 'queued', idempotencyKey, JSON.stringify(payload), null, now, now);
    const job = this.get(id) as Job;
    this.emit(job, 'queued');
    return { job, created: true };
  }

  get(id: string): Job | null {
    const row = this.db.prepare('SELECT * FROM jobs WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return row ? this.rowToJob(row) : null;
  }

  setStatus(id: string, status: JobStatus, result: Record<string, unknown> | null = null, stage?: string): Job {
    const now = new Date().toISOString();
    this.db.prepare('UPDATE jobs SET status = ?, result = ?, updatedAt = ? WHERE id = ?').run(
      status,
      result ? JSON.stringify(result) : null,
      now,
      id,
    );
    const job = this.get(id) as Job;
    this.emit(job, stage ?? status);
    return job;
  }

  list(productId?: string): Job[] {
    const rows = productId
      ? (this.db.prepare('SELECT * FROM jobs WHERE productId = ? ORDER BY createdAt').all(productId) as Record<string, unknown>[])
      : (this.db.prepare('SELECT * FROM jobs ORDER BY createdAt').all() as Record<string, unknown>[]);
    return rows.map((r) => this.rowToJob(r));
  }
}
