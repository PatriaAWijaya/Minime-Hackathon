/**
 * Model Router (Phase 0, Block C) — configuration-driven, NOT hard-coded
 * per agent. Chain (canon, Addendum 27 Oct 2026):
 *   1. Muse via Meta Model API (primary, ALL agents)
 *   2. Gemini via Google API (fallback 1; also QC for Muse output)
 *   3. DeepSeek via Ollama, local (fallback 2)
 *   3b. Qwen via Ollama, local (fallback 3 — only if the DeepSeek
 *       Ollama model fails; both local models are free, Rp0 marginal)
 * Every call returns a CallResult with a CostRecord. A call that was
 * served by the mock provider is flagged mock=true and cost=null, so it
 * can never be mistaken for a measured live call. Live providers are
 * attempted only when their credentials/endpoint are configured; when
 * they are not, they fail visibly (LiveUnavailableError) instead of
 * silently substituting another model.
 */
import type { CostRecord } from './ledger';

export type ProviderId = 'meta' | 'gemini' | 'anthropic' | 'ollama' | 'mock';

export interface RouterConfig {
  metaBaseUrl: string;
  metaApiKey: string | null;
  metaModel: string;
  geminiApiKey: string | null;
  geminiModel: string;
  anthropicApiKey: string | null;
  anthropicModel: string;
  anthropicBaseUrl: string;
  ollamaBaseUrl: string;
  ollamaModel: string;
  ollamaFallbackModel: string;
  /**
   * Optional system instruction (B7: language). Applied per provider:
   * Meta/Ollama as a system message, Gemini as systemInstruction,
   * Anthropic as the `system` field of the Messages API.
   * Absent = no instruction (Node fase runners keep today's behavior).
   */
  systemInstruction?: string;
}

/**
 * Canon defaults, browser-safe (no env access). The single source of
 * chain defaults: routerConfigFromEnv() below delegates here, and the
 * Tauri frontend (app/src/lib/chat.ts) builds its config from here
 * plus keys the user enters in Settings (localStorage, device only).
 * Using `import type` for CostRecord keeps this module free of Node
 * imports (ledger.ts pulls in fs/path), so Vite can bundle it into
 * the WebView. toCostRecord() still returns a CostRecord shape.
 */
export function defaultRouterConfig(): RouterConfig {
  return {
    metaBaseUrl: 'https://api.meta.ai/v1',
    metaApiKey: null,
    metaModel: 'muse-spark-1.3',
    geminiApiKey: null,
    geminiModel: 'gemini-3.1-flash-lite',
    anthropicApiKey: null,
    anthropicModel: 'claude-sonnet-4-5',
    anthropicBaseUrl: 'https://api.anthropic.com/v1',
    ollamaBaseUrl: 'http://127.0.0.1:11434',
    ollamaModel: 'deepseek-r1:1.5b',
    ollamaFallbackModel: 'qwen2.5:3b',
  };
}

export function routerConfigFromEnv(env: NodeJS.ProcessEnv): RouterConfig {
  const base = defaultRouterConfig();
  return {
    metaBaseUrl: env.META_MODEL_API_BASE_URL || base.metaBaseUrl,
    metaApiKey: env.META_API_KEY || null,
    metaModel: env.META_MODEL || base.metaModel,
    geminiApiKey: env.GEMINI_API_KEY || null,
    geminiModel: env.GEMINI_MODEL || base.geminiModel,
    anthropicApiKey: env.ANTHROPIC_API_KEY || null,
    anthropicModel: env.ANTHROPIC_MODEL || base.anthropicModel,
    anthropicBaseUrl: env.ANTHROPIC_BASE_URL || base.anthropicBaseUrl,
    ollamaBaseUrl: env.OLLAMA_BASE_URL || base.ollamaBaseUrl,
    ollamaModel: env.OLLAMA_MODEL || base.ollamaModel,
    ollamaFallbackModel: env.OLLAMA_FALLBACK_MODEL || base.ollamaFallbackModel,
  };
}

