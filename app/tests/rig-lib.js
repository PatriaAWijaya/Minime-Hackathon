// Rig Library Kartu (jsdom, test-only): membuktikan Library bentuk kartu +
// filter 4 dimensi + detail klik-2x + hapus menyeluruh — BUKAN mock logika:
//  1. Kartu awal = 5 baris bawaan, tiap kartu memuat agen + project + judul.
//  2. Filter jenis/agen/project/periode menyaring kartu (periode diuji
//     dengan item baru bertanggal hari ini, bukan tanggal tetap).
//  3. Klik 2x membuka dialog detail; Tutup menutupnya.
//  4. Tombol Media Studio membuka tab Script; Revisi kembali ke chat.
//  5. Hapus: confirm=false tidak menghapus; confirm=true menghapus dari
//     Library (persist tombstone/array) + kartu Kanban terkait.
// Jalankan: npm run rig:lib (butuh dist ter-build + jsdom devDependency).
// Keluar 0 bila semua lolos, 1 bila ada yang gagal.

import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(dir, '..', 'dist');
let html = fs.readFileSync(path.join(distDir, 'index.html'), 'utf-8');
const modMatch = html.match(/<script type="module"[^>]*src="([^"]+)"><\/script>/);
if (!modMatch) throw new Error('script module dist tidak ditemukan');
html = html.replace(modMatch[0], '').replace('</body>', `<script src="${modMatch[1]}"></script></body>`);

const store = new Map();
const log = [];

async function invokeStub(cmd) {
  log.push('invoke:' + cmd);
  throw new Error('unexpected invoke ' + cmd);
}

