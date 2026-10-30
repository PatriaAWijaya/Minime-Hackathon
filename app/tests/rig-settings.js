// Rig Settings Kunci API (jsdom, test-only): membuktikan tombol per-kunci —
// BUKAN mock logika bisnis:
//  1. Tombol per-kunci tampil (Gemini/Meta saja, v63: Postiz dihapus);
//     tombol simpan bersama + baris status bersama HILANG (tidak ada
//     #keyStatus, tidak ada tombol "Simpan Kunci", sumber
//     chat.ts/App.svelte/i18n.ts tidak lagi menyebut
//     saveKeys/keyStatus/kunci mati).
//  2. Awal: semua tombol "Hubungkan API" (belum ada kunci).
//  3. Gemini: ketik kunci -> klik -> fetch Gemini sukses -> tombol
//     TERHUBUNG + kelas hijau + kunci tersimpan + flag validasi; kunci
//     Meta yang sudah tersimpan TIDAK ikut berubah (bukti tidak ada
//     fungsi tumpang tindih: simpan per-kunci, bukan simpan semua).
//  4. Meta kunci salah -> fetch 401 -> tombol tetap "Hubungkan API" +
//     catatan ditolak + flag validasi TIDAK terpasang.
//  5. Kartu Postiz/FB/provider HILANG (v63); 3 kartu kunci tersisa
//     (Gemini, Meta, Ollama).
//  6. Klik dengan input kosong + tanpa kunci tersimpan -> no-op
//     (tidak ada fetch/invoke baru).
// Jalankan: npm run rig:settings (butuh dist ter-build + jsdom devDependency).
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
let geminiBad = false;
let metaBad = false;

function makeResp({ ok = true, status = 200, jsonData = null } = {}) {
  return {
    ok,
    status,
    headers: { get: () => 'application/json' },
    json: async () => jsonData,
    text: async () => (jsonData ? JSON.stringify(jsonData) : ''),
  };
}

async function invokeStub(cmd, args) {
  log.push('invoke:' + cmd);
  const req = (args && args.req) || {};
  throw new Error('unexpected invoke ' + cmd);
}

