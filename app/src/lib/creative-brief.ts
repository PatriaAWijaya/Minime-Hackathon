// Creative brief — alur brief interaktif Kreatif (v138).
//
// Saat perintah user menghasilkan output kreatif, Kreatif TIDAK langsung
// memproses: ia memastikan dulu peruntukannya (Konten Sosial Media /
// Artikel Blog / Script Movie) lewat tombol rekomendasi di chat, lalu
// menanyakan arahan per cabang sebelum memproses sampai selesai.
// v138: pintu peruntukan + cabang Artikel end-to-end (5 arahan, lalu
// artikel ditulis model dan ditampilkan di Script Editor bagian Artikel).
// Cabang Movie/Sosmed di v138 masih generate langsung (pesan jujur di
// bubble) dan diganti alur terpandu di v139/v140.
//
// Entry HANYA dari delegasi ke Kreatif yang menyebut namanya (delegasi tunggal + split
// kreatif-tunggal Alur 1/2); tugas Kreatif di dalam fan-out multi-agen
// tetap sekali jalan seperti sekarang. Pesan user berikutnya selama
// alur aktif ditelan sebagai jawaban langkah (sendChatReal memeriksa
// cbIsActive() SEBELUM split brief, supaya jawaban tidak dibelah jadi
// tugas fan-out). Jawaban tombol = label persis; jawaban ketik bebas
// selalu diterima pada langkah Artikel (framework/POV/gaya/jumlah/
// audiens), dan dicocokkan longgar pada langkah pilihan (tujuan).
// State bertahan di localStorage sehingga reload di tengah alur tidak
// menghilangkan progres (pertanyaan tetap terbaca di riwayat chat).
import { AGENTS, postChat, setAgentPhase } from './v5logic.js';
import { getLang, MODEL_LANG_INSTRUCTION, REPORT_FORMAT_INSTRUCTION, tr } from './i18n.js';
import { ModelRouter, defaultRouterConfig } from '../../../src/router';
import { recordLiveCost } from './cost.js';
import { esc } from './esc.js';

const LS = 'minime.creativeBrief';

type CbStep = 'purpose' | 'art-story' | 'art-pov' | 'art-style' | 'art-sentences' | 'art-audience';

interface CbState {
  brief: string;
  step: CbStep;
  answers: Record<string, string>;
  attempts: number;
  platform?: string;
}

function loadState(): CbState | null {
  try {
    const raw = window.localStorage.getItem(LS);
    if (!raw) return null;
    const o = JSON.parse(raw) as Partial<CbState>;
    if (!o || typeof o.brief !== 'string' || typeof o.step !== 'string') return null;
    const steps: CbStep[] = ['purpose', 'art-story', 'art-pov', 'art-style', 'art-sentences', 'art-audience'];
    if (!steps.includes(o.step as CbStep)) return null;
    return { brief: o.brief, step: o.step as CbStep, answers: o.answers || {}, attempts: o.attempts || 0, platform: o.platform };
  } catch {
    return null;
  }
}

function saveState(st: CbState): void {
  try { window.localStorage.setItem(LS, JSON.stringify(st)); } catch { /* abaikan */ }
}

function clearState(): void {
  try { window.localStorage.removeItem(LS); } catch { /* abaikan */ }
}

export function cbIsActive(): boolean {
  return loadState() !== null;
}

// Pemicu alur: brief kreatif YANG MENYEBUT Kreatif dengan nama.
// Brief kreatif generik (tanpa kata 'Kreatif') TIDAK masuk alur — ia
// tetap lewat jalur lama (fan-out / delegasi satu tembak + tombol
// Approve studio, v104/v107). Mempersempit ini disengaja: pemicu luas
// terbukti membajak delegasi satu tembak yang sudah disetujui (rig
// §4 'tombol studio Kreatif' gagal saat pemicu masih luas). Perluasan
// pemicu ke semua brief kreatif adalah keputusan Patria, bukan Mimi.
export function cbIsFlowEntry(text: string): boolean {
  if (!cbIsCreative(text)) return false;
  const low = ' ' + text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim() + ' ';
  return low.includes(' kreatif ');
}

// Detektor brief kreatif: kata MEDIA_WORDS + kata yang belum ada di sana
// (blog/film/movie/carousel/talking head). Sengaja tanpa import dari
// chat.ts (mediaNeeded tidak diekspor) supaya tidak ada siklus import.
export function cbIsCreative(text: string): boolean {
  const low = ' ' + text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim() + ' ';
  const words = ['gambar', 'desain', 'video', 'reels', 'poster', 'visual', 'naskah', 'script', 'voice', 'audio', 'musik', 'suara', 'konten', 'caption', 'tulisan', 'artikel', 'copywriting', 'cerita', 'blog', 'film', 'movie', 'carousel', 'talking head'];
  return words.some((w) => low.includes(' ' + w + ' '));
}

