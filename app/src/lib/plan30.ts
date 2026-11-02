// Rencana 30 hari Skenario 2 (v207): store + Tahap 0/1/2.
// Satu rencana aktif (bukan banyak): panel menampilkan rencana aktif;
// "Rencana Baru" (dua ketuk, pola armed) mereset ke form kosong.
// Urutan tahap: Masuk (niche/kompetitor/tanggal) -> Riset live (v206)
// -> Tabel 30 baris (agen Strategi) -> Gerbang 1 (Setujui Rencana).
// Naskah/visual/caption/batch menyusul di versi berikutnya dan HANYA
// jalan sesudah gerbang 1 lolos (tombol tahap berikut nonaktif).

import { tr, getLang, MODEL_LANG_INSTRUCTION } from './i18n.js';
import { ModelRouter, defaultRouterConfig } from '../../../src/router';
import { readKeys, QC_INSTRUCTION, parseQcVerdict } from './chat.js';
import { recordLiveCost } from './cost.js';
import { researchRun } from './research-browser.js';
import { esc } from './esc.js';

export type PlanFormat = 'image' | 'carousel' | 'reels';
export type ScriptState = 'empty' | 'ok' | 'revised' | 'flagged' | 'failed' | 'edited';
export type PlanRow = {
  day: number; date: string; format: PlanFormat;
  topic: string; hook: string; pillar: string; hour: string;
  script: string; scriptState: ScriptState; qcNote: string;
};
export type Plan30 = {
  niche: string; competitors: string; startDate: string;
  researchReport: string; researchDone: boolean; researchGrounded: boolean;
  rows: PlanRow[]; approved: boolean; scriptsApproved: boolean;
};
export const PLAN_MIX: Record<PlanFormat, number> = { image: 12, carousel: 10, reels: 8 };
const PLAN_LS = 'minime.plan30';

export function loadPlan(): Plan30 {
  try {
    const raw = localStorage.getItem(PLAN_LS);
    if (raw) {
      const p = JSON.parse(raw) as Plan30;
      if (p && typeof p.niche === 'string' && Array.isArray(p.rows)) {
      p.rows = p.rows.map((r: Record<string, unknown>) => ({
        day: r.day, date: r.date, format: r.format, topic: r.topic,
        hook: r.hook, pillar: r.pillar, hour: r.hour,
        script: typeof r.script === 'string' ? r.script : '',
        scriptState: ['ok', 'revised', 'flagged', 'failed', 'edited'].includes(String(r.scriptState)) ? (r.scriptState as ScriptState) : 'empty',
        qcNote: typeof r.qcNote === 'string' ? r.qcNote : '',
      })) as PlanRow[];
      if (typeof p.scriptsApproved !== 'boolean') p.scriptsApproved = false;
      return p;
    }
    }
  } catch { /* abaikan: kembali ke rencana kosong */ }
  return {
    niche: '', competitors: '', startDate: '',
    researchReport: '', researchDone: false, researchGrounded: false,
    rows: [], approved: false, scriptsApproved: false,
  };
}

function savePlan(p: Plan30): void {
  try { localStorage.setItem(PLAN_LS, JSON.stringify(p)); } catch { /* abaikan */ }
}

/// Tanggal + jam WIB (HH:MM) -> ISO UTC (WIB = UTC+7).
export function planDateISO(start: string, day: number, hour: string): string {
  const [y, m, d] = start.split('-').map(Number);
  const [hh, mm] = hour.split(':').map(Number);
  const t = Date.UTC(y, (m || 1) - 1, d || 1, (hh || 0) - 7, mm || 0, 0) + (day - 1) * 86400000;
  return new Date(t).toISOString();
}

