// Rig Home (jsdom, test-only): membuktikan halaman Home gaya lampiran:
//  1. Kolom agen: kotak Search ada + filter nama bekerja.
//  2. Baris agen terpilih (.sel) + klik baris mengganti agen + panel detail.
//  3. Panel detail: seksi Brain/Knows/Does/Rules + baris Publish agent,
//     Permissions, Folders, Notifications (toggle tersimpan), Advanced.
//  4. Baris Usage menampilkan angka nyata (bukan "—") + klik -> Billing.
//  5. Ubah nama agen di panel detail -> daftar agen ikut berubah.
// Jalankan: npm run rig:home (butuh dist ter-build + jsdom devDependency).
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

const log = [];
const store = new Map();
async function invokeStub(cmd) {
  log.push('invoke:' + cmd);
  throw new Error('unexpected invoke ' + cmd);
}
async function fetchStub() {
  return { ok: false, status: 0, headers: { get: () => '' }, json: async () => ({}), text: async () => '' };
}

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

const { document } = dom.window;
const tick = (ms = 50) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
function check(name, ok, extra = '') {
  // eslint-disable-next-line no-console
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok || !extra ? '' : ' :: ' + String(extra).slice(0, 300)));
  if (!ok) failed++;
}

try {
  await tick(500);
  dom.window.showView('home');
  dom.window.renderAgents();
  dom.window.renderDetail();
  await tick(100);

  // 1. Kotak Search + filter nama.
  check('kolom agen: kotak Search ada', !!document.getElementById('navSearch'), '');
  const rows = () => [...document.querySelectorAll('#agentList .agent')].filter((el) => el.style.display !== 'none');
  check('daftar agen tampil (>=6 baris)', rows().length >= 6, rows().length);
  check('baris agen terpilih (.sel) ada', !!document.querySelector('#agentList .agent.sel'), '');
  const search = document.getElementById('navSearch');
  search.value = 'strategi';
  search.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  await tick(100);
  check('filter Search "strategi" menyisakan baris Strategi saja', rows().length === 1 && rows()[0].textContent.includes('Strategi'), rows().map((el) => el.textContent).join('|'));
  search.value = '';
  search.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  await tick(100);
  check('filter dikosongkan -> daftar kembali', rows().length >= 6, rows().length);

  // 2. Klik baris Riset -> panel detail menampilkan Riset.
  const risetRow = [...document.querySelectorAll('#agentList .agent')].find((el) => el.textContent.includes('Riset'));
  risetRow.click();
  await tick(100);
  const detailText = document.getElementById('detailBody')?.textContent || '';
  check('klik baris Riset -> panel detail Riset', detailText.includes('Riset') && !!document.querySelector('#agentList .agent.sel'), detailText.slice(0, 120));

  // 3. Seksi + baris baru panel detail.
  for (const sec of ['Brain', 'Knows', 'Does', 'Rules']) {
    check('panel detail: seksi ' + sec, detailText.includes(sec), '');
  }
  for (const row of ['Publish agent', 'Permissions', 'Folders', 'Notifications', 'Advanced']) {
    check('panel detail: baris ' + row, detailText.includes(row), '');
  }

  // 4. Toggle notifikasi tersimpan + default ON.
  const noti = document.getElementById('homeNotify');
  check('toggle Notifications default ON', !!noti && noti.checked, '');
  noti.click();
  await tick(50);
  check('toggle Notifications OFF tersimpan', store.get('minime.notify') === '0', store.get('minime.notify'));
  document.getElementById('homeNotify').click();
  await tick(50);
  check('toggle Notifications ON tersimpan', store.get('minime.notify') === '1', store.get('minime.notify'));

  // 5. Usage angka nyata + klik -> Billing.
  check('baris Usage menampilkan angka nyata', /calls/.test(detailText), detailText.slice(detailText.indexOf('Usage'), detailText.indexOf('Usage') + 60));
  const usageRow = [...document.querySelectorAll('#detailBody .d-row')].find((el) => el.textContent.includes('Usage'));
  usageRow.click();
  await tick(100);
  check('klik Usage -> pindah ke Billing', !!document.querySelector('#view-billing.active'), '');
  dom.window.showView('home');
  dom.window.renderDetail();
  await tick(100);

  // 6. Ubah nama di panel detail -> daftar ikut berubah.
  const nameInput = document.querySelector('#detailBody input.d-field');
  nameInput.value = 'Riset Baru';
  nameInput.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  await tick(100);
  check('ubah nama agen -> daftar menampilkan nama baru', [...document.querySelectorAll('#agentList .agent')].some((el) => el.textContent.includes('Riset Baru')), '');

} catch (e) {
  // eslint-disable-next-line no-console
  console.log('FAIL rig-home exception :: ' + (e && e.stack ? e.stack : e));
  failed++;
}

// eslint-disable-next-line no-console
console.log(failed === 0 ? 'RIG-HOME ALL PASSED' : 'RIG-HOME FAILED');
process.exit(failed === 0 ? 0 : 1);
