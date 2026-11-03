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
// Lampiran ke postingan terjadwal: lewat antrean native (imageFile
// diteruskan ke perintah publish) — bukan draf Postiz. Yang dibangun:
// Library + galeri + biaya + antrean native.

import { invoke } from '@tauri-apps/api/core';
import { tr } from './i18n.js';
import { recordLiveCost } from './cost.js';
import { readKeys } from './chat.js';
import { libAddImage, libAddScript, libPairCaption } from './v5logic.js';
import { ModelRouter, defaultRouterConfig } from '../../../src/router';
import { vsSetScript } from './voicestudio.js';
import { socSetCaption, socAutoPlannerDrafts } from './social.js';
import { captionTrackTitle, sosmedCaptionPrompt, videoCaptionPrompt } from './caption-tracks.js';
import { RATIO_SIZE, IMG_PRICE_USD, IMG_USD_RATE, metaGenerateImage, googleGenerateImage, GOOGLE_IMG_PRICE_USD, GOOGLE_IMG_ASPECT, mimeFromB64, addImgSpend, readImgSpend, readThumb, thumbCache } from './image-api.js';
import { brandSuffix } from './brand.js';
import { esc } from './esc.js';

const FLOW_LS = 'minime.imageFlow';

type SbPanel = { shot: string; visual: string; action: string; vo: string; transition: string; duration: number };
type FlowState = { brief: string; ratio: string; style: string; textfree: boolean; n: number; bulk: string[] | null; bulkActive: number; output: string; duration: number; scenes: number; slides: number; title: string; subtitle: string; body: string; listicle: string; header: string; footer: string; palette: string; provider: string; panels: SbPanel[] | null; panelsBrief: string | null; mhTpl: boolean };
const DEFAULTS: FlowState = { brief: '', ratio: '1:1', style: 'product photography', textfree: true, n: 1, bulk: null, bulkActive: 0, output: 'poster', duration: 30, scenes: 4, slides: 6, title: '', subtitle: '', body: '', listicle: '', header: '', footer: '', palette: '', provider: 'meta', panels: null, panelsBrief: null, mhTpl: false };
let state: FlowState = { ...DEFAULTS };


// v163: Gaya Visual dipisah dari Output Desain (perintah Patria 1 Nov
// 15:56). 'poster design' keluar dari gaya — Poster kini Output Desain.
// Nilai lama 'poster design' di storage jatuh ke default via guard loadState.
const STYLES = ['photorealistic', 'product photography', 'flat design', 'illustration', '3D model'];

function el(id: string): HTMLElement | null {
  return document.getElementById(id);
}

function sentPrompt(): string {
  let p = state.brief.trim();
  if (state.header.trim()) p += '. Header text: ' + state.header.trim();
  if (state.title.trim()) p += '. Title: ' + state.title.trim();
  if (state.subtitle.trim()) p += '. Subtitle: ' + state.subtitle.trim();
  if (state.body.trim()) p += '. Body: ' + state.body.trim();
  const items = state.listicle.split('\n').map((x) => x.trim()).filter(Boolean);
  if (items.length) p += '. List: ' + items.join('; ');
  if (state.footer.trim()) p += '. Footer text: ' + state.footer.trim();
  if (state.palette.trim()) p += '. Color palette: ' + state.palette.trim();
  if (state.style) p += ', in ' + state.style + ' style';
  if (state.textfree) p += ', no text, no words, no letters, no watermark';
  const b = brandSuffix();
  if (b) p += b;
  return p;
}

