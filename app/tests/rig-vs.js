// Rig VoiceStudio (jsdom, test-only): membuktikan wiring tab Voice di
// bundle yang sudah di-build — BUKAN mock logika bisnis:
//  1. Tombol Setup (Pasang + Buka) ada dan memanggil invoke vs_install.
//  2. Generate TTS saat backend mati MEMANGGIL vs_launch DULU sebelum
//     fetch /v1/audio/speech (urutan auto-launch agen).
//  3. Bila backend sudah hidup, Generate TIDAK memanggil vs_launch lagi.
//  4. Audio hasil kembali ke MiniMe: #vsAudio.src terisi + note selesai.
// Jalankan: npm run rig:vs (butuh dist ter-build + jsdom devDependency).
// Keluar 0 bila semua lolos, 1 bila ada yang gagal.

import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(dir, '..', 'dist');
let html = fs.readFileSync(path.join(distDir, 'index.html'), 'utf-8');
// Transform test-only (pola rig lama): jsdom tidak mengeksekusi script
// type=module — pindahkan bundle ke akhir body sebagai script klasik.
const modMatch = html.match(/<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/);
if (!modMatch) throw new Error('script module dist tidak ditemukan');
html = html.replace(modMatch[0], '').replace('</body>', `<script src="${modMatch[1]}"></script></body>`);

const log = [];
let backendAlive = false;

function makeResp({ ok = true, status = 200, jsonData = null, blobData = null, contentType = 'application/json' } = {}) {
  return {
    ok,
    status,
    headers: { get: (k) => (k.toLowerCase() === 'content-type' ? contentType : null) },
    json: async () => jsonData,
    blob: async () => blobData ?? new Blob(['RIFF....'], { type: 'audio/wav' }),
    text: async () => (jsonData ? JSON.stringify(jsonData) : ''),
  };
}

async function invokeStub(cmd) {
  log.push('invoke:' + cmd);
  if (cmd === 'vs_launch') {
    backendAlive = true;
    return { backendUp: true, appPath: '/Applications/VoiceStudio.app' };
  }
  if (cmd === 'vs_install') {
    backendAlive = true;
    return { installed: true, skippedDownload: true, appPath: '/Applications/VoiceStudio.app', backendUp: true, version: 'existing' };
  }
  throw new Error('unexpected invoke ' + cmd);
}

async function fetchStub(url) {
  const u = String(url);
  const p = u.replace(/^https?:\/\/127\.0\.0\.1:3900/, '');
  log.push('fetch:' + p);
  if (p === '/v1/models') {
    if (!backendAlive) throw new Error('fetch failed');
    return makeResp({ jsonData: [] });
  }
  if (p === '/v1/audio/voices') {
    if (!backendAlive) throw new Error('fetch failed');
    return makeResp({ jsonData: [] });
  }
  if (p === '/v1/audio/speech') {
    if (!backendAlive) throw new Error('fetch failed');
    return makeResp({ contentType: 'audio/wav' });
  }
  if (p === '/health') {
    if (!backendAlive) throw new Error('fetch failed');
    return makeResp({ jsonData: { status: 'ok', device: 'mps', version: '0.5.6' } });
  }
  if (u.startsWith('http://localhost:3901/')) {
    // Probe UI embed (no-cors di app asli): resolve = port menjawab.
    if (!backendAlive) throw new Error('fetch failed');
    return makeResp({});
  }
  throw new Error('unexpected fetch ' + u);
}

const dom = new JSDOM(html, {
  url: 'file://' + distDir + '/index.html',
  resources: 'usable',
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  beforeParse(window) {
    window.__TAURI_INTERNALS__ = { invoke: invokeStub };
    window.fetch = fetchStub;
    window.URL.createObjectURL = () => 'blob:vs-test';
  },
});

const { document } = dom.window;
const tick = (ms = 50) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, label, tries = 100) {
  for (let i = 0; i < tries; i++) {
    const v = fn();
    if (v) return v;
    await tick();
  }
  throw new Error('timeout menunggu ' + label);
}

const failures = [];
function check(name, cond, extra = '') {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' — ' + extra));
  if (!cond) failures.push(name);
}

