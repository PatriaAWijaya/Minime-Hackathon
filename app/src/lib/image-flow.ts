// Flow produksi gambar (Meta muse-image-1.0) — tab Image Media Studio.
//
// Kontrak API TERVERIFIKASI probe live 28 Okt 2026 (STATUS 200, 1 gambar
// WebP 210 KB): POST https://api.meta.ai/v1/images/generations,
// Bearer kunci Meta (localStorage minime.metaKey, sama seperti chat),
// body {model, prompt, n, size, response_format: 'b64_json',
// output_format: 'webp'} -> {data: [{b64_json}], output_format, usage}.
// Biaya: $0,01/gambar (flat per daftar harga yang dipegang; bila respons
// membawa usage bertarif, tampilkan itu — bila tidak, pakai rumus n x $0,01).
// Kurs Rp18.148/USD (Finnhub 28 Okt, sama dengan ledger biaya).
//
// Alur: brief (bisa diedit) + rasio/gaya/text-free -> preview prompt
// terkirim -> Generate (async, tombol dikunci selama jalan) -> grid
// varian -> Simpan per varian (file ke ~/minime-images/ via command
// Rust image_save + baris Library persisten via libAddImage) -> galeri
// tersimpan (dibaca balik via image_read). Biaya dihitung saat GENERATE
// (API menagih saat itu, bukan saat simpan).
// "Perbaiki" = generate ulang dengan prompt revisi (jalur terverifikasi);
// endpoint edits khusus BELUM dipakai karena encoding input-nya belum
// terverifikasi — tidak ada tombol yang memanggil API dengan format tebakan.
// Lampiran ke draf Postiz BELUM dibangun (butuh verifikasi API Postiz);
// yang dibangun: Library + galeri + biaya. Draf-only tetap berlaku.

import { invoke } from '@tauri-apps/api/core';
import { tr } from './i18n.js';
import { readKeys } from './chat.js';
import { libAddImage } from './v5logic.js';

const IMG_MODEL = 'muse-image-1.0';
const IMG_PRICE_USD = 0.01;
const IMG_USD_RATE = 18148;
const SPEND_LS = 'minime.imageSpend';
const FLOW_LS = 'minime.imageFlow';

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

function saveImgSpend(s: ImgSpend): void {
  try { window.localStorage.setItem(SPEND_LS, JSON.stringify(s)); } catch { /* abaikan */ }
  const fn = (window as unknown as Record<string, unknown>).refreshImgSpend;
  if (typeof fn === 'function') (fn as () => void)();
}

type FlowState = { brief: string; ratio: string; style: string; textfree: boolean; n: number };
const DEFAULTS: FlowState = { brief: '', ratio: '1:1', style: 'product photography', textfree: true, n: 1 };
let state: FlowState = { ...DEFAULTS };

// Rasio -> size "WxH". HANYA 1024x1024 terverifikasi live; rasio lain
// memakai pola param yang sama (size dibaca model sebagai rasio, bukan
// piksel persis, per dokumentasi integrator) — PROVISIONAL sampai diuji.
const RATIO_SIZE: Record<string, string> = {
  '1:1': '1024x1024', '4:5': '1024x1280', '9:16': '1024x1820', '16:9': '1820x1024',
  '3:4': '1024x1365', '3:2': '1536x1024', '2:3': '1024x1536',
};

const STYLES = ['product photography', 'illustration', 'flat design', 'poster design', 'photorealistic'];

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function el(id: string): HTMLElement | null {
  return document.getElementById(id);
}

function sentPrompt(): string {
  let p = state.brief.trim();
  if (state.style) p += ', in ' + state.style + ' style';
  if (state.textfree) p += ', no text, no words, no letters, no watermark';
  return p;
}

function loadState(): void {
  try {
    const raw = window.localStorage.getItem(FLOW_LS);
    const o = raw ? JSON.parse(raw) : null;
    if (o && typeof o === 'object') {
      state = {
        brief: typeof o.brief === 'string' ? o.brief : '',
        ratio: typeof o.ratio === 'string' && RATIO_SIZE[o.ratio] ? o.ratio : '1:1',
        style: typeof o.style === 'string' && STYLES.includes(o.style) ? o.style : 'product photography',
        textfree: o.textfree !== false,
        n: [1, 2, 4].includes(o.n) ? o.n : 1,
      };
    }
  } catch { state = { ...DEFAULTS }; }
}

