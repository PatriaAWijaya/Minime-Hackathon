// Generator video Veo via Gemini API — dipakai tab Video.
// Kontrak (dok resmi ai.google.dev/gemini-api/docs/veo + tarif Gemini API
// per Okt 2026): POST /v1beta/models/{model}:predictLongRunning dengan
// ?key= (pola yang sama dengan callGemini — header TIDAK dipakai agar
// kompatibel dengan mekanisme surrogate Secure Vault), body
// {instances:[{prompt}], parameters:{aspectRatio, resolution,
// durationSeconds, sampleCount:1}} -> {name: operations/...}; polling
// GET /v1beta/{name}?key= sampai done:true ->
// response.generateVideoResponse.generatedSamples[0].video.uri;
// unduh URI itu (+?key=) -> byte MP4 -> simpan via video_save.
// PENTING: Veo TIDAK punya free tier — kunci Gemini harus milik project
// Google Cloud dengan billing aktif; tanpa billing Google menolak
// dengan error yang tampak seperti auth. Tarif (per detik, audio
// termasuk): Standard $0.40 (720p/1080p), $0.60 (4K); Fast $0.10/$0.12/
// $0.30; Lite $0.05/$0.08 (tanpa 4K). v1: 720p/1080p saja, durasi 4/6/8.

import { invoke } from '@tauri-apps/api/core';

export const VEO_BASE = 'https://generativelanguage.googleapis.com/v1beta';
export type VeoTier = 'standard' | 'fast' | 'lite';
export const VEO_MODELS: Record<VeoTier, string> = {
  standard: 'veo-3.1-generate-preview',
  fast: 'veo-3.1-fast-generate-preview',
  lite: 'veo-3.1-lite-generate-preview',
};
export const VEO_RATES: Record<VeoTier, Record<string, number>> = {
  standard: { '720p': 0.4, '1080p': 0.4 },
  fast: { '720p': 0.1, '1080p': 0.12 },
  lite: { '720p': 0.05, '1080p': 0.08 },
};
export const VEO_USD_RATE = 18148; // sama seperti IMG_USD_RATE (snapshot 28 Okt)
const SPEND_LS = 'minime.videoSpend';

export interface VeoOpts {
  prompt: string;
  tier: VeoTier;
  aspect: string;
  resolution: string;
  duration: number;
  // v168: gambar referensi (storyboard) = frame awal video
  // (image-to-video). Satu gambar; prompt menjelaskan gerakannya.
  image?: { b64: string; mime: string };
}

// Tebak mime dari prefix base64 (cerminan mimeFromB64 di image-api;
// diduplikasi di sini agar video-gen tetap mandiri tanpa impor silang).
export function veoMimeForB64(b64: string): string {
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

export function veoPriceUsd(tier: VeoTier, resolution: string, seconds: number): number {
  return (VEO_RATES[tier]?.[resolution] ?? 0) * seconds;
}

export function veoRequestBody(prompt: string, aspect: string, resolution: string, duration: number, image?: { b64: string; mime: string }): unknown {
  return {
    instances: [{ prompt, ...(image ? { image: { bytesBase64Encoded: image.b64, mimeType: image.mime } } : {}) }],
    parameters: { aspectRatio: aspect, resolution, durationSeconds: duration, sampleCount: 1 },
  };
}

async function veoStart(key: string, o: VeoOpts): Promise<string> {
  const url = `${VEO_BASE}/models/${VEO_MODELS[o.tier]}:predictLongRunning?key=${encodeURIComponent(key)}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(veoRequestBody(o.prompt, o.aspect, o.resolution, o.duration, o.image)),
  });
  if (!r.ok) throw new Error(`Veo start HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const data = (await r.json()) as { name?: string };
  if (!data?.name) throw new Error('Veo: operasi tidak dikembalikan API');
  return data.name;
}

async function veoPollOnce(key: string, op: string): Promise<{ done: boolean; uri?: string }> {
  const url = `${VEO_BASE}/${op}?key=${encodeURIComponent(key)}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Veo poll HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const data = (await r.json()) as {
    done?: boolean;
    error?: { message?: string; status?: string };
    response?: { generateVideoResponse?: { generatedSamples?: Array<{ video?: { uri?: string } }> } };
  };
  if (data.error) throw new Error(`Veo: ${data.error.message || data.error.status || 'error'}`);
  if (!data.done) return { done: false };
  const uri = data?.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
  if (!uri) throw new Error('Veo: operasi selesai tanpa URI video');
  return { done: true, uri };
}

async function veoDownloadB64(key: string, uri: string): Promise<string> {
  const sep = uri.includes('?') ? '&' : '?';
  const r = await fetch(`${uri}${sep}key=${encodeURIComponent(key)}`);
  if (!r.ok) throw new Error(`Veo unduh HTTP ${r.status}`);
  const buf = await r.arrayBuffer();
  return b64FromBytes(new Uint8Array(buf));
}

// Seam test-only untuk rig-video: jeda polling default 10 detik.
function veoPollMs(): number {
  const v = (globalThis as Record<string, unknown>).__VEO_POLL_MS__;
  return typeof v === 'number' && v > 0 ? v : 10000;
}

export interface VeoGenResult {
  path: string;
  seconds: number;
  usd: number;
}

export async function veoGenerateClip(
  key: string,
  o: VeoOpts,
  onPhase?: (phase: 'start' | 'poll' | 'download') => void,
): Promise<VeoGenResult> {
  onPhase?.('start');
  const op = await veoStart(key, o);
  const started = Date.now();
  const MAX_MS = 10 * 60 * 1000;
  for (;;) {
    if (Date.now() - started > MAX_MS) throw new Error('Veo: waktu tunggu 10 menit habis');
    await new Promise((r) => setTimeout(r, veoPollMs()));
    const p = await veoPollOnce(key, op);
    onPhase?.('poll');
    if (p.done && p.uri) {
      onPhase?.('download');
      const b64 = await veoDownloadB64(key, p.uri);
      const saved = await invoke<{ path: string }>('video_save', {
        req: { name: `veo-${Date.now()}.mp4`, b64 },
      });
      const usd = veoPriceUsd(o.tier, o.resolution, o.duration);
      addVideoSpend(usd);
      return { path: saved.path, seconds: o.duration, usd };
    }
  }
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
      rate: VEO_USD_RATE,
    };
  } catch {
    return { videos: 0, usd: 0, idr: 0, rate: VEO_USD_RATE };
  }
}

export function addVideoSpend(usd: number): VideoSpend {
  const cur = readVideoSpend();
  const next: VideoSpend = {
    videos: cur.videos + 1,
    usd: Math.round((cur.usd + usd) * 100) / 100,
    idr: Math.round((cur.usd + usd) * VEO_USD_RATE),
    rate: VEO_USD_RATE,
  };
  try {
    window.localStorage.setItem(SPEND_LS, JSON.stringify(next));
  } catch {
    /* kuota penuh: abaikan */
  }
  return next;
}
