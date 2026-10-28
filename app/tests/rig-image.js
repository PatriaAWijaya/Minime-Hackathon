// Rig Flow Gambar (jsdom, test-only): membuktikan panel Image baru —
// BUKAN mock logika bisnis:
//  1. Panel render (brief, rasio, Generate) + preview prompt terkirim.
//  2. Tanpa kunci Meta: Generate ditolak jujur, tanpa fetch.
//  3. Generate via fetch stub (bentuk respons Meta terverifikasi live)
//     -> varian tampil + biaya Rp tercatat.
//  4. Simpan varian -> baris Library + galeri (via invoke stub
//     image_save/image_read) + spend tercatat.
//  5. Muat dari Script terakhir mengisi brief.
//  6. Recall Library (Media Studio) memuat gambar tersimpan ke panel.
// Jalankan: npm run rig:image (butuh dist ter-build + jsdom devDependency).
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

function makeResp({ ok = true, status = 200, jsonData = null } = {}) {
  return {
    ok,
    status,
    headers: { get: () => 'application/json' },
    json: async () => jsonData,
    text: async () => (jsonData ? JSON.stringify(jsonData) : ''),
  };
}

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
  throw new Error('unexpected invoke ' + cmd);
}

async function fetchStub(url) {
  log.push('fetch:' + String(url));
  // Bentuk respons Meta terverifikasi probe live 28 Okt 2026.
  return makeResp({
    jsonData: {
      created: 1793000000,
      data: [{ b64_json: PNG_1X1 }, { b64_json: PNG_1X1 }],
      output_format: 'webp',
      usage: {},
    },
  });
}

const dom = new JSDOM(html, {
  url: 'file://' + distDir + '/index.html',
  resources: 'usable',
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  beforeParse(window) {
    window.__TAURI_INTERNALS__ = { invoke: invokeStub };
    window.fetch = fetchStub;
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

const bodyText = () => document.body.textContent || '';
const fetchCount = () => log.filter((l) => l.startsWith('fetch:')).length;
const libRows = () => document.getElementById('libBody')?.querySelectorAll('tr').length || 0;

try {
  await tick(500);
  dom.window.showView('media');
  dom.window.mediaTab('image');
  await tick(100);

  // 1. Panel render + preview prompt terkirim.
  check('panel Image render', !!document.getElementById('img-brief') && !!document.getElementById('img-generate') && !!document.getElementById('img-ratio'));
  const brief = document.getElementById('img-brief');
  brief.value = 'kopi susu';
  brief.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  await tick(100);
  check('preview prompt memuat brief + tanpa-teks', (document.getElementById('img-preview')?.textContent || '').includes('kopi susu') && (document.getElementById('img-preview')?.textContent || '').includes('no text'));

  // 2. Tanpa kunci: ditolak jujur, tanpa fetch.
  document.getElementById('img-n').value = '2';
  document.getElementById('img-n').dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  document.getElementById('img-generate').click();
  await waitFor(() => (document.getElementById('img-status')?.textContent || '').includes('Kunci Meta'), 'note tanpa kunci', 60);
  check('tanpa kunci ditolak tanpa fetch', fetchCount() === 0, 'fetch=' + fetchCount());

  // 3. Generate -> 2 varian + biaya Rp.
  store.set('minime.metaKey', 'rig-key');
  document.getElementById('img-generate').click();
  await waitFor(() => document.querySelectorAll('#img-variants img').length === 2, '2 varian tampil', 120);
  check('2 varian tampil', document.querySelectorAll('#img-variants img').length === 2);
  check('biaya generate tampil (Rp)', (document.getElementById('img-status')?.textContent || '').includes('Rp'));
  const spend = JSON.parse(store.get('minime.imageSpend') || '{}');
  check('spend tercatat 2 gambar', spend.images === 2 && spend.usd === 0.02, JSON.stringify(spend));

  // 4. Simpan varian -> Library + galeri.
  const rowsBefore = libRows();
  [...document.querySelectorAll('#img-variants button')].find((b) => b.textContent.trim() === 'Simpan ke Library').click();
  await waitFor(() => libRows() === rowsBefore + 1, 'baris Library bertambah', 120);
  check('simpan menambah baris Library', libRows() === rowsBefore + 1, 'rows=' + libRows());
  await waitFor(() => document.querySelectorAll('#img-gallery img').length === 1, 'galeri tampil', 120);
  check('galeri menampilkan gambar tersimpan', document.querySelectorAll('#img-gallery img').length === 1);

  // 5. Muat dari Script terakhir.
  store.set('minime.scriptEditor', JSON.stringify({ output: 'NASKAH-TEST-KOPI' }));
  document.getElementById('img-load-script').click();
  await tick(100);
  check('muat Script mengisi brief', (document.getElementById('img-brief')?.value || '').includes('NASKAH-TEST-KOPI'));

  // 6. Recall Library -> panel Image memuat gambar tersimpan.
  const addedRow = [...document.querySelectorAll('#libBody tr')].pop();
  [...addedRow.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Media Studio').click();
  await waitFor(() => (document.getElementById('img-loaded')?.querySelector('img') ? true : false), 'gambar recall tampil', 120);
  check('recall Library memuat gambar ke panel', !!document.getElementById('img-loaded')?.querySelector('img'));
  check('recall Library mengisi brief dari prompt', (document.getElementById('img-brief')?.value || '').includes('kopi susu'));
} catch (e) {
  // eslint-disable-next-line no-console
  console.log('FAIL rig-image exception :: ' + (e && e.stack ? e.stack : e));
  failed++;
}

// eslint-disable-next-line no-console
console.log(failed === 0 ? 'RIG-IMAGE ALL PASSED' : 'RIG-IMAGE FAILED');
process.exit(failed === 0 ? 0 : 1);