function saveState(): void {
  try { window.localStorage.setItem(FLOW_LS, JSON.stringify(state)); } catch { /* abaikan */ }
}

function setNote(text: string): void {
  const n = el('img-status');
  if (n) n.textContent = text;
}

function renderPreview(): void {
  const p = el('img-preview');
  if (p) p.textContent = state.brief.trim() ? tr('img.preview') + ': ' + sentPrompt() : '';
}

function renderCost(): void {
  const c = el('img-cost');
  const s = readImgSpend();
  if (c) {
    c.textContent = s.images > 0
      ? tr('img.cost.total', { n: s.images, usd: s.usd.toFixed(2), idr: s.idr.toLocaleString('id-ID') })
      : '';
  }
}

type Variant = { b64: string; url: string; name: string };
let variants: Variant[] = [];
let genBrief = '';

function variantCard(v: Variant, i: number): string {
  return `<div class="img-card"><img src="${v.url}" alt=""><div class="se-note">${esc(v.name)}</div>`
    + `<button class="se-btn2" data-img-save="${i}">${esc(tr('img.save'))}</button></div>`;
}

function renderVariants(): void {
  const g = el('img-variants');
  if (!g) return;
  g.innerHTML = variants.map(variantCard).join('');
  g.querySelectorAll('[data-img-save]').forEach((b) => {
    b.addEventListener('click', () => void saveVariant(Number((b as HTMLElement).dataset.imgSave)));
  });
}

async function renderGallery(): Promise<void> {
  const g = el('img-gallery');
  if (!g) return;
  let added: Array<{ o: string; content?: string; imageFile?: string; kind?: string }> = [];
  try {
    const raw = window.localStorage.getItem('minime.library.added');
    const arr = raw ? JSON.parse(raw) : [];
    if (Array.isArray(arr)) added = arr.filter((x) => x && x.kind === 'image' && x.imageFile);
  } catch { /* abaikan */ }
  if (added.length === 0) {
    g.innerHTML = `<div class="se-note">${esc(tr('img.gallery.empty'))}</div>`;
    return;
  }
  const cards: string[] = [];
  for (const item of added) {
    try {
      const res = await invoke<{ b64: string }>('image_read', { req: { name: item.imageFile } });
      cards.push(`<div class="img-card"><img src="data:image/webp;base64,${res.b64}" alt="">`
        + `<div class="se-note">${esc(item.o)}</div>`
        + `<button class="se-btn2" data-img-brief="${esc(item.content || '')}">${esc(tr('img.loadbrief'))}</button></div>`);
    } catch {
      cards.push(`<div class="img-card"><div class="se-note">${esc(item.o)} — ${esc(tr('img.err.nofile'))}</div></div>`);
    }
  }
  g.innerHTML = cards.join('');
  g.querySelectorAll('[data-img-brief]').forEach((b) => {
    b.addEventListener('click', () => {
      state.brief = (b as HTMLElement).dataset.imgBrief || '';
      saveState();
      syncForm();
      renderPreview();
      setNote(tr('img.loaded'));
    });
  });
}

async function saveVariant(i: number): Promise<void> {
  const v = variants[i];
  if (!v) return;
  try {
    await invoke('image_save', { req: { name: v.name, b64: v.b64 } });
  } catch (e) {
    setNote(tr('img.err.save') + ' ' + (e instanceof Error ? e.message : String(e)));
    return;
  }
  const title = `Gambar: ${genBrief.slice(0, 40)}`;
  libAddImage(title, genBrief, v.name, IMG_PRICE_USD);
  setNote(tr('img.saved'));
  await renderGallery();
}