try {
  await waitFor(() => document.querySelector('[data-view="media"]'), 'tombol rail media');
  document.querySelector('[data-view="media"]').click();
  await tick(100);
  const voiceBtn = await waitFor(() => document.getElementById('ms-tabbtn-voice'), 'tombol tab voice');
  voiceBtn.click();
  await tick(100);
  const panel = document.getElementById('ms-tab-voice');
  check('panel voice tampil', panel && panel.style.display !== 'none');

  const btns = [...panel.querySelectorAll('button')].map((b) => b.textContent.trim());
  check('tombol Setup ada', btns.includes('Pasang VoiceStudio') && btns.includes('Buka & Periksa Backend'), btns.join('|'));
  check('catatan Setup ada', !!document.getElementById('vsSetupNote'));

  log.length = 0;
  [...panel.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Pasang VoiceStudio').click();
  await tick(200);
  check('Setup memanggil vs_install', log.includes('invoke:vs_install'), log.join(','));
  check('Setup selesai (note siap)', (document.getElementById('vsSetupNote')?.textContent || '').includes('siap'), document.getElementById('vsSetupNote')?.textContent || '');

  // Uji urutan agen: backend mati -> Generate harus launch dulu.
  log.length = 0;
  backendAlive = false;
  document.getElementById('vsText').value = 'Halo, ini uji suara MiniMe.';
  [...panel.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Generate').click();
  await tick(500);
  const launchIdx = log.indexOf('invoke:vs_launch');
  const speechIdx = log.indexOf('fetch:/v1/audio/speech');
  check('Generate memanggil vs_launch saat backend mati', launchIdx >= 0, log.join(','));
  check('vs_launch SEBELUM fetch speech (urutan agen)', launchIdx >= 0 && speechIdx > launchIdx, log.join(','));
  check('audio kembali ke MiniMe (player terisi)', document.getElementById('vsAudio')?.src === 'blob:vs-test', document.getElementById('vsAudio')?.src || '');
  check('note TTS selesai', (document.getElementById('vsNote')?.textContent || '').includes('siap'), document.getElementById('vsNote')?.textContent || '');

  // Panel embed VoiceStudio: probe :3901 + cek koneksi API.
  backendAlive = true;
  check('panel embed ada (iframe + status + catatan)', !!document.getElementById('vsEmbedFrame') && !!document.getElementById('vsEmbedStatus') && !!document.getElementById('vsEmbedNote'));
  [...document.querySelectorAll('.vs-embed button')].find((b) => b.textContent.trim() === 'Muat ulang').click();
  await tick(300);
  check('embed: iframe terpasang saat :3901 menjawab', document.getElementById('vsEmbedFrame')?.getAttribute('src') === 'http://localhost:3901', document.getElementById('vsEmbedFrame')?.getAttribute('src') || '');
  check('embed: status Terhubung', (document.getElementById('vsEmbedStatus')?.textContent || '').includes('Terhubung'), document.getElementById('vsEmbedStatus')?.textContent || '');
  check('embed: koneksi API terverifikasi (versi + device)', (document.getElementById('vsEmbedNote')?.textContent || '').includes('0.5.6') && (document.getElementById('vsEmbedNote')?.textContent || '').includes('mps'), document.getElementById('vsEmbedNote')?.textContent || '');

  // Backend sudah hidup -> Generate tidak launch lagi.
  log.length = 0;
  document.getElementById('vsText').value = 'Kedua kalinya langsung jalan.';
  [...panel.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Generate').click();
  await tick(500);
  check('Generate tanpa vs_launch saat backend hidup', !log.includes('invoke:vs_launch'), log.join(','));
  check('speech tetap terpanggil', log.includes('fetch:/v1/audio/speech'), log.join(','));
} catch (e) {
  console.log('FAIL rig error: ' + (e && e.message ? e.message : String(e)));
  failures.push('rig error');
}

console.log(failures.length === 0 ? 'RIG-VS ALL PASSED' : 'RIG-VS FAILED: ' + failures.join(', '));
process.exit(failures.length === 0 ? 0 : 1);
