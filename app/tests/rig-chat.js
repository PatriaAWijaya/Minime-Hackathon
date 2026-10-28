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

async function fetchStub(url) {
  log.push('fetch:' + String(url));
  return makeResp({
    jsonData: {
      choices: [{ message: { content: 'NASKAH-UJI: Hook kopi susu, isi 5W1H, CTA order via chat.' } }],
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
// Hitung hanya MODEL call: sejak 29 Okt, onMount menjalankan vsCheck()
// (perbaikan MINOR-2: status VoiceStudio tidak lagi kosong saat load),
// yang mem-ping localhost:3900 (status + daftar model + voice = 3 fetch
// lokal). Itu cek status lokal, bukan model call — dikecualikan agar
// asersi '1 model call' / 'tanpa fetch' tetap bermakna.
const fetchCount = () =>
  log.filter((l) => l.startsWith('fetch:') && !l.includes('127.0.0.1:3900')).length;
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
  const userBubbleRules = cssText.match(/\.msg\.user \.bubble\{[^}]*\}/g) || [];
  check('isi bubble user rata kanan', userBubbleRules.some((r) => r.includes('text-align:right')), userBubbleRules.join(' | ').slice(0, 200));
} catch (e) {
  // eslint-disable-next-line no-console
  console.log('FAIL rig-chat exception :: ' + (e && e.stack ? e.stack : e));
  failed++;
}

// eslint-disable-next-line no-console
console.log(failed === 0 ? 'RIG-CHAT ALL PASSED' : 'RIG-CHAT FAILED');
process.exit(failed === 0 ? 0 : 1);
