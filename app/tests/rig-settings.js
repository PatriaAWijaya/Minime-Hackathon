// Rig Settings Kunci API (jsdom, test-only): membuktikan tombol per-kunci v52 —
// BUKAN mock logika bisnis:
//  1. Tombol per-kunci tampil (Gemini/Meta/Postiz); tombol simpan bersama
//     + baris status bersama HILANG (tidak ada #keyStatus, tidak ada
//     tombol "Simpan Kunci", sumber chat.ts/App.svelte/i18n.ts tidak
//     lagi menyebut saveKeys/keyStatus/kunci mati).
//  2. Awal: semua tombol "Hubungkan API" (belum ada kunci).
//  3. Gemini: ketik kunci -> klik -> fetch Gemini sukses -> tombol
//     TERHUBUNG + kelas hijau + kunci tersimpan + flag validasi; kunci
//     Meta/Postiz yang sudah tersimpan TIDAK ikut berubah (bukti tidak
//     ada fungsi tumpang tindih: simpan per-kunci, bukan simpan semua).
//  4. Meta kunci salah -> fetch 401 -> tombol tetap "Hubungkan API" +
//     catatan ditolak + flag validasi TIDAK terpasang.
//  5. Postiz: ping 200 -> TERHUBUNG; ping 401 sesudahnya -> tanda
//     TERHUBUNG dicabut + catatan ditolak (uji gagal mencabut hijau).
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
let pingMode = 'ok';

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
  if (cmd === 'postiz_request' && req.op === 'ping') {
    if (pingMode === 'badkey') return { status: 401, body: JSON.stringify({ msg: 'Invalid API key' }) };
    return { status: 200, body: JSON.stringify([{ id: 'ig1' }]) };
  }
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
const btn = (kind) => document.getElementById(kind === 'gemini' ? 'keyBtnGemini' : kind === 'meta' ? 'keyBtnMeta' : 'keyBtnPostiz');
const note = (kind) => document.getElementById(kind === 'gemini' ? 'keyNoteGemini' : kind === 'meta' ? 'keyNoteMeta' : 'keyNotePostiz');
const validated = () => { try { return JSON.parse(store.get('minime.keyValidated') || '{}'); } catch { return {}; } };
const fetchCount = (part) => log.filter((l) => l.startsWith('fetch:') && l.includes(part)).length;

