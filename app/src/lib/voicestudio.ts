import { invoke } from '@tauri-apps/api/core';
import { tr } from './i18n.js';
import { vedRegisterBlob } from './voice-editor.js';

// Klien VoiceStudio lokal (proses terpisah, TIDAK di-bundle — aturan AGPL).
// API terverifikasi dari backend v0.5.6 di MacBook + pemakaian terbukti 22 Okt:
//   GET  /v1/models, GET /v1/audio/voices, POST /v1/audio/speech (JSON),
//   POST /generate (multipart). Engine jalan saat VoiceStudio.app dibuka;
//   sejak v29 MiniMe membukanya OTOMATIS (vs_launch) bila backend mati,
//   dan Setup satu paket (vs_install) mengunduh + memasang + membukanya.
// Perintah agen: agentVoiceTts/agentVoiceClone — pastikan backend dulu,
// panggil API, kembalikan audio ke MiniMe (player + unduh = "import").

export const VS_BASE = 'http://127.0.0.1:3900';
// UI web VoiceStudio: server Vite di :3901 (tujuan redirect root :3900).
// Pada install produksi server itu TIDAK berjalan (terbukti: tidak ada
// listener :3901) — UI produksi ada di dalam app.asar Electron.

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

// Panel VoiceStudio di Voice Editor (pola embed panel di
// Planner, disesuaikan dengan kenyataan VoiceStudio):
// - Backend :3900 HANYA API; UI web :3901 hanya ada bila server Vite-nya
//   berjalan. Karena itu iframe HANYA dipasang bila probe :3901 menjawab;
//   bila tidak, iframe disembunyikan dan panel menampilkan pemeriksaan
//   koneksi API + panduan buka aplikasi (tanpa panel kosong yang diam).
// - Cek koneksi berjalan SETELAH embed termuat (onload iframe) dan saat
//   Muat ulang / mount: /health (versi + device) + vsCheck (model + suara).
export const VS_UI = 'http://localhost:3901';

let vsEmbedCSPWatched = false;
function vsEmbedWatchCSP(): void {
  if (vsEmbedCSPWatched) return;
  vsEmbedCSPWatched = true;
  document.addEventListener('securitypolicyviolation', (ev) => {
    const d = (ev as SecurityPolicyViolationEvent).violatedDirective || '';
    if (d.includes('frame-src')) {
      const note = document.getElementById('vsEmbedNote');
      if (note) note.textContent = tr('vs.embed.blocked');
    }
  });
}

export async function vsEmbedCheck(): Promise<void> {
  vsEmbedWatchCSP();
  const frame = document.getElementById('vsEmbedFrame') as HTMLIFrameElement | null;
  const status = document.getElementById('vsEmbedStatus');
  const note = document.getElementById('vsEmbedNote');
  if (status) {
    status.textContent = tr('vs.embed.checking');
    status.className = 'badge';
  }
  // 1. Probe UI :3901 (no-cors: resolve = port menjawab).
  let uiAlive = false;
  try {
    await fetch(VS_UI + '/', { mode: 'no-cors' });
    uiAlive = true;
  } catch {
    uiAlive = false;
  }
  if (frame) {
    if (uiAlive) {
      // Guard: set src hanya bila berubah, agar onload -> check tidak
      // memicu reload -> onload tanpa henti.
      if (frame.getAttribute('src') !== VS_UI) frame.src = VS_UI;
      frame.style.display = '';
    } else {
      frame.removeAttribute('src');
      frame.style.display = 'none';
    }
  }
  // 2. Koneksi API: /health (versi + device) + vsCheck (model + suara).
  let version = '?';
  let device = '?';
  try {
    const r = await vsFetch('/health', {}, 4000);
    if (r.ok) {
      const j = (await r.json()) as Record<string, unknown>;
      version = String(j.version ?? '?');
      device = String(j.device ?? '?');
    }
  } catch {
    /* health gagal -> status dari vsCheck yang menentukan */
  }
  await vsCheck();
  const apiOnline = vsState.status === 'online';
  if (status) {
    status.textContent = apiOnline ? tr('vs.embed.online') : tr('vs.embed.offline');
    status.className = 'badge ' + (apiOnline ? 'b-ok' : 'b-warn');
  }
  if (note) {
    const parts = [uiAlive ? tr('vs.embed.ui.online') : tr('vs.embed.ui.offline')];
    if (apiOnline) {
      parts.push(
        tr('vs.embed.conn', {
          version,
          device,
          models: String(vsState.models.length),
          voices: String(vsState.voices.length),
        }),
      );
    }
    note.textContent = parts.join(' ');
  }
}