function loadState(): void {
  try {
    const raw = window.localStorage.getItem(FLOW_LS);
    const o = raw ? JSON.parse(raw) : null;
    if (o && typeof o === 'object') {
      const bulk = Array.isArray(o.bulk) ? o.bulk.filter((b: unknown) => typeof b === 'string' && b.trim()).slice(0, 30) : [];
      const bulkActive = bulk.length && Number.isInteger(o.bulkActive) && (o.bulkActive as number) >= 0 && (o.bulkActive as number) < bulk.length ? (o.bulkActive as number) : 0;
      state = {
        brief: bulk.length ? bulk[bulkActive] : (typeof o.brief === 'string' ? o.brief : ''),
        ratio: typeof o.ratio === 'string' && RATIO_SIZE[o.ratio] ? o.ratio : '1:1',
        style: typeof o.style === 'string' && STYLES.includes(o.style) ? o.style : 'product photography',
        textfree: o.textfree !== false,
        n: [1, 2, 4].includes(o.n) ? o.n : 1,
        bulk: bulk.length ? bulk : null,
        bulkActive,
        output: ['poster', 'storyboard', 'carousel'].includes(o.output) ? o.output : 'poster',
        duration: Number.isInteger(o.duration) && (o.duration as number) >= 5 && (o.duration as number) <= 60 ? (o.duration as number) : 30,
        scenes: Number.isInteger(o.scenes) && (o.scenes as number) >= 2 && (o.scenes as number) <= 6 ? (o.scenes as number) : 4,
        slides: Number.isInteger(o.slides) && (o.slides as number) >= 6 && (o.slides as number) <= 10 ? (o.slides as number) : 6,
        title: typeof o.title === 'string' ? o.title : '',
        subtitle: typeof o.subtitle === 'string' ? o.subtitle : '',
        body: typeof o.body === 'string' ? o.body : '',
        listicle: typeof o.listicle === 'string' ? o.listicle : '',
        header: typeof o.header === 'string' ? o.header : '',
        footer: typeof o.footer === 'string' ? o.footer : '',
        palette: typeof o.palette === 'string' ? o.palette : '',
        provider: o.provider === 'google' ? 'google' : 'meta',
        panels: Array.isArray(o.panels) ? (o.panels as Array<Record<string, unknown>>).filter((p) => p && typeof p === 'object').map((p) => ({
          shot: typeof p.shot === 'string' ? p.shot : '',
          visual: typeof p.visual === 'string' ? p.visual : '',
          action: typeof p.action === 'string' ? p.action : '',
          vo: typeof p.vo === 'string' ? p.vo : '',
          transition: ['cut', 'fade', 'dissolve', 'wipe'].includes(String(p.transition)) ? String(p.transition) : 'cut',
          duration: Number.isInteger(p.duration) && (p.duration as number) >= 1 ? (p.duration as number) : 1,
        })) : null,
        panelsBrief: typeof o.panelsBrief === 'string' ? o.panelsBrief : null,
        mhTpl: o.mhTpl === true,
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


type Variant = { b64: string; url: string; name: string; label: string; prompt: string; shot: string };
let variants: Variant[] = [];
let genBrief = '';

function variantCard(v: Variant, i: number): string {
  return `<div class="img-card"><img src="${v.url}" alt=""${v.shot ? ` title="${esc(v.shot)}"` : ''}><div class="se-note">${esc(v.name)}${v.label ? ' · ' + esc(v.label) : ''}</div>`
    + `<div class="img-canva-row"><button class="se-btn2" data-img-save="${i}">${esc(tr('img.save'))}</button> `
    + `<button class="se-btn2" data-img-canva="${i}">${esc(tr('img.canva.edit'))}</button> `
    + `<input type="file" accept="image/*" data-img-canvafile="${i}"> `
    + `<button class="se-btn2" data-img-canvaup="${i}">${esc(tr('img.canva.import'))}</button></div></div>`;
}

function renderVariants(): void {
  const g = el('img-variants');
  if (!g) return;
  g.innerHTML = variants.map(variantCard).join('');
  g.querySelectorAll('[data-img-save]').forEach((b) => {
    b.addEventListener('click', () => void saveVariant(Number((b as HTMLElement).dataset.imgSave)));
  });
  g.querySelectorAll('[data-img-canva]').forEach((b) => {
    b.addEventListener('click', () => void canvaEdit(Number((b as HTMLElement).dataset.imgCanva)));
  });
  g.querySelectorAll('[data-img-canvaup]').forEach((b) => {
    b.addEventListener('click', () => void canvaImport(Number((b as HTMLElement).dataset.imgCanvaup)));
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
  // v158: galeri HANYA 10 output terakhir, thumbnail saja. Library
  // tetap arsip lengkap (tidak dipotong); yang dibatasi hanya galeri.
  // LIB_ADDED kronologis (push) sehingga slice(-10) = 10 terbaru.
  added = added.slice(-10);
  } catch { /* abaikan */ }
  if (added.length === 0) {
    g.innerHTML = `<div class="se-note">${esc(tr('img.gallery.empty'))}</div>`;
    return;
  }
  const cards: string[] = [];
  for (const item of added) {
    try {
      const url = item.imageFile ? await readThumb(item.imageFile) : null;
      if (!url) throw new Error('nofile');
      // v158: thumbnail saja — klik thumbnail memuat ke brief
      // (fungsi lama tombol "Muat ke brief" pindah ke klik gambar).
      cards.push(`<button class="img-thumb" data-img-brief="${esc(item.content || '')}" title="${esc(item.o)}"><img src="${url}" alt=""></button>`);
    } catch {
      cards.push(`<div class="img-thumb img-thumb-missing"><div class="se-note">${esc(item.o)} — ${esc(tr('img.err.nofile'))}</div></div>`);
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

// v204: mengembalikan nama file yang tersimpan ('' bila gagal) agar
// approveDraft hanya memasangkan/meneruskan varian yang benar-benar
// tersimpan — draf Planner tidak boleh menunjuk file yang tak ada.
async function saveVariant(i: number): Promise<string> {
  const v = variants[i];
  if (!v) return '';
  try {
    await invoke('image_save', { req: { name: v.name, b64: v.b64 } });
  } catch (e) {
    setNote(tr('img.err.save') + ' ' + (e instanceof Error ? e.message : String(e)));
    return '';
  }
  const title = `Gambar: ${genBrief.slice(0, 40)}`;
  libAddImage(title, genBrief, v.name, IMG_PRICE_USD);
  setNote(tr('img.saved'));
  await renderGallery();
  return v.name;
}

// v163: round-trip Canva per varian, pola batch-flow (handoff browser,
// BUKAN API — Canva tidak membuka Magic Media untuk publik): Edit =
// unduh varian + salin prompt + buka canva.com di browser luar; Impor =
// file hasil Canva dibaca dan ditambahkan sebagai varian baru (label
// Canva) yang kemudian bisa disimpan ke Library seperti varian biasa.
async function canvaEdit(i: number): Promise<void> {
  const v = variants[i];
  if (!v) return;
  try { await navigator.clipboard.writeText(v.prompt); } catch { /* clipboard boleh gagal */ }
  try {
    const a = document.createElement('a');
    a.href = v.url; a.download = v.name;
    document.body.appendChild(a); a.click(); a.remove();
  } catch { /* abaikan */ }
  try { await invoke('open_external_url', { url: 'https://www.canva.com/' }); } catch { /* abaikan: rig/jsdom tanpa Tauri */ }
  setNote(tr('img.canva.opened'));
}

function readFileB64(f: File): Promise<{ b64: string; url: string }> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const res = (r.result as string) || '';
      resolve({ b64: res.split(',')[1] || '', url: res });
    };
    r.onerror = () => reject(new Error('gagal membaca file'));
    r.readAsDataURL(f);
  });
}

async function canvaImport(i: number): Promise<void> {
  const input = document.querySelector(`[data-img-canvafile="${i}"]`) as HTMLInputElement | null;
  const files = input?.files;
  if (!files || !files.length) { setNote(tr('img.canva.pick')); return; }
  const ts = Date.now();
  let added = 0;
  for (const f of Array.from(files)) {
    try {
      const { b64, url } = await readFileB64(f);
      if (!b64) continue;
      variants.push({ b64, url, name: `img-canva-${ts}-${Math.floor(Math.random() * 1000)}.webp`, label: 'Canva', prompt: sentPrompt(), shot: '' });
      added++;
    } catch { /* lanjut ke file berikutnya */ }
  }
  if (added) { renderVariants(); setNote(tr('img.canva.imported')); }
}

// v164: storyboard = SEQUENCE, bukan 4 tema (perintah Patria 1 Nov
// 16:19 + bukti live: v163 mengirim SELURUH brief + penanda scene ke
// 4 panggilan independen — tiap panggilan menafsir ulang semuanya,
// dan copy poster di dalam brief menarik scene 2–4 jadi desain poster).
// Prinsip storyboard yang dipakai: satu dunia, shot berurutan, tiap
// panel HANYA satu momen. Maka prompt per frame = bible bersama
// (video + gaya yang sama, urutan cerita) + deskripsi shot itu saja —
// brief utuh TIDAK PERNAH dikirim per frame. Shot list didapat dari
// parse blok bernomor di brief bila jumlahnya pas; bila tidak, model
// membagi brief jadi shot list; bila itu pun gagal, fallback bible +
// penanda keyframe (tetap tanpa brief utuh).
let lastShots: string[] = [];

function extractNumbered(text: string): string[] {
  const lines = text.split('\n');
  const blocks: string[] = [];
  let cur: string[] = [];
  const startRe = /^\s*(?:\d{1,2}\s*[.)]\s+|scene\s+\d+\s*[:.)]?\s+|shot\s+\d+\s*[:.)]?\s+)/i;
  for (const line of lines) {
    if (startRe.test(line)) { if (cur.length) blocks.push(cur.join(' ').trim()); cur = [line.trim()]; }
    else if (cur.length) { cur.push(line.trim()); }
  }
  if (cur.length) blocks.push(cur.join(' ').trim());
  return blocks
    .map((b) => b.replace(/^\s*(?:\d{1,2}\s*[.)]\s+|scene\s+\d+\s*[:.)]?\s+|shot\s+\d+\s*[:.)]?\s+)/i, '').trim())
    .filter(Boolean);
}

