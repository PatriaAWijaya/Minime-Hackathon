// B3 — gate state mirror + guard for the UI.
//
// Mirrors the real approval records (append-only, in docs/):
//   GSTP    docs/fase-1-gstp-approval.json    approved 27 Okt 2026 12:04 WIB
//   GKonten docs/fase-2-gkonten-approval.json approved 27 Okt 2026 13:06 WIB
//   GBatch  (live sending)                    NOT approved -> distribution locked
// This is a UI mirror, not the live source of truth (that remains the
// approval records + PolicyEngine server-side). B4 replaces this mirror
// with live data. Draft paths are deliberately NOT locked: canon says
// distribution defaults to DRAFT-only, and drafts need no GBatch.
//
// Exposed on window as __gates for console debugging and the jsdom
// parity rig; gate state itself is not secret.
import { tr } from './i18n.js';

export type GateId = 'GSTP' | 'GKonten' | 'GBatch';

export interface GateState {
  approved: boolean;
  trace?: string;
  record?: string;
  note: string;
}

export const GATES: Record<GateId, GateState> = {
  GSTP: {
    approved: true,
    trace: 'trace-fase1-1793077341157',
    record: 'docs/fase-1-gstp-approval.json',
    note: 'Disetujui Patria 27 Okt 2026 12:04 WIB',
  },
  GKonten: {
    approved: true,
    trace: 'trace-fase2-1793077740478',
    record: 'docs/fase-2-gkonten-approval.json',
    note: 'Disetujui Patria 27 Okt 2026 13:06 WIB',
  },
  GBatch: {
    approved: false,
    note: 'Belum disetujui — distribusi live terkunci',
  },
};

/** Guard every future send path must call. Returns true only if approved. */
export function requireGate(gate: GateId): boolean {
  return GATES[gate].approved;
}

function gateRow(gate: GateId): string {
  const g = GATES[gate];
  const badge = g.approved
    ? '<span class="badge b-ok">' + tr('gate.ok') + '</span>'
    : '<span class="badge b-wait">' + tr('gate.wait') + '</span>';
  const ref = g.trace ? ' (' + g.trace + ')' : '';
  const key = gate.toLowerCase();
  return '<div>' + badge + ' <b>' + tr('gate.' + key) + '</b> — ' + tr('gate.note.' + key) + ref + '</div>';
}

export function gateStatusHtml(): string {
  return (
    '<div class="notice gate-status"><b>' + tr('gate.title') + '</b><br>' +
    gateRow('GSTP') +
    gateRow('GKonten') +
    gateRow('GBatch') +
    '<div>' + tr('gate.mode') + '</div></div>'
  );
}

/** Inject the gate status into Planner + Settings views. Idempotent. */
export function applyGateStatus(): void {
  const planner = document.querySelector('#view-planner .scroll');
  if (planner && !planner.querySelector('.gate-status')) {
    planner.insertAdjacentHTML('afterbegin', gateStatusHtml());
  }
  // Language-proof anchor: the Gerbang h3 carries id="gateHead" (B7),
  // so the finder never depends on the translated heading text.
  const gerbang = document.getElementById('gateHead');
  if (gerbang && gerbang.parentElement && !gerbang.parentElement.querySelector('.gate-status')) {
    gerbang.insertAdjacentHTML('afterend', gateStatusHtml());
  }
  const w = window as unknown as Record<string, unknown>;
  w.__gates = { GATES, requireGate };
}
