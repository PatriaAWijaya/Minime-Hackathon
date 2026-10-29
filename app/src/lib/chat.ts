// B3 — real chat wiring for the Tauri frontend.
//
// The composer and Enter key all funnel through
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
import { esc } from './esc.js';
import { invoke } from '@tauri-apps/api/core';

const GEMINI_KEY_LS = 'minime.geminiKey';
const META_KEY_LS = 'minime.metaKey';
const VALIDATED_LS = 'minime.keyValidated';

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

export type KeyKind = 'gemini' | 'meta' | 'postiz';

function savedKey(kind: KeyKind): string | null {
  if (kind === 'postiz') return readPostizKey();
  return readKeys()[kind];
}

function saveKey(kind: KeyKind, value: string): void {
  try {
    const ls = kind === 'gemini' ? GEMINI_KEY_LS : kind === 'meta' ? META_KEY_LS : POSTIZ_KEY_LS;
    window.localStorage.setItem(ls, value);
  } catch {
    // storage unavailable: key simply stays unset for this session
  }
}

export function isKeyValidated(kind: KeyKind): boolean {
  try {
    const raw = window.localStorage.getItem(VALIDATED_LS);
    if (!raw) return false;
    return !!(JSON.parse(raw) as Record<string, unknown>)[kind];
  } catch {
    return false;
  }
}

function setKeyValidated(kind: KeyKind, value: boolean): void {
  try {
    const raw = window.localStorage.getItem(VALIDATED_LS);
    const obj = (raw ? JSON.parse(raw) : {}) as Record<string, boolean>;
    obj[kind] = value;
    window.localStorage.setItem(VALIDATED_LS, JSON.stringify(obj));
  } catch {
    // storage unavailable: validation flag simply doesn't persist
  }
}

function keyBtnId(kind: KeyKind): string {
  return 'keyBtn' + kind.charAt(0).toUpperCase() + kind.slice(1);
}

function keyNoteId(kind: KeyKind): string {
  return 'keyNote' + kind.charAt(0).toUpperCase() + kind.slice(1);
}

function keyInputId(kind: KeyKind): string {
  return kind === 'gemini' ? 'apiKeyGemini' : kind === 'meta' ? 'apiKeyMeta' : 'apiKeyPostiz';
}

function setKeyNote(kind: KeyKind, text: string): void {
  const el = document.getElementById(keyNoteId(kind));
  if (el) el.textContent = text;
}

/**
 * Gambar ulang tombol per-kunci di Settings. Satu tombol = satu kunci,
 * dan tombol ITU SENDIRI adalah statusnya: "Hubungkan API" (belum
 * teruji) atau "TERHUBUNG" hijau (kunci tersimpan DAN lolos uji live).
 * Tidak ada lagi tombol simpan bersama maupun baris status bersama —
 * keduanya dihapus total di v52 karena fungsinya tumpang tindih
 * dengan tombol per-kunci ini.
 */
export function renderKeyButtons(): void {
  (['gemini', 'meta', 'postiz'] as KeyKind[]).forEach((kind) => {
    const btn = document.getElementById(keyBtnId(kind)) as HTMLButtonElement | null;
    if (!btn) return;
    const ok = isKeyValidated(kind) && !!savedKey(kind);
    btn.textContent = ok ? tr('key.connected') : tr('key.connect');
    btn.className = ok ? 'btn btn-connected' : 'btn btn-primary';
    btn.disabled = false;
  });
}

function failNote(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/HTTP 400|HTTP 401/.test(msg)) return tr('key.fail.badkey');
  if (/HTTP \d+/.test(msg)) return tr('key.fail.error');
  return tr('key.fail.offline');
}

/**
 * Hubungkan satu kunci: simpan (bila ada ketikan baru), lalu UJI LIVE
 * kunci itu — langsung ke providernya, TANPA rantai fallback (fallback
 * akan menutupi kunci yang salah dengan provider lain dan memberi
 * tanda terhubung palsu). Tanda TERHUBUNG hanya muncul bila uji
 * lolos; gagal -> tombol kembali "Hubungkan API" + catatan alasan,
 * dan flag validasi dicabut bila sebelumnya sempat hijau.
 * Input kosong + tidak ada kunci tersimpan -> no-op (tidak ada uji).
 */
export async function connectKey(kind: KeyKind): Promise<void> {
  const btn = document.getElementById(keyBtnId(kind)) as HTMLButtonElement | null;
  if (!btn || btn.disabled) return;
  const input = document.getElementById(keyInputId(kind)) as HTMLInputElement | null;
  const typed = input?.value.trim() || '';
  const key = typed || savedKey(kind) || '';
  if (!key) return;
  if (typed) {
    saveKey(kind, typed);
    setKeyValidated(kind, false);
    if (input) input.value = '';
  }
  btn.disabled = true;
  btn.textContent = tr('key.testing');
  btn.className = 'btn btn-primary';
  setKeyNote(kind, '');
  let ok = false;
  let note = '';
  try {
    if (kind === 'postiz') {
      // Pakai ulang op ping Rust (sama seperti wizard): GET read-only
      // /api/public/v1/integrations. 200 = kunci valid.
      const r = (await invoke('postiz_request', { req: { op: 'ping', key } })) as { status: number };
      ok = r.status === 200;
      if (!ok) note = r.status === 401 ? tr('key.fail.badkey') : tr('key.fail.error');
    } else {
      // Uji langsung ke provider itu saja (callMeta/callGemini tanpa
      // callWithFallback): satu panggilan minimal, biaya nyaris nol
      // (Meta: puluhan token; Gemini: free tier).
      const cfg = defaultRouterConfig();
      cfg.geminiApiKey = kind === 'gemini' ? key : null;
      cfg.metaApiKey = kind === 'meta' ? key : null;
      const router = new ModelRouter(cfg);
      if (kind === 'gemini') await router.callGemini('Jawab satu kata: OK');
      else await router.callMeta('Jawab satu kata: OK', 'key-test');
      ok = true;
    }
  } catch (e) {
    ok = false;
    note = kind === 'postiz' ? tr('key.fail.offline') : failNote(e);
  }
  setKeyValidated(kind, ok);
  if (!ok) setKeyNote(kind, note);
  renderKeyButtons();
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
  postChat('prime', 'Prime Agent', '#EB87B4', tr('chat.prime.ack'));
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
      postChat('prime', 'Prime Agent', '#EB87B4', esc(r.text) + footer + studio);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      postChat('prime', 'Prime Agent', '#EB87B4', tr('chat.error') + esc(msg) + tr('chat.error.hint'));
    }
    return;
  }
  const ag = (AGENTS as Record<string, { name: string; color: string; role: string }>)[delegate];
  postChat('prime', 'Prime Agent', '#EB87B4', tr('chat.delegate.announce', { agent: esc(ag.name), task: esc(taskShort(text)) }));
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