function kreatif(): { name: string; color: string; role: string } {
  const ag = (AGENTS as Record<string, { name: string; color: string; role: string }>)['kreatif'];
  return ag || { name: 'Kreatif', color: '#F97316', role: 'Naskah & Brief' };
}

function postKreatif(text: string): void {
  const ag = kreatif();
  postChat('kreatif', ag.name, ag.color, text);
}

function askStep(st: CbState): void {
  let q = '';
  let opts: string[] = [];
  switch (st.step) {
    case 'purpose':
      q = tr('cb.q.purpose');
      opts = [tr('cb.opt.social'), tr('cb.opt.article'), tr('cb.opt.movie')];
      break;
    case 'art-story':
      q = tr('cb.q.art.story');
      opts = [tr('cb.opt.story.aida'), tr('cb.opt.story.pas'), tr('cb.opt.story.bab'), tr('cb.opt.story.fab'), tr('cb.opt.story.golden'), tr('cb.opt.story.hso')];
      break;
    case 'art-pov':
      q = tr('cb.q.art.pov');
      opts = [tr('cb.opt.pov.first'), tr('cb.opt.pov.second'), tr('cb.opt.pov.third')];
      break;
    case 'art-style':
      q = tr('cb.q.art.style');
      opts = [tr('cb.opt.style.casual'), tr('cb.opt.style.formal'), tr('cb.opt.style.inspiring'), tr('cb.opt.style.humor')];
      break;
    case 'art-sentences':
      q = tr('cb.q.art.sentences');
      opts = [tr('cb.opt.len.short'), tr('cb.opt.len.medium'), tr('cb.opt.len.long')];
      break;
    case 'art-audience':
      q = tr('cb.q.art.audience');
      opts = [tr('cb.opt.aud.general'), tr('cb.opt.aud.student'), tr('cb.opt.aud.professional'), tr('cb.opt.aud.umkm')];
      break;
  }
  postKreatif(q + '\n►RECOMMEND: ' + opts.join(' | '));
}

export function cbStart(brief: string): void {
  const st: CbState = { brief, step: 'purpose', answers: {}, attempts: 0 };
  saveState(st);
  askStep(st);
}

