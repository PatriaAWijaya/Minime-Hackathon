// Klien image Meta + akuntansi spend — dipakai image-flow & batch-flow.
//
// Kontrak TERVERIFIKASI probe live 28 Okt 2026 (STATUS 200, WebP):
// POST https://api.meta.ai/v1/images/generations, Bearer kunci Meta,
// body {model, prompt, n, size, response_format: 'b64_json',
// output_format: 'webp'} -> {data: [{b64_json}]}.
// Biaya $0,01/gambar; kurs Rp18.148/USD (Finnhub 28 Okt).

export const IMG_MODEL = 'muse-image-1.0';
export const IMG_PRICE_USD = 0.01;
export const IMG_USD_RATE = 18148;
const SPEND_LS = 'minime.imageSpend';

// Rasio -> size "WxH". HANYA 1024x1024 terverifikasi live; rasio lain
// memakai pola param yang sama (size dibaca model sebagai rasio).
export const RATIO_SIZE: Record<string, string> = {
  '1:1': '1024x1024', '4:5': '1024x1280', '9:16': '1024x1820', '16:9': '1820x1024',
  '3:4': '1024x1365', '3:2': '1536x1024', '2:3': '1024x1536',
};

export type ImgSpend = { images: number; usd: number; idr: number };

export function readImgSpend(): ImgSpend {
  try {
    const raw = window.localStorage.getItem(SPEND_LS);
    const o = raw ? JSON.parse(raw) : null;
    if (o && typeof o.images === 'number' && typeof o.usd === 'number') {
      return { images: o.images, usd: o.usd, idr: typeof o.idr === 'number' ? o.idr : Math.round(o.usd * IMG_USD_RATE) };
    }
  } catch { /* abaikan, pakai default */ }
  return { images: 0, usd: 0, idr: 0 };
}

export function saveImgSpend(s: ImgSpend): void {
  try { window.localStorage.setItem(SPEND_LS, JSON.stringify(s)); } catch { /* abaikan */ }
  const fn = (window as unknown as Record<string, unknown>).refreshImgSpend;
  if (typeof fn === 'function') (fn as () => void)();
}

export function addImgSpend(n: number): ImgSpend {
  const s = readImgSpend();
  s.images += n;
  s.usd = Math.round((s.usd + n * IMG_PRICE_USD) * 100) / 100;
  s.idr = Math.round(s.usd * IMG_USD_RATE);
  saveImgSpend(s);
  return s;
}

/** Generate n gambar; mengembalikan daftar b64 (bisa lebih sedikit dari
 *  n bila API mengembalikan sebagian). Error dilempar sebagai Error
 *  dengan pesan HTTP + cuplikan body — pemanggil yang menerjemahkan. */
export async function metaGenerateImage(key: string, prompt: string, n: number, size: string): Promise<string[]> {
  const r = await fetch('https://api.meta.ai/v1/images/generations', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: IMG_MODEL,
      prompt,
      n,
      size,
      response_format: 'b64_json',
      output_format: 'webp',
    }),
  });
  if (!r.ok) {
    throw new Error('Meta images HTTP ' + r.status + ' ' + (await r.text()).slice(0, 200));
  }
  const j = await r.json();
  const data = Array.isArray(j.data) ? j.data : [];
  return data
    .filter((d: { b64_json?: string }) => typeof d.b64_json === 'string' && d.b64_json.length > 0)
    .map((d: { b64_json: string }) => d.b64_json);
}
