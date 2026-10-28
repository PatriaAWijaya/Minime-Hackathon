/**
 * Postiz draft-only client (Phase 3).
 * Design constraint, enforced by construction and by gate test:
 * this client can ONLY create drafts. There is deliberately NO
 * publish, schedule, or delete method on it — a draft can only
 * leave draft state through a human approval in the Postiz
 * dashboard (or a later, separately gated batch step), never
 * through this code path.
 *
 * HONEST WIRE NOTE (audit 28 Okt 2026): the request body sent here is
 * ONLY {type: 'draft', caption} — the payload's channel, slides,
 * itemId and day fields are NEVER sent on the wire. The 7 "carousel"
 * drafts recorded in docs/fase-3-postiz-drafts.json are therefore
 * text-caption drafts (hook + CTA); their attachment to the Instagram
 * channel "Branding, Marketing & AI" is NOT proven by any request
 * field and still needs a Postiz dashboard check.
 *
 * The public API base and key format follow the LIVE-PROVEN values
 * from the Fase 3 session (docs/fase-3-postiz-drafts.json, 27 Okt
 * 2026 15:35 WIB, 7 drafts HTTP 201): base URL http://localhost:4007
 * with the public API at /api/public/v1, and the RAW API key in the
 * Authorization header. CORRECTED 27 Okt sore (B5): the earlier
 * /public/v1 path 307-redirects to /auth and creates nothing, and
 * "Bearer <key>" returns 401 — both the old comment and the old
 * request code were wrong and are fixed here. The key itself is
 * never stored in this repo; it arrives via environment (or, on the
 * MacBook, via Keychain) and is never printed.
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
    const res = await fetch(`${this.baseUrl}/api/public/v1/posts`, {
      method: 'POST',
      headers: {
        Authorization: `${this.apiKey}`,
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
   *  integrations endpoint without claiming authentication. Any HTTP
   *  response means the app is up; only a connection refusal means
   *  it is down. (The old comment's 307 claim belonged to the wrong
   *  /public/v1 path and is removed.) */
  async checkApiAlive(): Promise<number> {
    const res = await fetch(`${this.baseUrl}/api/public/v1/integrations`, { redirect: 'manual' });
    return res.status;
  }
}