const dom = new JSDOM(html, {
  url: 'file://' + distDir + '/index.html',
  resources: 'usable',
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  beforeParse(window) {
    window.__TAURI_INTERNALS__ = { invoke: invokeStub };
    window.fetch = async () => ({ ok: true, status: 200, headers: { get: () => '' }, json: async () => ({}), text: async () => '' });
    window.URL.createObjectURL = () => 'blob:lib-test';
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

let failures = 0;
function check(name, ok, extra) {
  // eslint-disable-next-line no-console
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok || !extra ? '' : ' :: ' + String(extra).slice(0, 200)));
  if (!ok) failures++;
}
const cards = () => [...document.querySelectorAll('#libGrid .lib-card')];
const bodyText = () => document.body.textContent || '';

try {
  await waitFor(() => document.getElementById('chatInput'), 'mount chatInput', 200);
  dom.window.showView('library');
  await tick(200);

  // 1. Kartu awal + meta agen/project/judul.
  check('kartu awal 5 baris bawaan', cards().length === 5, 'cards=' + cards().length);
  check('kartu memuat agen + project + judul', cards().every((c) => c.textContent.includes('Agen:') && c.textContent.includes('Project:')) && cards().some((c) => c.textContent.includes('STP v2')));
  check('hitungan 5 dari 5 file', (document.getElementById('libFilterCount')?.textContent || '').includes('5'));

  // 2. Filter: jenis, agen, project, periode (item baru = hari ini).
  dom.window.libSetFilter('kind', 'script');
  await tick(100);
  check('filter jenis naskah menyaring ke 1 (Kalender)', cards().length === 1 && cards()[0].textContent.includes('Kalender 7 hari'), 'cards=' + cards().length);
  dom.window.libSetFilter('kind', 'image');
  await tick(100);
  check('filter jenis gambar menyaring ke 1 (Gambar Hari 1-7)', cards().length === 1 && cards()[0].textContent.includes('Gambar Hari 1'), 'cards=' + cards().length);
  dom.window.libSetFilter('kind', 'doc');
  await tick(100);
  check('filter jenis dokumen menyaring ke 3', cards().length === 3, 'cards=' + cards().length);
  dom.window.libSetFilter('kind', 'all');
  dom.window.libSetFilter('agent', 'Riset');
  await tick(100);
  check('filter agen Riset menyaring ke 1', cards().length === 1 && cards()[0].textContent.includes('Riset behaviour'), 'cards=' + cards().length);
  dom.window.libSetFilter('agent', 'all');
  dom.window.libSetFilter('proj', 'TEST Produk Digital');
  await tick(100);
  check('filter project menyaring ke 1', cards().length === 1 && cards()[0].textContent.includes('Brief produk digital'), 'cards=' + cards().length);
  dom.window.libSetFilter('proj', 'all');
  await tick(100);
  dom.window.libAddScript('NASKAH-LIB-UJI', 'ISI-LIB-UJI-HARI-INI');
  await tick(100);
  check('simpan baru menambah kartu', cards().length === 6, 'cards=' + cards().length);
  dom.window.libSetFilter('period', 'today');
  await tick(100);
  check('filter periode hari ini hanya item baru', cards().length === 1 && cards()[0].textContent.includes('NASKAH-LIB-UJI'), 'cards=' + cards().length);
  dom.window.libSetFilter('period', 'all');
  await tick(100);

  // 3. Detail klik 2x + tutup.
  const first = cards()[0];
  first.dispatchEvent(new dom.window.MouseEvent('dblclick', { bubbles: true }));
  await tick(100);
  check('klik 2x membuka dialog detail', document.getElementById('libDetailDlg')?.style.display === 'block' && (document.getElementById('libDetailDlg')?.textContent || '').includes(first.querySelector('.lib-title')?.textContent || ''));
  check('detail baris bawaan memuat konten asli Fase', (document.getElementById('libDetailDlg')?.textContent || '').includes('Positioning'));
  [...document.querySelectorAll('#libDetailDlg button')].find((b) => b.textContent.trim() === 'Tutup').click();
  await tick(100);
  check('tombol Tutup menutup dialog', document.getElementById('libDetailDlg')?.style.display === 'none');

  // 3b. Media Studio baris bawaan memuat konten asli (bukan judul saja).
  const stp = cards().find((c) => c.textContent.includes('STP v2'));
  [...stp.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Media Studio').click();
  await tick(150);
  check('Media Studio baris bawaan membuka tab Script', document.getElementById('ms-tab-script')?.style.display !== 'none');
  check('Media Studio baris bawaan memuat isi asli', (document.getElementById('se-output')?.value || '').includes('higienis'));
  dom.window.showView('library');
  await tick(100);

  // 3c. Media Studio pada gambar tanpa file membuka dialog status (bukan editor kosong).
  const gambar = cards().find((c) => c.textContent.includes('Gambar Hari 1'));
  [...gambar.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Media Studio').click();
  await tick(100);
  check('Media Studio gambar tanpa file membuka dialog status', document.getElementById('libDetailDlg')?.style.display === 'block' && (document.getElementById('libDetailDlg')?.textContent || '').includes('pending-provider'));
  [...document.querySelectorAll('#libDetailDlg button')].find((b) => b.textContent.trim() === 'Tutup').click();
  await tick(100);

  // 4. Media Studio + Revisi dari kartu.
  const added = cards().find((c) => c.textContent.includes('NASKAH-LIB-UJI'));
  [...added.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Media Studio').click();
  await tick(150);
  check('Media Studio membuka tab Script', document.getElementById('ms-tab-script')?.style.display !== 'none');
  dom.window.showView('library');
  await tick(100);
  const added2 = cards().find((c) => c.textContent.includes('NASKAH-LIB-UJI'));
  [...added2.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Revisi').click();
  await waitFor(() => bodyText().includes('Perbaikan dibuka'), 'pesan revisi di chat', 120);
  check('Revisi kembali ke menu chat', document.getElementById('view-home')?.classList.contains('active') && bodyText().includes('Perbaikan dibuka'));

  // 5. Hapus via dialog in-app: Batal membatalkan, Ya menghapus.
  dom.window.showView('library');
  await tick(100);
  const victim = cards().find((c) => c.textContent.includes('NASKAH-LIB-UJI'));
  [...victim.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Hapus').click();
  await tick(100);
  check('klik Hapus membuka dialog konfirmasi', document.getElementById('libConfirmDlg')?.style.display === 'block' && (document.getElementById('libConfirmDlg')?.textContent || '').includes('NASKAH-LIB-UJI'));
  [...document.querySelectorAll('#libConfirmDlg button')].find((b) => b.textContent.trim() === 'Batal').click();
  await tick(100);
  check('Batal tidak menghapus', cards().some((c) => c.textContent.includes('NASKAH-LIB-UJI')) && document.getElementById('libConfirmDlg')?.style.display === 'none');
  const victim2 = cards().find((c) => c.textContent.includes('NASKAH-LIB-UJI'));
  [...victim2.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Hapus').click();
  await tick(100);
  [...document.querySelectorAll('#libConfirmDlg button')].find((b) => b.textContent.trim() === 'Ya, hapus').click();
  await tick(100);
  check('Ya, hapus menghapus kartu', !cards().some((c) => c.textContent.includes('NASKAH-LIB-UJI')) && cards().length === 5, 'cards=' + cards().length);
  check('hapus baris user persist di localStorage', (store.get('minime.library.added') || '') === '[]');
  check('kartu Kanban Revisi ikut terhapus', !bodyText().includes('Revisi: NASKAH-LIB-UJI'));

  // 6. Hapus baris bawaan -> tombstone persist + tetap hilang setelah render ulang.
  const builtin = cards()[0];
  const builtinTitle = builtin.querySelector('.lib-title')?.textContent || '';
  [...builtin.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Hapus').click();
  await tick(100);
  [...document.querySelectorAll('#libConfirmDlg button')].find((b) => b.textContent.trim() === 'Ya, hapus').click();
  await tick(100);
  check('hapus baris bawaan mengurangi kartu', cards().length === 4, 'cards=' + cards().length);
  check('tombstone baris bawaan tersimpan', (store.get('minime.library.deleted') || '').includes(builtinTitle));
  dom.window.renderLib();
  await tick(100);
  check('baris bawaan tetap hilang setelah render ulang', cards().length === 4 && !cards().some((c) => (c.querySelector('.lib-title')?.textContent || '') === builtinTitle));
} catch (e) {
  console.log('FAIL rig error: ' + (e && e.message ? e.message : String(e)));
  failures++;
}

console.log(failures === 0 ? 'RIG-LIB ALL PASSED' : 'RIG-LIB FAILED: ' + failures + ' checks');
process.exit(failures === 0 ? 0 : 1);