export class LiveUnavailableError extends Error {
  constructor(provider: ProviderId, detail: string) {
    super(`live provider ${provider} unavailable: ${detail}`);
    this.name = 'LiveUnavailableError';
  }
}

export interface CallResult {
  text: string;
  provider: ProviderId;
  family: 'meta' | 'gemini' | 'anthropic' | 'deepseek' | 'qwen' | 'mock';
  model: string;
  latencyMs: number;
  mock: boolean;
  fallbackFrom: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  costUsd: number | null;
}

/**
 * v239 — streaming + circuit breaker.
 * OnToken menerima (delta, total, reset): reset=true berarti provider
 * sebelumnya sempat mengirim token lalu gagal, sehingga pemanggil HARUS
 * membuang buffer parsial sebelum menampilkan token provider berikutnya.
 * Tanpa streaming (onToken kosong), perilaku sama seperti postJson dulu,
 * hanya timeout-nya berubah: idle 30 detik (bukan total 30 detik) +
 * total 180 detik, supaya generasi panjang yang sah tidak diaborsi di
 * tengah jalan seperti dulu (kasus Meta/Gemini 30 detik).
 */
export type OnToken = (delta: string, total: string, reset: boolean) => void;

type StreamExtract = (obj: unknown) => { text: string; prompt: number | null; completion: number | null } | null;

