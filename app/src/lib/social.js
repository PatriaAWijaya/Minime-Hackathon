// Penjadwal + autopost native MiniMe (v61) — pengganti Postiz.
// Pola UI meniru Postiz yang sudah familiar, dibangun ulang bersih
// — bukan salinan kode Postiz. v68 (perintah Patria 29 Okt 21:13):
// dua panel — sidebar kanal (ikon + status, klik = kartu koneksi)
// + window utama HANYA kalender kartu (tombol + = jadwal via dialog
// tanggal, chip item = judul + ikon kanal, tombol − = hapus item).
// Token/kredensial disimpan di localStorage dengan postur
// yang sama seperti kunci API lain di app ini (bukan Keychain);
// antrean tersimpan di localStorage sehingga selamat dari restart.
// Penjadwal berjalan selama app terbuka (timer 30 detik).

import { invoke } from '@tauri-apps/api/core';
import { tr } from './i18n.js';
import { esc } from './esc.js';

var SOC_LS = 'minime.social';
var QUEUE_LS = 'minime.socialQueue';
var OAUTH_REDIRECT = 'http://127.0.0.1:4317/callback';

// Urutan sesuai perintah Patria. facebook (profil) TIDAK BISA autopost
// via API (Meta menghapusnya) — ditampilkan apa adanya, bukan tombol
// palsu. v62a: facebook_page + threads ikut dibangun (can: true);
// v62b: instagram; v64: x + tiktok. youtube TIDAK dibangun (API-nya
// tidak punya endpoint Community post — hanya upload video).
var PLATFORMS = [
  { id: 'facebook', name: 'Facebook', mono: 'FB', note: 'soc.note.fb_profile', can: false },
  { id: 'facebook_page', name: 'Facebook Page', mono: 'FP', note: '', can: true },
  { id: 'instagram', name: 'Instagram', mono: 'IG', note: 'soc.note.ig_url', can: true },
  { id: 'threads', name: 'Threads', mono: 'TH', note: 'soc.note.threads_text', can: true },
  { id: 'linkedin', name: 'LinkedIn', mono: 'IN', note: '', can: true },
  { id: 'youtube', name: 'YouTube', mono: 'YT', note: 'soc.note.youtube_video', can: false },
  { id: 'tiktok', name: 'TikTok', mono: 'TT', note: 'soc.note.tiktok_url', can: true },
  { id: 'x', name: 'X', mono: 'X', note: 'soc.note.x_cost', can: true },
];

function socStore() {
  try { return JSON.parse(window.localStorage.getItem(SOC_LS) || '{}'); }
  catch (_) { return {}; }
}
function socSave(s) {
  try { window.localStorage.setItem(SOC_LS, JSON.stringify(s)); } catch (_) {}
}
function queueLoad() {
  try {
    var q = JSON.parse(window.localStorage.getItem(QUEUE_LS) || '[]');
    return Array.isArray(q) ? q : [];
  } catch (_) { return []; }
}
function queueSave(q) {
  // Mengembalikan boolean (audit v66 B-B2): penyimpanan yang gagal
  // (kuota) TIDAK BOLEH dilaporkan sebagai sukses oleh pemanggil.
  try { window.localStorage.setItem(QUEUE_LS, JSON.stringify(q)); return true; } catch (_) { return false; }
}
function socBind(id, fn) {
  var b = document.getElementById(id);
  if (b) b.addEventListener('click', fn);
}
function platName(id) {
  var p = PLATFORMS.find(function (x) { return x.id === id; });
  return p ? p.name : id;
}
function platMono(id) {
  var p = PLATFORMS.find(function (x) { return x.id === id; });
  return p ? p.mono : '?';
}
function fmtTime(ms) {
  try { return new Date(ms).toLocaleString(); } catch (_) { return String(ms); }
}
function dayKey(ms) {
  var d = new Date(ms);
  return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
}
function tokenValid(ch) {
  if (!ch) return false;
  if (ch.pageToken) return true; // FB Page: token Page tidak kedaluwarsa praktis.
  return !!(ch.accessToken && (!ch.expiresAt || ch.expiresAt > Date.now()));
}

var socMetaPending = null; // {platform, clientId, clientSecret, userToken, expiresAt, pages}

function renderChannels(list) {
  var s = socStore();
  return (list || PLATFORMS).map(function (p) {
    var ch = s[p.id];
    var connected = tokenValid(ch);
    var status = connected
      ? '<span class="badge b-ok">' + tr('soc.connected') + (ch.label ? ' · ' + esc(ch.label) : '') + '</span>'
      : '<span class="badge">' + tr('soc.not_connected') + '</span>';
    var body = '';
    if (p.id === 'facebook') {
      body = '';
    } else if (!p.can) {
      body = '<div>' + tr('soc.coming') + '</div>';
    } else if (socMetaPending && socMetaPending.platform === p.id) {
      body = '<div>' + tr('soc.pick_page') + '</div>' + socMetaPending.pages.map(function (pg) {
        return '<div class="soc-row"><button class="btn btn-sm" data-soc-pick="' + esc(pg.id) + '">' + esc(pg.name) + '</button></div>';
      }).join('');
    } else if (connected) {
      body = '<div class="soc-row"><button id="socDisc-' + p.id + '" class="btn btn-sm">' + tr('soc.disconnect') + '</button></div>';
    } else {
      var hint = p.id === 'facebook_page' || p.id === 'threads' ? tr('soc.meta_hint')
        : p.id === 'x' ? tr('soc.x_hint')
        : p.id === 'tiktok' ? tr('soc.tiktok_hint')
        : tr('soc.cred_hint');
      body = '<div>' + hint + '</div>'
        + '<div class="soc-row"><input type="text" id="socId-' + p.id + '" placeholder="' + tr('soc.ph.id') + '" style="width:180px" value="' + esc((ch && ch.clientId) || '') + '"> '
        + '<input type="password" id="socSec-' + p.id + '" placeholder="' + tr('soc.ph.secret') + '" style="width:180px"></div>'
        + '<div class="soc-row"><button id="socConn-' + p.id + '" class="btn btn-sm btn-primary">' + tr('soc.connect') + '</button></div>';
    }
    if (p.note) body += '<div>' + tr(p.note) + '</div>';
    return '<div class="soc-card"><b>' + esc(p.name) + '</b> ' + status + body + '</div>';
  }).join('');
}

