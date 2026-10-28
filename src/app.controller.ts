import { Controller, Get, Post, Body, Param, Sse } from '@nestjs/common';
import { Observable } from 'rxjs';
import { JobQueue } from './queue';
import { CostLedger } from './ledger';

const queue = new JobQueue('data/jobs.sqlite');
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

  // NOTE (audit 28 Okt 2026): endpoint POST /approvals dan POST /publish
  // DIHAPUS. /publish membalas {published:true} tanpa mengirim apa pun
  // (sukses palsu, melanggar rule no.6), dan /approvals membiarkan
  // caller menyetujui batch-nya sendiri tanpa autentikasi. Approval
  // yang sah hanya dari file JSON (docs/fase-*-approval.json) yang
  // divalidasi runner, dan satu-satunya jalur live adalah scheduler
  // batch di app (perintah Patria + double-confirm). Server ini hanya
  // menyisakan health + jobs (queue-backed, nyata).
}
