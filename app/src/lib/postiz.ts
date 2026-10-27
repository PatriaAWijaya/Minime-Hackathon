// B5 — Postiz draft-only client for the Tauri frontend.
//
// Port of src/postiz.ts, corrected to the LIVE-proven values from the
// Fase 3 session (docs/fase-3-postiz-drafts.json, 27 Okt 2026 15:35 WIB):
//   base http://127.0.0.1:4007/api/public/v1
//   (NOT /public/v1 — that path 307-redirects to /auth and creates
//   nothing; NOT Bearer — "Bearer <key>" returns 401)
//   header Authorization: <raw key as-is>
// By construction this client can ONLY create drafts: there is no
// publish, schedule, or delete method anywhere in this module. A draft
// leaves draft state only via a human in the Postiz dashboard.
// Body is exactly the live-proven shape: { type: 'draft', caption }.
// No channel field: the documented channel format is unresolved (the
// integration guide diagrams channels: [...] but its own example
// omits it), so the draft lands on Postiz's default channel handling
// — the user confirms or moves it in the dashboard. The composer
// notice says exactly that; it never claims a channel choice.
//
// The key lives ONLY in this device's localStorage, entered by the
// user in Settings (from the MacBook Keychain). It is never baked
// into the bundle, never committed, and never sent anywhere except
// the Postiz API on this machine.
import { addPlannerRow } from './v5logic.js';

export const POSTIZ_KEY_LS = 'minime.postizKey';
const POSTIZ_BASE = 'http://127.0.0.1:4007/api/public/v1';

export function readPostizKey(): string | null {
  try {
    return window.localStorage.getItem(POSTIZ_KEY_LS) || null;
  } catch {
    return null;
  }
}

export async function createPostizDraft(caption: string): Promise<{ draftId: string | null; status: number }> {
  const key = readPostizKey();
  if (!key) {
    throw new Error('Kunci Postiz belum diisi (Settings → Kunci API).');
  }
  const res = await fetch(`${POSTIZ_BASE}/posts`, {
    method: 'POST',
    headers: { Authorization: key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'draft', caption }),
  });
  if (!res.ok) {
    throw new Error(`Postiz menolak draf: HTTP ${res.status}`);
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
    typeof d.id === 'string' ? d.id : typeof nested.id === 'string' ? nested.id : null;
  return { draftId, status: res.status };
}

/** Composer handler: user-typed caption -> real Postiz draft (draft-only). */
export async function createPostizDraftFromComposer(): Promise<void> {
  const notice = document.getElementById('postizNotice');
  const show = (msg: string): void => {
    if (notice) {
      notice.style.display = 'block';
      notice.textContent = msg;
    }
  };
  const input = document.getElementById('postizText') as HTMLTextAreaElement | null;
  const caption = (input?.value ?? '').trim();
  if (!caption) {
    show('Tulis caption dulu sebelum membuat draf.');
    return;
  }
  if (!readPostizKey()) {
    show('Kunci Postiz belum diisi — isi dulu di Settings → Kunci API, lalu klik lagi.');
    return;
  }
  show('Mengirim draf ke Postiz…');
  try {
    const r = await createPostizDraft(caption);
    addPlannerRow({
      item: caption.length > 60 ? caption.slice(0, 60) + '…' : caption,
      ch: 'Postiz',
      when: 'Baru saja (session)',
      st: 'DRAF',
      postId: r.draftId ?? '—',
    });
    if (input) input.value = '';
    show(
      `Draf dibuat di Postiz (HTTP ${r.status}${r.draftId ? ', id ' + r.draftId : ''}). ` +
        'DRAF saja — tidak terbit, tidak terjadwal. Channel mengikuti default Postiz; cek/pindah di dashboard Postiz.',
    );
  } catch (e) {
    show('Gagal membuat draf: ' + (e instanceof Error ? e.message : String(e)));
  }
}
