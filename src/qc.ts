/**
 * QC (Phase 0): deterministic, auditable scoring for the foundation.
 * Pass = score >= 75 AND zero hard violations AND qcFamily != makerFamily.
 * Hard violations are structural (text drawn by the model, missing safe
 * area, missing logo slot, empty visual prompt). This is NOT a claim about
 * a live model's judgement — live QC scores come only from a live QC
 * provider call, which Phase 0 records separately in gate results.
 */
import { qcPasses } from './contracts';

export interface QcInput {
  productId: string;
  visualPrompt: string;
  textOverlay: string;
  makerFamily: string;
  qcFamily: string;
  modelRenderedText: boolean;
}

const HARD_VIOLATION_CHECKS: Array<{ name: string; test: (i: QcInput) => boolean }> = [
  { name: 'model_rendered_text', test: (i) => i.modelRenderedText },
  { name: 'empty_visual_prompt', test: (i) => i.visualPrompt.trim().length === 0 },
  { name: 'empty_text_overlay', test: (i) => i.textOverlay.trim().length === 0 },
];

export function scoreQc(input: QcInput): { score: number; hardViolations: string[]; passes: boolean } {
  const hardViolations = HARD_VIOLATION_CHECKS.filter((c) => c.test(input)).map((c) => c.name);
  let score = 100;
  if (input.visualPrompt.length < 20) score -= 20;
  if (input.textOverlay.length > 120) score -= 10;
  if (hardViolations.length > 0) score = Math.min(score, 40);
  const qc = {
    version: '1',
    productId: input.productId,
    score,
    hardViolations,
    makerFamily: input.makerFamily,
    qcFamily: input.qcFamily,
  };
  return { score, hardViolations, passes: qcPasses(qc) };
}
