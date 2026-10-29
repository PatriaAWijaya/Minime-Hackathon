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
  { id: 'facebook', name: 'Facebook', mono: 'FB', icon: 'fb-icon.png', note: 'soc.note.fb_profile', can: false },
  { id: 'facebook_page', name: 'Facebook Page', mono: 'FP', icon: 'fb-icon.png', note: '', can: true },
  { id: 'instagram', name: 'Instagram', mono: 'IG', icon: 'ig-icon.png', note: 'soc.note.ig_url', can: true },
  { id: 'threads', name: 'Threads', mono: 'TH', icon: 'threads-icon.png', note: 'soc.note.threads_text', can: true },
  { id: 'linkedin', name: 'LinkedIn', mono: 'IN', icon: 'linkedin-icon.png', note: '', can: true },
  { id: 'youtube', name: 'YouTube', mono: 'YT', icon: 'youtube-icon.png', note: 'soc.note.youtube_video', can: true },
  { id: 'tiktok', name: 'TikTok', mono: 'TT', icon: 'tiktok-icon.png', note: 'soc.note.tiktok_url', can: true },
  { id: 'x', name: 'X', mono: 'X', icon: 'x-icon.png', note: 'soc.note.x_cost', can: true },
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
// Ikon kanal v69: logo asli dari app/public (pola yang sama dengan
// ikon rail di App.svelte: src relatif "./nama.png", TANPA invert —
// logo brand harus tampil apa adanya). Kanal tanpa berkas logo
// tetap memakai monogram sebagai fallback.
function platIconHTML(id, sm) {
  var p = PLATFORMS.find(function (x) { return x.id === id; });
  var cls = sm ? 'soc-icon sm' : 'soc-icon';
  if (p && p.icon) return '<img class="' + cls + '" src="./' + p.icon + '" alt="">';
  var mcls = sm ? 'soc-mono sm' : 'soc-mono';
  return '<span class="' + mcls + '">' + (p ? p.mono : '?') + '</span>';
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
    } else if (socYtPending && socYtPending.platform === p.id) {
      body = '<div>' + tr('soc.yt_pick') + '</div>' + socYtPending.channels.map(function (ch) {
        return '<div class="soc-row"><button class="btn btn-sm" data-soc-ytpick="' + esc(ch.id) + '">' + esc(ch.name) + '</button></div>';
      }).join('');
    } else if (connected) {
      body = '<div class="soc-row"><button id="socDisc-' + p.id + '" class="btn btn-sm">' + tr('soc.disconnect') + '</button></div>';
    } else {
      var hint = p.id === 'facebook_page' ? tr('soc.meta_hint')
        : p.id === 'threads' ? tr('soc.threads_hint')
        : p.id === 'youtube' ? tr('soc.yt_hint')
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
      var cls = it.status === 'sent' ? ' soc-item-sent' : (it.status === 'draft' ? ' soc-item-draft' : '');
      var title = it.status === 'draft' ? tr('soc.draft_label') + ': ' + socItemTitle(it.text) : socItemTitle(it.text);
      var editAttr = (it.status === 'draft' || it.status === 'queued' || it.status === 'failed') ? ' data-soc-edit="' + it.id + '"' : '';
      return '<div class="soc-item' + cls + '"' + editAttr + ' title="' + esc(it.text || '') + '">' + platIconHTML(it.platform, true) + '<span class="soc-item-title">' + esc(title) + '</span>' + fail + '<button class="soc-del" data-soc-del="' + it.id + '" title="' + tr('soc.delete') + '">−</button></div>';
    }).join('');
    cells += '<div class="soc-cal-day" data-day="' + k + '"><div class="soc-day-head"><b>' + d + '</b><button class="soc-add" data-soc-add="' + k + '" title="' + tr('soc.create_post') + '">+</button></div>' + chips + '</div>';
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
      scheduledAt: it.scheduledAt, status: it.status || 'queued', error: '',
      repeat: it.repeat || '',
    };
    q.push(row);
    ids.push(row.id);
  });
  // Gagal simpan = lempar, bukan kembalikan id palsu: pemanggil
  // (Batch) hanya boleh menandai 'scheduled' bila antrean tersimpan.
  if (!queueSave(q)) throw new Error(tr('soc.err.save'));
  return ids;
}

// Akses item Library untuk sumber media komposer (v72).
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
var socCalCursor = null;

// Sidebar Planner gaya Postiz (v72, perintah Patria 30 Okt 00:28):
// tombol Tambah Channel di atas + Buat Postingan di bawahnya,
// lalu HANYA channel terhubung sebagai baris (avatar + nama akun +
// badge platform, persis baris channel Postiz). Channel belum
// terhubung TIDAK tampil di sini — hubungkan lewat popup Tambah
// Channel. Klik baris = kartu detailnya (Putuskan / picker Page).
var socSideSel = null; // id kanal terhubung terpilih di sidebar
var socPopOpen = false; // popup Tambah Channel terbuka
var socPopForm = null; // platform yang sedang isi kredensial di popup
var socPopMsg = ''; // pesan di popup (mis. FB profil tidak bisa autopost)
var socWizStep = 1; // langkah wizard hubungkan (1-4), in-memory saja
// Wizard hubungkan v73 (semua kanal, bukan cuma IG): tiap kanal punya
// situs + URL dashboard aplikasi providernya + 3 teks terpandu (buat
// aplikasi, tempel URI, cari ID/Secret). FB Page + IG berbagi aplikasi
// Meta yang sama (satu App ID/Secret untuk kedua kartu).
var SOC_WIZ = {
  facebook_page: { site: 'developers.facebook.com', url: 'https://developers.facebook.com/apps/create/', app: 'soc.wiz.app_meta', uri: 'soc.wiz.uri_meta', find: 'soc.wiz.find_meta' },
  instagram: { site: 'developers.facebook.com', url: 'https://developers.facebook.com/apps/create/', app: 'soc.wiz.app_meta', uri: 'soc.wiz.uri_meta', find: 'soc.wiz.find_meta' },
  threads: { site: 'developers.facebook.com', url: 'https://developers.facebook.com/apps/', app: 'soc.wiz.app_th', uri: 'soc.wiz.uri_th', find: 'soc.wiz.find_th' },
  linkedin: { site: 'linkedin.com', url: 'https://www.linkedin.com/developers/apps', app: 'soc.wiz.app_in', uri: 'soc.wiz.uri_in', find: 'soc.wiz.find_in' },
  tiktok: { site: 'developers.tiktok.com', url: 'https://developers.tiktok.com/apps/', app: 'soc.wiz.app_tt', uri: 'soc.wiz.uri_tt', find: 'soc.wiz.find_tt' },
  youtube: { site: 'console.cloud.google.com', url: 'https://console.cloud.google.com/apis/credentials', app: 'soc.wiz.app_yt', uri: 'soc.wiz.uri_yt', find: 'soc.wiz.find_yt' },
  x: { site: 'developer.x.com', url: 'https://developer.x.com/en/portal/dashboard', app: 'soc.wiz.app_x', uri: 'soc.wiz.uri_x', find: 'soc.wiz.find_x' },
};