/// Parse tabel model: baris HARI|FORMAT|TOPIK|HOOK|PILAR|JAM.
/// Hanya baris yang cocok yang dibaca (prosa di luar tabel diabaikan).
/// Validasi keras: 30 baris, hari 1..30 masing-masing sekali, campuran
/// tepat 12/10/8, jam HH:MM valid, topik tak kosong. Hook/pilar boleh
/// kosong (dirender '—', ditangkap mata manusia di gerbang 1).
export function parsePlanTable(text: string): { rows: PlanRow[]; error: string } {
  const rows: PlanRow[] = [];
  const seen = new Set<number>();
  for (const line of text.split('\n')) {
    const m = line.trim().match(/^(\d{1,2})\|(image|carousel|reels)\|([^|]*)\|([^|]*)\|([^|]*)\|(\d{1,2}:\d{2})\s*$/);
    if (!m) continue;
    const day = Number(m[1]);
    const hour = m[6];
    const [hh, mm] = hour.split(':').map(Number);
    if (day < 1 || day > 30 || seen.has(day) || hh > 23 || mm > 59 || !m[3].trim()) {
      return { rows: [], error: tr('p30.err_parse') };
    }
    seen.add(day);
    rows.push({
      day, date: '', format: m[2] as PlanFormat,
      topic: m[3].trim(), hook: m[4].trim(), pillar: m[5].trim(), hour,
      script: '', scriptState: 'empty', qcNote: '',
    });
  }
  if (rows.length !== 30) return { rows: [], error: tr('p30.err_parse') };
  const counts: Record<PlanFormat, number> = { image: 0, carousel: 0, reels: 0 };
  for (const r of rows) counts[r.format]++;
  if (counts.image !== PLAN_MIX.image || counts.carousel !== PLAN_MIX.carousel || counts.reels !== PLAN_MIX.reels) {
    return { rows: [], error: tr('p30.err_parse') };
  }
  rows.sort((a, b) => a.day - b.day);
  return { rows, error: '' };
}

function tablePrompt(p: Plan30): string {
  return 'Buat rencana konten 30 hari untuk niche "' + p.niche + '". Kompetitor: ' + (p.competitors || '(tidak disebut)') + '.\n'
    + 'Dasar riset (laporan agen, lengkap dengan URL sumbernya):\n' + (p.researchReport || '(tidak ada laporan riset — buat dari pengetahuan umum)') + '\n\n'
    + 'Keluarkan TEPAT 30 baris, satu baris per hari, format persis:\nHARI|FORMAT|TOPIK|HOOK|PILAR|JAM\n'
    + '- HARI: 1..30 berurutan, masing-masing sekali.\n'
    + '- FORMAT: tepat 12 baris image, 10 baris carousel, 8 baris reels, tersebar sepanjang 30 hari (jangan berkelompok).\n'
    + '- TOPIK: judul topik singkat. HOOK: kalimat pembuka. PILAR: nama pilar konten, konsisten sepanjang tabel.\n'
    + '- JAM: jam posting WIB bervariasi per format (HH:MM, 24 jam).\n'
    + 'Penjelasan boleh di luar tabel, tapi 30 baris tabel harus memakai format persis di atas.';
}

function setStatus(msg: string): void {
  const el = document.getElementById('p30Status');
  if (el) el.textContent = msg;
}

function setScriptStatus(msg: string): void {
  const el = document.getElementById('p30ScriptStatus');
  if (el) el.textContent = msg;
}

function stateLabel(r: PlanRow): string {
  if (r.scriptState === 'ok') return tr('p30.script_state_ok');
  if (r.scriptState === 'revised') return tr('p30.script_state_revised');
  if (r.scriptState === 'flagged') return tr('p30.script_state_flagged');
  if (r.scriptState === 'failed') return tr('p30.script_state_failed');
  if (r.scriptState === 'edited') return tr('p30.script_state_edited');
  return tr('p30.script_state_empty');
}

