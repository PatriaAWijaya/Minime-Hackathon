// Alur rencana 30 hari lewat CHAT (v212) — menggantikan panel Rencana
// (v207-v210) dan form Batch lama. Mesin pipeline dipakai ulang apa
// adanya dari plan30.ts; yang berubah hanya kendalinya: pertanyaan
// dan konfirmasi di chat, bukan tombol di panel. Gerbang 1/2/3 jadi
// jawaban chat ("setuju" / "buat ulang" / "buat ulang ... hari N").
// State alur hidup di localStorage (seperti alur brief kreatif),
// sehingga menutup app di tengah jalan tidak menghilangkan progres.
import { AGENTS, postChat } from './v5logic.js';
import { tr } from './i18n.js';
import {
  PLAN_STYLES,
  doBatch,
  doCaptions,
  doRegen,
  doResearch,
  doScripts,
  doTable,
  doVisualRegen,
  doVisuals,
  loadPlan,
  planClear,
  planGate1,
  planGate2,
  planGate3,
  savePlan,
  visualEstimate,
} from './plan30.js';

const PC_LS = 'minime.planChat';

type PcStep = 'niche' | 'competitors' | 'start' | 'report' | 'gate1' | 'gate2' | 'gate3' | 'resume' | 'retry' | 'running';
type PcState = { step: PcStep; retryStage?: string };

function loadPc(): PcState | null {
  try {
    const raw = window.localStorage.getItem(PC_LS);
    if (!raw) return null;
    const o = JSON.parse(raw) as PcState;
    if (o && typeof o.step === 'string') return o;
    return null;
  } catch {
    return null;
  }
}

function savePc(s: PcState | null): void {
  try {
    if (!s) window.localStorage.removeItem(PC_LS);
    else window.localStorage.setItem(PC_LS, JSON.stringify(s));
  } catch { /* abaikan */ }
}

export function planChatIsActive(): boolean {
  return loadPc() !== null;
}

export function planChatIsEntry(text: string): boolean {
  return /\b(rencana|plan)\b.*\b30\s*hari\b|\b30\s*hari\b.*\b(rencana|konten)\b|\b(rencana|plan)\b.*\bsebulan\b/i.test(text);
}

function postAs(agent: string, text: string): void {
  const ag = (AGENTS as Record<string, { name: string; color: string }>)[agent] || (AGENTS as Record<string, { name: string; color: string; }>).prime;
  postChat(agent, ag.name, ag.color, text);
}

