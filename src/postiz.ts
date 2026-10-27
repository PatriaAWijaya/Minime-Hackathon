/**
 * Postiz draft-only client (Phase 3).
 * Design constraint, enforced by construction and by gate test:
 * this client can ONLY create drafts. There is deliberately NO
 * publish, schedule, or delete method on it — a draft can only
 * leave draft state through a human approval in the Postiz
 * dashboard (or a later, separately gated batch step), never
 * through this code path.
 * The public API base and key format follow the local integration
 * guide (~/postiz-mac/postiz-mac/INTEGRASI_MINIME.md): base URL
 * http://localhost:4007, public API at /public/v1, Bearer key
 * starting with pos_. The key itself is never stored in this repo;
 * it arrives via environment (or, on the MacBook, via Keychain)
 * and is never printed.
 */

export interface PostizCarouselSlide {
  role: 'hook' | 'body' | 'cta';
  overlayText: string;
  imagePrompt: string;
}

export interface PostizDraftPayload {
  type: 'draft';
  caption: string;
  itemId: string;
  day: number;
  channel: string;
  slides: PostizCarouselSlide[];
  images: null;
  imageStatus: 'pending-provider';
}

export class PostizDraftClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(baseUrl: string, apiKey: string) {
    if (!baseUrl || !baseUrl.trim()) throw new Error('Postiz base URL is required');
    if (!apiKey || !apiKey.trim()) throw new Error('Postiz API key is required (pos_ key from the Postiz dashboard)');
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.apiKey = apiKey;
  }

  /** Create one draft. Sends only the documented draft fields. */
  async createDraft(payload: PostizDraftPayload): Promise<{ draftId: string | null; status: number }> {
    const res = await fetch(`${this.baseUrl}/public/v1/posts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ type: 'draft', caption: payload.caption }),
    });
    if (!res.ok) {
      throw new Error(`Postiz createDraft failed: HTTP ${res.status}`);
    }
    let data: unknown = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    const d = (data ?? {}) as Record<string, unknown>;
    const nested = (d.data ?? {}) as Record<string, unknown>;
    const draftId =
      typeof d.id === 'string' ? d.id
      : typeof nested.id === 'string' ? nested.id
      : null;
    return { draftId, status: res.status };
  }

  /** Liveness probe only: returns the HTTP status of the public API
   *  integrations endpoint without claiming authentication. A 307
   *  redirect means the app is up and responding (it redirects to
   *  login); connection refusal means it is down. */
  async checkApiAlive(): Promise<number> {
    const res = await fetch(`${this.baseUrl}/public/v1/integrations`, { redirect: 'manual' });
    return res.status;
  }
}
