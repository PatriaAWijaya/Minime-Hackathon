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
const bodies = [];
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
  bodies.push(body);
  // v103: stub model per jenis call — split brief (Bagi brief) mengembalikan
  // tugas JSON; sapaan 'Halo utama' dinilai bukan brief (array kosong);
  // QC mengembalikan verdict; sisanya hasil kerja agen.
  let content = 'NASKAH-UJI: Hook kopi susu, isi 5W1H, CTA order via chat.';
  if (body.includes('Bagi brief')) {
    content = (body.includes('Halo utama') || body.includes('jadwal posting') || body.includes('halo') || body.includes('brief produk digital')) ? '[]' : (body.includes('Alur 2') ? '[{"agent":"riset","task":"Riset pasar Alur 2"},{"agent":"strategi","task":"Strategi Alur 2"},{"agent":"kreatif","task":"Buat naskah Alur 2"}]' : '[{"agent":"riset","task":"Riset pasar kopi susu"},{"agent":"kreatif","task":"Buat naskah video kopi susu"}]');
  } else if (body.includes('QC hasil kerja agen')) {
    content = 'QC: riset LOLOS, kreatif LOLOS. Semua hasil siap dipakai.';
  } else if (body.includes('PART 1')) {
    content = 'NASKAH-SERI-P1-UJI';
  } else if (body.includes('PART 2')) {
    content = 'NASKAH-SERI-P2-UJI';
  } else if (body.includes('mixing')) {
    content = 'NASKAH-MIX-UJI';
  } else if (body.includes('berseri')) {
    content = 'NASKAH-SERI-UJI';
  } else if (body.includes('promosional')) {
    content = 'NASKAH-PROMO-UJI';
  } else if (body.includes('talking head')) {
    content = 'NASKAH-TH-UJI';
  } else if (body.includes('BULK-IMAGE-PLAN')) {
    content = '=== IMAGE 1 ===\nRencana image satu: caption kopi pagi.\n=== IMAGE 2 ===\nRencana image dua: caption kopi sore.\n=== IMAGE 3 ===\nRencana image tiga: caption kopi malam.';
  } else if (body.includes('BULK-CAROUSEL-PLAN')) {
    content = '=== CAROUSEL 1 ===\nCarousel satu: 6 slide kopi.\n=== CAROUSEL 2 ===\nCarousel dua: 6 slide kopi.\n=== CAROUSEL 3 ===\nCarousel tiga: 6 slide kopi.';
  } else if (body.includes('IMAGE-PLAN')) {
    content = 'NASKAH-IMG-UJI: caption + rancangan image kopi.';
  } else if (body.includes('CAROUSEL-PLAN')) {
    content = 'NASKAH-CAR-UJI: caption + carousel 6 slide kopi.';
  } else if (body.includes('REELS-PLAN')) {
    content = 'NASKAH-REELS-UJI: rencana reels 30-60 detik 9:16 kopi.';
  } else if (body.includes('500 karakter')) {
    content = 'Kopi susu gula aren ini creamy banget, manisnya pas dari gula aren asli, dan aromanya langsung bikin pengin nyobain satu gelas lagi. Satu gelas cukup untuk memulai hari, apalagi diminum selagi hangat ditemani roti bakar di pagi yang masih sepi. Racikan susunya lembut, gulanya tidak bikin enek, dan aftertaste kopinya bersih tanpa rasa pahit yang mengganggu. Cocok buat yang baru mulai suka kopi, juga buat penikmat lama yang cari rasa manis legit tanpa ribet. Order sekarang selagi promo berjalan, stok gula aren asli terbatas dan tiap gelas dibuat fresh begitu pesanan masuk. Jangan sampai kehabisan, karena racikan ini cuma tersedia selama persediaan gula aren masih ada.';
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
    try { Object.defineProperty(window.navigator, 'clipboard', { value: { writeText: async (t) => { globalThis.__copied131 = t; } }, configurable: true }); } catch (_) {}
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
  check('pesan langsung: split kosong + jawaban (2 fetch)', fetchCount() === 2, 'fetch=' + fetchCount());

  // 2. Delegasi Riset: pengumuman + aktif di list + hasil, tanpa studio.
  await sendMsg('buatkan riset pasar kopi susu');
  await waitFor(() => bodyText().includes('Saya delegasikan tugas ini ke Riset'), 'delegasi Riset', 120);
  await waitFor(() => bodyText().includes('Siap — saya kerjakan untuk Prime'), 'ack Riset', 120);
  check('delegasi ke Riset tampil', bodyText().includes('Saya delegasikan tugas ini ke Riset'));
  const sel = document.querySelector('#agentList .agent.sel');
  check('Riset aktif di list (.sel)', !!sel && sel.textContent.includes('Riset'), sel?.textContent || '');
  check('Riset tanpa tombol studio (bukan skill-nya)', ![...document.querySelectorAll('#chatBox button')].some((b) => b.textContent.trim() === 'Buka di Media Studio'));
  check('delegasi Riset 1 model call lagi', fetchCount() === 3, 'fetch=' + fetchCount());

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
  check('delegasi Kreatif 1 model call lagi', fetchCount() === 4, 'fetch=' + fetchCount());

  // 4. Produk tidak pernah jadi target delegasi.
  const delegBefore = countOcc('Saya delegasikan');
  dom.window.showView('home');
  await sendMsg('buatkan brief produk digital');
  await waitFor(() => fetchCount() === 6, 'model call produk', 120);
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


  // 13. v117 (Alur 2): brief di project beranggota -> fan-out HANYA anggota aktif.
  const pid117 = 'alur2-uji';
  dom.window.PROJECTS[pid117] = { name: 'Alur 2 Uji', agents: [{ key: 'riset', status: 'Idle', task: '—' }, { key: 'kreatif', status: 'Idle', task: '—' }], chat: [], kanban: [] };
  dom.window.switchProject(pid117);
  await tick(100);
  const projCount117 = Object.keys(dom.window.PROJECTS).length;
  let libBefore117 = [];
  try { libBefore117 = JSON.parse(store.get('minime.library.added') || '[]'); } catch (_) { libBefore117 = []; }
  await sendMsg('Brief Alur 2 kopi susu gula aren');
  await tick(1500);
  const box117 = document.getElementById('chatBox')?.textContent || '';
  const agents117 = dom.window.PROJECTS[pid117].agents;
  check('v117: Alur 2 mendelegasikan ke riset + kreatif (anggota aktif)', box117.includes('Riset') && box117.includes('Kreatif') && box117.includes('NASKAH-UJI'), box117.slice(0, 300));
  check('v117: strategi (bukan anggota) TIDAK didelegasikan/ditambahkan', !agents117.some((a) => a.key === 'strategi') && !box117.includes('Strategi'), agents117.map((a) => a.key).join(','));
  check('v117: tugas anggota diperbarui dari brief', agents117.find((a) => a.key === 'riset')?.task === 'Riset pasar Alur 2' && agents117.find((a) => a.key === 'kreatif')?.task === 'Buat naskah Alur 2', agents117.map((a) => a.key + ':' + a.task).join(' | '));
  check('v117: QC + laporan progres tampil (bukan laporan selesai)', box117.includes('KURASI PRIME') && box117.includes('Laporan Progres') && box117.includes('project tetap berjalan'), box117.slice(-400));
  check('v117: TIDAK membuat project baru', Object.keys(dom.window.PROJECTS).length === projCount117, 'n=' + Object.keys(dom.window.PROJECTS).length);
  let libAfter117 = [];
  try { libAfter117 = JSON.parse(store.get('minime.library.added') || '[]'); } catch (_) { libAfter117 = []; }
  check('v117: TIDAK menambah dokumen Library', libAfter117.length === libBefore117.length, libBefore117.length + ' -> ' + libAfter117.length);

  // 14. v130: standar laporan untuk SEMUA chat, lama maupun baru.
  // (a) Pesan LAMA (tersimpan gaya lama: teks ter-escape + markdown mentah)
  // ikut rapi saat render ulang — tanpa migrasi data.
  dom.window.postChat('riset', 'Riset', '#fff', '### Tren Kopi Surabaya\n\n**Harga** naik &amp; pasar tumbuh.\n\n- Kopi susu\n- Manual brew\n\n1. Pagi\n2. Sore');
  await tick(100);
  const old130 = [...document.querySelectorAll('#chatBox .msg')].pop();
  const oldHtml130 = old130?.querySelector('.bubble')?.innerHTML || '';
  check('v130: pesan lama dirender rapi (header + bold + list, tanpa marker mentah)', !!old130 && oldHtml130.includes('<h4>') && oldHtml130.includes('<strong>Harga</strong>') && oldHtml130.includes('<ul>') && oldHtml130.includes('<ol>') && !oldHtml130.includes('**') && !oldHtml130.includes('###'), oldHtml130.slice(0, 300));
  check('v130: pesan lama tanpa double-escape (& tampil sekali)', (old130?.querySelector('.bubble')?.textContent || '').includes('naik & pasar') && !oldHtml130.includes('&amp;amp;'), oldHtml130.slice(0, 200));
  // (b) Pesan user TIDAK disentuh markdown (tetap literal).
  dom.window.postChat('user', 'Patria', '#374151', '**bukan tebal** dan ### bukan header');
  await tick(100);
  const user130 = [...document.querySelectorAll('#chatBox .msg')].pop();
  const userHtml130 = user130?.querySelector('.bubble')?.innerHTML || '';
  check('v130: bubble user tetap literal (tanpa render markdown)', userHtml130.includes('**bukan tebal**') && userHtml130.includes('### bukan header') && !userHtml130.includes('<strong>'), userHtml130.slice(0, 200));
  // (c) Prompt agen baru memuat standar laporan + laporan kompilasi berheader.
  // Pesan dipilih tanpa kata kunci delegasi (riset/strategi/kreatif/...) agar
  // lewat fan-out (bukan delegasi tunggal) sehingga ada bubble KURASI.
  bodies.length = 0;
  const curBefore130 = document.querySelectorAll('#chatBox .msg.curation').length;
  await sendMsg('Buat laporan kopi susu gula aren Surabaya');
  await waitFor(() => document.querySelectorAll('#chatBox .msg.curation').length > curBefore130, 'laporan v130', 120);
  await tick(500);
  check('v130: system prompt agen memuat STANDAR LAPORAN', bodies.some((b) => b.includes('STANDAR LAPORAN') && b.includes('Judul')), bodies.map((b) => b.slice(0, 100)).join(' | '));
  const rep130 = [...document.querySelectorAll('#chatBox .msg.curation .bubble')].pop()?.innerHTML || '';
  check('v130: laporan kompilasi Prime berheader (## -> h3)', rep130.includes('<h3>'), rep130.slice(0, 300));

  // 15. v131: tombol V + menu, react, Star/pin, Reply, Copy, Delete.
  // (a) Menu V pada bubble agen berisi 4 aksi.
  dom.window.postChat('riset', 'Riset', '#fff', 'Laporan uji V131');
  await tick(100);
  let msg131 = [...document.querySelectorAll('#chatBox .msg')].pop();
  msg131.querySelector('.msg-vbtn').click();
  await tick(100);
  let menu131 = msg131.querySelector('.msg-menu');
  check('v131: menu V agen berisi Reply/Star/Copy/Delete', !!menu131 && ['Balas', 'Star', 'Salin', 'Hapus'].every((w) => (menu131.textContent || '').includes(w)), menu131?.textContent || 'tidak ada');
  // (b) Star -> pinned bar; Unstar -> hilang.
  [...menu131.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Star').click();
  await tick(100);
  const pin131 = document.getElementById('pinnedBar');
  check('v131: Star menampilkan pinned bar di atas chat', pin131 && pin131.style.display === 'block' && (pin131.textContent || '').includes('Laporan uji V131'), pin131?.textContent || 'tidak ada');
  msg131 = [...document.querySelectorAll('#chatBox .msg')].pop();
  msg131.querySelector('.msg-vbtn').click();
  await tick(100);
  menu131 = msg131.querySelector('.msg-menu');
  check('v131: pesan Star menampilkan Unstar', !!menu131 && (menu131.textContent || '').includes('Batalkan Star'), menu131?.textContent || 'tidak ada');
  [...menu131.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Batalkan Star').click();
  await tick(100);
  check('v131: Unstar menyembunyikan pinned bar', document.getElementById('pinnedBar').style.display === 'none', document.getElementById('pinnedBar').style.display);
  // (c) Reply -> bar + kutipan pada pesan terkirim.
  msg131 = [...document.querySelectorAll('#chatBox .msg')].pop();
  msg131.querySelector('.msg-vbtn').click();
  await tick(100);
  [...msg131.querySelector('.msg-menu').querySelectorAll('button')].find((b) => b.textContent.trim() === 'Balas').click();
  await tick(100);
  const rb131 = document.getElementById('replyBar');
  check('v131: Reply menampilkan bar balasan', rb131 && rb131.style.display === 'flex' && (rb131.textContent || '').includes('Riset') && (rb131.textContent || '').includes('Laporan uji V131'), rb131?.textContent || 'tidak ada');
  await sendMsg('balasan uji v131');
  await waitFor(() => {
    const u = [...document.querySelectorAll('#chatBox .msg.user')].pop();
    return u && u.querySelector('.reply-quote') && u.querySelector('.reply-quote').textContent.includes('Laporan uji V131');
  }, 'quote v131', 120);
  const user131 = [...document.querySelectorAll('#chatBox .msg.user')].pop();
  check('v131: pesan terkirim membawa kutipan reply', !!(user131?.querySelector('.reply-quote')?.textContent || '').includes('Laporan uji V131'), user131?.querySelector('.reply-quote')?.textContent || 'tidak ada');
  check('v131: bar balasan hilang setelah kirim', document.getElementById('replyBar').style.display === 'none', document.getElementById('replyBar').style.display);
  // (d) Copy menyalin teks polos tanpa footer.
  dom.window.postChat('riset', 'Riset', '#fff', 'Laporan salin — via meta muse-spark-1.3 · 123ms');
  await tick(100);
  msg131 = [...document.querySelectorAll('#chatBox .msg')].pop();
  msg131.querySelector('.msg-vbtn').click();
  await tick(100);
  [...msg131.querySelector('.msg-menu').querySelectorAll('button')].find((b) => b.textContent.trim() === 'Salin').click();
  await tick(100);
  check('v131: Copy menyalin teks tanpa footer via', globalThis.__copied131 === 'Laporan salin', String(globalThis.__copied131));
  // (e) React pada bubble agen -> chip kiri bawah; klik chip -> hilang.
  msg131 = [...document.querySelectorAll('#chatBox .msg')].pop();
  msg131.querySelector('.msg-reactbtn').click();
  await tick(100);
  const pk131 = msg131.querySelector('.msg-picker');
  check('v131: picker emoji muncul di bubble agen', !!pk131 && pk131.querySelectorAll('button').length === 8, pk131 ? String(pk131.querySelectorAll('button').length) : 'tidak ada');
  [...pk131.querySelectorAll('button')].find((b) => b.textContent.trim() === '👍').click();
  await tick(100);
  msg131 = [...document.querySelectorAll('#chatBox .msg')].pop();
  check('v131: emoji user tampil kiri bawah bubble agen', !!(msg131.querySelector('.msg-reacts')?.textContent || '').includes('👍'), msg131.querySelector('.msg-reacts')?.textContent || 'tidak ada');
  msg131.querySelector('.msg-react-chip').click();
  await tick(100);
  msg131 = [...document.querySelectorAll('#chatBox .msg')].pop();
  check('v131: klik chip menghapus reaksi', !msg131.querySelector('.msg-react-chip'), msg131.querySelector('.msg-reacts')?.textContent || 'tidak ada');
  // (f) React pada bubble user = emoji agen di kiri bawah bubble user.
  dom.window.postChat('user', 'Patria', '#374151', 'pesan user uji reaksi');
  await tick(100);
  msg131 = [...document.querySelectorAll('#chatBox .msg')].pop();
  msg131.querySelector('.msg-reactbtn').click();
  await tick(100);
  [...msg131.querySelector('.msg-picker').querySelectorAll('button')].find((b) => b.textContent.trim() === '❤️').click();
  await tick(100);
  msg131 = [...document.querySelectorAll('#chatBox .msg')].pop();
  check('v131: emoji agen tampil kiri bawah bubble user', msg131.classList.contains('user') && (msg131.querySelector('.msg-reacts')?.textContent || '').includes('❤️'), msg131.querySelector('.msg-reacts')?.textContent || 'tidak ada');
  // (g) Delete langsung (v141, perintah Patria 31 Okt 20:15): tanpa dialog
  // konfirmasi — klik Hapus di menu langsung menghilangkan pesan.
  const countBefore131 = document.querySelectorAll('#chatBox .msg').length;
  msg131 = [...document.querySelectorAll('#chatBox .msg')].pop();
  msg131.querySelector('.msg-vbtn').click();
  await tick(100);
  [...msg131.querySelector('.msg-menu').querySelectorAll('button')].find((b) => b.textContent.trim() === 'Hapus').click();
  await tick(100);
  check('v141: Hapus di menu langsung menghilangkan pesan (tanpa dialog)', document.querySelectorAll('#chatBox .msg').length === countBefore131 - 1, String(document.querySelectorAll('#chatBox .msg').length));
  check('v141: tidak ada lagi dialog hapus pesan', !document.getElementById('chatMsgDelDlg'));
  // (h) Star + klik pin -> sorot pesan.
  dom.window.postChat('riset', 'Riset', '#fff', 'Pesan pin goto uji');
  await tick(100);
  msg131 = [...document.querySelectorAll('#chatBox .msg')].pop();
  msg131.querySelector('.msg-vbtn').click();
  await tick(100);
  [...msg131.querySelector('.msg-menu').querySelectorAll('button')].find((b) => b.textContent.trim() === 'Star').click();
  await tick(100);
  const pinItem131 = document.querySelector('#pinnedBar .pin-item');
  pinItem131.click();
  await tick(100);
  const flash131 = [...document.querySelectorAll('#chatBox .msg')].find((m) => (m.textContent || '').includes('Pesan pin goto uji'));
  check('v131: klik pin menyorot pesan', !!flash131 && flash131.classList.contains('flash'), flash131?.className || 'tidak ada');

  // 16. v132: tombol rekomendasi agen di window chat.
  // (a) Marker diubah jadi tombol (bisa lebih dari satu), marker tak tampil.
  dom.window.postChat('riset', 'Riset', '#fff', 'Hasil riset selesai.\n►RECOMMEND: Buat naskah | Riset harga | Jadwal posting');
  await tick(100);
  let rec132 = [...document.querySelectorAll('#chatBox .msg')].pop();
  const btns132 = rec132.querySelectorAll('.rec-btn');
  check('v132: 3 rekomendasi jadi 3 tombol', btns132.length === 3, String(btns132.length));
  check('v132: marker tidak tampil sebagai teks', !(rec132.textContent || '').includes('RECOMMEND'), rec132.textContent.slice(0, 200));
  check('v132: tombol awal belum hijau (tanpa done)', ![...btns132].some((b) => b.classList.contains('done')), [...btns132].map((b) => b.className).join(','));
  // (b) Klik tombol -> hijau + terkirim sebagai pesan user.
  btns132[0].click();
  await waitFor(() => {
    const u = [...document.querySelectorAll('#chatBox .msg.user')].pop();
    return u && (u.textContent || '').includes('Buat naskah');
  }, 'rec kirim v132', 120);
  await tick(300);
  rec132 = [...document.querySelectorAll('#chatBox .msg')].find((m) => (m.textContent || '').includes('Hasil riset selesai.'));
  check('v132: tombol dipilih berubah hijau', !!rec132 && !!rec132.querySelector('.rec-btn.done') && rec132.querySelector('.rec-btn.done').textContent.trim() === 'Buat naskah', rec132?.querySelector('.msg-recs')?.textContent || 'tidak ada');
  // (c) Bubble user dengan marker TIDAK jadi tombol.
  dom.window.postChat('user', 'Patria', '#374151', '►RECOMMEND: A | B');
  await tick(100);
  const userRec132 = [...document.querySelectorAll('#chatBox .msg')].pop();
  check('v132: bubble user tidak diubah jadi tombol', !userRec132.querySelector('.rec-btn'), userRec132.textContent.slice(0, 100));
  // (d) Lebih dari 5 opsi dibatasi 5.
  // §17 v135: menu dropdown chat background solid + teks putih.
  const cssFiles135 = fs.readdirSync(path.join(distDir, 'assets')).filter((f) => f.endsWith('.css'));
  let css135 = '';
  for (const f of cssFiles135) css135 += fs.readFileSync(path.join(distDir, 'assets', f), 'utf-8');
  const menuRules135 = [...css135.matchAll(/\.msg-menu\{([^}]*)\}/g)].map((m) => m[1]);
  const lastMenu135 = menuRules135[menuRules135.length - 1] || '';
  check('v135: menu dropdown background solid (bukan var/rgba)', /background:#2e1650/i.test(lastMenu135), lastMenu135.slice(0, 160));
  check('v135: menu dropdown teks putih', /(^|;)color:#fff/i.test(lastMenu135), lastMenu135.slice(0, 160));

  dom.window.postChat('riset', 'Riset', '#fff', 'Opsi banyak.\n►RECOMMEND: Satu | Dua | Tiga | Empat | Lima | Enam');
  await tick(100);
  const many132 = [...document.querySelectorAll('#chatBox .msg')].pop();
  check('v132: opsi dibatasi maksimal 5 tombol', many132.querySelectorAll('.rec-btn').length === 5, String(many132.querySelectorAll('.rec-btn').length));
  // §18 v136: bubble pemilik menu naik di atas bubble berikutnya.
  const firstMsg136 = document.querySelector('#chatBox .msg');
  firstMsg136.querySelector('.msg-vbtn').click();
  await tick(100);
  check('v136: bubble pemilik menu mendapat class menu-open', firstMsg136.classList.contains('menu-open') && !!firstMsg136.querySelector('.msg-menu'), firstMsg136.className);
  const openRules136 = [...css135.matchAll(/\.msg\.menu-open\{([^}]*)\}/g)].map((m) => m[1]);
  const lastOpen136 = openRules136[openRules136.length - 1] || '';
  check('v136: aturan menu-open menaikkan z-index', /z-index:\s*40/i.test(lastOpen136), lastOpen136.slice(0, 120));
  firstMsg136.querySelector('.msg-vbtn').click();
  await tick(100);
  check('v136: menu ditutup menghapus class menu-open', !firstMsg136.classList.contains('menu-open') && !firstMsg136.querySelector('.msg-menu'), firstMsg136.className);
  // §19 v137: aksi bubble mempertahankan posisi scroll (jsdom tanpa layout:
  // scrollTop/scrollHeight di-spy lewat defineProperty pada #chatBox yang sama).
  const box137 = document.getElementById('chatBox');
  let top137 = 0;
  Object.defineProperty(box137, 'scrollTop', { get: () => top137, set: (v) => { top137 = v; }, configurable: true });
  Object.defineProperty(box137, 'scrollHeight', { get: () => 1000, configurable: true });
  Object.defineProperty(box137, 'clientHeight', { get: () => 200, configurable: true });
  top137 = 123;
  const firstMsg137 = document.querySelector('#chatBox .msg');
  firstMsg137.querySelector('.msg-reactbtn').click();
  await tick(100);
  [...firstMsg137.querySelector('.msg-picker').querySelectorAll('button')].find((b) => b.textContent.trim() === '👍').click();
  await tick(100);
  check('v137: reaksi mempertahankan posisi scroll', top137 === 123, String(top137));
  check('v137: reaksi tetap tercatat', (document.querySelector('#chatBox .msg').querySelector('.msg-reacts')?.textContent || '').includes('👍'), document.querySelector('#chatBox .msg').querySelector('.msg-reacts')?.textContent || 'tidak ada');
  top137 = 77;
  dom.window.renderChat();
  check('v137: renderChat biasa tetap gulir ke bawah', top137 === 1000, String(top137));
  // §20 v138: alur brief kreatif — pintu peruntukan + cabang Artikel.
  // Brief 'halo...' memaksa split stub mengembalikan [] sehingga jalur
  // delegasi tunggal ke Kreatif yang terpicu (deterministik).
  const recBtn = (msg, label) => [...msg.querySelectorAll('.msg-recs .rec-btn')].find((b) => b.textContent.trim() === label);
  const lastMsg = () => [...document.querySelectorAll('#chatBox .msg')].pop();
  await sendMsg('halo Kreatif, buatkan artikel tentang kopi');
  await waitFor(() => (lastMsg()?.textContent || '').includes('dipergunakan untuk apa?'), 'cb purpose question');
  check('v138: Kreatif menanyakan peruntukan dulu', !!(lastMsg()?.textContent || '').includes('dipergunakan untuk apa?'), lastMsg()?.textContent.slice(0, 120) || 'tidak ada');
  recBtn(lastMsg(), 'Artikel Blog').click();
  await waitFor(() => (lastMsg()?.textContent || '').includes('model storytelling apa?'), 'cb story question');
  check('v138: cabang Artikel menanyakan model storytelling', !!(lastMsg()?.textContent || '').includes('model storytelling apa?'), lastMsg()?.textContent.slice(0, 120) || 'tidak ada');
  recBtn(lastMsg(), 'AIDA').click();
  await waitFor(() => (lastMsg()?.textContent || '').includes('sudut pandang'), 'cb pov question');
  recBtn(lastMsg(), 'Orang pertama').click();
  await waitFor(() => (lastMsg()?.textContent || '').includes('Gaya bahasanya'), 'cb style question');
  recBtn(lastMsg(), 'Santai').click();
  await waitFor(() => (lastMsg()?.textContent || '').includes('Jumlah kalimat'), 'cb sentences question');
  recBtn(lastMsg(), 'Sedang').click();
  await waitFor(() => (lastMsg()?.textContent || '').includes('Segmen audiens'), 'cb audience question');
  recBtn(lastMsg(), 'Umum').click();
  await waitFor(() => (lastMsg()?.textContent || '').includes('sudah tampil di Script Editor'), 'cb article done');
  check('v138: artikel selesai + tombol Buka di Script Editor', !!document.querySelector('#chatBox [data-act="cb-open-artikel"]'), lastMsg()?.textContent.slice(0, 120) || 'tidak ada');
  const se138 = JSON.parse(store.get('minime.scriptEditor') || '{}');
  check('v138: artikel tampil di Script Editor bagian Artikel', se138.menu === 'artikel' && (se138.output || '').includes('NASKAH-UJI'), 'menu=' + se138.menu + ' output=' + String(se138.output || '').slice(0, 60));
  // §21 v139: Movie — talking head end-to-end (karakter, suara, set).
  await sendMsg('halo Kreatif, buatkan video talking head kopi');
  await waitFor(() => (lastMsg()?.textContent || '').includes('dipergunakan untuk apa?'), 'cb139 purpose');
  recBtn(lastMsg(), 'Script Movie').click();
  await waitFor(() => (lastMsg()?.textContent || '').includes('Jenis movienya apa?'), 'cb139 movtype');
  recBtn(lastMsg(), 'Talking Head').click();
  await waitFor(() => (lastMsg()?.textContent || '').includes('Character sheet-nya dibuat dari apa?'), 'cb139 th char');
  recBtn(lastMsg(), 'Generate karakter baru').click();
  await waitFor(() => !!document.querySelector('#chatBox [data-act="cb-open-image"]'), 'cb139 image handoff');
  check('v139: talking head mengarahkan ke Image Editor', !!document.querySelector('#chatBox [data-act="cb-open-image"]'));
  await sendMsg('sudah, karakter jadi');
  await waitFor(() => (lastMsg()?.textContent || '').includes('Karakter suaranya clone atau generate baru?'), 'cb139 th voice');
  recBtn(lastMsg(), 'Clone suara').click();
  await waitFor(() => !!document.querySelector('#chatBox [data-act="cb-open-voice"]'), 'cb139 voice handoff');
  await sendMsg('sudah, suara jadi');
  await waitFor(() => (lastMsg()?.textContent || '').includes('Background ruangannya'), 'cb139 th set');
  recBtn(lastMsg(), 'Studio minimalis').click();
  await waitFor(() => !!document.querySelector('#chatBox [data-act="cb-open-video"]'), 'cb139 video handoff');
  check('v139: talking head selesai + tombol Video Editor', !!document.querySelector('#chatBox [data-act="cb-open-video"]'));
  const lib139 = JSON.parse(store.get('minime.library.added') || '[]');
  check('v139: rencana talking head tersimpan di Library', lib139.some((x) => (x.o || '').includes('Talking Head')), JSON.stringify(lib139.map((x) => x.o)));
  // §22 v139: Movie — promosional (tujuan, storyboard approve, tanpa VO, mix).
  await sendMsg('halo Kreatif, buatkan video promosi kopi');
  await waitFor(() => (lastMsg()?.textContent || '').includes('dipergunakan untuk apa?'), 'cb139p purpose');
  recBtn(lastMsg(), 'Script Movie').click();
  await waitFor(() => (lastMsg()?.textContent || '').includes('Jenis movienya apa?'), 'cb139p movtype');
  recBtn(lastMsg(), 'Video Promosional').click();
  await waitFor(() => (lastMsg()?.textContent || '').includes('Apa tujuan video promosional ini?'), 'cb139p goal');
  recBtn(lastMsg(), 'Awareness').click();
  await waitFor(() => (lastMsg()?.textContent || '').includes('Setujui untuk disimpan di Library?'), 'cb139p board approve');
  recBtn(lastMsg(), 'Setuju, simpan').click();
  await waitFor(() => (lastMsg()?.textContent || '').includes('Perlu voice over?'), 'cb139p vo');
  recBtn(lastMsg(), 'Tidak perlu').click();
  await waitFor(() => (lastMsg()?.textContent || '').includes('tersimpan di Library'), 'cb139p mix done');
  const lib139p = JSON.parse(store.get('minime.library.added') || '[]');
  check('v139: storyboard + rencana promosional tersimpan di Library', lib139p.some((x) => (x.o || '').startsWith('Storyboard:')) && lib139p.some((x) => (x.o || '').includes('Video Promosional:')), JSON.stringify(lib139p.map((x) => x.o)));
  // §23 v139: Movie — berseri 2 part (part per part, approve, ekor VO+mix).
  await sendMsg('halo Kreatif, buatkan video berseri kopi');
  await waitFor(() => (lastMsg()?.textContent || '').includes('dipergunakan untuk apa?'), 'cb139s purpose');
  recBtn(lastMsg(), 'Script Movie').click();
  await waitFor(() => (lastMsg()?.textContent || '').includes('Jenis movienya apa?'), 'cb139s movtype');
  recBtn(lastMsg(), 'Video Berseri').click();
  await waitFor(() => (lastMsg()?.textContent || '').includes('dibuat berapa part?'), 'cb139s parts');
  await sendMsg('2');
  await waitFor(() => (lastMsg()?.textContent || '').includes('Setujui untuk disimpan di Library?'), 'cb139s board1 approve');
  recBtn(lastMsg(), 'Setuju, simpan').click();
  await waitFor(() => bodyText().includes('NASKAH-SERI-P2-UJI'), 'cb139s board2');
  recBtn(lastMsg(), 'Setuju, simpan').click();
  await waitFor(() => (lastMsg()?.textContent || '').includes('Perlu voice over?'), 'cb139s vo');
  recBtn(lastMsg(), 'Tidak perlu').click();
  await waitFor(() => (lastMsg()?.textContent || '').includes('tersimpan di Library'), 'cb139s mix done');
  const lib139s = JSON.parse(store.get('minime.library.added') || '[]');
  check('v139: storyboard part 1 + part 2 berseri tersimpan di Library', lib139s.some((x) => (x.o || '').includes('Storyboard Part 1:')) && lib139s.some((x) => (x.o || '').includes('Storyboard Part 2:')), JSON.stringify(lib139s.map((x) => x.o)));
  // §24 v140: Sosmed — Threads (script >500 karakter dibagi per bagian).
  await sendMsg('halo Kreatif, buatkan konten threads kopi');
  await waitFor(() => (lastMsg()?.textContent || '').includes('dipergunakan untuk apa?'), 'cb140 purpose');
  recBtn(lastMsg(), 'Konten Sosial Media').click();
  await waitFor(() => (lastMsg()?.textContent || '').includes('Platform sosmednya yang mana?'), 'cb140 platform');
  recBtn(lastMsg(), 'Threads').click();
  await waitFor(() => JSON.parse(store.get('minime.library.added') || '[]').some((x) => (x.o || '').startsWith('Threads:')), 'cb140 threads lib');
  check('v140: Threads dibagi per bagian @ maks 500 karakter', bodyText().includes('(1/') && bodyText().includes('(2/'));
  const lib140t = JSON.parse(store.get('minime.library.added') || '[]');
  check('v140: thread tersimpan di Library', lib140t.some((x) => (x.o || '').startsWith('Threads:')), JSON.stringify(lib140t.map((x) => x.o)));
  // §25 v140: Sosmed — Instagram Image satu per satu (tujuan + pendekatan + handoff Image Editor).
  await sendMsg('halo Kreatif, buatkan konten instagram kopi');
  await waitFor(() => (lastMsg()?.textContent || '').includes('dipergunakan untuk apa?'), 'cb140s purpose');
  recBtn(lastMsg(), 'Konten Sosial Media').click();
  await waitFor(() => (lastMsg()?.textContent || '').includes('Platform sosmednya yang mana?'), 'cb140s platform');
  recBtn(lastMsg(), 'Instagram').click();
  await waitFor(() => (lastMsg()?.textContent || '').includes('Jenis postingannya apa?'), 'cb140s format');
  recBtn(lastMsg(), 'Image').click();
  await waitFor(() => (lastMsg()?.textContent || '').includes('Tujuannya apa?'), 'cb140s purpose2');
  recBtn(lastMsg(), 'Promosional').click();
  await waitFor(() => (lastMsg()?.textContent || '').includes('Pendekatannya mau yang mana?'), 'cb140s approach');
  recBtn(lastMsg(), 'Infografis').click();
  await waitFor(() => (lastMsg()?.textContent || '').includes('Posting 1 per 1 atau bulk'), 'cb140s count');
  recBtn(lastMsg(), 'Satu per satu').click();
  await waitFor(() => JSON.parse(store.get('minime.library.added') || '[]').some((x) => (x.o || '').startsWith('Image:')), 'cb140s image lib');
  check('v140: image single mengarahkan ke Image Editor', !!document.querySelector('#chatBox [data-act="cb-open-image"]'));
  const lib140i = JSON.parse(store.get('minime.library.added') || '[]');
  check('v140: image single tersimpan di Library', lib140i.some((x) => (x.o || '').startsWith('Image:')), JSON.stringify(lib140i.map((x) => x.o)));
  // §26 v140: Sosmed — Instagram Carousel bulk 3 tab (ganti tab mengganti brief aktif).
  await sendMsg('halo Kreatif, buatkan konten carousel instagram kopi');
  await waitFor(() => (lastMsg()?.textContent || '').includes('dipergunakan untuk apa?'), 'cb140c purpose');
  recBtn(lastMsg(), 'Konten Sosial Media').click();
  await waitFor(() => (lastMsg()?.textContent || '').includes('Platform sosmednya yang mana?'), 'cb140c platform');
  recBtn(lastMsg(), 'Instagram').click();
  await waitFor(() => (lastMsg()?.textContent || '').includes('Jenis postingannya apa?'), 'cb140c format');
  recBtn(lastMsg(), 'Carousel').click();
  await waitFor(() => (lastMsg()?.textContent || '').includes('Tujuannya apa?'), 'cb140c purpose2');
  recBtn(lastMsg(), 'Promosional').click();
  await waitFor(() => (lastMsg()?.textContent || '').includes('Pendekatannya mau yang mana?'), 'cb140c approach');
  recBtn(lastMsg(), 'Listicle').click();
  await waitFor(() => (lastMsg()?.textContent || '').includes('Posting 1 per 1 atau bulk'), 'cb140c count');
  recBtn(lastMsg(), 'Bulk').click();
  await waitFor(() => (lastMsg()?.textContent || '').includes('Bulk untuk berapa postingan?'), 'cb140c bulkn');
  await sendMsg('3');
  await waitFor(() => JSON.parse(store.get('minime.library.added') || '[]').some((x) => (x.o || '').startsWith('Bulk Carousel:')), 'cb140c carousel lib');
  const tabs140 = document.querySelectorAll('#img-bulk-tabs .img-tab');
  check('v140: bulk carousel membuat 3 tab Image Editor', tabs140.length === 3, 'tabs=' + tabs140.length);
  tabs140[1].click();
  const brief140 = document.getElementById('img-brief')?.value || '';
  check('v140: ganti tab bulk mengganti brief aktif', brief140.includes('Carousel dua'), brief140.slice(0, 80));
  const lib140c = JSON.parse(store.get('minime.library.added') || '[]');
  check('v140: bulk carousel tersimpan di Library', lib140c.some((x) => (x.o || '').startsWith('Bulk Carousel:')), JSON.stringify(lib140c.map((x) => x.o)));
  // §27 v140: Sosmed — LinkedIn Reels (platform lain ikut pola Instagram + handoff Video Editor).
  await sendMsg('halo Kreatif, buatkan reels linkedin kopi');
  await waitFor(() => (lastMsg()?.textContent || '').includes('dipergunakan untuk apa?'), 'cb140r purpose');
  recBtn(lastMsg(), 'Konten Sosial Media').click();
  await waitFor(() => (lastMsg()?.textContent || '').includes('Platform sosmednya yang mana?'), 'cb140r platform');
  recBtn(lastMsg(), 'LinkedIn').click();
  await waitFor(() => (lastMsg()?.textContent || '').includes('Jenis postingannya apa?'), 'cb140r format');
  recBtn(lastMsg(), 'Reels').click();
  await waitFor(() => JSON.parse(store.get('minime.library.added') || '[]').some((x) => (x.o || '').startsWith('Reels:')), 'cb140r reels lib');
  check('v140: reels mengarahkan ke Video Editor', !!document.querySelector('#chatBox [data-act="cb-open-video"]'));
  const lib140r = JSON.parse(store.get('minime.library.added') || '[]');
  check('v140: reels tersimpan di Library', lib140r.some((x) => (x.o || '').startsWith('Reels:')), JSON.stringify(lib140r.map((x) => x.o)));




} catch (e) {
  // eslint-disable-next-line no-console
  console.log('FAIL rig-chat exception :: ' + (e && e.stack ? e.stack : e));
  failed++;
}

// eslint-disable-next-line no-console
console.log(failed === 0 ? 'RIG-CHAT ALL PASSED' : 'RIG-CHAT FAILED');
process.exit(failed === 0 ? 0 : 1);
