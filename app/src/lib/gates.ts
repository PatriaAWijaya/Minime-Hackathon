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

function gateRow(gate: GateId, label: string): string {
  const g = GATES[gate];
  const badge = g.approved
    ? '<span class="badge b-ok">LOLOS</span>'
    : '<span class="badge b-wait">BELUM</span>';
  const ref = g.trace ? ' (' + g.trace + ')' : '';
  return '<div>' + badge + ' <b>' + label + '</b> — ' + g.note + ref + '</div>';
}

export function gateStatusHtml(): string {
  return (
    '<div class="notice gate-status"><b>Status gerbang (cermin record approval):</b><br>' +
    gateRow('GSTP', 'GSTP — STP') +
    gateRow('GKonten', 'GKonten — kalender + brief') +
    gateRow('GBatch', 'GBatch — kirim live') +
    '<div>Mode distribusi: DRAF saja (default kanon). Tidak ada tombol terbit live di slice ini.</div></div>'
  );
}

/** Inject the gate status into Planner + Settings views. Idempotent. */
export function applyGateStatus(): void {
  const planner = document.querySelector('#view-planner .scroll');
  if (planner && !planner.querySelector('.gate-status')) {
    planner.insertAdjacentHTML('afterbegin', gateStatusHtml());
  }
  const gerbang = Array.from(document.querySelectorAll('#view-settings h3')).find(
    (h) => (h.textContent || '').indexOf('Gerbang') !== -1,
  );
  if (gerbang && gerbang.parentElement && !gerbang.parentElement.querySelector('.gate-status')) {
    gerbang.insertAdjacentHTML('afterend', gateStatusHtml());
  }
  const w = window as unknown as Record<string, unknown>;
  w.__gates = { GATES, requireGate };
}
