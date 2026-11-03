// Browser riset teks (v206): loop agen CARI / BUKA / LAPORAN di atas
// command Rust research_search + research_fetch.
// Protokol model (baris perintah di awal baris):
//   CARI: <kata kunci>   -> app mencari, hasilnya jadi konteks berikut
//   BUKA: <url>           -> app membuka halaman, teksnya jadi konteks
//   LAPORAN: <laporan>    -> selesai; laporan WAJIB mengutip URL sumber
// Batas desain (disetujui Patria 3 Nov 00:45): maks 10 cari + 15 buka
// per tugas, maks 14 panggilan model. Bila model menjawab langsung
// tanpa perintah browsing, jawabannya tetap dipakai tapi ditandai
// tidak beralas browsing (jujur, bukan hasil riset live).

import { invoke } from '@tauri-apps/api/core';
import { tr, getLang, MODEL_LANG_INSTRUCTION } from './i18n.js';
import { ModelRouter, defaultRouterConfig } from '../../../src/router';
import { readKeys } from './chat.js';
import { recordLiveCost } from './cost.js';
import { esc } from './esc.js';
import { AGENTS, postChat } from './v5logic.js';

export type RsResult = { title: string; url: string; snippet: string };
export type RsStep = { kind: 'search' | 'open'; query: string; ok: boolean; detail: string };
export type RsRun = { report: string; steps: RsStep[]; grounded: boolean; error: string };

const MAX_SEARCH = 10;
const MAX_OPEN = 15;
const MAX_CALLS = 14;

const RS_SYSTEM = ' Kamu adalah Agen Riset. Kamu punya browser teks dengan tiga perintah, masing-masing di awal barisnya sendiri:\n'
  + 'CARI: <kata kunci> — mencari web, hasilnya dikembalikan sebagai konteks.\n'
  + 'BUKA: <url> — membuka satu halaman, teksnya dikembalikan sebagai konteks.\n'
  + 'LAPORAN: <laporan lengkap> — selesai; tiap klaim penting dalam laporan WAJIB menyebut URL sumber yang sudah kamu buka (bukan dari ingatan).\n'
  + 'Aturan: jelajahi dulu (CARI lalu BUKA halaman yang relevan), baru LAPORAN. Jangan mengarang isi halaman yang belum dibuka; bila halaman gagal dibuka, katakan gagal dan pakai sumber lain. Jangan mengulang query yang sama.';

function parseCmds(text: string): { searches: string[]; opens: string[]; report: string | null } {
  const searches: string[] = [];
  const opens: string[] = [];
  let report: string | null = null;
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (t.startsWith('CARI:')) searches.push(t.slice(5).trim());
    else if (t.startsWith('BUKA:')) opens.push(t.slice(5).trim());
    else if (t.startsWith('LAPORAN:')) {
      // v235: potong laporan pada baris perintah pertama sesudah
      // LAPORAN (dulu CARI/BUKA sesudah LAPORAN ikut masuk laporan).
      const rest = text.slice(text.indexOf('LAPORAN:') + 8);
      const restLines = rest.split('\n');
      const cut = restLines.findIndex((l) => /^(CARI|BUKA|LAPORAN):/.test(l.trim()));
      report = (cut >= 0 ? restLines.slice(0, cut).join('\n') : rest).trim();
      break;
    }
  }
  return {
    searches: searches.filter(Boolean),
    opens: opens.filter(Boolean),
    report,
  };
}

