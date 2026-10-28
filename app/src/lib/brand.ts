// Brand Identity — tab Brand di Media Studio.
//
// Penyimpanan: localStorage 'minime.brand' (JSON) + file gambar di
// ~/minime-images/ lewat image_save/image_read/image_delete (Rust,
// std-only). Brand BUKAN baris Library: aset brand dipakai ulang di
// semua generate, bukan konten sekali pakai.
//
// Binding ke generator (v1, JUJUR): prompt-level saja. Endpoint
// generations Meta hanya menerima teks — logo & elemen visual yang
// diunggah TERSIMPAN untuk dipakai di Canva/manual dan untuk binding
// gambar-referensi di masa depan (endpoint edits, encoding-nya masih
// perlu probe). Yang masuk ke prompt: nama, warna (hex), font (nama),
// teks header/footer, label elemen visual.
//
// Varian logo (perintah Patria 28 Okt 19:45–19:46): normal, negatif
// (putih), positif (hitam), logotype, wordmark, legal, commercial.

import { invoke } from '@tauri-apps/api/core';
import { tr } from './i18n.js';
import { esc } from './esc.js';
import { readThumb } from './image-api.js';

export const BRAND_LS = 'minime.brand';

export const LOGO_VARIANTS = [
  'normal', 'negative', 'positive', 'logotype', 'wordmark', 'legal', 'commercial',
] as const;
export type LogoVariant = (typeof LOGO_VARIANTS)[number];

export type BrandColor = { hex: string; name: string };
export type BrandFont = { name: string; role: string };
export type BrandVisual = { file: string; label: string };

export type Brand = {
  name: string;
  useBrand: boolean;
  logos: Record<LogoVariant, string | null>;
  visuals: BrandVisual[];
  fonts: BrandFont[];
  colors: BrandColor[];
  headerText: string;
  headerFile: string | null;
  footerText: string;
  footerFile: string | null;
};

function emptyBrand(): Brand {
  const logos = {} as Record<LogoVariant, string | null>;
  for (const v of LOGO_VARIANTS) logos[v] = null;
  return {
    name: '', useBrand: false, logos,
    visuals: [], fonts: [], colors: [],
    headerText: '', headerFile: null, footerText: '', footerFile: null,
  };
}