try {
  await tick(500);

  // 1. Tombol per-kunci tampil; tombol bersama + status bersama hilang.
  check('tombol per-kunci tampil', !!btn('gemini') && !!btn('meta') && !!btn('postiz'));
  check('baris status bersama hilang', !document.getElementById('keyStatus'));
  const sharedBtn = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Simpan Kunci');
  check('tombol Simpan bersama hilang', !sharedBtn);
  const chatSrc = fs.readFileSync(path.join(dir, '..', 'src', 'lib', 'chat.ts'), 'utf-8');
  const appSrc = fs.readFileSync(path.join(dir, '..', 'src', 'App.svelte'), 'utf-8');
  const i18nSrc = fs.readFileSync(path.join(dir, '..', 'src', 'lib', 'i18n.ts'), 'utf-8');
  check('sumber bebas saveKeys/keyStatus', !chatSrc.includes('saveKeys') && !chatSrc.includes('keyStatus') && !appSrc.includes('saveKeys') && !appSrc.includes('keyStatus'));
  check('kunci i18n mati dihapus', !i18nSrc.includes("'key.save'") && !i18nSrc.includes("'key.saved'") && !i18nSrc.includes("'key.empty'") && !i18nSrc.includes("'key.ollama.short'"));

  // 2. Awal: semua "Hubungkan API".
  check('awal semua Hubungkan API', btn('gemini').textContent === 'Hubungkan API' && btn('meta').textContent === 'Hubungkan API' && btn('postiz').textContent === 'Hubungkan API');

  // 3. Gemini lolos uji -> TERHUBUNG hijau; kunci lain tidak tersentuh.
  store.set('minime.metaKey', 'meta-saved');
  store.set('minime.postizKey', 'postiz-saved');
  document.getElementById('apiKeyGemini').value = 'gemini-ok';
  btn('gemini').click();
  await waitFor(() => btn('gemini').textContent === 'TERHUBUNG', 'gemini TERHUBUNG', 200);
  check('gemini TERHUBUNG + hijau + tersimpan + tervalidasi', btn('gemini').textContent === 'TERHUBUNG' && btn('gemini').className.includes('btn-connected') && store.get('minime.geminiKey') === 'gemini-ok' && validated().gemini === true);
  check('simpan per-kunci tidak menyentuh kunci lain', store.get('minime.metaKey') === 'meta-saved' && store.get('minime.postizKey') === 'postiz-saved');

  // 4. Meta kunci salah -> tetap Hubungkan + catatan ditolak + tak tervalidasi.
  metaBad = true;
  document.getElementById('apiKeyMeta').value = 'bad-meta';
  btn('meta').click();
  await waitFor(() => note('meta').textContent.includes('ditolak'), 'catatan meta ditolak', 200);
  check('meta salah -> tetap Hubungkan + catatan + tak tervalidasi', btn('meta').textContent === 'Hubungkan API' && !validated().meta && store.get('minime.metaKey') === 'bad-meta');
  metaBad = false;

  // 5. Postiz ping 200 -> TERHUBUNG; ping 401 sesudahnya -> hijau dicabut.
  pingMode = 'ok';
  document.getElementById('apiKeyPostiz').value = 'postiz-ok';
  btn('postiz').click();
  await waitFor(() => btn('postiz').textContent === 'TERHUBUNG', 'postiz TERHUBUNG', 200);
  check('postiz TERHUBUNG', btn('postiz').textContent === 'TERHUBUNG' && validated().postiz === true);
  pingMode = 'badkey';
  document.getElementById('apiKeyPostiz').value = 'postiz-bad';
  btn('postiz').click();
  await waitFor(() => btn('postiz').textContent === 'Hubungkan API', 'postiz hijau dicabut', 200);
  check('postiz gagal -> hijau dicabut + catatan', btn('postiz').textContent === 'Hubungkan API' && validated().postiz === false && note('postiz').textContent.includes('ditolak'));
  pingMode = 'ok';

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
  // hijau basi (tanpa mengubah kunci/flag tersimpan).
  check('kartu per-kunci tampil', document.querySelectorAll('.key-card').length === 4);
  const rowOk = [...document.querySelectorAll('.key-card .key-row')].every((row) => row.querySelector('input') && row.querySelector('button'));
  check('tiap kartu: input + tombol sebaris', rowOk);
  store.set('minime.geminiKey', 'gemini-ok');
  store.set('minime.keyValidated', JSON.stringify({ gemini: true }));
  document.getElementById('apiKeyGemini').value = '';
  // Picu handler oninput Svelte lewat event input (gelembung): tombol
  // harus mengikuti isi input, bukan flag lama.
  document.getElementById('apiKeyGemini').value = 'gemini-baru';
  document.getElementById('apiKeyGemini').dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  await tick(100);
  check('ketikan baru -> tombol kembali Hubungkan (bukan hijau basi)', btn('gemini').textContent === 'Hubungkan API');
  check('ketikan tidak mengubah kunci/flag tersimpan', store.get('minime.geminiKey') === 'gemini-ok' && JSON.parse(store.get('minime.keyValidated')).gemini === true);
  document.getElementById('apiKeyGemini').value = '';
  document.getElementById('apiKeyGemini').dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  await tick(100);
  check('input dikosongkan -> hijau kunci tersimpan kembali', btn('gemini').textContent === 'TERHUBUNG');

  // 8. Ikon nav v54: wiring + isi file baru (bukti dist menyalin ikon
  // kiriman Patria, bukan ikon lama). IHDR PNG: lebar di byte 16-19,
  // tinggi di byte 20-23 (big-endian).
  const pngSize = (buf) => ({ w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) });
  const kanbanImg = document.querySelector('button[data-view="kanban"] img');
  const mediaImg = document.querySelector('button[data-view="media"] img');
  check('nav kanban + media memakai file ikon', !!kanbanImg && kanbanImg.getAttribute('src') === './kanban-icon.png' && !!mediaImg && mediaImg.getAttribute('src') === './media-icon.png');
  const kanbanDist = pngSize(fs.readFileSync(path.join(distDir, 'kanban-icon.png')));
  const mediaDist = pngSize(fs.readFileSync(path.join(distDir, 'media-icon.png')));
  check('dist kanban-icon = ikon baru 741x740', kanbanDist.w === 741 && kanbanDist.h === 740, JSON.stringify(kanbanDist));
  check('dist media-icon = ikon baru 814x815', mediaDist.w === 814 && mediaDist.h === 815, JSON.stringify(mediaDist));
} catch (e) {
  check('rig-settings exception', false, e && e.stack ? e.stack : String(e));
}

// eslint-disable-next-line no-console
console.log(failed === 0 ? 'RIG-SETTINGS ALL PASSED' : `RIG-SETTINGS ${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
