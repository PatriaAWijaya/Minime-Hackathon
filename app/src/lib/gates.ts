// B3 — gate guard state for the UI.
//
// The approval records (append-only, in docs/) remain the source of
// truth; PolicyEngine enforces gates server-side. This module only
// holds the guard state the UI send paths must check:
//   GSTP    docs/fase-1-gstp-approval.json    approved 27 Okt 2026 12:04 WIB
//   GKonten docs/fase-2-gkonten-approval.json approved 27 Okt 2026 13:06 WIB
//   GBatch  (live sending)                    NO GENERAL APPROVAL — see note below
// The gate status DISPLAY was removed 28 Okt 2026 on Patria's order
// (no gate-status panel in Planner or Settings); the guard itself
// stays: draft paths need no GBatch, live sending stays locked
// until Patria approves GBatch.

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
    // approved:false = tidak ada persetujuan live-send UMUM. Langkah
    // jadwal batch TEROTORISASI TERPISAH (perintah Patria 28 Okt +
    // double-confirm di batch-flow) dan TIDAK melewati requireGate —
    // jangan baca flag ini sebagai blokir atas langkah tersebut.
    approved: false,
    note: 'Tanpa persetujuan live-send umum; jadwal batch terotorisasi terpisah (perintah Patria 28 Okt + double-confirm)',
  },
};

/** Guard every future send path must call. Returns true only if approved.
 *  NOTE: the batch scheduler does NOT call this (its gate is Patria's
 *  explicit order + double-confirm); do not read GBatch.approved=false
 *  as blocking that authorized step. */
export function requireGate(gate: GateId): boolean {
  return GATES[gate].approved;
}
