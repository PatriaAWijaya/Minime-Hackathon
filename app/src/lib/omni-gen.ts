// Generator video Gemini Omni via Interactions API — dipakai tab Video.
// Menggantikan video-gen.ts (Veo): model preview Veo 3.1 di Gemini API
// dimatikan Google 22 Okt 2026 (404 untuk semua tier) — bukan bug app.
// Kontrak (dok resmi ai.google.dev/gemini-api/docs/omni): POST
// /v1beta/interactions dengan ?key= (pola yang sama dengan callGemini —
// header TIDAK dipakai agar kompatibel dengan mekanisme surrogate
// Secure Vault), body {model: 'gemini-omni-1.1-flash', input,
// response_format: {type: 'video', aspect_ratio, resolution}} ->
// {steps: [...], status: 'completed'}; video ada di steps[] bertipe
// model_output, content[] bertipe video (data base64, mime video/mp4).
// Bentuk input: teks saja -> string; gambar -> array [gambar...,
// {type:'text', text}] (gambar dulu, teks terakhir; mode frame awal,
// frame awal+akhir, dan referensi memakai bentuk yang sama — model
// memutuskan pemakaian gambar dari prompt).
// Satu panggilan sinkron (tanpa polling); timeout 10 menit seperti
// batas polling Veo dulu. Durasi TIDAK bisa diminta (klip hingga 10
// detik, ditentukan model) — durasi aktual diukur lewat video_probe
// sesudah simpan. Tarif (per token video output, audio termasuk):
// $17,50 per 1 jt token; token/detik: 360p 1931, 720p 5792, 1080p 8688,
// 4k 17376 (angka dok tarif Google; 1080p/4k = upscale). Input
// ($1,50 per 1 jt token) TIDAK dihitung di spend app — kecil dibanding
// output video, dan respons REST tidak membawa usage. Omni TIDAK punya
// free tier — kunci Gemini harus milik project dengan billing aktif.

import { invoke } from '@tauri-apps/api/core';

export const OMNI_BASE = 'https://generativelanguage.googleapis.com/v1beta';
export const OMNI_MODEL = 'gemini-omni-1.1-flash';
export const OMNI_TOKEN_PRICE_USD = 17.5 / 1000000;
export const OMNI_TOKENS_PER_SEC: Record<string, number> = {
  '360p': 1931,
  '720p': 5792,
  '1080p': 8688,
  '4k': 17376,
};
export const OMNI_USD_RATE = 18148; // sama seperti IMG_USD_RATE (snapshot 28 Okt)
const SPEND_LS = 'minime.videoSpend';

export interface OmniImage {
  b64: string;
  mime: string;
}

export interface OmniOpts {
  prompt: string;
  aspect: string;
  resolution: string;
  // Gambar input (mode frames: [awal] atau [awal, akhir]; mode refs:
  // 1-3 referensi). Kosong/undefined = teks saja.
  images?: OmniImage[];
}

// Tebak mime dari prefix base64 (dulu veoMimeForB64 di video-gen).
export function mimeForB64(b64: string): string {
  if (b64.startsWith('iVBORw0KGgo')) return 'image/png';
  if (b64.startsWith('/9j/')) return 'image/jpeg';
  if (b64.startsWith('R0lGOD')) return 'image/gif';
  return 'image/webp';
}

// Uint8Array -> base64 tanpa stack overflow (chunked).
export function b64FromBytes(bytes: Uint8Array): string {
  let bin = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH) as unknown as number[]);
  }
  return btoa(bin);
}

export function omniPriceUsd(resolution: string, seconds: number): number {
  return (OMNI_TOKENS_PER_SEC[resolution] ?? 0) * OMNI_TOKEN_PRICE_USD * seconds;
}

export function omniRequestBody(prompt: string, aspect: string, resolution: string, images?: OmniImage[]): unknown {
  const input: unknown = images?.length
    ? [...images.map((im) => ({ type: 'image', data: im.b64, mime_type: im.mime })), { type: 'text', text: prompt }]
    : prompt;
  return {
    model: OMNI_MODEL,
    input,
    response_format: { type: 'video', aspect_ratio: aspect, resolution },
  };
}

export interface OmniGenResult {
  path: string;
  seconds: number;
  usd: number;
}

export async function omniGenerateClip(
  key: string,
  o: OmniOpts,
  onPhase?: (phase: 'start' | 'generating' | 'save', elapsedSec?: number) => void,
): Promise<OmniGenResult> {
  onPhase?.('start');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10 * 60 * 1000);
  const t0 = Date.now();
  const ticker = setInterval(() => {
    onPhase?.('generating', Math.round((Date.now() - t0) / 1000));
  }, 10000);
  let data: unknown;
  try {
    const url = `${OMNI_BASE}/interactions?key=${encodeURIComponent(key)}`;
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(omniRequestBody(o.prompt, o.aspect, o.resolution, o.images)),
      signal: ctrl.signal,
    });
    if (!r.ok) throw new Error(`Omni HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
    data = await r.json();
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') throw new Error('Omni: waktu tunggu 10 menit habis');
    throw e;
  } finally {
    clearTimeout(timer);
    clearInterval(ticker);
  }
  const steps = (data as { steps?: Array<{ type?: string; content?: Array<{ type?: string; data?: string }> }> })?.steps ?? [];
  let videoB64 = '';
  for (const st of steps) {
    if (st.type !== 'model_output') continue;
    for (const c of st.content ?? []) {
      if (c.type === 'video' && c.data) videoB64 = c.data;
    }
  }
  if (!videoB64) throw new Error('Omni: respons selesai tanpa video');
  onPhase?.('save');
  const saved = await invoke<{ path: string }>('video_save', {
    req: { name: `omni-${Date.now()}.mp4`, b64: videoB64 },
  });
  const probe = await invoke<{ duration: number }>('video_probe', { req: { path: saved.path } });
  const seconds = typeof probe?.duration === 'number' && probe.duration > 0 ? probe.duration : 0;
  const usd = omniPriceUsd(o.resolution, seconds);
  addVideoSpend(usd);
  return { path: saved.path, seconds, usd };
}

export interface VideoSpend {
  videos: number;
  usd: number;
  idr: number;
  rate: number;
}

export function readVideoSpend(): VideoSpend {
  try {
    const v = JSON.parse(window.localStorage.getItem(SPEND_LS) || '{}') as Partial<VideoSpend>;
    return {
      videos: typeof v.videos === 'number' ? v.videos : 0,
      usd: typeof v.usd === 'number' ? v.usd : 0,
      idr: typeof v.idr === 'number' ? v.idr : 0,
      rate: OMNI_USD_RATE,
    };
  } catch {
    return { videos: 0, usd: 0, idr: 0, rate: OMNI_USD_RATE };
  }
}

export function addVideoSpend(usd: number): VideoSpend {
  const cur = readVideoSpend();
  const next: VideoSpend = {
    videos: cur.videos + 1,
    usd: Math.round((cur.usd + usd) * 100) / 100,
    idr: Math.round((cur.usd + usd) * OMNI_USD_RATE),
    rate: OMNI_USD_RATE,
  };
  try {
    window.localStorage.setItem(SPEND_LS, JSON.stringify(next));
  } catch {
    /* kuota penuh: abaikan */
  }
  return next;
}
