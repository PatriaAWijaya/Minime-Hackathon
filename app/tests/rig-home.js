// Rig Home (jsdom, test-only): membuktikan halaman Home gaya lampiran + menu +
// ala OpenBot:
//  1. Kolom agen: kotak Search ada + filter nama bekerja.
//  2. Baris agen terpilih (.sel) + klik baris mengganti agen + panel detail.
//  3. Panel detail: seksi Brain/Knows/Does/Rules + baris Publish agent,
//     Permissions, Folders, Notifications (toggle tersimpan), Advanced.
//  4. Toggle notifikasi tersimpan + default ON.
//  5. Baris Usage menampilkan angka nyata (bukan "—") + klik -> Billing.
//  6. Ubah nama agen di panel detail -> daftar agen ikut berubah.
//  7. Menu + berisi persis New agent / New project (Section dihapus v92).
//  8. New agent: picker kartu -> Buat agen baru -> isi nama -> Create -> muncul + terpilih.
//  9. New project: nama + pilih agen -> Create -> grup baru + graph project.
//  11. Persistensi: DOM baru dengan store yang sama menampilkan agen,
//      channel buatan di atas (bukti localStorage).
//  12. v92: picker Aktifkan + DnD + Prime dikecualikan dari project.
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

try {
  const dom = makeDom(store);
  const { document } = dom.window;
  await waitFor(() => typeof dom.window.showView === 'function', 'mount showView', 120);
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
  document.querySelectorAll('.chan-list .pick-card input[type="checkbox"]').forEach((cb) => cb.click());
  await tick(50);
  document.getElementById('ncCreateBtn').click();
  await tick(100);

  // 1. Kotak Search + filter nama.
  check('kolom agen: kotak Search ada', !!document.getElementById('navSearch'), '');
  const rows = () => [...document.querySelectorAll('#agentList .agent')].filter((el) => el.style.display !== 'none');
  check('daftar agen tampil (>=6 baris)', rows().length >= 6, rows().length);
  check('v92: baris Prime tidak tampil (Prime orkestrator, bukan anggota)', ![...document.querySelectorAll('#agentList .agent')].some((el) => el.textContent.includes('Prime Agent')), '');
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
  const menuItems = [...document.querySelectorAll('#addMenu .plus-item')];
  check('menu + terbuka berisi New agent', menuText.includes('New agent'), menuText);
  check('menu + terbuka berisi New project', menuText.includes('New project'), menuText);
  check('menu + v92: New section DIHAPUS (hanya 2 item kartu)', menuItems.length === 2 && !menuText.includes('New section'), menuItems.length + ' :: ' + menuText);

  // 8. New agent: picker kartu -> Buat agen baru -> isi nama -> Create -> muncul + terpilih.
  [...document.querySelectorAll('#addMenu .plus-item')].find((el) => el.textContent.includes('New agent')).click();
  await tick(100);
  check('New agent -> picker kartu tampil', !!document.querySelector('.pick-card'), '');
  check('New agent -> picker berisi tombol Buat agen baru', !!document.querySelector('[data-act="pick-new"]'), '');
  document.querySelector('[data-act="pick-new"]').click();
  await tick(100);
  check('Buat agen baru -> form tampil di tengah (kolom agen tetap terlihat)', !!document.querySelector('#view-newagent.active') && !document.querySelector('.app').classList.contains('no-nav'), '');
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
  document.querySelector('.chan-list .pick-card input[type="checkbox"]').click();
  await tick(50);
  document.getElementById('ncCreateBtn').click();
  await tick(100);
  check('Create channel -> grup Channel Uji muncul di daftar', [...document.querySelectorAll('#agentList .group')].some((el) => el.textContent.includes('Channel Uji')), document.getElementById('agentList').textContent.slice(0, 200));
  const pidUji = Object.keys(dom.window.PROJECTS).find((p) => dom.window.PROJECTS[p].name === 'Channel Uji');
  check('Create channel -> graph project berisi node Prime + agen', Object.values(dom.window.GNODES).some((n) => n.proj === pidUji && n.agent === 'prime') && Object.values(dom.window.GNODES).some((n) => n.proj === pidUji && n.agent && n.agent !== 'prime'), pidUji);

  // 11. Persistensi: DOM baru dengan store yang sama.
  const dom2 = makeDom(store);
  await waitFor(() => typeof dom2.window.showView === 'function', 'mount showView', 120);
  dom2.window.renderAgents();
  await tick(100);
  const list2 = dom2.window.document.getElementById('agentList').textContent;
  check('persistensi: Agen Uji ada setelah muat ulang', list2.includes('Agen Uji'), list2.slice(0, 200));
  check('persistensi: Channel Uji ada setelah muat ulang', list2.includes('Channel Uji'), '');
  check('persistensi: nama Riset Baru bertahan', list2.includes('Riset Baru'), '');


  // 12. v92: picker Aktifkan + DnD + Prime dikecualikan.
  dom.window.PROJECTS['pk2'] = { name: 'P DnD', agents: [], chat: [], kanban: [] };
  dom.window.switchProject('pk2');
  await tick(100);
  document.querySelector('.agent-plus').click();
  await tick(50);
  [...document.querySelectorAll('#addMenu .plus-item')].find((el) => el.textContent.includes('New agent')).click();
  await tick(100);
  check('picker agen tampil (kartu)', !!document.querySelector('.pick-card'), '');
  const actBtn = document.querySelector('[data-act="pick-activate"]');
  check('picker: ada tombol Aktifkan', !!actBtn, '');
  const actKey = actBtn?.getAttribute('data-key');
  actBtn.click();
  await tick(100);
  check('Aktifkan -> agen masuk project pk2', (dom.window.PROJECTS['pk2'].agents || []).some((a) => a.key === actKey), JSON.stringify(dom.window.PROJECTS['pk2'].agents));
  check('Aktifkan -> node graph project pk2 ada', Object.values(dom.window.GNODES).some((n) => n.proj === 'pk2' && n.agent === actKey), '');
  check('Aktifkan -> tombol jadi Aktif', actBtn.disabled && actBtn.textContent.includes('Aktif'), actBtn.textContent);
  const otherKey = Object.keys(dom.window.AGENTS).find((k) => k !== 'prime' && k !== actKey);
  const dropped = dom.window.agentDropToProject('pk2', otherKey);
  check('DnD -> agen lain masuk pk2', dropped && dom.window.PROJECTS['pk2'].agents.some((a) => a.key === otherKey), '');
  check('DnD -> node graph agen lain ada', Object.values(dom.window.GNODES).some((n) => n.proj === 'pk2' && n.agent === otherKey), '');
  check('DnD -> Prime DITOLAK', dom.window.agentDropToProject('pk2', 'prime') === false && !dom.window.PROJECTS['pk2'].agents.some((a) => a.key === 'prime'), '');
  check('Prime tidak tampil di list agen', ![...document.querySelectorAll('#agentList .agent')].some((el) => el.textContent.includes('Prime Agent')), '');

} catch (e) {
  // eslint-disable-next-line no-console
  console.log('FAIL rig-home exception :: ' + (e && e.stack ? e.stack : e));
  failed++;
}

// eslint-disable-next-line no-console
console.log(failed === 0 ? 'RIG-HOME ALL PASSED' : 'RIG-HOME FAILED');
process.exit(failed === 0 ? 0 : 1);