function parseStoryboardShots(brief: string, count: number): string[] | null {
  const shots = extractNumbered(brief);
  return shots.length === count ? shots : null;
}

async function modelShotList(brief: string, count: number): Promise<string[] | null> {
  const text = await modelText(
    `Bagi brief video berikut menjadi tepat ${count} deskripsi shot berurutan untuk storyboard. Tiap shot: satu kalimat visual — hanya apa yang terlihat di frame (subjek, aksi, suasana, kamera). Abaikan copy poster, headline, dan teks promosi. Balas HANYA dengan daftar bernomor, satu shot per baris, tanpa penjelasan.\n\nBrief:\n${brief}`,
    'trace-img-shots-' + Date.now());
  const shots = extractNumbered(text);
  return shots.length === count ? shots : null;
}

// v165: STYLE LOCK (keluhan Patria 1 Nov 16:33 + lembar referensi
// storyboard: satu medium/palet di semua panel, shot boleh berganti,
// gaya tidak boleh). Bukti live v164: shot sudah berurutan, tapi gaya
// masih beda — scene 2 jadi kolase ber-header ("montase"), scene 4
// jadi poster ilustrasi ("end-card"), padahal gaya dipilih product
// photography. v164 hanya bilang "same visual style" secara generik
// dan tidak menangani dua jebakan itu. Lock ini diulang verbatim di
// tiap frame: gaya terpilih ditegaskan, kolase/poster/header/border
// dilarang eksplisit, montase dipaksa satu momen, end-card dipaksa
// satu frame gaya sama (bukan desain poster).
// v174: struktur storyboard 7 field per panel (dokumen pola
// struktur-prompt-storyboard.md): nomor/label, shot, visual, aksi,
// dialog/VO, transisi, durasi per panel — menggantikan shot teks-bebas.
// Satu panel = satu scene = satu shot (model app saat ini); label panel
// "Scene N". Bible + STYLE LOCK v165 dipakai verbatim, hanya sumber
// shot-nya kini panel terstruktur, bukan string bebas.
function sbBibleLock(i: number, count: number): string {
  const bible = `Storyboard frame ${i + 1} of ${count} for one ${state.duration}-second video titled "${state.title.trim() || 'Video'}". All frames belong to the same video and share the same visual style, in story order.`;
  const sty = state.style || 'product photography';
  const lock = ` STYLE LOCK: every frame uses exactly the same ${sty} treatment — same medium, same color palette, same lighting, same lens feel. One single shot per frame: never a collage, never multiple panels in one image, never a poster layout, never a title header bar, never a decorative border. If a shot describes a montage, render ONE representative moment from it as a single frame. If a shot describes an end-card, render it as one frame of that closing moment in the same style, not as a designed poster.`;
  return bible + lock;
}

