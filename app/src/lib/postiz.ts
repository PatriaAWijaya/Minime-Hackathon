// B5 — Postiz key storage for the Tauri frontend.
//
// History: this module was the frontend draft-only client (port of
// src/postiz.ts, live-proven values from the Fase 3 session,
// docs/fase-3-postiz-drafts.json, 27 Okt 2026 15:35 WIB). The
// composer UI was removed 28 Okt 2026 on Patria's order, and the
// draft-creation function was removed with it (audit 28 Okt 2026).
// What remains is key storage only: the key lives in localStorage,
// entered by the user in Settings (from the MacBook Keychain), and
// is read here for the Settings key status. The frontend never
// sends the key anywhere. Draft creation lives in the Node client
// (src/postiz.ts, PostizDraftClient) used by the fase runners.

export const POSTIZ_KEY_LS = 'minime.postizKey';

export function readPostizKey(): string | null {
  try {
    return window.localStorage.getItem(POSTIZ_KEY_LS) || null;
  } catch {
    return null;
  }
}
