// Rig Audit v78 (jsdom, test-only): membuktikan perbaikan audit menu:
//  1. Chat: penghitung karakter + lampiran Gambar ikut terkirim + chip hilang.
//  2. Search: klik hasil -> pindah Home + pesan tersorot.
//  3. Kanban: dialog edit (simpan), Approve (Butuh Approval -> Selesai),
//     komentar, hapus, kolom baru persisten, tim tersimpan.
//  4. Detail: picker Model tersimpan, checkbox skill tersimpan,
//     catatan memori + file agen tersimpan.
//  5. Graph: Hentikan simulasi + panel garis + hapus garis.
//  6. Settings: Simpan menulis kunci + Periksa Ollama (ok & gagal).
// Jalankan: npm run rig:audit (butuh dist ter-build + jsdom devDependency).
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
const btn = (root, text) => [...root.querySelectorAll('button')].find((b) => b.textContent === text);

try {
  const dom = makeDom(store);
  const { document } = dom.window;
  const W = dom.window;
  for (let i = 0; i < 60 && typeof W.showView !== 'function'; i++) await tick(50);

  // 0. v84: mulai nol -> buat proyek uji berisi semua agen roster.
  W.showView('home');
  await tick(100);
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

  // 1. Penghitung karakter chat.
  const chatInput = document.getElementById('chatInput');
  chatInput.value = 'halo';
  chatInput.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  await tick(50);
  check('chat counter: halo -> 4', document.getElementById('chatCount')?.textContent === '4', document.getElementById('chatCount')?.textContent);

  // 1b. Lampiran Gambar: picker -> chip -> ikut terkirim -> chip hilang.
  W.waAttach('Gambar');
  await tick(50);
  const pickers = [...document.querySelectorAll('input[type="file"]')];
  const picker = pickers[pickers.length - 1];
  check('picker Gambar dibuat', !!picker, pickers.length);
  const file = new dom.window.File(['x'], 'foto.png', { type: 'image/png' });
  Object.defineProperty(picker, 'files', { value: [file] });
  picker.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  await tick(100);
  check('chip foto.png tampil', (document.getElementById('waNote')?.textContent || '').includes('foto.png'), document.getElementById('waNote')?.textContent);
  chatInput.value = 'pesan uji';
  W.sendChat();
  await tick(600);
  const chatText = document.getElementById('chatBox')?.textContent || '';
  check('pesan terkirim memuat nama lampiran', chatText.includes('pesan uji') && chatText.includes('foto.png'), chatText.slice(0, 200));
  check('chip hilang setelah kirim', !(document.getElementById('waNote')?.textContent || '').includes('foto.png'), document.getElementById('waNote')?.textContent);

  // 2. Search: klik hasil -> Home + sorot.
  W.postChat('user', 'Patria', '#374151', 'pesan rahasia zebra');
  W.showView('search');
  document.getElementById('searchInput').value = 'zebra';
  W.doSearch();
  await tick(50);
  const hit = document.querySelector('.search-hit');
  check('hasil search zebra ada', !!hit, '');
  hit.click();
  await tick(100);
  const hl = document.querySelector('#chatBox .msg.hl');
  check('klik hasil -> pesan tersorot di Home', !!hl && (hl.textContent || '').includes('zebra'), hl?.textContent);

  // 3. Kanban: dialog, Approve, edit, komentar, hapus, kolom, tim.
  W.showView('kanban');
  W.renderKanban();
  await tick(50);
  const pk0 = Object.keys(W.PROJECTS)[0];
  W.PROJECTS[pk0].kanban.push({ t: 'Kartu Approval', a: 'Prime Agent', c: 2 }, { t: 'Kartu Biasa', a: 'Riset', c: 0 });
  W.renderKanban();
  await tick(50);
  const projKey = Object.keys(W.PROJECTS).find((k) => W.PROJECTS[k].kanban && W.PROJECTS[k].kanban.length);
  const cards = () => W.PROJECTS[projKey].kanban;
  const apprIdx = cards().findIndex((c) => c.c === 2);
  check('kartu Butuh Approval ada', apprIdx >= 0, cards().map((c) => c.c).join(','));
  if (apprIdx >= 0) {
    W.kbOpen(apprIdx);
    await tick(50);
    check('dialog kartu tampil', (document.getElementById('kbDlg')?.textContent || '').includes('Edit kartu'), '');
    const apprBtn = btn(document.getElementById('kbDlg'), 'Approve');
    check('tombol Approve tampil di kolom Butuh Approval', !!apprBtn, '');
    apprBtn.click();
    await tick(50);
    check('Approve -> kartu pindah ke Selesai (c=4)', cards()[apprIdx].c === 4, cards()[apprIdx].c);
  }
  const editIdx = 0;
  W.kbOpen(editIdx);
  await tick(50);
  document.getElementById('kbDlgTitle').value = 'Kartu Uji Audit';
  btn(document.getElementById('kbDlg'), 'Simpan').click();
  await tick(50);
  check('edit judul kartu tersimpan', cards()[editIdx].t === 'Kartu Uji Audit' && (store.get('minime.kanban') || '').includes('Kartu Uji Audit'), cards()[editIdx].t);
  W.kbOpen(editIdx);
  await tick(50);
  document.getElementById('kbDlgComment').value = 'komentar uji';
  btn(document.getElementById('kbDlg'), 'Kirim').click();
  await tick(50);
  check('komentar tersimpan + hitungan 1', (cards()[editIdx].comments || []).length === 1, JSON.stringify(cards()[editIdx].comments));
  const beforeLen = cards().length;
  W.kbOpen(editIdx);
  await tick(50);
  btn(document.getElementById('kbDlg'), 'Hapus kartu').click();
  await tick(50);
  const delConfirm = document.querySelector('#kbDlg .g-delask button');
  check('konfirmasi hapus tampil', !!delConfirm, '');
  delConfirm.click();
  await tick(50);
  check('hapus kartu -> jumlah berkurang', cards().length === beforeLen - 1, cards().length);
  W.addKanbanList();
  await tick(50);
  const dom2 = makeDom(store);
  for (let i = 0; i < 60 && typeof dom2.window.showView !== 'function'; i++) await tick(50);
  dom2.window.showView('kanban');
  dom2.window.renderKanban();
  await tick(100);
  check('kolom baru bertahan setelah muat ulang', (dom2.window.document.getElementById('kanbanBox')?.textContent || '').includes('List Baru'), '');

  // 3b. v91: Kanban mode Semua project.
  W.PROJECTS['pk1'] = { name: 'Proyek Kedua', agents: [], chat: [], kanban: [{ t: 'Kartu Proyek Kedua', a: 'Riset', c: 0 }] };
  W.kbSetProj('all');
  await tick(100);
  const kbAllText = document.getElementById('kanbanBox')?.textContent || '';
  check('mode Semua -> kartu dua project tampil', kbAllText.includes('Kartu Biasa') && kbAllText.includes('Kartu Proyek Kedua'), kbAllText.slice(0, 200));
  W.kbSetProj('cur');
  await tick(100);
  W.kbTeamOpen();
  await tick(50);
  const teamBoxes = [...document.querySelectorAll('[data-teamkey]')];
  teamBoxes.forEach((b) => { b.checked = false; });
  if (teamBoxes[0]) teamBoxes[0].checked = true;
  btn(document.getElementById('kbDlg'), 'Simpan tim').click();
  await tick(50);
  check('tim tersimpan + header menampilkan anggota', (document.getElementById('kbTeamNote')?.textContent || '').length > 0, document.getElementById('kbTeamNote')?.textContent);

  // 3b. v85 (audit B1/M1): edit kartu + tim bertahan setelah muat ulang.
  W.kbOpen(0);
  await tick(50);
  document.getElementById('kbDlgTitle').value = 'Kartu Lestari';
  btn(document.getElementById('kbDlg'), 'Simpan').click();
  await tick(50);
  const dom3 = makeDom(store);
  for (let i = 0; i < 60 && typeof dom3.window.showView !== 'function'; i++) await tick(50);
  dom3.window.showView('kanban');
  dom3.window.renderKanban();
  await tick(100);
  check('edit kartu bertahan setelah muat ulang (B1)', (dom3.window.document.getElementById('kanbanBox')?.textContent || '').includes('Kartu Lestari'), dom3.window.document.getElementById('kanbanBox')?.textContent?.slice(0, 200));
  check('tim bertahan setelah muat ulang (M1)', (dom3.window.document.getElementById('kbTeamNote')?.textContent || '').length > 0, dom3.window.document.getElementById('kbTeamNote')?.textContent);

  // 4. Detail: Model, skill, memori, file.
  W.selectAgent('riset');
  await tick(50);
  const modelRow = [...document.querySelectorAll('#detailBody .d-row')].find((r) => (r.textContent || '').includes('Model'));
  check('baris Model ada', !!modelRow, '');
  modelRow.click();
  await tick(50);
  const modelSel = document.querySelector('#detailBody select');
  check('klik Model -> select tampil', !!modelSel, '');
  const gemOpt = [...modelSel.options].find((o) => o.value.includes('gemini'));
  modelSel.value = gemOpt.value;
  modelSel.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  await tick(50);
  check('Model tersimpan (gemini + homeState)', (W.AGENTS.riset.model || '').includes('gemini') && (store.get('minime.homeState') || '').includes('gemini'), W.AGENTS.riset.model);
  const skillBox = document.querySelector('#detailBody .skillrow input');
  if (skillBox) {
    skillBox.checked = false;
    skillBox.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    await tick(50);
    check('checkbox skill tersimpan (skillsOff)', (store.get('minime.homeState') || '').includes('skillsOff'), '');
  } else {
    check('checkbox skill ada', false, 'tidak ada skillrow');
  }
  const memRow = [...document.querySelectorAll('#detailBody .d-row')].find((r) => (r.textContent || '').includes('Memories'));
  memRow.click();
  await tick(50);
  const memTa = document.getElementById('memNew');
  check('editor memori tampil', !!memTa, '');
  memTa.value = 'catatan uji';
  btn(document.getElementById('detailBody'), 'Simpan catatan').click();
  await tick(50);
  check('catatan memori tersimpan', (store.get('minime.agentMemories') || '').includes('catatan uji'), '');
  W.detailFilesAddFiles([{ name: 'a.pdf', size: 123 }]);
  await tick(50);
  check('file agen tersimpan + hitungan 1 file', (store.get('minime.agentFiles') || '').includes('a.pdf') && (document.getElementById('detailBody')?.textContent || '').includes('1 file'), document.getElementById('detailBody')?.textContent.slice(0, 200));

  // 5. Graph: Hentikan + garis.
  W.showView('graph');
  W.renderGraph();
  await tick(50);
  W.runGraphSim();
  await tick(150);
  W.graphStopSim();
  await tick(50);
  check('Hentikan -> notice dihentikan + tanpa .exec', (document.getElementById('graphNotice')?.textContent || '').includes('dihentikan') && !document.querySelector('.n8n-node.exec'), document.getElementById('graphNotice')?.textContent);
  const edgesBefore = document.querySelectorAll('#graphEdges path').length;
  W.graphSelectEdge('gate', 'dist');
  await tick(50);
  check('popup garis tampil', (document.getElementById('graphPopupCard')?.textContent || '').includes('Pengaturan garis'), document.getElementById('graphPopupCard')?.textContent.slice(0, 120));
  btn(document.getElementById('graphPopupCard'), 'Hapus garis').click();
  await tick(50);
  const edgeDel = document.querySelector('#graphPopupCard .g-delask button');
  check('konfirmasi hapus garis tampil', !!edgeDel, '');
  edgeDel.click();
  await tick(50);
  check('hapus garis -> jumlah edge berkurang', document.querySelectorAll('#graphEdges path').length === edgesBefore - 1, document.querySelectorAll('#graphEdges path').length + ' vs ' + edgesBefore);

  // 6. Settings v87 (B4): tombol Simpan bersama DIHAPUS — kunci hanya lewat
  // Hubungkan per-kunci (diuji rig-settings); Ollama tetap.
  dom.window.showView('settings');
  await tick(100);
  check('tombol Simpan bersama + setNotice hilang', ![...document.querySelectorAll('button')].some((b) => (b.textContent || '').includes('Simpan Pengaturan')) && !document.getElementById('setNotice'), '');
  check('tombol Hubungkan per-kunci hadir', [...document.querySelectorAll('button')].some((b) => (b.textContent || '').includes('Hubungkan API')), '');
  dom.window.fetch = async () => ({ ok: true, json: async () => ({ models: [{ name: 'a' }, { name: 'b' }] }) });
  W.ollamaCheck();
  await tick(100);
  check('Ollama ok -> nota 2 model', (document.getElementById('ollamaNote')?.textContent || '').includes('2 model'), document.getElementById('ollamaNote')?.textContent);
  dom.window.fetch = async () => { throw new Error('down'); };
  W.ollamaCheck();
  await tick(100);
  check('Ollama gagal -> nota tidak terjangkau', (document.getElementById('ollamaNote')?.textContent || '').includes('tidak terjangkau'), document.getElementById('ollamaNote')?.textContent);

  // 7. Campaign operabel v79: tambah lead, ubah stage, salin draf, follow-up.
  dom.window.showView('campaign');
  dom.window.renderCampaign();
  await tick(100);
  document.getElementById('cpLeadName').value = 'Rig Lead';
  document.getElementById('cpLeadContact').value = '0812-rig';
  document.getElementById('cpLeadChannel').value = 'WhatsApp';
  document.getElementById('cpLeadStage').value = 'Prospek';
  W.cpAddLead();
  await tick(100);
  var added = JSON.parse(store.get('minime.crmAdded') || '[]');
  check('tambah lead -> minime.crmAdded 1 item M1', added.length === 1 && added[0].id === 'M1' && added[0].name === 'Rig Lead', JSON.stringify(added));
  check('lead manual tampil di daftar + CRM', !!document.querySelector('[data-cp-deladded="M1"]') && !!document.querySelector('[data-cp-lead="M1"]'), '');
  document.querySelector('[data-cp-lead="M1"]').click();
  await tick(100);
  check('klik baris CRM -> dialog detail lead', !!document.getElementById('cpDlgStage'), '');
  document.getElementById('cpDlgStage').value = 'Prioritas';
  W.cpLeadSaveStage();
  await tick(100);
  added = JSON.parse(store.get('minime.crmAdded') || '[]');
  check('ubah stage lead manual tersimpan', added[0].stage === 'Prioritas', JSON.stringify(added));
  check('dialog tertutup setelah simpan', document.getElementById('cpDlg').innerHTML === '', '');
  document.querySelector('[data-cp-lead="L01"]').click();
  await tick(100);
  document.getElementById('cpDlgStage').value = 'Dingin';
  W.cpLeadSaveStage();
  await tick(100);
  var stages = JSON.parse(store.get('minime.crmStages') || '{}');
  check('ubah stage lead snapshot -> override minime.crmStages', stages.L01 === 'Dingin', JSON.stringify(stages));
  var copyBtn = document.querySelector('[data-cp-copy="0"]');
  W.cpCopyDraft(0);
  await tick(100);
  check('salin draf -> tombol jadi Tersalin', (copyBtn.textContent || '').includes('Tersalin'), copyBtn.textContent);
  document.getElementById('cpFuLead').value = 'M1';
  document.getElementById('cpFuText').value = 'Hubungi Rig Lead';
  W.cpFuAdd();
  await tick(100);
  var fus = JSON.parse(store.get('minime.followups') || '[]');
  check('tambah follow-up tersimpan', fus.length === 1 && fus[0].text === 'Hubungi Rig Lead', JSON.stringify(fus));
  W.cpFuToggle(fus[0].id);
  await tick(100);
  fus = JSON.parse(store.get('minime.followups') || '[]');
  check('centang follow-up -> done true', fus[0].done === true, JSON.stringify(fus));
  W.cpFuDel(fus[0].id);
  await tick(100);
  fus = JSON.parse(store.get('minime.followups') || '[]');
  check('hapus follow-up -> kosong', fus.length === 0, JSON.stringify(fus));

  // 8. Planner v79: chip terkirim -> detail read-only + postId (bukan komposer).
  store.set('minime.social', JSON.stringify({ linkedin: { accessToken: 'rig-token', expiresAt: Date.now() + 3600000 } }));
  store.set('minime.socialQueue', JSON.stringify([{ id: 'q-sent-1', platform: 'linkedin', text: 'Postingan terkirim rig', imageB64: '', imageMime: '', imageFile: '', imageUrl: '', scheduledAt: Date.now(), status: 'sent', error: '', repeat: '', postId: 'post-123' }]));
  dom.window.showView('planner');
  dom.window.renderPlanner();
  await tick(100);
  var sentChip = document.querySelector('[data-soc-view="q-sent-1"]');
  check('chip terkirim punya data-soc-view', !!sentChip, '');
  sentChip.click();
  await tick(100);
  var socDlg = document.getElementById('socItemDlg').innerHTML || '';
  check('klik chip terkirim -> detail berisi teks + postId', socDlg.includes('Postingan terkirim rig') && socDlg.includes('post-123'), socDlg.slice(0, 200));
  check('klik chip terkirim TIDAK membuka komposer', !document.getElementById('socCompText'), '');


  // 9. v85 (audit B2): Simpan tim saat nol proyek tidak crash.
  const store0 = new Map();
  const dom0 = makeDom(store0);
  for (let i = 0; i < 60 && typeof dom0.window.showView !== 'function'; i++) await tick(50);
  dom0.window.showView('kanban');
  dom0.window.renderKanban();
  await tick(100);
  dom0.window.kbTeamOpen();
  await tick(50);
  let teamCrashed = false;
  try { dom0.window.kbTeamSave(); } catch (e) { teamCrashed = true; }
  await tick(50);
  check('Simpan tim saat nol proyek tidak crash', !teamCrashed, '');

} catch (e) {
  // eslint-disable-next-line no-console
  console.log('FAIL rig-audit exception :: ' + (e && e.stack ? e.stack : e));
  failed++;
}

// eslint-disable-next-line no-console
console.log(failed === 0 ? 'RIG-AUDIT ALL PASSED' : 'RIG-AUDIT FAILED');
process.exit(failed === 0 ? 0 : 1);
