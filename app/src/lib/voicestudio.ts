import { tr } from './i18n.js';

// Klien VoiceStudio lokal (proses terpisah, TIDAK di-bundle — aturan AGPL).
// API terverifikasi dari backend v0.5.6 di MacBook + pemakaian terbukti 22 Okt:
//   GET  /v1/models, GET /v1/audio/voices, POST /v1/audio/speech (JSON),
//   POST /generate (multipart). Engine hanya jalan saat VoiceStudio.app dibuka.

export const VS_BASE = 'http://127.0.0.1:3900';

export interface VsVoice {
  id: string;
  name: string;
  type: string;
  language: string;
}

export type VsStatus = 'unknown' | 'online' | 'offline';

export const vsState: { status: VsStatus; voices: VsVoice[]; models: string[] } = {
  status: 'unknown',
  voices: [],
  models: [],
};

async function vsFetch(path: string, init?: RequestInit, timeoutMs = 8000): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(VS_BASE + path, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

function asArray(json: unknown): unknown[] {
  if (Array.isArray(json)) return json;
  if (json && typeof json === 'object') {
    const o = json as Record<string, unknown>;
    for (const k of ['voices', 'data', 'models']) {
      if (Array.isArray(o[k])) return o[k] as unknown[];
    }
  }
  return [];
}

function asVoice(v: unknown): VsVoice {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const id = String(o.voice_id ?? o.id ?? '');
  return {
    id,
    name: String(o.name ?? id),
    type: String(o.type ?? ''),
    language: String(o.language ?? ''),
  };
}

export async function vsCheck(): Promise<VsStatus> {
  let online = false;
  try {
    const r = await vsFetch('/v1/models', {}, 4000);
    online = r.ok;
  } catch {
    online = false;
  }
  vsState.status = online ? 'online' : 'offline';
  vsRenderStatus();
  if (online) {
    try {
      vsState.models = (await (await vsFetch('/v1/models')).json().then(asArray))
        .map((m) => {
          const o = (m && typeof m === 'object' ? m : {}) as Record<string, unknown>;
          return String(o.id ?? o.name ?? '');
        })
        .filter(Boolean);
    } catch {
      vsState.models = [];
    }
    try {
      vsState.voices = asArray(await (await vsFetch('/v1/audio/voices')).json()).map(asVoice).filter((v) => v.id);
    } catch {
      vsState.voices = [];
    }
    vsRenderVoices();
    vsRenderModels();
  }
  return vsState.status;
}

export function vsRenderStatus(): void {
  const el = document.getElementById('vsStatus');
  if (!el) return;
  el.textContent =
    vsState.status === 'online'
      ? tr('vs.status.online')
      : vsState.status === 'offline'
        ? tr('vs.status.offline')
        : tr('vs.status.unknown');
  el.className = 'badge ' + (vsState.status === 'online' ? 'b-ok' : vsState.status === 'offline' ? 'b-warn' : '');
}

export function vsRenderVoices(): void {
  const sel = document.getElementById('vsVoiceSel') as HTMLSelectElement | null;
  if (!sel) return;
  sel.innerHTML = '';
  const empty = document.createElement('option');
  empty.value = '';
  empty.textContent = tr('vs.voice.empty');
  sel.appendChild(empty);
  for (const v of vsState.voices) {
    const o = document.createElement('option');
    o.value = v.id;
    o.textContent = v.name + (v.language ? ' (' + v.language + ')' : '');
    sel.appendChild(o);
  }
}

export function vsRenderModels(): void {
  const ul = document.getElementById('vsModelList');
  if (!ul) return;
  ul.innerHTML = '';
  if (vsState.models.length === 0) {
    const li = document.createElement('li');
    li.textContent = tr('vs.models.empty');
    ul.appendChild(li);
    return;
  }
  for (const m of vsState.models) {
    const li = document.createElement('li');
    li.textContent = m;
    ul.appendChild(li);
  }
}

// Dipanggil applyLanguage: render ulang teks dinamis tab Voice dari state terakhir.
export function vsRefreshVoiceUI(): void {
  vsRenderStatus();
  vsRenderVoices();
  vsRenderModels();
}

function setNote(id: string, text: string): void {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function showAudio(audioId: string, dlId: string, url: string, filename: string): void {
  const a = document.getElementById(audioId) as HTMLAudioElement | null;
  if (a) {
    a.src = url;
    a.style.display = 'block';
  }
  const d = document.getElementById(dlId) as HTMLAnchorElement | null;
  if (d) {
    d.href = url;
    d.download = filename;
    d.style.display = 'inline-block';
  }
}

async function audioBlobToUrl(resp: Response): Promise<string> {
  const ct = (resp.headers.get('content-type') || '').toLowerCase();
  if (ct.includes('application/json')) {
    const j = (await resp.json()) as Record<string, unknown>;
    const p = String(j.audio ?? j.path ?? j.url ?? '');
    if (!p) throw new Error('format respons tak dikenal');
    const full = p.startsWith('http') ? p : VS_BASE + (p.startsWith('/') ? p : '/' + p);
    const r2 = await vsFetch(full.replace(VS_BASE, ''), {}, 30000);
    if (!r2.ok) throw new Error('gagal mengunduh audio: HTTP ' + r2.status);
    return URL.createObjectURL(await r2.blob());
  }
  return URL.createObjectURL(await resp.blob());
}

async function readErr(resp: Response): Promise<string> {
  try {
    const t = await resp.text();
    return t.slice(0, 200) || 'HTTP ' + resp.status;
  } catch {
    return 'HTTP ' + resp.status;
  }
}

export async function vsGenerateTts(): Promise<void> {
  const text = (document.getElementById('vsText') as HTMLTextAreaElement | null)?.value.trim() || '';
  if (!text) {
    setNote('vsNote', tr('vs.text.empty'));
    return;
  }
  const voice = (document.getElementById('vsVoiceSel') as HTMLSelectElement | null)?.value || 'default';
  const speed = parseFloat((document.getElementById('vsSpeed') as HTMLInputElement | null)?.value || '1') || 1;
  setNote('vsNote', tr('vs.generating'));
  try {
    const resp = await vsFetch(
      '/v1/audio/speech',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'omnivoice',
          input: text,
          voice,
          response_format: 'wav',
          speed,
          language: 'id',
        }),
      },
      120000,
    );
    if (!resp.ok) throw new Error(await readErr(resp));
    const url = await audioBlobToUrl(resp);
    showAudio('vsAudio', 'vsDownload', url, 'voice.wav');
    setNote('vsNote', tr('vs.done'));
  } catch (e) {
    setNote('vsNote', tr('vs.error') + (e instanceof Error ? e.message : String(e)));
  }
}