// Judul chip kartu: baris pertama caption (untuk Batch = judul
// kartu), dipotong agar kartu tetap ringkas; teks penuh ada di
// atribut title chip + di dialog tanggal.
function socItemTitle(text) {
  var first = String(text || '').split('\n')[0].trim();
  return first.length > 36 ? first.slice(0, 36) + '…' : first;
}

function renderCalendar() {
  var now = socCalCursor || new Date();
  var y = now.getFullYear(), m = now.getMonth();
  var first = new Date(y, m, 1);
  var startDay = (first.getDay() + 6) % 7; // Senin = 0
  var daysIn = new Date(y, m + 1, 0).getDate();
  var q = queueLoad();
  var byDay = {};
  q.forEach(function (it) {
    var k = dayKey(it.scheduledAt);
    (byDay[k] = byDay[k] || []).push(it);
  });
  Object.keys(byDay).forEach(function (k) {
    byDay[k].sort(function (a, b) { return a.scheduledAt - b.scheduledAt; });
  });
  var cells = '';
  for (var i = 0; i < startDay; i++) cells += '<div class="soc-cal-day empty"></div>';
  for (var d = 1; d <= daysIn; d++) {
    var k = y + '-' + (m + 1) + '-' + d;
    var chips = (byDay[k] || []).map(function (it) {
      var fail = it.status === 'failed' ? ' <span class="soc-item-fail">' + tr('soc.status.failed') + '</span>' : '';
      var cls = it.status === 'sent' ? ' soc-item-sent' : '';
      return '<div class="soc-item' + cls + '" title="' + esc(it.text || '') + '"><span class="soc-mono sm">' + platMono(it.platform) + '</span><span class="soc-item-title">' + esc(socItemTitle(it.text)) + '</span>' + fail + '<button class="soc-del" data-soc-del="' + it.id + '" title="' + tr('soc.delete') + '">−</button></div>';
    }).join('');
    cells += '<div class="soc-cal-day" data-day="' + k + '"><div class="soc-day-head"><b>' + d + '</b><button class="soc-add" data-soc-add="' + k + '" title="' + tr('soc.day.add') + '">+</button></div>' + chips + '</div>';
  }
  var monthName = now.toLocaleString(undefined, { month: 'long', year: 'numeric' });
  return '<div class="soc-cal-head"><button id="socCalPrev" class="btn btn-sm">‹</button><b>' + esc(monthName) + '</b><button id="socCalNext" class="btn btn-sm">›</button></div>'
    + '<div class="soc-cal-grid">' + cells + '</div>';
}

export function socConnectedChannels() {
  var s = socStore();
  return PLATFORMS.filter(function (p) { return tokenValid(s[p.id]); })
    .map(function (p) { return { id: p.id, name: p.name }; });
}

export function socQueueAdd(items) {
  var q = queueLoad();
  var ids = [];
  items.forEach(function (it) {
    if (!it || !it.platform || !it.text || !it.scheduledAt) return;
    var row = {
      id: Date.now() + '' + Math.floor(Math.random() * 10000),
      platform: it.platform, text: it.text,
      imageB64: '', imageMime: it.imageMime || '',
      imageFile: it.imageFile || '', imageUrl: it.imageUrl || '',
      scheduledAt: it.scheduledAt, status: 'queued', error: '',
    };
    q.push(row);
    ids.push(row.id);
  });
  // Gagal simpan = lempar, bukan kembalikan id palsu: pemanggil
  // (Batch) hanya boleh menandai 'scheduled' bila antrean tersimpan.
  if (!queueSave(q)) throw new Error(tr('soc.err.save'));
  return ids;
}

