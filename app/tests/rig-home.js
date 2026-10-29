// Rig Home (jsdom, test-only): membuktikan halaman Home gaya lampiran + menu +
// ala OpenBot:
//  1. Kolom agen: kotak Search ada + filter nama bekerja.
//  2. Baris agen terpilih (.sel) + klik baris mengganti agen + panel detail.
//  3. Panel detail: seksi Brain/Knows/Does/Rules + baris Publish agent,
//     Permissions, Folders, Notifications (toggle tersimpan), Advanced.
//  4. Toggle notifikasi tersimpan + default ON.
//  5. Baris Usage menampilkan angka nyata (bukan "—") + klik -> Billing.
//  6. Ubah nama agen di panel detail -> daftar agen ikut berubah.
//  7. Menu + berisi persis New agent / New project / New section.
//  8. New agent: isi nama -> Create -> agen muncul di daftar + terpilih.
//  9. New project: nama + pilih agen -> Create -> grup baru muncul.
//  10. New section: input inline + Enter -> grup baru muncul.
//  11. Persistensi: DOM baru dengan store yang sama menampilkan agen,
//      channel, dan section buatan di atas (bukti localStorage).
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

try {
  const dom = makeDom(store);
  const { document } = dom.window;
  await tick(500);
  dom.window.showView('home');
  dom.window.renderAgents();
  dom.window.renderDetail();
  await tick(100);

  // 0. v84: mulai nol -> buat proyek uji berisi semua agen roster.
  document.querySelector('.agent-plus').click();
  await tick(50);
  [...document.querySelectorAll('#addMenu .plus-item')].find((el) => el.textContent.includes('New project')).click();
  await tick(100);
  const ncName0 = document.getElementById('ncName');
  ncName0.value = 'Proyek Uji';
  ncName0.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  await tick(50);
  document.querySelectorAll('.chan-row input[type="checkbox"]').forEach((cb) => cb.click());
  await tick(50);
  document.getElementById('ncCreateBtn').click();
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

  // 7. Menu + berisi persis 3 item.
  document.querySelector('.agent-plus').click();
  await tick(100);
  const menuText = document.getElementById('addMenu')?.textContent || '';
  check('menu + terbuka berisi New agent', menuText.includes('New agent'), menuText);
  check('menu + terbuka berisi New project', menuText.includes('New project'), menuText);
  check('menu + terbuka berisi New section', menuText.includes('New section'), menuText);

  // 8. New agent: isi nama -> Create -> muncul + terpilih.
  [...document.querySelectorAll('#addMenu .plus-item')].find((el) => el.textContent.includes('New agent')).click();
  await tick(100);
  check('New agent -> form tampil di tengah (kolom agen tetap terlihat)', !!document.querySelector('#view-newagent.active') && !document.querySelector('.app').classList.contains('no-nav'), '');
  check('form New agent: warna + bentuk + saran tampil', !!document.querySelector('.na-dot') && !!document.querySelector('.na-shape') && !!document.querySelector('.na-sug-card'), '');
  document.querySelector('.na-sug-card').click();
  await tick(100);
  check('klik saran mengisi nama', document.getElementById('naName').value === 'Market Research', document.getElementById('naName').value);
  const naName = document.getElementById('naName');
  naName.value = 'Agen Uji';
  naName.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  await tick(50);
  check('tombol Create aktif setelah nama diisi', !document.getElementById('naCreateBtn').disabled, '');
  document.getElementById('naCreateBtn').click();
  await tick(100);
  check('Create agent -> daftar menampilkan Agen Uji', [...document.querySelectorAll('#agentList .agent')].some((el) => el.textContent.includes('Agen Uji')), '');
  check('Create agent -> kembali ke Home + agen terpilih', !!document.querySelector('#view-home.active') && !!document.querySelector('#agentList .agent.sel'), '');

  // 9. New project: nama + pilih agen -> grup baru muncul.
  document.querySelector('.agent-plus').click();
  await tick(50);
  [...document.querySelectorAll('#addMenu .plus-item')].find((el) => el.textContent.includes('New project')).click();
  await tick(100);
  check('dialog New project tampil', !!document.querySelector('.chan-card'), '');
  const ncName = document.getElementById('ncName');
  ncName.value = 'Channel Uji';
  ncName.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  await tick(50);
  check('tombol Create channel aktif setelah nama diisi', !document.getElementById('ncCreateBtn').disabled, '');
  document.querySelector('.chan-row input[type="checkbox"]').click();
  await tick(50);
  document.getElementById('ncCreateBtn').click();
  await tick(100);
  check('Create channel -> grup Channel Uji muncul di daftar', [...document.querySelectorAll('#agentList .group')].some((el) => el.textContent.includes('Channel Uji')), document.getElementById('agentList').textContent.slice(0, 200));

  // 10. New section: input inline + Enter -> grup baru muncul.
  document.querySelector('.agent-plus').click();
  await tick(50);
  [...document.querySelectorAll('#addMenu .plus-item')].find((el) => el.textContent.includes('New section')).click();
  await tick(100);
  check('New section -> baris input inline muncul', !!document.getElementById('nsInput'), '');
  const nsInput = document.getElementById('nsInput');
  nsInput.value = 'Section Uji';
  nsInput.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await tick(100);
  check('Enter -> grup Section Uji muncul di daftar', [...document.querySelectorAll('#agentList .group')].some((el) => el.textContent.includes('Section Uji')), '');

  // 11. Persistensi: DOM baru dengan store yang sama.
  const dom2 = makeDom(store);
  await tick(500);
  dom2.window.renderAgents();
  await tick(100);
  const list2 = dom2.window.document.getElementById('agentList').textContent;
  check('persistensi: Agen Uji ada setelah muat ulang', list2.includes('Agen Uji'), list2.slice(0, 200));
  check('persistensi: Channel Uji ada setelah muat ulang', list2.includes('Channel Uji'), '');
  check('persistensi: Section Uji ada setelah muat ulang', list2.includes('Section Uji'), '');
  check('persistensi: nama Riset Baru bertahan', list2.includes('Riset Baru'), '');

} catch (e) {
  // eslint-disable-next-line no-console
  console.log('FAIL rig-home exception :: ' + (e && e.stack ? e.stack : e));
  failed++;
}

// eslint-disable-next-line no-console
console.log(failed === 0 ? 'RIG-HOME ALL PASSED' : 'RIG-HOME FAILED');
process.exit(failed === 0 ? 0 : 1);
