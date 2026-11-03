// Generator komposisi HyperFrames dari deskripsi user (v185).
// Alur: deskripsi -> model (rantai router standar) -> HTML komposisi
// -> diisi ke kolom Komposisi HTML untuk diperiksa/diubah lalu Render.
// Modul ini TIDAK me-render; render tetap lewat perintah Rust
// hyperframes_render dengan HTML yang tampil di kolom.
import { ModelRouter, defaultRouterConfig } from '../../../src/router';
import { readKeys } from './chat.js';
import { MODEL_LANG_INSTRUCTION } from './i18n.js';
import { recordLiveCost } from './cost.js';

function hfGenPrompt(desc: string): string {
  return [
    'You are an expert HyperFrames motion-graphics composer. Convert the user description below into ONE complete, self-contained HTML document that HyperFrames can render. Follow this contract EXACTLY — any deviation breaks the render:',
    '1. Full HTML document: doctype, html, head with meta charset, a style block, and body. Load GSAP with a script tag whose src is exactly ./gsap.min.js (that file sits next to the document at render time).',
    '2. Canvas: one root div with id "root" and attributes data-composition-id="main", data-start="0", data-duration="<seconds>", data-width and data-height. Default vertical 1080x1920; if the description asks for landscape/wide, use 1920x1080 instead.',
    '3. Duration: total seconds from the description if stated, else 15. Keep it between 5 and 30.',
    '4. Every animated element must carry class "clip" plus data-start, data-duration and data-track-index (0, 1, 2, ...).',
    '5. Body-end script: build ONE paused GSAP timeline (gsap.timeline({ paused: true })) with tweens positioned at the matching data-start times, then assign it to window.__timelines["main"] and call tl.seek(0).',
    '6. Use ONLY CSS + GSAP: no external fonts, images, videos, audio, or network URLs. System fonts only; visuals from CSS shapes, gradients and text.',
    '7. All visible text in Indonesian, unless the description requests another language.',
    '8. Output ONLY the HTML document. No explanation, no markdown fences, no surrounding commentary.',
    'User description:',
    desc,
  ].join('\n');
}

// Ambil dokumen HTML dari jawaban model (lepas pagar markdown bila ada).
// Mengembalikan null bila bukan komposisi (tanpa data-composition-id).
export function hfExtractHtml(text: string): string | null {
  const fenced = text.match(/```html\s*([\s\S]*?)```/i) || text.match(/```\s*([\s\S]*?)```/);
  const code = (fenced ? fenced[1] : text).trim();
  return /data-composition-id\s*=/.test(code) ? code : null;
}

export async function hfGenerateHtml(desc: string, lang: string): Promise<{ html: string; provider: string; model: string }> {
  const keys = readKeys();
  const cfg = defaultRouterConfig();
  cfg.geminiApiKey = keys.gemini;
  cfg.metaApiKey = keys.meta;
  cfg.anthropicApiKey = keys.anthropic;
  cfg.systemInstruction = MODEL_LANG_INSTRUCTION[lang as keyof typeof MODEL_LANG_INSTRUCTION];
  const router = new ModelRouter(cfg);
  const r = await router.callWithFallback(hfGenPrompt(desc), 'trace-hf-gen-' + Date.now());
  recordLiveCost(r);
  const html = hfExtractHtml(r.text);
  if (!html) throw new Error('HF_GEN_INVALID');
  return { html, provider: r.provider, model: r.model };
}
