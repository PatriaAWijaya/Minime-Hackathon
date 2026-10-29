// Penjadwal + autopost native MiniMe (v61) — pengganti Postiz.
// Pola UI meniru Postiz yang sudah familiar (kanal + kalender +
// composer + antrean), dibangun ulang bersih — bukan salinan kode
// Postiz. Token/kredensial disimpan di localStorage dengan postur
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
// instagram/youtube/tiktok/x masih "menyusul".
var PLATFORMS = [
  { id: 'facebook', name: 'Facebook', note: 'soc.note.fb_profile', can: false },
  { id: 'facebook_page', name: 'Facebook Page', note: '', can: true },
  { id: 'instagram', name: 'Instagram', note: 'soc.note.ig_url', can: true },
  { id: 'threads', name: 'Threads', note: 'soc.note.threads_text', can: true },
  { id: 'linkedin', name: 'LinkedIn', note: '', can: true },
  { id: 'youtube', name: 'YouTube', note: '', can: false },
  { id: 'tiktok', name: 'TikTok', note: '', can: false },
  { id: 'x', name: 'X', note: '', can: false },
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
  try { window.localStorage.setItem(QUEUE_LS, JSON.stringify(q)); } catch (_) {}
}
function socBind(id, fn) {
  var b = document.getElementById(id);
  if (b) b.addEventListener('click', fn);
}
function platName(id) {
  var p = PLATFORMS.find(function (x) { return x.id === id; });
  return p ? p.name : id;
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

function renderChannels() {
  var s = socStore();
  return PLATFORMS.map(function (p) {
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
      body = '<div>' + (p.id === 'facebook_page' || p.id === 'threads' ? tr('soc.meta_hint') : tr('soc.cred_hint')) + '</div>'
        + '<div class="soc-row"><input type="text" id="socId-' + p.id + '" placeholder="' + tr('soc.ph.id') + '" style="width:180px" value="' + esc((ch && ch.clientId) || '') + '"> '
        + '<input type="password" id="socSec-' + p.id + '" placeholder="' + tr('soc.ph.secret') + '" style="width:180px"></div>'
        + '<div class="soc-row"><button id="socConn-' + p.id + '" class="btn btn-sm btn-primary">' + tr('soc.connect') + '</button></div>';
    }
    if (p.note) body += '<div>' + tr(p.note) + '</div>';
    return '<div class="soc-card"><b>' + esc(p.name) + '</b> ' + status + body + '</div>';
  }).join('');
}

function renderCalendar() {
  var now = socCalCursor || new Date();
  var y = now.getFullYear(), m = now.getMonth();
  var first = new Date(y, m, 1);
  var startDay = (first.getDay() + 6) % 7; // Senin = 0
  var daysIn = new Date(y, m + 1, 0).getDate();
  var q = queueLoad();
  var counts = {};
  q.forEach(function (it) {
    if (it.status === 'queued' || it.status === 'sending') {
      var k = dayKey(it.scheduledAt);
      counts[k] = (counts[k] || 0) + 1;
    }
  });
  var cells = '';
  for (var i = 0; i < startDay; i++) cells += '<div class="soc-cal-day empty"></div>';
  for (var d = 1; d <= daysIn; d++) {
    var k = y + '-' + (m + 1) + '-' + d;
    var n = counts[k] || 0;
    cells += '<div class="soc-cal-day" data-day="' + k + '"><b>' + d + '</b>'
      + (n ? '<span class="soc-dot">' + n + '</span>' : '') + '</div>';
  }
  var monthName = now.toLocaleString(undefined, { month: 'long', year: 'numeric' });
  return '<div class="soc-cal-head"><button id="socCalPrev" class="btn btn-sm">‹</button><b>' + esc(monthName) + '</b><button id="socCalNext" class="btn btn-sm">›</button></div>'
    + '<div class="soc-cal-grid">' + cells + '</div>';
}