function sbPanelPrompt(i: number, count: number, p: SbPanel): string {
  const parts: string[] = [];
  if (p.shot.trim()) parts.push(p.shot.trim());
  if (p.visual.trim()) parts.push(p.visual.trim());
  else parts.push(`Keyframe ${i + 1} of the sequence.`);
  if (p.action.trim()) parts.push(`Action: ${p.action.trim()}`);
  let pr = sbBibleLock(i, count) + ' ' + parts.join(' ');
  if (state.style) pr += `, in ${state.style} style`;
  if (state.textfree) pr += ', no text, no words, no letters, no watermark';
  const b = brandSuffix();
  if (b) pr += b;
  return pr;
}

function escAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Bagi durasi total ke panel secara merata (sisa ke panel terakhir).
function sbEvenDurations(count: number): number[] {
  const base = Math.floor(state.duration / count);
  const rem = state.duration - base * count;
  return Array.from({ length: count }, (_, i) => base + (i === count - 1 ? rem : 0));
}

// Susun panel dari brief: shot list (parse bernomor, lalu model) jadi
// visual tiap panel; shot/aksi/VO/transisi/durasi diisi default
// (transisi cut, durasi merata) untuk disunting user sebelum Generate.
async function buildSbPanels(): Promise<void> {
  const brief = state.brief.trim();
  if (!brief) { setNote(tr('img.err.brief')); return; }
  const count = state.scenes;
  let shots = parseStoryboardShots(brief, count);
  if (!shots) {
    try { shots = await modelShotList(brief, count); } catch { shots = null; }
  }
  const durs = sbEvenDurations(count);
  state.panels = Array.from({ length: count }, (_, i) => ({
    shot: '', visual: shots ? shots[i] : '', action: '', vo: '', transition: 'cut', duration: durs[i],
  }));
  state.panelsBrief = brief;
  saveState();
  renderSbPanels();
  setNote(tr('img.sb.built', { n: count }));
}

function renderSbTotal(): void {
  const t = el('img-sb-total');
  if (!t) return;
  if (!state.panels) { t.textContent = ''; return; }
  const sum = state.panels.reduce((a, p) => a + (Number.isFinite(p.duration) ? p.duration : 0), 0);
  t.textContent = tr('img.sb.total', { sum, total: state.duration });
}