export async function researchRun(
  task: string,
  onStep?: (step: RsStep) => void,
): Promise<RsRun> {
  const keys = readKeys();
  if (!keys.meta && !keys.gemini) {
    return { report: '', steps: [], grounded: false, error: tr('rs.err.key') };
  }
  const cfg = defaultRouterConfig();
  cfg.geminiApiKey = keys.gemini;
  cfg.metaApiKey = keys.meta;
  cfg.systemInstruction = MODEL_LANG_INSTRUCTION[getLang()] + RS_SYSTEM;
  const router = new ModelRouter(cfg);
  const steps: RsStep[] = [];
  let history = '';
  let searches = 0;
  let opens = 0;
  for (let call = 0; call < MAX_CALLS; call++) {
    const prompt = 'Tugas riset: ' + task + '\n\n'
      + (history ? 'Temuan sejauh ini:\n' + history + '\n\n' : '')
      + 'Perintah berikutnya? Pakai CARI: / BUKA: / LAPORAN: (LAPORAN: diikuti laporan lengkap dengan URL sumber tiap klaim penting).';
    let res;
    try {
      res = await router.callWithFallback(prompt, 'trace-rs-' + Date.now());
    } catch (e) {
      return { report: '', steps, grounded: false, error: e instanceof Error ? e.message : String(e) };
    }
    recordLiveCost(res);
    const text = res.text || '';
    const { searches: ss, opens: oo, report } = parseCmds(text);
    if (report !== null) {
      return { report, steps, grounded: steps.length > 0, error: '' };
    }
    if (!ss.length && !oo.length) {
      // Jawaban langsung tanpa browsing: dipakai apa adanya, tapi
      // ditandai tidak beralas browsing (bukan hasil riset live).
      return { report: text, steps, grounded: false, error: '' };
    }
    let progressed = false;
    for (const q of ss) {
      if (searches >= MAX_SEARCH) break;
      searches++;
      progressed = true;
      try {
        const out = await invoke<{ results: RsResult[] }>('research_search', { query: q });
        const lines = out.results
          .map((r, i) => (i + 1) + '. ' + r.title + ' — ' + r.url + (r.snippet ? ' (' + r.snippet + ')' : ''))
          .join('\n');
        history += '\nHasil CARI "' + q + '":\n' + (lines || '(tidak ada hasil)') + '\n';
        const step: RsStep = { kind: 'search', query: q, ok: true, detail: out.results.length + ' hasil' };
        steps.push(step);
        onStep?.(step);
      } catch (e) {
        const m = e instanceof Error ? e.message : String(e);
        history += '\nHasil CARI "' + q + '": GAGAL (' + m + ')\n';
        const step: RsStep = { kind: 'search', query: q, ok: false, detail: m };
        steps.push(step);
        onStep?.(step);
      }
    }
    for (const u of oo) {
      if (opens >= MAX_OPEN) break;
      opens++;
      progressed = true;
      try {
        const out = await invoke<{ url: string; title: string; text: string }>('research_fetch', { url: u });
        history += '\nIsi BUKA ' + out.url + (out.title ? ' (' + out.title + ')' : '') + ':\n' + out.text.slice(0, 6000) + '\n';
        const step: RsStep = { kind: 'open', query: u, ok: true, detail: out.title || out.url };
        steps.push(step);
        onStep?.(step);
      } catch (e) {
        const m = e instanceof Error ? e.message : String(e);
        history += '\nIsi BUKA ' + u + ': GAGAL (' + m + ')\n';
        const step: RsStep = { kind: 'open', query: u, ok: false, detail: m };
        steps.push(step);
        onStep?.(step);
      }
    }
    if (!progressed) break;
  }
  return { report: '', steps, grounded: false, error: tr('rs.err.noreport') };
}


// v212 (vonis Patria 3 Nov 04:36): riset live TIDAK lagi punya form
// Perintah memakai titik-dua ("riset: <topik>") agar tidak membajak brief
// delegasi yang diawali kata 'riset' (mis. 'riset pasar ...' -> agen Riset).
// sendiri — panel Search view dihapus. Riset jalan lewat agen di chat:
// pesan perintah "riset: <topik>" langsung menjalankan researchRun dan
// laporannya tampil sebagai bubble agen Riset (bukan panel).
export function researchChatIsEntry(text: string): boolean {
  return /^\s*(tolong\s+)?riset\s*:\s*\S+/i.test(text);
}

export async function researchChatRun(text: string): Promise<void> {
  const q = text.trim().replace(/^\s*(tolong\s+)?riset\s*:\s*/i, '').trim();
  const ag = (AGENTS as Record<string, { name: string; color: string }>).riset;
  const post = (t: string): void => { postChat('riset', ag.name, ag.color, t); };
  post(tr('pc.rs_running'));
  const r = await researchRun(q);
  if (r.error) { post(r.error); return; }
  post(r.report + (r.grounded ? '' : '\n\n' + tr('p30.warn_ungrounded')));
}