function socAvatarHTML(p, ch) {
  if (ch && ch.picture) return '<img class="soc-avatar" src="' + esc(ch.picture) + '" alt="">';
  return platIconHTML(p.id, false);
}

function renderSideBar() {
  var s = socStore();
  var rows = PLATFORMS.filter(function (p) { return tokenValid(s[p.id]); }).map(function (p) {
    var ch = s[p.id];
    var sel = socSideSel === p.id ? ' sel' : '';
    return '<button class="soc-side-row' + sel + '" data-soc-side="' + p.id + '"><span class="soc-avatar-wrap">' + socAvatarHTML(p, ch) + '<span class="soc-row-badge">' + platIconHTML(p.id, true) + '</span></span><span class="soc-side-name">' + esc(ch.label || p.name) + '</span></button>';
  }).join('');
  var detail = '';
  var pendingPlat = socMetaPending ? socMetaPending.platform : (socYtPending ? socYtPending.platform : null);
  if (pendingPlat) {
    var pp = PLATFORMS.find(function (x) { return x.id === pendingPlat; });
    detail = pp ? renderChannels([pp]) : '';
  } else if (socSideSel) {
    var p = PLATFORMS.find(function (x) { return x.id === socSideSel; });
    detail = p ? renderChannels([p]) : '';
  } else {
    detail = '<p class="se-note">' + tr('soc.side.hint') + '</p>';
  }
  return '<div class="soc-side"><h3>' + tr('soc.side.title') + '</h3>'
    + '<div class="soc-row"><button id="socAddChannel" class="btn btn-primary" style="width:100%">+ ' + tr('soc.add_channel') + '</button></div>'
    + '<div class="soc-row"><button id="socCreatePost" class="btn" style="width:100%">+ ' + tr('soc.create_post') + '</button></div>'
    + '<div class="soc-side-list">' + rows + '</div><div class="soc-side-detail">' + detail + '</div></div>';
}

// Popup Tambah Channel gaya Postiz (v72): grid ikon + nama aplikasi
// di bawahnya. Klik ikon:
//  - FB profil: penjelasan jujur (API tidak mengizinkan autopost
//    profil; Postiz pun tidak menawarkannya).
//  - kredensial tersimpan: login browser LANGSUNG (tanpa form).
//  - belum ada kredensial: form ID + Secret di dalam popup;
//    Hubungkan menyimpan kredensial lalu login browser otomatis.
function socPopHTML() {
  if (!socPopOpen) return '';
  var inner = '';
  if (socPopMsg) {
    inner = '<p>' + esc(socPopMsg) + '</p><div class="soc-row"><button class="btn btn-sm" id="socPopBack">' + tr('soc.back') + '</button></div>';
  } else if (socPopForm) {
    if (SOC_WIZ[socPopForm]) { inner = socWizHTML(socPopForm); }
    else {
    var p = PLATFORMS.find(function (x) { return x.id === socPopForm; });
    var ch = socStore()[socPopForm] || {};
    inner = '<h4>' + esc(p ? p.name : socPopForm) + '</h4>'
      + '<div class="se-note">' + tr('soc.cred_hint') + '</div>'
      + '<div class="soc-row"><input type="text" id="socPopId" placeholder="' + tr('soc.ph.id') + '" style="width:180px" value="' + esc(ch.clientId || '') + '"> '
      + '<input type="password" id="socPopSec" placeholder="' + tr('soc.ph.secret') + '" style="width:180px"></div>'
      + '<div class="soc-row"><button id="socPopConn" class="btn btn-sm btn-primary">' + tr('soc.connect') + '</button> '
      + '<button id="socPopBack" class="btn btn-sm">' + tr('soc.back') + '</button></div>'
      + '<div id="socPopNote" class="se-note"></div>';
    }
  } else {
    inner = '<h4>' + tr('soc.add_channel') + '</h4><div class="soc-pop-grid">' + PLATFORMS.map(function (p) {
      return '<button class="soc-pop-tile" data-soc-tile="' + p.id + '">' + platIconHTML(p.id, false) + '<span>' + esc(p.name) + '</span></button>';
    }).join('') + '</div>';
  }
  return '<div class="soc-pop-overlay"><div class="soc-pop"><button class="soc-pop-x" id="socPopClose">×</button>' + inner + '</div></div>';
}

function socWizHTML(platform) {
  var w = SOC_WIZ[platform];
  var p = PLATFORMS.find(function (x) { return x.id === platform; });
  var st = socStore()[platform] || {};
  var steps = ['soc.wiz.s1', 'soc.wiz.s2', 'soc.wiz.s3', 'soc.wiz.s4'];
  var head = '<h4>' + esc(p ? p.name : platform) + ' — ' + tr('soc.wiz.title') + '</h4>'
    + '<div class="soc-wiz-steps">' + steps.map(function (k, i) {
      return '<span class="soc-wiz-step' + (socWizStep === i + 1 ? ' on' : '') + '">' + (i + 1) + '. ' + tr(k) + '</span>';
    }).join('') + '</div>';
  var body = '';
  if (socWizStep === 1) {
    body = '<p>' + tr(w.app) + '</p>'
      + '<div class="soc-row"><button id="socWizOpen" class="btn btn-sm btn-primary">' + tr('soc.wiz.open') + ' ' + esc(w.site) + '</button> '
      + '<button id="socWizNext" class="btn btn-sm">' + tr('soc.wiz.next') + '</button></div>';
  } else if (socWizStep === 2) {
    body = '<p>' + tr('soc.wiz.t2') + '</p>'
      + '<div class="soc-row"><input type="text" readonly id="socWizUri" class="soc-wiz-uri" value="' + esc(OAUTH_REDIRECT) + '"> '
      + '<button id="socWizCopy" class="btn btn-sm">' + tr('soc.wiz.copy') + '</button></div>'
      + '<div class="soc-row"><button id="socWizNext" class="btn btn-sm btn-primary">' + tr('soc.wiz.next') + '</button></div>'
      + '<div id="socWizNote" class="se-note"></div>';
  } else if (socWizStep === 3) {
    body = '<p>' + tr(w.uri) + '</p>'
      + '<div class="soc-row"><button id="socWizNext" class="btn btn-sm btn-primary">' + tr('soc.wiz.next') + '</button></div>';
  } else {
    var useBtn = '';
    if (platform === 'instagram') {
      var fb = socStore().facebook_page || {};
      if (fb.clientId && fb.clientSecret) useBtn = '<button id="socWizUseFb" class="btn btn-sm">' + tr('soc.wiz.use_fb') + '</button> ';
    }
    if (platform === 'facebook_page') {
      var ig = socStore().instagram || {};
      if (ig.clientId && ig.clientSecret) useBtn = '<button id="socWizUseIg" class="btn btn-sm">' + tr('soc.wiz.use_ig') + '</button> ';
    }
    body = '<p>' + tr(w.find) + '</p>'
      + '<div class="se-note">' + tr('soc.cred_hint') + '</div>'
      + '<div class="soc-row"><input type="text" id="socPopId" placeholder="' + tr('soc.ph.id') + '" style="width:180px" value="' + esc(st.clientId || '') + '"> '
      + '<input type="password" id="socPopSec" placeholder="' + tr('soc.ph.secret') + '" style="width:180px"></div>'
      + '<div class="soc-row">' + useBtn + '<button id="socPopConn" class="btn btn-sm btn-primary">' + tr('soc.connect') + '</button></div>'
      + '<div id="socPopNote" class="se-note"></div>';
  }
  var nav = '<div class="soc-row">'
    + (socWizStep > 1 ? '<button id="socWizPrev" class="btn btn-sm">' + tr('soc.back') + '</button> ' : '<button id="socPopBack" class="btn btn-sm">' + tr('soc.back') + '</button> ')
    + (socWizStep < 4 ? '<button id="socWizSkip" class="btn btn-sm">' + tr('soc.wiz.have') + '</button>' : '')
    + '</div>';
  return head + body + nav;
}