async function postJsonStream(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  extract: StreamExtract,
  onToken?: OnToken,
  timeoutIdleMs = 30000,
  timeoutTotalMs = 180000,
): Promise<{ text: string; promptTokens: number | null; completionTokens: number | null }> {
  const ctrl = new AbortController();
  let idle: ReturnType<typeof setTimeout> | undefined;
  const armIdle = () => {
    if (idle) clearTimeout(idle);
    idle = setTimeout(() => ctrl.abort(), timeoutIdleMs);
  };
  const totalTimer = setTimeout(() => ctrl.abort(), timeoutTotalMs);
  try {
    armIdle();
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${errText.slice(0, 300)}`);
    }
    const reader = res.body?.getReader?.();
    if (!reader) {
      // Stub rig / lingkungan tanpa stream: baca JSON utuh seperti dulu.
      const data = (await res.json().catch(() => ({}))) as unknown;
      const ex = extract(data);
      const text = ex?.text ?? '';
      if (onToken && text) onToken(text, text, false);
      return { text, promptTokens: ex?.prompt ?? null, completionTokens: ex?.completion ?? null };
    }
    const decoder = new TextDecoder();
    let buf = '';
    let raw = '';
    let acc = '';
    let promptTokens: number | null = null;
    let completionTokens: number | null = null;
    const feedLine = (line: string) => {
      const t = line.trim();
      if (!t) return;
      let payload: unknown = null;
      if (t.startsWith('data:')) {
        const d = t.slice(5).trim();
        if (!d || d === '[DONE]') return;
        try { payload = JSON.parse(d); } catch { return; }
      } else if (t.startsWith('{')) {
        try { payload = JSON.parse(t); } catch { return; }
      } else return;
      const ex = extract(payload);
      if (!ex) return;
      if (ex.prompt != null) promptTokens = ex.prompt;
      if (ex.completion != null) completionTokens = ex.completion;
      if (ex.text) {
        acc += ex.text;
        if (onToken) onToken(ex.text, acc, false);
      }
    };
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      armIdle();
      const chunk = decoder.decode(value, { stream: true });
      raw += chunk;
      buf += chunk;
      let idx: number;
      while ((idx = buf.indexOf('\n')) >= 0) {
        feedLine(buf.slice(0, idx));
        buf = buf.slice(idx + 1);
      }
    }
    if (buf.trim()) feedLine(buf);
    if (!acc) {
      // Provider mengabaikan flag stream dan mengembalikan JSON utuh.
      try {
        const ex = extract(JSON.parse(raw));
        if (ex?.text) {
          acc = ex.text;
          if (ex.prompt != null) promptTokens = ex.prompt;
          if (ex.completion != null) completionTokens = ex.completion;
          if (onToken) onToken(acc, acc, false);
        }
      } catch { /* biarkan kosong */ }
    }
    return { text: acc, promptTokens, completionTokens };
  } finally {
    if (idle) clearTimeout(idle);
    clearTimeout(totalTimer);
  }
}

function metaExtract(d: unknown): { text: string; prompt: number | null; completion: number | null } | null {
  const o = d as { choices?: Array<{ delta?: { content?: string }; message?: { content?: string } }>; usage?: { prompt_tokens?: number; completion_tokens?: number } } | null;
  if (!o || typeof o !== 'object') return null;
  const c = o.choices?.[0];
  return { text: c?.delta?.content ?? c?.message?.content ?? '', prompt: o.usage?.prompt_tokens ?? null, completion: o.usage?.completion_tokens ?? null };
}

function geminiExtract(d: unknown): { text: string; prompt: number | null; completion: number | null } | null {
  const o = d as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>; usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } } | null;
  if (!o || typeof o !== 'object') return null;
  const text = o.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  return { text, prompt: o.usageMetadata?.promptTokenCount ?? null, completion: o.usageMetadata?.candidatesTokenCount ?? null };
}

function ollamaExtract(d: unknown): { text: string; prompt: number | null; completion: number | null } | null {
  const o = d as { message?: { content?: string }; prompt_eval_count?: number; eval_count?: number } | null;
  if (!o || typeof o !== 'object') return null;
  return { text: o.message?.content ?? '', prompt: o.prompt_eval_count ?? null, completion: o.eval_count ?? null };
}

/* v239 — circuit breaker per provider (state level modul, bukan instans,
   karena tiap sendChat membuat ModelRouter baru). Gagal jaringan/HTTP/
   timeout 2x berturut-turut -> provider dilewati 5 menit tanpa fetch.
   Gagal pra-penerbangan (kunci kosong, Tauri tak tersedia) TIDAK dihitung:
   itu bukan bukti provider bermasalah, dan kunci bisa saja baru diisi
   user lewat Settings di tengah sesi. */
const breakerState = new Map<ProviderId, { failures: number; lastFail: number }>();
const BREAKER_AFTER = 2;
const BREAKER_MS = 5 * 60 * 1000;
function breakerTripped(p: ProviderId): boolean {
  const s = breakerState.get(p);
  return !!s && s.failures >= BREAKER_AFTER && Date.now() - s.lastFail < BREAKER_MS;
}
function breakerNote(p: ProviderId, ok: boolean): void {
  if (ok) { breakerState.delete(p); return; }
  const s = breakerState.get(p) || { failures: 0, lastFail: 0 };
  s.failures += 1;
  s.lastFail = Date.now();
  breakerState.set(p, s);
}
export function resetRouterBreakers(): void { breakerState.clear(); }

/* v239 — handler streaming Anthropic didaftarkan dari sisi app (bukan
   diimpor di sini): router.ts harus tetap bisa diimpor runner Node,
   dan @tauri-apps/api tidak bisa di-resolve Vite dari luar app/.
   Tanpa handler terdaftar, callAnthropic dengan onToken jatuh ke
   anthropic_chat utuh (bukan error). */
export type AnthropicStreamReq = {
  api_key: string;
  model: string;
  system: string | null;
  prompt: string;
  max_tokens: number;
  timeout_secs: number;
};
export type AnthropicStreamRes = { text: string; input_tokens?: number | null; output_tokens?: number | null };
type AnthropicStreamHandler = (req: AnthropicStreamReq, onDelta: (delta: string) => void) => Promise<AnthropicStreamRes>;
let anthropicStreamHandler: AnthropicStreamHandler | null = null;
export function setAnthropicStreamHandler(fn: AnthropicStreamHandler | null): void {
  anthropicStreamHandler = fn;
}

function preFlight(provider: ProviderId, detail: string): LiveUnavailableError {
  const e = new LiveUnavailableError(provider, detail);
  (e as unknown as { preFlight?: boolean }).preFlight = true;
  return e;
}

/** v239 — peta label model picker -> provider (sama dengan callAgentModel v152, dipusatkan agar cb memakainya juga). */
export function providerForLabel(label: string): ProviderId | null {
  if (label.includes('muse-spark-1.3')) return 'meta';
  if (label.includes('gemini-3.1-flash-lite')) return 'gemini';
  if (label.includes('claude')) return 'anthropic';
  if (label.includes('deepseek-r1:1.5b') || label.includes('qwen2.5:3b')) return 'ollama';
  return null;
}

export class ModelRouter {
  constructor(private cfg: RouterConfig) {}

  /** Live Meta call. Throws LiveUnavailableError when not configured. */
  async callMeta(prompt: string, traceId: string, onToken?: OnToken): Promise<CallResult> {
    if (!this.cfg.metaApiKey) {
      throw preFlight('meta', 'META_API_KEY is not set (claim/card pending)');
    }
    const started = Date.now();
    const { text, promptTokens, completionTokens } = await postJsonStream(
      `${this.cfg.metaBaseUrl.replace(/\/$/, '')}/chat/completions`,
      { Authorization: `Bearer ${this.cfg.metaApiKey}` },
      { model: this.cfg.metaModel, messages: [...(this.cfg.systemInstruction ? [{ role: 'system', content: this.cfg.systemInstruction }] : []), { role: 'user', content: prompt }], temperature: 0.2, stream: true },
      metaExtract,
      onToken,
    );
    void traceId;
    // Audit v66 $-B1: biaya live HARUS dihitung di sini, bukan dibuang
    // ke null — dulu Billing menampilkan $0 untuk semua live call.
    // Tarif muse-spark-1.3: $1,25 input / $4,25 output per 1 jt token.
    // Model lain -> null (jangan menebak tarifnya).
    const isSpark13 = this.cfg.metaModel === 'muse-spark-1.3';
    const costUsd = isSpark13 && promptTokens != null && completionTokens != null
      ? promptTokens * 1.25e-6 + completionTokens * 4.25e-6
      : null;
    return { text, provider: 'meta', family: 'meta', model: this.cfg.metaModel, latencyMs: Date.now() - started, mock: false, fallbackFrom: null, promptTokens, completionTokens, costUsd };
  }

  async callGemini(prompt: string, onToken?: OnToken): Promise<CallResult> {
    if (!this.cfg.geminiApiKey) {
      throw preFlight('gemini', 'GEMINI_API_KEY is not set');
    }
    const started = Date.now();
    // Key via ?key= query param (not a header): this is how Google's
    // generateContent API accepts keys, and it is also the placement
    // the Secure Vault surrogate mechanism supports (the surrogate is
    // swapped for the real key on approved egress). Header placement
    // was tried and is NOT compatible with that mechanism.
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.cfg.geminiModel)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(this.cfg.geminiApiKey)}`;
    const { text, promptTokens, completionTokens } = await postJsonStream(
      url,
      {},
      { contents: [{ parts: [{ text: prompt }] }], ...(this.cfg.systemInstruction ? { systemInstruction: { parts: [{ text: this.cfg.systemInstruction }] } } : {}) },
      geminiExtract,
      onToken,
    );
    // Audit v66 $-B1: Gemini = $0 atas dasar free tier (keputusan
    // Patria 28 Okt 2026 'Catat $0 free tier, tutup bagian 2') —
    // BUKAN karena tarifnya nol. Bila pemakaian berbayar dimulai,
    // baris ini harus dihitung dari tarif model yang dipakai.
    return { text, provider: 'gemini', family: 'gemini', model: this.cfg.geminiModel, latencyMs: Date.now() - started, mock: false, fallbackFrom: null, promptTokens, completionTokens, costUsd: 0 };
  }

  /**
   * Live Anthropic call (Messages API, v236; transport via Rust proxy since v237).
   * Throws LiveUnavailableError when not configured.
   * v237: fetch WebView ke api.anthropic.com DIBLOKIR CORS (preflight
   * tanpa access-control-allow-origin; Meta mengembalikan * sehingga
   * lolos) — kaki ini WAJIB lewat perintah Rust anthropic_chat (curl
   * sisi server, pola vs_api v223). __TAURI_INTERNALS__ dipakai
   * langsung (bukan impor @tauri-apps/api) agar modul ini tetap bisa
   * diimpor runner Node yang tidak memakai Anthropic.
   * v239: bila onToken diisi, dicoba dulu jalur streaming
   * anthropic_chat_stream (Tauri Channel) — gagal apa pun (rig/jsdom,
   * WebView lama) jatuh ke anthropic_chat utuh di bawah, bukan error.
   */
  async callAnthropic(prompt: string, onToken?: OnToken): Promise<CallResult> {
    if (!this.cfg.anthropicApiKey) {
      throw preFlight('anthropic', 'ANTHROPIC_API_KEY is not set');
    }
    const started = Date.now();
    const tauriInvoke = (globalThis as unknown as { __TAURI_INTERNALS__?: { invoke?: (cmd: string, args?: unknown) => Promise<unknown> } }).__TAURI_INTERNALS__?.invoke;
    if (!tauriInvoke) {
      throw preFlight('anthropic', 'Tauri invoke tidak tersedia (Anthropic hanya lewat app desktop)');
    }
    if (onToken && anthropicStreamHandler) {
      try {
        let acc = '';
        const sres = await anthropicStreamHandler(
          {
            api_key: this.cfg.anthropicApiKey,
            model: this.cfg.anthropicModel,
            system: this.cfg.systemInstruction ?? null,
            prompt,
            max_tokens: 8192,
            timeout_secs: 180,
          },
          (delta: string) => {
            acc += delta;
            onToken(delta, acc, false);
          },
        );
        return { text: sres.text ?? acc, provider: 'anthropic', family: 'anthropic', model: this.cfg.anthropicModel, latencyMs: Date.now() - started, mock: false, fallbackFrom: null, promptTokens: sres.input_tokens ?? null, completionTokens: sres.output_tokens ?? null, costUsd: null };
      } catch (_) {
        // Streaming tak tersedia -> jalur utuh di bawah (bukan error).
      }
    }
    const res = (await tauriInvoke('anthropic_chat', {
      req: {
        api_key: this.cfg.anthropicApiKey,
        model: this.cfg.anthropicModel,
        system: this.cfg.systemInstruction ?? null,
        prompt,
        max_tokens: 8192,
        timeout_secs: 120,
      },
    })) as { text?: string; input_tokens?: number | null; output_tokens?: number | null };
    // v236: tarif Anthropic TIDAK ditebak (aturan audit v66 $-B1:
    // model lain -> null); token tetap dicatat untuk laporan pemakaian.
    return { text: res.text ?? '', provider: 'anthropic', family: 'anthropic', model: this.cfg.anthropicModel, latencyMs: Date.now() - started, mock: false, fallbackFrom: null, promptTokens: res.input_tokens ?? null, completionTokens: res.output_tokens ?? null, costUsd: null };
  }

  private ollamaFamilyFor(model: string): 'deepseek' | 'qwen' {
    return model.startsWith('qwen') ? 'qwen' : 'deepseek';
  }

  private async callOllamaModel(prompt: string, model: string, onToken?: OnToken): Promise<CallResult> {
    const started = Date.now();
    let text = '';
    let promptTokens: number | null = null;
    let completionTokens: number | null = null;
    try {
      const r = await postJsonStream(
        `${this.cfg.ollamaBaseUrl.replace(/\/$/, '')}/api/chat`,
        {},
        { model, messages: [...(this.cfg.systemInstruction ? [{ role: 'system', content: this.cfg.systemInstruction }] : []), { role: 'user', content: prompt }], stream: true },
        ollamaExtract,
        onToken,
      );
      text = r.text;
      promptTokens = r.promptTokens;
      completionTokens = r.completionTokens;
    } catch (e) {
      throw new LiveUnavailableError('ollama', e instanceof Error ? e.message : String(e));
    }
    return { text, provider: 'ollama', family: this.ollamaFamilyFor(model), model, latencyMs: Date.now() - started, mock: false, fallbackFrom: null, promptTokens, completionTokens, costUsd: 0 };
  }

  /** v239: Ollama dengan model eksplisit (dipakai pin model picker). */
  async callOllamaAs(model: string, prompt: string, onToken?: OnToken): Promise<CallResult> {
    const r = new ModelRouter({ ...this.cfg, ollamaModel: model, ollamaFallbackModel: model });
    return r.callOllama(prompt, onToken);
  }

  /**
   * Local Ollama chain: primary model first, then the fallback model
   * (qwen2.5:3b by default) only if the primary fails. Both are local
   * and free. Throws LiveUnavailableError only if both fail.
   */
  async callOllama(prompt: string, onToken?: OnToken): Promise<CallResult> {
    let primaryHad = false;
    const primaryWrapped: OnToken | undefined = onToken
      ? (delta, total, _r) => { primaryHad = true; onToken(delta, total, false); }
      : undefined;
    try {
      return await this.callOllamaModel(prompt, this.cfg.ollamaModel, primaryWrapped);
    } catch (primaryError) {
      if (this.cfg.ollamaFallbackModel === this.cfg.ollamaModel) {
        throw primaryError;
      }
      let fallbackResetSent = false;
      const fallbackWrapped: OnToken | undefined = onToken
        ? (delta, total, _r) => {
          if (primaryHad && !fallbackResetSent) { fallbackResetSent = true; onToken('', '', true); }
          onToken(delta, total, false);
        }
        : undefined;
      try {
        const r = await this.callOllamaModel(prompt, this.cfg.ollamaFallbackModel, fallbackWrapped);
        r.fallbackFrom = this.cfg.ollamaModel;
        return r;
      } catch (fallbackError) {
        throw new LiveUnavailableError(
          'ollama',
          `primary ${this.cfg.ollamaModel} failed (${primaryError instanceof Error ? primaryError.message : String(primaryError)}); fallback ${this.cfg.ollamaFallbackModel} failed (${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)})`,
        );
      }
    }
  }

  /** Mock provider — clearly labelled, for structure tests only. */
  callMock(prompt: string, agent: string): CallResult {
    const text = `[MOCK ${agent}] structured output for prompt: ${prompt.slice(0, 120)}`;
    return { text, provider: 'mock', family: 'mock', model: 'mock', latencyMs: 0, mock: true, fallbackFrom: null, promptTokens: null, completionTokens: null, costUsd: null };
  }

  /**
   * Full chain: meta -> gemini -> anthropic -> ollama (v236: Anthropic
   * disisipkan sesudah Gemini, sebelum Ollama — perilaku lama bertahan
   * bila Meta/Gemini jalan, dan Anthropic menyelamatkan persis saat
   * keduanya gagal). Returns the first success and
   * records fallbackFrom. If all fail, throws a LiveUnavailableError
   * that names EVERY provider's failure, not just the last one — so a
   * transient Gemini 503 is never masked by the final Ollama error and
   * callers can retry on 503 instead of misdiagnosing the chain.
   * `allowMock` is a test-only escape hatch and is recorded on the result.
   * v239: onToken dialirkan (dengan reset bila provider sebelumnya sempat
   * mengirim token lalu gagal); provider yang trip breaker dilewati tanpa
   * fetch; skip = provider yang baru saja gagal sebagai model pin (tidak
   * dicoba dua kali untuk satu tindakan user yang sama).
   */
  async callWithFallback(prompt: string, agent: string, allowMock = false, onToken?: OnToken, skip?: Set<ProviderId>): Promise<CallResult> {
    const chain: Array<{ name: ProviderId; fn: (t?: OnToken) => Promise<CallResult> }> = [
      { name: 'meta', fn: (t) => this.callMeta(prompt, agent, t) },
      { name: 'gemini', fn: (t) => this.callGemini(prompt, t) },
      { name: 'anthropic', fn: (t) => this.callAnthropic(prompt, t) },
      { name: 'ollama', fn: (t) => this.callOllama(prompt, t) },
    ];
    const names: ProviderId[] = ['meta', 'gemini', 'anthropic', 'ollama'];
    const failures: string[] = [];
    let hadPartial = false;
    for (let i = 0; i < chain.length; i++) {
      const step = chain[i];
      if (skip?.has(step.name)) {
        failures.push(`${step.name}: skipped (just failed as pinned model)`);
        continue;
      }
      if (breakerTripped(step.name)) {
        failures.push(`${step.name}: breaker (failed recently, skipped)`);
        continue;
      }
      try {
        let providerHad = false;
        const wrapped: OnToken | undefined = onToken
          ? (delta, total, _r) => {
            if (!providerHad && hadPartial) onToken('', '', true);
            providerHad = true;
            hadPartial = true;
            onToken(delta, total, false);
          }
          : undefined;
        const r = await step.fn(wrapped);
        breakerNote(step.name, true);
        if (i > 0) r.fallbackFrom = names[i - 1];
        return r;
      } catch (e) {
        if ((e as unknown as { preFlight?: boolean }).preFlight !== true) breakerNote(step.name, false);
        failures.push(`${step.name}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    if (allowMock) {
      const r = this.callMock(prompt, agent);
      r.fallbackFrom = 'ollama';
      return r;
    }
    throw new LiveUnavailableError('ollama', `all providers failed: ${failures.join('; ')}`);
  }

  toCostRecord(r: CallResult, traceId: string, agent: string): CostRecord {
    return {
      traceId,
      timestamp: new Date().toISOString(),
      agent,
      provider: r.provider,
      family: r.family,
      model: r.model,
      promptTokens: r.promptTokens,
      completionTokens: r.completionTokens,
      costUsd: r.mock ? 0 : r.costUsd,
      costIdr: null, // filled by CostLedger.append() at the ledger's rate
      mock: r.mock,
      fallbackFrom: r.fallbackFrom,
    };
  }

  /** QC family rule: QC must come from a different family than the maker. */
  qcProviderFor(makerFamily: 'meta' | 'gemini' | 'deepseek' | 'qwen' | 'mock'): ProviderId {
    if (makerFamily === 'meta') return 'gemini';
    if (makerFamily === 'gemini') return 'meta';
    return 'gemini';
  }
}

/**
 * v239 — panggilan model pin (label picker) yang dipakai bersama chat.ts
 * dan creative-brief.ts. Mengembalikan null bila label tidak cocok
 * (pemanggil memakai rantai global); melempar bila model pin gagal
 * (pemanggil memakai rantai dengan skip provider tersebut).
 */
export async function callPinnedModel(router: ModelRouter, label: string, prompt: string, trace: string, onToken?: OnToken): Promise<CallResult | null> {
  if (label.includes('muse-spark-1.3')) return router.callMeta(prompt, trace, onToken);
  if (label.includes('gemini-3.1-flash-lite')) return router.callGemini(prompt, onToken);
  if (label.includes('claude')) return router.callAnthropic(prompt, onToken);
  if (label.includes('deepseek-r1:1.5b')) return router.callOllamaAs('deepseek-r1:1.5b', prompt, onToken);
  if (label.includes('qwen2.5:3b')) return router.callOllamaAs('qwen2.5:3b', prompt, onToken);
  return null;
}
