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

export type ProviderId = 'meta' | 'gemini' | 'ollama' | 'mock';

export interface RouterConfig {
  metaBaseUrl: string;
  metaApiKey: string | null;
  metaModel: string;
  geminiApiKey: string | null;
  geminiModel: string;
  ollamaBaseUrl: string;
  ollamaModel: string;
  ollamaFallbackModel: string;
  /**
   * Optional system instruction (B7: language). Applied per provider:
   * Meta/Ollama as a system message, Gemini as systemInstruction.
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
  family: 'meta' | 'gemini' | 'deepseek' | 'qwen' | 'mock';
  model: string;
  latencyMs: number;
  mock: boolean;
  fallbackFrom: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  costUsd: number | null;
}

async function postJson(url: string, headers: Record<string, string>, body: unknown, timeoutMs = 30000): Promise<unknown> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
    }
    return data;
  } finally {
    clearTimeout(t);
  }
}

function chatCompletionsText(data: unknown): { text: string; usage: { prompt: number | null; completion: number | null } } {
  const d = data as { choices?: Array<{ message?: { content?: string } }>; usage?: { prompt_tokens?: number; completion_tokens?: number } };
  const text = d.choices?.[0]?.message?.content ?? '';
  return { text, usage: { prompt: d.usage?.prompt_tokens ?? null, completion: d.usage?.completion_tokens ?? null } };
}

export class ModelRouter {
  constructor(private cfg: RouterConfig) {}

  /** Live Meta call. Throws LiveUnavailableError when not configured. */
  async callMeta(prompt: string, traceId: string): Promise<CallResult> {
    if (!this.cfg.metaApiKey) {
      throw new LiveUnavailableError('meta', 'META_API_KEY is not set (claim/card pending)');
    }
    const started = Date.now();
    const data = await postJson(
      `${this.cfg.metaBaseUrl.replace(/\/$/, '')}/chat/completions`,
      { Authorization: `Bearer ${this.cfg.metaApiKey}` },
      { model: this.cfg.metaModel, messages: [...(this.cfg.systemInstruction ? [{ role: 'system', content: this.cfg.systemInstruction }] : []), { role: 'user', content: prompt }], temperature: 0.2 },
    );
    const { text, usage } = chatCompletionsText(data);
    void traceId;
    return { text, provider: 'meta', family: 'meta', model: this.cfg.metaModel, latencyMs: Date.now() - started, mock: false, fallbackFrom: null, promptTokens: usage.prompt, completionTokens: usage.completion, costUsd: null };
  }

  async callGemini(prompt: string): Promise<CallResult> {
    if (!this.cfg.geminiApiKey) {
      throw new LiveUnavailableError('gemini', 'GEMINI_API_KEY is not set');
    }
    const started = Date.now();
    // Key via ?key= query param (not a header): this is how Google's
    // generateContent API accepts keys, and it is also the placement
    // the Secure Vault surrogate mechanism supports (the surrogate is
    // swapped for the real key on approved egress). Header placement
    // was tried and is NOT compatible with that mechanism.
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.cfg.geminiModel)}:generateContent?key=${encodeURIComponent(this.cfg.geminiApiKey)}`;
    const data = (await postJson(url, {}, { contents: [{ parts: [{ text: prompt }] }], ...(this.cfg.systemInstruction ? { systemInstruction: { parts: [{ text: this.cfg.systemInstruction }] } } : {}) })) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    };
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
    return { text, provider: 'gemini', family: 'gemini', model: this.cfg.geminiModel, latencyMs: Date.now() - started, mock: false, fallbackFrom: null, promptTokens: data.usageMetadata?.promptTokenCount ?? null, completionTokens: data.usageMetadata?.candidatesTokenCount ?? null, costUsd: null };
  }

  private ollamaFamilyFor(model: string): 'deepseek' | 'qwen' {
    return model.startsWith('qwen') ? 'qwen' : 'deepseek';
  }

  private async callOllamaModel(prompt: string, model: string): Promise<CallResult> {
    const started = Date.now();
    let data: unknown;
    try {
      data = await postJson(
        `${this.cfg.ollamaBaseUrl.replace(/\/$/, '')}/api/chat`,
        {},
        { model, messages: [...(this.cfg.systemInstruction ? [{ role: 'system', content: this.cfg.systemInstruction }] : []), { role: 'user', content: prompt }], stream: false },
        15000,
      );
    } catch (e) {
      throw new LiveUnavailableError('ollama', e instanceof Error ? e.message : String(e));
    }
    const d = data as { message?: { content?: string }; prompt_eval_count?: number; eval_count?: number };
    return { text: d.message?.content ?? '', provider: 'ollama', family: this.ollamaFamilyFor(model), model, latencyMs: Date.now() - started, mock: false, fallbackFrom: null, promptTokens: d.prompt_eval_count ?? null, completionTokens: d.eval_count ?? null, costUsd: 0 };
  }

  /**
   * Local Ollama chain: primary model first, then the fallback model
   * (qwen2.5:3b by default) only if the primary fails. Both are local
   * and free. Throws LiveUnavailableError only if both fail.
   */
  async callOllama(prompt: string): Promise<CallResult> {
    try {
      return await this.callOllamaModel(prompt, this.cfg.ollamaModel);
    } catch (primaryError) {
      if (this.cfg.ollamaFallbackModel === this.cfg.ollamaModel) {
        throw primaryError;
      }
      try {
        const r = await this.callOllamaModel(prompt, this.cfg.ollamaFallbackModel);
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
   * Full chain: meta -> gemini -> ollama. Returns the first success and
   * records fallbackFrom. If all fail, throws a LiveUnavailableError
   * that names EVERY provider's failure, not just the last one — so a
   * transient Gemini 503 is never masked by the final Ollama error and
   * callers can retry on 503 instead of misdiagnosing the chain.
   * `allowMock` is a test-only escape hatch and is recorded on the result.
   */
  async callWithFallback(prompt: string, agent: string, allowMock = false): Promise<CallResult> {
    const chain: Array<() => Promise<CallResult>> = [
      () => this.callMeta(prompt, agent),
      () => this.callGemini(prompt),
      () => this.callOllama(prompt),
    ];
    const names = ['meta', 'gemini', 'ollama'];
    const failures: string[] = [];
    for (let i = 0; i < chain.length; i++) {
      try {
        const r = await chain[i]();
        if (i > 0) r.fallbackFrom = names[i - 1];
        return r;
      } catch (e) {
        failures.push(`${names[i]}: ${e instanceof Error ? e.message : String(e)}`);
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
