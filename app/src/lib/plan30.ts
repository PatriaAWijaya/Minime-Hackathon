// Rencana 30 hari Skenario 2 (v207): store + Tahap 0/1/2.
// Satu rencana aktif (bukan banyak): panel menampilkan rencana aktif;
// "Rencana Baru" (dua ketuk, pola armed) mereset ke form kosong.
// Urutan tahap: Masuk (niche/kompetitor/tanggal) -> Riset live (v206)
// -> Tabel 30 baris (agen Strategi) -> Gerbang 1 (Setujui Rencana).
// Naskah/visual/caption/batch menyusul di versi berikutnya dan HANYA
// jalan sesudah gerbang 1 lolos (tombol tahap berikut nonaktif).

import { tr, getLang, GROUNDING_INSTRUCTION, MODEL_LANG_INSTRUCTION } from './i18n.js';
import { ModelRouter, defaultRouterConfig } from '../../../src/router';
import { readKeys, QC_INSTRUCTION, parseQcVerdict } from './chat.js';
import { recordLiveCost } from './cost.js';
import { researchRun } from './research-browser.js';
import { invoke } from '@tauri-apps/api/core';
import { metaGenerateImage, IMG_PRICE_USD, IMG_USD_RATE, addImgSpend } from './image-api.js';
import { omniGenerateClip, omniPriceUsd } from './omni-gen.js';
import { sosmedCaptionPrompt } from './caption-tracks.js';
import { socQueueAdd } from './social.js';
import { esc } from './esc.js';

export type PlanFormat = 'image' | 'carousel' | 'reels';
export type ScriptState = 'empty' | 'ok' | 'revised' | 'flagged' | 'failed' | 'edited';
export type MediaState = 'empty' | 'ready' | 'partial' | 'failed';
export type PlanRow = {
  day: number; date: string; format: PlanFormat;
  topic: string; hook: string; pillar: string; hour: string;
  script: string; scriptState: ScriptState; qcNote: string;
  media: string[]; mediaState: MediaState; mediaNote: string; caption: string;
};
export type Plan30 = {
  niche: string; competitors: string; startDate: string;
  researchReport: string; researchDone: boolean; researchGrounded: boolean;
  rows: PlanRow[]; approved: boolean; scriptsApproved: boolean;
  planStyle: string; visualApproved: boolean;
  batched: boolean; batchItemIds: string[];
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
        media: Array.isArray(r.media) ? (r.media as string[]) : [],
        mediaState: ['ready', 'partial', 'failed'].includes(String(r.mediaState)) ? (r.mediaState as MediaState) : 'empty',
        mediaNote: typeof r.mediaNote === 'string' ? r.mediaNote : '',
        caption: typeof r.caption === 'string' ? r.caption : '',
      })) as PlanRow[];
      if (typeof p.scriptsApproved !== 'boolean') p.scriptsApproved = false;
      if (typeof p.planStyle !== 'string' || !p.planStyle) p.planStyle = 'product photography';
      if (typeof p.visualApproved !== 'boolean') p.visualApproved = false;
      if (typeof p.batched !== 'boolean') p.batched = false;
      if (!Array.isArray(p.batchItemIds)) p.batchItemIds = [];
      return p;
    }
    }
  } catch { /* abaikan: kembali ke rencana kosong */ }
  return {
    niche: '', competitors: '', startDate: '',
    researchReport: '', researchDone: false, researchGrounded: false,
    rows: [], approved: false, scriptsApproved: false,
    planStyle: 'product photography', visualApproved: false,
    batched: false, batchItemIds: [],
  };
}

