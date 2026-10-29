// Rig Graph (jsdom, test-only): membuktikan setting per node ala OpenBot:
//  1. Node trigger ada + panel tersembunyi sebelum dipilih.
//  2. Klik trigger -> panel setting tampil (tipe, frekuensi, next run, Run now).
//  3. Ringkasan default: Daily • Every day • 9:00 AM.
//  4. Matematika next/prev run: daily, weekly, hourly, once.
//  5. Ubah frekuensi ke weekly + pilih hari Senin saja -> ringkasan berubah.
//  6. Duplikat node -> jumlah +1 + terpilih; hapus (konfirmasi) -> kembali.
//  7. Label cabang decision gate bisa diubah -> label edge ikut berubah.
//  8. Rename trigger tersimpan (localStorage) -> DOM baru menampilkannya.
//  9. Run now -> simulasi selesai + riwayat tercatat (badge 1 + baris riwayat).
//  10. Zoom + / - mengubah label; Add node menambah node.
// Jalankan: npm run rig:graph (butuh dist ter-build + jsdom devDependency).
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

async function invokeStub() {
  throw new Error('unexpected invoke');
}
async function fetchStub() {
  return { ok: false, status: 0, headers: { get: () => '' }, json: async () => ({}), text: async () => '' };
}

function makeDom(store) {
  const dom = new JSDOM(html, {
    url: 'file://' + distDir + '/index.html',
    resources: 'usable',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.__TAURI_INTERNALS__ = { invoke: invokeStub };
      window.fetch = fetchStub;
      const ls = {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => store.set(k, String(v)),
        removeItem: (k) => store.delete(k),
        clear: () => store.clear(),
      };
      Object.defineProperty(window, 'localStorage', { value: ls });
    },
  });
  return dom;
}

const tick = (ms = 50) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
function check(name, ok, extra = '') {
  // eslint-disable-next-line no-console
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok || !extra ? '' : ' :: ' + String(extra).slice(0, 300)));
  if (!ok) failed++;
}

const store = new Map();
const D = (y, m, d, h, mi) => new Date(y, m, d, h, mi, 0, 0);