/// Prompt naskah per format. Label output DIKONTRAK untuk tahap visual
/// v209: image memakai Judul/Subjudul/Body (parseImagePlan), carousel
/// memakai 'Slide N:', reels memakai Hook/Beat/CTA.
function scriptPrompt(row: PlanRow, niche: string): string {
  const base = 'Niche: ' + niche + '. Topik: ' + row.topic + '. Hook: ' + (row.hook || '-') + '. Pilar: ' + (row.pillar || '-') + '.\n';
  if (row.format === 'image') {
    return 'Tulis naskah untuk SATU gambar (image).\n' + base
      + 'Format WAJIB, tanpa baris lain:\nJudul: ...\nSubjudul: ...\nBody: ...\n(Judul singkat, subjudul satu kalimat, body 1-3 kalimat.)';
  }
  if (row.format === 'carousel') {
    return 'Tulis naskah carousel 8 slide.\n' + base
      + 'Format WAJIB, satu slide per baris:\nSlide 1: judul \u2014 isi singkat\n...\nSlide 8: judul \u2014 isi singkat';
  }
  return 'Tulis naskah reels 30-60 detik, vertikal 9:16.\n' + base
    + 'Format WAJIB:\nHook: ...\nBeat: ... (satu beat per baris, sertakan detiknya)\nCTA: ...';
}

/// Gate QC per naskah (v208): draf -> QC 5 kriteria v161 -> revisi
/// otomatis maks 2 putaran. Cerminan gatedAgentAnswer chat.ts, tapi
/// dengan system instruction khusus naskah (TANPA format RECOMMEND,
/// supaya naskah bersih dari baris rekomendasi).
async function gatedScript(row: PlanRow, niche: string): Promise<{ text: string; state: ScriptState; note: string }> {
  const keys = readKeys();
  const cfg = defaultRouterConfig();
  cfg.geminiApiKey = keys.gemini;
  cfg.metaApiKey = keys.meta;
  const router = new ModelRouter(cfg);
  const draftSys = MODEL_LANG_INSTRUCTION[getLang()] + ' Kamu adalah agen Kreatif. Tulis HANYA naskah sesuai format yang diminta, tanpa pembuka, tanpa penutup, tanpa rekomendasi.';
  const prompt = scriptPrompt(row, niche);
  cfg.systemInstruction = draftSys;
  let r = await router.callWithFallback(prompt, 'trace-p30-script-' + row.day);
  recordLiveCost(r);
  let text = (r.text || '').trim();
  if (!text) throw new Error('naskah kosong');
  let verdictText = '';
  let rounds = 0;
  let qcDown = false;
  for (let round = 0; round <= 2; round++) {
    try {
      cfg.systemInstruction = QC_INSTRUCTION;
      const q = await router.callWithFallback('Tugas: ' + prompt + '\n\nHasil agen:\n- Kreatif: ' + text, 'trace-p30-script-qc-' + row.day + '-' + round);
      recordLiveCost(q);
      verdictText = q.text || '';
    } catch {
      qcDown = true;
      break;
    }
    if (parseQcVerdict(verdictText) === 'LOLOS' || round === 2) break;
    rounds++;
    cfg.systemInstruction = draftSys;
    const rev = await router.callWithFallback('Revisi hasil berikut berdasarkan verdict QC di bawah. Pertahankan bagian yang sudah benar, perbaiki hanya yang dikritik.\n\nVerdict QC:\n' + verdictText + '\n\nHasil sebelumnya:\n' + text, 'trace-p30-script-rev-' + row.day + '-' + rounds);
    recordLiveCost(rev);
    text = (rev.text || '').trim();
    if (!text) throw new Error('naskah kosong');
  }
  // Aturan v161: QC mati tidak boleh memblokir output.
  if (qcDown) return { text, state: 'ok', note: tr('flow.qc.unavailable') };
  if (parseQcVerdict(verdictText) === 'LOLOS') return { text, state: rounds > 0 ? 'revised' : 'ok', note: '' };
  return { text, state: 'flagged', note: verdictText.slice(0, 300) };
}

function renderTable(p: Plan30): string {
  if (!p.rows.length) return '';
  const head = '<tr><th>' + esc(tr('p30.col_day')) + '</th><th>' + esc(tr('p30.col_date')) + '</th><th>' + esc(tr('p30.col_format')) + '</th><th>' + esc(tr('p30.col_topic')) + '</th><th>' + esc(tr('p30.col_hook')) + '</th><th>' + esc(tr('p30.col_pillar')) + '</th><th>' + esc(tr('p30.col_hour')) + '</th></tr>';
  const body = p.rows.map((r) => '<tr><td>' + r.day + '</td><td>' + esc(r.date) + '</td><td>' + esc(r.format) + '</td><td>' + esc(r.topic) + '</td><td>' + esc(r.hook || '—') + '</td><td>' + esc(r.pillar || '—') + '</td><td>' + esc(r.hour) + '</td></tr>').join('');
  return '<table id="p30Table">' + head + body + '</table>';
}

