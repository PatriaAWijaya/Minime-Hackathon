// Rig Library Kartu (jsdom, test-only): membuktikan Library bentuk kartu +
// filter 4 dimensi + detail klik-2x + hapus menyeluruh — BUKAN mock logika:
//  1. Kartu awal = 5 baris bawaan, tiap kartu memuat agen + project + judul.
//  2. Filter jenis/agen/project/periode menyaring kartu (periode diuji
//     dengan item baru bertanggal hari ini, bukan tanggal tetap).
//  3. Klik 2x membuka dialog detail; Tutup menutupnya.
//  4. Tombol Media Studio membuka tab Script; Revisi kembali ke chat.
//  5. Hapus: confirm=false tidak menghapus; confirm=true menghapus dari
//     Library (persist tombstone/array) + kartu Kanban terkait.
// Jalankan: npm run rig:lib (butuh dist ter-build + jsdom devDependency).
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

const store = new Map();
const log = [];

const PNG1X1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';
async function invokeStub(cmd, args) {
  log.push('invoke:' + cmd);
  // §v246: stub jalur Library -> Planner tanpa kunci (ImgBB TIDAK
  // pernah dipanggil di jalur ini — bila dipanggil, throw = gagal).
  if (cmd === 'image_read') {
    const nm = (args && args.req && args.req.name) || '';
    if (nm === 'poster-uji246.png' || nm === 'poster-uji246b.png') return { b64: PNG1X1 };
    throw new Error('unexpected invoke ' + cmd);
  }
  if (cmd === 'uguu_upload') return { url: 'https://h.uguu.se/UJI246.png' };
  if (cmd === 'social_publish') return 'ok';
  throw new Error('unexpected invoke ' + cmd);
}

