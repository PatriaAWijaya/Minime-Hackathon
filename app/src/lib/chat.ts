// B3 — real chat wiring for the Tauri frontend.
//
// The composer, quickChat chips, and Enter key all funnel through
// v5logic's sendChat(), which B3 turns into a delegate: when
// setSendChatImpl() has installed this module's sendChatReal, every
// path calls the real router instead of the v5 dummy replies.
//
// Keys live ONLY in this device's localStorage, entered by the user in
// Settings. They are never baked into the bundle, never committed,
// and never sent anywhere except the provider's own API endpoint.
// No key -> that provider is skipped by the chain (LiveUnavailableError
// -> fallthrough), exactly like the Node fase runners.
import { ModelRouter, defaultRouterConfig } from '../../../src/router';
import { AGENTS, activateAgent, mediaTab, postChat, showView } from './v5logic.js';
import { getLang, MODEL_LANG_INSTRUCTION, tr } from './i18n.js';
import { POSTIZ_KEY_LS, readPostizKey } from './postiz.js';

const GEMINI_KEY_LS = 'minime.geminiKey';
const META_KEY_LS = 'minime.metaKey';

export function readKeys(): { gemini: string | null; meta: string | null } {
  try {
    return {
      gemini: window.localStorage.getItem(GEMINI_KEY_LS) || null,
      meta: window.localStorage.getItem(META_KEY_LS) || null,
    };
  } catch {
    return { gemini: null, meta: null };
  }
}

export function keyStatusText(): string {
  const k = readKeys();
  return (
    'Gemini: ' + (k.gemini ? tr('key.saved') : tr('key.empty')) +
    ' · Meta: ' + (k.meta ? tr('key.saved') : tr('key.empty')) +
    ' · Postiz: ' + (readPostizKey() ? tr('key.saved') : tr('key.empty')) +
    ' · ' + tr('key.ollama.short')
  );
}

export function updateKeyStatus(): void {
  const el = document.getElementById('keyStatus');
  if (el) el.textContent = keyStatusText();
}

