// Generator video Wan 3.0 via ClassAI Router — dipakai tab Video (model 'wan').
// Kontrak (docs router.classai.id/docs, dibaca 2 Nov 2026): POST /v1/videos
// dengan header Authorization Bearer (kunci ClassAI milik user, diinput
// sendiri di Settings — TIDAK PERNAH ditulis di kode), body {model:
// 'wan-3.0', prompt, aspect_ratio, resolution, seconds} -> job {id};
// poll GET /v1/videos/{id} tiap ~10 detik sampai status 'completed'
// (Wan 3.0: 2–3 menit); unduh dari field url atau GET
// /v1/videos/{id}/content. Tarif (1 miliar kredit = $12,48): 480p 9,2 jt
// kredit/detik; 720p 18,5 jt/detik; 1080p 37 jt/detik; minimum 33,3 jt
// kredit/video. Kredit ditahan saat mulai, hanya ditagih bila video
// jadi. CATATAN JUJUR: Wan 3.0 di 1080p BUKAN lebih murah dari Omni
// (klip 10 detik 1080p = 370 jt kredit = $4,62 vs Omni 1080p $1,52) —
// Wan diposisikan sebagai mesin alternatif yang tidak butuh billing
// Google; Omni tetap mesin utama footage. Tagihan mengikuti detik YANG
// DIMINTA (kontrak: per detik), bukan durasi hasil probe.

import { invoke } from '@tauri-apps/api/core';
import { b64FromBytes } from './omni-gen.js';

export const CLASSAI_BASE = 'https://router.classai.id/v1';
export const WAN_MODEL = 'wan-3.0';
export const WAN_CREDITS_PER_USD = 1000000000 / 12.48;
export const WAN_CREDITS_PER_SEC: Record<string, number> = {
  '480p': 9.2e6,
  '720p': 18.5e6,
  '1080p': 37e6,
};
export const WAN_MIN_CREDITS = 33.3e6;
export const WAN_USD_RATE = 18148; // sama seperti OMNI_USD_RATE (snapshot 28 Okt)
const SPEND_LS = 'minime.classaiSpend';

export interface WanOpts {
  prompt: string;
  aspect: string;
  resolution: string;
  seconds: number;
}

export function wanPriceCredits(resolution: string, seconds: number): number {
  return Math.max(WAN_MIN_CREDITS, (WAN_CREDITS_PER_SEC[resolution] ?? 0) * seconds);
}

export function wanPriceUsd(resolution: string, seconds: number): number {
  return wanPriceCredits(resolution, seconds) / WAN_CREDITS_PER_USD;
}

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

export interface WanGenResult {
  path: string;
  seconds: number;
  usd: number;
  credits: number;
}

export async function wanGenerateClip(
  key: string,
  o: WanOpts,
  onPhase?: (phase: 'start' | 'generating' | 'save', elapsedSec?: number) => void,
): Promise<WanGenResult> {
  onPhase?.('start');
  const create = await fetch(`${CLASSAI_BASE}/videos`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: WAN_MODEL,
      prompt: o.prompt,
      aspect_ratio: o.aspect,
      resolution: o.resolution,
      seconds: o.seconds,
    }),
  });
  if (!create.ok) throw new Error(`ClassAI HTTP ${create.status}: ${(await create.text()).slice(0, 200)}`);
  const job = (await create.json()) as { id?: string; job_id?: string };
  const id = job.id ?? job.job_id;
  if (!id) throw new Error('ClassAI: respons tanpa id job');
  const t0 = Date.now();
  const deadline = t0 + 10 * 60 * 1000;
  let status = '';
  let downloadUrl = '';
  while (Date.now() < deadline) {
    const r = await fetch(`${CLASSAI_BASE}/videos/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!r.ok) throw new Error(`ClassAI HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const j = (await r.json()) as { status?: string; url?: string; download_url?: string };
    status = j.status ?? '';
    downloadUrl = j.url ?? j.download_url ?? '';
    onPhase?.('generating', Math.round((Date.now() - t0) / 1000));
    if (status === 'completed') break;
    if (status === 'failed' || status === 'cancelled' || status === 'expired') {
      throw new Error(`ClassAI: job ${status}`);
    }
    await sleep(10000);
  }
  if (status !== 'completed') throw new Error('ClassAI: waktu tunggu 10 menit habis');
  onPhase?.('save');
  const dlUrl = downloadUrl || `${CLASSAI_BASE}/videos/${encodeURIComponent(id)}/content`;
  const v = await fetch(dlUrl, { headers: { Authorization: `Bearer ${key}` } });
  if (!v.ok) throw new Error(`ClassAI HTTP ${v.status}: ${(await v.text()).slice(0, 200)}`);
  const buf = new Uint8Array(await v.arrayBuffer());
  if (!buf.length) throw new Error('ClassAI: unduhan kosong');
  const saved = await invoke<{ path: string }>('video_save', {
    req: { name: `wan-${Date.now()}.mp4`, b64: b64FromBytes(buf) },
  });
  const probe = await invoke<{ duration: number }>('video_probe', { req: { path: saved.path } });
  const seconds = typeof probe?.duration === 'number' && probe.duration > 0 ? probe.duration : o.seconds;
  const credits = wanPriceCredits(o.resolution, o.seconds);
  const usd = credits / WAN_CREDITS_PER_USD;
  addClassaiSpend(credits, usd);
  return { path: saved.path, seconds, usd, credits };
}

export interface ClassaiSpend {
  videos: number;
  credits: number;
  usd: number;
  idr: number;
  rate: number;
}

export function readClassaiSpend(): ClassaiSpend {
  try {
    const v = JSON.parse(window.localStorage.getItem(SPEND_LS) || '{}') as Partial<ClassaiSpend>;
    return {
      videos: typeof v.videos === 'number' ? v.videos : 0,
      credits: typeof v.credits === 'number' ? v.credits : 0,
      usd: typeof v.usd === 'number' ? v.usd : 0,
      idr: typeof v.idr === 'number' ? v.idr : 0,
      rate: WAN_USD_RATE,
    };
  } catch {
    return { videos: 0, credits: 0, usd: 0, idr: 0, rate: WAN_USD_RATE };
  }
}

export function addClassaiSpend(credits: number, usd: number): ClassaiSpend {
  const cur = readClassaiSpend();
  const next: ClassaiSpend = {
    videos: cur.videos + 1,
    credits: Math.round(cur.credits + credits),
    usd: Math.round((cur.usd + usd) * 100) / 100,
    idr: Math.round((cur.usd + usd) * WAN_USD_RATE),
    rate: WAN_USD_RATE,
  };
  try {
    window.localStorage.setItem(SPEND_LS, JSON.stringify(next));
  } catch {
    /* kuota penuh: abaikan */
  }
  return next;
}
