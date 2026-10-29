// Rig Brand Identity (jsdom, test-only): membuktikan sidebar Brand di tab Image —
// BUKAN mock logika bisnis:
//  1. Tab render (nama, 7 slot varian logo, warna, font, visual).
//  2. Nama + warna + font tersimpan ke localStorage tanpa re-render
//     yang merusak input.
//  3. Unggah logo varian normal via file input (FileReader + invoke
//     stub image_save/image_read) -> preview tampil.
//  4. Centang "pakai brand" -> sufiks mengalir ke preview prompt Image
//     (preview sufiks di tab Brand dihapus atas perintah Patria
//     28 Okt 20:53 — yang diuji kini jalur sebenarnya: prompt Image).
//  5. Hapus logo -> slot kosong + image_delete dipanggil.
// Jalankan: npm run rig:brand (butuh dist ter-build + jsdom devDependency).
// Keluar 0 bila semua lolos, 1 bila ada yang gagal.

import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(dir, '..', 'dist');
let html = fs.readFileSync(path.join(distDir, 'index.html'), 'utf-8');
const modMatch = html.match(/<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/);
if (!modMatch) throw new Error('script module dist tidak ditemukan');
html = html.replace(modMatch[0], '').replace('</body>', `<script src="${modMatch[1]}"></script></body>`);

const log = [];
const store = new Map();
const imgFiles = new Map();
const PNG_1X1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

async function invokeStub(cmd, args) {
  log.push('invoke:' + cmd);
  const req = (args && args.req) || {};
  if (cmd === 'image_save') {
    imgFiles.set(req.name, req.b64);
    return { file: req.name, bytes: req.b64 ? req.b64.length : 0 };
  }
  if (cmd === 'image_read') {
    if (!imgFiles.has(req.name)) throw new Error('file tidak ditemukan');
    return { file: req.name, b64: imgFiles.get(req.name), bytes: imgFiles.get(req.name).length };
  }
  if (cmd === 'image_delete') {
    imgFiles.delete(req.name);
    return { file: req.name, deleted: true };
  }
  throw new Error('unexpected invoke ' + cmd);
}

const dom = new JSDOM(html, {
  url: 'file://' + distDir + '/index.html',
  resources: 'usable',
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  beforeParse(window) {
    window.__TAURI_INTERNALS__ = { invoke: invokeStub };
    window.fetch = async () => { throw new Error('fetch tidak dipakai rig-brand'); };
    window.URL.createObjectURL = () => 'blob:image-test';
    const ls = {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
      clear: () => store.clear(),
    };
    Object.defineProperty(window, 'localStorage', { value: ls });
  },
});

const { document } = dom.window;
const tick = (ms = 50) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, label, tries = 120) {
  for (let i = 0; i < tries; i++) {
    const v = fn();
    if (v) return v;
    await tick();
  }
  throw new Error('timeout: ' + label);
}

let failed = 0;
function check(name, ok, extra = '') {
  // eslint-disable-next-line no-console
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok || !extra ? '' : ' :: ' + String(extra).slice(0, 200)));
  if (!ok) failed++;
}
const brand = () => JSON.parse(store.get('minime.brand') || '{}');

try {
  await waitFor(() => typeof dom.window.showView === 'function', 'mount showView', 120);
  dom.window.showView('media');
  dom.window.mediaTab('image');
  await tick(100);

  // 1. Sidebar Brand di dalam tab Image: nama + 7 slot logo + tombol tambah.
  check('sidebar Brand render di tab Image', !!document.getElementById('brand-name') && !!document.querySelector('#ms-tab-image #brand-main') && document.querySelectorAll('[data-logo]').length === 7,
    'logo slots=' + document.querySelectorAll('[data-logo]').length);
  check('tombol tambah warna/font/visual ada', !!document.getElementById('brand-color-add') && !!document.getElementById('brand-font-add') && !!document.getElementById('brand-visual-addbtn'));

  // 2. Nama tersimpan tanpa re-render (input tetap sama).
  const nameEl = document.getElementById('brand-name');
  nameEl.value = 'TEST Kopi Surabaya';
  nameEl.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  await tick(50);
  check('nama tersimpan di state', brand().name === 'TEST Kopi Surabaya', JSON.stringify(brand()));
  check('input tidak dihancurkan re-render', document.getElementById('brand-name') === nameEl);

  // 3. Tambah warna + ubah hex.
  document.getElementById('brand-color-add').click();
  await tick(50);
  check('baris warna bertambah', document.querySelectorAll('[data-color]').length === 1);
  const pick = document.querySelector('[data-colorpick="0"]');
  pick.value = '#123456';
  pick.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  await tick(50);
  check('hex warna tersimpan', brand().colors[0].hex === '#123456', JSON.stringify(brand().colors));

  // 4. Tambah font + isi nama.
  document.getElementById('brand-font-add').click();
  await tick(50);
  const fname = document.querySelector('[data-fontname="0"]');
  fname.value = 'Inter';
  fname.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  await tick(50);
  check('font tersimpan', brand().fonts[0].name === 'Inter', JSON.stringify(brand().fonts));

  // 5. Unggah logo normal.
  const file = new dom.window.File([Buffer.from(PNG_1X1, 'base64')], 'logo.png', { type: 'image/png' });
  const logoInput = document.querySelector('[data-logofile="normal"]');
  Object.defineProperty(logoInput, 'files', { value: [file], configurable: true });
  logoInput.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  await waitFor(() => brand().logos && brand().logos.normal, 'logo normal tersimpan', 120);
  check('logo normal tersimpan', typeof brand().logos.normal === 'string', JSON.stringify(brand().logos));
  await waitFor(() => {
    const img = document.querySelector('[data-logoimg="normal"]');
    return img && img.src && img.src.startsWith('data:image');
  }, 'preview logo tampil', 120);
  check('preview logo tampil', !!(document.querySelector('[data-logoimg="normal"]')?.src || '').startsWith('data:image'));

  // 6. Centang pakai brand -> sufiks mengalir ke preview prompt Image.
  const useEl = document.getElementById('brand-use');
  useEl.checked = true;
  useEl.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  await tick(100);
  check('centang pakai brand tersimpan', brand().useBrand === true, JSON.stringify(brand().useBrand));
  check('preview sufiks Brand sudah dihapus', !document.getElementById('brand-prompt'));
  const brief = document.getElementById('img-brief');
  brief.value = 'kopi susu';
  brief.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  await tick(100);
  const preview = document.getElementById('img-preview')?.textContent || '';
  check('sufiks brand mengalir ke prompt Image', preview.includes('TEST Kopi Surabaya') && preview.includes('#123456'), preview);

  // 7. Hapus logo -> slot kosong + image_delete.
  document.querySelector('[data-logoclear="normal"]').click();
  await tick(100);
  check('logo normal terhapus dari state', brand().logos.normal === null, JSON.stringify(brand().logos));
  check('image_delete dipanggil', log.includes('invoke:image_delete'), log.join(','));
} catch (e) {
  // eslint-disable-next-line no-console
  console.log('FAIL rig-brand exception :: ' + (e && e.stack ? e.stack : e));
  failed++;
}

// eslint-disable-next-line no-console
console.log(failed === 0 ? 'RIG-BRAND ALL PASSED' : 'RIG-BRAND FAILED');
process.exit(failed === 0 ? 0 : 1);