export async function vsGenerateClone(): Promise<void> {
  const text = (document.getElementById('vsCloneText') as HTMLTextAreaElement | null)?.value.trim() || '';
  if (!text) {
    setNote('vsCloneNote', tr('vs.text.empty'));
    return;
  }
  const file = (document.getElementById('vsRefFile') as HTMLInputElement | null)?.files?.[0];
  if (!file) {
    setNote('vsCloneNote', tr('vs.ref.empty'));
    return;
  }
  const speed = parseFloat((document.getElementById('vsCloneSpeed') as HTMLInputElement | null)?.value || '1') || 1;
  const refText = (document.getElementById('vsRefText') as HTMLTextAreaElement | null)?.value.trim() || '';
  const fd = new FormData();
  fd.append('text', text);
  fd.append('language', 'id');
  fd.append('ref_audio', file);
  if (refText) fd.append('ref_text', refText);
  fd.append('speed', String(speed));
  setNote('vsCloneNote', tr('vs.generating'));
  try {
    const resp = await vsFetch('/generate', { method: 'POST', body: fd }, 180000);
    if (!resp.ok) throw new Error(await readErr(resp));
    const url = await audioBlobToUrl(resp);
    showAudio('vsCloneAudio', 'vsCloneDownload', url, 'voice-clone.wav');
    setNote('vsCloneNote', tr('vs.done'));
  } catch (e) {
    setNote('vsCloneNote', tr('vs.error') + (e instanceof Error ? e.message : String(e)));
  }
}