try {
  const dom = makeDom(store);
  const { document } = dom.window;
  await tick(500);
  dom.window.showView('graph');
  dom.window.renderGraph();
  await tick(100);

  const nodeCount = () => document.querySelectorAll('#graphNodes .n8n-node').length;
  const panel = () => document.getElementById('graphPanel');
  const trigEl = () => document.querySelector('[data-nkey="trigger"]');

  // 1. Node trigger ada + panel tersembunyi.
  check('node trigger ada', !!trigEl(), '');
  check('panel tersembunyi sebelum pilih', panel().style.display === 'none', panel().style.display);
  check('9 node awal', nodeCount() === 9, nodeCount());

  // 2. Klik trigger -> panel tampil.
  trigEl().click();
  await tick(100);
  const panelText = () => panel().textContent || '';
  check('klik trigger -> panel tampil', panel().style.display === 'block', panel().style.display);
  check('panel berisi Tipe Trigger', panelText().includes('Tipe Trigger'), panelText().slice(0, 200));
  check('panel berisi Frekuensi', panelText().includes('Frekuensi'), '');
  check('panel berisi Run now', panelText().includes('Run now'), '');

  // 3. Ringkasan default + next run.
  const sumText = () => (document.querySelector('.g-sum')?.textContent || '');
  check('ringkasan default Daily Every day 9 AM', sumText() === 'Daily • Every day • 9:00 AM', sumText());
  check('next run menampilkan jam 09:00', (document.querySelector('.g-next')?.textContent || '').includes('09:00'), document.querySelector('.g-next')?.textContent);

  // 4. Matematika next/prev run (30 Okt 2026 = Jumat).
  const W = dom.window;
  const daily = { type: 'schedule', freq: 'daily', hour: 9, min: 0, ampm: 'AM', days: [0, 1, 2, 3, 4, 5, 6] };
  check('next daily: pagi -> hari ini 09:00', W.graphNextRun(daily, D(2026, 9, 30, 8, 0)).getTime() === D(2026, 9, 30, 9, 0).getTime(), '');
  check('next daily: lewat -> besok 09:00', W.graphNextRun(daily, D(2026, 9, 30, 10, 0)).getTime() === D(2026, 9, 31, 9, 0).getTime(), '');
  const weekly = { ...daily, freq: 'weekly', days: [1] };
  check('next weekly Senin: Jumat -> Senin 2 Nov 09:00', W.graphNextRun(weekly, D(2026, 9, 30, 10, 0)).getTime() === D(2026, 10, 2, 9, 0).getTime(), '');
  const hourly = { ...daily, freq: 'hourly', min: 30 };
  check('next hourly: 10:15 -> 10:30', W.graphNextRun(hourly, D(2026, 9, 30, 10, 15)).getTime() === D(2026, 9, 30, 10, 30).getTime(), '');
  check('next hourly: 10:45 -> 11:30', W.graphNextRun(hourly, D(2026, 9, 30, 10, 45)).getTime() === D(2026, 9, 30, 11, 30).getTime(), '');
  check('prev daily: 10:00 -> hari ini 09:00', W.graphPrevRun(daily, D(2026, 9, 30, 10, 0)).getTime() === D(2026, 9, 30, 9, 0).getTime(), '');
  const oncePast = { ...daily, freq: 'once', date: '2026-10-29' };
  check('next once lewat -> null', W.graphNextRun(oncePast, D(2026, 9, 30, 10, 0)) === null, '');
  check('summary manual', W.graphTrigSummary({ type: 'manual' }) === 'Manual', W.graphTrigSummary({ type: 'manual' }));

  // 5. Frekuensi -> weekly + hari Senin saja.
  const selects = () => panel().querySelectorAll('select');
  selects()[1].value = 'weekly';
  selects()[1].dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  await tick(100);
  check('pilih weekly -> 7 tombol hari tampil', panel().querySelectorAll('.g-day').length === 7, panel().querySelectorAll('.g-day').length);
  for (const idx of [0, 2, 3, 4, 5, 6]) {
    panel().querySelectorAll('.g-day')[idx].click();
    await tick(50);
  }
  check('hari Senin saja -> ringkasan Weekly M 9 AM', sumText() === 'Weekly • M • 9:00 AM', sumText());

  // 6. Duplikat lalu hapus pakai konfirmasi.
  [...panel().querySelectorAll('button')].find((b) => b.textContent === 'Duplikat').click();
  await tick(100);
  check('duplikat -> 10 node + ada yang terpilih', nodeCount() === 10 && !!document.querySelector('.n8n-node.sel'), nodeCount());
  [...panel().querySelectorAll('button')].find((b) => b.textContent === 'Hapus').click();
  await tick(100);
  check('klik Hapus -> baris konfirmasi tampil', panelText().includes('Hapus node ini?'), panelText().slice(0, 200));
  [...panel().querySelectorAll('button')].find((b) => b.textContent === 'Ya, hapus').click();
  await tick(100);
  check('konfirmasi hapus -> kembali 9 node + panel tutup', nodeCount() === 9 && panel().style.display === 'none', nodeCount() + ' ' + panel().style.display);

  // 7. Label cabang decision.
  document.querySelector('[data-nkey="gate"]').click();
  await tick(100);
  const branchInput = [...panel().querySelectorAll('input')].find((el) => (el.value || '') === 'true');
  check('panel gate berisi input cabang true', !!branchInput, '');
  branchInput.value = 'lanjut';
  branchInput.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  await tick(100);
  const edgeTexts = [...document.querySelectorAll('#graphEdges text')].map((el) => el.textContent);
  check('label edge ikut berubah jadi lanjut', edgeTexts.includes('lanjut'), edgeTexts.join('|'));

  // 8. Rename trigger tersimpan.
  trigEl().click();
  await tick(100);
  const nameInput = panel().querySelector('input.g-input');
  nameInput.value = 'Trigger Uji';
  nameInput.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  await tick(100);
  check('rename tersimpan di localStorage', (store.get('minime.graphState') || '').includes('Trigger Uji'), '');
  const dom2 = makeDom(store);
  await tick(500);
  dom2.window.showView('graph');
  dom2.window.renderGraph();
  await tick(100);
  check('DOM baru: nama Trigger Uji bertahan', (dom2.window.document.querySelector('[data-nkey="trigger"]')?.textContent || '').includes('Trigger Uji'), '');

  // 9. Run now -> selesai + riwayat.
  trigEl().click();
  await tick(100);
  document.querySelector('.g-run').click();
  await tick(4200);
  const notice = document.getElementById('graphNotice')?.textContent || '';
  check('Run now -> notice selesai', notice.includes('selesai'), notice.slice(0, 120));
  check('badge riwayat = 1', document.getElementById('graphHistBadge')?.textContent === '1', document.getElementById('graphHistBadge')?.textContent);
  document.querySelector('.graph-head-btns button').click();
  await tick(100);
  check('riwayat tampil + baris Simulasi selesai', (document.getElementById('graphHist')?.textContent || '').includes('Simulasi selesai'), document.getElementById('graphHist')?.textContent);

  // 10. Zoom + Add node.
  dom.window.graphZoomIn();
  check('zoom + -> label 125%', document.getElementById('graphZoomLabel')?.textContent === '125%', document.getElementById('graphZoomLabel')?.textContent);
  dom.window.graphZoomOut();
  check('zoom - -> label 100%', document.getElementById('graphZoomLabel')?.textContent === '100%', '');
  document.querySelector('[data-nkey="prime"]').click();
  await tick(100);
  dom.window.graphAddNode();
  await tick(100);
  check('Add node dari prime -> 10 node + terpilih', nodeCount() === 10 && !!document.querySelector('.n8n-node.sel'), nodeCount());

  // 11. v82 ala OpenBot: handle +/hapus tiap node + kartu trigger + play node pertama.
  check('setiap node punya handle +', document.querySelectorAll('.n8n-plus').length === nodeCount(), document.querySelectorAll('.n8n-plus').length + ' vs ' + nodeCount());
  check('setiap node punya handle hapus', document.querySelectorAll('.n8n-del').length === nodeCount(), document.querySelectorAll('.n8n-del').length + ' vs ' + nodeCount());
  const trigEl2 = document.querySelector('[data-nkey="trigger"]');
  check('kartu trigger punya chips ringkasan', !!trigEl2.querySelector('.ntrig-chips') && trigEl2.querySelectorAll('.ntrig-chips span').length === 3, trigEl2.querySelector('.ntrig-chips')?.textContent);
  check('kartu trigger punya baris next run', !!trigEl2.querySelector('.ntrig-next'), trigEl2.querySelector('.ntrig-next')?.textContent);
  check('node pertama punya tombol play', !!trigEl2.querySelector('.n8n-play'), '');
  document.querySelector('[data-nkey="gate"] .n8n-plus').click();
  await tick(100);
  check('+ di node decision menambah node (10 -> 11)', nodeCount() === 11, nodeCount());
  document.querySelector('[data-nkey="trigger"] .n8n-play').click();
  await tick(4200);
  check('play node pertama -> badge riwayat = 2', document.getElementById('graphHistBadge')?.textContent === '2', document.getElementById('graphHistBadge')?.textContent);
  document.querySelector('.n8n-node.sel .n8n-del').click();
  await tick(100);
  check('klik hapus node -> panel konfirmasi tampil', !!document.querySelector('.g-delask'), document.getElementById('graphPanel')?.textContent?.slice(0, 80));
  document.querySelector('.g-delask button').click();
  await tick(100);
  check('konfirmasi hapus -> node 11 -> 10', nodeCount() === 10, nodeCount());

} catch (e) {
  // eslint-disable-next-line no-console
  console.log('FAIL rig-graph exception :: ' + (e && e.stack ? e.stack : e));
  failed++;
}

// eslint-disable-next-line no-console
console.log(failed === 0 ? 'RIG-GRAPH ALL PASSED' : 'RIG-GRAPH FAILED');
process.exit(failed === 0 ? 0 : 1);
