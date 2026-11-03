import { invoke } from '@tauri-apps/api/core';
import { tr } from './i18n.js';
import { vedRegisterBlob } from './voice-editor.js';

// Klien VoiceStudio lokal (proses terpisah, TIDAK di-bundle — aturan AGPL).
// API terverifikasi dari backend v0.5.6 di MacBook + pemakaian terbukti 22 Okt:
//   GET  /v1/models, GET /v1/audio/voices, POST /v1/audio/speech (JSON),
//   POST /generate (multipart). Engine jalan saat VoiceStudio.app dibuka;
//   sejak v29 MiniMe membukanya OTOMATIS (vs_launch) bila backend mati.
//   v215: fungsi setup satu paket DIHAPUS PENUH (instalasi/upgrade
//   VoiceStudio kini urusan luar app, dipegang di sisi MacBook).
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

// v215: model TTS bisa dipilih (klik daftar) — default 'omnivoice'.
// Pilihan bertahan antar sesi (localStorage minime.vsModel); bila model
// terpilih tak lagi ada di daftar backend, kembali ke 'omnivoice'.
const VS_MODEL_LS = 'minime.vsModel';
function readVsModel(): string {
  try {
    return localStorage.getItem(VS_MODEL_LS) || 'omnivoice';
  } catch {
    return 'omnivoice';
  }
}
export const vsState: { status: VsStatus; voices: VsVoice[]; models: string[]; selectedModel: string } = {
  status: 'unknown',
  voices: [],
  models: [],
  selectedModel: readVsModel(),
};

export function vsSelectModel(m: string): void {
  vsState.selectedModel = m || 'omnivoice';
  try {
    localStorage.setItem(VS_MODEL_LS, vsState.selectedModel);
  } catch {
    /* kuota penuh: abaikan */
  }
  // v225: tanpa UI daftar model — hanya state + penyimpanan.
}

// v223: vsFetch LEWAT PROXY RUST (invoke vs_api), BUKAN fetch WebView.
// Alasan: VoiceStudio 0.5.7 hanya mengembalikan CORS allow-origin
// untuk origin UI web-nya sendiri (localhost:3901); origin Tauri
// (https://tauri.localhost) tidak mendapat allow-origin sehingga
// fetch WebView diblokir browser meski server menjawab 200 — panel
// live selalu "Belum terhubung" padahal backend hidup. Lewat invoke,
// CORS tidak berlaku. Bentuk kembalian = shim Response agar semua
// pemakai lama (r.ok / r.status / r.json() / r.text() / r.blob() /
// headers.get('content-type')) tetap jalan tanpa diubah. Probe UI
// :3901 di vsEmbedCheck TETAP memakai fetch no-cors (opaque cukup
// untuk liveness, dan :3901 memang mengizinkan origin itu).
interface VsApiRes {
  ok: boolean;
  status: number;
  contentType: string;
  text: string;
  b64: string;
}

interface VsShimResp {
  ok: boolean;
  status: number;
  headers: { get: (name: string) => string | null };
  json: () => Promise<unknown>;
  text: () => Promise<string>;
  blob: () => Promise<Blob>;
}

function b64ToBlob(b64: string, mime: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

async function blobToB64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CH));
  }
  return btoa(bin);
}

async function vsFetch(path: string, init?: RequestInit, timeoutMs = 8000): Promise<VsShimResp> {
  const method = (init?.method || 'GET').toUpperCase();
  const req: Record<string, unknown> = {
    method,
    path,
    timeoutSecs: Math.max(1, Math.ceil(timeoutMs / 1000)),
  };
  const body = init?.body;
  if (typeof body === 'string') {
    req.body = body;
  } else if (typeof FormData !== 'undefined' && body instanceof FormData) {
    // Clone multipart: simpan blob ref_audio lewat audio_save yang
    // sudah ada, lalu kirim nama file + field teks ke proxy (field
    // 'ref_audio' dipasang sisi Rust dari file tersebut).
    const fields: [string, string][] = [];
    for (const [k, v] of body.entries()) {
      if (v instanceof Blob) {
        const saved = await invoke<{ file: string }>('audio_save', {
          req: { name: 'vs-clone-' + Date.now() + '.wav', b64: await blobToB64(v) },
        });
        req.file = saved.file;
      } else {
        fields.push([k, String(v)]);
      }
    }
    req.fields = fields;
  }
  const r = await invoke<VsApiRes>('vs_api', { req });
  return {
    ok: r.ok,
    status: r.status,
    headers: { get: (n: string) => (n.toLowerCase() === 'content-type' ? r.contentType || null : null) },
    json: async () => JSON.parse(r.text) as unknown,
    text: async () => r.text,
    blob: async () => b64ToBlob(r.b64, r.contentType || 'audio/wav'),
  };
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
      // v215: pilihan model usang (tak ada di daftar backend) -> default.
      if (vsState.models.length > 0 && !vsState.models.includes(vsState.selectedModel)) {
        vsSelectModel('omnivoice');
      }
    } catch {
      vsState.models = [];
    }
    try {
      vsState.voices = asArray(await (await vsFetch('/v1/audio/voices')).json()).map(asVoice).filter((v) => v.id);
    } catch {
      vsState.voices = [];
    }
    vsRenderVoices();
    // v225: vsRenderModels dihapus (daftar Model lokal dihapus dari UI).
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
//   bila tidak, iframe disembunyikan.
// - v224: judul panel + catatan penjelasan DIHAPUS atas perintah
//   Patria (10:35) — yang tampil hanya bar status + tombol Muat ulang.
//   Cek koneksi berjalan SETELAH embed termuat (onload iframe) dan saat
//   Muat ulang / mount, lewat vsCheck (model + suara); /health tidak
//   lagi dipanggil karena hasilnya hanya dipakai catatan yang dihapus.
export const VS_UI = 'http://localhost:3901';