function scriptsSection(p: Plan30): string {
  if (!p.approved) return '';
  const badge = p.scriptsApproved ? '<p style="color:#22c55e">' + esc(tr('p30.scripts_approved')) + '</p>' : '';
  const blocks = p.rows.map((r) => '<div style="margin-top:10px"><strong>Hari ' + r.day + ' \u00b7 ' + esc(r.format) + ' \u00b7 ' + esc(r.topic) + ' \u00b7 ' + esc(r.hour) + '</strong> '
    + '<span id="p30Badge-' + r.day + '">' + esc(stateLabel(r)) + '</span><br>'
    + '<textarea id="p30Script-' + r.day + '" rows="4" style="width:100%" ' + (p.scriptsApproved ? 'disabled' : '') + '>' + esc(r.script) + '</textarea>'
    + (r.qcNote ? '<p style="color:#b45309">' + esc(r.qcNote) + '</p>' : '')
    + '<button class="btn" data-act="plan-regen" data-day="' + r.day + '" ' + (p.scriptsApproved ? 'disabled' : '') + '>' + esc(tr('p30.script_regen')) + '</button></div>').join('');
  return '<h3>' + esc(tr('p30.scripts_title')) + '</h3>'
    + '<div style="display:flex;gap:8px;flex-wrap:wrap">'
    + '<button class="btn btn-primary" data-act="plan-scripts" ' + (p.scriptsApproved ? 'disabled' : '') + '>' + esc(tr('p30.scripts_run')) + '</button>'
    + '<button class="btn btn-primary" data-act="plan-scripts-approve" ' + (p.scriptsApproved || !p.rows.length ? 'disabled' : '') + '>' + esc(tr('p30.scripts_approve')) + '</button>'
    + '</div>'
    + '<p id="p30ScriptStatus" style="color:#555"></p>'
    + '<p class="se-note">' + esc(tr('p30.script_note')) + '</p>'
    + badge + blocks;
}

export function renderPlan(): void {
  const box = document.getElementById('plan30-main');
  if (!box) return;
  const p = loadPlan();
  const approvedBadge = p.approved ? '<p style="color:#22c55e">' + esc(tr('p30.approved')) + '</p>' : '';
  const researchArea = p.researchDone
    ? '<textarea id="p30Report" rows="6" style="width:100%">' + esc(p.researchReport) + '</textarea><button class="btn" data-act="plan-save-report">' + esc(tr('p30.save_report')) + '</button>'
    : '<p class="se-note">' + esc(tr('p30.report_note')) + '</p>';
  box.innerHTML = '<div class="ms-card"><h3>' + esc(tr('p30.title')) + '</h3>'
    + '<label>' + esc(tr('p30.niche')) + ' <input type="text" id="p30Niche" value="' + esc(p.niche) + '" placeholder="' + esc(tr('p30.niche_ph')) + '" style="width:100%"></label>'
    + '<label>' + esc(tr('p30.comp')) + ' <input type="text" id="p30Comp" value="' + esc(p.competitors) + '" placeholder="' + esc(tr('p30.comp_ph')) + '" style="width:100%"></label>'
    + '<label>' + esc(tr('p30.start')) + ' <input type="date" id="p30Start" value="' + esc(p.startDate) + '"></label>'
    + '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">'
    + '<button class="btn btn-primary" data-act="plan-research">' + esc(tr('p30.research')) + '</button>'
    + '<button class="btn btn-primary" data-act="plan-table" ' + (p.approved ? 'disabled' : '') + '>' + esc(tr('p30.table')) + '</button>'
    + '<button class="btn btn-primary" data-act="plan-approve" ' + (!p.rows.length || p.approved ? 'disabled' : '') + '>' + esc(tr('p30.approve')) + '</button>'
    + '<button class="btn" data-act="plan-new">' + esc(tr('p30.new')) + '</button>'
    + '</div>'
    + '<p id="p30Status" style="color:#555"></p>'
    + approvedBadge
    + researchArea
    + renderTable(p)
    + scriptsSection(p)
    + '</div>';
}