function normReply(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function matchPurpose(reply: string): { purpose: 'social' | 'article' | 'movie'; platform?: string } | null {
  const r = normReply(reply);
  const has = (...ws: string[]) => ws.some((w) => r.includes(w));
  if (has('konten sosial media', 'sosial media', 'sosmed', 'social media', 'sosial', 'instagram', 'threads', 'thread', 'linkedin', 'facebook')) {
    let platform: string | undefined;
    if (r.includes('instagram')) platform = 'instagram';
    else if (r.includes('threads') || r.includes('thread')) platform = 'threads';
    else if (r.includes('linkedin')) platform = 'linkedin';
    else if (r.includes('facebook')) platform = 'facebook';
    return { purpose: 'social', platform };
  }
  if (has('artikel blog', 'blog article', 'artikel', 'blog')) return { purpose: 'article' };
  if (has('script movie', 'movie script', 'movie', 'film', 'script')) return { purpose: 'movie' };
  return null;
}

function routerFor(systemInstruction: string): ModelRouter {
  const cfg = defaultRouterConfig();
  try {
    cfg.geminiApiKey = window.localStorage.getItem('minime.geminiKey') || null;
    cfg.metaApiKey = window.localStorage.getItem('minime.metaKey') || null;
  } catch { /* abaikan */ }
  cfg.systemInstruction = systemInstruction;
  return new ModelRouter(cfg);
}

function kreatifSystem(): string {
  const ag = kreatif();
  return MODEL_LANG_INSTRUCTION[getLang()] + ' Kamu adalah ' + ag.name + ' (' + ag.role + ').' + REPORT_FORMAT_INSTRUCTION[getLang()];
}

function footerFor(r: { provider: string; model: string; latencyMs: number; fallbackFrom?: string | null; promptTokens?: number | null; completionTokens?: number | null }): string {
  return (
    ' — ' + tr('chat.footer.via') + ' ' + r.provider + ' ' + r.model + ' · ' + r.latencyMs + 'ms' +
    (r.fallbackFrom ? ' (' + tr('chat.footer.fb') + ' ' + r.fallbackFrom + ')' : '') +
    (r.promptTokens != null || r.completionTokens != null ? ' · ' + (r.promptTokens ?? '—') + '+' + (r.completionTokens ?? '—') + ' token' : '')
  );
}

// v138: cabang Movie/Sosmed belum terpandu — proses langsung dengan pesan
// jujur (bukan jalan buntu): user tetap mendapat hasil sekali jalan.
async function cbDirectGenerate(st: CbState, purposeLabel: string): Promise<void> {
  const ag = kreatif();
  postKreatif(tr('cb.branch.direct', { purpose: purposeLabel }));
  setAgentPhase('kreatif', 'busy');
  try {
    const router = routerFor(kreatifSystem());
    const r = await router.callWithFallback(st.brief, 'trace-cb-direct-' + Date.now());
    recordLiveCost(r);
    postChat('kreatif', ag.name, ag.color, esc(r.text) + footerFor(r));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    postChat('kreatif', ag.name, ag.color, tr('chat.error') + esc(msg) + tr('chat.error.hint'));
  }
  setAgentPhase('kreatif', null);
  clearState();
}

function setArtikel(topic: string, audience: string, output: string): void {
  try {
    const w = window as unknown as Record<string, unknown>;
    if (typeof w.seSetArtikel === 'function') {
      (w.seSetArtikel as (t: string, a: string, o: string) => void)(topic, audience, output);
      return;
    }
  } catch { /* jatuh ke tulis LS langsung */ }
  try {
    const raw = window.localStorage.getItem('minime.scriptEditor');
    const o = raw ? JSON.parse(raw) : {};
    o.menu = 'artikel';
    o.topic = topic;
    o.audience = audience;
    o.output = output;
    o.outputMeta = '';
    o.note = '';
    o.copied = false; o.saved = false; o.used = false;
    window.localStorage.setItem('minime.scriptEditor', JSON.stringify(o));
  } catch { /* abaikan */ }
}

async function cbGenerateArticle(st: CbState): Promise<void> {
  const ag = kreatif();
  const a = st.answers;
  const prompt =
    'Tulis artikel blog berdasarkan brief berikut.\n' +
    'Brief: ' + st.brief + '\n' +
    'Model storytelling: ' + (a['art-story'] || '-') + '\n' +
    'POV: ' + (a['art-pov'] || '-') + '\n' +
    'Gaya bahasa: ' + (a['art-style'] || '-') + '\n' +
    'Jumlah kalimat: ' + (a['art-sentences'] || '-') + '\n' +
    'Segmen audiens: ' + (a['art-audience'] || '-') + '\n' +
    'Tulis artikel lengkap, bukan kerangka.';
  setAgentPhase('kreatif', 'busy');
  try {
    const router = routerFor(kreatifSystem());
    const r = await router.callWithFallback(prompt, 'trace-cb-article-' + Date.now());
    recordLiveCost(r);
    const topic = st.brief.length > 60 ? st.brief.slice(0, 60) : st.brief;
    setArtikel(topic, a['art-audience'] || '', r.text);
    postChat('kreatif', ag.name, ag.color, esc(r.text) + footerFor(r));
    postKreatif(tr('cb.art.done') + '<br><button class="btn btn-sm chat-act" data-act="cb-open-artikel">' + esc(tr('cb.art.open')) + '</button>');
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    postChat('kreatif', ag.name, ag.color, tr('cb.err.gen') + esc(msg));
  }
  setAgentPhase('kreatif', null);
  clearState();
}

export async function cbAnswer(text: string): Promise<void> {
  const st = loadState();
  if (!st) return;
  const reply = text.trim();
  if (!reply) return;
  if (st.step === 'purpose') {
    const m = matchPurpose(reply);
    if (!m) {
      st.attempts += 1;
      if (st.attempts >= 2) {
        clearState();
        postKreatif(tr('cb.q.giveup'));
        return;
      }
      saveState(st);
      // Tanya ulang dengan awalan penanda (satu bubble, tombol tetap ada).
      const q = tr('cb.q.purpose');
      const opts = [tr('cb.opt.social'), tr('cb.opt.article'), tr('cb.opt.movie')];
      postKreatif(tr('cb.q.retry') + ' ' + q + '\n►RECOMMEND: ' + opts.join(' | '));
      return;
    }
    if (m.purpose === 'article') {
      st.step = 'art-story';
      st.attempts = 0;
      saveState(st);
      askStep(st);
      return;
    }
    // v138: Movie/Sosmed belum terpandu — generate langsung + pesan jujur.
    const label = m.purpose === 'social' ? tr('cb.opt.social') : tr('cb.opt.movie');
    if (m.platform) st.platform = m.platform;
    await cbDirectGenerate(st, label);
    return;
  }
  // Langkah Artikel: jawaban apa pun diterima (tombol = jalan pintas,
  // ketik bebas = arahan persis user).
  const next: Record<string, CbStep | 'generate'> = {
    'art-story': 'art-pov',
    'art-pov': 'art-style',
    'art-style': 'art-sentences',
    'art-sentences': 'art-audience',
    'art-audience': 'generate',
  };
  st.answers[st.step] = reply;
  const nx = next[st.step];
  if (nx === 'generate') {
    await cbGenerateArticle(st);
    return;
  }
  st.step = nx as CbStep;
  saveState(st);
  askStep(st);
}
