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
import { AGENTS, libAddScript, postChat, setAgentPhase } from './v5logic.js';
import { getLang, MODEL_LANG_INSTRUCTION, REPORT_FORMAT_INSTRUCTION, tr } from './i18n.js';
import { ModelRouter, defaultRouterConfig } from '../../../src/router';
import { recordLiveCost } from './cost.js';
import { esc } from './esc.js';

const LS = 'minime.creativeBrief';

type CbStep = 'purpose' | 'art-story' | 'art-pov' | 'art-style' | 'art-sentences' | 'art-audience'
  | 'mov-type'
  | 'th-char' | 'th-char-return' | 'th-voice' | 'th-voice-return' | 'th-set'
  | 'promo-goal' | 'promo-board-ok' | 'promo-board-rev' | 'promo-vo' | 'promo-voice-type' | 'promo-voice-return'
  | 'ser-parts' | 'ser-board' | 'ser-board-rev'
  | 'soc-platform' | 'soc-format' | 'soc-purpose' | 'soc-approach-img' | 'soc-approach-car' | 'soc-count' | 'soc-bulk-n';

type CbMode = 'th' | 'promo' | 'ser';

interface CbState {
  brief: string;
  step: CbStep;
  answers: Record<string, string>;
  attempts: number;
  platform?: string;
  mode?: CbMode;
  script?: string;
  board?: string;
  partsTotal?: number;
  partIndex?: number;
  longScript?: string;
}

