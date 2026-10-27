/**
 * Contract schemas v1 (Phase 0, Block B).
 * Every contract is versioned and machine-validated. No contract carries
 * credentials, keys, or tokens. Validation is intentionally strict and
 * dependency-free so the gate can run without a model call.
 */
export type ContractName =
  | 'ProductBrief'
  | 'Research'
  | 'Strategy'
  | 'STP'
  | 'CreativeBrief'
  | 'QC';

export interface ContractField {
  name: string;
  type: 'string' | 'number' | 'string[]' | 'object';
  required: boolean;
}

export const CONTRACT_VERSION = '1';

export const CONTRACT_SCHEMAS: Record<ContractName, ContractField[]> = {
  ProductBrief: [
    { name: 'version', type: 'string', required: true },
    { name: 'productId', type: 'string', required: true },
    { name: 'productName', type: 'string', required: true },
    { name: 'audience', type: 'string', required: true },
    { name: 'problem', type: 'string', required: true },
    { name: 'offer', type: 'string', required: true },
  ],
  Research: [
    { name: 'version', type: 'string', required: true },
    { name: 'productId', type: 'string', required: true },
    { name: 'facts', type: 'string[]', required: true },
    { name: 'assumptions', type: 'string[]', required: true },
    { name: 'sources', type: 'string[]', required: true },
  ],
  Strategy: [
    { name: 'version', type: 'string', required: true },
    { name: 'productId', type: 'string', required: true },
    { name: 'positioning', type: 'string', required: true },
    { name: 'pillars', type: 'string[]', required: true },
  ],
  STP: [
    { name: 'version', type: 'string', required: true },
    { name: 'productId', type: 'string', required: true },
    { name: 'segment', type: 'string', required: true },
    { name: 'targeting', type: 'string', required: true },
    { name: 'positioning', type: 'string', required: true },
    { name: 'status', type: 'string', required: true },
  ],
  CreativeBrief: [
    { name: 'version', type: 'string', required: true },
    { name: 'productId', type: 'string', required: true },
    { name: 'itemId', type: 'string', required: true },
    { name: 'visualPrompt', type: 'string', required: true },
    { name: 'textOverlay', type: 'string', required: true },
    { name: 'channelSizes', type: 'string[]', required: true },
  ],
  QC: [
    { name: 'version', type: 'string', required: true },
    { name: 'productId', type: 'string', required: true },
    { name: 'score', type: 'number', required: true },
    { name: 'hardViolations', type: 'string[]', required: true },
    { name: 'makerFamily', type: 'string', required: true },
    { name: 'qcFamily', type: 'string', required: true },
  ],
};

function typeOf(v: unknown): string {
  if (Array.isArray(v)) return 'string[]';
  return typeof v;
}

export function validateContract(
  name: ContractName,
  payload: Record<string, unknown>,
): string[] {
  const errors: string[] = [];
  const schema = CONTRACT_SCHEMAS[name];
  for (const f of schema) {
    const v = payload[f.name];
    if (f.required && (v === undefined || v === null || v === '')) {
      errors.push(`missing required field: ${f.name}`);
      continue;
    }
    if (v !== undefined && typeOf(v) !== f.type) {
      errors.push(`field ${f.name} must be ${f.type}, got ${typeOf(v)}`);
    }
    if (f.name === 'version' && v !== CONTRACT_VERSION) {
      errors.push(`version must be ${CONTRACT_VERSION}, got ${String(v)}`);
    }
  }
  if (name === 'STP' && payload.status !== undefined) {
    const ok = ['draft', 'approved', 'rejected'];
    if (!ok.includes(String(payload.status))) {
      errors.push(`STP.status must be one of ${ok.join(', ')}`);
    }
  }
  if (name === 'QC' && typeof payload.score === 'number') {
    if (payload.score < 0 || payload.score > 100) {
      errors.push('QC.score must be 0..100');
    }
    if (payload.makerFamily === payload.qcFamily) {
      errors.push('QC family must differ from maker family');
    }
  }
  return errors;
}

export function qcPasses(qc: Record<string, unknown>): boolean {
  return (
    typeof qc.score === 'number' &&
    qc.score >= 75 &&
    Array.isArray(qc.hardViolations) &&
    qc.hardViolations.length === 0 &&
    qc.makerFamily !== qc.qcFamily
  );
}