function socWizCopyFn() {
  var done = function () { var n = document.getElementById('socWizNote'); if (n) n.textContent = tr('soc.wiz.copied'); };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(OAUTH_REDIRECT).then(done).catch(function () { socWizCopyFallback(); done(); });
  } else { socWizCopyFallback(); done(); }
}

function socWizCopyFallback() {
  try {
    var ta = document.createElement('textarea');
    ta.value = OAUTH_REDIRECT; document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); document.body.removeChild(ta);
  } catch (_) {}
}

function socPopTile(platform) {
  if (platform === 'facebook') {
    socPopMsg = tr('soc.note.fb_profile');
    socPopForm = null;
    renderNativePlanner();
    return;
  }
  var ch = socStore()[platform] || {};
  if (ch.clientId && ch.clientSecret) {
    socPopOpen = false; socPopForm = null; socPopMsg = '';
    renderNativePlanner();
    socConnectCreds(platform, ch.clientId, ch.clientSecret);
    return;
  }
  socPopForm = platform; socPopMsg = ''; socWizStep = 1;
  renderNativePlanner();
}

export function renderNativePlanner() {
  var el = document.getElementById('nativePlanner');
  if (!el) return;
  el.innerHTML = '<div class="soc-wrap soc-layout">' + renderSideBar()
    + '<div class="soc-main"><div class="soc-cal">' + renderCalendar() + '</div>'
    + socComposerHTML()
    + '</div></div>' + socPopHTML();
  // Bind sidebar: pilih kanal -> kartu koneksinya muncul di sidebar.
  el.querySelectorAll('[data-soc-side]').forEach(function (b) {
    b.addEventListener('click', function () { socSideSel = b.getAttribute('data-soc-side'); renderNativePlanner(); });
  });
  // Bind kanal (kartu detail di sidebar): hubungkan/putuskan/pilih Page.
  PLATFORMS.forEach(function (p) {
    socBind('socConn-' + p.id, function () { socConnect(p.id); });
    socBind('socDisc-' + p.id, function () {
      var st = socStore();
      var old = st[p.id] || {};
      // Putuskan = hapus token + identitas akun, tapi SIMPAN kredensial
      // aplikasi (v72): popup Tambah Channel bisa login langsung tanpa
      // isi ulang Client ID/Secret.
      if (old.clientId && old.clientSecret) { st[p.id] = { clientId: old.clientId, clientSecret: old.clientSecret }; }
      else { delete st[p.id]; }
      socSave(st);
      if (socSideSel === p.id) socSideSel = null;
      renderNativePlanner();
    });
  });
  // Bind popup Tambah Channel.
  socBind('socAddChannel', function () { socPopOpen = true; socPopForm = null; socPopMsg = ''; socWizStep = 1; renderNativePlanner(); });
  socBind('socPopClose', function () { socPopOpen = false; socPopForm = null; socPopMsg = ''; renderNativePlanner(); });
  socBind('socPopBack', function () { socPopForm = null; socPopMsg = ''; renderNativePlanner(); });
  el.querySelectorAll('[data-soc-tile]').forEach(function (b) {
    b.addEventListener('click', function () { socPopTile(b.getAttribute('data-soc-tile')); });
  });
  socBind('socPopConn', function () {
    var idEl = document.getElementById('socPopId');
    var secEl = document.getElementById('socPopSec');
    var cid = idEl ? idEl.value.trim() : '';
    var csec = secEl ? secEl.value.trim() : '';
    if (!cid || !csec) {
      var n = document.getElementById('socPopNote');
      if (n) n.textContent = tr('soc.err.cred');
      return;
    }
    var platform = socPopForm;
    if (!platform) return;
    var s = socStore();
    s[platform] = Object.assign({}, s[platform] || {}, { clientId: cid, clientSecret: csec });
    socSave(s);
    socPopOpen = false; socPopForm = null; socPopMsg = '';
    renderNativePlanner();
    socConnectCreds(platform, cid, csec);
  });
  // Binding wizard hubungkan v73 (null-safe via socBind).
  socBind('socWizOpen', function () { var w = SOC_WIZ[socPopForm]; if (w) invoke('open_external_url', { url: w.url }); });
  socBind('socWizCopy', function () { socWizCopyFn(); });
  socBind('socWizNext', function () { if (socWizStep < 4) { socWizStep++; renderNativePlanner(); } });
  socBind('socWizPrev', function () { if (socWizStep > 1) { socWizStep--; renderNativePlanner(); } });
  socBind('socWizSkip', function () { socWizStep = 4; renderNativePlanner(); });
  socBind('socWizUseFb', function () {
    var fb = socStore().facebook_page || {};
    var a = document.getElementById('socPopId'); var b = document.getElementById('socPopSec');
    if (a) a.value = fb.clientId || ''; if (b) b.value = fb.clientSecret || '';
  });
  socBind('socWizUseIg', function () {
    var ig = socStore().instagram || {};
    var a = document.getElementById('socPopId'); var b = document.getElementById('socPopSec');
    if (a) a.value = ig.clientId || ''; if (b) b.value = ig.clientSecret || '';
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
  // Klik kartu / tombol + = buka komposer Buat Postingan untuk
  // tanggal itu (Postiz: klik sel kalender membuka Create Post).
  el.querySelectorAll('.soc-cal-day[data-day]').forEach(function (cell) {
    cell.addEventListener('click', function () {
      socComposerOpen(cell.getAttribute('data-day'), null);
    });
  });
  el.querySelectorAll('[data-soc-add]').forEach(function (b) {
    b.addEventListener('click', function (e) {
      e.stopPropagation();
      socComposerOpen(b.getAttribute('data-soc-add'), null);
    });
  });
  // − di chip = hapus penjadwalan itu saja (stopPropagation agar
  // komposer tidak ikut terbuka).
  el.querySelectorAll('[data-soc-del]').forEach(function (b) {
    b.addEventListener('click', function (e) {
      e.stopPropagation();
      queueSave(queueLoad().filter(function (it) { return String(it.id) !== b.getAttribute('data-soc-del'); }));
      renderNativePlanner();
    });
  });
  // Klik chip draf/antrean/gagal = edit di komposer.
  el.querySelectorAll('[data-soc-edit]').forEach(function (b) {
    b.addEventListener('click', function (e) {
      e.stopPropagation();
      var it = queueLoad().find(function (x) { return String(x.id) === b.getAttribute('data-soc-edit'); });
      if (it) socComposerOpen(dayKey(it.scheduledAt), it.id);
    });
  });
  // Tombol Buat Postingan di sidebar = komposer untuk hari ini.
  socBind('socCreatePost', function () { socComposerOpen(dayKey(Date.now()), null); });
  el.querySelectorAll('[data-soc-ytpick]').forEach(function (b) {
    b.addEventListener('click', function () {
      if (!socYtPending) return;
      var ch = socYtPending.channels.find(function (x) { return String(x.id) === b.getAttribute('data-soc-ytpick'); });
      if (!ch) return;
      var s = socStore();
      s.youtube = {
        clientId: socYtPending.clientId, clientSecret: socYtPending.clientSecret,
        accessToken: socYtPending.accessToken, refreshToken: socYtPending.refreshToken || '',
        expiresAt: socYtPending.expiresAt || 0,
        channelId: ch.id, label: ch.name, picture: ch.picture || '',
      };
      socSave(s);
      socYtPending = null;
      renderNativePlanner();
    });
  });
  socBindComposer();
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
        var igId = igJ.id || (igJ.instagram_business_account && igJ.instagram_business_account.id);
        if (!igId) { socNote(tr('soc.err.ig_account')); return; }
        var s2 = socStore();
        s2.instagram = {
          clientId: socMetaPending.clientId, clientSecret: socMetaPending.clientSecret,
          userToken: socMetaPending.userToken,
          pageId: pg.id, pageName: pg.name, pageToken: pg.access_token,
          igUserId: igId, label: igJ.username || pg.name, picture: igJ.picture || '',
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
        picture: (pg.picture && pg.picture.data && pg.picture.data.url) || '',
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
  var el = document.getElementById('socNote') || document.getElementById('socComposerNote');
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

async function socPublishDirect(platform, text, img, imgUrl, imageFile) {
  if (img && (img.mime || '').indexOf('video/') === 0 && platform !== 'youtube') {
    return { ok: false, msg: platName(platform) + ': ' + tr('soc.err.yt_only') };
  }
  var s = socStore();
  var ch = s[platform];
  if (platform === 'x') ch = await socEnsureXToken(ch);
  if (platform === 'threads') ch = await socEnsureThreadsToken(ch);
  if (platform === 'linkedin') ch = await socEnsureRefresh(ch, 'social_linkedin_refresh', 'linkedin');
  if (platform === 'tiktok') ch = await socEnsureRefresh(ch, 'social_tiktok_refresh', 'tiktok');
  if (platform === 'youtube') ch = await socEnsureRefresh(ch, 'social_youtube_refresh', 'youtube');
  if (!tokenValid(ch)) { return { ok: false, msg: platName(platform) + ': ' + tr('soc.err.token') }; }
  try {
    await invoke('social_publish', { req: socPublishArgs(platform, ch, text, img, imgUrl, imageFile) });
    return { ok: true, msg: platName(platform) + ': ' + tr('soc.status.sent') };
  } catch (e) {
    return { ok: false, msg: platName(platform) + ': ' + String(e || '') };
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
  var xPicture = '';
  try {
    var me = await invoke('social_x_me', { token: tj.access_token });
    var mj = JSON.parse(me);
    label = mj.data && mj.data.username ? '@' + mj.data.username : '';
    xPicture = (mj.data && mj.data.profile_image_url) || '';
  } catch (_) {}
  var s = socStore();
  s.x = {
    clientId: clientId, clientSecret: clientSecret,
    accessToken: tj.access_token, refreshToken: tj.refresh_token || '',
    expiresAt: tj.expires_in ? Date.now() + tj.expires_in * 1000 : 0,
    label: label, picture: xPicture,
  };
  socSave(s);
  renderNativePlanner();
}

// TikTok: Login Kit (client_key di kolom ID) + scope video.publish.
// DIRECT_POST foto butuh URL publik — ditangani di sisi Rust.
async function socConnectTiktok(clientId, clientSecret) {
  var state = Math.random().toString(36).slice(2) + Date.now().toString(36);
  var authUrl = 'https://www.tiktok.com/v2/auth/authorize/?client_key=' + encodeURIComponent(clientId)
    + '&scope=' + encodeURIComponent('video.list,user.info.basic,video.publish,video.upload,user.info.profile,user.info.stats')
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
  var tkLabel = tj.open_id || 'TikTok';
  var tkPicture = '';
  try {
    var tme = await invoke('social_tiktok_me', { token: tj.access_token });
    var tmj = JSON.parse(tme);
    var tdata = tmj.data || tmj;
    tkLabel = tdata.display_name || tdata.username || tj.open_id || 'TikTok';
    tkPicture = tdata.avatar_url || '';
  } catch (_) {}
  var s = socStore();
  s.tiktok = {
    clientId: clientId, clientSecret: clientSecret,
    accessToken: tj.access_token, refreshToken: tj.refresh_token || '',
    expiresAt: tj.expires_in ? Date.now() + tj.expires_in * 1000 : 0,
    label: tkLabel, picture: tkPicture,
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
  // Scope cara Postiz (v71): FB Page +pages_manage_engagement
  // +read_insights; IG +pages_read_engagement +manage_comments.
  var scope = platform === 'facebook_page'
    ? 'pages_show_list,business_management,pages_manage_posts,pages_manage_engagement,pages_read_engagement,read_insights'
    : 'instagram_basic,pages_show_list,pages_read_engagement,business_management,instagram_content_publish,instagram_manage_comments,instagram_manage_insights';
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

// Threads mandiri (cara Postiz, v71): authorize di threads.net +
// tukar code di graph.threads.net + th_exchange_token (58 hari).
// Alur lama (dialog Facebook + fb_exchange_token) menghasilkan token
// Facebook yang ditolak graph.threads.net — connect Threads lama
// tidak pernah bisa live.
async function socConnectThreads(clientId, clientSecret) {
  var scope = 'threads_basic,threads_content_publish,threads_manage_replies,threads_manage_insights';
  var state = Math.random().toString(36).slice(2) + Date.now().toString(36);
  var authUrl = 'https://www.threads.net/oauth/authorize?client_id=' + encodeURIComponent(clientId)
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
    tok = await invoke('social_threads_exchange', { req: { code: parsed.code, redirectUri: OAUTH_REDIRECT, clientId: clientId, clientSecret: clientSecret } });
  } catch (e) { socNote(String(e || '')); return; }
  var tj;
  try { tj = JSON.parse(tok); } catch (_) { socNote(tr('soc.err.token_body')); return; }
  if (!tj.access_token) { socNote(tr('soc.err.token_body')); return; }
  var label = '';
  var thPicture = '';
  try {
    var me = await invoke('social_threads_me', { token: tj.access_token });
    var mj = JSON.parse(me);
    label = mj.username || '';
    thPicture = mj.threads_profile_picture_url || '';
  } catch (_) {}
  var s = socStore();
  s.threads = {
    clientId: clientId, clientSecret: clientSecret,
    accessToken: tj.access_token, refreshToken: tj.access_token,
    expiresAt: tj.expires_in ? Date.now() + tj.expires_in * 1000 : 0,
    label: label || 'Threads', picture: thPicture,
  };
  socSave(s);
  renderNativePlanner();
}

var socYtPending = null; // {platform, clientId, clientSecret, accessToken, refreshToken, expiresAt, channels}

// YouTube (cara Postiz, v71): OAuth Google (offline + consent) ->
// tukar code -> daftar channel (channels.list mine=true) -> picker.
async function socConnectYoutube(clientId, clientSecret) {
  var scope = 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/youtube.readonly';
  var state = Math.random().toString(36).slice(2) + Date.now().toString(36);
  var authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?client_id=' + encodeURIComponent(clientId)
    + '&redirect_uri=' + encodeURIComponent(OAUTH_REDIRECT)
    + '&response_type=code'
    + '&scope=' + encodeURIComponent(scope)
    + '&access_type=offline&prompt=consent'
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
    tok = await invoke('social_youtube_exchange', { req: { code: parsed.code, redirectUri: OAUTH_REDIRECT, clientId: clientId, clientSecret: clientSecret } });
  } catch (e) { socNote(String(e || '')); return; }
  var tj;
  try { tj = JSON.parse(tok); } catch (_) { socNote(tr('soc.err.token_body')); return; }
  if (!tj.access_token) { socNote(tr('soc.err.token_body')); return; }
  var chBody;
  try { chBody = await invoke('social_youtube_channels', { token: tj.access_token }); }
  catch (e) { socNote(String(e || '')); return; }
  var cj;
  try { cj = JSON.parse(chBody); } catch (_) { socNote(tr('soc.err.channels')); return; }
  var channels = (cj.items || []).map(function (it) {
    var th = it.snippet && it.snippet.thumbnails;
    return { id: it.id || '', name: (it.snippet && it.snippet.title) || it.id || '',
      picture: (th && th.default && th.default.url) || '' };
  }).filter(function (c) { return c.id; });
  if (!channels.length) { socNote(tr('soc.err.channels')); return; }
  socYtPending = {
    platform: 'youtube', clientId: clientId, clientSecret: clientSecret,
    accessToken: tj.access_token, refreshToken: tj.refresh_token || '',
    expiresAt: tj.expires_in ? Date.now() + tj.expires_in * 1000 : 0,
    channels: channels,
  };
  renderNativePlanner();
}

// Refresh generik ala Postiz (v71): LinkedIn + TikTok + YouTube
// memutar refresh token sebelum publish bila kedaluwarsa.
// Gagal refresh = token lama dipakai, publish gagal jujur.
async function socEnsureRefresh(ch, cmd, storeKey) {
  if (!ch || !ch.refreshToken) return ch;
  if (ch.expiresAt && ch.expiresAt > Date.now() + 60000) return ch;
  try {
    var body = await invoke(cmd, { req: { clientId: ch.clientId || '', clientSecret: ch.clientSecret || '', refreshToken: ch.refreshToken } });
    var j = JSON.parse(body);
    if (!j.access_token) return ch;
    ch.accessToken = j.access_token;
    if (j.refresh_token) ch.refreshToken = j.refresh_token;
    if (j.expires_in) ch.expiresAt = Date.now() + j.expires_in * 1000;
    var s = socStore(); s[storeKey] = ch; socSave(s);
  } catch (_) {}
  return ch;
}

// Refresh Threads (cara Postiz): token baru disimpan sebagai
// access DAN refresh (rotasi 58 hari).
async function socEnsureThreadsToken(ch) {
  if (!ch || !ch.refreshToken) return ch;
  if (ch.expiresAt && ch.expiresAt > Date.now() + 60000) return ch;
  try {
    var body = await invoke('social_threads_refresh', { token: ch.refreshToken });
    var j = JSON.parse(body);
    if (!j.access_token) return ch;
    ch.accessToken = j.access_token;
    ch.refreshToken = j.access_token;
    if (j.expires_in) ch.expiresAt = Date.now() + j.expires_in * 1000;
    var s = socStore(); s.threads = ch; socSave(s);
  } catch (_) {}
  return ch;
}

async function socConnect(platform) {
  var idEl = document.getElementById('socId-' + platform);
  var secEl = document.getElementById('socSec-' + platform);
  var clientId = idEl ? idEl.value.trim() : '';
  var clientSecret = secEl ? secEl.value.trim() : '';
  await socConnectCreds(platform, clientId, clientSecret);
}
// Jalur login langsung (v72, gaya Postiz): kredensial sudah tersimpan
// -> panggil ini tanpa form; kredensial kosong tetap ditolak jujur.
async function socConnectCreds(platform, clientId, clientSecret) {
  if (!clientId || !clientSecret) { socNote(tr('soc.err.cred')); return; }
  if (platform === 'threads') { await socConnectThreads(clientId, clientSecret); return; }
  if (platform === 'youtube') { await socConnectYoutube(clientId, clientSecret); return; }
  if (platform === 'facebook_page' || platform === 'instagram') {
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
  var liPicture = '';
  try {
    var me = await invoke('social_linkedin_me', { token: tj.access_token });
    var mj = JSON.parse(me);
    label = mj.name || '';
    liPicture = mj.picture || '';
  } catch (_) {}
  var s = socStore();
  s.linkedin = {
    clientId: clientId, clientSecret: clientSecret,
    accessToken: tj.access_token, refreshToken: tj.refresh_token || '',
    expiresAt: tj.expires_in ? Date.now() + tj.expires_in * 1000 : 0,
    label: label, picture: liPicture,
  };
  socSave(s);
  renderNativePlanner();
}

// ---- Komposer Buat Postingan gaya Postiz (v72, perintah Patria
// 30 Okt 00:32: tahapan, fitur, dan desain UI disamakan dengan
// Postiz — dibangun ulang bersih, bukan salinan kode Postiz) ----
// Menggantikan dialog tanggal v68 sebagai SATU-SATUNYA permukaan
// input penjadwalan (tanpa duplikasi UI): kolom kiri komposer
// (kanal, teks, media, jadwal, ulangi, draf/kalender/terbit) +
// kolom kanan pratinjau live. State dipegang modul (bukan DOM)
// sehingga render ulang (toggle kanal, buka popup channel) tidak
// menghilangkan draf yang sedang diketik.
var socComposer = null; // {date, editId, orig, text, plats, src, media, when, repeat, mediaOpen}
var socComposerConfirm = false;

var SOC_LIMITS = { threads: 500, x: 280, instagram: 2200, tiktok: 2000, linkedin: 3000, facebook_page: 63206, youtube: 5000, facebook: 63206 };

function socLocalInput(ms) {
  var d = new Date(ms);
  var p = function (n) { return (n < 10 ? '0' : '') + n; };
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
}

function socComposerOpen(dateStr, editId) {
  var parts = String(dateStr || '').split('-');
  var base = new Date(+parts[0], +parts[1] - 1, +parts[2], 9, 0).getTime();
  var s = socStore();
  var connected = PLATFORMS.filter(function (p) { return tokenValid(s[p.id]); }).map(function (p) { return p.id; });
  var st = { date: dateStr, editId: editId || null, orig: null, text: '', plats: connected.slice(), src: 'library', media: null, when: base, repeat: '', mediaOpen: true };
  if (editId) {
    var it = queueLoad().find(function (x) { return String(x.id) === String(editId); });
    if (it) {
      var media = null;
      if (it.imageFile) media = { kind: 'saved', imageFile: it.imageFile, mime: it.imageMime || '' };
      else if (it.imageUrl) media = { kind: 'url', url: it.imageUrl };
      st.text = it.text || '';
      st.plats = [it.platform];
      st.media = media;
      st.when = it.scheduledAt || base;
      st.repeat = it.repeat || '';
      st.orig = { text: st.text, plats: st.plats.slice(), media: JSON.stringify(media), when: st.when, repeat: st.repeat };
    } else {
      st.editId = null;
    }
  }
  if (!st.orig) st.orig = { text: '', plats: [], media: 'null', when: base, repeat: '' };
  socComposer = st;
  socComposerConfirm = false;
  renderNativePlanner();
}

function socComposerDirty() {
  if (!socComposer) return false;
  var st = socComposer;
  if (st.text.trim() !== '' || st.media) return true;
  if (!st.editId) return false;
  var o = st.orig || {};
  return st.text !== o.text
    || JSON.stringify(st.plats.slice().sort()) !== JSON.stringify((o.plats || []).slice().sort())
    || JSON.stringify(st.media) !== o.media || st.when !== o.when || st.repeat !== o.repeat;
}

function socComposerClose(force) {
  if (!socComposer) return;
  if (!force && socComposerDirty()) { socComposerConfirm = true; renderNativePlanner(); return; }
  socComposer = null; socComposerConfirm = false;
  renderNativePlanner();
}

function socComposerMediaHTML() {
  var st = socComposer;
  if (!st.mediaOpen) return '';
  var items = socLibItems();
  var libOpts = [];
  items.forEach(function (it, i) {
    if (it.kind === 'image' && it.imageFile) libOpts.push('<option value="img:' + esc(it.imageFile) + '">🖼 ' + esc(it.o || 'Gambar') + '</option>');
    else if ((it.kind === 'script' || it.kind === 'doc') && it.content) libOpts.push('<option value="txt:' + i + '">📝 ' + esc(it.o || 'Naskah') + '</option>');
  });
  var libSel = libOpts.length
    ? '<select id="socCompLibSel">' + libOpts.join('') + '</select>'
    : '<span>' + tr('soc.lib.empty') + '</span>';
  var cur = '';
  if (st.media) {
    var m = st.media;
    var desc = m.kind === 'url' ? m.url : (m.imageFile || m.name || 'file');
    cur = '<div class="soc-row"><span>📎 ' + esc(desc) + '</span> <button id="socCompMediaRemove" class="btn btn-sm">' + tr('soc.media_remove') + '</button></div>';
  }
  return '<div class="soc-comp-media"><div class="soc-row"><label>' + tr('soc.source') + ' <select id="socCompSrc">'
    + '<option value="library"' + (st.src === 'library' ? ' selected' : '') + '>' + tr('soc.source.lib') + '</option>'
    + '<option value="custom"' + (st.src === 'custom' ? ' selected' : '') + '>' + tr('soc.source.custom') + '</option></select></label></div>'
    + '<div class="soc-row" style="display:' + (st.src === 'library' ? '' : 'none') + '">' + libSel + '</div>'
    + '<div class="soc-row" style="display:' + (st.src === 'custom' ? '' : 'none') + '"><input type="file" id="socCompFile" accept="image/*,video/*"> '
    + '<input type="text" id="socCompUrl" placeholder="' + tr('soc.ph.imgurl') + '" style="width:260px" value="' + esc(st.media && st.media.kind === 'url' ? st.media.url : '') + '"></div>'
    + cur + '</div>';
}

function socComposerHTML() {
  if (!socComposer) return '';
  var st = socComposer;
  var s = socStore();
  var connected = PLATFORMS.filter(function (p) { return tokenValid(s[p.id]); });
  var chans = connected.map(function (p) {
    var ch = s[p.id];
    var sel = st.plats.indexOf(p.id) >= 0 ? ' sel' : '';
    return '<button class="soc-comp-chan' + sel + '" data-comp-chan="' + p.id + '" title="' + esc(ch.label || p.name) + '"><span class="soc-avatar-wrap">' + socAvatarHTML(p, ch) + '<span class="soc-row-badge">' + platIconHTML(p.id, true) + '</span></span></button>';
  }).join('');
  var reps = [['', 'soc.repeat.none'], ['day', 'soc.repeat.day'], ['2days', 'soc.repeat.2days'], ['3days', 'soc.repeat.3days'], ['4days', 'soc.repeat.4days'], ['5days', 'soc.repeat.5days'], ['6days', 'soc.repeat.6days'], ['week', 'soc.repeat.week'], ['2weeks', 'soc.repeat.2weeks'], ['month', 'soc.repeat.month']];
  var repOpts = reps.map(function (r) { return '<option value="' + r[0] + '"' + (st.repeat === r[0] ? ' selected' : '') + '>' + tr(r[1]) + '</option>'; }).join('');
  var title = st.editId ? tr('soc.edit_post') : tr('soc.create_post');
  var confirm = socComposerConfirm
    ? '<div class="soc-pop-overlay"><div class="soc-pop"><h4>' + tr('soc.confirm_close') + '</h4><p>' + tr('soc.confirm_close_msg') + '</p><div class="soc-row"><button class="btn btn-sm btn-primary" id="socConfirmYes">' + tr('soc.yes_close') + '</button> <button class="btn btn-sm" id="socConfirmNo">' + tr('soc.no_cancel') + '</button></div></div></div>'
    : '';
  return '<div class="soc-composer-overlay"><div class="soc-composer">'
    + '<button class="soc-pop-x" id="socComposerClose">×</button>'
    + '<div class="soc-composer-main"><h3>' + title + '</h3>'
    + '<div class="soc-composer-channels">' + chans + '<button class="soc-comp-chan-add" id="socCompAddChan" title="' + tr('soc.add_channel') + '">+</button></div>'
    + '<textarea id="socCompText" rows="5" placeholder="' + tr('soc.write_something') + '" style="width:100%">' + esc(st.text) + '</textarea>'
    + '<div class="soc-row"><button id="socCompMediaBtn" class="btn btn-sm">' + tr('soc.insert_media') + '</button> '
    + '<button id="socCompAiBtn" class="btn btn-sm">' + tr('soc.ai_image') + '</button></div>'
    + socComposerMediaHTML()
    + '<div class="soc-row"><label>' + tr('soc.repeat_label') + ' <select id="socCompRepeat">' + repOpts + '</select></label> '
    + '<input type="datetime-local" id="socCompWhen" value="' + socLocalInput(st.when) + '"></div>'
    + '<div class="soc-row"><button id="socCompDraft" class="btn">' + tr('soc.save_draft') + '</button> '
    + '<button id="socCompSave" class="btn btn-primary">' + tr('soc.add_calendar') + '</button> '
    + '<button id="socCompNow" class="btn">' + tr('soc.publish_now') + '</button></div>'
    + '<div id="socComposerNote"></div></div>'
    + '<div class="soc-composer-preview"><h3>' + tr('soc.post_preview') + '</h3><div id="socPreviewBody"></div><div id="socPreviewCounts"></div></div>'
    + '</div>' + confirm + '</div>';
}

function socComposerRefreshPreview() {
  var body = document.getElementById('socPreviewBody');
  var counts = document.getElementById('socPreviewCounts');
  if (!body || !socComposer) return;
  var st = socComposer;
  var text = (document.getElementById('socCompText') || {}).value || st.text;
  var mediaHTML = '';
  if (st.media) {
    if (st.media.kind === 'file') mediaHTML = '<div>🖼 ' + esc(st.media.name || 'file') + '</div>';
    else if (st.media.kind === 'url') mediaHTML = '<div><img src="' + esc(st.media.url) + '" style="max-width:100%;border-radius:8px" alt=""></div>';
    else mediaHTML = '<div>🖼 ' + esc(st.media.imageFile || '') + '</div>';
  }
  body.innerHTML = text.trim()
    ? '<div>' + esc(text).replace(/\n/g, '<br>') + '</div>' + mediaHTML
    : '<div class="se-note">' + tr('soc.preview_empty') + '</div>';
  var len = text.length;
  var rows = st.plats.map(function (pid) {
    var lim = SOC_LIMITS[pid] || 0;
    var over = lim && len > lim;
    return '<div' + (over ? ' style="color:#f87171"' : '') + '>' + esc(platName(pid)) + ': ' + len + (lim ? '/' + lim : '') + (over ? ' ⚠' : '') + '</div>';
  }).join('');
  if (counts) counts.innerHTML = rows;
}

async function socComposerSave(status) {
  var st = socComposer;
  if (!st) return;
  var noteEl = document.getElementById('socComposerNote');
  var note = function (m) { if (noteEl) noteEl.textContent = m; };
  var text = ((document.getElementById('socCompText') || {}).value || st.text || '').trim();
  if (!text) { note(tr('soc.err.empty')); return; }
  if (!st.plats.length) { note(tr('soc.err.no_channel')); return; }
  st.text = text;
  var imageFile = '', imageMime = '', imageUrl = '';
  if (st.media) {
    if (st.media.kind === 'file') {
      try {
        var saved = await invoke('image_save', { req: { name: 'soc-' + Date.now() + '-comp', b64: st.media.b64 } });
        imageFile = saved.file || '';
      } catch (e) { note(String(e || '')); return; }
      if (!imageFile) { note(tr('soc.err.image')); return; }
      imageMime = st.media.mime || '';
    } else if (st.media.kind === 'lib' || st.media.kind === 'saved') {
      imageFile = st.media.imageFile || '';
      imageMime = st.media.mime || socMimeFromExt(imageFile);
    } else if (st.media.kind === 'url') {
      imageUrl = st.media.url || '';
    }
  }
  if ((imageMime || '').indexOf('video/') === 0 && st.plats.some(function (pl) { return pl !== 'youtube'; })) {
    note(tr('soc.err.yt_only')); return;
  }
  if (imageFile) {
    var blocked = st.plats.filter(function (pl) { return pl === 'threads' || pl === 'instagram' || pl === 'tiktok'; });
    if (blocked.length) { note(tr('soc.err.file_url')); return; }
  }
  // Edit = ganti item lama (id berubah tidak masalah — id internal).
  if (st.editId) {
    if (!queueSave(queueLoad().filter(function (it) { return String(it.id) !== String(st.editId); }))) { note(tr('soc.err.save')); return; }
  }
  var items = st.plats.map(function (pl) {
    return { platform: pl, text: text, imageFile: imageFile, imageMime: imageMime, imageUrl: imageUrl, scheduledAt: st.when, status: status, repeat: st.repeat || '' };
  });
  try { socQueueAdd(items); } catch (e) { note(String(e || '')); return; }
  socComposer = null; socComposerConfirm = false;
  renderNativePlanner();
}

async function socComposerPublishNow() {
  var st = socComposer;
  if (!st) return;
  var noteEl = document.getElementById('socComposerNote');
  var note = function (m) { if (noteEl) noteEl.textContent = m; };
  var text = ((document.getElementById('socCompText') || {}).value || st.text || '').trim();
  if (!text) { note(tr('soc.err.empty')); return; }
  if (!st.plats.length) { note(tr('soc.err.no_channel')); return; }
  var img = null, imageFile = '', imageUrl = '';
  if (st.media) {
    if (st.media.kind === 'file') img = { b64: st.media.b64, mime: st.media.mime || '' };
    else if (st.media.kind === 'lib' || st.media.kind === 'saved') imageFile = st.media.imageFile || '';
    else if (st.media.kind === 'url') imageUrl = st.media.url || '';
  }
  var results = [];
  for (var i = 0; i < st.plats.length; i++) {
    results.push(await socPublishDirect(st.plats[i], text, img, imageUrl, imageFile));
  }
  note(results.map(function (r) { return r.msg; }).join(' | '));
  var failed = results.some(function (r) { return !r.ok; });
  if (!failed) {
    if (st.editId) queueSave(queueLoad().filter(function (it) { return String(it.id) !== String(st.editId); }));
    socComposer = null; socComposerConfirm = false;
    renderNativePlanner();
  }
}

// Jadwal kemunculan berikutnya untuk pengulangan Postiz
// (day..6days, week, 2weeks, month). Diekspor untuk rig.
export function socNextRepeat(ms, repeat) {
  var d = new Date(ms);
  var days = { day: 1, '2days': 2, '3days': 3, '4days': 4, '5days': 5, '6days': 6, week: 7, '2weeks': 14 }[repeat];
  if (days) return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days, d.getHours(), d.getMinutes()).getTime();
  if (repeat === 'month') {
    var nm = d.getMonth() + 1;
    var dim = new Date(d.getFullYear(), nm + 1, 0).getDate();
    return new Date(d.getFullYear(), nm, Math.min(d.getDate(), dim), d.getHours(), d.getMinutes()).getTime();
  }
  return 0;
}

function socBindComposer() {
  var el = document.getElementById('nativePlanner');
  if (!el || !socComposer) return;
  var st = socComposer;
  var ta = document.getElementById('socCompText');
  if (ta) ta.addEventListener('input', function () { st.text = ta.value; socComposerRefreshPreview(); });
  el.querySelectorAll('[data-comp-chan]').forEach(function (b) {
    b.addEventListener('click', function () {
      var pid = b.getAttribute('data-comp-chan');
      var ix = st.plats.indexOf(pid);
      if (ix >= 0) st.plats.splice(ix, 1); else st.plats.push(pid);
      renderNativePlanner();
    });
  });
  socBind('socCompAddChan', function () { socPopOpen = true; socPopForm = null; socPopMsg = ''; renderNativePlanner(); });
  socBind('socCompMediaBtn', function () { st.mediaOpen = !st.mediaOpen; renderNativePlanner(); });
  socBind('socCompAiBtn', function () {
    // Gambar AI = Media Studio tab Image (hasilnya masuk Library,
    // lalu dipilih di komposer). State komposer bertahan di modul
    // saat pindah view; kembali ke Planner merendernya lagi.
    if (typeof window.showView === 'function') {
      window.showView('media');
      if (typeof window.mediaTab === 'function') window.mediaTab('image');
    }
  });
  var srcSel = document.getElementById('socCompSrc');
  if (srcSel) srcSel.addEventListener('change', function () { st.src = srcSel.value; renderNativePlanner(); });
  var libSel = document.getElementById('socCompLibSel');
  if (libSel) libSel.addEventListener('change', function () {
    if (libSel.value.indexOf('txt:') === 0) {
      var items = socLibItems();
      var it = items[parseInt(libSel.value.slice(4), 10)];
      if (it && it.content) st.text = it.content;
    } else if (libSel.value.indexOf('img:') === 0) {
      var f = libSel.value.slice(4);
      st.media = { kind: 'lib', imageFile: f, mime: socMimeFromExt(f) };
    }
    renderNativePlanner();
  });
  var fileEl = document.getElementById('socCompFile');
  if (fileEl) fileEl.addEventListener('change', async function () {
    if (fileEl.files && fileEl.files[0]) {
      try {
        var r = await readFileB64(fileEl.files[0]);
        st.media = { kind: 'file', b64: r.b64, mime: r.mime, name: r.name };
      } catch (_) {}
      renderNativePlanner();
    }
  });
  var urlEl = document.getElementById('socCompUrl');
  if (urlEl) urlEl.addEventListener('change', function () {
    var u = urlEl.value.trim();
    st.media = u ? { kind: 'url', url: u } : null;
    renderNativePlanner();
  });
  socBind('socCompMediaRemove', function () { st.media = null; renderNativePlanner(); });
  var whenEl = document.getElementById('socCompWhen');
  if (whenEl) whenEl.addEventListener('change', function () {
    var v = new Date(whenEl.value).getTime();
    if (v) st.when = v;
  });
  var repEl = document.getElementById('socCompRepeat');
  if (repEl) repEl.addEventListener('change', function () { st.repeat = repEl.value; });
  socBind('socCompDraft', function () { socComposerSave('draft'); });
  socBind('socCompSave', function () { socComposerSave('queued'); });
  socBind('socCompNow', function () { socComposerPublishNow(); });
  socBind('socComposerClose', function () { socComposerClose(false); });
  socBind('socConfirmYes', function () { socComposerClose(true); });
  socBind('socConfirmNo', function () { socComposerConfirm = false; renderNativePlanner(); });
  socComposerRefreshPreview();
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
      if (it.platform === 'threads') ch = await socEnsureThreadsToken(ch);
      if (it.platform === 'linkedin') ch = await socEnsureRefresh(ch, 'social_linkedin_refresh', 'linkedin');
      if (it.platform === 'tiktok') ch = await socEnsureRefresh(ch, 'social_tiktok_refresh', 'tiktok');
      if (it.platform === 'youtube') ch = await socEnsureRefresh(ch, 'social_youtube_refresh', 'youtube');
      // Audit v66 S-B1: 'continue' di sini dulu melompati queueSave
      // di akhir loop, sehingga status 'failed' hilang dan tick berikut
      // memproses ulang item yang sama tanpa henti (untuk X: refresh
      // token tiap 30 detik selamanya). Simpan SEBELUM continue.
      if (!tokenValid(ch)) { it.status = 'failed'; it.error = tr('soc.err.token'); queueSave(q); continue; }
      try {
        await invoke('social_publish', { req: socPublishArgs(it.platform, ch, it.text, null, it.imageUrl || '', it.imageFile || '', it.imageMime || '') });
        it.status = 'sent'; it.error = '';
        if (it.repeat) {
          var nxt = socNextRepeat(it.scheduledAt, it.repeat);
          if (nxt) {
            q.push({ id: Date.now() + '' + Math.floor(Math.random() * 10000), platform: it.platform, text: it.text, imageB64: '', imageMime: it.imageMime || '', imageFile: it.imageFile || '', imageUrl: it.imageUrl || '', scheduledAt: nxt, status: 'queued', error: '', repeat: it.repeat });
          }
        }
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