// ---- Sumber konten penjadwalan (v63) ----
// Default = Library (perintah Patria 29 Okt 17:46); opsi "File sendiri"
// membuka input file + URL. Satu builder dipakai dialog tanggal
// (v68: composer lama dihapus bersama layout lama).
// tanggal — tidak ada duplikasi UI.
function socLibItems() {
  try {
    if (typeof window.libAll !== 'function') return [];
    return window.libAll();
  } catch (_) { return []; }
}
export function socMimeFromExt(f) {
  var m = String(f || '').toLowerCase();
  if (m.endsWith('.webp')) return 'image/webp';
  if (m.endsWith('.png')) return 'image/png';
  if (m.endsWith('.jpg') || m.endsWith('.jpeg')) return 'image/jpeg';
  return '';
}
function socSourceHTML(prefix) {
  var items = socLibItems();
  var opts = [];
  items.forEach(function (it, i) {
    if (it.kind === 'image' && it.imageFile) {
      opts.push('<option value="img:' + esc(it.imageFile) + '">🖼 ' + esc(it.o || 'Gambar') + '</option>');
    } else if ((it.kind === 'script' || it.kind === 'doc') && it.content) {
      opts.push('<option value="txt:' + i + '">📝 ' + esc(it.o || 'Naskah') + '</option>');
    }
  });
  var libSel = opts.length
    ? '<select id="socLibSel-' + prefix + '">' + opts.join('') + '</select>'
    : '<span>' + tr('soc.lib.empty') + '</span>';
  return '<div class="soc-row"><label>' + tr('soc.source') + ' <select id="socSrc-' + prefix + '">'
    + '<option value="library">' + tr('soc.source.lib') + '</option>'
    + '<option value="custom">' + tr('soc.source.custom') + '</option></select></label></div>'
    + '<div id="socLib-' + prefix + '" class="soc-row">' + libSel + '</div>'
    + '<div id="socCustom-' + prefix + '" class="soc-row" style="display:none"><input type="file" id="socFile-' + prefix + '" accept="image/*"> '
    + '<input type="text" id="socUrl-' + prefix + '" placeholder="' + tr('soc.ph.imgurl') + '" style="width:260px"></div>';
}
function socBindSource(prefix, textElId) {
  var src = document.getElementById('socSrc-' + prefix);
  var lib = document.getElementById('socLib-' + prefix);
  var cus = document.getElementById('socCustom-' + prefix);
  var libSel = document.getElementById('socLibSel-' + prefix);
  if (!src) return;
  var sync = function () {
    var isLib = src.value === 'library';
    if (lib) lib.style.display = isLib ? '' : 'none';
    if (cus) cus.style.display = isLib ? 'none' : '';
    if (!libSel) src.value = 'custom';
    if (libSel && !libSel.options.length) src.value = 'custom';
  };
  src.addEventListener('change', function () {
    sync();
    // Pilih naskah Library -> isi caption (masih bisa diedit user).
    if (libSel && libSel.value.indexOf('txt:') === 0) {
      var items = socLibItems();
      var it = items[parseInt(libSel.value.slice(4), 10)];
      var ta = textElId ? document.getElementById(textElId) : null;
      if (it && it.content && ta) ta.value = it.content;
    }
  });
  if (libSel) libSel.addEventListener('change', function () {
    if (libSel.value.indexOf('txt:') === 0) {
      var items = socLibItems();
      var it = items[parseInt(libSel.value.slice(4), 10)];
      var ta = textElId ? document.getElementById(textElId) : null;
      if (it && it.content && ta) ta.value = it.content;
    }
  });
  sync();
  // Isi awal: bila opsi Library pertama adalah naskah, caption terisi
  // tanpa menunggu user mengubah dropdown.
  if (libSel && libSel.value.indexOf('txt:') === 0) {
    var items0 = socLibItems();
    var it0 = items0[parseInt(libSel.value.slice(4), 10)];
    var ta0 = textElId ? document.getElementById(textElId) : null;
    if (it0 && it0.content && ta0 && !ta0.value) ta0.value = it0.content;
  }
}
async function socReadSource(prefix) {
  var src = document.getElementById('socSrc-' + prefix);
  var out = { imageFile: '', imageB64: '', imageMime: '', imageUrl: '' };
  if (!src || src.value === 'library') {
    var libSel = document.getElementById('socLibSel-' + prefix);
    if (libSel && libSel.value.indexOf('img:') === 0) {
      out.imageFile = libSel.value.slice(4);
      out.imageMime = socMimeFromExt(out.imageFile);
    }
    return out;
  }
  var fileEl = document.getElementById('socFile-' + prefix);
  if (fileEl && fileEl.files && fileEl.files[0]) {
    try {
      var r = await readFileB64(fileEl.files[0]);
      out.imageB64 = r.b64;
      out.imageMime = r.mime;
      out.imageFile = '';
    } catch (_) {}
    return out;
  }
  var urlEl = document.getElementById('socUrl-' + prefix);
  if (urlEl) out.imageUrl = urlEl.value.trim();
  return out;
}

var socDayOpen = null; // 'YYYY-M-D' atau null

var socCalCursor = null;

// Sidebar Planner (v68, perintah Patria 29 Okt 21:01): daftar kanal
// sebagai tombol ikon + status; klik kanal memunculkan kartu
// koneksinya DI DALAM sidebar (form hubungkan/putuskan + picker
// Page). Window utama HANYA kalender — composer + daftar antrean
// lama dihapus; penjadwalan lewat + di kartu (dialog tanggal),
// item tampil di kartu sebagai judul + ikon kanal, hapus via −.
var socSideSel = null; // id kanal terpilih di sidebar, null = belum memilih

function renderSideBar() {
  var s = socStore();
  var list = PLATFORMS.map(function (p) {
    var connected = tokenValid(s[p.id]);
    var sel = socSideSel === p.id ? ' sel' : '';
    return '<button class="soc-side-btn' + sel + '" data-soc-side="' + p.id + '"><span class="soc-mono">' + platMono(p.id) + '</span><span class="soc-side-name">' + esc(p.name) + '</span><span class="badge ' + (connected ? 'b-ok' : '') + '">' + (connected ? tr('soc.connected') : tr('soc.not_connected')) + '</span></button>';
  }).join('');
  var detail = '';
  if (!socSideSel) {
    detail = '<p class="se-note">' + tr('soc.side.hint') + '</p>';
  } else {
    var p = PLATFORMS.find(function (x) { return x.id === socSideSel; });
    detail = p ? renderChannels([p]) : '';
  }
  return '<div class="soc-side"><h3>' + tr('soc.side.title') + '</h3><div class="soc-side-list">' + list + '</div><div class="soc-side-detail">' + detail + '</div></div>';
}