function readForm(): { niche: string; competitors: string; startDate: string } {
  return {
    niche: ((document.getElementById('p30Niche') as HTMLInputElement | null)?.value || '').trim(),
    competitors: ((document.getElementById('p30Comp') as HTMLInputElement | null)?.value || '').trim(),
    startDate: ((document.getElementById('p30Start') as HTMLInputElement | null)?.value || '').trim(),
  };
}

function persistForm(p: Plan30): Plan30 {
  const f = readForm();
  p.niche = f.niche;
  p.competitors = f.competitors;
  p.startDate = f.startDate;
  return p;
}

async function doResearch(): Promise<void> {
  const p = persistForm(loadPlan());
  if (!p.niche) { setStatus(tr('p30.err_niche')); return; }
  setStatus(tr('p30.running_research'));
  const task = 'Riset kompetitor (' + (p.competitors || 'tidak disebut') + ') dan tren niche ' + p.niche
    + ' untuk rencana konten 30 hari. Hasilkan: (1) temuan per kompetitor dengan URL sumber, (2) tren yang sedang naik dengan URL sumber, (3) celah/peluang konten.';
  const r = await researchRun(task, () => { /* log langkah tampil di panel Riset Live, bukan di sini */ });
  if (r.error) { setStatus(r.error); return; }
  p.researchReport = r.report;
  p.researchDone = true;
  p.researchGrounded = r.grounded;
  savePlan(p);
  renderPlan();
  setStatus(tr('p30.done_research') + (r.grounded ? '' : ' ' + tr('p30.warn_ungrounded')));
}

async function doTable(): Promise<void> {
  const p = persistForm(loadPlan());
  if (!p.niche) { setStatus(tr('p30.err_niche')); return; }
  if (!p.startDate) { setStatus(tr('p30.err_start')); return; }
  if (p.approved) { setStatus(tr('p30.approved')); return; }
  const keys = readKeys();
  if (!keys.meta && !keys.gemini) { setStatus(tr('rs.err.key')); return; }
  setStatus(tr('p30.running_table'));
  const cfg = defaultRouterConfig();
  cfg.geminiApiKey = keys.gemini;
  cfg.metaApiKey = keys.meta;
  cfg.systemInstruction = MODEL_LANG_INSTRUCTION[getLang()];
  const router = new ModelRouter(cfg);
  let res;
  try {
    res = await router.callWithFallback(tablePrompt(p), 'trace-p30-' + Date.now());
  } catch (e) {
    setStatus(e instanceof Error ? e.message : String(e));
    return;
  }
  recordLiveCost(res);
  const parsed = parsePlanTable(res.text || '');
  if (parsed.error) { setStatus(parsed.error); return; }
  p.rows = parsed.rows.map((r) => ({ ...r, date: planDateISO(p.startDate, r.day, r.hour).slice(0, 10) }));
  p.approved = false;
  p.scriptsApproved = false;
  savePlan(p);
  renderPlan();
  setStatus(tr('p30.done_table') + (p.researchDone ? '' : ' ' + tr('p30.warn_noresearch')));
}

let scriptsRunning = false;

async function doScripts(): Promise<void> {
  if (scriptsRunning) { setScriptStatus(tr('p30.scripts_running')); return; }
  const p = persistForm(loadPlan());
  if (!p.approved) { setScriptStatus(tr('p30.scripts_need_gate1')); return; }
  if (p.scriptsApproved) return;
  const keys = readKeys();
  if (!keys.meta && !keys.gemini) { setScriptStatus(tr('rs.err.key')); return; }
  scriptsRunning = true;
  const failedDays: number[] = [];
  for (const row of p.rows) {
    setScriptStatus(tr('p30.scripts_progress', { n: row.day }));
    try {
      const g = await gatedScript(row, p.niche);
      row.script = g.text;
      row.scriptState = g.state;
      row.qcNote = g.note;
    } catch {
      row.scriptState = 'failed';
      row.qcNote = '';
      failedDays.push(row.day);
    }
    savePlan(p);
  }
  scriptsRunning = false;
  renderPlan();
  setScriptStatus(tr('p30.scripts_done') + (failedDays.length ? ' ' + tr('p30.scripts_failed', { days: failedDays.join(', ') }) : ''));
}

