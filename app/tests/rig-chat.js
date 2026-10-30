// Rig Orkestrasi Chat (jsdom, test-only): membuktikan alur Prime ->
// delegasi -> hasil agen -> approve studio — BUKAN mock logika bisnis:
//  1. Header bubble = nama user (Patria) & tiap agen (.who).
//  2. Pesan langsung: Prime ack ramah + jawaban, tanpa delegasi.
//  3. Pesan riset: Prime delegasikan ke Riset, Riset aktif di list
//     (.sel), Riset membalas + hasil, TANPA tombol studio (skill).
//  4. Pesan naskah video: delegasi ke Kreatif + tombol studio; klik
//     Approve -> Media Studio tab Script + output berisi hasil.
//  5. Pesan produk: TIDAK pernah didelegasikan (bukan target).
// Jalankan: npm run rig:chat (butuh dist ter-build + jsdom devDependency).
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

function makeResp({ ok = true, status = 200, jsonData = null } = {}) {
  return {
    ok,
    status,
    headers: { get: () => 'application/json' },
    json: async () => jsonData,
    text: async () => (jsonData ? JSON.stringify(jsonData) : ''),
  };
}

async function invokeStub(cmd) {
  log.push('invoke:' + cmd);
  throw new Error('unexpected invoke ' + cmd);
}

