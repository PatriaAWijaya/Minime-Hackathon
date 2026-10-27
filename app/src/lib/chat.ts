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
import { postChat } from './v5logic.js';

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
    'Gemini: ' + (k.gemini ? 'tersimpan' : 'belum diisi') +
    ' · Meta: ' + (k.meta ? 'tersimpan' : 'belum diisi') +
    ' · Ollama lokal: tidak butuh kunci.'
  );
}

export function updateKeyStatus(): void {
  const el = document.getElementById('keyStatus');
  if (el) el.textContent = keyStatusText();
}

export function saveKeys(): void {
  const g = document.getElementById('apiKeyGemini') as HTMLInputElement | null;
  const m = document.getElementById('apiKeyMeta') as HTMLInputElement | null;
  try {
    if (g && g.value.trim()) window.localStorage.setItem(GEMINI_KEY_LS, g.value.trim());
    if (m && m.value.trim()) window.localStorage.setItem(META_KEY_LS, m.value.trim());
    if (g) g.value = '';
    if (m) m.value = '';
  } catch {
    // storage unavailable: keys simply stay unset for this session
  }
  updateKeyStatus();
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Real sendChat: user bubble -> router chain (Meta -> Gemini -> Ollama)
 * -> Prime Agent bubble with provider/model/latency provenance. Failures
 * post an honest error bubble, never a fabricated reply.
 */
export async function sendChatReal(): Promise<void> {
  const input = document.getElementById('chatInput') as HTMLInputElement | null;
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;
  postChat('user', 'Kamu', '#374151', esc(text));
  input.value = '';
  const keys = readKeys();
  const cfg = defaultRouterConfig();
  cfg.geminiApiKey = keys.gemini;
  cfg.metaApiKey = keys.meta;
  const router = new ModelRouter(cfg);
  const trace = 'trace-chat-' + Date.now();
  try {
    const r = await router.callWithFallback(text, trace);
    const footer =
      ' — via ' + r.provider + ' ' + r.model + ' · ' + r.latencyMs + 'ms' +
      (r.fallbackFrom ? ' (fallback dari ' + r.fallbackFrom + ')' : '');
    postChat('prime', 'Prime Agent', '#FFD1DC', esc(r.text) + footer);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    postChat(
      'prime',
      'Prime Agent',
      '#FFD1DC',
      'Gagal menghubungi model: ' + esc(msg) +
        ' — cek kunci di Settings, atau pastikan Ollama jalan (127.0.0.1:11434).',
    );
  }
}
