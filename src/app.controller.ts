import { Controller, Get, Post, Body, Param, Sse, HttpException, HttpStatus } from '@nestjs/common';
import { Observable } from 'rxjs';
import { JobQueue } from './queue';
import { PolicyEngine, GateError } from './policy';
import { CostLedger } from './ledger';

const queue = new JobQueue('data/jobs.sqlite');
const policy = new PolicyEngine();
const ledger = new CostLedger('data/cost-ledger.jsonl', Number(process.env.COST_HARD_LIMIT_USD ?? 5));

@Controller()
export class AppController {
  @Get('health')
  health() {
    return { status: 'ok', phase: '0-foundation', ledger: ledger.summary() };
  }

  @Get('jobs')
  jobs() {
    return queue.list();
  }

  @Get('jobs/:id')
  job(@Param('id') id: string) {
    const j = queue.get(id);
    return j ?? { error: 'not found' };
  }

  @Post('jobs')
  createJob(@Body() body: { productId: string; kind: string; idempotencyKey: string }) {
    const { job, created } = queue.create(body.productId, body.kind, body, body.idempotencyKey);
    return { job, created };
  }

  @Sse('jobs/:id/stream')
  stream(@Param('id') id: string): Observable<{ data: unknown }> {
    return new Observable((subscriber) => {
      subscriber.next({ data: { stage: 'snapshot', job: queue.get(id) } });
      const fn = (j: ReturnType<typeof queue.get>, stage: string) => {
        if (j?.id === id) subscriber.next({ data: { stage, job: j } });
      };
      queue.onProgress(fn);
      return () => queue.offProgress(fn);
    });
  }

  @Post('approvals')
  approval(@Body() body: { gate: 'GS' | 'GSTP' | 'GKonten' | 'GBatch'; productId: string; approver: string; decision: 'approved' | 'rejected' | 'revision_requested' }) {
    // Approvals are explicit records. This endpoint never auto-approves:
    // the caller supplies approver + decision, and the record is stored.
    return policy.approve(body.gate, body.productId, body.approver, body.decision);
  }

  @Post('publish')
  publish(@Body() body: { approvedBatchId?: string | null }) {
    // Service-level gate: publish without an approved batch is rejected
    // with a clean 403, not a 500.
    try {
      policy.requirePublishAllowed(body.approvedBatchId ?? null);
    } catch (e) {
      if (e instanceof GateError) {
        throw new HttpException({ error: e.message }, HttpStatus.FORBIDDEN);
      }
      throw e;
    }
    return { published: true, batch: body.approvedBatchId };
  }
}