async function generate(): Promise<void> {
  const brief = state.brief.trim();
  if (!brief) { setNote(tr('img.err.brief')); return; }
  const key = readKeys().meta;
  if (!key) { setNote(tr('img.err.nokey')); return; }
  const btn = el('img-generate') as HTMLButtonElement | null;
  if (btn) btn.disabled = true;
  setNote(tr('img.status.gen', { n: state.n }));
  try {
    const r = await fetch('https://api.meta.ai/v1/images/generations', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: IMG_MODEL,
        prompt: sentPrompt(),
        n: state.n,
        size: RATIO_SIZE[state.ratio],
        response_format: 'b64_json',
        output_format: 'webp',
      }),
    });
    if (!r.ok) {
      const head = (await r.text()).slice(0, 200);
      setNote(tr('img.err.api') + ' HTTP ' + r.status + ' ' + head);
      return;
    }
    const j = await r.json();
    const data = Array.isArray(j.data) ? j.data : [];
    genBrief = brief;
    const ts = Date.now();
    variants = data
      .filter((d: { b64_json?: string }) => typeof d.b64_json === 'string' && d.b64_json.length > 0)
      .map((d: { b64_json: string }, k: number) => ({
        b64: d.b64_json,
        url: 'data:image/webp;base64,' + d.b64_json,
        name: `img-${ts}-${k}.webp`,
      }));
    if (variants.length === 0) { setNote(tr('img.err.api') + ' (respons tanpa gambar)'); return; }
    const usd = variants.length * IMG_PRICE_USD;
    const spend = readImgSpend();
    spend.images += variants.length;
    spend.usd = Math.round((spend.usd + usd) * 100) / 100;
    spend.idr = Math.round(spend.usd * IMG_USD_RATE);
    saveImgSpend(spend);
    renderVariants();
    renderCost();
    setNote(tr('img.status.done', { n: variants.length })
      + ' ' + tr('img.cost', { n: variants.length, usd: usd.toFixed(2), idr: Math.round(usd * IMG_USD_RATE).toLocaleString('id-ID') }));
  } catch (e) {
    setNote(tr('img.err.api') + ' ' + (e instanceof Error ? e.message : String(e)));
  } finally {
    if (btn) btn.disabled = false;
  }
}

function syncForm(): void {
  const brief = el('img-brief') as HTMLTextAreaElement | null;
  if (brief) brief.value = state.brief;
  const ratio = el('img-ratio') as HTMLSelectElement | null;
  if (ratio) ratio.value = state.ratio;
  const style = el('img-style') as HTMLSelectElement | null;
  if (style) style.value = state.style;
  const tf = el('img-textfree') as HTMLInputElement | null;
  if (tf) tf.checked = state.textfree;
  const n = el('img-n') as HTMLSelectElement | null;
  if (n) n.value = String(state.n);
}

function bind<T extends HTMLElement>(id: string, ev: string, fn: (e: T) => void): void {
  const e = el(id);
  if (e) e.addEventListener(ev, () => fn(e as T));
}

export function initImageFlow(): void {
  loadState();
  syncForm();
  renderPreview();
  renderCost();
  void renderGallery();
  bind<HTMLTextAreaElement>('img-brief', 'input', (e) => { state.brief = e.value; saveState(); renderPreview(); });
  bind<HTMLSelectElement>('img-ratio', 'change', (e) => { state.ratio = e.value; saveState(); });
  bind<HTMLSelectElement>('img-style', 'change', (e) => { state.style = e.value; saveState(); renderPreview(); });
  bind<HTMLInputElement>('img-textfree', 'change', (e) => { state.textfree = e.checked; saveState(); renderPreview(); });
  bind<HTMLSelectElement>('img-n', 'change', (e) => { state.n = Number(e.value); saveState(); });
  bind('img-generate', 'click', () => void generate());
  bind('img-load-script', 'click', () => {
    try {
      const raw = window.localStorage.getItem('minime.scriptEditor');
      const o = raw ? JSON.parse(raw) : null;
      const out = o && typeof o.output === 'string' ? o.output : '';
      if (!out.trim()) { setNote(tr('img.note.noscript')); return; }
      state.brief = out;
      saveState();
      syncForm();
      renderPreview();
      setNote(tr('img.loaded'));
    } catch { setNote(tr('img.note.noscript')); }
  });
  // Jembatan recall Library (v5logic.libMedia): muat gambar tersimpan
  // ke panel (preview + brief) — tanpa siklus import.
  (window as unknown as Record<string, unknown>).imgLoadSaved = async (item: { content?: string; imageFile?: string; o: string }) => {
    if (item.content) { state.brief = item.content; saveState(); syncForm(); renderPreview(); }
    const box = el('img-loaded');
    if (box && item.imageFile) {
      try {
        const res = await invoke<{ b64: string }>('image_read', { req: { name: item.imageFile } });
        box.innerHTML = `<img src="data:image/webp;base64,${res.b64}" alt="">`;
        box.style.display = 'block';
      } catch { box.innerHTML = ''; box.style.display = 'none'; }
    }
    setNote(tr('img.loaded'));
  };
}

export function imgRefreshUI(): void {
  syncForm();
  renderPreview();
  renderCost();
  setNote('');
  void renderGallery();
}