export async function vsEmbedReload(): Promise<void> {
  const frame = document.getElementById('vsEmbedFrame') as HTMLIFrameElement | null;
  if (frame) frame.removeAttribute('src');
  await vsEmbedCheck();
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

export function showAudio(audioId: string, dlId: string, url: string, filename: string): void {
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

export interface VsInstallResult {
  installed: boolean;
  skippedDownload: boolean;
  appPath: string;
  backendUp: boolean;
  version: string;
}

// Perintah agen: pastikan backend VoiceStudio hidup (buka otomatis bila
// mati), lalu kembalikan status. Melempar bila backend tetap mati.
export async function vsEnsureBackend(): Promise<VsStatus> {
  if ((await vsCheck()) === 'online') return 'online';
  await invoke('vs_launch', {});
  if ((await vsCheck()) === 'online') return 'online';
  throw new Error('backend VoiceStudio tidak merespons setelah diluncurkan otomatis');
}

// Perintah agen (TTS): pastikan backend, panggil API, kembalikan audio
// ke MiniMe (URL + nama file) — inilah "import hasil kembali ke MiniMe".
export async function agentVoiceTts(
  text: string,
  voice = 'default',
  speed = 1,
): Promise<{ url: string; filename: string }> {
  await vsEnsureBackend();
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
  return { url: await audioBlobToUrl(resp), filename: 'voice.wav' };
}

// Perintah agen (clone): sama, lewat /generate multipart.
export async function agentVoiceClone(
  text: string,
  file: File,
  refText = '',
  speed = 1,
): Promise<{ url: string; filename: string }> {
  await vsEnsureBackend();
  const fd = new FormData();
  fd.append('text', text);
  fd.append('language', 'id');
  fd.append('ref_audio', file);
  if (refText) fd.append('ref_text', refText);
  fd.append('speed', String(speed));
  const resp = await vsFetch('/generate', { method: 'POST', body: fd }, 180000);
  if (!resp.ok) throw new Error(await readErr(resp));
  return { url: await audioBlobToUrl(resp), filename: 'voice-clone.wav' };
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
    const { url, filename } = await agentVoiceTts(text, voice, speed);
    showAudio('vsAudio', 'vsDownload', url, filename);
    setNote('vsNote', tr('vs.done'));
    void vedRegisterBlob(url, filename, 'tts');
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
  setNote('vsCloneNote', tr('vs.generating'));
  try {
    const { url, filename } = await agentVoiceClone(text, file, refText, speed);
    showAudio('vsCloneAudio', 'vsCloneDownload', url, filename);
    setNote('vsCloneNote', tr('vs.done'));
    void vedRegisterBlob(url, filename, 'clone');
  } catch (e) {
    setNote('vsCloneNote', tr('vs.error') + (e instanceof Error ? e.message : String(e)));
  }
}

// Setup satu paket: unduh + pasang + buka + verifikasi backend.
// UI-nya DIHAPUS v67 atas perintah Patria (tombol Periksa status +
// seksi Setup di tab Voice Editor) — fungsi ini DIPERTAHANKAN agar
// jalur upgrade VoiceStudio (mis. v0.5.6 -> v0.5.7, masih tertunda)
// tidak musnah; pasang kembali tombolnya bila jalur itu dibuka lagi.
// vsCheck tetap dipakai onMount App.svelte (memuat model + suara).
export async function vsSetupInstall(): Promise<void> {
  setNote('vsSetupNote', tr('vs.setup.working'));
  try {
    const r = await invoke<VsInstallResult>('vs_install', {});
    setNote(
      'vsSetupNote',
      tr('vs.setup.done') + ' ' + r.appPath + (r.skippedDownload ? ' (' + tr('vs.setup.skipped') + ')' : ' (v' + r.version + ')'),
    );
    await vsCheck();
  } catch (e) {
    setNote('vsSetupNote', tr('vs.error') + (e instanceof Error ? e.message : String(e)));
  }
}

export async function vsSetupLaunch(): Promise<void> {
  setNote('vsSetupNote', tr('vs.setup.working'));
  try {
    await invoke('vs_launch', {});
    setNote('vsSetupNote', tr('vs.setup.done'));
    await vsCheck();
  } catch (e) {
    setNote('vsSetupNote', tr('vs.error') + (e instanceof Error ? e.message : String(e)));
  }
}