async function doRegen(day: number): Promise<void> {
  if (scriptsRunning) { setScriptStatus(tr('p30.scripts_running')); return; }
  const p = persistForm(loadPlan());
  if (!p.approved || p.scriptsApproved) return;
  const row = p.rows.find((x) => x.day === day);
  if (!row) return;
  const keys = readKeys();
  if (!keys.meta && !keys.gemini) { setScriptStatus(tr('rs.err.key')); return; }
  setScriptStatus(tr('p30.scripts_progress', { n: day }));
  try {
    const g = await gatedScript(row, p.niche);
    row.script = g.text;
    row.scriptState = g.state;
    row.qcNote = g.note;
  } catch {
    row.scriptState = 'failed';
    row.qcNote = '';
  }
  savePlan(p);
  renderPlan();
  setScriptStatus(tr('p30.script_regen_done', { n: day }));
}

export function initPlan30(): void {
  const box = document.getElementById('plan30-main');
  if (!box || (box as HTMLElement).dataset.p30Wired) return;
  (box as HTMLElement).dataset.p30Wired = '1';
  renderPlan();
  let newArmed = false;
  box.addEventListener('click', async (ev) => {
    const btn = (ev.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
    if (!btn) return;
    const act = btn.dataset.act;
    if (act === 'plan-research') await doResearch();
    else if (act === 'plan-table') await doTable();
    else if (act === 'plan-approve') {
      const p = persistForm(loadPlan());
      if (!p.rows.length || p.approved) return;
      p.approved = true;
      savePlan(p);
      renderPlan();
      setStatus(tr('p30.done_approve'));
    } else if (act === 'plan-save-report') {
      const p = loadPlan();
      p.researchReport = ((document.getElementById('p30Report') as HTMLTextAreaElement | null)?.value || '');
      savePlan(p);
      setStatus(tr('p30.done_save_report'));
    } else if (act === 'plan-scripts') await doScripts();
    else if (act === 'plan-regen') {
      const day = Number(btn.dataset.day || 0);
      if (day) await doRegen(day);
    } else if (act === 'plan-scripts-approve') {
      const p = persistForm(loadPlan());
      if (!p.approved || p.scriptsApproved) return;
      const blocking = p.rows.filter((r) => !r.script.trim() || (r.scriptState !== 'ok' && r.scriptState !== 'revised' && r.scriptState !== 'edited'));
      if (blocking.length) { setScriptStatus(tr('p30.scripts_blocked', { n: blocking.length })); return; }
      p.scriptsApproved = true;
      savePlan(p);
      renderPlan();
      setScriptStatus(tr('p30.scripts_done_approve'));
    } else if (act === 'plan-new') {
      if (!newArmed) {
        newArmed = true;
        btn.textContent = tr('p30.new_arm');
        window.setTimeout(() => { newArmed = false; renderPlan(); }, 3000);
        return;
      }
      newArmed = false;
      try { localStorage.removeItem(PLAN_LS); } catch { /* abaikan */ }
      renderPlan();
    }
  });
  box.addEventListener('change', (ev) => {
    const ta = ev.target as HTMLElement;
    if (!ta.id || !ta.id.startsWith('p30Script-')) return;
    const day = Number(ta.id.slice('p30Script-'.length));
    const p = loadPlan();
    if (p.scriptsApproved) return;
    const row = p.rows.find((x) => x.day === day);
    if (!row) return;
    row.script = (ta as HTMLTextAreaElement).value;
    if (!row.script.trim()) row.scriptState = 'empty';
    else if (row.scriptState !== 'edited') row.scriptState = 'edited';
    savePlan(p);
    const badge = document.getElementById('p30Badge-' + day);
    if (badge) badge.textContent = stateLabel(row);
  });
}