async function fetchStub(url) {
  const u = String(url);
  log.push('fetch:' + u);
  if (u.includes('generativelanguage')) {
    if (geminiBad) return makeResp({ ok: false, status: 400, jsonData: { error: { message: 'API key not valid' } } });
    return makeResp({ jsonData: { candidates: [{ content: { parts: [{ text: 'OK' }] } }], usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 2 } } });
  }
  if (u.includes('api.meta.ai')) {
    if (metaBad) return makeResp({ ok: false, status: 401, jsonData: { error: { message: 'unauthorized' } } });
    return makeResp({ jsonData: { choices: [{ message: { content: 'OK' } }], usage: { prompt_tokens: 5, completion_tokens: 2 } } });
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
    window.URL.createObjectURL = () => 'blob:test';
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
async function waitFor(fn, label, tries = 200) {
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
const btn = (kind) => document.getElementById(kind === 'gemini' ? 'keyBtnGemini' : 'keyBtnMeta');
const note = (kind) => document.getElementById(kind === 'gemini' ? 'keyNoteGemini' : 'keyNoteMeta');
const validated = () => { try { return JSON.parse(store.get('minime.keyValidated') || '{}'); } catch { return {}; } };
const fetchCount = (part) => log.filter((l) => l.startsWith('fetch:') && l.includes(part)).length;

try {
  await waitFor(() => typeof dom.window.showView === 'function', 'mount showView', 120);

  // 1. Tombol per-kunci tampil (Gemini/Meta); kartu Postiz hilang.
  check('tombol per-kunci tampil', !!btn('gemini') && !!btn('meta') && !document.getElementById('keyBtnPostiz') && !document.getElementById('apiKeyPostiz'));
  check('baris status bersama hilang', !document.getElementById('keyStatus'));
  const sharedBtn = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Simpan Kunci');
  check('tombol Simpan bersama hilang', !sharedBtn);
  const chatSrc = fs.readFileSync(path.join(dir, '..', 'src', 'lib', 'chat.ts'), 'utf-8');
  const appSrc = fs.readFileSync(path.join(dir, '..', 'src', 'App.svelte'), 'utf-8');
  const i18nSrc = fs.readFileSync(path.join(dir, '..', 'src', 'lib', 'i18n.ts'), 'utf-8');
  check('sumber bebas saveKeys/keyStatus', !chatSrc.includes('saveKeys') && !chatSrc.includes('keyStatus') && !appSrc.includes('saveKeys') && !appSrc.includes('keyStatus'));
  check('kunci i18n mati dihapus', !i18nSrc.includes("'key.save'") && !i18nSrc.includes("'key.saved'") && !i18nSrc.includes("'key.empty'") && !i18nSrc.includes("'key.ollama.short'") && !i18nSrc.includes("'key.postiz'") && !i18nSrc.includes("'key.ph.postiz'") && !i18nSrc.includes("'fb.card.title'") && !i18nSrc.includes("'prov.card.title'") && !i18nSrc.includes("'planner.postiz."));

  // 2. Awal: semua "Hubungkan API".
  check('awal semua Hubungkan API', btn('gemini').textContent === 'Hubungkan API' && btn('meta').textContent === 'Hubungkan API');

  // 3. Gemini lolos uji -> TERHUBUNG hijau; kunci lain tidak tersentuh.
  store.set('minime.metaKey', 'meta-saved');
  document.getElementById('apiKeyGemini').value = 'gemini-ok';
  btn('gemini').click();
  await waitFor(() => btn('gemini').textContent === 'TERHUBUNG', 'gemini TERHUBUNG', 200);
  check('gemini TERHUBUNG + hijau + tersimpan + tervalidasi', btn('gemini').textContent === 'TERHUBUNG' && btn('gemini').className.includes('btn-connected') && store.get('minime.geminiKey') === 'gemini-ok' && validated().gemini === true);
  check('simpan per-kunci tidak menyentuh kunci lain', store.get('minime.metaKey') === 'meta-saved');

  // 4. Meta kunci salah -> tetap Hubungkan + catatan ditolak + tak tervalidasi.
  metaBad = true;
  document.getElementById('apiKeyMeta').value = 'bad-meta';
  btn('meta').click();
  await waitFor(() => note('meta').textContent.includes('ditolak'), 'catatan meta ditolak', 200);
  check('meta salah -> tetap Hubungkan + catatan + tak tervalidasi', btn('meta').textContent === 'Hubungkan API' && !validated().meta && store.get('minime.metaKey') === 'bad-meta');
  metaBad = false;

  // 5. Kartu Postiz/FB/provider hilang (v63); 3 kartu kunci tersisa.
  check('kartu Postiz/FB/provider hilang', !document.getElementById('fbStatusNote') && !document.getElementById('provNote') && document.querySelectorAll('.prov-card').length === 0);
  check('3 kartu kunci tersisa (Gemini, Meta, Ollama)', document.querySelectorAll('.key-card').length === 3);

  // 6. Klik kosong tanpa kunci tersimpan -> no-op (tanpa fetch baru).
  // (Teks tombol tidak diasersi di sini: di app nyata, state tombol
  // hanya berubah lewat connectKey yang selalu me-render ulang, jadi
  // tidak ada jalur yang membuat tombol basi seperti hapus storage
  // manual di rig ini. Yang dibuktikan: klik kosong tidak memicu uji.)
  store.delete('minime.geminiKey');
  store.delete('minime.keyValidated');
  document.getElementById('apiKeyGemini').value = '';
  const gemFetchBefore = fetchCount('generativelanguage');
  btn('gemini').click();
  await tick(200);
  check('klik kosong -> no-op (tanpa fetch baru)', fetchCount('generativelanguage') === gemFetchBefore);

  // 7. Kartu v53: tombol sejajar kanan input + ketikan baru membatalkan
  // hijau basi (tanpa mengubah kunci/flag tersimpan). v78: kartu kunci
  // ber-input menjadi 3 (Gemini, Meta, Ollama) — kartu Ollama yang dulu
  // MATI (hanya label) kini punya input URL + tombol Periksa.
  const keyRows = [...document.querySelectorAll('.key-card .key-row')].filter((row) => row.querySelector('input'));
  check('tiap kartu kunci: input + tombol sebaris', keyRows.length === 3 && keyRows.every((row) => row.querySelector('button')));
  // 8. Ikon nav v54: wiring + isi file baru (bukti dist menyalin ikon
  // kiriman Patria, bukan ikon lama). IHDR PNG: lebar di byte 16-19,
  // tinggi di byte 20-23 (big-endian).
  const pngSize = (buf) => ({ w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) });
  const kanbanImg = document.querySelector('button[data-view="kanban"] img');
  const mediaImg = document.querySelector('button[data-view="media"] img');
  check('nav kanban + media memakai file ikon', !!kanbanImg && kanbanImg.getAttribute('src') === './kanban-icon.png' && !!mediaImg && mediaImg.getAttribute('src') === './media-icon.png');
  const kanbanDist = pngSize(fs.readFileSync(path.join(distDir, 'kanban-icon.png')));
  const mediaDist = pngSize(fs.readFileSync(path.join(distDir, 'media-icon.png')));
  check('dist kanban-icon = ikon baru 712x678', kanbanDist.w === 712 && kanbanDist.h === 678, JSON.stringify(kanbanDist));
  check('dist media-icon = ikon baru 712x541', mediaDist.w === 712 && mediaDist.h === 541, JSON.stringify(mediaDist));

  // v109: tema — default sistem, paksa gelap/terang, Dark Violet Glass.
  check('v109: tema default = system', dom.window.getTheme() === 'system', String(dom.window.getTheme()));
  check('v109: select tema ada di Settings + 3 opsi', !!document.getElementById('themeSel') && document.getElementById('themeSel').querySelectorAll('option').length === 3, document.getElementById('themeSel')?.innerHTML?.slice(0, 120) || '');
  dom.window.setTheme('dark');
  check('v109: setTheme dark -> data-theme dark + tersimpan', document.documentElement.getAttribute('data-theme') === 'dark' && store.get('minime.theme') === 'dark', document.documentElement.getAttribute('data-theme') || '');
  dom.window.setTheme('light');
  check('v109: setTheme light -> data-theme light', document.documentElement.getAttribute('data-theme') === 'light', document.documentElement.getAttribute('data-theme') || '');
  dom.window.setTheme('system');
  check('v109: setTheme system -> tersimpan system (jsdom: system gelap false -> light)', store.get('minime.theme') === 'system' && document.documentElement.getAttribute('data-theme') === 'light', document.documentElement.getAttribute('data-theme') || '');
  const cssLink109 = html.match(/<link[^>]*href="([^"]+\.css)"/);
  const cssText109 = (cssLink109 ? fs.readFileSync(path.join(distDir, cssLink109[1]), 'utf-8') : '').toLowerCase();
  check('v109: CSS ter-build memuat Dark Violet Glass (data-theme dark + blur)', cssText109.includes('data-theme') && cssText109.includes('backdrop-filter'), '');
  check('v111: CSS ter-build tema gelap diredam (dasar #0e0718 + magenta pekat #a21caf + gradien + sheen)', cssText109.includes('#0e0718') && cssText109.includes('#a21caf') && cssText109.includes('linear-gradient') && cssText109.includes('inset 0 1px'), '');
} catch (e) {
  check('rig-settings exception', false, e && e.stack ? e.stack : String(e));
}

// eslint-disable-next-line no-console
console.log(failed === 0 ? 'RIG-SETTINGS ALL PASSED' : `RIG-SETTINGS ${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
