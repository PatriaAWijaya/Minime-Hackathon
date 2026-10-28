// Rig Script Editor (jsdom, test-only): membuktikan wiring tab Script
// di Media Studio — BUKAN mock logika bisnis:
//  1. Sidebar 3 menu ada; klik Artikel/Movie mengganti window utama.
//  2. Format Image/Carousel/Reels HANYA muncul bila platform Instagram.
//  3. Generate tanpa Apa ditolak validasi (tanpa model call).
//  4. Generate dengan Apa terisi memanggil router (fetch chat-completions
//     yang di-stub) dan menampilkan hasil di window utama.
// Jalankan: npm run rig:script (butuh dist ter-build + jsdom devDependency).
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
  // Stub jawaban Meta chat-completions (bentuk yang dibaca router).
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
    window.URL.createObjectURL = () => 'blob:script-test';
    // localStorage mock deterministik (asal file:// tidak dijamin).
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
  throw new Error('timeout menunggu ' + label);
}

const failures = [];
function check(name, cond, extra = '') {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' — ' + extra));
  if (!cond) failures.push(name);
}

function clickRadio(value) {
  const el = document.querySelector(`input[name="se-platform"][value="${value}"]`);
  if (!el) throw new Error('radio platform ' + value + ' tidak ada');
  el.click();
}

try {
  await waitFor(() => document.querySelector('[data-view="media"]'), 'tombol rail media');
  document.querySelector('[data-view="media"]').click();
  await tick(100);
  const scriptBtn = await waitFor(() => document.getElementById('ms-tabbtn-script'), 'tombol tab script');
  scriptBtn.click();
  await tick(150);
  const panel = document.getElementById('ms-tab-script');
  check('panel script tampil', panel && panel.style.display !== 'none');

  const menus = [...panel.querySelectorAll('.se-menubtn')].map((b) => b.getAttribute('data-se-menu'));
  check('sidebar 3 menu', menus.join(',') === 'social,artikel,movie', menus.join(','));

  // Default: Social Media + Instagram -> baris format tampil.
  check('default pane social (radio platform ada)', !!document.querySelector('input[name="se-platform"]'));
  check('format tampil untuk Instagram', !!document.getElementById('se-format-row'));

  // TikTok -> baris format hilang; kembali ke Instagram -> muncul lagi.
  clickRadio('tiktok');
  await tick(100);
  check('format hilang untuk TikTok', !document.getElementById('se-format-row'));
  clickRadio('instagram');
  await tick(100);
  check('format muncul lagi untuk Instagram', !!document.getElementById('se-format-row'));

  // Pindah menu: Artikel lalu Movie lalu kembali ke Social.
  [...panel.querySelectorAll('.se-menubtn')].find((b) => b.getAttribute('data-se-menu') === 'artikel').click();
  await tick(100);
  check('pane artikel (topik ada)', !!document.getElementById('se-topic'));
  [...panel.querySelectorAll('.se-menubtn')].find((b) => b.getAttribute('data-se-menu') === 'movie').click();
  await tick(100);
  check('pane movie (premis ada)', !!document.getElementById('se-premise'));
  [...panel.querySelectorAll('.se-menubtn')].find((b) => b.getAttribute('data-se-menu') === 'social').click();
  await tick(100);
  check('kembali ke social (5W1H ada)', !!document.getElementById('se-what'));

  // Validasi: Generate tanpa Apa -> catatan validasi, tanpa fetch.
  log.length = 0;
  document.getElementById('se-generate').click();
  await tick(150);
  const note1 = document.getElementById('se-note')?.textContent || '';
  check('generate tanpa Apa ditolak validasi', note1.includes('Apa'), note1);
  check('tanpa model call saat validasi gagal', !log.some((x) => x.startsWith('fetch:')), log.join(','));

  // Generate dengan Apa terisi -> fetch router + hasil tampil.
  store.set('minime.metaKey', 'rig-test-key');
  document.getElementById('se-what').value = 'Es kopi susu Rp15.000';
  document.getElementById('se-what').dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  await tick(50);
  log.length = 0;
  document.getElementById('se-generate').click();
  await waitFor(() => document.getElementById('se-output'), 'output script', 120);
  const out = document.getElementById('se-output')?.textContent || '';
  check('hasil generate tampil di window utama', out.includes('NASKAH-UJI'), out);
  check('generate memanggil router (fetch chat-completions)', log.some((x) => x.includes('chat/completions')), log.join(','));
  const notes = [...document.querySelectorAll('#se-main .se-note')].map((n) => n.textContent).join(' ');
  check('footer menyebut provider meta', notes.includes('meta'), notes);
} catch (e) {
  console.log('FAIL rig error: ' + (e && e.message ? e.message : String(e)));
  failures.push('rig error');
}

console.log(failures.length === 0 ? 'RIG-SCRIPT ALL PASSED' : 'RIG-SCRIPT FAILED: ' + failures.join(', '));
process.exit(failures.length === 0 ? 0 : 1);