function todayLocal(): string {
  const d = new Date();
  const p = (n: number): string => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

function tableSummary(): string {
  const p = loadPlan();
  const lines = p.rows.map((r) => 'Hari ' + r.day + ' — ' + r.format + ' — ' + r.topic + ' — ' + r.hour);
  return tr('pc.sum_table', { rows: p.rows.length }) + '\n' + lines.join('\n');
}

function scriptsSummary(): string {
  const p = loadPlan();
  const c = { ok: 0, revised: 0, flagged: 0, failed: 0, empty: 0 };
  const bad: number[] = [];
  for (const r of p.rows) {
    if (r.scriptState === 'ok') c.ok++;
    else if (r.scriptState === 'revised') c.revised++;
    else if (r.scriptState === 'flagged') { c.flagged++; bad.push(r.day); }
    else if (r.scriptState === 'failed') { c.failed++; bad.push(r.day); }
    else { c.empty++; bad.push(r.day); }
  }
  return tr('pc.sum_scripts', { ok: c.ok, revised: c.revised, flagged: c.flagged, failed: c.failed })
    + (bad.length ? ' Hari bermasalah: ' + bad.join(', ') + '.' : '');
}

function visualSummary(): string {
  const p = loadPlan();
  const c = { ready: 0, partial: 0, failed: 0 };
  const bad: number[] = [];
  let captioned = 0;
  for (const r of p.rows) {
    if (r.mediaState === 'ready') c.ready++;
    else if (r.mediaState === 'partial') c.partial++;
    else { c.failed++; bad.push(r.day); }
    if (r.caption.trim()) captioned++;
  }
  return tr('pc.sum_visual', { ready: c.ready, partial: c.partial, failed: c.failed, n: captioned })
    + (bad.length ? ' Hari bermasalah: ' + bad.join(', ') + '.' : '');
}

const SETUJU_RE = /^(setuju|agree|同意)$/i;
const ULANG_RE = /^(buat ulang|regenerate|重新生成)$/i;
const REGEN_SCRIPT_RE = /^(?:buat ulang naskah hari|regenerate script day)\s+(\d+)$/i;
const REGEN_VISUAL_RE = /^(?:buat ulang visual hari|regenerate visual day)\s+(\d+)$/i;
const GAYA_RE = /^gaya:\s*(.+)$/i;

function failToRetry(stage: string, error: string): void {
  savePc({ step: 'retry', retryStage: stage });
  postAs('strategi', tr('pc.retry', { error }));
}

async function runResearch(): Promise<void> {
  savePc({ step: 'running' });
  postAs('riset', tr('pc.research_running'));
  const r = await doResearch();
  if (!r.ok) { failToRetry('research', r.error || ''); return; }
  const p = loadPlan();
  savePc({ step: 'report' });
  postAs('riset', p.researchReport
    + (r.grounded === false ? '\n\n' + tr('p30.warn_ungrounded') : '')
    + '\n\n' + tr('pc.ask_report'));
}

async function runTable(): Promise<void> {
  savePc({ step: 'running' });
  postAs('strategi', tr('pc.table_running'));
  const r = await doTable();
  if (!r.ok) { failToRetry('table', r.error || ''); return; }
  const p = loadPlan();
  savePc({ step: 'gate1' });
  postAs('strategi', tableSummary()
    + (p.researchDone ? '' : '\n\n' + tr('p30.warn_noresearch'))
    + '\n\n' + tr('pc.ask_gate1'));
}

async function runScripts(): Promise<void> {
  savePc({ step: 'running' });
  postAs('kreatif', tr('pc.scripts_running'));
  const r = await doScripts();
  if (!r.ok) { failToRetry('scripts', r.error || ''); return; }
  savePc({ step: 'gate2' });
  postAs('kreatif', scriptsSummary() + '\n\n' + tr('pc.ask_gate2'));
}

async function runVisualsAndCaptions(): Promise<void> {
  savePc({ step: 'running' });
  const est = visualEstimate(loadPlan());
  postAs('media', tr('pc.visual_estimate', { images: est.images, clips: est.clips, usd: est.usd, idr: est.idr })
    + '\n' + tr('pc.visual_running'));
  const v = await doVisuals();
  if (!v.ok) { failToRetry('visuals', v.error || ''); return; }
  const c = await doCaptions();
  if (!c.ok) { failToRetry('captions', c.error || ''); return; }
  savePc({ step: 'gate3' });
  postAs('media', visualSummary() + '\n\n' + tr('pc.ask_gate3'));
}

async function runBatch(): Promise<void> {
  savePc({ step: 'running' });
  postAs('distribusi', tr('pc.batch_running'));
  const r = await doBatch();
  if (!r.ok) { failToRetry('batch', r.error || ''); return; }
  const p = loadPlan();
  savePc(null);
  postAs('distribusi', tr('p30.batch_summary', { rows: p.rows.length, items: r.items })
    + '\n\n' + tr('p30.batch_note_ig')
    + '\n\n' + tr('pc.done'));
}

async function resumeJump(): Promise<void> {
  const p = loadPlan();
  if (p.batched) { postAs('strategi', tr('pc.already_batched')); return; }
  if (!p.approved) {
    savePc({ step: 'gate1' });
    postAs('strategi', tableSummary() + '\n\n' + tr('pc.ask_gate1'));
    return;
  }
  if (!p.scriptsApproved) {
    if (p.rows.every((r) => !r.script.trim())) { await runScripts(); return; }
    savePc({ step: 'gate2' });
    postAs('kreatif', scriptsSummary() + '\n\n' + tr('pc.ask_gate2'));
    return;
  }
  if (!p.visualApproved) {
    if (p.rows.every((r) => r.mediaState === 'empty' && !r.caption.trim())) { await runVisualsAndCaptions(); return; }
    savePc({ step: 'gate3' });
    postAs('media', visualSummary() + '\n\n' + tr('pc.ask_gate3'));
    return;
  }
  await runBatch();
}

export async function planChatStart(_text: string): Promise<void> {
  const p = loadPlan();
  if (p.rows.length) {
    savePc({ step: 'resume' });
    postAs('strategi', tr('pc.resume', { niche: p.niche || '-', rows: p.rows.length }));
    return;
  }
  if (p.researchDone && p.researchReport.trim()) {
    savePc({ step: 'report' });
    postAs('riset', p.researchReport + '\n\n' + tr('pc.ask_report'));
    return;
  }
  savePc({ step: 'niche' });
  postAs('strategi', tr('pc.ask_niche'));
}

export async function planChatAnswer(text: string): Promise<void> {
  const st = loadPc();
  if (!st) return;
  const t = text.trim();
  if (st.step === 'running') { postAs('strategi', tr('pc.running')); return; }
  if (/^(batal|cancel|取消)$/i.test(t)) { savePc(null); postAs('strategi', tr('pc.cancelled')); return; }

  if (st.step === 'retry') {
    if (/^(coba lagi|retry|重试)$/i.test(t)) {
      const stage = st.retryStage || 'research';
      if (stage === 'research') await runResearch();
      else if (stage === 'table') await runTable();
      else if (stage === 'scripts') await runScripts();
      else if (stage === 'visuals' || stage === 'captions') await runVisualsAndCaptions();
      else await runBatch();
    } else {
      postAs('strategi', tr('pc.retry', { error: '' }));
    }
    return;
  }

  if (st.step === 'niche') {
    const p = loadPlan();
    p.niche = t;
    savePlan(p);
    savePc({ step: 'competitors' });
    postAs('strategi', tr('pc.ask_comp'));
    return;
  }

  if (st.step === 'competitors') {
    const p = loadPlan();
    if (!/^(lewati|skip|跳过)$/i.test(t)) p.competitors = t;
    savePlan(p);
    savePc({ step: 'start' });
    postAs('strategi', tr('pc.ask_start'));
    return;
  }

  if (st.step === 'start') {
    let d = '';
    const m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) {
      // Validasi kalender beneran (2026-13-99 harus ditolak, bukan
      // lolos format lalu digeser diam-diam oleh Date.UTC).
      const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      if (dt.getFullYear() === Number(m[1]) && dt.getMonth() === Number(m[2]) - 1 && dt.getDate() === Number(m[3])) d = t;
    } else if (/^hari ini$/i.test(t)) d = todayLocal();
    if (!d) { postAs('strategi', tr('pc.ask_start_again')); return; }
    const p = loadPlan();
    p.startDate = d;
    savePlan(p);
    await runResearch();
    return;
  }

  if (st.step === 'report') {
    if (SETUJU_RE.test(t)) { await runTable(); return; }
    if (/^koreksi:/i.test(t)) {
      const p = loadPlan();
      p.researchReport = t.replace(/^koreksi:/i, '').trim();
      savePlan(p);
      await runTable();
      return;
    }
    postAs('riset', tr('pc.ask_report_again'));
    return;
  }

  if (st.step === 'gate1') {
    if (SETUJU_RE.test(t)) {
      planGate1();
      await runScripts();
      return;
    }
    if (ULANG_RE.test(t)) { await runTable(); return; }
    postAs('strategi', tr('pc.ask_gate1'));
    return;
  }

  if (st.step === 'gate2') {
    if (SETUJU_RE.test(t)) {
      const p = loadPlan();
      if (p.rows.every((r) => !r.script.trim())) { await runScripts(); return; }
      const g = planGate2();
      if (!g.ok) { postAs('kreatif', tr('pc.gate2_blocked', { n: g.blocking })); return; }
      await runVisualsAndCaptions();
      return;
    }
    if (ULANG_RE.test(t)) { await runScripts(); return; }
    const m = t.match(REGEN_SCRIPT_RE);
    if (m) {
      const r = await doRegen(Number(m[1]));
      postAs('kreatif', tr('pc.regen_script', { n: m[1], state: r.state || '' }));
      return;
    }
    const gm = t.match(GAYA_RE);
    if (gm) {
      const want = gm[1].trim().toLowerCase();
      const hit = PLAN_STYLES.find((s) => s.toLowerCase() === want);
      if (!hit) { postAs('kreatif', tr('pc.style_unknown', { styles: PLAN_STYLES.join(', ') })); return; }
      const p = loadPlan();
      p.planStyle = hit;
      savePlan(p);
      postAs('kreatif', tr('pc.style_set', { style: hit }));
      return;
    }
    postAs('kreatif', tr('pc.ask_gate2'));
    return;
  }

  if (st.step === 'gate3') {
    if (SETUJU_RE.test(t)) {
      const p = loadPlan();
      if (p.rows.every((r) => r.mediaState === 'empty' && !r.caption.trim())) { await runVisualsAndCaptions(); return; }
      const g = planGate3();
      if (!g.ok) { postAs('media', tr('pc.gate3_blocked', { n: g.blocking })); return; }
      await runBatch();
      return;
    }
    if (ULANG_RE.test(t)) { await runVisualsAndCaptions(); return; }
    const m = t.match(REGEN_VISUAL_RE);
    if (m) {
      const r = await doVisualRegen(Number(m[1]));
      postAs('media', tr('pc.regen_visual', { n: m[1], state: r.state || '' }));
      return;
    }
    postAs('media', tr('pc.ask_gate3'));
    return;
  }

  if (st.step === 'resume') {
    if (/^(baru|new|新的)$/i.test(t)) {
      planClear();
      savePc({ step: 'niche' });
      postAs('strategi', tr('pc.ask_niche'));
      return;
    }
    if (/^(lanjut|continue|继续)$/i.test(t)) { await resumeJump(); return; }
    const p = loadPlan();
    postAs('strategi', tr('pc.resume', { niche: p.niche || '-', rows: p.rows.length }));
    return;
  }
}
