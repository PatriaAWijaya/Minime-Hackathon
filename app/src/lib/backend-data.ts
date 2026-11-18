// Campaign + Kanban data — TANPA data bawaan.
// 19 Nov 2026 (A2, perintah Patria): kopiKanban() dan campaignPipeline()
// DIHAPUS — dead code, tidak ada pemanggil (grep menyeluruh app/src dan
// app/src-tauri/src hanya menemukan definisinya). Impor artefak Fase 1/2/3
// (docs/fase-1-output.json, fase-2-output.json, fase-3-output.json,
// fase-3-postiz-drafts.json) + GATES + tr ikut dihapus karena hanya dipakai
// fungsi mati itu; label i18n kb.label.* dihapus dari i18n.ts (id/en/zh).
// File docs/* tidak disentuh (arsip).
// 19 Nov 2026: data TEST Fase 4 (12 raw TEST leads -> 10 deduped,
// TEST Kopi Surabaya, fiksi) DIHAPUS dari app atas perintah Patria —
// Campaign mulai kosong; lead hanya dari yang ditambah pengguna sendiri
// (localStorage).

export interface KanbanCard {
  t: string;
  a: string;
  c: number;
}

export interface CampaignLead {
  id: string;
  name: string;
  channel: string;
  score: number;
  stage: string;
}

export interface CampaignDraft {
  leadId: string;
  leadName: string;
  stage: string;
  score: number;
  channel: string;
  text: string;
  waLink: string | null;
}

export function campaignCounts(): { raw: number; deduped: number; merged: number; candidates: number; drafts: number } {
  return { raw: 0, deduped: 0, merged: 0, candidates: 0, drafts: 0 };
}

export function campaignLeads(): CampaignLead[] {
  return [];
}

export function campaignDrafts(): CampaignDraft[] {
  return [];
}
