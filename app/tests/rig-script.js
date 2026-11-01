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
const scriptBodies = [];

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
  try { scriptBodies.push(typeof opts?.body === 'string' ? JSON.parse(opts.body) : (opts?.body || {})); } catch (_) { /* abaikan body non-JSON */ }
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

  // 0. v84: mulai nol -> buat proyek uji (Revisi butuh proyek untuk chat + Kanban).
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
  document.querySelectorAll('.chan-row input[type="checkbox"]').forEach((cb) => cb.click());
  await tick(50);
  document.getElementById('ncCreateBtn').click();
  await tick(100);
  document.querySelector('[data-view="media"]').click();
  await tick(100);
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
  const out = document.getElementById('se-output')?.value || '';
  check('hasil generate tampil di window utama', out.includes('NASKAH-UJI'), out);
  check('output bisa diedit (textarea)', document.getElementById('se-output')?.tagName === 'TEXTAREA');

  // Edit langsung di output -> tersimpan ke state (localStorage mock).
  const outEl = document.getElementById('se-output');
  outEl.value = 'NASKAH-UJI-EDIT: Hook kopi susu, isi 5W1H, CTA order via chat.';
  outEl.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  await tick(50);
  check('edit output tersimpan', (store.get('minime.scriptEditor') || '').includes('NASKAH-UJI-EDIT'), store.get('minime.scriptEditor') || '');

  // Simpan ke Library -> kartu baru di libGrid; simpan ulang -> dedup.
  const rows = () => document.getElementById('libGrid')?.querySelectorAll('.lib-card').length || 0;
  [...document.querySelectorAll('#se-main button')].find((b) => b.textContent.trim() === 'Simpan ke Library').click();
  await tick(100);
  check('simpan menambah 1 kartu Library', rows() === 1, 'rows=' + rows());
  check('catatan tersimpan tampil', (document.getElementById('se-note')?.textContent || '').includes('Tersimpan'), document.getElementById('se-note')?.textContent || '');
  [...document.querySelectorAll('#se-main button')].find((b) => b.textContent.trim() === 'Simpan ke Library').click();
  await tick(100);
  check('simpan ulang tidak menduplikasi', rows() === 1, 'rows=' + rows());
  const saveBtn126 = [...document.querySelectorAll('#se-main button')].find((b) => b.textContent.trim() === 'Simpan ke Library');
  check('v126: Simpan sudah diklik -> hijau (class done)', !!saveBtn126 && saveBtn126.classList.contains('done'), saveBtn126?.className || '');

  // Gunakan -> tetap 1 baris (dedup) + pindah ke editor berikutnya (Image).
  [...document.querySelectorAll('#se-main button')].find((b) => b.textContent.trim() === 'Gunakan').click();
  await tick(150);
  check('gunakan tidak menduplikasi Library', rows() === 1, 'rows=' + rows());
  check('gunakan beralih ke Image Editor', document.getElementById('ms-tab-image')?.style.display !== 'none', document.getElementById('ms-tab-image')?.style.display || '');
  const useBtn126 = [...document.querySelectorAll('#se-main button')].find((b) => b.textContent.trim() === 'Gunakan');
  check('v126: Gunakan sudah diklik -> hijau (class done)', !!useBtn126 && useBtn126.classList.contains('done'), useBtn126?.className || '');

  const zoomBtn126 = document.querySelector('#view-graph .btn');
  const cs126 = zoomBtn126 ? dom.window.getComputedStyle(zoomBtn126) : null;
  check('v126: button teks rounded rectangle 10px', !!cs126 && cs126.borderRadius === '10px', cs126 ? cs126.borderRadius : '');
  if (zoomBtn126) zoomBtn126.click();
  await tick(100);
  check('v126: button teks statis sudah diklik -> penanda btn-done', !!zoomBtn126 && zoomBtn126.classList.contains('btn-done'), zoomBtn126?.className || '');

  // Recall Library -> Media Studio: muat isi ke output Script Editor.
  const addedRow = [...document.querySelectorAll('#libGrid .lib-card')].pop();
  [...addedRow.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Media Studio').click();
  await tick(150);
  check('recall Media Studio membuka tab Script', document.getElementById('ms-tab-script')?.style.display !== 'none');
  check('recall Media Studio memuat isi ke output', (document.getElementById('se-output')?.value || '').includes('NASKAH-UJI-EDIT'), document.getElementById('se-output')?.value || '');

  // Recall Library -> Revisi: kembali ke menu chat + kartu Kanban Revisi
  // (tombol Chat lama diganti Revisi sesuai perintah kartu Library).
  [...addedRow.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Revisi').click();
  await waitFor(() => document.body.textContent.includes('Perbaikan dibuka'), 'pesan revisi di chat', 120);
  check('recall Revisi kembali ke menu chat', document.getElementById('view-home')?.classList.contains('active'));
  check('recall Revisi membuka perbaikan di chat', document.body.textContent.includes('Perbaikan dibuka'));
  check('recall Revisi membuat kartu Kanban Revisi', document.body.textContent.includes('Revisi:'));
  check('generate memanggil router (fetch chat-completions)', log.some((x) => x.includes('chat/completions')), log.join(','));
  const notes = [...document.querySelectorAll('#se-main .se-note')].map((n) => n.textContent).join(' ');
  check('footer menyebut provider meta', notes.includes('meta'), notes);
  // v146: Bersihkan mengosongkan field + output, konfigurasi dipertahankan.
  [...document.querySelectorAll('#se-main button')].find((b) => b.textContent.trim() === 'Bersihkan').click();
  await tick(100);
  check('v146: field Apa kosong setelah Bersihkan', (document.getElementById('se-what')?.value || '') === '');
  check('v146: output hilang setelah Bersihkan', !document.getElementById('se-output'));
  check('v146: state tersimpan kosong setelah Bersihkan', !(JSON.parse(store.get('minime.scriptEditor') || '{}').output || ''), store.get('minime.scriptEditor') || '');
  check('v146: platform dipertahankan setelah Bersihkan', (JSON.parse(store.get('minime.scriptEditor') || '{}').platform || '') === 'instagram', store.get('minime.scriptEditor') || '');

  // v147: 5W1H jadi Brief tambahan roll-over (tertutup bila tak dipakai).
  check('v147: 5W1H tertutup setelah Bersihkan', document.getElementById('se-w-fields')?.style.display === 'none', document.getElementById('se-w-fields')?.style.display || 'tidak ada');
  document.getElementById('se-w-toggle').click();
  await tick(100);
  check('v147: klik toggle membuka 5W1H', document.getElementById('se-w-fields')?.style.display === 'block', document.getElementById('se-w-fields')?.style.display || 'tidak ada');
  document.getElementById('se-w-toggle').click();
  await tick(100);
  check('v147: klik toggle lagi menutup 5W1H kosong', document.getElementById('se-w-fields')?.style.display === 'none', document.getElementById('se-w-fields')?.style.display || 'tidak ada');
  document.getElementById('se-what').value = 'Es kopi susu Rp15.000';
  document.getElementById('se-what').dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  await tick(50);
  document.getElementById('se-framework').value = 'pas';
  document.getElementById('se-framework').dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  await tick(100);
  check('v147: ada isi -> 5W1H terbuka sendiri setelah render ulang', document.getElementById('se-w-fields')?.style.display === 'block', document.getElementById('se-w-fields')?.style.display || 'tidak ada');

  // v166: Impor skrip dari Library / Chat.
  check('v166: tombol Impor ada', !!document.getElementById('se-import'));
  store.set('minime.library.added', JSON.stringify([
    { o: 'Caption Uji', a: 'Kreatif', s: 'Draf', badge: 'b-idle', content: 'CAPTION-IMPOR-UJI: promo kopi susu.', kind: 'script', proj: '', addedAt: '2026-11-01' },
    { o: 'Gambar Uji', a: 'Kreatif', s: 'Disetujui', badge: 'b-ok', content: 'prompt gambar', kind: 'image', imageFile: 'img-x.webp', proj: '', addedAt: '2026-11-01' },
  ]));
  store.set('minime.mainChat', JSON.stringify([
    { who: 'user', name: 'Patria', color: '#8ED694', text: 'tolong buatkan caption' },
    { who: 'riset', name: 'Riset', color: '#4ade80', text: 'CHAT-IMPOR-UJI: hasil riset pasar kopi.' },
  ]));
  document.getElementById('se-import').click();
  await tick(100);
  const dlg = document.getElementById('se-import-dlg');
  check('v166: dialog impor tampil', dlg?.style.display === 'flex', dlg?.style.display || 'tidak ada');
  const dlgText = dlg?.textContent || '';
  check('v166: daftar Library hanya skrip (bukan gambar)', dlgText.includes('Caption Uji') && !dlgText.includes('Gambar Uji'), dlgText.slice(0, 200));
  check('v166: daftar Chat hanya pesan agen (bukan user)', dlgText.includes('Riset') && !dlgText.includes('tolong buatkan'), dlgText.slice(0, 200));
  check('v166: daftar Chat mencakup chat project', dlgText.includes('Project Proyek Uji'), dlgText.slice(0, 200));
  dlg.querySelector('[data-se-imp="0"]').click();
  await tick(100);
  check('v166: impor Library mengisi Hasil', (document.getElementById('se-output')?.value || '').includes('CAPTION-IMPOR-UJI'), document.getElementById('se-output')?.value || '');
  document.getElementById('se-import').click();
  await tick(100);
  // Klik berdasar isi (bukan indeks mentah): urutan = Library, lalu
  // chat project, lalu chat utama — indeks bergeser bila project
  // punya pesan agen sendiri (temuan debug v166).
  const chatRow = [...document.getElementById('se-import-dlg').querySelectorAll('[data-se-imp]')].find((el) => el.textContent.includes('CHAT-IMPOR-UJI'));
  if (!chatRow) throw new Error('baris chat impor tidak ada');
  chatRow.click();
  await tick(100);
  check('v166: impor Chat mengisi Hasil', (document.getElementById('se-output')?.value || '').includes('CHAT-IMPOR-UJI'), document.getElementById('se-output')?.value || '');
  check('v166: dialog tertutup setelah impor', document.getElementById('se-import-dlg')?.style.display === 'none', document.getElementById('se-import-dlg')?.style.display || '');


  // v172: caption 3 jalur di Script Editor — tombol Caption artikel
  // (menu Artikel) dan Caption video (menu Movie); menu Social TIDAK
  // ditambah tombol (mode caption/both sudah jalur Sosmed).
  // Integrasi: Gunakan pada caption langsung ke komposer Planner.
  [...panel.querySelectorAll('.se-menubtn')].find((b) => b.getAttribute('data-se-menu') === 'artikel').click();
  await tick(150);
  check('v172: tombol Caption artikel ada di menu Artikel', !!document.getElementById('se-cap-artikel'));
  check('v172: menu Artikel TIDAK punya tombol Caption video', !document.getElementById('se-cap-video'));
  document.getElementById('se-topic').value = 'topik uji';
  document.getElementById('se-topic').dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  await tick(50);
  const bodiesBeforeArtikel = scriptBodies.length;
  document.getElementById('se-cap-artikel').click();
  await waitFor(() => (document.getElementById('se-output')?.value || '').includes('NASKAH-UJI'), 'output caption artikel', 120);
  const artikelBodies = scriptBodies.slice(bodiesBeforeArtikel).map((b) => JSON.stringify(b)).join(' ');
  check('v172: prompt caption artikel memuat frasa caption artikel', artikelBodies.includes('caption artikel'), artikelBodies.slice(0, 200));
  [...panel.querySelectorAll('.se-menubtn')].find((b) => b.getAttribute('data-se-menu') === 'movie').click();
  await tick(150);
  check('v172: tombol Caption video ada di menu Movie', !!document.getElementById('se-cap-video'));
  check('v172: menu Movie TIDAK punya tombol Caption artikel', !document.getElementById('se-cap-artikel'));
  document.getElementById('se-premise').value = 'premis uji';
  document.getElementById('se-premise').dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  await tick(50);
  const bodiesBeforeVideo = scriptBodies.length;
  document.getElementById('se-cap-video').click();
  await waitFor(() => (document.getElementById('se-output')?.value || '').includes('NASKAH-UJI'), 'output caption video', 120);
  const videoBodies = scriptBodies.slice(bodiesBeforeVideo).map((b) => JSON.stringify(b)).join(' ');
  check('v172: prompt caption video memuat frasa caption video', videoBodies.includes('caption video'), videoBodies.slice(0, 200));
  document.getElementById('se-use').click();
  await tick(150);
  check('v172: Gunakan pada caption pindah ke view Planner', document.getElementById('view-planner')?.classList.contains('active') === true, document.getElementById('view-planner')?.className || 'tidak ada');
  document.getElementById('socCreatePost')?.click();
  await tick(200);
  check('v172: caption video langsung terisi di komposer Planner (tanpa salin-tempel)', (document.getElementById('socCompText')?.value || '').includes('NASKAH-UJI'), (document.getElementById('socCompText')?.value || '').slice(0, 80));

} catch (e) {
  console.log('FAIL rig error: ' + (e && e.message ? e.message : String(e)));
  failures.push('rig error');
}

console.log(failures.length === 0 ? 'RIG-SCRIPT ALL PASSED' : 'RIG-SCRIPT FAILED: ' + failures.join(', '));
process.exit(failures.length === 0 ? 0 : 1);