function renderQueue() {
  var q = queueLoad().slice().sort(function (a, b) { return a.scheduledAt - b.scheduledAt; });
  if (!q.length) return '<div>' + tr('soc.queue_empty') + '</div>';
  return q.map(function (it) {
    var st = it.status === 'sent' ? tr('soc.status.sent')
      : it.status === 'failed' ? tr('soc.status.failed') + (it.error ? ' — ' + esc(it.error) : '')
      : it.status === 'sending' ? tr('soc.status.sending')
      : tr('soc.status.queued');
    var acts = '';
    if (it.status === 'queued' || it.status === 'failed') {
      // Hapus HANYA dari kalender (dialog tanggal) — bukan dari daftar ini.
      acts = ' <button class="btn btn-sm" data-soc-now="' + it.id + '">' + tr('soc.publish_now') + '</button>';
    }
    return '<div class="soc-q"><b>' + esc(platName(it.platform)) + '</b> · ' + esc(fmtTime(it.scheduledAt)) + ' · ' + st
      + '<div>' + esc((it.text || '').slice(0, 120)) + ((it.imageB64 || it.imageFile) ? ' 📷' : '') + (it.imageUrl ? ' 🔗' : '') + '</div>' + acts + '</div>';
  }).join('');
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
  queueSave(q);
  return ids;
}

// ---- Sumber konten penjadwalan (v63) ----
// Default = Library (perintah Patria 29 Okt 17:46); opsi "File sendiri"
// membuka input file + URL. Satu builder dipakai composer + dialog
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

