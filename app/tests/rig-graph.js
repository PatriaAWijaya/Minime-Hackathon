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
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok || !extra ? '' : ' :: ' + String(extra).slice(0, 300)));
  if (!ok) failed++;
}

const store = new Map();
const D = (y, m, d, h, mi) => new Date(y, m, d, h, mi, 0, 0);

try {
  const dom = makeDom(store);
  const { document } = dom.window;
  await waitFor(() => typeof dom.window.showView === 'function', 'mount showView', 120);
  dom.window.showView('graph');
  dom.window.renderGraph();
  await tick(100);

  const nodeCount = () => document.querySelectorAll('#graphNodes .n8n-node').length;
  const panel = () => document.getElementById('graphPopupCard');
  const popup = () => document.getElementById('graphPopup');
  const dbl = (el) => el.dispatchEvent(new dom.window.MouseEvent('dblclick', { bubbles: true }));
  const trigEl = () => document.querySelector('[data-nkey="trigger"]');

  // 1. Node trigger ada + panel tersembunyi.
  check('node trigger ada', !!trigEl(), '');
  check('popup tersembunyi sebelum dblclick', popup().style.display === 'none', popup().style.display);
  check('elemen panel fixed sudah tidak ada', document.getElementById('graphPanel') === null, '');
  check('9 node awal', nodeCount() === 9, nodeCount());

  // 2. Klik saja tidak membuka popup; dblclick membuka popup.
  trigEl().click();
  await tick(100);
  check('klik saja tidak membuka popup', popup().style.display === 'none', popup().style.display);
  dbl(trigEl());
  await tick(100);
  const panelText = () => panel().textContent || '';
  check('dblclick trigger -> popup tampil', popup().style.display === 'flex', popup().style.display);
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
  check('konfirmasi hapus -> kembali 9 node + popup tutup', nodeCount() === 9 && popup().style.display === 'none', nodeCount() + ' ' + popup().style.display);

  // 7. Label cabang decision.
  dbl(document.querySelector('[data-nkey="gate"]'));
  await tick(100);
  const branchInput = [...panel().querySelectorAll('input')].find((el) => (el.value || '') === 'true');
  check('panel gate berisi input cabang true', !!branchInput, '');
  branchInput.value = 'lanjut';
  branchInput.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  await tick(100);
  const edgeTexts = [...document.querySelectorAll('#graphEdges text')].map((el) => el.textContent);
  check('label edge ikut berubah jadi lanjut', edgeTexts.includes('lanjut'), edgeTexts.join('|'));

  // 8. Rename trigger tersimpan.
  dbl(trigEl());
  await tick(100);
  const nameInput = panel().querySelector('input.g-input');
  nameInput.value = 'Trigger Uji';
  nameInput.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  await tick(100);
  check('rename tersimpan di localStorage', (store.get('minime.graphState') || '').includes('Trigger Uji'), '');
  const dom2 = makeDom(store);
  await waitFor(() => typeof dom2.window.showView === 'function', 'mount showView', 120);
  dom2.window.showView('graph');
  dom2.window.renderGraph();
  await tick(100);
  check('DOM baru: nama Trigger Uji bertahan', (dom2.window.document.querySelector('[data-nkey="trigger"]')?.textContent || '').includes('Trigger Uji'), '');

  // 9. Run now -> selesai + riwayat.
  dbl(trigEl());
  await tick(100);
  document.querySelector('.g-run').click();
  await tick(4200);
  const notice = document.getElementById('graphNotice')?.textContent || '';
  check('Run now -> notice selesai', notice.includes('selesai'), notice.slice(0, 120));
  check('badge riwayat = 1', document.getElementById('graphHistBadge')?.textContent === '1', document.getElementById('graphHistBadge')?.textContent);
  [...document.querySelectorAll('.graph-head-btns button')].find((b) => b.textContent.includes('Riwayat')).click();
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
  check('klik hapus node -> popup konfirmasi tampil', !!document.querySelector('.g-delask'), document.getElementById('graphPopupCard')?.textContent?.slice(0, 80));
  document.querySelector('.g-delask button').click();
  await tick(100);
  check('konfirmasi hapus -> node 11 -> 10', nodeCount() === 10, nodeCount());

  // 12. v83: node seragam + outline sehat + popup + topbar.
  check('semua node punya avatar + nama/job', [...document.querySelectorAll('.n8n-node')].every((el) => el.querySelector('.nrow .nava') && el.querySelector('.nrow .nname') && el.querySelector('.nrow .nsub')), '');
  check('sub-node lingkaran ikut seragam (punya .nava)', !!document.querySelector('[data-nkey="model"] .nava'), '');
  check('semua node sehat (outline hijau) saat terhubung', [...document.querySelectorAll('.n8n-node')].every((el) => el.classList.contains('ok')) && !document.querySelector('.n8n-node.bad'), [...document.querySelectorAll('.n8n-node')].map((el) => el.getAttribute('data-nkey') + ':' + [...el.classList].join('.')).join(' '));
  check('wrap Graph hanya berisi kanvas (tanpa panel fixed)', document.querySelector('.graph-wrap').children.length === 1, document.querySelector('.graph-wrap').children.length);
  check('topbar punya dropdown proyek', !!document.getElementById('graphProjSel'), '');
  check('dropdown kosong saat nol proyek (placeholder)', [...document.getElementById('graphProjSel').options].map((o) => o.value).join(',') === '', [...document.getElementById('graphProjSel').options].map((o) => o.value).join(','));
  check('zoom label pindah ke topbar', !!document.querySelector('.graph-head-btns #graphZoomLabel'), '');
  check('topbar punya tombol Hentikan', [...document.querySelectorAll('.graph-head-btns button')].some((b) => b.textContent.includes('Hentikan')), '');
  document.querySelector('[data-nkey="prime"]').click();
  await tick(100);
  check('klik node tidak membuka popup', popup().style.display === 'none', popup().style.display);
  dbl(document.querySelector('[data-nkey="prime"]'));
  await tick(100);
  check('dblclick node -> popup berisi nama + tombol tutup', popup().style.display === 'flex' && !!document.querySelector('#graphPopupCard .g-x') && panelText().includes('Prime Agent'), popup().style.display);
  document.querySelector('#graphPopupCard .g-x').click();
  await tick(100);
  check('tombol tutup popup -> popup hilang', popup().style.display === 'none', popup().style.display);
  dbl(trigEl());
  await tick(100);
  panel().querySelector('.g-check input').click();
  await tick(100);
  check('trigger jadwal nonaktif -> outline pink', document.querySelector('[data-nkey="trigger"]').classList.contains('bad'), document.querySelector('[data-nkey="trigger"]').className);
  panel().querySelector('.g-check input').click();
  await tick(100);
  check('trigger diaktifkan lagi -> outline hijau', document.querySelector('[data-nkey="trigger"]').classList.contains('ok'), '');
  document.querySelector('#graphPopupCard .g-x').click();
  await tick(100);
  dbl(document.querySelector('[data-nkey="gate"]'));
  await tick(100);
  [...panel().querySelectorAll('button')].find((b) => b.textContent === 'Hapus').click();
  await tick(100);
  [...panel().querySelectorAll('button')].find((b) => b.textContent === 'Ya, hapus').click();
  await tick(100);
  check('hapus gate -> dist + revisi jadi yatim (pink)', document.querySelector('[data-nkey="dist"]').classList.contains('bad') && document.querySelector('[data-nkey="revisi"]').classList.contains('bad'), '');
  document.querySelector('.graph-head-btns button.btn-primary').click();
  await tick(150);
  [...document.querySelectorAll('.graph-head-btns button')].find((b) => b.textContent.includes('Hentikan')).click();
  await tick(100);
  check('play lalu stop di topbar -> notice dihentikan', (document.getElementById('graphNotice')?.textContent || '').includes('dihentikan') && !document.querySelector('.n8n-node.exec'), document.getElementById('graphNotice')?.textContent);


  // 13. v84 (laporan Patria 04:01): tombol popup harus berefek nyata + terlihat.
  const nodes13 = () => [...document.querySelectorAll('.n8n-node')];
  const dbl13 = (el) => el.dispatchEvent(new dom.window.MouseEvent('dblclick', { bubbles: true }));
  const ptext13 = () => document.getElementById('graphPopupCard')?.textContent || '';
  const btn13 = (t) => [...document.querySelectorAll('#graphPopupCard button')].find((b) => b.textContent.trim() === t);
  const base13 = nodes13().length;
  dom.window.showView('home');
  await tick(100);
  document.querySelector('.agent-plus').click();
  await tick(50);
  [...document.querySelectorAll('#addMenu .plus-item')].find((el) => el.textContent.includes('New project')).click();
  await tick(100);
  const nc0 = document.getElementById('ncName');
  nc0.value = 'Proyek Uji';
  nc0.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  await tick(50);
  document.querySelectorAll('.chan-row input[type="checkbox"]').forEach((cb) => cb.click());
  await tick(50);
  document.getElementById('ncCreateBtn').click();
  await tick(100);
  dom.window.showView('graph');
  dom.window.renderGraph();
  await tick(100);
  check('dropdown berisi proyek baru', [...document.getElementById('graphProjSel').options].map((o) => o.value).join(',') === 'proyek-uji', [...document.getElementById('graphProjSel').options].map((o) => o.value).join(','));
  document.getElementById('graphProjSel').value = 'proyek-uji';
  document.getElementById('graphProjSel').dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  await tick(100);
  check('ganti proyek via dropdown -> chatProj proyek baru', (document.getElementById('chatProj')?.textContent || '') === 'Proyek Uji', document.getElementById('chatProj')?.textContent);
  dbl13(document.querySelector('[data-nkey="model"]'));
  await tick(100);
  check('popup node model terbuka', popup().style.display === 'flex' && ptext13().includes('Model'), popup().style.display);
  btn13('Duplikat').click();
  await tick(100);
  const sal13 = nodes13().find((el) => el.textContent.includes('(salinan)'));
  check('Duplikat -> node bertambah + nama (salinan) + popup mengikuti', nodes13().length === base13 + 1 && !!sal13 && ptext13().includes('(salinan)'), nodes13().length + '|' + ptext13().slice(0, 80));
  check('salinan node model yatim (pink, belum terhubung)', !!sal13 && sal13.classList.contains('bad'), sal13?.className || '');
  btn13('Kunci').click();
  await tick(100);
  check('Kunci -> judul popup bergembok + tombol jadi Buka kunci', ptext13().includes('🔒') && !!btn13('Buka kunci'), ptext13().slice(0, 80));
  btn13('Buka kunci').click();
  await tick(100);
  check('Buka kunci -> gembok hilang + tombol kembali Kunci', !ptext13().includes('🔒') && !!btn13('Kunci'), '');
  btn13('Hapus').click();
  await tick(100);
  check('Hapus -> konfirmasi tampil', !!btn13('Ya, hapus') && !!btn13('Batal'), '');
  btn13('Batal').click();
  await tick(100);
  check('Batal -> konfirmasi hilang, node tetap ada', !btn13('Ya, hapus') && nodes13().length === base13 + 1, nodes13().length);
  btn13('Hapus').click();
  await tick(100);
  btn13('Ya, hapus').click();
  await tick(100);
  check('Ya, hapus -> salinan hilang + popup tertutup', nodes13().length === base13 && popup().style.display === 'none', nodes13().length + '|' + popup().style.display);
  dbl13(document.querySelector('[data-nkey="trigger"]'));
  await tick(100);
  btn13('Duplikat').click();
  await tick(100);
  const trigCopy = nodes13().find((el) => el.textContent.includes('(salinan)'));
  const trigKey = trigCopy?.getAttribute('data-nkey');
  check('salinan trigger nonaktif (tidak dobel-jalan)', !!trigKey && dom.window.GNODES[trigKey] && dom.window.GNODES[trigKey].trig && dom.window.GNODES[trigKey].trig.active === false, trigKey + '|' + JSON.stringify(dom.window.GNODES[trigKey]?.trig));
  document.querySelector('#graphPopupCard .g-x').click();
  await tick(100);
  check('tombol x menutup popup', popup().style.display === 'none', popup().style.display);

  // 14. v86: fitur popup per logika — nama/deskripsi/kunci/hapus pada sub-node model.
  const pop14 = () => document.getElementById('graphPopup');
  const card14 = () => document.getElementById('graphPopupCard');
  const nameIn14 = () => card14().querySelector('input.g-input');
  const descIn14 = () => card14().querySelector('textarea.g-input');
  const btn14 = (t) => [...card14().querySelectorAll('button')].find((b) => b.textContent.trim() === t);
  dbl13(document.querySelector('[data-nkey="model"]'));
  await tick(100);
  check('popup model tampil + judul ikon-nama', pop14().style.display !== 'none' && (document.getElementById('graphPopupTitle')?.textContent || '').includes('Chat Model'), document.getElementById('graphPopupTitle')?.textContent);
  check('input nama berisi Chat Model', nameIn14() && nameIn14().value === 'Chat Model', nameIn14()?.value);
  nameIn14().focus();
  nameIn14().value = 'Model Uji';
  nameIn14().dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  await tick(50);
  check('rename tersimpan + judul ikut + fokus bertahan', dom.window.GNODES.model.name === 'Model Uji' && (document.getElementById('graphPopupTitle')?.textContent || '').includes('Model Uji') && document.activeElement === nameIn14(), dom.window.GNODES.model.name + '|' + document.getElementById('graphPopupTitle')?.textContent);
  descIn14().value = 'Deskripsi uji';
  descIn14().dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  await tick(50);
  check('deskripsi tersimpan + indikator tampil', dom.window.GNODES.model.desc === 'Deskripsi uji' && (document.getElementById('graphPopupSaved')?.textContent || '').length > 0, dom.window.GNODES.model.desc + '|' + document.getElementById('graphPopupSaved')?.textContent);
  btn14('Kunci').click();
  await tick(100);
  check('kunci -> input + hapus nonaktif', dom.window.GNODES.model.locked === true && nameIn14().disabled === true && descIn14().disabled === true && btn14('Hapus').disabled === true, JSON.stringify(dom.window.GNODES.model.locked) + '|' + nameIn14().disabled + '|' + btn14('Hapus').disabled);
  dom.window.graphRename('Seharusnya Gagal');
  dom.window.graphConfirmDelete();
  await tick(50);
  check('node terkunci tak bisa rename/hapus', dom.window.GNODES.model.name === 'Model Uji' && !!dom.window.GNODES.model, dom.window.GNODES.model.name);
  btn14('Duplikat').click();
  await tick(100);
  const copy14 = [...document.querySelectorAll('[data-nkey]')].find((el) => el.textContent.includes('Model Uji (salinan)'));
  const copyKey14 = copy14?.getAttribute('data-nkey');
  check('duplikat node terkunci -> salinan tak terkunci', !!copyKey14 && dom.window.GNODES[copyKey14] && dom.window.GNODES[copyKey14].locked === false, copyKey14 + '|' + JSON.stringify(dom.window.GNODES[copyKey14]?.locked));
  document.querySelector('#graphPopupCard .g-x').click();
  await tick(100);
  dbl13(document.querySelector('[data-nkey="model"]'));
  await tick(100);
  btn14('Buka kunci').click();
  await tick(100);
  check('buka kunci -> input aktif lagi', dom.window.GNODES.model.locked === false && nameIn14().disabled === false, JSON.stringify(dom.window.GNODES.model.locked));
  btn14('Hapus').click();
  await tick(100);
  btn14('Ya, hapus').click();
  await tick(100);
  check('hapus model -> node + garis putus hilang + popup tutup', !dom.window.GNODES.model && !dom.window.GEDGES.some((e) => e.t === 'model') && pop14().style.display === 'none', Object.keys(dom.window.GNODES).join(','));

  // 15. v87 (B3): + Tambah Node tanpa seleksi menempel ke node terakhir.
  const before15 = Object.keys(dom.window.GNODES).length;
  dom.window.graphClosePanel();
  await tick(50);
  dom.window.graphAddNode();
  await tick(100);
  const keys15 = Object.keys(dom.window.GNODES);
  const last15 = keys15[keys15.length - 1];
  check('tambah node tanpa seleksi -> node baru +1 + punya edge masuk', keys15.length === before15 + 1 && dom.window.GEDGES.some((e) => e.t === last15), keys15.length + '|' + last15);
  check('node baru berkelas ok', document.querySelector('[data-nkey="' + last15 + '"]')?.classList.contains('ok') === true, document.querySelector('[data-nkey="' + last15 + '"]')?.className);

  // 16. v88: migrasi bersih Graph — storage berisi dummy -> kanvas kosong + backup.
  const store16 = new Map();
  store16.set('minime.graphState', JSON.stringify({ nodes: { trigger: { name: 'Dummy', sub: '', icon: 'x', x: 1, y: 1, w: 100, kind: 'trigger', desc: '' } }, edges: [], counter: 1 }));
  store16.set('minime.graphRuns', JSON.stringify([{ at: '2026-10-29T21:01:29', kind: 'manual' }]));
  const dom16 = makeDom(store16);
  await waitFor(() => typeof dom16.window.showView === 'function', 'mount showView', 120);
  dom16.window.showView('graph');
  dom16.window.renderGraph();
  await tick(100);
  const gs16 = JSON.parse(store16.get('minime.graphState') || '{}');
  check('migrasi v88 -> kanvas kosong', dom16.window.document.querySelectorAll('#graphNodes .n8n-node').length === 0 && Object.keys(gs16.nodes || {}).length === 0, dom16.window.document.querySelectorAll('#graphNodes .n8n-node').length + '|' + JSON.stringify(gs16.nodes));
  check('migrasi v88 -> backup + flag + riwayat kosong', !!store16.get('minime.graphState.pre-v88') && !!store16.get('minime.graphRuns.pre-v88') && store16.get('minime.graphRuns') === '[]' && store16.get('minime.cleaned-graph-v88') === '1', store16.get('minime.graphRuns'));

  // 17. v89 (M1): drag tidak rebuild DOM — elemen node sama selama mousemove.
  const primeEl17 = document.querySelector('[data-nkey="prime"]');
  primeEl17.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true, clientX: 100, clientY: 100 }));
  await tick(50);
  document.dispatchEvent(new dom.window.MouseEvent('mousemove', { bubbles: true, clientX: 120, clientY: 120 }));
  await tick(50);
  check('drag mousemove -> elemen node sama (tanpa rebuild)', document.querySelector('[data-nkey="prime"]') === primeEl17, '');
  document.dispatchEvent(new dom.window.MouseEvent('mouseup', { bubbles: true }));
  await tick(50);
  check('drag mouseup -> node tetap ada', !!document.querySelector('[data-nkey="prime"]'), '');

  // 18. v90: toolbar bawah hilang + kanvas kosong -> tombol + tengah memanggil Prime.
  check('toolbar bawah Graph tidak ada', !document.querySelector('.graph-toolbar'), document.querySelector('.graph-toolbar')?.outerHTML?.slice(0, 100) || '');
  Object.keys(dom.window.GNODES).forEach((k) => delete dom.window.GNODES[k]);
  dom.window.GEDGES.length = 0;
  dom.window.renderGraph();
  await tick(50);
  check('kanvas kosong -> tombol + tengah tampil', document.getElementById('graphEmptyPlus')?.style.display === 'flex', document.getElementById('graphEmptyPlus')?.style.display || 'hilang');
  document.getElementById('graphEmptyPlus').click();
  await tick(100);
  const primeFirst = Object.values(dom.window.GNODES).find((n) => n.kind === 'prime');
  check('klik + -> node Prime pertama dibuat di tengah', !!primeFirst && primeFirst.x === 45 && primeFirst.y === 45, JSON.stringify(primeFirst || null));
  check('setelah + diklik -> tombol + hilang', document.getElementById('graphEmptyPlus')?.style.display === 'none', document.getElementById('graphEmptyPlus')?.style.display || '');

} catch (e) {
  // eslint-disable-next-line no-console
  console.log('FAIL rig-graph exception :: ' + (e && e.stack ? e.stack : e));
  failed++;
}

// eslint-disable-next-line no-console
console.log(failed === 0 ? 'RIG-GRAPH ALL PASSED' : 'RIG-GRAPH FAILED');
process.exit(failed === 0 ? 0 : 1);
