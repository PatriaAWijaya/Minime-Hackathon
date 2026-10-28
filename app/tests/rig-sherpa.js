// Rig Sherpa (jsdom, test-only): membuktikan wiring subseksi Sherpa di
// tab Voice — BUKAN mock logika bisnis:
//  1. Tombol Setup Sherpa + Generate via Sherpa ada.
//  2. Setup Sherpa memanggil invoke sherpa_setup (bukan vs_*).
//  3. Generate via Sherpa memanggil invoke sherpa_tts SAJA (tanpa
//     vs_launch, tanpa fetch speech) dan mengisi player yang sama.
// Jalankan: npm run rig:sherpa (butuh dist ter-build + jsdom devDependency).
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
  if (cmd === 'sherpa_setup') {
    return { installed: true, modelPath: '/Users/mac/minime-voices/sherpa-id/id_ID-news_tts-medium.onnx', tokensPath: '/Users/mac/minime-voices/sherpa-id/tokens.txt' };
  }
  if (cmd === 'sherpa_tts') {
    return { dataUrl: 'blob:sherpa-test', sampleRate: 22050, durationSecs: 2.5 };
  }
  if (cmd === 'sherpa_status') {
    return { installed: true, modelPath: '/Users/mac/minime-voices/sherpa-id/id_ID-news_tts-medium.onnx' };
  }
  throw new Error('unexpected invoke ' + cmd);
}

async function fetchStub(url) {
  log.push('fetch:' + String(url));
  throw new Error('unexpected fetch ' + url);
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

  const sbtns = [...panel.querySelectorAll('button')].map((b) => b.textContent.trim());
  check('tombol Sherpa ada', sbtns.includes('Setup Sherpa') && sbtns.includes('Generate via Sherpa'), sbtns.join('|'));
  check('status Sherpa ada', !!document.getElementById('sherpaStatus'));
  check('catatan Sherpa ada', !!document.getElementById('sherpaNote'));

  log.length = 0;
  [...panel.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Setup Sherpa').click();
  await tick(200);
  check('Setup memanggil sherpa_setup', log.includes('invoke:sherpa_setup'), log.join(','));
  check('Setup selesai (note siap)', (document.getElementById('sherpaNote')?.textContent || '').includes('siap'), document.getElementById('sherpaNote')?.textContent || '');

  log.length = 0;
  document.getElementById('vsText').value = 'Halo, ini uji suara Sherpa native.';
  [...panel.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Generate via Sherpa').click();
  await tick(500);
  check('Generate Sherpa memanggil sherpa_tts', log.includes('invoke:sherpa_tts'), log.join(','));
  check('tanpa vs_launch / fetch (jalur native murni)', !log.some((x) => x.includes('vs_launch') || x.startsWith('fetch:')), log.join(','));
  check('audio Sherpa kembali ke player yang sama', document.getElementById('vsAudio')?.src === 'blob:sherpa-test', document.getElementById('vsAudio')?.src || '');
  check('note menyebut Sherpa + 22050 Hz', (document.getElementById('sherpaNote')?.textContent || '').includes('Sherpa') && (document.getElementById('sherpaNote')?.textContent || '').includes('22050'), document.getElementById('sherpaNote')?.textContent || '');
} catch (e) {
  console.log('FAIL rig error: ' + (e && e.message ? e.message : String(e)));
  failures.push('rig error');
}

console.log(failures.length === 0 ? 'RIG-SHERPA ALL PASSED' : 'RIG-SHERPA FAILED: ' + failures.join(', '));
process.exit(failures.length === 0 ? 0 : 1);
