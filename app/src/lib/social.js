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
// palsu. Platform lain di luar linkedin masih "menyusul" (v62+).
var PLATFORMS = [
  { id: 'facebook', name: 'Facebook', note: 'soc.note.fb_profile', can: false },
  { id: 'facebook_page', name: 'Facebook Page', note: '', can: false },
  { id: 'instagram', name: 'Instagram', note: '', can: false },
  { id: 'threads', name: 'Threads', note: '', can: false },
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
  return !!(ch && ch.accessToken && (!ch.expiresAt || ch.expiresAt > Date.now()));
}

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
      body = '<div>' + tr('soc.note.fb_profile') + '</div>';
    } else if (!p.can) {
      body = '<div>' + tr('soc.coming') + '</div>';
    } else if (connected) {
      body = '<div class="soc-row"><button id="socDisc-' + p.id + '" class="btn btn-sm">' + tr('soc.disconnect') + '</button></div>';
    } else {
      body = '<div>' + tr('soc.cred_hint') + '</div>'
        + '<div class="soc-row"><input type="text" id="socId-' + p.id + '" placeholder="' + tr('soc.ph.id') + '" style="width:180px" value="' + esc((ch && ch.clientId) || '') + '"> '
        + '<input type="password" id="socSec-' + p.id + '" placeholder="' + tr('soc.ph.secret') + '" style="width:180px"></div>'
        + '<div class="soc-row"><button id="socConn-' + p.id + '" class="btn btn-sm btn-primary">' + tr('soc.connect') + '</button></div>';
    }
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
      acts = ' <button class="btn btn-sm" data-soc-now="' + it.id + '">' + tr('soc.publish_now') + '</button>'
        + ' <button class="btn btn-sm" data-soc-del="' + it.id + '">' + tr('soc.delete') + '</button>';
    }
    return '<div class="soc-q"><b>' + esc(platName(it.platform)) + '</b> · ' + esc(fmtTime(it.scheduledAt)) + ' · ' + st
      + '<div>' + esc((it.text || '').slice(0, 120)) + (it.imageB64 ? ' 📷' : '') + '</div>' + acts + '</div>';
  }).join('');
}

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
    + '<div class="soc-row"><input type="datetime-local" id="socWhen"> <input type="file" id="socImg" accept="image/*"></div>'
    + '<div class="soc-row"><button id="socScheduleBtn" class="btn btn-primary">' + tr('soc.schedule') + '</button> '
    + '<button id="socNowBtn" class="btn">' + tr('soc.publish_now') + '</button></div>'
    + '<div id="socNote"></div></div>'
    + '<div class="soc-cal">' + renderCalendar() + '</div>'
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
      var parts = cell.getAttribute('data-day').split('-');
      var inp = document.getElementById('socWhen');
      if (inp) {
        var mm = String(parts[1]).padStart(2, '0'), dd = String(parts[2]).padStart(2, '0');
        inp.value = parts[0] + '-' + mm + '-' + dd + 'T09:00';
      }
    });
  });
  socBind('socScheduleBtn', function () { socSubmit(false); });
  socBind('socNowBtn', function () { socSubmit(true); });
  el.querySelectorAll('[data-soc-now]').forEach(function (b) {
    b.addEventListener('click', function () { socPublishItem(b.getAttribute('data-soc-now')); });
  });
  el.querySelectorAll('[data-soc-del]').forEach(function (b) {
    b.addEventListener('click', function () {
      queueSave(queueLoad().filter(function (it) { return String(it.id) !== b.getAttribute('data-soc-del'); }));
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
      resolve({ b64: s.split(',')[1] || '', mime: file.type || 'image/jpeg' });
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
  var img = null;
  var fileEl = document.getElementById('socImg');
  if (fileEl && fileEl.files && fileEl.files[0]) {
    try { img = await readFileB64(fileEl.files[0]); } catch (_) { socNote(tr('soc.err.image')); return; }
  }
  if (now) {
    for (var i = 0; i < plats.length; i++) {
      await socPublishDirect(plats[i], text, img);
    }
    renderNativePlanner();
    return;
  }
  var whenEl = document.getElementById('socWhen');
  var when = whenEl && whenEl.value ? new Date(whenEl.value).getTime() : NaN;
  if (!when || isNaN(when)) { socNote(tr('soc.err.when')); return; }
  var q = queueLoad();
  plats.forEach(function (pl) {
    q.push({ id: Date.now() + '' + Math.floor(Math.random() * 10000), platform: pl, text: text, imageB64: img ? img.b64 : '', imageMime: img ? img.mime : '', scheduledAt: when, status: 'queued', error: '' });
  });
  queueSave(q);
  var t = document.getElementById('socText'); if (t) t.value = '';
  renderNativePlanner();
}

async function socPublishDirect(platform, text, img) {
  var s = socStore();
  var ch = s[platform];
  if (!tokenValid(ch)) { socNote(platName(platform) + ': ' + tr('soc.err.token')); return; }
  try {
    await invoke('social_publish', { req: { platform: platform, text: text, imageB64: img ? img.b64 : '', imageMime: img ? img.mime : '', accessToken: ch.accessToken } });
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
    await invoke('social_publish', { req: { platform: it.platform, text: it.text, imageB64: it.imageB64 || '', imageMime: it.imageMime || '', accessToken: ch.accessToken } });
    it.status = 'sent'; it.error = '';
  } catch (e) {
    it.status = 'failed'; it.error = String(e || '');
  }
  queueSave(q); renderNativePlanner();
}

async function socConnect(platform) {
  if (platform !== 'linkedin') { socNote(tr('soc.coming')); return; }
  var idEl = document.getElementById('socId-' + platform);
  var secEl = document.getElementById('socSec-' + platform);
  var clientId = idEl ? idEl.value.trim() : '';
  var clientSecret = secEl ? secEl.value.trim() : '';
  if (!clientId || !clientSecret) { socNote(tr('soc.err.cred')); return; }
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
        await invoke('social_publish', { req: { platform: it.platform, text: it.text, imageB64: it.imageB64 || '', imageMime: it.imageMime || '', accessToken: ch.accessToken } });
        it.status = 'sent'; it.error = '';
      } catch (e) {
        it.status = 'failed'; it.error = String(e || '');
      }
      queueSave(q);
    }
    renderNativePlanner();
  }, 30000);
}