const dom = new JSDOM(html, {
  url: 'file://' + distDir + '/index.html',
  resources: 'usable',
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  beforeParse(window) {
    window.__TAURI_INTERNALS__ = { invoke: invokeStub };
    window.fetch = async () => ({ ok: true, status: 200, headers: { get: () => '' }, json: async () => ({}), text: async () => '' });
    window.URL.createObjectURL = () => 'blob:lib-test';
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

let failures = 0;
function check(name, ok, extra) {
  // eslint-disable-next-line no-console
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok || !extra ? '' : ' :: ' + String(extra).slice(0, 200)));
  if (!ok) failures++;
}
const cards = () => [...document.querySelectorAll('#libGrid .lib-card')];
const bodyText = () => document.body.textContent || '';

try {
  await waitFor(() => document.getElementById('chatInput'), 'mount chatInput', 200);

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
  dom.window.showView('library');
  await tick(200);

  // 1. v84: Library mulai kosong (tanpa baris seed).
  check('kartu awal 0 (tanpa seed)', cards().length === 0, 'cards=' + cards().length);

  // 2. Tambah + filter: jenis, agen, project, periode (item baru = hari ini).
  dom.window.libAddScript('NASKAH-LIB-UJI', 'ISI-LIB-UJI-HARI-INI');
  await tick(100);
  check('simpan baru menambah kartu', cards().length === 1, 'cards=' + cards().length);
  check('kartu memuat agen + project + judul', cards().every((c) => c.textContent.includes('Agen:') && c.textContent.includes('Project:')) && cards().some((c) => c.textContent.includes('NASKAH-LIB-UJI')));
  dom.window.libSetFilter('kind', 'script');
  await tick(100);
  check('filter jenis naskah menyaring ke 1', cards().length === 1 && cards()[0].textContent.includes('NASKAH-LIB-UJI'), 'cards=' + cards().length);
  dom.window.libSetFilter('kind', 'doc');
  await tick(100);
  check('filter jenis dokumen menyaring ke 0', cards().length === 0, 'cards=' + cards().length);
  dom.window.libSetFilter('kind', 'all');
  dom.window.libSetFilter('agent', 'Kreatif');
  await tick(100);
  check('filter agen Kreatif menyaring ke 1', cards().length === 1 && cards()[0].textContent.includes('NASKAH-LIB-UJI'), 'cards=' + cards().length);
  dom.window.libSetFilter('agent', 'all');
  dom.window.libSetFilter('proj', 'Proyek Uji');
  await tick(100);
  check('filter project menyaring ke 1', cards().length === 1 && cards()[0].textContent.includes('NASKAH-LIB-UJI'), 'cards=' + cards().length);
  dom.window.libSetFilter('proj', 'all');
  dom.window.libSetFilter('period', 'today');
  await tick(100);
  check('filter periode hari ini hanya item baru', cards().length === 1 && cards()[0].textContent.includes('NASKAH-LIB-UJI'), 'cards=' + cards().length);
  dom.window.libSetFilter('period', 'all');
  await tick(100);

  // 3. Detail klik 2x + tutup.
  const first = cards()[0];
  first.dispatchEvent(new dom.window.MouseEvent('dblclick', { bubbles: true }));
  await tick(100);
  check('klik 2x membuka dialog detail', document.getElementById('libDetailDlg')?.style.display === 'block' && (document.getElementById('libDetailDlg')?.textContent || '').includes(first.querySelector('.lib-title')?.textContent || ''));
  check('detail memuat isi yang disimpan', (document.getElementById('libDetailDlg')?.textContent || '').includes('ISI-LIB-UJI-HARI-INI'));
  [...document.querySelectorAll('#libDetailDlg button')].find((b) => b.textContent.trim() === 'Tutup').click();
  await tick(100);
  check('tombol Tutup menutup dialog', document.getElementById('libDetailDlg')?.style.display === 'none');
  // v118: pola inline ondblclick MATI di WebView live (v91) — kartu harus
  // bersih dari inline handler, detail dibuka lewat delegasi di #libGrid.
  check('v118: kartu tanpa inline ondblclick (pola mati live)', ![...document.querySelectorAll('#libGrid .lib-card')].some((c) => c.hasAttribute('ondblclick')), '');
  check('v118: kartu membawa tooltip petunjuk klik 2x', (cards()[0]?.getAttribute('title') || '').length > 0, cards()[0]?.getAttribute('title') || '');
  first.querySelector('button').dispatchEvent(new dom.window.MouseEvent('dblclick', { bubbles: true }));
  await tick(100);
  check('v118: klik 2x pada tombol kartu TIDAK membuka detail', document.getElementById('libDetailDlg')?.style.display === 'none', document.getElementById('libDetailDlg')?.style.display || '');

  // 4. Media Studio + Revisi dari kartu.
  const added = cards().find((c) => c.textContent.includes('NASKAH-LIB-UJI'));
  [...added.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Media Studio').click();
  await tick(150);
  check('Media Studio membuka tab Script', document.getElementById('ms-tab-script')?.style.display !== 'none');
  dom.window.showView('library');
  await tick(100);
  const added2 = cards().find((c) => c.textContent.includes('NASKAH-LIB-UJI'));
  [...added2.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Revisi').click();
  await waitFor(() => bodyText().includes('Perbaikan dibuka'), 'pesan revisi di chat', 120);
  check('Revisi kembali ke menu chat', document.getElementById('view-home')?.classList.contains('active') && bodyText().includes('Perbaikan dibuka'));

  // 5. Hapus via dialog in-app: Batal membatalkan, Ya menghapus.
  dom.window.showView('library');
  await tick(100);
  const victim = cards().find((c) => c.textContent.includes('NASKAH-LIB-UJI'));
  [...victim.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Hapus').click();
  await tick(100);
  check('klik Hapus membuka dialog konfirmasi', document.getElementById('libConfirmDlg')?.style.display === 'block' && (document.getElementById('libConfirmDlg')?.textContent || '').includes('NASKAH-LIB-UJI'));
  [...document.querySelectorAll('#libConfirmDlg button')].find((b) => b.textContent.trim() === 'Batal').click();
  await tick(100);
  check('Batal tidak menghapus', cards().some((c) => c.textContent.includes('NASKAH-LIB-UJI')) && document.getElementById('libConfirmDlg')?.style.display === 'none');
  const victim2 = cards().find((c) => c.textContent.includes('NASKAH-LIB-UJI'));
  [...victim2.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Hapus').click();
  await tick(100);
  [...document.querySelectorAll('#libConfirmDlg button')].find((b) => b.textContent.trim() === 'Ya, hapus').click();
  await tick(100);
  check('Ya, hapus menghapus kartu', !cards().some((c) => c.textContent.includes('NASKAH-LIB-UJI')) && cards().length === 0, 'cards=' + cards().length);
  check('hapus baris user persist di localStorage', (store.get('minime.library.added') || '') === '[]');
  check('kartu Kanban Revisi ikut terhapus', !bodyText().includes('Revisi: NASKAH-LIB-UJI'));

  // 6. v84: render ulang tetap kosong (tanpa baris bawaan).
  dom.window.renderLib();
  await tick(100);
  check('render ulang tetap 0 kartu', cards().length === 0, 'cards=' + cards().length);

  // 7. v90: arsip 3 bulan — item lama pindah ke arsip, baru + tanpa tanggal bertahan.
  const isoD = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const nowD = new Date();
  const oldD = isoD(new Date(nowD.getFullYear(), nowD.getMonth() - 4, Math.min(nowD.getDate(), 28)));
  const newD = isoD(new Date(nowD.getFullYear(), nowD.getMonth(), nowD.getDate() - 10));
  const store2 = new Map();
  // Profil pasca-v84: flag sudah ada agar runCleanV84 tidak mereset seed.
  store2.set('minime.cleaned-v84', '1');
  store2.set('minime.library.added', JSON.stringify([
    { o: 'Lama', a: 'Kreatif', s: 'Disetujui', badge: 'b-ok', kind: 'script', content: 'lama', proj: '', addedAt: oldD },
    { o: 'Baru', a: 'Kreatif', s: 'Draf', badge: 'b-idle', kind: 'script', content: 'baru', proj: '', addedAt: newD },
    { o: 'Tanpa Tanggal', a: 'Kreatif', s: 'Draf', badge: 'b-idle', kind: 'script', content: 'nodate', proj: '' },
  ]));
  const dom2 = new JSDOM(html, {
    url: 'file://' + distDir + '/index.html',
    resources: 'usable',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.__TAURI_INTERNALS__ = { invoke: invokeStub };
      window.fetch = async () => ({ ok: true, status: 200, headers: { get: () => '' }, json: async () => ({}), text: async () => '' });
      window.URL.createObjectURL = () => 'blob:lib-test';
      const ls = {
        getItem: (k) => (store2.has(k) ? store2.get(k) : null),
        setItem: (k, v) => store2.set(k, String(v)),
        removeItem: (k) => store2.delete(k),
        clear: () => store2.clear(),
      };
      Object.defineProperty(window, 'localStorage', { value: ls });
    },
  });
  await waitFor(() => typeof dom2.window.showView === 'function', 'mount showView dom2', 120);
  dom2.window.showView('library');
  dom2.window.renderLib();
  await tick(100);
  const grid2 = () => dom2.window.document.getElementById('libGrid')?.textContent || '';
  check('arsip 3 bulan -> grid hanya item baru + tanpa tanggal', grid2().includes('Baru') && grid2().includes('Tanpa Tanggal') && !grid2().includes('Lama'), grid2().slice(0, 200));
  const arc2 = JSON.parse(store2.get('minime.library.archived') || '[]');
  check('item lama masuk arsip + bertanda archivedAt', arc2.some((it) => it.o === 'Lama') && !!arc2.find((it) => it.o === 'Lama').archivedAt, JSON.stringify(arc2.map((it) => it.o)));
  dom2.window.document.getElementById('libArchiveBtn').click();
  await tick(100);
  check('tombol Arsip -> grid menampilkan item lama', grid2().includes('Lama'), grid2().slice(0, 200));
  const restoreBtn = [...dom2.window.document.querySelectorAll('#libGrid button')].find((b) => b.textContent.trim() === 'Pulihkan');
  restoreBtn.click();
  await tick(100);
  const back2 = JSON.parse(store2.get('minime.library.added') || '[]');
  check('pulihkan -> item kembali aktif + addedAt hari ini', back2.some((it) => it.o === 'Lama' && it.addedAt === isoD(nowD)) && !JSON.parse(store2.get('minime.library.archived') || '[]').some((it) => it.o === 'Lama'), JSON.stringify(back2.map((it) => it.o + ':' + it.addedAt)));
  dom2.window.document.getElementById('libArchiveBtn').click();
  await tick(100);
  check('kembali ke Aktif -> grid menampilkan item pulihan', grid2().includes('Lama') && grid2().includes('Baru'), grid2().slice(0, 200));

  // §arsip-detail: klik 2x kartu arsip -> dialog detail + Pulihkan dari dialog.
  store2.set('minime.library.archived', JSON.stringify([
    { o: 'ArsipUji', a: 'Kreatif', s: 'Disetujui', badge: 'b-ok', kind: 'script', content: 'ISI-ARSIP-UJI', proj: '', addedAt: newD, archivedAt: newD },
  ]));
  dom2.window.document.getElementById('libArchiveBtn').click();
  await tick(100);
  const arcCard = dom2.window.document.querySelector('#libGrid .lib-card[data-lib-detail-arc]');
  check('arsip: kartu arsip punya atribut detail + hint', !!arcCard && (arcCard.getAttribute('title') || '').includes('Klik dua kali'), arcCard ? arcCard.outerHTML.slice(0, 160) : 'no-card');
  arcCard.querySelector('.lib-title').dispatchEvent(new dom2.window.MouseEvent('dblclick', { bubbles: true }));
  await tick(100);
  const dlgA = dom2.window.document.getElementById('libDetailDlg');
  const dlgAText = dlgA?.textContent || '';
  check('arsip: klik 2x membuka dialog detail arsip', dlgA?.style.display === 'block' && dlgAText.includes('ArsipUji') && dlgAText.includes('ISI-ARSIP-UJI'), dlgAText.slice(0, 200));
  check('arsip: dialog hanya Pulihkan + Tutup (tanpa aksi kartu aktif)', [...dlgA.querySelectorAll('button')].map((b) => b.textContent.trim()).join('|') === 'Pulihkan|Tutup', [...dlgA.querySelectorAll('button')].map((b) => b.textContent.trim()).join('|'));
  [...dlgA.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Pulihkan').click();
  await tick(100);
  const backA = JSON.parse(store2.get('minime.library.added') || '[]');
  check('arsip: Pulihkan dari dialog -> item kembali aktif + dialog tertutup', backA.some((it) => it.o === 'ArsipUji') && !JSON.parse(store2.get('minime.library.archived') || '[]').some((it) => it.o === 'ArsipUji') && dlgA.style.display === 'none', JSON.stringify(backA.map((it) => it.o)));
  // §v246: aset Library -> Planner TANPA kunci ImgBB (perintah Patria
  // 4 Nov 09:27 "sampai berhasil, apapun caranya"). Akar masalah:
  // simpan Planner menuntut URL publik padahal draf tidak menyentuh
  // API Meta; tanpa kunci simpan selalu gagal (v242: blok file_url;
  // v244/v245: throw soc.imgbb.missing) dan tick selalu failed.
  // Perilaku baru: simpan draf/terjadwal menyimpan file lokal apa
  // adanya; konversi URL hanya saat terbit, via ImgBB bila kunci ada,
  // uguu bila tidak ada. Kanal uji = IG terhubung, TANPA imgbbApiKey.
  store.set('minime.social', JSON.stringify({ instagram: { accessToken: 'uji246', expiresAt: Date.now() + 86400000 } }));
  dom.window.libSetFilter('kind', 'all');
  dom.window.libSetFilter('period', 'all');
  dom.window.libSetFilter('agent', 'all');
  dom.window.libSetFilter('proj', 'all');
  await tick(100);
  dom.window.libAddImage('Poster Uji 246', 'prompt uji 246', 'poster-uji246.png', 0);
  await tick(100);
  const card246 = [...document.querySelectorAll('#libGrid .lib-card')].find((c) => (c.querySelector('.lib-title')?.textContent || '').includes('Poster Uji 246'));
  check('v246: aset gambar baru masuk Library', !!card246, card246 ? card246.outerHTML.slice(0, 120) : 'no-card');
  card246.querySelector('.lib-title').dispatchEvent(new dom.window.MouseEvent('dblclick', { bubbles: true }));
  await tick(100);
  const dlg246 = document.getElementById('libDetailDlg');
  const dlg246Btns = [...(dlg246?.querySelectorAll('button') || [])].map((b) => b.textContent.trim());
  check('v246: detail gambar menampilkan tombol Masuk Planner', dlg246?.style.display === 'block' && dlg246Btns.includes('Masuk Planner'), dlg246Btns.join('|'));
  [...dlg246.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Masuk Planner').click();
  await tick(100);
  const comp246 = document.getElementById('socCompText');
  const compMedia246 = document.querySelector('.soc-comp-media')?.textContent || '';
  check('v246: Masuk Planner membuka komposer dengan media Library terpasang', !!comp246 && compMedia246.includes('poster-uji246.png'), compMedia246.slice(0, 160));
  document.getElementById('socCompText').value = 'Caption uji 246';
  document.getElementById('socCompDraft').click();
  await tick(100);
  const q246 = JSON.parse(store.get('minime.socialQueue') || '[]');
  const draft246 = q246.find((it) => it.platform === 'instagram' && it.status === 'draft' && it.imageFile === 'poster-uji246.png');
  check('v246: simpan draf Planner berhasil TANPA kunci (file lokal tersimpan)', !!draft246 && (draft246.text || '').includes('Caption uji 246'), JSON.stringify(q246.map((it) => it.platform + ':' + it.status + ':' + (it.imageFile || it.imageUrl || ''))));
  check('v246: simpan draf tidak menyentuh ImgBB sama sekali', !log.includes('invoke:imgbb_upload'), log.filter((l) => l.includes('imgbb')).join(',') || 'no-imgbb-call');
  // Terbit-sekarang dari aset Library kedua (komposer dibuka ulang
  // lewat tombol Masuk Planner) — harus via uguu, bukan ImgBB.
  dom.window.libAddImage('Poster Uji 246b', 'prompt uji 246b', 'poster-uji246b.png', 0);
  await tick(100);
  const card246b = [...document.querySelectorAll('#libGrid .lib-card')].find((c) => (c.querySelector('.lib-title')?.textContent || '').includes('Poster Uji 246b'));
  card246b.querySelector('.lib-title').dispatchEvent(new dom.window.MouseEvent('dblclick', { bubbles: true }));
  await tick(100);
  [...document.getElementById('libDetailDlg').querySelectorAll('button')].find((b) => b.textContent.trim() === 'Masuk Planner').click();
  await tick(100);
  document.getElementById('socCompText').value = 'Caption terbit 246';
  document.getElementById('socCompNow').click();
  await tick(100);
  check('v246: terbit-sekarang dari aset Library berhasil (komposer tertutup = sukses)', !document.getElementById('socCompText'), document.getElementById('socComposerNote')?.textContent || 'composer-closed');
  check('v246: terbit-sekarang memakai uguu, bukan ImgBB', log.includes('invoke:uguu_upload') && log.includes('invoke:social_publish') && !log.includes('invoke:imgbb_upload'), log.filter((l) => l.startsWith('invoke:')).join(','));
  // Tick antrean: item terjadwal dengan file lokal harus terbit via
  // resolver publik (uguu tanpa kunci), bukan failed soc.imgbb.missing.
  const qTick = JSON.parse(store.get('minime.socialQueue') || '[]');
  qTick.push({ id: 'tick246', platform: 'instagram', text: 'Caption tick 246', imageFile: 'poster-uji246.png', imageMime: 'image/png', imageUrl: '', scheduledAt: Date.now() - 1000, status: 'queued', error: '', repeat: '' });
  store.set('minime.socialQueue', JSON.stringify(qTick));
  let sent246 = null;
  for (let w = 0; w < 90 && !sent246; w++) {
    await tick(500);
    sent246 = (JSON.parse(store.get('minime.socialQueue') || '[]').find((it) => it.id === 'tick246' && it.status === 'sent'));
  }
  const tickItem = JSON.parse(store.get('minime.socialQueue') || '[]').find((it) => it.id === 'tick246');
  check('v246: tick menerbitkan item file-lokal via URL publik (tanpa kunci)', !!sent246 && (tickItem?.imageUrl || '').startsWith('https://h.uguu.se/') && !tickItem?.imageFile, JSON.stringify(tickItem || null).slice(0, 220));

  // §v213: thumbnail Library mengecil 60% (jadi 40%), kartu tetap.
  const cssMatchV = html.match(/href="([^"]+\.css)"/);
  let cssTextV = '';
  if (cssMatchV) { try { cssTextV = fs.readFileSync(path.join(distDir, cssMatchV[1]), 'utf-8'); } catch { cssTextV = ''; } }
  check('v213: CSS build memuat .lib-thumb width 40%', /\.lib-thumb\{[^}]*width:\s*40%/.test(cssTextV), cssMatchV ? cssMatchV[1] : 'no-css-link');
  check('v213: .lib-thumb tetap di tengah (margin auto)', /\.lib-thumb\{[^}]*margin:\s*0 auto/.test(cssTextV), '');

} catch (e) {
  console.log('FAIL rig error: ' + (e && e.message ? e.message : String(e)));
  failures++;
}

console.log(failures === 0 ? 'RIG-LIB ALL PASSED' : 'RIG-LIB FAILED: ' + failures + ' checks');
process.exit(failures === 0 ? 0 : 1);