export function readBrand(): Brand {
  try {
    const raw = window.localStorage.getItem(BRAND_LS);
    const o = raw ? JSON.parse(raw) : null;
    if (o && typeof o === 'object') {
      const b = emptyBrand();
      if (typeof o.name === 'string') b.name = o.name;
      if (typeof o.useBrand === 'boolean') b.useBrand = o.useBrand;
      if (o.logos && typeof o.logos === 'object') {
        for (const v of LOGO_VARIANTS) {
          if (typeof o.logos[v] === 'string') b.logos[v] = o.logos[v];
        }
      }
      if (Array.isArray(o.visuals)) {
        b.visuals = o.visuals.filter((x: { file?: string }) => typeof x?.file === 'string')
          .map((x: { file: string; label?: string }) => ({ file: x.file, label: typeof x.label === 'string' ? x.label : '' }));
      }
      if (Array.isArray(o.fonts)) {
        b.fonts = o.fonts.filter((x: { name?: string }) => typeof x?.name === 'string')
          .map((x: { name: string; role?: string }) => ({ name: x.name, role: typeof x.role === 'string' ? x.role : '' }));
      }
      if (Array.isArray(o.colors)) {
        b.colors = o.colors.filter((x: { hex?: string }) => typeof x?.hex === 'string' && /^#[0-9a-fA-F]{6}$/.test(x.hex))
          .map((x: { hex: string; name?: string }) => ({ hex: x.hex, name: typeof x.name === 'string' ? x.name : '' }));
      }
      if (typeof o.headerText === 'string') b.headerText = o.headerText;
      if (typeof o.headerFile === 'string') b.headerFile = o.headerFile;
      if (typeof o.footerText === 'string') b.footerText = o.footerText;
      if (typeof o.footerFile === 'string') b.footerFile = o.footerFile;
      return b;
    }
  } catch { /* abaikan, pakai default */ }
  return emptyBrand();
}

function saveBrand(b: Brand): void {
  try { window.localStorage.setItem(BRAND_LS, JSON.stringify(b)); } catch { /* abaikan */ }
}

/** Sufiks prompt dari brand — '' bila brand tidak aktif atau kosong.
 *  Data pengguna (nama, hex) dipakai apa adanya; kata template dalam
 *  bahasa Inggris karena prompt image bekerja paling baik begitu. */
export function brandSuffix(): string {
  const b = readBrand();
  if (!b.useBrand) return '';
  const parts: string[] = [];
  if (b.name.trim()) parts.push('Brand: ' + b.name.trim());
  if (b.colors.length) {
    parts.push('Brand colors: ' + b.colors.map((c) => c.hex + (c.name ? ' (' + c.name + ')' : '')).join(', '));
  }
  const namedFonts = b.fonts.filter((f) => f.name.trim());
  if (namedFonts.length) {
    parts.push('Brand fonts: ' + namedFonts.map((f) => f.name + (f.role ? ' (' + f.role + ')' : '')).join(', '));
  }
  if (b.visuals.length) {
    parts.push('Visual elements: ' + b.visuals.map((v) => v.label || v.file).join(', '));
  }
  if (b.headerText.trim()) parts.push('Header text: ' + b.headerText.trim());
  if (b.footerText.trim()) parts.push('Footer text: ' + b.footerText.trim());
  if (!parts.length) return '';
  return ', ' + parts.join('. ');
}

let inited = false;

export function initBrand(): void {
  const root = document.getElementById('brand-main');
  if (!root || inited) return;
  inited = true;
  renderBrand();
}

export function brandRefreshUI(): void {
  if (!inited) return;
  renderBrand();
}

function renderBrand(): void {
  const root = document.getElementById('brand-main');
  if (!root) return;
  const b = readBrand();
  const logoHtml = LOGO_VARIANTS.map((v) => {
    const file = b.logos[v];
    return '<div class="img-card" data-logo="' + v + '">' +
      '<div class="se-group"><label>' + tr('brand.logo.' + v) + '</label>' +
      (file
        ? '<img data-logoimg="' + v + '" alt="' + esc(file) + '">'
        : '<div class="se-note">' + tr('brand.logo.empty') + '</div>') +
      '</div>' +
      '<input type="file" accept="image/*" data-logofile="' + v + '">' +
      (file ? '<button class="se-btn2" data-logoclear="' + v + '">' + tr('brand.logo.clear') + '</button>' : '') +
      '</div>';
  }).join('');
  const visualHtml = b.visuals.map((v, i) =>
    '<div class="img-card" data-visual="' + i + '">' +
    '<img data-visualimg="' + i + '" alt="' + esc(v.label || v.file) + '">' +
    '<input class="se-field" type="text" data-visuallabel="' + i + '" value="' + esc(v.label) + '" placeholder="' + tr('brand.visual.label') + '">' +
    '<button class="se-btn2" data-visualdel="' + i + '">' + tr('brand.del') + '</button>' +
    '</div>').join('');
  const fontHtml = b.fonts.map((f, i) =>
    '<div class="se-group" data-font="' + i + '">' +
    '<input class="se-field" type="text" data-fontname="' + i + '" value="' + esc(f.name) + '" placeholder="' + tr('brand.font.name') + '">' +
    '<input class="se-field" type="text" data-fontrole="' + i + '" value="' + esc(f.role) + '" placeholder="' + tr('brand.font.role') + '">' +
    '<button class="se-btn2" data-fontdel="' + i + '">' + tr('brand.del') + '</button>' +
    '</div>').join('');
  const colorHtml = b.colors.map((c, i) =>
    '<div class="se-group" data-color="' + i + '">' +
    '<input type="color" data-colorpick="' + i + '" value="' + esc(c.hex) + '">' +
    '<input class="se-field" type="text" data-colorhex="' + i + '" value="' + esc(c.hex) + '" maxlength="7">' +
    '<input class="se-field" type="text" data-colorname="' + i + '" value="' + esc(c.name) + '" placeholder="' + tr('brand.color.name') + '">' +
    '<button class="se-btn2" data-colordel="' + i + '">' + tr('brand.del') + '</button>' +
    '</div>').join('');
  root.innerHTML =
    '<div class="se-group"><label>' + tr('brand.name') + '</label>' +
    '<input class="se-field" type="text" id="brand-name" value="' + esc(b.name) + '" placeholder="' + tr('brand.name.ph') + '"></div>' +
    '<div class="se-group"><label><input type="checkbox" id="brand-use" ' + (b.useBrand ? 'checked' : '') + '> ' + tr('brand.use') + '</label></div>' +
    '<h4>' + tr('brand.logos.title') + '</h4><div class="mediagrid">' + logoHtml + '</div>' +
    '<h4>' + tr('brand.visual.title') + '</h4><div class="mediagrid">' + visualHtml + '</div>' +
    '<div class="se-group"><input type="file" accept="image/*" id="brand-visual-add">' +
    '<button class="se-btn2" id="brand-visual-addbtn">' + tr('brand.visual.add') + '</button></div>' +
    '<h4>' + tr('brand.fonts.title') + '</h4>' + fontHtml +
    '<button class="se-btn2" id="brand-font-add">' + tr('brand.font.add') + '</button>' +
    '<h4>' + tr('brand.colors.title') + '</h4>' + colorHtml +
    '<button class="se-btn2" id="brand-color-add">' + tr('brand.color.add') + '</button>' +
    '<h4>' + tr('brand.header.title') + '</h4>' +
    '<div class="se-group"><input class="se-field" type="text" id="brand-header-text" value="' + esc(b.headerText) + '" placeholder="' + tr('brand.header.text') + '">' +
    (b.headerFile ? '<img data-headerimg alt="' + esc(b.headerFile) + '">' : '') +
    '<input type="file" accept="image/*" id="brand-header-file">' +
    (b.headerFile ? '<button class="se-btn2" id="brand-header-clear">' + tr('brand.logo.clear') + '</button>' : '') + '</div>' +
    '<h4>' + tr('brand.footer.title') + '</h4>' +
    '<div class="se-group"><input class="se-field" type="text" id="brand-footer-text" value="' + esc(b.footerText) + '" placeholder="' + tr('brand.footer.text') + '">' +
    (b.footerFile ? '<img data-footerimg alt="' + esc(b.footerFile) + '">' : '') +
    '<input type="file" accept="image/*" id="brand-footer-file">' +
    (b.footerFile ? '<button class="se-btn2" id="brand-footer-clear">' + tr('brand.logo.clear') + '</button>' : '') + '</div>' +
    '<div class="se-note" id="brand-note"></div>';

  // Muat preview gambar dari disk (async; gagal -> kartu tetap tampil).
  const loadImg = async (file: string, sel: string) => {
    const url = await readThumb(file);
    if (!url) return; // abaikan: file mungkin terhapus manual
    const el = root.querySelector(sel) as HTMLImageElement | null;
    if (el) el.src = url;
  };
  for (const v of LOGO_VARIANTS) {
    if (b.logos[v]) void loadImg(b.logos[v] as string, '[data-logoimg="' + v + '"]');
  }
  b.visuals.forEach((v, i) => void loadImg(v.file, '[data-visualimg="' + i + '"]'));
  if (b.headerFile) void loadImg(b.headerFile, '[data-headerimg]');
  if (b.footerFile) void loadImg(b.footerFile, '[data-footerimg]');

  const note = (msg: string) => {
    const el = document.getElementById('brand-note');
    if (el) el.textContent = msg;
  };
  const mutate = (fn: (b: Brand) => void) => {
    const cur = readBrand();
    fn(cur);
    saveBrand(cur);
    renderBrand();
  };

  // Simpan tanpa re-render: dipakai semua handler 'input' teks/picker.
  // Re-render saat mengetik menghancurkan caret & memutus drag picker.
  const saveOnly = (fn: (b: Brand) => void) => {
    const cur = readBrand();
    fn(cur);
    saveBrand(cur);
  };

  const nameEl = document.getElementById('brand-name') as HTMLInputElement | null;
  nameEl?.addEventListener('input', () => saveOnly((cur) => { cur.name = nameEl.value; }));
  const useEl = document.getElementById('brand-use') as HTMLInputElement | null;
  useEl?.addEventListener('change', () => mutate((cur) => { cur.useBrand = useEl.checked; }));

  const upload = (file: File, onSaved: (name: string) => void) => {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const b64 = (reader.result as string).split(',')[1] || '';
        const name = 'brand-' + Date.now() + '-' + Math.floor(Math.random() * 1000) + '.webp';
        await invoke('image_save', { req: { name, b64 } });
        onSaved(name);
      } catch (e) {
        note(tr('brand.err.save') + ' ' + (e instanceof Error ? e.message : String(e)));
      }
    };
    reader.readAsDataURL(file);
  };

  // Logo: unggah per varian + hapus.
  for (const v of LOGO_VARIANTS) {
    const input = root.querySelector('[data-logofile="' + v + '"]') as HTMLInputElement | null;
    input?.addEventListener('change', () => {
      const f = input.files?.[0];
      if (!f) return;
      upload(f, (name) => mutate((cur) => { cur.logos[v] = name; }));
    });
    const clear = root.querySelector('[data-logoclear="' + v + '"]') as HTMLButtonElement | null;
    clear?.addEventListener('click', async () => {
      const cur = readBrand();
      const old = cur.logos[v];
      cur.logos[v] = null;
      saveBrand(cur);
      if (old) { try { await invoke('image_delete', { req: { name: old } }); } catch { /* abaikan */ } }
      renderBrand();
    });
  }

  // Elemen visual: tambah (file + label kosong), label, hapus.
  const vAdd = document.getElementById('brand-visual-add') as HTMLInputElement | null;
  const vAddBtn = document.getElementById('brand-visual-addbtn') as HTMLButtonElement | null;
  vAddBtn?.addEventListener('click', () => {
    const f = vAdd?.files?.[0];
    if (!f) { note(tr('brand.visual.pick')); return; }
    upload(f, (name) => mutate((cur) => { cur.visuals.push({ file: name, label: '' }); }));
  });
  b.visuals.forEach((_v, i) => {
    const label = root.querySelector('[data-visuallabel="' + i + '"]') as HTMLInputElement | null;
    label?.addEventListener('input', () => saveOnly((cur) => { if (cur.visuals[i]) cur.visuals[i].label = label.value; }));
    const del = root.querySelector('[data-visualdel="' + i + '"]') as HTMLButtonElement | null;
    del?.addEventListener('click', async () => {
      const cur = readBrand();
      const old = cur.visuals[i]?.file;
      cur.visuals.splice(i, 1);
      saveBrand(cur);
      if (old) { try { await invoke('image_delete', { req: { name: old } }); } catch { /* abaikan */ } }
      renderBrand();
    });
  });

  // Font: tambah, edit, hapus.
  document.getElementById('brand-font-add')?.addEventListener('click', () => mutate((cur) => { cur.fonts.push({ name: '', role: '' }); }));
  b.fonts.forEach((_f, i) => {
    const nm = root.querySelector('[data-fontname="' + i + '"]') as HTMLInputElement | null;
    const rl = root.querySelector('[data-fontrole="' + i + '"]') as HTMLInputElement | null;
    nm?.addEventListener('input', () => saveOnly((cur) => { if (cur.fonts[i]) cur.fonts[i].name = nm.value; }));
    rl?.addEventListener('input', () => saveOnly((cur) => { if (cur.fonts[i]) cur.fonts[i].role = rl.value; }));
    root.querySelector('[data-fontdel="' + i + '"]')?.addEventListener('click', () => mutate((cur) => { cur.fonts.splice(i, 1); }));
  });

  // Warna: tambah, edit (picker <-> hex), hapus.
  document.getElementById('brand-color-add')?.addEventListener('click', () => mutate((cur) => { cur.colors.push({ hex: '#EB87B4', name: '' }); }));
  b.colors.forEach((_c, i) => {
    const pick = root.querySelector('[data-colorpick="' + i + '"]') as HTMLInputElement | null;
    const hex = root.querySelector('[data-colorhex="' + i + '"]') as HTMLInputElement | null;
    const nm = root.querySelector('[data-colorname="' + i + '"]') as HTMLInputElement | null;
    pick?.addEventListener('input', () => {
      saveOnly((cur) => { if (cur.colors[i]) cur.colors[i].hex = pick.value; });
      if (hex) hex.value = pick.value;
    });
    hex?.addEventListener('input', () => {
      if (!/^#[0-9a-fA-F]{6}$/.test(hex.value)) return;
      saveOnly((cur) => { if (cur.colors[i]) cur.colors[i].hex = hex.value; });
      if (pick) pick.value = hex.value;
    });
    nm?.addEventListener('input', () => saveOnly((cur) => { if (cur.colors[i]) cur.colors[i].name = nm.value; }));
    root.querySelector('[data-colordel="' + i + '"]')?.addEventListener('click', () => mutate((cur) => { cur.colors.splice(i, 1); }));
  });

  // Header/footer: teks + gambar.
  const hText = document.getElementById('brand-header-text') as HTMLInputElement | null;
  hText?.addEventListener('input', () => saveOnly((cur) => { cur.headerText = hText.value; }));
  const hFile = document.getElementById('brand-header-file') as HTMLInputElement | null;
  hFile?.addEventListener('change', () => {
    const f = hFile.files?.[0];
    if (f) upload(f, (name) => mutate((cur) => { cur.headerFile = name; }));
  });
  document.getElementById('brand-header-clear')?.addEventListener('click', async () => {
    const cur = readBrand();
    const old = cur.headerFile;
    cur.headerFile = null;
    saveBrand(cur);
    if (old) { try { await invoke('image_delete', { req: { name: old } }); } catch { /* abaikan */ } }
    renderBrand();
  });
  const fText = document.getElementById('brand-footer-text') as HTMLInputElement | null;
  fText?.addEventListener('input', () => saveOnly((cur) => { cur.footerText = fText.value; }));
  const fFile = document.getElementById('brand-footer-file') as HTMLInputElement | null;
  fFile?.addEventListener('change', () => {
    const f = fFile.files?.[0];
    if (f) upload(f, (name) => mutate((cur) => { cur.footerFile = name; }));
  });
  document.getElementById('brand-footer-clear')?.addEventListener('click', async () => {
    const cur = readBrand();
    const old = cur.footerFile;
    cur.footerFile = null;
    saveBrand(cur);
    if (old) { try { await invoke('image_delete', { req: { name: old } }); } catch { /* abaikan */ } }
    renderBrand();
  });
}