export function renderNativePlanner() {
  var el = document.getElementById('nativePlanner');
  if (!el) return;
  el.innerHTML = '<div class="soc-wrap soc-layout">' + renderSideBar()
    + '<div class="soc-main"><div class="soc-cal">' + renderCalendar() + '</div>'
    + socDayDialogHTML()
    + '<p class="se-note">' + tr('soc.desc') + '</p></div></div>';
  // Bind sidebar: pilih kanal -> kartu koneksinya muncul di sidebar.
  el.querySelectorAll('[data-soc-side]').forEach(function (b) {
    b.addEventListener('click', function () { socSideSel = b.getAttribute('data-soc-side'); renderNativePlanner(); });
  });
  // Bind kanal (kartu detail di sidebar): hubungkan/putuskan/pilih Page.
  PLATFORMS.forEach(function (p) {
    socBind('socConn-' + p.id, function () { socConnect(p.id); });
    socBind('socDisc-' + p.id, function () {
      var st = socStore(); delete st[p.id]; socSave(st); renderNativePlanner();
    });
  });
  socBind('socCalPrev', function () {
    socCalCursor = socCalCursor || new Date();
    socCalCursor = new Date(socCalCursor.getFullYear(), socCalCursor.getMonth() - 1, 1);
    renderNativePlanner();
  });
  socBind('socCalNext', function () {
    socCalCursor = socCalCursor || new Date();
    socCalCursor = new Date(socCalCursor.getFullYear(), socCalCursor.getMonth() + 1, 1);
    renderNativePlanner();
  });
  el.querySelectorAll('.soc-cal-day[data-day]').forEach(function (cell) {
    cell.addEventListener('click', function () {
      socDayOpen = cell.getAttribute('data-day');
      renderNativePlanner();
    });
  });
  // + di kartu = buka dialog tanggal (alurnya sama dengan klik kartu;
  // stopPropagation agar tidak render ganda).
  el.querySelectorAll('[data-soc-add]').forEach(function (b) {
    b.addEventListener('click', function (e) {
      e.stopPropagation();
      socDayOpen = b.getAttribute('data-soc-add');
      renderNativePlanner();
    });
  });
  // − di chip = hapus penjadwalan itu saja (stopPropagation agar
  // dialog tanggal tidak ikut terbuka).
  el.querySelectorAll('[data-soc-del]').forEach(function (b) {
    b.addEventListener('click', function (e) {
      e.stopPropagation();
      queueSave(queueLoad().filter(function (it) { return String(it.id) !== b.getAttribute('data-soc-del'); }));
      renderNativePlanner();
    });
  });
  socBind('socDayCloseBtn', function () { socDayOpen = null; renderNativePlanner(); });
  socBind('socDayScheduleBtn', function () { socScheduleDay(); });
  socBind('socDayNowBtn', function () { socPublishDayNow(); });
  socBindSource('day', 'socDayText');
  el.querySelectorAll('[data-soc-daydel]').forEach(function (b) {
    b.addEventListener('click', function () {
      queueSave(queueLoad().filter(function (it) { return String(it.id) !== b.getAttribute('data-soc-daydel'); }));
      renderNativePlanner();
    });
  });
  el.querySelectorAll('[data-soc-pick]').forEach(function (b) {
    b.addEventListener('click', async function () {
      if (!socMetaPending) return;
      var pg = socMetaPending.pages.find(function (x) { return String(x.id) === b.getAttribute('data-soc-pick'); });
      if (!pg) return;
      if (socMetaPending.platform === 'instagram') {
        // IG: Page -> ID akun IG Business/Creator tertaut.
        var igBody;
        try { igBody = await invoke('social_meta_ig_id', { pageId: pg.id, token: pg.access_token }); }
        catch (e) { socNote(String(e || '')); return; }
        var igJ;
        try { igJ = JSON.parse(igBody); } catch (_) { socNote(tr('soc.err.ig_account')); return; }
        var igId = igJ.instagram_business_account && igJ.instagram_business_account.id;
        if (!igId) { socNote(tr('soc.err.ig_account')); return; }
        var s2 = socStore();
        s2.instagram = {
          clientId: socMetaPending.clientId, clientSecret: socMetaPending.clientSecret,
          userToken: socMetaPending.userToken,
          pageId: pg.id, pageName: pg.name, pageToken: pg.access_token,
          igUserId: igId, label: pg.name,
        };
        socSave(s2);
        socMetaPending = null;
        renderNativePlanner();
        return;
      }
      var s = socStore();
      s.facebook_page = {
        clientId: socMetaPending.clientId, clientSecret: socMetaPending.clientSecret,
        userToken: socMetaPending.userToken,
        pageId: pg.id, pageName: pg.name, pageToken: pg.access_token,
        expiresAt: 0, label: pg.name,
      };
      socSave(s);
      socMetaPending = null;
      renderNativePlanner();
    });
  });
}

function socNote(m) {
  // v68: composer (#socNote) dihapus bersama layout lama — catatan
  // jatuh ke #socDayNote bila dialog tanggal sedang terbuka.
  var el = document.getElementById('socNote') || document.getElementById('socDayNote');
  if (el) el.textContent = m;
}