export function renderNativePlanner() {
  var el = document.getElementById('nativePlanner');
  if (!el) return;
  var s = socStore();
  var connected = PLATFORMS.filter(function (p) { return tokenValid(s[p.id]); });
  var checks = connected.map(function (p) {
    return '<label><input type="checkbox" class="soc-chk" value="' + p.id + '" checked> ' + esc(p.name) + '</label>';
  }).join(' ') || tr('soc.no_channel');
  el.innerHTML = '<div class="soc-wrap"><h3>' + tr('soc.title') + '</h3><p>' + tr('soc.desc') + '</p>'
    + '<div class="soc-channels">' + renderChannels() + '</div>'
    + '<div class="soc-composer"><h4>' + tr('soc.composer') + '</h4>'
    + '<textarea id="socText" rows="3" placeholder="' + tr('soc.text_ph') + '" style="width:100%"></textarea>'
    + '<div class="soc-row">' + checks + '</div>'
    + socSourceHTML('main')
    + '<div class="soc-row"><input type="datetime-local" id="socWhen"></div>'
    + '<div class="soc-row"><button id="socScheduleBtn" class="btn btn-primary">' + tr('soc.schedule') + '</button> '
    + '<button id="socNowBtn" class="btn">' + tr('soc.publish_now') + '</button></div>'
    + '<div id="socNote"></div></div>'
    + '<div class="soc-cal">' + renderCalendar() + '</div>'
    + socDayDialogHTML()
    + '<div class="soc-queue"><h4>' + tr('soc.queue') + '</h4>' + renderQueue() + '</div></div>';
  // Bind kanal.
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
  socBindSource('main', 'socText');
  socBind('socScheduleBtn', function () { socSubmit(false); });
  socBind('socNowBtn', function () { socSubmit(true); });
  el.querySelectorAll('[data-soc-now]').forEach(function (b) {
    b.addEventListener('click', function () { socPublishItem(b.getAttribute('data-soc-now')); });
  });
  socBind('socDayCloseBtn', function () { socDayOpen = null; renderNativePlanner(); });
  socBind('socDayScheduleBtn', function () { socScheduleDay(); });
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
  var el = document.getElementById('socNote');
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

async function socSubmit(now) {
  var text = (document.getElementById('socText') || {}).value || '';
  text = text.trim();
  if (!text) { socNote(tr('soc.err.empty')); return; }
  var plats = Array.prototype.slice.call(document.querySelectorAll('.soc-chk:checked')).map(function (c) { return c.value; });
  if (!plats.length) { socNote(tr('soc.err.no_channel')); return; }
  var media = await socReadSource('main');
  var img = media.imageB64 ? { b64: media.imageB64, mime: media.imageMime || '' } : null;
  var imgUrl = media.imageUrl || '';
  if (now) {
    for (var i = 0; i < plats.length; i++) {
      await socPublishDirect(plats[i], text, img, imgUrl, media.imageFile || '');
    }
    renderNativePlanner();
    return;
  }
  var whenEl = document.getElementById('socWhen');
  var when = whenEl && whenEl.value ? new Date(whenEl.value).getTime() : NaN;
  if (!when || isNaN(when)) { socNote(tr('soc.err.when')); return; }
  // Antrean menyimpan REFERENSI file (bukan base64) — base64 per item
  // bisa menembus kuota localStorage dan antrean hilang diam-diam.
  var imageFile = media.imageFile || '';
  if (img) {
    try {
      var saved = await invoke('image_save', { req: { name: 'soc-' + Date.now() + '-main', b64: img.b64 } });
      imageFile = saved.file || '';
    } catch (e) { socNote(String(e || '')); return; }
    if (!imageFile) { socNote(tr('soc.err.image')); return; }
  }
  socQueueAdd(plats.map(function (pl) {
    return { platform: pl, text: text, imageFile: imageFile, imageMime: media.imageMime || '', imageUrl: imgUrl, scheduledAt: when };
  }));
  var t = document.getElementById('socText'); if (t) t.value = '';
  renderNativePlanner();
}

// Satu-satunya tempat yang merakit argumen publish — mencegah
// divergensi antar jalur (langsung / antrean / timer). Aturan IG:
// pageId yang dikirim adalah ID akun IG, bukan ID Page.
function socPublishArgs(platform, ch, text, img, imgUrl, imageFile) {
  return {
    platform: platform, text: text,
    imageB64: img ? img.b64 : '', imageMime: img ? img.mime : '',
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
    var del = (it.status === 'queued' || it.status === 'failed')
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
  var ids = socQueueAdd(plats.map(function (pl) {
    return { platform: pl, text: text, imageFile: imageFile, imageMime: media.imageMime || '', imageUrl: media.imageUrl || '', scheduledAt: when };
  }));
  if (!ids.length) { note(tr('soc.err.no_channel')); return; }
  renderNativePlanner();
}

async function socPublishDirect(platform, text, img, imgUrl, imageFile) {
  var s = socStore();
  var ch = s[platform];
  if (!tokenValid(ch)) { socNote(platName(platform) + ': ' + tr('soc.err.token')); return; }
  try {
    await invoke('social_publish', { req: socPublishArgs(platform, ch, text, img, imgUrl, imageFile) });
    socNote(platName(platform) + ': ' + tr('soc.status.sent'));
  } catch (e) {
    socNote(platName(platform) + ': ' + String(e || ''));
  }
}

async function socPublishItem(id) {
  var q = queueLoad();
  var it = q.find(function (x) { return String(x.id) === String(id); });
  if (!it) return;
  var s = socStore();
  var ch = s[it.platform];
  if (!tokenValid(ch)) {
    it.status = 'failed'; it.error = tr('soc.err.token'); queueSave(q); renderNativePlanner(); return;
  }
  it.status = 'sending'; queueSave(q); renderNativePlanner();
  try {
    await invoke('social_publish', { req: socPublishArgs(it.platform, ch, it.text, null, it.imageUrl || '', it.imageFile || '') });
    it.status = 'sent'; it.error = '';
  } catch (e) {
    it.status = 'failed'; it.error = String(e || '');
  }
  queueSave(q); renderNativePlanner();
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
export function initSocialScheduler() {
  if (socTimer) return;
  socTimer = setInterval(async function () {
    var q = queueLoad();
    var due = q.filter(function (it) { return it.status === 'queued' && it.scheduledAt <= Date.now(); });
    if (!due.length) return;
    for (var i = 0; i < due.length; i++) {
      var it = due[i];
      it.status = 'sending';
      queueSave(q);
      var s = socStore();
      var ch = s[it.platform];
      if (!tokenValid(ch)) { it.status = 'failed'; it.error = tr('soc.err.token'); continue; }
      try {
        await invoke('social_publish', { req: socPublishArgs(it.platform, ch, it.text, null, it.imageUrl || '', it.imageFile || '') });
        it.status = 'sent'; it.error = '';
      } catch (e) {
        it.status = 'failed'; it.error = String(e || '');
      }
      queueSave(q);
    }
    renderNativePlanner();
  }, 30000);
}