function renderSbPanels(): void {
  const box = el('img-sb-panels');
  if (!box) return;
  if (state.output !== 'storyboard' || !state.panels) {
    box.innerHTML = state.output === 'storyboard' ? `<p class="se-note">${tr('img.sb.empty')}</p>` : '';
    renderSbTotal();
    return;
  }
  const trans = ['cut', 'fade', 'dissolve', 'wipe'];
  box.innerHTML = state.panels.map((p, i) => `
    <div class="se-group" data-sb-panel="${i}">
      <b>${tr('img.sb.scene', { n: i + 1 })}</b>
      <label>${tr('img.sb.shot')} <input class="se-field" type="text" data-sb-field="shot" value="${escAttr(p.shot)}" placeholder="${escAttr(tr('img.sb.shot.ph'))}"></label>
      <label>${tr('img.sb.visual')} <textarea class="se-field" rows="2" data-sb-field="visual">${escAttr(p.visual)}</textarea></label>
      <label>${tr('img.sb.action')} <input class="se-field" type="text" data-sb-field="action" value="${escAttr(p.action)}"></label>
      <label>${tr('img.sb.vo')} <input class="se-field" type="text" data-sb-field="vo" value="${escAttr(p.vo)}"></label>
      <label>${tr('img.sb.transition')} <select class="se-field" data-sb-field="transition">${trans.map((t) => `<option value="${t}"${p.transition === t ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
      <label>${tr('img.sb.duration')} <input class="se-field" type="number" min="1" data-sb-field="duration" value="${p.duration}"></label>
    </div>`).join('');
  renderSbTotal();
}

// v173: system lock pola carousel @marketingharry (vonis Patria 3 Nov 08:18:
// pola saja, bukan salinan mentah 11 slide — peran slide mengikuti jumlah
// slide app 6-10; rasio pola 4:5; text overlay WAJIB sehingga klausa
// tanpa-teks dibuang saat preset aktif).
const MH_LOCK = 'same extra-bold sans typography, same bright red accent, same black/white base, same recurring motif, portrait 4:5, editorial social media style, pure black cover background on the cover slide, clean white background on content and closing slides, red keywords, white words on red badges, grey handwritten annotations with lines and dots, recurring retro CRT TV and close-up eye, spiral notebook and phone mockup motifs';
function mhSlideSuffix(i: number, count: number): string {
  if (!state.mhTpl) return '';
  const role = i === 0 ? 'cover slide: bold hook statement with metaphor visual'
    : i === count - 1 ? 'closing slide: restate thesis with SHARE button'
    : 'content slide';
  return ', ' + MH_LOCK + ', ' + role;
}

async function generate(): Promise<void> {
  const brief = state.brief.trim();
  if (!brief) { setNote(tr('img.err.brief')); return; }
  const keys = readKeys();
  const key = state.provider === 'google' ? keys.gemini : keys.meta;
  if (!key) { setNote(tr('img.err.nokey')); return; }
  const btn = el('img-generate') as HTMLButtonElement | null;
  if (btn) btn.disabled = true;
  // v163: jumlah gambar mengikuti Output Desain — Poster pakai n,
  // Story Board pakai scenes (satu gambar per keyframe), Carousel
  // pakai slides. Tiap gambar diminta terpisah (n=1) agar prompt
  // scene/slide-nya berbeda — bukan n varian dari satu prompt.
  const count = state.output === 'poster' ? state.n : state.output === 'storyboard' ? state.scenes : state.slides;
  const baseRaw = sentPrompt();
  // v173: preset pola marketingharry — paksa rasio 4:5 + buang klausa
  // tanpa-teks (pola WAJIB text overlay) hanya untuk carousel preset.
  const base = state.output === 'carousel' && state.mhTpl
    ? baseRaw.replace(', no text, no words, no letters, no watermark', '')
    : baseRaw;
  const ratio = state.output === 'carousel' && state.mhTpl ? '4:5' : state.ratio;
  setNote(tr('img.status.gen', { n: count }));
  try {
    genBrief = brief;
    const ts = Date.now();
    // v164: storyboard menyiapkan shot list dulu (parse, lalu model).
    // v174: shot list itu langsung menjadi panel terstruktur; panel
    // yang sudah disusun untuk brief yang sama dipakai ulang (suntingan
    // user tidak hilang), brief baru atau jumlah scene berubah selalu
    // menyusun ulang — satu kali hitung shot list, tanpa panggilan
    // model ganda.
    let panels: SbPanel[] | null = null;
    if (state.output === 'storyboard') {
      if (state.panels && state.panels.length === count && state.panelsBrief === brief) {
        panels = state.panels;
      } else {
        let shots = parseStoryboardShots(brief, count);
        if (!shots) {
          try { shots = await modelShotList(brief, count); } catch { shots = null; }
        }
        const durs = sbEvenDurations(count);
        panels = Array.from({ length: count }, (_, i) => ({
          shot: '', visual: shots ? shots[i] : '', action: '', vo: '', transition: 'cut', duration: durs[i],
        }));
        state.panels = panels;
        state.panelsBrief = brief;
        saveState();
        renderSbPanels();
      }
      lastShots = panels.map((p) => p.visual).filter(Boolean);
    } else {
      lastShots = [];
    }
    const next: Variant[] = [];
    for (let i = 0; i < count; i++) {
      const prompt = state.output === 'poster' ? base
        : state.output === 'storyboard' ? sbPanelPrompt(i, count, (panels as SbPanel[])[i])
        : base + mhSlideSuffix(i, count) + `, slide ${i + 1} of ${count}`;
      const label = state.output === 'poster' ? 'Poster'
        : state.output === 'storyboard' ? `Scene ${i + 1}/${count}`
        : `Slide ${i + 1}/${count}`;
      const shot = state.output === 'storyboard' ? ((panels as SbPanel[])[i]?.visual || '') : '';
      const imgs = state.provider === 'google'
        ? await googleGenerateImage(key, prompt, GOOGLE_IMG_ASPECT[ratio] || '1:1')
        : (await metaGenerateImage(key, prompt, 1, RATIO_SIZE[ratio])).map((b64) => ({ b64, mime: 'image/webp' }));
      for (const it of imgs) {
        const ext = it.mime === 'image/png' ? 'png' : it.mime === 'image/jpeg' ? 'jpg' : 'webp';
        next.push({ b64: it.b64, url: 'data:' + it.mime + ';base64,' + it.b64, name: `img-${ts}-${next.length}.${ext}`, label, prompt, shot });
      }
    }
    variants = next;
    if (variants.length === 0) { setNote(tr('img.err.api') + ' (respons tanpa gambar)'); return; }
    const pricePer = state.provider === 'google' ? GOOGLE_IMG_PRICE_USD : IMG_PRICE_USD;
    const usd = variants.length * pricePer;
    addImgSpend(variants.length, pricePer);
    renderVariants();
    setNote(tr('img.status.done', { n: variants.length }));
  } catch (e) {
    setNote(tr('img.err.api') + ' ' + (e instanceof Error ? e.message : String(e)));
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function modelText(prompt: string, trace: string): Promise<string> {
  const keys = readKeys();
  const cfg = defaultRouterConfig();
  cfg.geminiApiKey = keys.gemini; cfg.metaApiKey = keys.meta;
  const router = new ModelRouter(cfg);
  const r = await router.callWithFallback(prompt, trace);
  recordLiveCost(r);
  return r.text;
}

// v163: Setujui draft — gambar selalu tersimpan dulu (dedup aman
// dipanggil ulang), lalu naskah turunan dibuat per output: Poster /
// Carousel = caption -> Library; Story Board = rencana video (teks
// rakitan, tanpa model) -> Video Editor, naskah VO (model) -> Voice
// Editor + Library, caption (model) -> komposer Planner + Library.
// Gagal model tidak menggagalkan approval: gambar tetap tersimpan,
// placeholder yang gagal dibiarkan kosong + dicatat di note, dan
// Setujui ulang aman (caption/VO dedup konten persis di Library).
async function approveDraft(): Promise<void> {
  if (!variants.length) { setNote(tr('img.approve.nodraft')); return; }
  const btn = el('img-approve') as HTMLButtonElement | null;
  if (btn) btn.disabled = true;
  try {
    const savedNames: string[] = [];
    for (let i = 0; i < variants.length; i++) { const n = await saveVariant(i); if (n) savedNames.push(n); }
    const title = state.title.trim() || genBrief.slice(0, 40) || 'Draft';
    const parts: string[] = [];
    if (state.output === 'storyboard') {
      // v174: rencana dari 7 field panel (bukan lagi shot teks-bebas);
      // VO gabungan dari Dialog/VO tiap panel mengalir ke Voice Editor
      // tanpa panggilan model bila ada satu saja VO terisi; bila semua
      // VO kosong, jalur model lama dipakai (kompatibilitas v163).
      const panels = state.panels && state.panels.length === state.scenes ? state.panels : null;
      const sceneLines = panels
        ? panels.map((p, i) => {
            const bits = [`Scene ${i + 1}: ${p.shot.trim() ? p.shot.trim() + ' — ' : ''}${p.visual.trim() || `Keyframe ${i + 1}`}`];
            if (p.action.trim()) bits.push(`Aksi: ${p.action.trim()}`);
            if (p.vo.trim()) bits.push(`Dialog/VO: ${p.vo.trim()}`);
            bits.push(`Transisi: ${p.transition} · Durasi: ${p.duration} detik`);
            return bits.join(' | ');
          }).join('\n')
        : lastShots.length
          ? lastShots.map((sh, i) => `Scene ${i + 1}: ${sh}`).join('\n')
          : Array.from({ length: state.scenes }, (_, i) => `Scene ${i + 1}: keyframe ${i + 1} dari ${state.scenes}`).join('\n');
      const plan = [
        `Rencana perakitan video — ${title}`,
        `Durasi: ${state.duration} detik · ${state.scenes} scene keyframe · Rasio: ${state.ratio}`,
        state.subtitle.trim() ? `Subjudul: ${state.subtitle.trim()}` : '',
        `Brief: ${state.brief.trim()}`,
        state.listicle.trim() ? `Daftar:\n${state.listicle.trim()}` : '',
        sceneLines,
      ].filter(Boolean).join('\n');
      const w = window as unknown as Record<string, unknown>;
      if (typeof w.veSetPlan === 'function') (w.veSetPlan as (t: string) => void)(plan);
      parts.push(tr('img.approve.video'));
      const panelVo = panels
        ? panels.map((p, i) => ({ i, p })).filter(({ p }) => p.vo.trim()).map(({ i, p }) => `Scene ${i + 1} (${p.duration} detik): ${p.vo.trim()}`)
        : [];
      if (panelVo.length) {
        const vo = [`Naskah VO — ${title}`, ...panelVo].join('\n');
        vsSetScript(vo);
        libAddScript(`Naskah VO: ${title}`, vo);
        parts.push(tr('img.approve.voice'));
      } else try {
        const vo = await modelText(
          `Buatkan naskah voice over Bahasa Indonesia untuk video ${state.duration} detik dengan ${state.scenes} scene keyframe. Judul: ${title}. Brief: ${state.brief.trim()}. Untuk tiap scene, tulis timing dan kalimat VO-nya. Hanya naskah, tanpa penjelasan tambahan.`,
          'trace-img-vo-' + Date.now());
        vsSetScript(vo);
        libAddScript(`Naskah VO: ${title}`, vo);
        parts.push(tr('img.approve.voice'));
      } catch { parts.push(tr('img.approve.vofail')); }
      try {
        const cap = await modelText(
          videoCaptionPrompt(title, state.brief.trim(), state.duration, state.scenes),
          'trace-img-cap-' + Date.now());
        socSetCaption(cap);
        libAddScript(captionTrackTitle('video', title), cap);
        parts.push(tr('img.approve.caption'));
      } catch { parts.push(tr('img.approve.captionfail')); }
    } else {
      const kindLabel = state.output === 'carousel' ? `carousel ${state.slides} slide` : 'poster';
      try {
        const cap = await modelText(
          sosmedCaptionPrompt(kindLabel, title, state.subtitle.trim(), state.listicle.trim(), state.brief.trim()),
          'trace-img-cap-' + Date.now());
        socSetCaption(cap);
        libAddScript(captionTrackTitle('sosmed', title), cap);
        parts.push(tr('img.approve.caption'));
        // v204 (Skenario 1 Tahap 4+5): pasangkan caption ke varian
        // poster/carousel yang tersimpan; draf Planner otomatis
        // (IG + Threads, tanpa tanggal) hanya untuk poster —
        // storyboard tidak ikut (gambarnya keyframe video, bukan
        // postingan sosmed; caption videonya tetap ke slot komposer).
        savedNames.forEach((n) => libPairCaption(n, cap));
        if (state.output === 'poster' && savedNames.length) {
          const pids = socAutoPlannerDrafts(savedNames[0], cap);
          parts.push(tr(pids.length ? 'img.approve.planner' : 'img.approve.plannerfail'));
        }
      } catch { parts.push(tr('img.approve.captionfail')); }
    }
    setNote(tr('img.approve.done') + ' ' + parts.join(' '));
    await renderGallery();
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
  const output = el('img-output') as HTMLSelectElement | null;
  if (output) output.value = state.output;
  const duration = el('img-duration') as HTMLInputElement | null;
  if (duration) duration.value = String(state.duration);
  const scenes = el('img-scenes') as HTMLSelectElement | null;
  if (scenes) scenes.value = String(state.scenes);
  const slides = el('img-slides') as HTMLSelectElement | null;
  if (slides) slides.value = String(state.slides);
  const tpl = el('img-tpl-mh') as HTMLInputElement | null;
  if (tpl) tpl.checked = state.mhTpl;
  const title = el('img-title') as HTMLInputElement | null;
  if (title) title.value = state.title;
  const subtitle = el('img-subtitle') as HTMLInputElement | null;
  if (subtitle) subtitle.value = state.subtitle;
  const body = el('img-body') as HTMLTextAreaElement | null;
  if (body) body.value = state.body;
  const listicle = el('img-listicle') as HTMLTextAreaElement | null;
  if (listicle) listicle.value = state.listicle;
  const header = el('img-header') as HTMLInputElement | null;
  if (header) header.value = state.header;
  const footer = el('img-footer') as HTMLTextAreaElement | null;
  if (footer) footer.value = state.footer;
  const palette = el('img-palette') as HTMLInputElement | null;
  if (palette) palette.value = state.palette;
  const provider = el('img-provider') as HTMLSelectElement | null;
  if (provider) provider.value = state.provider;
  renderImgOutput();
  renderSbPanels();
}

// v163: blok kondisional per Output Desain — Poster: rasio + varian;
// Story Board: durasi + scene + rasio; Carousel: jumlah slide saja
// (rasio ikut nilai tersimpan, kontrolnya disembunyikan).
function renderImgOutput(): void {
  const vis = (id: string, show: boolean) => { const e = el(id); if (e) e.style.display = show ? '' : 'none'; };
  vis('img-ratio-wrap', state.output !== 'carousel');
  vis('img-n-wrap', state.output === 'poster');
  vis('img-duration-wrap', state.output === 'storyboard');
  vis('img-scenes-wrap', state.output === 'storyboard');
  vis('img-sb-wrap', state.output === 'storyboard');
  vis('img-slides-wrap', state.output === 'carousel');
  vis('img-tpl-wrap', state.output === 'carousel');
}

function bind<T extends HTMLElement>(id: string, ev: string, fn: (e: T) => void): void {
  const e = el(id);
  if (e) e.addEventListener(ev, () => fn(e as T));
}

/** Strip tab bulk (v140, alur brief Sosmed): satu tab per image/carousel
 *  hasil bulk (maks 30). Tiap tab menyimpan brief-nya sendiri; berpindah
 *  tab menyimpan suntingan tab lama dulu, jadi tiap image bisa disunting
 *  bebas sebelum di-generate. Generate memakai brief tab aktif (state.brief). */
function renderBulkTabs(): void {
  const box = el('img-bulk-tabs');
  if (!box) return;
  const bulk = state.bulk;
  if (!bulk || !bulk.length) { box.innerHTML = ''; return; }
  box.innerHTML = bulk.map((_, i) => `<button class="img-tab${i === state.bulkActive ? ' active' : ''}" data-idx="${i}">${i + 1}</button>`).join('') + `<button class="img-tab-x" title="Tutup bulk">\u2715</button>`;
  box.querySelectorAll('.img-tab').forEach((b) => {
    b.addEventListener('click', () => {
      const idx = Number((b as HTMLElement).dataset.idx);
      if (!Number.isInteger(idx) || idx === state.bulkActive || !state.bulk) return;
      state.bulk[state.bulkActive] = state.brief;
      state.bulkActive = idx;
      state.brief = state.bulk[idx];
      saveState(); syncForm(); renderPreview(); renderBulkTabs();
    });
  });
  const x = box.querySelector('.img-tab-x');
  if (x) x.addEventListener('click', () => { state.bulk = null; state.bulkActive = 0; saveState(); renderBulkTabs(); });
}

/** Isi tab bulk dari luar (dipakai alur brief Sosmed bulk, v140). */
export function imgSetBulk(briefs: string[]): void {
  const list = briefs.filter((b) => typeof b === 'string' && b.trim()).slice(0, 30);
  if (!list.length) return;
  state.bulk = list;
  state.bulkActive = 0;
  state.brief = list[0];
  saveState(); syncForm(); renderPreview(); renderBulkTabs();
}

/** Set brief Image dari luar (dipakai seUse Script Editor — audit v66
 *  M1 overlap: tombol 'Gunakan' harus benar-benar memakai naskah,
 *  bukan hanya pindah tab dan menunggu klik 'Muat Naskah' kedua). */
export function imgSetBrief(text: string): void {
  state.brief = text;
  state.bulk = null;
  state.bulkActive = 0;
  state.panels = null;
  state.panelsBrief = null;
  saveState();
  syncForm();
  renderPreview();
  renderBulkTabs();
}

// v203 (Skenario 1 Tahap 2): handoff terstruktur dari IMAGE-PLAN —
// brief utuh tetap disimpan, field-field terurai mengisi editor.
// Brief baru = pekerjaan baru: panel storyboard dibersihkan (penjaga v174).
export function imgSetStructured(f: { brief: string; title: string; subtitle: string; body: string; listicle: string; header: string; footer: string; ratio: string; output: string }): void {
  state.brief = f.brief;
  state.title = f.title;
  state.subtitle = f.subtitle;
  state.body = f.body;
  state.listicle = f.listicle;
  state.header = f.header;
  state.footer = f.footer;
  if (RATIO_SIZE[f.ratio]) state.ratio = f.ratio;
  state.output = f.output;
  state.bulk = null;
  state.bulkActive = 0;
  state.panels = null;
  state.panelsBrief = null;
  saveState();
  syncForm();
  renderPreview();
  renderBulkTabs();
}

export function initImageFlow(): void {
  loadState();
  syncForm();
  renderPreview();
  renderBulkTabs();
  void renderGallery();
  bind<HTMLTextAreaElement>('img-brief', 'input', (e) => { state.brief = e.value; if (state.bulk) state.bulk[state.bulkActive] = e.value; saveState(); renderPreview(); });
  bind<HTMLSelectElement>('img-ratio', 'change', (e) => { state.ratio = e.value; saveState(); });
  bind<HTMLSelectElement>('img-style', 'change', (e) => { state.style = e.value; saveState(); renderPreview(); });
  bind<HTMLInputElement>('img-textfree', 'change', (e) => { state.textfree = e.checked; saveState(); renderPreview(); });
  bind<HTMLSelectElement>('img-n', 'change', (e) => { state.n = Number(e.value); saveState(); });
  bind<HTMLSelectElement>('img-output', 'change', (e) => { state.output = e.value; saveState(); renderImgOutput(); renderPreview(); });
  bind<HTMLInputElement>('img-duration', 'change', (e) => { const v = Math.round(Number(e.value)); state.duration = Number.isFinite(v) ? Math.min(60, Math.max(5, v)) : 30; saveState(); syncForm(); });
  bind<HTMLSelectElement>('img-scenes', 'change', (e) => { state.scenes = Number(e.value); state.panels = null; state.panelsBrief = null; saveState(); renderSbPanels(); });
  bind('img-sb-build', 'click', () => void buildSbPanels());
  // v174: delegasi input panel — satu listener di container (bukan
  // bind per baris) agar tetap hidup melewati render ulang panel.
  // Re-render penuh di sini akan menghilangkan fokus ketik, jadi
  // handler hanya menyimpan + memperbarui baris total durasi.
  const sbBox = el('img-sb-panels');
  if (sbBox) sbBox.addEventListener('input', (ev) => {
    const t = ev.target as HTMLElement | null;
    const row = t ? t.closest('[data-sb-panel]') : null;
    const field = t ? t.getAttribute('data-sb-field') : null;
    if (!row || !field || !state.panels) return;
    const idx = Number(row.getAttribute('data-sb-panel'));
    const p = state.panels[idx];
    if (!p) return;
    if (field === 'duration') {
      const v = Math.round(Number((t as HTMLInputElement).value));
      p.duration = Number.isFinite(v) ? Math.max(1, v) : 1;
    } else if (field === 'shot' || field === 'visual' || field === 'action' || field === 'vo' || field === 'transition') {
      p[field] = (t as HTMLInputElement).value;
    }
    saveState();
    renderSbTotal();
  });
  bind<HTMLSelectElement>('img-slides', 'change', (e) => { state.slides = Number(e.value); saveState(); });
  bind<HTMLInputElement>('img-tpl-mh', 'change', (e) => { state.mhTpl = e.checked; if (state.mhTpl) { state.textfree = false; const tf = el('img-textfree') as HTMLInputElement | null; if (tf) tf.checked = false; } saveState(); });
  bind<HTMLInputElement>('img-title', 'input', (e) => { state.title = e.value; saveState(); renderPreview(); });
  bind<HTMLInputElement>('img-subtitle', 'input', (e) => { state.subtitle = e.value; saveState(); renderPreview(); });
  bind<HTMLTextAreaElement>('img-body', 'input', (e) => { state.body = e.value; saveState(); renderPreview(); });
  bind<HTMLTextAreaElement>('img-listicle', 'input', (e) => { state.listicle = e.value; saveState(); renderPreview(); });
  bind<HTMLInputElement>('img-header', 'input', (e) => { state.header = e.value; saveState(); renderPreview(); });
  bind<HTMLTextAreaElement>('img-footer', 'input', (e) => { state.footer = e.value; saveState(); renderPreview(); });
  bind<HTMLInputElement>('img-palette', 'input', (e) => { state.palette = e.value; saveState(); renderPreview(); });
  bind('img-approve', 'click', () => void approveDraft());
  bind('img-provider', 'change', () => { const p = el('img-provider') as HTMLSelectElement | null; state.provider = p && p.value === 'google' ? 'google' : 'meta'; saveState(); });
  bind('img-generate', 'click', () => void generate());
  // v146: Bersihkan — hapus brief (+ tab bulk), pertahankan rasio/gaya/textfree/n.
  bind('img-clear', 'click', () => { state.brief = ''; state.bulk = null; state.bulkActive = 0; state.panels = null; state.panelsBrief = null; saveState(); syncForm(); renderPreview(); renderBulkTabs(); });
  bind('img-load-script', 'click', () => {
    try {
      const raw = window.localStorage.getItem('minime.scriptEditor');
      const o = raw ? JSON.parse(raw) : null;
      const out = o && typeof o.output === 'string' ? o.output : '';
      if (!out.trim()) { setNote(tr('img.note.noscript')); return; }
      state.brief = out;
      state.panels = null;
      state.panelsBrief = null;
      saveState();
      syncForm();
      renderPreview();
      setNote(tr('img.loaded'));
    } catch { setNote(tr('img.note.noscript')); }
  });
  // Jembatan recall Library (v5logic.libMedia): muat gambar tersimpan
  // ke panel (preview + brief) — tanpa siklus import.
  // Jembatan untuk Hapus Library: hapus file di disk (best-effort),
  // buang thumbnail dari cache bersama, dan render ulang galeri
  // (galeri membaca langsung dari minime.library.added).
  (window as unknown as Record<string, unknown>).imgDeleteFile = async (name: string) => {
    try { await invoke('image_delete', { req: { name } }); } catch { /* abaikan: file mungkin sudah hilang */ }
  };
  (window as unknown as Record<string, unknown>).imgDropThumb = (file: string) => { thumbCache.delete(file); };
  (window as unknown as Record<string, unknown>).imgRefreshUI = imgRefreshUI;
  (window as unknown as Record<string, unknown>).imgSetBrief = imgSetBrief;
  (window as unknown as Record<string, unknown>).imgSetStructured = imgSetStructured;
  (window as unknown as Record<string, unknown>).imgSetBulk = imgSetBulk;
  (window as unknown as Record<string, unknown>).imgLoadSaved = async (item: { content?: string; imageFile?: string; o: string }) => {
    if (item.content) { state.brief = item.content; saveState(); syncForm(); renderPreview(); }
    const box = el('img-loaded');
    if (box && item.imageFile) {
      try {
        const res = await invoke<{ b64: string }>('image_read', { req: { name: item.imageFile } });
        box.innerHTML = `<img src="data:${mimeFromB64(res.b64)};base64,${res.b64}" alt="">`;
        box.style.display = 'block';
      } catch { box.innerHTML = ''; box.style.display = 'none'; }
    }
    setNote(tr('img.loaded'));
  };
}

export function imgRefreshUI(): void {
  syncForm();
  renderPreview();
  setNote('');
  void renderGallery();
}