function loadState(): CbState | null {
  try {
    const raw = window.localStorage.getItem(LS);
    if (!raw) return null;
    const o = JSON.parse(raw) as Partial<CbState>;
    if (!o || typeof o.brief !== 'string' || typeof o.step !== 'string') return null;
    const steps: CbStep[] = ['purpose', 'art-story', 'art-pov', 'art-style', 'art-sentences', 'art-audience',
      'mov-type', 'th-char', 'th-char-return', 'th-voice', 'th-voice-return', 'th-set',
      'promo-goal', 'promo-board-ok', 'promo-board-rev', 'promo-vo', 'promo-voice-type', 'promo-voice-return',
      'ser-parts', 'ser-board', 'ser-board-rev',
      'soc-platform', 'soc-format', 'soc-purpose', 'soc-approach-img', 'soc-approach-car', 'soc-count', 'soc-bulk-n'];
    if (!steps.includes(o.step as CbStep)) return null;
    return { brief: o.brief, step: o.step as CbStep, answers: o.answers || {}, attempts: o.attempts || 0, platform: o.platform, mode: o.mode, script: o.script, board: o.board, partsTotal: o.partsTotal, partIndex: o.partIndex, longScript: o.longScript };
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

function askStep(st: CbState, prefix = ''): void {
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
    case 'mov-type':
      q = tr('cb.q.movtype');
      opts = [tr('cb.opt.mov.talking'), tr('cb.opt.mov.promo'), tr('cb.opt.mov.edu'), tr('cb.opt.mov.comedy'), tr('cb.opt.mov.series')];
      break;
    case 'th-char':
      q = tr('cb.q.th.char');
      opts = [tr('cb.opt.thchar.orig'), tr('cb.opt.thchar.gen')];
      break;
    case 'th-voice':
      q = tr('cb.q.th.voice');
      opts = [tr('cb.opt.thvoice.clone'), tr('cb.opt.thvoice.gen')];
      break;
    case 'th-set':
      q = tr('cb.q.th.set');
      opts = [tr('cb.opt.set.studio'), tr('cb.opt.set.office'), tr('cb.opt.set.plain')];
      break;
    case 'promo-goal':
      q = tr('cb.q.promo.goal');
      opts = [tr('cb.opt.goal.awareness'), tr('cb.opt.goal.leads'), tr('cb.opt.goal.closing')];
      break;
    case 'promo-board-ok':
    case 'ser-board':
      q = tr('cb.q.board.approve');
      opts = [tr('cb.opt.board.yes'), tr('cb.opt.board.rev')];
      break;
    case 'promo-board-rev':
    case 'ser-board-rev':
      q = tr('cb.q.board.rev');
      opts = [];
      break;
    case 'promo-vo':
      q = tr('cb.q.promo.vo');
      opts = [tr('cb.opt.vo.yes'), tr('cb.opt.vo.no')];
      break;
    case 'promo-voice-type':
      q = tr('cb.q.promo.voicetype');
      opts = [tr('cb.opt.vo.clone'), tr('cb.opt.vo.gen')];
      break;
    case 'ser-parts':
      q = tr('cb.q.ser.parts');
      opts = [];
      break;
    case 'soc-platform':
      q = tr('cb.q.soc.platform');
      opts = [tr('cb.opt.plat.threads'), tr('cb.opt.plat.instagram'), tr('cb.opt.plat.linkedin'), tr('cb.opt.plat.facebook')];
      break;
    case 'soc-format':
      q = tr('cb.q.soc.format');
      opts = [tr('cb.opt.fmt.image'), tr('cb.opt.fmt.carousel'), tr('cb.opt.fmt.reels')];
      break;
    case 'soc-purpose':
      q = tr('cb.q.soc.purpose');
      opts = [tr('cb.opt.soc.promo'), tr('cb.opt.soc.awareness'), tr('cb.opt.soc.leads')];
      break;
    case 'soc-approach-img':
      q = tr('cb.q.soc.approach');
      opts = [tr('cb.opt.appr.info'), tr('cb.opt.appr.humor'), tr('cb.opt.appr.motiv')];
      break;
    case 'soc-approach-car':
      q = tr('cb.q.soc.approach');
      opts = [tr('cb.opt.appr.info'), tr('cb.opt.appr.list'), tr('cb.opt.appr.humor'), tr('cb.opt.appr.motiv')];
      break;
    case 'soc-count':
      q = tr('cb.q.soc.count');
      opts = [tr('cb.opt.count.single'), tr('cb.opt.count.bulk')];
      break;
    case 'soc-bulk-n':
      q = tr('cb.q.soc.bulkn');
      opts = [];
      break;
    default:
      // Langkah tunggu (th-char-return, th-voice-return, promo-voice-return)
      // tidak pernah menanyakan apa pun — mereka maju saat user kembali
      // mengirim pesan.
      return;
  }
  postKreatif((prefix ? prefix + ' ' : '') + q + (opts.length ? '\n►RECOMMEND: ' + opts.join(' | ') : ''));
}

// Langkah pilihan yang tidak dikenali: tanya ulang sekali (dengan awalan),
// kedua kalinya hentikan alur dengan pesan jelas (pola yang sama dengan
// purpose di v138).
function unmatchedOption(st: CbState): boolean {
  st.attempts += 1;
  if (st.attempts >= 2) {
    clearState();
    postKreatif(tr('cb.q.giveup'));
    return true;
  }
  saveState(st);
  askStep(st, tr('cb.q.retry'));
  return false;
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

function matchMovieType(reply: string): 'talking' | 'promo' | 'edu' | 'comedy' | 'series' | null {
  const r = normReply(reply);
  const has = (...ws: string[]) => ws.some((w) => r.includes(w));
  if (has('talking head', 'talking', '口播')) return 'talking';
  if (has('video promosional', 'promotional video', 'promosional', 'promo', '宣传')) return 'promo';
  if (has('video edukasi', 'educational video', 'edukasi', 'edukatif', '教育')) return 'edu';
  if (has('video komedi', 'comedy video', 'komedi', 'lucu', '喜剧')) return 'comedy';
  if (has('video berseri', 'series video', 'berseri', 'series', '系列')) return 'series';
  return null;
}

function matchApprove(reply: string): 'yes' | 'rev' | null {
  const r = normReply(reply);
  if (r.includes('setuju') || r.includes('approve') || r.includes('批准')) return 'yes';
  if (r.includes('revisi') || r.includes('revise') || r.includes('修改')) return 'rev';
  return null;
}

// Pencocokan Ya/Tidak memakai batas kata (Latin) supaya 'ya' tidak
// tercocok di dalam 'saya'; CJK dicocokkan substring (tanpa spasi kata).
function matchYesNo(reply: string): 'yes' | 'no' | null {
  const r = normReply(reply);
  const p = ' ' + r + ' ';
  if (p.includes(' tidak ') || p.includes(' tanpa ') || p.includes(' not needed ') || r.includes('不需要')) return 'no';
  if (p.includes(' ya ') || p.includes(' butuh ') || p.includes(' perlu ') || p.includes(' yes ') || r.includes('是')) return 'yes';
  return null;
}

function openButton(act: string, labelKey: string): string {
  return '<br><button class="btn btn-sm chat-act" data-act="' + act + '">' + esc(tr(labelKey)) + '</button>';
}

function setImageBrief(text: string): void {
  try {
    const w = window as unknown as Record<string, unknown>;
    if (typeof w.imgSetBrief === 'function') (w.imgSetBrief as (t: string) => void)(text);
  } catch { /* abaikan */ }
}

function topicOf(st: CbState): string {
  return st.brief.length > 60 ? st.brief.slice(0, 60) : st.brief;
}

function saveLib(title: string, content: string): void {
  try { libAddScript(title, content); } catch { /* abaikan */ }
}

async function genText(prompt: string, trace: string): Promise<{ text: string; footer: string }> {
  const router = routerFor(kreatifSystem());
  const r = await router.callWithFallback(prompt, trace);
  recordLiveCost(r);
  return { text: r.text, footer: footerFor(r) };
}

function postGenError(e: unknown): void {
  const msg = e instanceof Error ? e.message : String(e);
  const ag = kreatif();
  postChat('kreatif', ag.name, ag.color, tr('chat.error') + esc(msg) + tr('chat.error.hint'));
}

// Talking head: naskah audio + rencana produksi + caption/hashtag dalam
// satu model call; hasil disimpan di Library, render dilakukan user di
// Video Editor (editor penuh, tidak di-drive dari chat).
async function cbGenerateTH(st: CbState): Promise<void> {
  const a = st.answers;
  setAgentPhase('kreatif', 'busy');
  try {
    const t = await genText(
      'Buat naskah audio + rencana produksi talking head.\nBrief: ' + st.brief +
      '\nKarakter: ' + (a['th-char'] || '-') + '\nSuara: ' + (a['th-voice'] || '-') +
      '\nSet/ruangan: ' + (a['th-set'] || '-') + '\nCatatan user: ' + (a['th-char-note'] || '-') + ' / ' + (a['th-voice-note'] || '-') +
      '\nKeluarkan: (1) naskah audio lengkap, (2) rencana produksi (judul, subtitle dari naskah audio, elemen grafis), (3) caption post + hashtag dari script.',
      'trace-cb-th-' + Date.now());
    saveLib('Talking Head: ' + topicOf(st), t.text);
    const ag = kreatif();
    postChat('kreatif', ag.name, ag.color, esc(t.text) + t.footer);
    postKreatif(tr('cb.mov.done') + openButton('cb-open-video', 'cb.open.video'));
  } catch (e) { postGenError(e); }
  setAgentPhase('kreatif', null);
  clearState();
}

// Promosional: script (model storytelling dipilih model sesuai tujuan),
// lalu storyboard dari script itu; persetujuan ditanyakan pemanggil.
async function cbPromoScriptBoard(st: CbState): Promise<void> {
  const goal = st.answers['promo-goal'] || '-';
  setAgentPhase('kreatif', 'busy');
  try {
    const sc = await genText(
      'Tulis script video promosional.\nBrief: ' + st.brief + '\nTujuan: ' + goal +
      '\nPilih model storytelling yang paling sesuai untuk tujuan ini dan tulis script lengkap.',
      'trace-cb-promo-script-' + Date.now());
    st.script = sc.text;
    const ag = kreatif();
    postChat('kreatif', ag.name, ag.color, esc(sc.text) + sc.footer);
    const b = await genText(
      'Buat storyboard dari script berikut (daftar scene: visual, audio, teks layar, durasi).\nScript:\n' + sc.text,
      'trace-cb-promo-board-' + Date.now());
    st.board = b.text;
    postChat('kreatif', ag.name, ag.color, esc(b.text) + b.footer);
    st.step = 'promo-board-ok';
    st.attempts = 0;
    saveState(st);
    askStep(st);
  } catch (e) { postGenError(e); clearState(); }
  setAgentPhase('kreatif', null);
}

async function cbRegenBoard(st: CbState, note: string): Promise<void> {
  setAgentPhase('kreatif', 'busy');
  try {
    const base = st.mode === 'ser'
      ? ('Script panjang:\n' + (st.longScript || '') + '\nFokus part ke-' + ((st.partIndex || 0) + 1) + ' dari ' + (st.partsTotal || 1))
      : ('Script:\n' + (st.script || ''));
    const b = await genText('Buat ulang storyboard dengan catatan revisi: ' + note + '\n' + base, 'trace-cb-board-rev-' + Date.now());
    st.board = b.text;
    const ag = kreatif();
    postChat('kreatif', ag.name, ag.color, esc(b.text) + b.footer);
    st.step = st.mode === 'ser' ? 'ser-board' : 'promo-board-ok';
    st.attempts = 0;
    saveState(st);
    askStep(st);
  } catch (e) { postGenError(e); clearState(); }
  setAgentPhase('kreatif', null);
}

// Mixing (ekor promosional + berseri): rencana perakitan video utuh +
// caption/hashtag; render tetap di Video Editor oleh user.
async function cbGenerateMix(st: CbState): Promise<void> {
  setAgentPhase('kreatif', 'busy');
  try {
    const vo = st.answers['promo-vo'] || '-';
    const voType = st.answers['promo-voice-type'] || '-';
    const base = st.mode === 'ser'
      ? ('Video berseri ' + (st.partsTotal || 1) + ' part. Script panjang:\n' + (st.longScript || ''))
      : ('Script:\n' + (st.script || '') + '\nStoryboard:\n' + (st.board || ''));
    const m = await genText(
      'Buat rencana mixing + perakitan video utuh dari materi berikut. Sertakan: urutan video, VO, music, SFX, title, subtitle, logo, elemen visual lain, lalu caption post + hashtag dari script.\nVO: ' + vo + ' (' + voType + ')\n' + base,
      'trace-cb-mix-' + Date.now());
    saveLib((st.mode === 'ser' ? 'Video Berseri: ' : 'Video Promosional: ') + topicOf(st), m.text);
    const ag = kreatif();
    postChat('kreatif', ag.name, ag.color, esc(m.text) + m.footer);
    postKreatif(tr('cb.mov.done') + openButton('cb-open-video', 'cb.open.video'));
  } catch (e) { postGenError(e); }
  setAgentPhase('kreatif', null);
  clearState();
}

async function cbSerStart(st: CbState, count: number): Promise<void> {
  st.partsTotal = count;
  st.partIndex = 0;
  setAgentPhase('kreatif', 'busy');
  try {
    const sc = await genText(
      'Buat script video berseri ' + count + ' part dari brief berikut. Buat script PANJANG yang terbagi jelas per part (tandai tiap part).\nBrief: ' + st.brief,
      'trace-cb-ser-script-' + Date.now());
    st.longScript = sc.text;
    const ag = kreatif();
    postChat('kreatif', ag.name, ag.color, esc(sc.text) + sc.footer);
    const b = await genText(
      'Buat storyboard untuk PART 1 dari ' + count + ' part dari script panjang berikut.\nScript:\n' + sc.text,
      'trace-cb-ser-board1-' + Date.now());
    st.board = b.text;
    postChat('kreatif', ag.name, ag.color, esc(b.text) + b.footer);
    st.step = 'ser-board';
    st.attempts = 0;
    saveState(st);
    askStep(st);
  } catch (e) { postGenError(e); clearState(); }
  setAgentPhase('kreatif', null);
}

async function cbSerNextBoard(st: CbState): Promise<void> {
  setAgentPhase('kreatif', 'busy');
  try {
    const b = await genText(
      'Buat storyboard untuk PART ' + ((st.partIndex || 0) + 1) + ' dari ' + (st.partsTotal || 1) + ' part dari script panjang berikut.\nScript:\n' + (st.longScript || ''),
      'trace-cb-ser-board-' + Date.now());
    st.board = b.text;
    const ag = kreatif();
    postChat('kreatif', ag.name, ag.color, esc(b.text) + b.footer);
    st.step = 'ser-board';
    st.attempts = 0;
    saveState(st);
    askStep(st);
  } catch (e) { postGenError(e); clearState(); }
  setAgentPhase('kreatif', null);
}

// v140: cabang Sosmed terpandu.
function matchPlatform(reply: string): string | null {
  const r = normReply(reply);
  if (r.includes('threads') || r.includes('thread')) return 'threads';
  if (r.includes('instagram')) return 'instagram';
  if (r.includes('linkedin')) return 'linkedin';
  if (r.includes('facebook')) return 'facebook';
  return null;
}

function matchSocFormat(reply: string): 'image' | 'carousel' | 'reels' | null {
  const r = normReply(reply);
  if (r.includes('carousel')) return 'carousel';
  if (r.includes('reels')) return 'reels';
  if (r.includes('image') || r.includes('gambar')) return 'image';
  return null;
}

function matchSocPurpose(reply: string): string | null {
  const r = normReply(reply);
  if (r.includes('leads')) return tr('cb.opt.soc.leads');
  if (r.includes('awareness')) return tr('cb.opt.soc.awareness');
  if (r.includes('promosional') || r.includes('promo')) return tr('cb.opt.soc.promo');
  return null;
}

function matchSocCount(reply: string): 'single' | 'bulk' | null {
  const r = ' ' + normReply(reply) + ' ';
  if (r.includes(' bulk ')) return 'bulk';
  if (r.includes(' satu ') || r.includes(' single ')) return 'single';
  return null;
}

// Bagi teks Threads menjadi bagian-bagian @ maks 500 karakter: rakus per
// kalimat dulu; kalimat yang sendirian melebihi batas dipotong per kata.
function splitThreads(text: string, max = 500): string[] {
  const parts: string[] = [];
  const sentences = text.split(/(?<=[.!?])\s+/).filter((x) => x.trim());
  let cur = '';
  const pushCur = () => { if (cur) parts.push(cur); cur = ''; };
  for (const sen of sentences) {
    if ((cur ? cur + ' ' + sen : sen).length <= max) { cur = cur ? cur + ' ' + sen : sen; continue; }
    pushCur();
    if (sen.length <= max) { cur = sen; continue; }
    let wcur = '';
    for (const w of sen.split(/\s+/)) {
      if ((wcur ? wcur + ' ' + w : w).length <= max) { wcur = wcur ? wcur + ' ' + w : w; continue; }
      if (wcur) parts.push(wcur);
      wcur = w.length <= max ? w : w.slice(0, max);
    }
    cur = wcur;
  }
  pushCur();
  return parts.length ? parts : [text];
}

function setBulkBriefs(briefs: string[]): void {
  try {
    const w = window as unknown as Record<string, unknown>;
    if (typeof w.imgSetBulk === 'function') {
      (w.imgSetBulk as (b: string[]) => void)(briefs);
      return;
    }
  } catch { /* jatuh ke brief tunggal */ }
  if (briefs[0]) setImageBrief(briefs[0]);
}

function parseBulkPlans(text: string, kind: 'IMAGE' | 'CAROUSEL'): string[] {
  const parts = text.split(new RegExp('^=== ' + kind + ' \\d+ ===$', 'm')).map((x) => x.trim()).filter(Boolean);
  return parts.length ? parts : [text];
}

// Threads: script disesuaikan 500 karakter; bila tidak muat, dibagi
// beberapa bagian @ maks 500 karakter (nomor urut di depan tiap bagian).
async function cbGenerateThreads(st: CbState): Promise<void> {
  setAgentPhase('kreatif', 'busy');
  try {
    const t = await genText(
      'Buat script Threads dari brief berikut. Script harus muat dalam 500 karakter; bila tidak muat, tulis versi lengkapnya saja (pemotongan dilakukan sesudahnya).\nBrief: ' + st.brief,
      'trace-cb-threads-' + Date.now());
    const ag = kreatif();
    if (t.text.length <= 500) {
      postChat('kreatif', ag.name, ag.color, esc(t.text) + t.footer);
      saveLib('Threads: ' + topicOf(st), t.text);
    } else {
      const parts = splitThreads(t.text);
      parts.forEach((p, i) => postChat('kreatif', ag.name, ag.color, esc('(' + (i + 1) + '/' + parts.length + ') ' + p) + (i === parts.length - 1 ? t.footer : '')));
      saveLib('Threads: ' + topicOf(st), parts.join('\n\n---\n\n'));
    }
    postKreatif(tr('cb.soc.threads.done'));
  } catch (e) { postGenError(e); }
  setAgentPhase('kreatif', null);
  clearState();
}

// Image: tujuan -> pendekatan (dari riset) -> script -> caption + rancangan
// isi image (Title, Subtitle, Body, header, footer, logo, elemen visual).
// Bulk: N rencana jadi N tab Image Editor (maks 30).
async function cbGenerateImagePlan(st: CbState, bulk: boolean, count: number): Promise<void> {
  const a = st.answers;
  const platform = st.platform || '-';
  setAgentPhase('kreatif', 'busy');
  try {
    const ag = kreatif();
    if (!bulk) {
      const t = await genText(
        'Buat caption + rancangan image untuk postingan sosmed (IMAGE-PLAN).\nBrief: ' + st.brief + '\nPlatform: ' + platform + '\nTujuan: ' + (a['soc-purpose'] || '-') + '\nPendekatan: ' + (a['soc-approach'] || '-') +
        '\nKeluarkan: caption lengkap + rancangan isi image (Title, Subtitle, Body, header, footer, logo, elemen visual lain).',
        'trace-cb-img-' + Date.now());
      postChat('kreatif', ag.name, ag.color, esc(t.text) + t.footer);
      setImageBrief(t.text);
      saveLib('Image: ' + topicOf(st), t.text);
    } else {
      const t = await genText(
        'Buat ' + count + ' rencana image untuk postingan sosmed bulk (BULK-IMAGE-PLAN). Pisahkan tiap rencana dengan baris === IMAGE n === (n = nomor urut).\nBrief: ' + st.brief + '\nPlatform: ' + platform + '\nTujuan: ' + (a['soc-purpose'] || '-') + '\nPendekatan: ' + (a['soc-approach'] || '-') +
        '\nTiap rencana berisi: caption + rancangan isi image (Title, Subtitle, Body, header, footer, logo, elemen visual lain).',
        'trace-cb-img-bulk-' + Date.now());
      const plans = parseBulkPlans(t.text, 'IMAGE').slice(0, 30);
      setBulkBriefs(plans);
      postChat('kreatif', ag.name, ag.color, esc(plans.join('\n\n---\n\n')) + t.footer);
      saveLib('Bulk Image: ' + topicOf(st), plans.join('\n\n---\n\n'));
    }
    postKreatif(tr('cb.soc.done') + openButton('cb-open-image', 'cb.open.image'));
  } catch (e) { postGenError(e); }
  setAgentPhase('kreatif', null);
  clearState();
}

// Carousel: sama seperti Image, beda pendekatan (tambah Listicle) dan
// script jadi caption sekaligus konten carousel 6-10 slide.
async function cbGenerateCarousel(st: CbState, bulk: boolean, count: number): Promise<void> {
  const a = st.answers;
  const platform = st.platform || '-';
  setAgentPhase('kreatif', 'busy');
  try {
    const ag = kreatif();
    if (!bulk) {
      const t = await genText(
        'Buat caption + konten carousel untuk postingan sosmed (CAROUSEL-PLAN).\nBrief: ' + st.brief + '\nPlatform: ' + platform + '\nTujuan: ' + (a['soc-purpose'] || '-') + '\nPendekatan: ' + (a['soc-approach'] || '-') +
        '\nKeluarkan: caption lengkap + konten carousel 6-10 slide (tiap slide: judul + isi singkat).',
        'trace-cb-car-' + Date.now());
      postChat('kreatif', ag.name, ag.color, esc(t.text) + t.footer);
      setImageBrief(t.text);
      saveLib('Carousel: ' + topicOf(st), t.text);
    } else {
      const t = await genText(
        'Buat ' + count + ' konten carousel untuk postingan sosmed bulk (BULK-CAROUSEL-PLAN). Pisahkan tiap carousel dengan baris === CAROUSEL n === (n = nomor urut).\nBrief: ' + st.brief + '\nPlatform: ' + platform + '\nTujuan: ' + (a['soc-purpose'] || '-') + '\nPendekatan: ' + (a['soc-approach'] || '-') +
        '\nTiap carousel berisi: caption + konten 6-10 slide (tiap slide: judul + isi singkat).',
        'trace-cb-car-bulk-' + Date.now());
      const plans = parseBulkPlans(t.text, 'CAROUSEL').slice(0, 30);
      setBulkBriefs(plans);
      postChat('kreatif', ag.name, ag.color, esc(plans.join('\n\n---\n\n')) + t.footer);
      saveLib('Bulk Carousel: ' + topicOf(st), plans.join('\n\n---\n\n'));
    }
    postKreatif(tr('cb.soc.done') + openButton('cb-open-image', 'cb.open.image'));
  } catch (e) { postGenError(e); }
  setAgentPhase('kreatif', null);
  clearState();
}

// Reels: seperti proses pembuatan video, durasi 30-60 detik, rasio 9:16;
// rencana disiapkan di chat, render dilakukan user di Video Editor.
async function cbGenerateReels(st: CbState): Promise<void> {
  setAgentPhase('kreatif', 'busy');
  try {
    const t = await genText(
      'Buat rencana reels untuk postingan sosmed (REELS-PLAN), seperti proses pembuatan video: script + shot plan + caption + hashtag.\nBrief: ' + st.brief + '\nPlatform: ' + (st.platform || '-') +
      '\nDurasi 30-60 detik, rasio 9:16.',
      'trace-cb-reels-' + Date.now());
    const ag = kreatif();
    postChat('kreatif', ag.name, ag.color, esc(t.text) + t.footer);
    saveLib('Reels: ' + topicOf(st), t.text);
    postKreatif(tr('cb.mov.done') + openButton('cb-open-video', 'cb.open.video'));
  } catch (e) { postGenError(e); }
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
      if (unmatchedOption(st)) return;
      return;
    }
    if (m.purpose === 'article') {
      st.step = 'art-story';
      st.attempts = 0;
      saveState(st);
      askStep(st);
      return;
    }
    if (m.purpose === 'movie') {
      st.step = 'mov-type';
      st.attempts = 0;
      saveState(st);
      askStep(st);
      return;
    }
    // Sosmed terpandu (v140): platform dulu (atau langsung format bila
    // platform sudah disebut di jawaban purpose; Threads langsung generate).
    if (m.platform) st.platform = m.platform;
    if (m.platform === 'threads') {
      await cbGenerateThreads(st);
      return;
    }
    st.step = m.platform ? 'soc-format' : 'soc-platform';
    st.attempts = 0;
    saveState(st);
    askStep(st);
    return;
  }
  if (st.step === 'mov-type') {
    const t = matchMovieType(reply);
    if (!t) {
      unmatchedOption(st);
      return;
    }
    if (t === 'talking') {
      st.mode = 'th';
      st.step = 'th-char';
      st.attempts = 0;
      saveState(st);
      askStep(st);
      return;
    }
    if (t === 'promo') {
      st.mode = 'promo';
      st.step = 'promo-goal';
      st.attempts = 0;
      saveState(st);
      askStep(st);
      return;
    }
    if (t === 'series') {
      st.mode = 'ser';
      st.step = 'ser-parts';
      st.attempts = 0;
      saveState(st);
      askStep(st);
      return;
    }
    // Edukasi/Komedi: spec Patria belum ditulis — generate langsung jujur.
    const label = t === 'edu' ? tr('cb.opt.mov.edu') : tr('cb.opt.mov.comedy');
    await cbDirectGenerate(st, label);
    return;
  }
  // Cabang Artikel (v138, tak berubah): jawaban apa pun diterima.
  if (st.step.startsWith('art-')) {
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
    return;
  }
  // Cabang Movie (v139).
  switch (st.step) {
    case 'th-char': {
      st.answers['th-char'] = reply;
      postKreatif(tr('cb.th.char.open') + openButton('cb-open-image', 'cb.open.image'));
      setImageBrief('Character sheet talking head untuk: ' + st.brief + '. Sumber karakter: ' + reply + '.');
      st.step = 'th-char-return';
      saveState(st);
      return;
    }
    case 'th-char-return': {
      st.answers['th-char-note'] = reply;
      st.step = 'th-voice';
      saveState(st);
      askStep(st);
      return;
    }
    case 'th-voice': {
      st.answers['th-voice'] = reply;
      postKreatif(tr('cb.th.voice.open') + openButton('cb-open-voice', 'cb.open.voice'));
      st.step = 'th-voice-return';
      saveState(st);
      return;
    }
    case 'th-voice-return': {
      st.answers['th-voice-note'] = reply;
      st.step = 'th-set';
      saveState(st);
      askStep(st);
      return;
    }
    case 'th-set': {
      st.answers['th-set'] = reply;
      await cbGenerateTH(st);
      return;
    }
    case 'promo-goal': {
      st.answers['promo-goal'] = reply;
      await cbPromoScriptBoard(st);
      return;
    }
    case 'promo-board-ok': {
      const ap = matchApprove(reply);
      if (!ap) {
        unmatchedOption(st);
        return;
      }
      if (ap === 'rev') {
        st.step = 'promo-board-rev';
        saveState(st);
        askStep(st);
        return;
      }
      saveLib('Storyboard: ' + topicOf(st), st.board || '');
      st.step = 'promo-vo';
      saveState(st);
      askStep(st);
      return;
    }
    case 'promo-board-rev': {
      await cbRegenBoard(st, reply);
      return;
    }
    case 'promo-vo': {
      const yn = matchYesNo(reply);
      if (!yn) {
        unmatchedOption(st);
        return;
      }
      if (yn === 'no') {
        await cbGenerateMix(st);
        return;
      }
      st.answers['promo-vo'] = reply;
      st.step = 'promo-voice-type';
      saveState(st);
      askStep(st);
      return;
    }
    case 'promo-voice-type': {
      st.answers['promo-voice-type'] = reply;
      postKreatif(tr('cb.th.voice.open') + openButton('cb-open-voice', 'cb.open.voice'));
      st.step = 'promo-voice-return';
      saveState(st);
      return;
    }
    case 'promo-voice-return': {
      st.answers['promo-voice-note'] = reply;
      await cbGenerateMix(st);
      return;
    }
    case 'ser-parts': {
      const n = parseInt(reply.replace(/[^0-9]/g, ''), 10);
      if (!n || n < 1) {
        unmatchedOption(st);
        return;
      }
      await cbSerStart(st, n);
      return;
    }
    case 'ser-board': {
      const ap = matchApprove(reply);
      if (!ap) {
        unmatchedOption(st);
        return;
      }
      if (ap === 'rev') {
        st.step = 'ser-board-rev';
        saveState(st);
        askStep(st);
        return;
      }
      saveLib('Storyboard Part ' + ((st.partIndex || 0) + 1) + ': ' + topicOf(st), st.board || '');
      st.partIndex = (st.partIndex || 0) + 1;
      if ((st.partIndex || 0) < (st.partsTotal || 1)) {
        await cbSerNextBoard(st);
        return;
      }
      // Semua part selesai — ekor yang sama dengan promosional (VO, mix).
      st.step = 'promo-vo';
      saveState(st);
      askStep(st);
      return;
    }
    case 'ser-board-rev': {
      await cbRegenBoard(st, reply);
      return;
    }
    // Cabang Sosmed (v140).
    case 'soc-platform': {
      const p = matchPlatform(reply);
      if (!p) {
        unmatchedOption(st);
        return;
      }
      st.platform = p;
      if (p === 'threads') {
        await cbGenerateThreads(st);
        return;
      }
      st.step = 'soc-format';
      st.attempts = 0;
      saveState(st);
      askStep(st);
      return;
    }
    case 'soc-format': {
      const f = matchSocFormat(reply);
      if (!f) {
        unmatchedOption(st);
        return;
      }
      st.answers['soc-format'] = f;
      if (f === 'reels') {
        await cbGenerateReels(st);
        return;
      }
      st.step = 'soc-purpose';
      st.attempts = 0;
      saveState(st);
      askStep(st);
      return;
    }
    case 'soc-purpose': {
      const p = matchSocPurpose(reply);
      if (!p) {
        unmatchedOption(st);
        return;
      }
      st.answers['soc-purpose'] = p;
      st.step = st.answers['soc-format'] === 'carousel' ? 'soc-approach-car' : 'soc-approach-img';
      st.attempts = 0;
      saveState(st);
      askStep(st);
      return;
    }
    case 'soc-approach-img':
    case 'soc-approach-car': {
      // Pendekatan = arahan kreatif: tombol adalah saran, ketik bebas
      // diterima sebagai arahan apa adanya (seperti th-set di v139).
      st.answers['soc-approach'] = reply;
      st.step = 'soc-count';
      st.attempts = 0;
      saveState(st);
      askStep(st);
      return;
    }
    case 'soc-count': {
      const c = matchSocCount(reply);
      if (!c) {
        unmatchedOption(st);
        return;
      }
      if (c === 'single') {
        if (st.answers['soc-format'] === 'carousel') await cbGenerateCarousel(st, false, 1);
        else await cbGenerateImagePlan(st, false, 1);
        return;
      }
      st.step = 'soc-bulk-n';
      st.attempts = 0;
      saveState(st);
      askStep(st);
      return;
    }
    case 'soc-bulk-n': {
      const n = parseInt(reply.replace(/[^0-9]/g, ''), 10);
      if (!n || n < 1) {
        unmatchedOption(st);
        return;
      }
      const count = n > 30 ? 30 : n;
      if (n > 30) postKreatif(tr('cb.soc.bulkcap'));
      if (st.answers['soc-format'] === 'carousel') await cbGenerateCarousel(st, true, count);
      else await cbGenerateImagePlan(st, true, count);
      return;
    }
    default:
      return;
  }
}