async function fetchStub(url, opts) {
  log.push('fetch:' + String(url));
  let body = '';
  try { body = typeof opts?.body === 'string' ? opts.body : JSON.stringify(opts?.body || ''); } catch (_) { body = ''; }
  // v103: stub model per jenis call — split brief (Bagi brief) mengembalikan
  // tugas JSON; sapaan 'Halo utama' dinilai bukan brief (array kosong);
  // QC mengembalikan verdict; sisanya hasil kerja agen.
  let content = 'NASKAH-UJI: Hook kopi susu, isi 5W1H, CTA order via chat.';
  if (body.includes('Bagi brief')) {
    content = (body.includes('Halo utama') || body.includes('jadwal posting')) ? '[]' : '[{"agent":"riset","task":"Riset pasar kopi susu"},{"agent":"kreatif","task":"Buat naskah video kopi susu"}]';
  } else if (body.includes('QC hasil kerja agen')) {
    content = 'QC: riset LOLOS, kreatif LOLOS. Semua hasil siap dipakai.';
  }
  return makeResp({
    jsonData: {
      choices: [{ message: { content } }],
      usage: { prompt_tokens: 42, completion_tokens: 30 },
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
    window.URL.createObjectURL = () => 'blob:chat-test';
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
// Hitung hanya MODEL call: onMount menjalankan vsCheck() (ping
// localhost:3900: status + model + voice), renderPlanner() menjalankan
// postizCheck() (ping localhost:4007), dan panel VoiceStudio menjalankan
// vsEmbedCheck() (probe UI localhost:3901 + /health). Itu cek status
// lokal, bukan model call — dikecualikan agar asersi '1 model call' /
// 'tanpa fetch' tetap bermakna.
const fetchCount = () =>
  log.filter((l) => l.startsWith('fetch:') && !l.includes('127.0.0.1:3900') && !l.includes('localhost:4007') && !l.includes('localhost:3901')).length;
const countOcc = (s) => (bodyText().match(new RegExp(s, 'g')) || []).length;

async function sendMsg(text) {
  const inp = document.getElementById('chatInput');
  inp.value = text;
  dom.window.sendChat();
  await tick(100);
}

try {
  // Mount Svelte di jsdom kini ~585 ms (bundle membesar sejak
  // brand+batch+image): tunggu kondisi nyata, bukan tick buta.
  await waitFor(() => document.getElementById('chatInput'), 'mount chatInput', 200);
  store.set('minime.metaKey', 'rig-key');

  // 0. v84: mulai nol -> buat proyek uji berisi semua agen roster.
  dom.window.showView('home');
  await tick(100);
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

  // 1. Pesan langsung: ack Prime + jawaban, tanpa delegasi.
  await sendMsg('halo');
  await waitFor(() => bodyText().includes('Baik, saya mengerti'), 'ack Prime', 120);
  await waitFor(() => bodyText().includes('NASKAH-UJI'), 'jawaban Prime', 120);
  check('ack Prime ramah tampil', bodyText().includes('Baik, saya mengerti'));
  check('pesan langsung tanpa delegasi', countOcc('Saya delegasikan') === 0);
  check('pesan langsung tanpa tombol studio', ![...document.querySelectorAll('#chatBox button')].some((b) => b.textContent.trim() === 'Buka di Media Studio'));
  check('pesan langsung 1 model call', fetchCount() === 1, 'fetch=' + fetchCount());

  // 2. Delegasi Riset: pengumuman + aktif di list + hasil, tanpa studio.
  await sendMsg('buatkan riset pasar kopi susu');
  await waitFor(() => bodyText().includes('Saya delegasikan tugas ini ke Riset'), 'delegasi Riset', 120);
  await waitFor(() => bodyText().includes('Siap — saya kerjakan untuk Prime'), 'ack Riset', 120);
  check('delegasi ke Riset tampil', bodyText().includes('Saya delegasikan tugas ini ke Riset'));
  const sel = document.querySelector('#agentList .agent.sel');
  check('Riset aktif di list (.sel)', !!sel && sel.textContent.includes('Riset'), sel?.textContent || '');
  check('Riset tanpa tombol studio (bukan skill-nya)', ![...document.querySelectorAll('#chatBox button')].some((b) => b.textContent.trim() === 'Buka di Media Studio'));
  check('delegasi Riset 1 model call lagi', fetchCount() === 2, 'fetch=' + fetchCount());

  // 3. Delegasi Kreatif + studio: tombol Approve -> pindah studio.
  await sendMsg('buatkan naskah video kopi');
  await waitFor(() => bodyText().includes('Saya delegasikan tugas ini ke Kreatif'), 'delegasi Kreatif', 120);
  await waitFor(() => [...document.querySelectorAll('#chatBox button')].some((b) => b.textContent.trim() === 'Buka di Media Studio'), 'tombol studio Kreatif', 120);
  check('delegasi ke Kreatif tampil', bodyText().includes('Saya delegasikan tugas ini ke Kreatif'));
  check('Kreatif membawa tombol studio', [...document.querySelectorAll('#chatBox button')].some((b) => b.textContent.trim() === 'Buka di Media Studio'));
  [...document.querySelectorAll('#chatBox button')].find((b) => b.textContent.trim() === 'Buka di Media Studio').click();
  await tick(200);
  check('Approve pindah ke view Media', document.getElementById('view-media')?.classList.contains('active'));
  check('Approve membuka tab Script', document.getElementById('ms-tab-script')?.style.display === 'block', document.getElementById('ms-tab-script')?.style.display || '');
  check('Approve memuat hasil ke output Script', (document.getElementById('se-output')?.value || '').includes('NASKAH-UJI'), document.getElementById('se-output')?.value || '');
  check('Approve dikonfirmasi di chat', bodyText().includes('Baik, saya buka Media Studio'));
  check('delegasi Kreatif 1 model call lagi', fetchCount() === 3, 'fetch=' + fetchCount());

  // 4. Produk tidak pernah jadi target delegasi.
  const delegBefore = countOcc('Saya delegasikan');
  dom.window.showView('home');
  await sendMsg('buatkan brief produk digital');
  await waitFor(() => fetchCount() === 4, 'model call produk', 120);
  await tick(200);
  check('produk tidak didelegasikan', countOcc('Saya delegasikan') === delegBefore, 'sebelum=' + delegBefore + ' sesudah=' + countOcc('Saya delegasikan'));

  // 5. Struktural: tiap bubble non-kurasi punya header .who.
  const msgs = [...document.querySelectorAll('#chatBox .msg:not(.curation)')];
  check('semua bubble punya header nama', msgs.length > 0 && msgs.every((m) => m.querySelector('.who')), 'bubble=' + msgs.length);
  const whos = [...document.querySelectorAll('#chatBox .who')].map((e) => e.textContent.trim());
  check('header memuat Patria + Prime + agen', whos.includes('Patria') && whos.includes('Prime Agent') && whos.includes('Riset') && whos.includes('Kreatif'), whos.join(','));

  // 6. Palet revisi 28 Okt: user kanan (class user), agen kiri
  //    (class msg/prime), + token warna baru di CSS ter-build.
  const userMsgs = [...document.querySelectorAll('#chatBox .msg.user')];
  check('bubble user ber-class user (kanan)', userMsgs.length > 0 && userMsgs.every((m) => m.querySelector('.who')?.textContent.trim() === 'Patria'), 'user=' + userMsgs.length);
  check('header user di DALAM bubble', userMsgs.length > 0 && userMsgs.every((m) => m.querySelector('.bubble .who')?.textContent.trim() === 'Patria'), 'user=' + userMsgs.length);
  const agentMsgs = [...document.querySelectorAll('#chatBox .msg:not(.user):not(.curation)')];
  check('bubble agen ber-class msg/prime (kiri)', agentMsgs.length > 0, 'agen=' + agentMsgs.length);
  check('header agen di DALAM bubble', agentMsgs.length > 0 && agentMsgs.every((m) => !!m.querySelector('.bubble .who')), 'agen=' + agentMsgs.length);
  const cssLink = html.match(/<link[^>]*href="([^"]+\.css)"[^>]*>/);
  // Minifier CSS menurunkan huruf hex (EB87B4 -> eb87b4): bandingkan lower-case.
  const cssText = (cssLink ? fs.readFileSync(path.join(distDir, cssLink[1]), 'utf-8') : '').toLowerCase();
  check('CSS ter-build memuat pink #EB87B4', cssText.includes('#eb87b4'));
  check('CSS ter-build memuat hijau #A6EBB1', cssText.includes('#a6ebb1'));
  check('CSS ter-build memuat aturan bubble user', cssText.includes('.msg.user .body') && cssText.includes('.msg.user .bubble'));
  check('CSS ter-build memuat aturan header dalam bubble', cssText.includes('.msg.user .bubble .who') && cssText.includes('.msg .bubble .who'));
  // 9. v106 (perintah Patria 30 Okt 16:39): teks panjang tidak keluar area.
  const msgBubbleRules = cssText.match(/\.msg\s+\.bubble\s*\{[^}]*\}/g) || [];
  check('v106: CSS bubble chat memakai overflow-wrap', msgBubbleRules.some((r) => r.includes('overflow-wrap')), msgBubbleRules.join(' | ').slice(0, 300));
  check('v106: CSS chatBox menyembunyikan luapan horizontal', /#chatbox\s*\{[^}]*overflow-x\s*:\s*hidden/.test(cssText), '');

  // 10. v107: approve Studio dengan draf terbuka memakai dua ketuk
  // (dialog native mati di WebView live — diganti arm di tombol).
  store.set('minime.scriptEditor', JSON.stringify({ output: 'DRAF LAMA UJI' }));
  await sendMsg('buatkan naskah video kopi');
  await waitFor(() => [...document.querySelectorAll('#chatBox button')].some((b) => b.textContent.trim() === 'Buka di Media Studio'), 'tombol studio v107', 120);
  const btn107 = [...document.querySelectorAll('#chatBox button')].find((b) => b.textContent.trim() === 'Buka di Media Studio');
  btn107.click();
  await tick(200);
  check('v107: ketuk pertama Studio dengan draf -> tombol berubah jadi konfirmasi, belum pindah', btn107.textContent.includes('Yakin timpa') && !document.getElementById('view-media')?.classList.contains('active'), btn107.textContent);
  btn107.click();
  await tick(200);
  check('v107: ketuk kedua Studio -> pindah Media + output termuat', !!document.getElementById('view-media')?.classList.contains('active') && (document.getElementById('se-output')?.value || '').includes('NASKAH-UJI'), document.getElementById('se-output')?.value || '');
  const userBubbleRules = cssText.match(/\.msg\.user \.bubble\{[^}]*\}/g) || [];
  check('isi bubble user rata kanan', userBubbleRules.some((r) => r.includes('text-align:right')), userBubbleRules.join(' | ').slice(0, 200));

  // 6. v101: chat jalan TANPA project (temuan live Patria 30 Okt 15:46).
  Object.keys(dom.window.PROJECTS).forEach((k) => { delete dom.window.PROJECTS[k]; });
  store.delete('minime.mainChat');
  dom.window.renderChat();
  await tick(50);
  const ci101 = document.getElementById('chatInput');
  check('v101: tanpa project input TIDAK disabled', !!ci101 && ci101.disabled === false, 'disabled=' + ci101?.disabled);
  check('v101: tanpa project label chat = Main chat', (document.getElementById('chatProj')?.textContent || '') === 'Main chat', document.getElementById('chatProj')?.textContent || '');
  ci101.value = 'Halo utama';
  dom.window.sendChat();
  await tick(600);
  const box101 = document.getElementById('chatBox')?.textContent || '';
  check('v101: kirim tanpa project -> bubble user + ack Prime tampil', box101.includes('Halo utama') && box101.includes('Baik, saya mengerti'), box101.slice(0, 200));
  let mc101 = [];
  try { mc101 = JSON.parse(store.get('minime.mainChat') || '[]'); } catch (_) { mc101 = []; }
  check('v101: Main chat tersimpan persisten (minime.mainChat)', Array.isArray(mc101) && mc101.some((m) => (m.text || '').includes('Halo utama')), 'n=' + mc101.length);

  // 7. v103 (Alur 1): brief pertama tanpa project -> project otomatis +
  // fan-out ke agen + QC Prime + laporan lengkap + dokumen Library.
  const ci103 = document.getElementById('chatInput');
  ci103.value = 'Brief kopi susu gula aren untuk pasar Surabaya';
  dom.window.sendChat();
  await tick(900);
  const projKeys = Object.keys(dom.window.PROJECTS);
  check('v103: brief pertama membuat tepat 1 project', projKeys.length === 1, 'n=' + projKeys.length);
  const proj103 = projKeys.length ? dom.window.PROJECTS[projKeys[0]] : null;
  check('v103: nama project = baris pertama brief', !!proj103 && proj103.name === 'Brief kopi susu gula aren untuk pasar Surabaya', proj103 ? proj103.name : 'tanpa project');
  const agKeys103 = (proj103?.agents || []).map((a) => a.key);
  check('v103: agen riset + kreatif jadi anggota project', agKeys103.includes('riset') && agKeys103.includes('kreatif'), agKeys103.join(','));
  dom.window.showView('graph');
  await tick(200);
  const graphHtml103 = document.getElementById('graphNodes')?.innerHTML || '';
  check('v103: node Graph riset + kreatif ada di project baru', graphHtml103.includes('Riset') && graphHtml103.includes('Kreatif'), graphHtml103.slice(0, 200));
  dom.window.showView('home');
  await tick(200);
  const box103 = document.getElementById('chatBox')?.textContent || '';
  check('v103: bubble pengumuman project + delegasi tampil', box103.includes('Project dibuat') && box103.includes('Saya delegasikan'), box103.slice(0, 300));
  check('v103: hasil kerja agen tampil', box103.includes('NASKAH-UJI'), box103.slice(0, 300));
  check('v103: QC Prime tampil sebagai kurasi', box103.includes('KURASI PRIME') && box103.includes('QC: riset LOLOS'), box103.slice(0, 500));
  check('v103: laporan lengkap + status selesai tampil', box103.includes('Laporan Lengkap Project') && box103.includes('Project selesai'), box103.slice(-500));
  let lib103 = [];
  try { lib103 = JSON.parse(store.get('minime.library.added') || '[]'); } catch (_) { lib103 = []; }
  check('v103: laporan tersimpan sebagai dokumen Library', lib103.some((it) => (it.o || '').includes('Laporan Lengkap Project') && (it.content || '').includes('Project selesai')), 'n=' + lib103.length);
  const list103 = document.getElementById('agentList')?.textContent || '';
  check('v103: list agen menampilkan Riset + Kreatif aktif', list103.includes('Riset') && list103.includes('Kreatif'), list103.slice(0, 200));

  // 8. v104 (aturan Patria 30 Okt 16:16): delegasi tunggal TANPA project
  // tetap memunculkan agen di list (grup Dari Graph) + panel detail.
  Object.keys(dom.window.PROJECTS).forEach((k) => { delete dom.window.PROJECTS[k]; });
  Object.keys(dom.window.GNODES).forEach((k) => { delete dom.window.GNODES[k]; });
  dom.window.GEDGES.length = 0;
  dom.window.renderAgents(); dom.window.renderGraph(); dom.window.renderChat();
  await tick(100);
  const ci104 = document.getElementById('chatInput');
  ci104.value = 'jadwal posting video minggu depan';
  dom.window.sendChat();
  await tick(900);
  const nodes104 = Object.values(dom.window.GNODES);
  check('v104: delegasi tanpa project membuat node Graph-only Distribusi', nodes104.some((nd) => nd.agent === 'distribusi' && !nd.proj), JSON.stringify(nodes104.map((nd) => nd.agent + ':' + nd.proj)));
  const list104 = document.getElementById('agentList')?.textContent || '';
  check('v104: list menampilkan grup Dari Graph + Distribusi', list104.includes('Dari Graph') && list104.includes('Distribusi'), list104.slice(0, 300));
  const detail104 = document.getElementById('detailBody')?.textContent || '';
  check('v104: panel detail berpindah ke Distribusi', detail104.includes('Distribusi'), detail104.slice(0, 200));
  const box104 = document.getElementById('chatBox')?.textContent || '';
  check('v104: bubble kesediaan Distribusi tampil', box104.includes('Siap') && box104.includes('NASKAH-UJI'), box104.slice(0, 300));


  // 11. v112: bubble user hijau pastel + font hitam + header dark violet.
  check('v112: CSS ter-build mengatur bubble user hijau pastel + font hitam', /\.msg\.user\s+\.bubble\s*\{[^}]*#8ed694[^}]*#262626/.test(cssText), '');
  check('v113: bubble user sedikit lebih gelap dari #A6EBB1 (header agen tetap hijau itu)', /\.msg\s+\.bubble\s+\.who\s*\{[^}]*#a6ebb1/.test(cssText), '');
  check('v112: CSS ter-build mengatur header nama user dark violet', /\.msg\.user\s+\.bubble\s+\.who\s*\{[^}]*#4c1d95/.test(cssText), '');


  // 12. v116: tombol aksi chat gradasi violet-pink -> hijau setelah klik;
  // link chat (URL telanjang/www/markdown/<a> mentah) bisa dibuka eksternal.
  check('v116: CSS ter-build memberi .chat-act gradasi', /\.chat-act\{[^}]*linear-gradient/.test(cssText), '');
  check('v116: CSS ter-build memberi .chat-act.done hijau', /\.chat-act\.done\{[^}]*#8ed694/.test(cssText), '');
  // Tombol done diverifikasi dengan alur approve segar: residu §10 sudah
  // dihapus §6 bersama projectnya, jadi kirim ulang pemicu tombol Studio
  // (pola sama seperti §10: dua ketuk karena draf Script Editor ada).
  await sendMsg('buatkan naskah video kopi');
  await waitFor(() => [...document.querySelectorAll('#chatBox button')].some((b) => b.textContent.trim() === 'Buka di Media Studio'), 'tombol studio v116', 120);
  const btn116 = [...document.querySelectorAll('#chatBox button')].find((b) => b.textContent.trim() === 'Buka di Media Studio');
  btn116.click();
  await tick(200);
  btn116.click();
  await tick(200);
  const btn116b = [...document.querySelectorAll('#chatBox button')].find((b) => b.textContent.trim() === 'Buka di Media Studio');
  check('v116: tombol Studio sukses diklik bertanda done (hijau)', !!btn116b && btn116b.classList.contains('done') && btn116b.classList.contains('chat-act'), btn116b?.className || 'tidak ada');
  dom.window.renderChat();
  await tick(100);
  const btn116c = [...document.querySelectorAll('#chatBox button')].find((b) => b.textContent.trim() === 'Buka di Media Studio');
  check('v116: tanda done bertahan setelah renderChat ulang', !!btn116c && btn116c.classList.contains('done'), btn116c?.className || 'tidak ada');
  dom.window.postChat('kreatif', 'Kreatif', '#fff', 'Lihat https://contoh.id/promo, www.toko.id dan [Panduan](https://panduan.id/x).');
  await tick(100);
  const links116 = [...document.querySelectorAll('#chatBox a[data-act="chat-link"]')];
  check('v116: URL telanjang + www + markdown jadi 3 link chat', links116.length === 3, links116.map((a) => a.getAttribute('data-url')).join(' | '));
  check('v116: data-url benar (koma akhir dibuang, www diberi https)', links116[0]?.getAttribute('data-url') === 'https://contoh.id/promo' && links116[1]?.getAttribute('data-url') === 'https://www.toko.id' && links116[2]?.getAttribute('data-url') === 'https://panduan.id/x', links116.map((a) => a.getAttribute('data-url')).join(' | '));
  const invBefore116 = log.filter((x) => x === 'invoke:open_external_url').length;
  links116[0].click();
  await tick(100);
  check('v116: klik link chat -> open_external_url dipanggil', log.filter((x) => x === 'invoke:open_external_url').length === invBefore116 + 1, log.slice(-5).join(','));
  dom.window.postChat('kreatif', 'Kreatif', '#fff', 'coba <a href="https://mentah.id/a">tautan mentah</a> ini');
  await tick(100);
  const raw116 = document.querySelector('#chatBox a[href="https://mentah.id/a"]');
  raw116.click();
  await tick(100);
  check('v116: klik <a href> mentah -> dibuka eksternal (bukan navigasi WebView)', log.filter((x) => x === 'invoke:open_external_url').length === invBefore116 + 2, log.slice(-5).join(','));
  dom.window.postChat('user', 'Patria', '#374151', 'cek https://user.id/a?x=1&y=2 ya');
  await tick(100);
  const userLink116 = [...document.querySelectorAll('#chatBox a[data-act="chat-link"]')].find((a) => (a.getAttribute('data-url') || '').includes('user.id'));
  check('v116: link di bubble user juga aktif (tanpa double-escape &)', userLink116?.getAttribute('data-url') === 'https://user.id/a?x=1&y=2', userLink116?.getAttribute('data-url') || 'tidak ada');

} catch (e) {
  // eslint-disable-next-line no-console
  console.log('FAIL rig-chat exception :: ' + (e && e.stack ? e.stack : e));
  failed++;
}

// eslint-disable-next-line no-console
console.log(failed === 0 ? 'RIG-CHAT ALL PASSED' : 'RIG-CHAT FAILED');
process.exit(failed === 0 ? 0 : 1);