export async function vsEmbedCheck(): Promise<void> {
  const frame = document.getElementById('vsEmbedFrame') as HTMLIFrameElement | null;
  const status = document.getElementById('vsEmbedStatus');
  if (status) {
    status.textContent = tr('vs.embed.checking');
    status.className = 'badge';
  }
  // 1. Probe UI :3901 (no-cors: resolve = port menjawab).
  // v89 (audit m3): samakan dengan vsFetch — timeout 8 dtk, jangan gantung.
  let uiAlive = false;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    await fetch(VS_UI + '/', { mode: 'no-cors', signal: ctrl.signal });
    uiAlive = true;
  } catch {
    uiAlive = false;
  } finally {
    clearTimeout(t);
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
  // 2. Koneksi API lewat vsCheck (model + suara); status badge yang
  // menentukan (v224: tanpa catatan).
  await vsCheck();
  const apiOnline = vsState.status === 'online';
  if (status) {
    status.textContent = apiOnline ? tr('vs.embed.online') : tr('vs.embed.offline');
    status.className = 'badge ' + (apiOnline ? 'b-ok' : 'b-warn');
  }
}

export async function vsEmbedReload(): Promise<void> {
  const frame = document.getElementById('vsEmbedFrame') as HTMLIFrameElement | null;
  if (frame) frame.removeAttribute('src');
  // v222: Muat ulang BUKAN lagi sekadar periksa — dulu tombol ini hanya
  // memanggil vsEmbedCheck, sehingga backend yang mati TIDAK PERNAH
  // hidup kembali dari tombol ini (akar laporan "Belum terhubung"
  // yang mentok). Kini: nyalakan dulu bila mati, baru periksa.
  await vsActivateOnOpen();
}

// v222: VoiceStudio otomatis aktif + selalu terhubung (perintah Patria
// 10:07, menegaskan 09:06/09:07/09:11). vsActivateOnOpen dipanggil tiap
// Voice Editor dibuka — klik tab Voice, perintah vo: di chat,
// navigasi cb-open-voice — dan oleh tombol Muat ulang: nyalakan via
// vsEnsureBackend (cek -> vs_launch bila mati -> cek lagi), lalu
// segarkan status panel. Fire-and-forget dari pemanggil (UI tidak
// menunggu); gagal total = status panel tetap menampilkan offline
// secara jujur, bukan klaim terhubung. Sengaja TIDAK dipanggil saat
// mount app: user yang tak pernah membuka Voice tak perlu VoiceStudio
// ikut menyala tiap app dibuka.
let vsActivating = false;
let vsWatchdog: ReturnType<typeof setInterval> | null = null;

export function vsVoiceTabActive(): boolean {
  const panel = document.getElementById('ms-tab-voice');
  const view = document.getElementById('view-media');
  return !!panel && panel.style.display === 'block' && !!view && view.classList.contains('active');
}

export async function vsActivateOnOpen(): Promise<void> {
  if (vsActivating) return;
  vsActivating = true;
  try {
    await vsEnsureBackend();
  } catch {
    /* tetap offline — vsEmbedCheck menampilkannya */
  }
  vsActivating = false;
  await vsEmbedCheck();
  vsStartWatchdog();
}

// Satu tick watchdog: hanya berjalan bila tab Voice sedang aktif
// (panel tampil + view media aktif). Bila cek gagal (putus di tengah
// sesi), sambung ulang lewat jalur yang sama dengan aktivasi.
export async function vsVoiceWatchdogTick(): Promise<void> {
  if (!vsVoiceTabActive() || vsActivating) return;
  if ((await vsCheck()) === 'online') return;
  vsActivating = true;
  try {
    await vsEnsureBackend();
  } catch {
    /* tetap offline; tick berikutnya mencoba lagi */
  }
  vsActivating = false;
  await vsEmbedCheck();
}

function vsStartWatchdog(): void {
  if (vsWatchdog) return;
  vsWatchdog = setInterval(() => {
    void vsVoiceWatchdogTick();
  }, 60000);
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

// v225: vsRenderModels DIHAPUS bersama daftar Model lokal di UI
// (perintah Patria 10:39) — pilihan model mengunci ke default terakhir
// (vsState.selectedModel, tetap divalidasi vsCheck terhadap daftar
// backend); vsSelectModel dipertahankan sebagai API programatik.

// Dipanggil applyLanguage: render ulang teks dinamis tab Voice dari state terakhir.
export function vsRefreshVoiceUI(): void {
  vsRenderStatus();
  vsRenderVoices();
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

async function audioBlobToUrl(resp: VsShimResp): Promise<string> {
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

async function readErr(resp: VsShimResp): Promise<string> {
  try {
    const t = await resp.text();
    return t.slice(0, 200) || 'HTTP ' + resp.status;
  } catch {
    return 'HTTP ' + resp.status;
  }
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
        model: vsState.selectedModel || 'omnivoice',
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

/** Set teks TTS dari luar (dipakai handoff Story Board v163: naskah VO
 *  otomatis masuk ke kolom teks Voice Editor, siap di-generate). */
export function vsSetScript(text: string): void {
  const ta = document.getElementById('vsText') as HTMLTextAreaElement | null;
  if (ta) ta.value = text;
}