function readFileB64(file) {
  return new Promise(function (resolve, reject) {
    var r = new FileReader();
    r.onload = function () {
      var s = String(r.result || '');
      resolve({ b64: s.split(',')[1] || '', mime: file.type || 'image/jpeg', name: file.name || 'image' });
    };
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

// Terbit sekarang dari dialog tanggal (v68): pengganti tombol
// composer lama yang dihapus bersama layout lama. Membaca form yang
// sama dengan socScheduleDay (teks + kanal tercentang + sumber),
// menerbitkan langsung ke tiap kanal tercentang, TANPA menyentuh
// antrean dan TANPA render ulang (dialog tetap terbuka agar catatan
// hasil per kanal tidak terhapus render).
async function socPublishDayNow() {
  var text = (document.getElementById('socDayText') || {}).value || '';
  text = text.trim();
  var noteEl = document.getElementById('socDayNote');
  var note = function (m) { if (noteEl) noteEl.textContent = m; };
  if (!text) { note(tr('soc.err.empty')); return; }
  var plats = Array.prototype.slice.call(document.querySelectorAll('.soc-day-chk:checked')).map(function (c) { return c.value; });
  if (!plats.length) { note(tr('soc.err.no_channel')); return; }
  var media = await socReadSource('day');
  var img = media.imageB64 ? { b64: media.imageB64, mime: media.imageMime || '' } : null;
  for (var i = 0; i < plats.length; i++) {
    await socPublishDirect(plats[i], text, img, media.imageUrl || '', media.imageFile || '');
  }
}
// Satu-satunya tempat yang merakit argumen publish — mencegah
// divergensi antar jalur (langsung / antrean / timer). Aturan IG:
// pageId yang dikirim adalah ID akun IG, bukan ID Page.
// Parameter mime dipakai jalur antrean (img = null): tanpa ini MIME
// gambar antrean selalu '' dan Rust default ke image/jpeg, sehingga
// WebP antrean dikirim berlabel JPEG (audit v66 B-M1).
function socPublishArgs(platform, ch, text, img, imgUrl, imageFile, mime) {
  return {
    platform: platform, text: text,
    imageB64: img ? img.b64 : '', imageMime: img ? img.mime : (mime || ''),
    accessToken: ch.accessToken || '',
    pageId: platform === 'instagram' ? (ch.igUserId || '') : (ch.pageId || ''),
    pageToken: ch.pageToken || '',
    imageUrl: imgUrl || '',
    imageFile: imageFile || '',
  };
}

function socDayDialogHTML() {
  if (!socDayOpen) return '';
  var parts = socDayOpen.split('-');
  var label = '';
  try { label = new Date(+parts[0], +parts[1] - 1, +parts[2]).toLocaleDateString(); } catch (_) { label = socDayOpen; }
  var items = queueLoad().filter(function (it) { return dayKey(it.scheduledAt) === socDayOpen; })
    .sort(function (a, b) { return a.scheduledAt - b.scheduledAt; });
  var list = items.length ? items.map(function (it) {
    var st = it.status === 'sent' ? tr('soc.status.sent')
      : it.status === 'failed' ? tr('soc.status.failed') + (it.error ? ' — ' + esc(it.error) : '')
      : it.status === 'sending' ? tr('soc.status.sending')
      : tr('soc.status.queued');
    var del = (it.status === 'queued' || it.status === 'failed' || it.status === 'sent')
      ? ' <button class="btn btn-sm" data-soc-daydel="' + it.id + '">' + tr('soc.delete') + '</button>'
      : '';
    return '<div class="soc-q"><b>' + esc(platName(it.platform)) + '</b> · ' + esc(fmtTime(it.scheduledAt)) + ' · ' + st
      + '<div>' + esc((it.text || '').slice(0, 120)) + ((it.imageB64 || it.imageFile) ? ' 📷' : '') + (it.imageUrl ? ' 🔗' : '') + '</div>' + del + '</div>';
  }).join('') : '<div>' + tr('soc.day.empty') + '</div>';
  var s = socStore();
  var checks = PLATFORMS.filter(function (p) { return tokenValid(s[p.id]); }).map(function (p) {
    return '<label><input type="checkbox" class="soc-day-chk" value="' + p.id + '" checked> ' + esc(p.name) + '</label>';
  }).join(' ') || tr('soc.no_channel');
  return '<div class="soc-daydlg"><h4>' + tr('soc.day.title', { date: label }) + '</h4>'
    + '<div>' + list + '</div>'
    + '<div class="soc-composer"><h4>' + tr('soc.day.add') + '</h4>'
    + '<textarea id="socDayText" rows="3" placeholder="' + tr('soc.text_ph') + '" style="width:100%"></textarea>'
    + '<div class="soc-row">' + checks + '</div>'
    + socSourceHTML('day')
    + '<div class="soc-row"><input type="time" id="socDayTime" value="09:00"></div>'
    + '<div class="soc-row"><button id="socDayScheduleBtn" class="btn btn-primary">' + tr('soc.schedule') + '</button> '
    + '<button id="socDayNowBtn" class="btn">' + tr('soc.publish_now') + '</button> '
    + '<button id="socDayCloseBtn" class="btn">' + tr('soc.close') + '</button></div>'
    + '<div id="socDayNote"></div></div></div>';
}

async function socScheduleDay() {
  if (!socDayOpen) return;
  var parts = socDayOpen.split('-');
  var timeEl = document.getElementById('socDayTime');
  var hm = (timeEl ? timeEl.value : '09:00') || '09:00';
  var hhmm = hm.split(':');
  var when = new Date(+parts[0], +parts[1] - 1, +parts[2], +(hhmm[0] || 9), +(hhmm[1] || 0)).getTime();
  var text = (document.getElementById('socDayText') || {}).value || '';
  text = text.trim();
  var noteEl = document.getElementById('socDayNote');
  var note = function (m) { if (noteEl) noteEl.textContent = m; };
  if (!text) { note(tr('soc.err.empty')); return; }
  var plats = Array.prototype.slice.call(document.querySelectorAll('.soc-day-chk:checked')).map(function (c) { return c.value; });
  if (!plats.length) { note(tr('soc.err.no_channel')); return; }
  var media = await socReadSource('day');
  var imageFile = media.imageFile || '';
  if (media.imageB64) {
    try {
      var saved = await invoke('image_save', { req: { name: 'soc-' + Date.now() + '-day', b64: media.imageB64 } });
      imageFile = saved.file || '';
    } catch (e) { note(String(e || '')); return; }
    if (!imageFile) { note(tr('soc.err.image')); return; }
  }
  // Audit v66 S-M3: file lokal untuk
  // Threads/IG/TikTok ditolak di sini, bukan di jam jatuh tempo.
  if (imageFile) {
    var blockedDay = plats.filter(function (pl) { return pl === 'threads' || pl === 'instagram' || pl === 'tiktok'; });
    if (blockedDay.length) { note(tr('soc.err.file_url')); return; }
  }
  var ids;
  try {
    ids = socQueueAdd(plats.map(function (pl) {
      return { platform: pl, text: text, imageFile: imageFile, imageMime: media.imageMime || '', imageUrl: media.imageUrl || '', scheduledAt: when };
    }));
  } catch (e) { note(String(e || '')); return; }
  if (!ids.length) { note(tr('soc.err.no_channel')); return; }
  renderNativePlanner();
}

async function socPublishDirect(platform, text, img, imgUrl, imageFile) {
  var s = socStore();
  var ch = s[platform];
  if (platform === 'x') ch = await socEnsureXToken(ch);
  if (!tokenValid(ch)) { socNote(platName(platform) + ': ' + tr('soc.err.token')); return; }
  try {
    await invoke('social_publish', { req: socPublishArgs(platform, ch, text, img, imgUrl, imageFile) });
    socNote(platName(platform) + ': ' + tr('soc.status.sent'));
  } catch (e) {
    socNote(platName(platform) + ': ' + String(e || ''));
  }
}

function socRandStr(n) {
  var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  var out = '';
  if (window.crypto && window.crypto.getRandomValues) {
    var buf = new Uint32Array(n);
    window.crypto.getRandomValues(buf);
    for (var i = 0; i < n; i++) out += chars[buf[i] % chars.length];
  } else {
    for (var j = 0; j < n; j++) out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

function socB64Url(bytes) {
  var bin = '';
  for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// X: OAuth 2.0 + PKCE (S256). Token hanya 2 jam — refresh ditangani
// socEnsureXToken sebelum publish (refresh_token berotasi).
async function socConnectX(clientId, clientSecret) {
  var verifier = socRandStr(64);
  var challenge;
  try {
    if (!window.crypto || !window.crypto.subtle) throw new Error('no-subtle');
    var hash = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
    challenge = socB64Url(new Uint8Array(hash));
  } catch (_) { socNote(tr('soc.err.pkce')); return; }
  var state = Math.random().toString(36).slice(2) + Date.now().toString(36);
  var authUrl = 'https://twitter.com/i/oauth2/authorize?response_type=code'
    + '&client_id=' + encodeURIComponent(clientId)
    + '&redirect_uri=' + encodeURIComponent(OAUTH_REDIRECT)
    + '&scope=' + encodeURIComponent('tweet.read tweet.write users.read media.write offline.access')
    + '&state=' + encodeURIComponent(state)
    + '&code_challenge=' + encodeURIComponent(challenge)
    + '&code_challenge_method=S256';
  socNote(tr('soc.wait_login'));
  var listenP = invoke('social_oauth_listen');
  try { await invoke('open_external_url', { url: authUrl }); }
  catch (e) { socNote(String(e || '')); return; }
  var res;
  try { res = await listenP; }
  catch (e) { socNote(String(e || '')); return; }
  var parsed;
  try { parsed = JSON.parse(res); } catch (_) { socNote(tr('soc.err.callback')); return; }
  if (parsed.state !== state) { socNote(tr('soc.err.state')); return; }
  var tok;
  try {
    tok = await invoke('social_token_exchange', { req: { platform: 'x', code: parsed.code, redirectUri: OAUTH_REDIRECT, clientId: clientId, clientSecret: clientSecret, codeVerifier: verifier } });
  } catch (e) { socNote(String(e || '')); return; }
  var tj;
  try { tj = JSON.parse(tok); } catch (_) { socNote(tr('soc.err.token_body')); return; }
  if (!tj.access_token) { socNote(tr('soc.err.token_body')); return; }
  var label = '';
  try {
    var me = await invoke('social_x_me', { token: tj.access_token });
    var mj = JSON.parse(me);
    label = mj.data && mj.data.username ? '@' + mj.data.username : '';
  } catch (_) {}
  var s = socStore();
  s.x = {
    clientId: clientId, clientSecret: clientSecret,
    accessToken: tj.access_token, refreshToken: tj.refresh_token || '',
    expiresAt: tj.expires_in ? Date.now() + tj.expires_in * 1000 : 0,
    label: label,
  };
  socSave(s);
  renderNativePlanner();
}

// TikTok: Login Kit (client_key di kolom ID) + scope video.publish.
// DIRECT_POST foto butuh URL publik — ditangani di sisi Rust.
async function socConnectTiktok(clientId, clientSecret) {
  var state = Math.random().toString(36).slice(2) + Date.now().toString(36);
  var authUrl = 'https://www.tiktok.com/v2/auth/authorize/?client_key=' + encodeURIComponent(clientId)
    + '&scope=' + encodeURIComponent('user.info.basic,video.publish')
    + '&response_type=code'
    + '&redirect_uri=' + encodeURIComponent(OAUTH_REDIRECT)
    + '&state=' + encodeURIComponent(state);
  socNote(tr('soc.wait_login'));
  var listenP = invoke('social_oauth_listen');
  try { await invoke('open_external_url', { url: authUrl }); }
  catch (e) { socNote(String(e || '')); return; }
  var res;
  try { res = await listenP; }
  catch (e) { socNote(String(e || '')); return; }
  var parsed;
  try { parsed = JSON.parse(res); } catch (_) { socNote(tr('soc.err.callback')); return; }
  if (parsed.state !== state) { socNote(tr('soc.err.state')); return; }
  var tok;
  try {
    tok = await invoke('social_token_exchange', { req: { platform: 'tiktok', code: parsed.code, redirectUri: OAUTH_REDIRECT, clientId: clientId, clientSecret: clientSecret } });
  } catch (e) { socNote(String(e || '')); return; }
  var tj;
  try { tj = JSON.parse(tok); } catch (_) { socNote(tr('soc.err.token_body')); return; }
  if (!tj.access_token) { socNote(tr('soc.err.token_body')); return; }
  var s = socStore();
  s.tiktok = {
    clientId: clientId, clientSecret: clientSecret,
    accessToken: tj.access_token, refreshToken: tj.refresh_token || '',
    expiresAt: tj.expires_in ? Date.now() + tj.expires_in * 1000 : 0,
    label: tj.open_id || 'TikTok',
  };
  socSave(s);
  renderNativePlanner();
}

// X: token hanya 2 jam — refresh otomatis (refresh_token berotasi)
// sebelum publish bila kedaluwarsa. Gagal refresh = token lama dipakai,
// publish gagal jujur dengan error token (bukan sukses palsu).
async function socEnsureXToken(ch) {
  if (!ch || !ch.refreshToken) return ch;
  if (ch.expiresAt && ch.expiresAt > Date.now() + 60000) return ch;
  try {
    var body = await invoke('social_x_refresh', { req: { refreshToken: ch.refreshToken, clientId: ch.clientId || '', clientSecret: ch.clientSecret || '' } });
    var j = JSON.parse(body);
    if (!j.access_token) return ch;
    ch.accessToken = j.access_token;
    if (j.refresh_token) ch.refreshToken = j.refresh_token;
    if (j.expires_in) ch.expiresAt = Date.now() + j.expires_in * 1000;
    var s = socStore(); s.x = ch; socSave(s);
  } catch (_) {}
  return ch;
}

async function socConnectMeta(platform, clientId, clientSecret) {
  var scope = platform === 'facebook_page'
    ? 'pages_show_list,pages_manage_posts,pages_read_engagement,business_management'
    : platform === 'instagram'
    ? 'instagram_basic,pages_show_list,business_management,instagram_content_publish,instagram_manage_insights'
    : 'threads_basic,threads_content_publish';
  var state = Math.random().toString(36).slice(2) + Date.now().toString(36);
  var authUrl = 'https://www.facebook.com/v25.0/dialog/oauth?client_id=' + encodeURIComponent(clientId)
    + '&redirect_uri=' + encodeURIComponent(OAUTH_REDIRECT)
    + '&scope=' + encodeURIComponent(scope)
    + '&state=' + encodeURIComponent(state);
  socNote(tr('soc.wait_login'));
  var listenP = invoke('social_oauth_listen');
  try { await invoke('open_external_url', { url: authUrl }); }
  catch (e) { socNote(String(e || '')); return; }
  var res;
  try { res = await listenP; }
  catch (e) { socNote(String(e || '')); return; }
  var parsed;
  try { parsed = JSON.parse(res); } catch (_) { socNote(tr('soc.err.callback')); return; }
  if (parsed.state !== state) { socNote(tr('soc.err.state')); return; }
  var tok;
  try {
    tok = await invoke('social_meta_exchange', { req: { code: parsed.code, redirectUri: OAUTH_REDIRECT, clientId: clientId, clientSecret: clientSecret } });
  } catch (e) { socNote(String(e || '')); return; }
  var tj;
  try { tj = JSON.parse(tok); } catch (_) { socNote(tr('soc.err.token_body')); return; }
  if (!tj.access_token) { socNote(tr('soc.err.token_body')); return; }
  if (platform === 'threads') {
    var s = socStore();
    s.threads = {
      clientId: clientId, clientSecret: clientSecret,
      accessToken: tj.access_token,
      expiresAt: tj.expires_in ? Date.now() + tj.expires_in * 1000 : 0,
      label: 'Threads',
    };
    socSave(s);
    renderNativePlanner();
    return;
  }
  // facebook_page + instagram: ambil daftar Page, tampilkan picker.
  var pagesBody;
  try { pagesBody = await invoke('social_meta_pages', { token: tj.access_token }); }
  catch (e) { socNote(String(e || '')); return; }
  var pj;
  try { pj = JSON.parse(pagesBody); } catch (_) { socNote(tr('soc.err.pages')); return; }
  var pages = (pj.data || []).filter(function (pg) { return pg.id && pg.access_token; });
  if (!pages.length) { socNote(tr('soc.err.pages')); return; }
  socMetaPending = {
    platform: platform, clientId: clientId, clientSecret: clientSecret,
    userToken: tj.access_token,
    expiresAt: tj.expires_in ? Date.now() + tj.expires_in * 1000 : 0,
    pages: pages,
  };
  renderNativePlanner();
}

async function socConnect(platform) {
  var idEl = document.getElementById('socId-' + platform);
  var secEl = document.getElementById('socSec-' + platform);
  var clientId = idEl ? idEl.value.trim() : '';
  var clientSecret = secEl ? secEl.value.trim() : '';
  if (!clientId || !clientSecret) { socNote(tr('soc.err.cred')); return; }
  if (platform === 'facebook_page' || platform === 'threads' || platform === 'instagram') {
    await socConnectMeta(platform, clientId, clientSecret);
    return;
  }
  if (platform === 'x') { await socConnectX(clientId, clientSecret); return; }
  if (platform === 'tiktok') { await socConnectTiktok(clientId, clientSecret); return; }
  if (platform !== 'linkedin') { socNote(tr('soc.coming')); return; }
  var state = Math.random().toString(36).slice(2) + Date.now().toString(36);
  var authUrl = 'https://www.linkedin.com/oauth/v2/authorization?response_type=code'
    + '&client_id=' + encodeURIComponent(clientId)
    + '&redirect_uri=' + encodeURIComponent(OAUTH_REDIRECT)
    + '&scope=' + encodeURIComponent('openid profile w_member_social')
    + '&state=' + encodeURIComponent(state);
  socNote(tr('soc.wait_login'));
  var listenP = invoke('social_oauth_listen');
  try { await invoke('open_external_url', { url: authUrl }); }
  catch (e) { socNote(String(e || '')); return; }
  var res;
  try { res = await listenP; }
  catch (e) { socNote(String(e || '')); return; }
  var parsed;
  try { parsed = JSON.parse(res); } catch (_) { socNote(tr('soc.err.callback')); return; }
  if (parsed.state !== state) { socNote(tr('soc.err.state')); return; }
  var tok;
  try {
    tok = await invoke('social_token_exchange', { req: { platform: 'linkedin', code: parsed.code, redirectUri: OAUTH_REDIRECT, clientId: clientId, clientSecret: clientSecret } });
  } catch (e) { socNote(String(e || '')); return; }
  var tj;
  try { tj = JSON.parse(tok); } catch (_) { socNote(tr('soc.err.token_body')); return; }
  if (!tj.access_token) { socNote(tr('soc.err.token_body')); return; }
  var label = '';
  try {
    var me = await invoke('social_linkedin_me', { token: tj.access_token });
    var mj = JSON.parse(me);
    label = mj.name || '';
  } catch (_) {}
  var s = socStore();
  s.linkedin = {
    clientId: clientId, clientSecret: clientSecret,
    accessToken: tj.access_token, refreshToken: tj.refresh_token || '',
    expiresAt: tj.expires_in ? Date.now() + tj.expires_in * 1000 : 0,
    label: label,
  };
  socSave(s);
  renderNativePlanner();
}

var socTimer = null;
var socTickRunning = false;
export function initSocialScheduler() {
  if (socTimer) return;
  // Pemulihan startup (audit v66 S-B1): item 'sending' dari sesi
  // sebelumnya tidak pernah kembali — ia macet tanpa tombol retry/
  // hapus. Tandai 'failed' dengan keterangan jujur (pengiriman itu
  // mungkin sudah sampai; pengguna memutuskan retry setelah memeriksa
  // kanal), sehingga item bisa di-retry/dihapus dari dialog kalender.
  try {
    var q0 = queueLoad();
    var recovered = false;
    q0.forEach(function (it) {
      if (it.status === 'sending') { it.status = 'failed'; it.error = tr('soc.err.stale'); recovered = true; }
    });
    if (recovered) queueSave(q0);
  } catch (_) {}
  socTimer = setInterval(async function () {
    if (socTickRunning) return; // audit v66 S-M1: tick tumpang-tindih
    socTickRunning = true;      // bisa mengirim item yang sama 2x.
    try {
    var q = queueLoad();
    var due = q.filter(function (it) { return it.status === 'queued' && it.scheduledAt <= Date.now(); });
    if (!due.length) return;
    for (var i = 0; i < due.length; i++) {
      var it = due[i];
      it.status = 'sending';
      queueSave(q);
      var s = socStore();
      var ch = s[it.platform];
      if (it.platform === 'x') ch = await socEnsureXToken(ch);
      // Audit v66 S-B1: 'continue' di sini dulu melompati queueSave
      // di akhir loop, sehingga status 'failed' hilang dan tick berikut
      // memproses ulang item yang sama tanpa henti (untuk X: refresh
      // token tiap 30 detik selamanya). Simpan SEBELUM continue.
      if (!tokenValid(ch)) { it.status = 'failed'; it.error = tr('soc.err.token'); queueSave(q); continue; }
      try {
        await invoke('social_publish', { req: socPublishArgs(it.platform, ch, it.text, null, it.imageUrl || '', it.imageFile || '', it.imageMime || '') });
        it.status = 'sent'; it.error = '';
      } catch (e) {
        it.status = 'failed'; it.error = String(e || '');
      }
      queueSave(q);
    }
    renderNativePlanner();
    } finally {
      socTickRunning = false;
    }
  }, 30000);
}
