/**
 * Policy Engine (Phase 0, Block E): gates enforced at service level.
 * - GS: a Strategy may only be marked approved by an explicit approval.
 * - GSTP: production (CreativeBrief / image work) requires an approved STP.
 * - GKonten: an item may only enter a distribution draft after GKonten approval.
 * - Approvals are append-only: a revision creates a NEW approval record;
 *   an existing record is never edited.
 * - publish/outreach without an approved_batch_id is rejected here, not
 *   merely hidden in the UI.
 */
export type Gate = 'GS' | 'GSTP' | 'GKonten' | 'GBatch';

export interface Approval {
  id: string;
  gate: Gate;
  productId: string;
  decision: 'approved' | 'rejected' | 'revision_requested';
  approver: string;
  reason: string | null;
  createdAt: string;
  supersedesId: string | null;
}

export class GateError extends Error {
  constructor(gate: Gate, detail: string) {
    super(`gate ${gate} blocked: ${detail}`);
    this.name = 'GateError';
  }
}

export class PolicyEngine {
  private approvals: Approval[] = [];

  approve(
    gate: Gate,
    productId: string,
    approver: string,
    decision: Approval['decision'],
    reason: string | null = null,
    supersedesId: string | null = null,
  ): Approval {
    const rec: Approval = {
      id: `appr-${Date.now()}-${this.approvals.length + 1}`,
      gate,
      productId,
      decision,
      approver,
      reason,
      createdAt: new Date().toISOString(),
      supersedesId,
    };
    this.approvals.push(rec);
    return rec;
  }

  isApproved(gate: Gate, productId: string): boolean {
    return this.approvals.some(
      (a) => a.gate === gate && a.productId === productId && a.decision === 'approved',
    );
  }

  /** Production requires GSTP. Throws GateError otherwise. */
  requireProductionAllowed(productId: string): void {
    if (!this.isApproved('GSTP', productId)) {
      throw new GateError('GSTP', `no approved STP for product ${productId}`);
    }
  }

  /** Distribution draft requires GKonten. */
  requireContentAllowed(productId: string): void {
    if (!this.isApproved('GKonten', productId)) {
      throw new GateError('GKonten', `no approved content for product ${productId}`);
    }
  }

  /** Any publish/send requires an approved batch id. */
  requirePublishAllowed(approvedBatchId: string | null | undefined): void {
    if (!approvedBatchId) {
      throw new GateError('GBatch', 'publish requires approved_batch_id');
    }
    if (!this.approvals.some((a) => a.id === approvedBatchId && a.gate === 'GBatch' && a.decision === 'approved')) {
      throw new GateError('GBatch', `batch ${approvedBatchId} is not an approved batch`);
    }
  }

  all(): Approval[] {
    return [...this.approvals];
  }
}