export function saveKeys(): void {
  const g = document.getElementById('apiKeyGemini') as HTMLInputElement | null;
  const m = document.getElementById('apiKeyMeta') as HTMLInputElement | null;
  const p = document.getElementById('apiKeyPostiz') as HTMLInputElement | null;
  try {
    if (g && g.value.trim()) window.localStorage.setItem(GEMINI_KEY_LS, g.value.trim());
    if (m && m.value.trim()) window.localStorage.setItem(META_KEY_LS, m.value.trim());
    if (p && p.value.trim()) window.localStorage.setItem(POSTIZ_KEY_LS, p.value.trim());
    if (g) g.value = '';
    if (m) m.value = '';
    if (p) p.value = '';
  } catch {
    // storage unavailable: keys simply stay unset for this session
  }
  updateKeyStatus();
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* Orkestrasi chat (perintah Patria 28 Okt 18:58).
   Alur: user -> Prime menyapa ramah (mengerti + melaksanakan) ->
   bila perlu, Prime mendelegasikan (terlihat sebagai chat) -> agen
   penerima AKTIF di list (activateAgent) + membalas Prime -> agen
   menunjukkan hasil di chat -> bila perlu Media Studio, agen memberi
   tahu + tombol Approve; window PINDAH ke studio HANYA sesudah user
   mengetuk Approve. Skill panggil studio: HANYA Prime + Kreatif.
   Peta kata kunci di bawah PROVISIONAL — user bisa mengubahnya. */
type AgentKey = 'riset' | 'strategi' | 'kreatif' | 'media' | 'distribusi';

const DELEGATE_RULES: Array<{ key: AgentKey; words: string[] }> = [
  { key: 'riset', words: ['riset', 'penelitian', 'data', 'survey', 'survei', 'tren', 'research'] },
  { key: 'strategi', words: ['strategi', 'stp', 'brand', 'positioning', 'segmentasi', 'targeting', 'merek'] },
  // Produksi kreatif (termasuk gambar/video) diarahkan ke Kreatif,
  // BUKAN ke Media — karena hanya Prime + Kreatif yang boleh
  // memanggil Media Studio (aturan skill Patria).
  { key: 'kreatif', words: ['konten', 'caption', 'naskah', 'tulisan', 'artikel', 'copywriting', 'cerita', 'gambar', 'desain', 'video', 'reels', 'poster', 'visual', 'script'] },
  { key: 'distribusi', words: ['distribusi', 'jadwal posting', 'posting', 'jadwal terbit', 'channel'] },
  { key: 'media', words: ['aset media', 'status produksi', 'daftar media'] },
];

const MEDIA_WORDS = ['gambar', 'desain', 'video', 'reels', 'poster', 'visual', 'naskah', 'script', 'voice', 'audio', 'musik', 'suara'];

export function delegateFor(text: string): AgentKey | null {
  const low = text.toLowerCase();
  for (const rule of DELEGATE_RULES) {
    if (rule.words.some((w) => low.includes(w))) return rule.key;
  }
  return null;
}

export function mediaNeeded(text: string): boolean {
  const low = text.toLowerCase();
  return MEDIA_WORDS.some((w) => low.includes(w));
}

function taskShort(text: string): string {
  return text.length > 120 ? text.slice(0, 120) + '…' : text;
}

/* Handoff studio yang tertunda: diisi saat bubble hasil membawa tombol
   Approve, dibaca saat user mengetuknya. Hanya satu yang tertunda
   (yang terbaru menang) — tombol lama yang tertunda lalu diklik
   memakai hasil terbaru, sesuai urutan chat. */
let pendingStudio: { text: string; agent: string } | null = null;

function studioButton(resultText: string, agentKey: string): string {
  pendingStudio = { text: resultText, agent: agentKey };
  return (
    '<br><br>' + esc(tr('chat.studio.note')) +
    '<br><button class="btn btn-sm" onclick="approveStudio()">' + esc(tr('chat.studio.approve')) + '</button>'
  );
}

/* Approve dari chat: muat hasil ke output Script Editor (bisa diedit),
   konfirmasi di chat, lalu PINDAH ke Media Studio tab Script.
   Tanpa ketukan ini, window TIDAK pernah berpindah sendiri. */
export function approveStudio(): void {
  if (!pendingStudio) return;
  const { text, agent } = pendingStudio;
  const ag = (AGENTS as Record<string, { name: string; color: string }>)[agent];
  if (typeof (window as unknown as Record<string, unknown>).seLoadOutput === 'function') {
    ((window as unknown as Record<string, (t: string) => void>).seLoadOutput)(text);
  }
  if (ag) postChat(agent, ag.name, ag.color, tr('chat.studio.opened'));
  showView('media');
  mediaTab('script');
}
(window as unknown as Record<string, unknown>).approveStudio = approveStudio;

/**
 * Real sendChat: user bubble -> Prime ack ramah -> (delegasi bila
 * perlu: pengumuman Prime + aktivasi agen + ack agen + hasil agen) /
 * (langsung: jawaban Prime) -> tombol studio bila perlu + disetujui.
 * Failures post an honest error bubble, never a fabricated reply.
 */
export async function sendChatReal(): Promise<void> {
  const input = document.getElementById('chatInput') as HTMLInputElement | null;
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;
  postChat('user', 'Patria', '#374151', esc(text));
  input.value = '';
  postChat('prime', 'Prime Agent', '#FFD1DC', tr('chat.prime.ack'));
  const keys = readKeys();
  const cfg = defaultRouterConfig();
  cfg.geminiApiKey = keys.gemini;
  cfg.metaApiKey = keys.meta;
  const router = new ModelRouter(cfg);
  const delegate = delegateFor(text);
  if (!delegate) {
    cfg.systemInstruction = MODEL_LANG_INSTRUCTION[getLang()];
    const trace = 'trace-chat-' + Date.now();
    try {
      const r = await router.callWithFallback(text, trace);
      const footer =
        ' — ' + tr('chat.footer.via') + ' ' + r.provider + ' ' + r.model + ' · ' + r.latencyMs + 'ms' +
        (r.fallbackFrom ? ' (' + tr('chat.footer.fb') + ' ' + r.fallbackFrom + ')' : '');
      const studio = mediaNeeded(text) ? studioButton(r.text, 'prime') : '';
      postChat('prime', 'Prime Agent', '#FFD1DC', esc(r.text) + footer + studio);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      postChat('prime', 'Prime Agent', '#FFD1DC', tr('chat.error') + esc(msg) + tr('chat.error.hint'));
    }
    return;
  }
  const ag = (AGENTS as Record<string, { name: string; color: string; role: string }>)[delegate];
  postChat('prime', 'Prime Agent', '#FFD1DC', tr('chat.delegate.announce', { agent: ag.name, task: esc(taskShort(text)) }));
  activateAgent(delegate);
  postChat(delegate, ag.name, ag.color, tr('chat.delegate.agentack'));
  cfg.systemInstruction = MODEL_LANG_INSTRUCTION[getLang()] + ' Kamu adalah ' + ag.name + ' (' + ag.role + ').';
  const trace = 'trace-chat-' + delegate + '-' + Date.now();
  try {
    const r = await router.callWithFallback(text, trace);
    const footer =
      ' — ' + tr('chat.footer.via') + ' ' + r.provider + ' ' + r.model + ' · ' + r.latencyMs + 'ms' +
      (r.fallbackFrom ? ' (' + tr('chat.footer.fb') + ' ' + r.fallbackFrom + ')' : '');
    // Tombol studio HANYA untuk Kreatif (aturan skill) + tugas media.
    const studio = delegate === 'kreatif' && mediaNeeded(text) ? studioButton(r.text, delegate) : '';
    postChat(delegate, ag.name, ag.color, esc(r.text) + footer + studio);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    postChat(delegate, ag.name, ag.color, tr('chat.error') + esc(msg) + tr('chat.error.hint'));
  }
}