export function savePlan(p: Plan30): void {
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
      media: [], mediaState: 'empty', mediaNote: '', caption: '',
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
  cfg.anthropicApiKey = keys.anthropic;
  const router = new ModelRouter(cfg);
  // v235: grounding ditambahkan (kriteria grounding di QC tetap ada,
  // tapi draf yang lebih membumi mengurangi putaran revisi).
  const draftSys = MODEL_LANG_INSTRUCTION[getLang()] + GROUNDING_INSTRUCTION[getLang()] + ' Kamu adalah agen Kreatif. Tulis HANYA naskah sesuai format yang diminta, tanpa pembuka, tanpa penutup, tanpa rekomendasi.';
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

function persistForm(p: Plan30): Plan30 {
  // v212: panel sudah tidak ada — persistForm menjadi identitas;
  // niche/kompetitor/tanggal diset alur chat langsung lewat savePlan.
  return p;
}

export async function doResearch(): Promise<{ ok: boolean; error?: string; grounded?: boolean }> {
  const p = persistForm(loadPlan());
  if (!p.niche) { setStatus(tr('p30.err_niche')); return { ok: false, error: tr('p30.err_niche') }; }
  setStatus(tr('p30.running_research'));
  const task = 'Riset kompetitor (' + (p.competitors || 'tidak disebut') + ') dan tren niche ' + p.niche
    + ' untuk rencana konten 30 hari. Hasilkan: (1) temuan per kompetitor dengan URL sumber, (2) tren yang sedang naik dengan URL sumber, (3) celah/peluang konten.';
  const r = await researchRun(task, () => { /* log langkah tampil di panel Riset Live, bukan di sini */ });
  if (r.error) { setStatus(r.error); return { ok: false, error: r.error }; }
  p.researchReport = r.report;
  p.researchDone = true;
  p.researchGrounded = r.grounded;
  savePlan(p);
  setStatus(tr('p30.done_research') + (r.grounded ? '' : ' ' + tr('p30.warn_ungrounded')));
  return { ok: true, grounded: r.grounded };
}

export async function doTable(): Promise<{ ok: boolean; error?: string }> {
  const p = persistForm(loadPlan());
  if (!p.niche) { setStatus(tr('p30.err_niche')); return { ok: false, error: tr('p30.err_niche') }; }
  if (!p.startDate) { setStatus(tr('p30.err_start')); return { ok: false, error: tr('p30.err_start') }; }
  if (p.approved) { setStatus(tr('p30.approved')); return { ok: false, error: tr('p30.approved') }; }
  const keys = readKeys();
  if (!keys.meta && !keys.gemini) { setStatus(tr('rs.err.key')); return { ok: false, error: tr('rs.err.key') }; }
  setStatus(tr('p30.running_table'));
  const cfg = defaultRouterConfig();
  cfg.geminiApiKey = keys.gemini;
  cfg.metaApiKey = keys.meta;
  cfg.anthropicApiKey = keys.anthropic;
  cfg.systemInstruction = MODEL_LANG_INSTRUCTION[getLang()] + GROUNDING_INSTRUCTION[getLang()];
  const router = new ModelRouter(cfg);
  let res;
  try {
    res = await router.callWithFallback(tablePrompt(p), 'trace-p30-' + Date.now());
  } catch (e) {
    setStatus(e instanceof Error ? e.message : String(e));
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  recordLiveCost(res);
  const parsed = parsePlanTable(res.text || '');
  if (parsed.error) { setStatus(parsed.error); return { ok: false, error: parsed.error }; }
  p.rows = parsed.rows.map((r) => ({ ...r, date: planDateISO(p.startDate, r.day, r.hour).slice(0, 10) }));
  p.approved = false;
  p.scriptsApproved = false;
  p.visualApproved = false;
  p.batched = false;
  p.batchItemIds = [];
  savePlan(p);
  setStatus(tr('p30.done_table') + (p.researchDone ? '' : ' ' + tr('p30.warn_noresearch')));
  return { ok: true };
}

export const PLAN_STYLES = ['photorealistic', 'product photography', 'flat design', 'illustration', '3D model'];

function parseCarouselSlides(script: string): string[] {
  const out: string[] = [];
  for (const line of script.split('\n')) {
    const m = line.trim().match(/^Slide\s+\d+\s*:\s*(.+)$/);
    if (m) out.push(m[1].trim());
  }
  return out;
}

function parseReelsBeats(script: string): string[] {
  const out: string[] = [];
  for (const line of script.split('\n')) {
    const m = line.trim().match(/^Beat:\s*(.+)$/);
    if (m) out.push(m[1].trim());
  }
  return out;
}

function setVisualStatus(msg: string): void {
  const el = document.getElementById('p30VisualStatus');
  if (el) el.textContent = msg;
}

export function visualEstimate(p: Plan30): { images: number; clips: number; usd: number; idr: number } {
  let images = 0;
  let clips = 0;
  for (const r of p.rows) {
    if (r.format === 'image') images += 1;
    else if (r.format === 'carousel') images += parseCarouselSlides(r.script).length;
    else clips += parseReelsBeats(r.script).length;
  }
  const usd = Math.round((images * IMG_PRICE_USD + clips * omniPriceUsd('720p', 10)) * 100) / 100;
  return { images, clips, usd, idr: Math.round(usd * IMG_USD_RATE) };
}

async function generateRowVisual(row: PlanRow, plan: Plan30): Promise<{ media: string[]; state: MediaState; note: string }> {
  const keys = readKeys();
  const styleLine = ', in ' + plan.planStyle + ' style. Semua gambar/klip dalam rencana ini memakai gaya ' + plan.planStyle + ' yang sama.';
  if (row.format === 'image') {
    if (!keys.meta) throw new Error(tr('rs.err.key'));
    const b64s = await metaGenerateImage(keys.meta, row.script + styleLine, 1, '1024x1024');
    if (!b64s.length) throw new Error('gambar kosong');
    const name = 'p30-d' + row.day + '-1.webp';
    await invoke('image_save', { req: { name, b64: b64s[0] } });
    addImgSpend(1);
    return { media: [name], state: 'ready', note: '' };
  }
  if (row.format === 'carousel') {
    if (!keys.meta) throw new Error(tr('rs.err.key'));
    const slides = parseCarouselSlides(row.script);
    if (!slides.length) throw new Error('tidak ada baris Slide di naskah');
    const media: string[] = [];
    for (let i = 0; i < slides.length; i++) {
      try {
        const b64s = await metaGenerateImage(keys.meta, slides[i] + styleLine, 1, '1024x1024');
        if (!b64s.length) continue;
        const name = 'p30-d' + row.day + '-' + (i + 1) + '.webp';
        await invoke('image_save', { req: { name, b64: b64s[0] } });
        addImgSpend(1);
        media.push(name);
      } catch { /* satu slide gagal tidak menggagalkan carousel */ }
    }
    if (!media.length) throw new Error('semua slide gagal');
    return { media, state: media.length === slides.length ? 'ready' : 'partial', note: '' };
  }
  if (!keys.gemini) throw new Error(tr('rs.err.key'));
  const beats = parseReelsBeats(row.script);
  if (!beats.length) throw new Error('tidak ada baris Beat di naskah');
  const media: string[] = [];
  for (const beat of beats) {
    try {
      const clip = await omniGenerateClip(keys.gemini, { prompt: beat + styleLine, aspect: '9:16', resolution: '720p' });
      media.push(clip.path);
    } catch { /* satu klip gagal tidak menggagalkan reels */ }
  }
  if (!media.length) throw new Error('semua klip gagal');
  return { media, state: media.length === beats.length ? 'ready' : 'partial', note: '' };
}

let visualsRunning = false;

export async function doVisuals(): Promise<{ ok: boolean; failedDays: number[]; error?: string }> {
  if (visualsRunning) { setVisualStatus(tr('p30.visual_running')); return { ok: false, failedDays: [], error: tr('p30.visual_running') }; }
  const p = persistForm(loadPlan());
  if (!p.scriptsApproved) { setVisualStatus(tr('p30.visual_need_gate2')); return { ok: false, failedDays: [], error: tr('p30.visual_need_gate2') }; }
  if (p.visualApproved) return { ok: true, failedDays: [] };
  visualsRunning = true;
  const failedDays: number[] = [];
  for (const row of p.rows) {
    if (row.mediaState === 'ready') continue;
    setVisualStatus(tr('p30.visual_progress', { n: row.day }));
    try {
      const g = await generateRowVisual(row, p);
      row.media = g.media;
      row.mediaState = g.state;
      row.mediaNote = g.note;
    } catch (e) {
      row.mediaState = 'failed';
      row.mediaNote = e instanceof Error ? e.message : String(e);
      failedDays.push(row.day);
    }
    savePlan(p);
  }
  visualsRunning = false;
  setVisualStatus(tr('p30.visual_done') + (failedDays.length ? ' ' + tr('p30.visual_failed', { days: failedDays.join(', ') }) : ''));
  return { ok: true, failedDays };
}

export async function doVisualRegen(day: number): Promise<{ ok: boolean; state?: MediaState; error?: string }> {
  if (visualsRunning) { setVisualStatus(tr('p30.visual_running')); return { ok: false, error: tr('p30.visual_running') }; }
  const p = persistForm(loadPlan());
  if (!p.scriptsApproved || p.visualApproved) return { ok: false };
  const row = p.rows.find((x) => x.day === day);
  if (!row) return { ok: false };
  setVisualStatus(tr('p30.visual_progress', { n: day }));
  try {
    const g = await generateRowVisual(row, p);
    row.media = g.media;
    row.mediaState = g.state;
    row.mediaNote = g.note;
  } catch (e) {
    row.mediaState = 'failed';
    row.mediaNote = e instanceof Error ? e.message : String(e);
  }
  savePlan(p);
  setVisualStatus(tr('p30.visual_done'));
  return { ok: row.mediaState !== 'failed', state: row.mediaState };
}

export async function doCaptions(): Promise<{ ok: boolean; made: number; error?: string }> {
  if (visualsRunning) { setVisualStatus(tr('p30.visual_running')); return { ok: false, made: 0, error: tr('p30.visual_running') }; }
  const p = persistForm(loadPlan());
  if (!p.scriptsApproved) { setVisualStatus(tr('p30.visual_need_gate2')); return { ok: false, made: 0, error: tr('p30.visual_need_gate2') }; }
  if (p.visualApproved) return { ok: true, made: 0 };
  const keys = readKeys();
  if (!keys.meta && !keys.gemini) { setVisualStatus(tr('rs.err.key')); return { ok: false, made: 0, error: tr('rs.err.key') }; }
  const cfg = defaultRouterConfig();
  cfg.geminiApiKey = keys.gemini;
  cfg.metaApiKey = keys.meta;
  cfg.anthropicApiKey = keys.anthropic;
  cfg.systemInstruction = MODEL_LANG_INSTRUCTION[getLang()] + GROUNDING_INSTRUCTION[getLang()];
  const router = new ModelRouter(cfg);
  let made = 0;
  for (const row of p.rows) {
    if (row.caption.trim()) continue;
    setVisualStatus(tr('p30.visual_progress', { n: row.day }));
    try {
      const kindLabel = row.format === 'image' ? 'gambar' : row.format;
      const prompt = sosmedCaptionPrompt(kindLabel, row.topic, row.hook, '', row.script);
      const r = await router.callWithFallback(prompt, 'trace-p30-caption-' + row.day);
      recordLiveCost(r);
      row.caption = (r.text || '').trim();
      if (row.caption) made++;
    } catch { /* caption gagal: baris dilewati, bisa dicoba lagi */ }
    savePlan(p);
  }
  setVisualStatus(tr('p30.caption_done', { n: made }));
  return { ok: true, made };
}

let scriptsRunning = false;

export async function doScripts(): Promise<{ ok: boolean; failedDays: number[]; error?: string }> {
  if (scriptsRunning) { setScriptStatus(tr('p30.scripts_running')); return { ok: false, failedDays: [], error: tr('p30.scripts_running') }; }
  const p = persistForm(loadPlan());
  if (!p.approved) { setScriptStatus(tr('p30.scripts_need_gate1')); return { ok: false, failedDays: [], error: tr('p30.scripts_need_gate1') }; }
  if (p.scriptsApproved) return { ok: true, failedDays: [] };
  const keys = readKeys();
  if (!keys.meta && !keys.gemini) { setScriptStatus(tr('rs.err.key')); return { ok: false, failedDays: [], error: tr('rs.err.key') }; }
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
  setScriptStatus(tr('p30.scripts_done') + (failedDays.length ? ' ' + tr('p30.scripts_failed', { days: failedDays.join(', ') }) : ''));
  return { ok: true, failedDays };
}

export async function doRegen(day: number): Promise<{ ok: boolean; state?: ScriptState; error?: string }> {
  if (scriptsRunning) { setScriptStatus(tr('p30.scripts_running')); return { ok: false, error: tr('p30.scripts_running') }; }
  const p = persistForm(loadPlan());
  if (!p.approved || p.scriptsApproved) return { ok: false };
  const row = p.rows.find((x) => x.day === day);
  if (!row) return { ok: false };
  const keys = readKeys();
  if (!keys.meta && !keys.gemini) { setScriptStatus(tr('rs.err.key')); return { ok: false, error: tr('rs.err.key') }; }
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
  setScriptStatus(tr('p30.script_regen_done', { n: day }));
  return { ok: row.scriptState !== 'failed', state: row.scriptState };
}

function setBatchStatus(msg: string): void {
  const el = document.getElementById('p30BatchStatus');
  if (el) el.textContent = msg;
}

export async function doBatch(): Promise<{ ok: boolean; items: number; error?: string }> {
  const p = persistForm(loadPlan());
  if (!p.visualApproved) { setBatchStatus(tr('p30.batch_need_gate3')); return { ok: false, items: 0, error: tr('p30.batch_need_gate3') }; }
  if (p.batched) return { ok: true, items: 0 };
  const channels = ['instagram', 'threads', 'linkedin'];
  const items: Array<Record<string, unknown>> = [];
  for (const row of p.rows) {
    const scheduledAt = Date.parse(planDateISO(p.startDate, row.day, row.hour));
    for (const platform of channels) {
      items.push({
        platform, text: row.caption,
        imageFile: row.format === 'reels' ? '' : (row.media[0] || ''),
        imageFiles: row.format === 'reels' ? [] : row.media,
        videoFiles: row.format === 'reels' ? row.media : [],
        scheduledAt, status: 'draft', planDay: row.day,
      });
    }
  }
  let ids: string[];
  try {
    ids = socQueueAdd(items);
  } catch (e) {
    return { ok: false, items: 0, error: e instanceof Error ? e.message : String(e) };
  }
  p.batched = true;
  p.batchItemIds = ids;
  savePlan(p);
  setBatchStatus(tr('p30.batch_summary', { rows: p.rows.length, items: items.length }));
  return { ok: true, items: items.length };
}


export function planGate1(): { ok: boolean; error?: string } {
  const p = loadPlan();
  if (!p.rows.length) return { ok: false, error: 'empty' };
  p.approved = true;
  savePlan(p);
  return { ok: true };
}

export function planGate2(): { ok: boolean; blocking: number } {
  const p = loadPlan();
  if (!p.approved || p.scriptsApproved) return { ok: false, blocking: -1 };
  const blocking = p.rows.filter((r) => !r.script.trim() || (r.scriptState !== 'ok' && r.scriptState !== 'revised' && r.scriptState !== 'edited')).length;
  if (blocking) return { ok: false, blocking };
  p.scriptsApproved = true;
  savePlan(p);
  return { ok: true, blocking: 0 };
}

export function planGate3(): { ok: boolean; blocking: number } {
  const p = loadPlan();
  if (!p.scriptsApproved || p.visualApproved) return { ok: false, blocking: -1 };
  const blocking = p.rows.filter((r) => (r.mediaState !== 'ready' && r.mediaState !== 'partial') || !r.caption.trim()).length;
  if (blocking) return { ok: false, blocking };
  p.visualApproved = true;
  savePlan(p);
  return { ok: true, blocking: 0 };
}

export function planClear(): void {
  try { localStorage.removeItem(PLAN_LS); } catch { /* abaikan */ }
}
