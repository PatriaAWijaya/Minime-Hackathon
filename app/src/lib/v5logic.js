import { invoke } from '@tauri-apps/api/core';
import { renderNativePlanner, initSocialScheduler, socNextRepeat } from './social.js';
import { esc, jsEsc } from './esc.js';
import { readThumb } from './image-api.js';
// Mechanical migration of prototype-v5/index.html <script> blocks.
// Logic is UNCHANGED: declarations kept at module level, executable
// top-level statements moved into initV5() in original order.
// initV5() must run after mount (DOM ready); it ends by exposing
// every top-level name on window, as the original page had them
// as globals (runtime-generated innerHTML handlers need this).

// B4: Kanban (TEST Kopi) + Planner now come from real artifacts via
// backend-data.js; the dummy literals below were replaced, not kept.
import { campaignCounts, campaignDrafts, campaignLeads, campaignPipeline } from './backend-data.js';
import { tr, getLang, MONTHS } from './i18n.js';
import { COST_TOTAL, readLiveCost, fmtInt } from './cost.js';

/* ---------- Agen ---------- */
export function renderAgents() {
    var html = "", rowNo = -1;
    Object.keys(PROJECTS).forEach(function (pid) {
      var proj = PROJECTS[pid];
      var collapsed = !!collapsedGroups[pid];
      html += '<div class="group" onclick="toggleGroup(\'' + pid + '\')">' + (collapsed ? '▸' : '▾') + ' ' + esc(proj.name) + (pid === currentProj ? ' • PROYEK AKTIF' : '') + '</div>';
      html += '<div class="gagents" data-pid="' + pid + '"' + (collapsed ? ' style="display:none"' : '') + '>';
      proj.agents.forEach(function (a, i) {
        var ag = AGENTS[a.key], off = a.status === "Nonaktif";
        rowNo++;
        var times = ["2:32 PM", "1:47 PM", "12:05 PM", "11:20 AM", "10:02 AM", "9:15 AM", "8:40 AM", "7:55 AM"];
        html += '<div class="agent ' + (selectedAgent === a.key && pid === currentProj ? 'sel' : '') + (off ? ' off' : '') + (pid === currentProj ? ' curproj' : '') + '" onclick="selectAgent(\'' + a.key + '\',\'' + pid + '\')">'
          + (ag.avatar ? '<img class="av av-shape-' + (ag.shape || 'circle') + '" src="' + esc(ag.avatar) + '" style="background:' + ag.color + ';object-fit:cover;padding:0" alt="">' : '<div class="av av-shape-' + (ag.shape || 'circle') + '" style="background:' + ag.color + '">' + esc(ag.name.charAt(0)) + '</div>')
          + '<div class="meta"><b>' + esc(ag.name) + '</b> <span class="badge ' + (off ? 'b-no' : 'b-ok') + '">' + esc(a.status) + '</span><br><small>' + esc(a.task) + '</small></div>'
          + (ag.always ? '' : '<button class="toggle" onclick="event.stopPropagation();toggleAgent(' + i + ',\'' + pid + '\')">' + (off ? 'Aktifkan' : 'Nonaktifkan') + '</button>')
          + '</div>';
      });
      html += '</div>';
    });
    if (!Object.keys(PROJECTS).length) html = "<div class='notice'>" + tr("proj.empty") + "</div>";
    document.getElementById("agentList").innerHTML = html;
    renderGraphProjSel();
  }

export function toggleAgent(idx, pid) {
    var a = PROJECTS[pid].agents[idx];
    a.status = a.status === "Nonaktif" ? "Idle" : "Nonaktif";
    renderAgents(); renderDetail(); saveHomeState();
  }

export function saveHomeState() {
    try { window.localStorage.setItem('minime.homeState', JSON.stringify({ agents: AGENTS, projects: PROJECTS, currentProj: currentProj, selectedAgent: selectedAgent })); } catch (_) {}
  }

export function loadHomeState() {
    var raw = null;
    try { raw = window.localStorage.getItem('minime.homeState'); } catch (_) { return; }
    if (!raw) return;
    var st = null;
    try { st = JSON.parse(raw); } catch (_) {}
    if (!st || typeof st !== 'object' || !st.agents || !st.projects) {
      try { window.localStorage.setItem('minime.homeState.corrupt', raw); } catch (_) {}
      return;
    }
    var agents = Object.assign({}, AGENTS, st.agents);
    Object.keys(agents).forEach(function (k) {
      var a = agents[k] || {};
      agents[k] = { name: a.name || k, color: a.color || '#525252', role: a.role || '', goal: a.goal || '', instructions: a.instructions || '', skills: Array.isArray(a.skills) ? a.skills : [], skillsOff: Array.isArray(a.skillsOff) ? a.skillsOff : [], avatar: typeof a.avatar === 'string' ? a.avatar : '', backup: a.backup || '', model: a.model || '', shape: a.shape || 'circle', effort: a.effort || '', always: !!a.always };
    });
    var projects = Object.assign({}, PROJECTS, st.projects);
    Object.keys(projects).forEach(function (k) {
      var pr = projects[k] || {};
      projects[k] = { name: pr.name || k, agents: Array.isArray(pr.agents) ? pr.agents.filter(function (a) { return a && agents[a.key]; }) : [], chat: Array.isArray(pr.chat) ? pr.chat : [], kanban: Array.isArray(pr.kanban) ? pr.kanban : [] };
    });
    AGENTS = agents; PROJECTS = projects;
    if (PROJECTS[st.currentProj]) currentProj = st.currentProj;
    if (AGENTS[st.selectedAgent]) selectedAgent = st.selectedAgent;
    var ps = document.getElementById('projectSel'); if (ps) ps.value = currentProj;
    var cp = document.getElementById('chatProj'); if (cp && PROJECTS[currentProj]) cp.textContent = PROJECTS[currentProj].name;
  }

export function plusSlug(name, taken) {
    var base = (name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'item';
    var slug = base, i = 2;
    while (taken(slug)) { slug = base + '-' + i; i++; }
    return slug;
  }

export function plusCloseMenu() { var m = document.getElementById('addMenu'); if (m) m.classList.remove('open'); }

export function selectAgent(key, pid) {
    selectedAgent = key;
    if (pid) currentProj = pid;
    document.getElementById("projectSel").value = currentProj;
    renderAgents(); renderDetail(); renderChat(); renderKanban();
    document.getElementById("chatProj").textContent = PROJECTS[currentProj] ? PROJECTS[currentProj].name : "—";
    saveHomeState();
  }

export function renderDetail() {
    var ag = AGENTS[selectedAgent], proj = PROJECTS[currentProj];
    var ins = ag.instructions || (selectedAgent === "prime" ? "General-purpose assistant" : ag.goal);
    // Usage nyata (v75): konstanta historis + pemakaian live device-only.
    var live = readLiveCost();
    var usageVal = fmtInt(COST_TOTAL.calls + live.calls, getLang()) + ' calls · ' + fmtInt(COST_TOTAL.tokens + live.tokens, getLang()) + ' token';
    // Toggle notifikasi tersimpan (default ON, seperti lampiran).
    var notiOn = true;
    try { notiOn = window.localStorage.getItem('minime.notify') !== '0'; } catch (_) {}
    var skillsOff = ag.skillsOff || [];
    var skills = ag.skills.map(function (s) { return '<div class="skillrow"><input type="checkbox"' + (skillsOff.indexOf(s) >= 0 ? '' : ' checked') + ' onchange="detailSkillToggle(\'' + jsEsc(s) + '\', this.checked)"> <span>' + s + '</span></div>'; }).join("");
    var memCount = (memLoad()[selectedAgent] || []).length;
    var fileCount = (fileLoad()[selectedAgent] || []).length;
    document.getElementById("detailBody").innerHTML =
      '<div class="detail-avatar-wrap"><div class="detail-avatar av-shape-' + (ag.shape || 'circle') + '" style="background:' + ag.color + '">' + (ag.avatar ? '<img src="' + esc(ag.avatar) + '" style="width:100%;height:100%;object-fit:cover;border-radius:inherit" alt="">' : esc(ag.name.charAt(0))) + '</div><button class="avatar-edit" onclick="detailAvatarPick()" title="Ubah avatar">✎</button></div>'
      + '<div class="d-label">' + tr('detail.name') + '</div><input type="text" class="d-field" value="' + esc(ag.name) + '" onchange="renameAgent(this.value)">'
      + '<div class="d-label">' + tr('detail.title') + '</div><input type="text" class="d-field" placeholder="Describe what your agent does" value="' + esc(ag.role) + '" onchange="retitleAgent(this.value)">'
      + '<div class="d-label">' + tr('detail.instructions') + '</div><textarea class="d-field d-area" onchange="setInstructions(this.value)">' + esc(ins) + '</textarea>'
      + '<div class="d-label">' + tr('detail.brain') + '</div><div class="d-rows">'
      + (detailModelOpen ? '<div class="d-row"><span>' + tr('detail.model') + '</span><select class="d-val" onchange="detailModelSet(this.value)">' + detailModelOpts(ag) + '</select></div>' : '<div class="d-row" onclick="detailModelToggle()"><span>' + tr('detail.model') + '</span><span class="d-val">' + esc(ag.model || tr('detail.model.default')) + ' ›</span></div>')
      + (detailEffortOpen ? '<div class="d-row"><span>' + tr('detail.reasoning') + '</span><select class="d-val" onchange="detailEffortSet(this.value)">' + detailEffortOpts(ag) + '</select></div>' : '<div class="d-row" onclick="detailEffortToggle()"><span>' + tr('detail.reasoning') + '</span><span class="d-val">' + (ag.effort ? esc(ag.effort) + ' ↕' : tr('detail.val.low')) + '</span></div>')
      + '<div class="d-row" onclick="detailNote(\'' + jsEsc(tr('detail.note.backup_chain')) + '\')"><span>' + tr('detail.backup') + '</span><span class="d-val">Meta → Gemini → Ollama ›</span></div></div>'
      + '<div class="d-label">' + tr('detail.knows') + '</div><div class="d-rows">'
      + '<div class="d-row" onclick="detailMemToggle()"><span>' + tr('detail.memories') + '</span><span class="d-val">' + tr('detail.mem.count', {n: memCount}) + ' ›</span></div>'
      + '<div class="d-row" onclick="toggleSkillList()"><span>' + tr('detail.skills') + '</span><span class="d-val">' + ag.skills.length + ' assigned ›</span></div>'
      + '<div id="skillList" style="display:none">' + skills + '</div>'
      + '<div class="d-row" onclick="detailFilesToggle()"><span>' + tr('detail.files') + '</span><span class="d-val">' + tr('detail.files.count', {n: fileCount}) + ' ›</span></div>'
      + '<div class="d-row" onclick="detailNote(\'' + jsEsc(tr('detail.note.tables', {name: ag.name})) + '\')"><span>' + tr('detail.tables') + '</span><span class="d-val">' + tr('detail.val.tables') + '</span></div></div>'
      + '<div class="d-label">' + tr('detail.does') + '</div><div class="d-rows">'
      + '<div class="d-row" onclick="showView(\'graph\')"><span>' + tr('detail.routines') + '</span><span class="d-val">' + tr('detail.val.configured') + '</span></div>'
      + '<div class="d-row" onclick="showView(\'billing\')"><span>' + tr('detail.usage') + '</span><span class="d-val">' + usageVal + ' ›</span></div>'
      + '<div class="d-row" onclick="detailNote(\'' + jsEsc(tr('detail.note.publish')) + '\')"><span>' + tr('detail.publish') + '</span><span class="d-val">›</span></div></div>'
      + '<div class="d-label">' + tr('detail.rules') + '</div><div class="d-rows">'
      + '<div class="d-row" onclick="detailNote(\'' + jsEsc(tr('detail.note.permissions')) + '\')"><span>' + tr('detail.permissions') + '</span><span class="d-val">' + tr('detail.val.fullaccess') + '</span></div>'
      + '<div class="d-row" onclick="detailNote(\'' + jsEsc(tr('detail.note.folders')) + '\')"><span>' + tr('detail.folders') + '</span><span class="d-val">' + tr('detail.val.allfiles') + '</span></div>'
      + '<div class="d-row"><span>' + tr('detail.notifications') + '</span><label class="d-switch"><input type="checkbox" id="homeNotify"' + (notiOn ? ' checked' : '') + ' onchange="homeNotifyToggle(this.checked)"><span class="d-slider"></span></label></div>'
      + '<div class="d-row" onclick="showView(\'settings\')"><span>' + tr('detail.advanced') + '</span><span class="d-val">›</span></div></div>'
      + (detailMemOpen ? detailMemSection() : '') + (detailFilesOpen ? detailFilesSection() : '')
      + '<div class="notice" id="detailNotice" style="display:none"></div>';
  }

export function detailNote(t) { var n = document.getElementById("detailNotice"); if (n) { n.style.display = "block"; n.textContent = t; } }

export function homeNotifyToggle(v) {
  try { window.localStorage.setItem('minime.notify', v ? '1' : '0'); } catch (_) {}
}

export function toggleSkillList() { var el = document.getElementById("skillList"); if (el) el.style.display = el.style.display === "none" ? "block" : "none"; }

export function renameAgent(v) { if (!v.trim()) return; AGENTS[selectedAgent].name = v.trim(); renderAgents(); renderDetail(); saveHomeState(); detailNote("Simulasi: nama agen diubah menjadi " + v.trim() + " (tampilan saja)."); }

export function retitleAgent(v) { AGENTS[selectedAgent].role = v; renderAgents(); renderDetail(); saveHomeState(); }

export function setInstructions(v) { AGENTS[selectedAgent].instructions = v; saveHomeState(); detailNote("Simulasi: instructions tersimpan (tampilan saja)."); }

/* ---------- Proyek & Chat ---------- */
export function switchProject(pid) {
    if (!PROJECTS[pid]) return;
    currentProj = pid; saveHomeState();
    document.getElementById("chatProj").textContent = PROJECTS[pid].name;
    renderAgents(); renderChat(); renderKanban(); renderDetail();
  }

export function renderChat() {
    var box = document.getElementById("chatBox");
    box.innerHTML = "";
    var _cp = PROJECTS[currentProj];
    var _cpEl = document.getElementById("chatProj"); if (_cpEl) _cpEl.textContent = _cp ? _cp.name : "—";
    var _ci = document.getElementById("chatInput"); if (_ci) _ci.disabled = !_cp;
    if (!_cp) return;
    _cp.chat.forEach(function (m, i) {
      var div = document.createElement("div");
      div.setAttribute("data-idx", String(i));
      div.className = "msg " + (m.who === "user" ? "user" : (m.curation ? "curation" : (m.who === "prime" ? "prime" : "")));
      var who = esc(String(m.name || ""));
      div.innerHTML = m.curation
        ? '<div class="msg-col"><div class="cur-label">KURASI PRIME</div><div class="bubble">' + m.text + '</div></div>'
        : '<div class="body"><div class="bubble"><div class="who">' + who + '</div>' + m.text + '</div></div>';
      box.appendChild(div);
    });
    box.scrollTop = box.scrollHeight;
  }

/* Orkestrasi chat: agen penerima tugas otomatis AKTIF di list —
   terpilih + panel Detail-nya tampil bila ia ada di proyek aktif,
   atau grup proyeknya dibuka (tanpa memindah proyek/chat) bila ia
   ada di proyek lain. "Aktif" di sini = terpilih & terlihat, BUKAN
   mengubah toggle Nonaktif (itu kontrol eksplisit user di Tools). */
export function activateAgent(key) {
    var pid = null;
    var _cur = PROJECTS[currentProj];
    if (_cur && _cur.agents.some(function (a) { return a.key === key; })) pid = currentProj;
    else Object.keys(PROJECTS).forEach(function (p) {
      if (!pid && PROJECTS[p].agents.some(function (a) { return a.key === key; })) pid = p;
    });
    if (!pid) return;
    if (pid === currentProj) { selectAgent(key, pid); return; }
    collapsedGroups[pid] = false;
    try { window.localStorage.setItem('minime.agentGroups', JSON.stringify(collapsedGroups)); } catch (e) {}
    renderAgents();
  }

export function postChat(who, name, color, text, curation) {
    if (!PROJECTS[currentProj]) return;
    PROJECTS[currentProj].chat.push({ who: who, name: name, color: color, text: text, curation: !!curation });
    renderChat();
  }


var sendChatImpl = null;

export function setSendChatImpl(fn) {
  sendChatImpl = fn;
}

export function sendChat() {
    if (typeof sendChatImpl === "function") return sendChatImpl();
    var input = document.getElementById("chatInput");
    var text = input.value.trim();
    if (!text) return;
    postChat("user", "Patria", "#374151", text.replace(/</g, "&lt;"));
    input.value = "";
    var saved = text;
    setTimeout(function () {
      postChat("prime", "Prime Agent", "#EB87B4", "Diterima. Saya pecah arahanmu dan tugaskan agen yang dibutuhkan — hasilnya muncul di chat ini dan kartunya di Kanban (simulasi).");
    }, 700);
    setTimeout(function () {
      var low = saved.toLowerCase();
      var agent = "Riset", color = "#EB87B4", reply = "Saya mulai risetnya dari behaviour digital dan spending audiens (simulasi).";
      if (low.indexOf("gambar") !== -1 || low.indexOf("carousel") !== -1 || low.indexOf("reels") !== -1 || low.indexOf("talking") !== -1) { agent = "Media"; color = "#5b5b5b"; reply = "Saya siapkan medianya — gambar/carousel/reels/talking head tampil di Media Studio setelah lolos GKonten (simulasi)."; }
      else if (low.indexOf("produk") !== -1) { agent = "Produk Digital"; color = "#666666"; reply = "Saya susun brief produk dan struktur fitur MVP-nya (simulasi)."; }
      postChat("x", agent, color, reply);
    }, 1500);
  }


export function doSearch() {
    var q = document.getElementById("searchInput").value.trim().toLowerCase();
    var results = document.getElementById("searchResults");
    if (!q) { results.innerHTML = ""; document.getElementById("searchCount").textContent = ""; return; }
    var _sp = PROJECTS[currentProj];
    var hits = _sp ? _sp.chat.map(function (m, i) { return { m: m, i: i }; }).filter(function (h) { return h.m.text.toLowerCase().indexOf(q) !== -1 || h.m.name.toLowerCase().indexOf(q) !== -1; }) : [];
    document.getElementById("searchCount").textContent = tr('search.count', {n: hits.length, q: q, proj: _sp ? _sp.name : ""});
    results.innerHTML = hits.map(function (h) { return '<div class="search-hit" onclick="searchJump(' + h.i + ')" style="background:#fff;border:1px solid #ddd;border-radius:8px;padding:12px;margin-bottom:8px;cursor:pointer"><b>' + esc(h.m.name) + ':</b> ' + h.m.text + '</div>'; }).join("") || "<p>" + tr('search.empty') + "</p>";
  }

export function agentKeyByName(n) {
    var keys = Object.keys(AGENTS);
    for (var i = 0; i < keys.length; i++) { if (AGENTS[keys[i]].name === n) return keys[i]; }
    return "prime";
  }

export function cardComments(card) { return (card.comments || []).length; }

export function colName(ci) { var kc = kcols(); return ci < kc.length ? kc[ci] : extraCols[ci - kc.length]; }

export function colColor(ci) { return ["#525252", "#6b7280", "#EB87B4", "#737373", "#404040"][ci] || "#737373"; }

export function renderKanban() {
    // Audit v66 L-B1: Kanban PERSISTEN — simpan di awal render, karena
    // semua mutasi (drag, advance, tambah, hapus Library) memanggil
    // renderKanban sesudah mengubah state.
    kbTeam();
    saveKanban();
    var teamAvs = document.getElementById("kbTeamAvs"), teamNote = document.getElementById("kbTeamNote");
    if (teamAvs) teamAvs.innerHTML = kbTeam().map(function (k, idx) { var a2 = AGENTS[k]; return a2 ? "<div class='av' style='width:28px;height:28px;font-size:12px;background:" + a2.color + (idx > 0 ? ";margin-left:-8px" : "") + "'>" + esc(a2.name.charAt(0)) + "</div>" : ""; }).join("");
    if (teamNote) teamNote.textContent = kbTeam().map(function (k) { return AGENTS[k] ? AGENTS[k].name : ""; }).filter(Boolean).join(", ");
    if (!PROJECTS[currentProj]) { document.getElementById("kanbanTitle").textContent = "—"; var _kbw = document.getElementById("kanbanBox"); if (_kbw) _kbw.innerHTML = "<div class='notice'>" + tr("proj.empty") + "</div>"; return; }
    document.getElementById("kanbanTitle").textContent = PROJECTS[currentProj].name;
    var wrap = document.getElementById("kanbanBox");
    var cards = PROJECTS[currentProj].kanban || [];
    var filter = document.getElementById("kbFilter") ? document.getElementById("kbFilter").value : "";
    function vis(card) { return !filter || card.a === filter; }
    if (kanbanTab === "table") {
      var rows = cards.map(function (card, i) { return { card: card, i: i }; }).filter(function (x) { return vis(x.card); }).map(function (x) {
        return "<tr onclick='kbOpen(" + x.i + ")' style='cursor:pointer'><td><b>" + esc(x.card.t) + "</b></td><td>" + esc(x.card.a) + "</td><td>" + colName(x.card.c) + "</td><td>💬 " + cardComments(x.card) + "</td></tr>";
      }).join("");
      wrap.innerHTML = "<table><tr><th>Tugas</th><th>Agen</th><th>Status</th><th>Komentar</th></tr>" + rows + "</table>";
      return;
    }
    if (kanbanTab === "list") {
      wrap.innerHTML = cards.map(function (card, i) { return { card: card, i: i }; }).filter(function (x) { return vis(x.card); }).map(function (x) {
        return "<div class='todayitem' onclick='kbOpen(" + x.i + ")' style='cursor:pointer'><b>" + esc(x.card.t) + "</b><br><small style='color:#a1a1a1'>" + tr('kanban.card.agent') + esc(x.card.a) + " • " + colName(x.card.c) + " • 💬 " + cardComments(x.card) + "</small></div>";
      }).join("") || "<p>Tidak ada tugas untuk filter ini.</p>";
      return;
    }
    var totalCols = kcols().length + extraCols.length;
    var board = document.createElement("div"); board.className = "kanban";
    for (var ci = 0; ci < totalCols; ci++) {
      (function (ci) {
        var div = document.createElement("div"); div.className = "kcol";
        var count = cards.filter(function (c) { return c.c === ci && vis(c); }).length;
        div.innerHTML = "<h4>" + colName(ci) + " <span style='float:right;color:#a1a1a1'>" + count + "</span></h4>";
        div.addEventListener("dragover", function (e) { e.preventDefault(); div.classList.add("over"); });
        div.addEventListener("dragleave", function () { div.classList.remove("over"); });
        div.addEventListener("drop", function (e) {
          e.preventDefault(); div.classList.remove("over");
          if (dragCard !== null) { cards[dragCard].c = ci; dragCard = null; renderKanban(); }
        });
        cards.forEach(function (card, i) {
          if (card.c !== ci || !vis(card)) return;
          var key = agentKeyByName(card.a), ag = AGENTS[key];
          var k = document.createElement("div"); k.className = "kcard"; k.draggable = true;
          k.innerHTML = "<div class='accent' style='background:" + colColor(ci) + "'></div><b>" + esc(card.t) + "</b><br><small style='color:#a1a1a1'>" + tr('kanban.card.agent') + esc(card.a) + "</small>"
            + "<div class='kb-cardfoot'><span>💬 " + cardComments(card) + "</span><span class='av' style='width:26px;height:26px;font-size:12px;background:" + ag.color + "'>" + esc(ag.name.charAt(0)) + "</span></div>";
          k.addEventListener("dragstart", function () { dragCard = i; });
          k.addEventListener("mousedown", function (e) { kbDownPos = { x: e.clientX, y: e.clientY }; });
          k.addEventListener("click", function (e) { if (kbDownPos && Math.abs(e.clientX - kbDownPos.x) + Math.abs(e.clientY - kbDownPos.y) > 5) return; kbOpen(i); });
          if (ci < totalCols - 1) {
            var b = document.createElement("button"); b.className = "btn btn-sm"; b.textContent = tr('kanban.advance');
            b.addEventListener("click", function (e) { e.stopPropagation(); card.c = ci + 1; renderKanban(); });
            k.appendChild(b);
          }
          div.appendChild(k);
        });
        var add = document.createElement("button"); add.className = "btn btn-sm"; add.style.width = "100%";
        add.textContent = tr('kanban.add');
        add.addEventListener("click", function () { cards.push({ t: "Tugas baru (simulasi)", a: "Prime Agent", c: ci }); renderKanban(); });
        div.appendChild(add);
        board.appendChild(div);
      })(ci);
    }
    var addList = document.createElement("div"); addList.className = "addlist";
    addList.innerHTML = "<button class='btn' onclick='addKanbanList()'>＋ Add another list</button>";
    board.appendChild(addList);
    wrap.innerHTML = ""; wrap.appendChild(board);
  }

export function addKanbanList() {
    extraCols.push("List Baru " + (extraCols.length + 1));
    renderKanban();
  }

export function nodeRects() {
    var box = graphZoomEl().getBoundingClientRect();
    var out = {};
    Object.keys(GNODES).forEach(function (k) {
      var el = document.querySelector('[data-nkey="' + k + '"]');
      if (!el) return;
      var r = el.getBoundingClientRect();
      out[k] = { l: (r.left - box.left) / box.width * 100, r: (r.right - box.left) / box.width * 100,
                 t: (r.top - box.top) / box.height * 100, b: (r.bottom - box.top) / box.height * 100,
                 cx: (r.left + r.width / 2 - box.left) / box.width * 100, cy: (r.top + r.height / 2 - box.top) / box.height * 100 };
    });
    return out;
  }

export function curvePath(x1, y1, x2, y2) {
    var dx = x2 - x1, dy = y2 - y1;
    if (Math.abs(dx) >= Math.abs(dy)) {
      return "M " + x1 + " " + y1 + " C " + (x1 + dx * 0.5) + " " + y1 + ", " + (x2 - dx * 0.5) + " " + y2 + ", " + x2 + " " + y2;
    }
    return "M " + x1 + " " + y1 + " C " + x1 + " " + (y1 + dy * 0.5) + ", " + x2 + " " + (y2 - dy * 0.5) + ", " + x2 + " " + y2;
  }

/* v83: kesehatan node — hijau = terhubung ke alur (+ trigger jadwal aktif); pink = yatim / trigger jadwal nonaktif. Dihitung dari GEDGES + status trigger, bukan bendera simpanan. */
function graphHealth(k) {
  var nd = GNODES[k]; if (!nd) return "bad";
  if (nd.kind === "trigger") { var t = graphTrigOf(nd); if (t.type === "schedule" && !t.active) return "bad"; }
  for (var i = 0; i < GEDGES.length; i++) {
    var e = GEDGES[i];
    if ((e.f === k || e.t === k) && GNODES[e.f] && GNODES[e.t]) return "ok";
  }
  return "bad";
}
export function renderGraph() {
    var wrap = document.getElementById("graphNodes");
    wrap.innerHTML = "";
    var firstKey = Object.keys(GNODES)[0];
    renderGraphProjSel();
    Object.keys(GNODES).forEach(function (k) {
      var nd = GNODES[k];
      var el = document.createElement("div");
      el.className = "n8n-node " + nd.kind + " " + graphHealth(k) + (k === graphSel ? " sel" : "") + (nd.locked ? " locked" : "");
      el.setAttribute("data-nkey", k);
      el.style.left = nd.x + "%";
      el.style.top = nd.y + "%";
      el.style.width = (nd.kind === "trigger" ? Math.max(nd.w || 0, 240) : (nd.w || 170)) + "px";
      el.innerHTML = "<div class='nrow'><div class='nava'>" + esc(nd.icon || "") + "</div><div class='ntxt'><div class='nname'>" + esc(nd.name) + (nd.locked ? " \uD83D\uDD12" : "") + "</div><div class='nsub'>" + esc(nd.sub || "") + "</div></div></div>";
      if (k === firstKey) {
        if (nd.kind === "trigger") {
          var tt = graphTrigOf(nd);
          var chips = document.createElement("div");
          chips.className = "ntrig-chips";
          graphTrigSummary(tt).split(" \u2022 ").forEach(function (c) {
            var sp = document.createElement("span"); sp.textContent = c; chips.appendChild(sp);
          });
          el.appendChild(chips);
          if (tt.type === "schedule") {
            var nx = document.createElement("div");
            nx.className = "ntrig-next";
            nx.textContent = tr("graph.next") + ": " + graphNextText(tt);
            el.appendChild(nx);
          }
        }
        if (nd.kind !== "circle") {
          var play = document.createElement("button");
          play.className = "n8n-play"; play.textContent = "\u25B6 " + tr("graph.run_now");
          play.addEventListener("mousedown", function (e) { e.stopPropagation(); });
          play.addEventListener("click", function (e) { e.stopPropagation(); runGraphSim("manual"); });
          el.appendChild(play);
        }
      }
      if (k === graphSel) {
        var bar = document.createElement("div");
        bar.className = "n8n-nodebar";
        [["\u29C9", graphDuplicate, "graph.dup"], [nd.locked ? "\uD83D\uDD13" : "\uD83D\uDD12", graphToggleLock, nd.locked ? "graph.unlock" : "graph.lock"], ["\uD83D\uDDD1", graphAskDelete, "graph.del"]].forEach(function (b) {
          var bb = document.createElement("button");
          bb.textContent = b[0]; bb.title = tr(b[2]);
          bb.addEventListener("mousedown", function (e) { e.stopPropagation(); });
          bb.addEventListener("click", function (e) { e.stopPropagation(); b[1](); });
          bar.appendChild(bb);
        });
        el.appendChild(bar);
      }
      if (nd) { // v82: handle + di semua node, bukan hanya output
        var plus = document.createElement("div");
        plus.className = "n8n-plus"; plus.textContent = "+"; plus.title = tr("graph.add_node");
        plus.addEventListener("mousedown", function (e) { e.stopPropagation(); });
        plus.addEventListener("click", function (e) { e.stopPropagation(); addNodeAfter(k); });
        el.appendChild(plus);
      }
      var del = document.createElement("div");
      del.className = "n8n-del"; del.textContent = "\u00D7"; del.title = tr("graph.del");
      del.addEventListener("mousedown", function (e) { e.stopPropagation(); });
      del.addEventListener("click", function (e) { e.stopPropagation(); graphOpenPopup(k); graphAskDelete(); });
      el.appendChild(del);
      el.addEventListener("mousedown", function (e) {
        if (nd.locked) return;
        dragNode = k; dragMoved = false;
        var box = graphZoomEl().getBoundingClientRect();
        var r = el.getBoundingClientRect();
        grabDX = (e.clientX - r.left) / box.width * 100;
        grabDY = (e.clientY - r.top) / box.height * 100;
        dragStart = { x: e.clientX, y: e.clientY };
        e.preventDefault();
      });
      el.addEventListener("click", function () { if (!dragMoved) graphSelect(k); });
      el.addEventListener("dblclick", function () { if (!dragMoved) graphOpenPopup(k); });
      wrap.appendChild(el);
    });
    var rects = nodeRects();
    var svg = document.getElementById("graphEdges");
    svg.innerHTML = ""; svg.setAttribute("viewBox", "0 0 100 100"); svg.setAttribute("preserveAspectRatio", "none");
    var NS = "http://www.w3.org/2000/svg";
    var defs = document.createElementNS(NS, "defs");
    var marker = document.createElementNS(NS, "marker");
    marker.setAttribute("id", "arr"); marker.setAttribute("markerWidth", "6"); marker.setAttribute("markerHeight", "6");
    marker.setAttribute("refX", "5"); marker.setAttribute("refY", "3"); marker.setAttribute("orient", "auto");
    var tri = document.createElementNS(NS, "path");
    tri.setAttribute("d", "M0,0 L6,3 L0,6 Z"); tri.setAttribute("fill", "#9ca3af");
    marker.appendChild(tri); defs.appendChild(marker); svg.appendChild(defs);
    GEDGES.forEach(function (e) {
      var a = rects[e.f], b = rects[e.t];
      if (!a || !b) return;
      var x1, y1, x2, y2;
      if (GNODES[e.t].kind === "circle") { x1 = a.cx; y1 = a.b; x2 = b.cx; y2 = b.t; }
      else { x1 = a.r; y1 = a.cy; x2 = b.l; y2 = b.cy; }
      var path = document.createElementNS(NS, "path");
      path.setAttribute("d", curvePath(x1, y1, x2, y2));
      path.setAttribute("fill", "none"); path.setAttribute("stroke", "#9ca3af"); path.setAttribute("stroke-width", "0.35");
      path.setAttribute("marker-end", "url(#arr)");
      if (graphSelEdge && graphSelEdge.f === e.f && graphSelEdge.t === e.t) { path.setAttribute("stroke", "#EB87B4"); path.setAttribute("stroke-width", "0.55"); }
      path.style.cursor = "pointer";
      (function (ef, et) { path.addEventListener("click", function (ev) { ev.stopPropagation(); graphSelectEdge(ef, et); }); })(e.f, e.t);
      if (e.dashed) path.setAttribute("stroke-dasharray", "1.2 1.2");
      svg.appendChild(path);
      [ [x1, y1], [x2, y2] ].forEach(function (pt) {
        var c = document.createElementNS(NS, "circle");
        c.setAttribute("cx", pt[0]); c.setAttribute("cy", pt[1]); c.setAttribute("r", "1.1");
        c.setAttribute("fill", "#6b7280"); c.setAttribute("stroke", "#0e0e0e"); c.setAttribute("stroke-width", "0.3");
        svg.appendChild(c);
      });
      var elabel = e.l;
      if (GNODES[e.f] && GNODES[e.f].kind === "decision") {
        if (e.branch === "T") elabel = GNODES[e.f].branchT || "true";
        else if (e.branch === "F") elabel = GNODES[e.f].branchF || "false";
      }
      if (elabel) {
        var t = document.createElementNS(NS, "text");
        t.setAttribute("x", (x1 + x2) / 2); t.setAttribute("y", (y1 + y2) / 2 - 1.5);
        t.setAttribute("fill", "#a1a1a1"); t.setAttribute("font-size", "3"); t.setAttribute("text-anchor", "middle");
        t.textContent = elabel;
        svg.appendChild(t);
      }
    });
  }

export function addNodeAfter(key) {
    nodeCounter++;
    var src = GNODES[key];
    var nk = "baru" + nodeCounter;
    GNODES[nk] = { name: "Node Baru " + nodeCounter, sub: "simulasi", icon: "＋", x: Math.min(90, src.x + 14), y: src.y, w: 150, kind: "output", desc: "Node baru dari tombol ＋ (simulasi) — di aplikasi sungguhan, node ini bisa diisi agen/tool lain." };
    GEDGES.push({ f: key, t: nk, l: "" });
    saveGraphState();
    graphSelect(nk);
    var n = document.getElementById("graphNotice");
    n.style.display = "block";
    n.textContent = "Simulasi: node baru ditambahkan setelah " + src.name + " (tampilan saja).";
    return nk;
  }

export function runGraphSim(kind) {
    kind = kind || "manual";
    if (graphRunning) return;
    graphRunning = true;
    var seq = ["trigger", "prime", "gate", "dist"];
    var i = 0;
    var n = document.getElementById("graphNotice");
    n.style.display = "block";
    n.textContent = "Simulasi berjalan: Trigger → Prime Agent → GSTP → Distribusi (draf)…";
    function step() {
      document.querySelectorAll(".n8n-node").forEach(function (el) { el.classList.remove("exec"); });
      if (i >= seq.length) {
        graphRunning = false;
        graphSimTimer = null;
        n.textContent = "Simulasi selesai: alur berjalan Trigger → Prime Agent → GSTP (true) → Distribusi (draf). Gerbang sungguhan tetap menunggu keputusanmu — simulasi ini tidak menyetujui apa pun.";
        graphRunsAdd(kind);
        return;
      }
      var el = document.querySelector('[data-nkey="' + seq[i] + '"]');
      if (el) el.classList.add("exec");
      i++;
      graphSimTimer = setTimeout(step, 700);
    }
    step();
  }

/* Library: baris bawaan (artefak fase) + baris yang disimpan user.
   Baris user PERSISTEN di localStorage 'minime.library.added' — bukan
   lagi simulasi. libSave/libUse simulasi lama DIHAPUS (tidak ada
   pemakai lain); diganti aksi recall nyata: Media Studio + Chat. */
var LIB_LS = "minime.library.added";
/* Audit v66 L-M2: data Library korup/gagal simpan tidak boleh hilang
   diam-diam. Korup -> mentah dicadangkan + bendera peringatan;
   gagal simpan -> bendera peringatan + operasi dibatalkan (rollback). */
var LIB_CORRUPT_LS = "minime.library.added.corrupt";
var libCorrupt = false;
var libSaveError = false;
function loadLibAdded() {
  try {
    var raw = window.localStorage.getItem(LIB_LS);
    var arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter(function (x) { return x && typeof x.o === "string"; }) : [];
  } catch (_) {
    try { window.localStorage.setItem(LIB_CORRUPT_LS, window.localStorage.getItem(LIB_LS) || ""); } catch (_) {}
    libCorrupt = true;
    return [];
  }
}
function saveLibAdded() {
  try { window.localStorage.setItem(LIB_LS, JSON.stringify(LIB_ADDED)); libSaveError = false; return true; }
  catch (_) { libSaveError = true; return false; }
}
/* Baris bawaan (LIB) adalah konstanta snapshot — menghapusnya tidak bisa
   splice array; sebagai gantinya simpan tombstone judul di localStorage.
   Baris user (LIB_ADDED) dihapus langsung dari array. libAll() adalah
   satu-satunya sumber daftar Library, jadi tombstone berlaku di semua
   pemakaian (render, recall, dedup simpan). */
var LIB_DEL_LS = "minime.library.deleted";
function loadLibDeleted() {
  try {
    var raw = window.localStorage.getItem(LIB_DEL_LS);
    var arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter(function (x) { return typeof x === "string"; }) : [];
  } catch (_) { return []; }
}
var LIB_DELETED = loadLibDeleted();
function saveLibDeleted() {
  try { window.localStorage.setItem(LIB_DEL_LS, JSON.stringify(LIB_DELETED)); libSaveError = false; return true; }
  catch (_) { libSaveError = true; return false; }
}
function libAll() {
  return LIB.filter(function (x) { return LIB_DELETED.indexOf("b:" + x.o) === -1; }).concat(LIB_ADDED);
}

export function libAddScript(title, content) {
  var all = libAll();
  for (var k = 0; k < all.length; k++) {
    if (all[k].content && all[k].content === content) return { index: k, added: false };
  }
  LIB_ADDED.push({ o: title, a: "Kreatif", s: "Draf", badge: "b-idle", content: content, kind: "script", proj: PROJECTS[currentProj] ? PROJECTS[currentProj].name : "", addedAt: libTodayISO() });
  if (!saveLibAdded()) { LIB_ADDED.pop(); renderLib(); return { index: -1, added: false, saveFailed: true }; }
  renderLib();
  return { index: all.length, added: true };
}

/* Filter Library: 4 dimensi — jenis file, periode produksi, agen,
   project. Baris tanpa tanggal hanya muncul di periode "Semua" (bukan
   ditebak tanggalnya). Indeks kartu = indeks global libAll(), karena
   aksi (Media/Hapus/Revisi/detail) memakai indeks itu. */
var libFilter = { kind: "all", period: "all", agent: "all", proj: "all" };
function libTodayISO() {
  var n = new Date();
  return n.getFullYear() + "-" + String(n.getMonth() + 1).padStart(2, "0") + "-" + String(n.getDate()).padStart(2, "0");
}
function libKindOf(item) {
  if (item.kind === "script") return "script";
  if (item.kind === "image") return "image";
  return "doc";
}
function libKindLabel(kind) {
  return kind === "script" ? tr('lib.kind.script') : kind === "image" ? tr('lib.kind.image') : tr('lib.kind.doc');
}
function libDayDiff(addedAt) {
  if (!addedAt) return null;
  var parts = addedAt.split("-");
  if (parts.length !== 3) return null;
  var d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  if (isNaN(d.getTime())) return null;
  var now = new Date();
  var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((today.getTime() - d.getTime()) / 86400000);
}
function libDateLabel(item) {
  if (!item.addedAt) return "—";
  var parts = item.addedAt.split("-");
  if (parts.length !== 3) return "—";
  var d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  if (isNaN(d.getTime())) return "—";
  return d.getDate() + " " + MONTHS[getLang()][d.getMonth()] + " " + d.getFullYear();
}
function libMatchPeriod(item) {
  if (libFilter.period === "all") return true;
  var diff = libDayDiff(item.addedAt);
  if (diff === null || diff < 0) return false;
  if (libFilter.period === "today") return diff === 0;
  if (libFilter.period === "d7") return diff <= 7;
  if (libFilter.period === "d30") return diff <= 30;
  if (libFilter.period === "d90") return diff <= 90;
  return true;
}
function fillLibSelect(id, values, current) {
  var sel = document.getElementById(id);
  if (!sel) return "all";
  var keep = values.indexOf(current) !== -1 ? current : "all";
  sel.innerHTML = "<option value='all'>" + esc(tr('lib.filter.all')) + "</option>" + values.map(function (v) {
    return "<option value='" + esc(v) + "'" + (v === keep ? " selected" : "") + ">" + esc(v) + "</option>";
  }).join("");
  return keep;
}
export function libSetFilter(dim, value) {
  if (dim === "kind" || dim === "period" || dim === "agent" || dim === "proj") libFilter[dim] = value;
  renderLib();
}

export function renderLib() {
    var grid = document.getElementById("libGrid");
    if (!grid) return;
    var all = libAll();
    var agents = [];
    var projs = [];
    all.forEach(function (item) {
      if (agents.indexOf(item.a) === -1) agents.push(item.a);
      if (item.proj && projs.indexOf(item.proj) === -1) projs.push(item.proj);
    });
    libFilter.agent = fillLibSelect("libFilterAgent", agents, libFilter.agent);
    libFilter.proj = fillLibSelect("libFilterProj", projs, libFilter.proj);
    var shown = 0;
    var cards = [];
    all.forEach(function (item, gi) {
      if (libFilter.kind !== "all" && libKindOf(item) !== libFilter.kind) return;
      if (!libMatchPeriod(item)) return;
      if (libFilter.agent !== "all" && item.a !== libFilter.agent) return;
      if (libFilter.proj !== "all" && item.proj !== libFilter.proj) return;
      shown++;
      var thumb = item.kind === "image" && item.imageFile
        ? "<img class='lib-thumb' data-lib-idx='" + gi + "' alt=''>"
        : "";
      cards.push("<div class='lib-card' ondblclick='libDetail(" + gi + ", event)'>"
        + thumb
        + "<div class='lib-title'>" + esc(item.o) + "</div>"
        + "<div class='lib-meta'>" + esc(tr('lib.card.agent')) + ": " + esc(item.a) + " • " + esc(tr('lib.card.project')) + ": " + esc(item.proj || "—") + "</div>"
        + "<div class='lib-meta'>" + esc(tr('lib.card.type')) + ": " + esc(libKindLabel(libKindOf(item))) + " • " + esc(tr('lib.card.date')) + ": " + esc(libDateLabel(item)) + " <span class='badge " + item.badge + "'>" + esc(item.s) + "</span></div>"
        + "<div class='lib-actions'>"
        + "<button class='btn btn-sm' onclick='libMedia(" + gi + ")'>" + esc(tr('lib.btn.media')) + "</button>"
        + "<button class='btn btn-sm' onclick='libDelete(" + gi + ")'>" + esc(tr('lib.btn.delete')) + "</button>"
        + "<button class='btn btn-sm' onclick='libRevise(" + gi + ")'>" + esc(tr('lib.btn.revise')) + "</button>"
        + "</div></div>");
    });
    grid.innerHTML = cards.join("") || "<div class='se-note'>" + esc(tr('lib.empty')) + "</div>";
    // Audit v66 L-M2: peringatan persistensi di atas daftar — data
    // korup (dicadangkan) atau gagal simpan terakhir harus terlihat,
    // bukan hilang diam-diam.
    var warn = "";
    if (libCorrupt) warn += "<div class='se-note'>" + esc(tr('lib.corrupt')) + "</div>";
    if (libSaveError) warn += "<div class='se-note'>" + esc(tr('lib.err.save')) + "</div>";
    if (warn) grid.innerHTML = warn + grid.innerHTML;
    var cnt = document.getElementById("libFilterCount");
    if (cnt) cnt.textContent = tr('lib.count', { n: shown, total: all.length });
    // Thumbnail gambar dimuat async lewat cache bersama (gagal -> hilang).
    // Pakai daftar 'all' yang sudah dimuat — dulu libAll() dipanggil
    // ulang per thumbnail (perf m2).
    grid.querySelectorAll("[data-lib-idx]").forEach(function (img) {
      var it = all[Number(img.getAttribute("data-lib-idx"))];
      if (!it || !it.imageFile) return;
      readThumb(it.imageFile).then(function (url) {
        if (url) img.src = url; else img.remove();
      });
    });
  }

/* Detail Library (klik 2x pada kartu): judul + meta lengkap + pratinjau
   isi (teks naskah / thumbnail gambar) + 3 aksi yang sama dengan kartu.
   Klik tombol di kartu TIDAK membuka detail (dicek via event target). */
export function libDetail(i, ev) {
  if (ev && ev.target && ev.target.closest && ev.target.closest("button")) return;
  var item = libAll()[i];
  var dlg = document.getElementById("libDetailDlg");
  if (!item || !dlg) return;
  var preview = "";
  if (item.kind === "image" && item.imageFile) {
    preview = "<img class='lib-detail-img' data-lib-idx='" + i + "' alt=''><div class='se-note'>" + esc(item.content || "") + "</div>";
  } else if (item.content) {
    preview = "<pre class='lib-detail-pre'>" + esc(item.content) + "</pre>";
  } else {
    preview = "<div class='se-note'>" + esc(tr('lib.detail.nocontent')) + "</div>";
  }
  dlg.innerHTML = "<div class='lib-dialog-backdrop' onclick='libDetailClose()'></div><div class='lib-dialog-card'>"
    + "<div class='lib-title'>" + esc(item.o) + "</div>"
    + "<div class='lib-meta'>" + esc(tr('lib.card.agent')) + ": " + esc(item.a) + " • " + esc(tr('lib.card.project')) + ": " + esc(item.proj || "—") + "</div>"
    + "<div class='lib-meta'>" + esc(tr('lib.card.type')) + ": " + esc(libKindLabel(libKindOf(item))) + " • " + esc(tr('lib.card.date')) + ": " + esc(libDateLabel(item)) + " <span class='badge " + item.badge + "'>" + esc(item.s) + "</span></div>"
    + preview
    + "<div class='lib-actions'>"
    + "<button class='btn btn-sm' onclick='libDetailClose(); libMedia(" + i + ")'>" + esc(tr('lib.btn.media')) + "</button>"
    + "<button class='btn btn-sm' onclick='libDelete(" + i + ")'>" + esc(tr('lib.btn.delete')) + "</button>"
    + "<button class='btn btn-sm' onclick='libDetailClose(); libRevise(" + i + ")'>" + esc(tr('lib.btn.revise')) + "</button>"
    + "<button class='btn btn-sm' onclick='libDetailClose()'>" + esc(tr('lib.detail.close')) + "</button>"
    + "</div></div>";
  dlg.style.display = "block";
  var img = dlg.querySelector("[data-lib-idx]");
  if (img && item.imageFile) {
    readThumb(item.imageFile).then(function (url) {
      if (url) img.src = url; else img.remove();
    });
  }
}
export function libDetailClose() {
  var dlg = document.getElementById("libDetailDlg");
  if (dlg) { dlg.style.display = "none"; dlg.innerHTML = ""; }
}

/* Hapus menyeluruh: Library (persist: splice baris user / tombstone baris
   bawaan) + kartu Kanban yang merujuk judul ini + file gambar di disk
   (best-effort) + cache thumbnail + galeri (via imgRefreshUI, karena
   galeri membaca langsung dari minime.library.added). Riwayat chat dan
   baris snapshot Planner TIDAK dihapus (rekaman, bukan referensi hidup);
   draf Script Editor yang sedang dibuka juga dibiarkan (draf kerja). */
var libPendingDelete = -1;
export function libDelete(i) {
  var item = libAll()[i];
  if (!item) return;
  var dlg = document.getElementById("libConfirmDlg");
  if (!dlg) return;
  libPendingDelete = i;
  dlg.innerHTML = "<div class='lib-dialog-backdrop' onclick='libConfirmClose()'></div><div class='lib-dialog-card'>"
    + "<div class='lib-title'>" + esc(tr('lib.confirm.title')) + "</div>"
    + "<div class='lib-detail-pre'>" + esc(tr('lib.confirm.text', { title: item.o })) + "</div>"
    + "<div class='lib-actions'>"
    + "<button class='btn btn-sm' onclick='libConfirmDelete()'>" + esc(tr('lib.confirm.yes')) + "</button>"
    + "<button class='btn btn-sm' onclick='libConfirmClose()'>" + esc(tr('lib.confirm.no')) + "</button>"
    + "</div></div>";
  dlg.style.display = "block";
}
export function libConfirmClose() {
  var dlg = document.getElementById("libConfirmDlg");
  if (dlg) { dlg.innerHTML = ""; dlg.style.display = "none"; }
  libPendingDelete = -1;
}
export function libConfirmDelete() {
  var i = libPendingDelete;
  libConfirmClose();
  if (i < 0) return;
  var item = libAll()[i];
  if (!item) return;
  var bi = LIB.indexOf(item);
  var saved = true;
  if (bi !== -1) {
    var pushed = false;
    if (LIB_DELETED.indexOf("b:" + item.o) === -1) { LIB_DELETED.push("b:" + item.o); pushed = true; }
    saved = saveLibDeleted();
    if (!saved && pushed) LIB_DELETED.pop();
  } else {
    var ai = LIB_ADDED.indexOf(item);
    if (ai !== -1) {
      LIB_ADDED.splice(ai, 1);
      saved = saveLibAdded();
      if (!saved) LIB_ADDED.splice(ai, 0, item);
    }
  }
  if (!saved) { renderLib(); return; }
  // Audit v66 L-M1: hapus Library HANYA menyentuh kartu Kanban yang
  // dibuat libRevise ("Revisi: <judul>") — dulu klausa c.t === item.o
  // ikut menghapus kartu snapshot yang kebetulan berjudul sama
  // ("Kalender 7 hari + 7 brief").
  Object.keys(PROJECTS).forEach(function (k) {
    if (PROJECTS[k] && Array.isArray(PROJECTS[k].kanban)) {
      PROJECTS[k].kanban = PROJECTS[k].kanban.filter(function (c) {
        return c.t !== "Revisi: " + item.o;
      });
    }
  });
  if (item.kind === "image" && item.imageFile) {
    if (typeof window.imgDeleteFile === "function") { try { window.imgDeleteFile(item.imageFile); } catch (_) {} }
    if (typeof window.imgDropThumb === "function") { try { window.imgDropThumb(item.imageFile); } catch (_) {} }
  }
  libDetailClose();
  renderLib();
  renderKanban();
  if (typeof window.imgRefreshUI === "function") { try { window.imgRefreshUI(); } catch (_) {} }
}

/* Recall ke Media Studio: muat isi (atau judul bila tanpa isi) ke
   output Script Editor yang bisa diedit, lalu buka tab Script.
   Jembatan window.seLoadOutput dipasang modul script-editor saat init. */
export function libAddImage(title, prompt, imageFile, costUsd) {
  var all = libAll();
  for (var k = 0; k < all.length; k++) {
    if (all[k].imageFile && all[k].imageFile === imageFile) return { index: k, added: false };
  }
  LIB_ADDED.push({ o: title, a: "Kreatif", s: "Disetujui", badge: "b-ok", content: prompt, kind: "image", imageFile: imageFile, costUsd: costUsd, proj: PROJECTS[currentProj] ? PROJECTS[currentProj].name : "", addedAt: libTodayISO() });
  if (!saveLibAdded()) { LIB_ADDED.pop(); renderLib(); return { index: -1, added: false, saveFailed: true }; }
  renderLib();
  return { index: all.length, added: true };
}

export function libMedia(i) {
    var item = libAll()[i];
    if (!item) return;
    if (item.kind === "image") {
      if (item.imageFile) {
        showView("media");
        mediaTab("image");
        if (typeof window.imgLoadSaved === "function") window.imgLoadSaved(item);
        return;
      }
      // Gambar tanpa file (mis. snapshot Fase 3 pending-provider): buka
      // dialog detail yang menjelaskan statusnya, bukan editor kosong.
      libDetail(i);
      return;
    }
    var text = item.content || item.o;
    if (typeof window.seLoadOutput === "function") window.seLoadOutput(text);
    showView("media");
    mediaTab("script");
  }


export function libRevise(i) {
    var item = libAll()[i];
    if (!item) return;
    if (PROJECTS[currentProj]) PROJECTS[currentProj].kanban.push({ t: "Revisi: " + item.o, a: item.a, c: 3 });
    renderKanban();
    showView("home");
    postChat("prime", "Prime Agent", "#EB87B4", "Perbaikan dibuka untuk '" + esc(item.o) + "' — kartunya masuk kolom Revisi di Kanban, menunggu catatanmu (simulasi).", true);
  }

export function mediaBadge(s) { return s === "Siap untuk Post" ? "b-ok" : (s === "Menunggu GKonten" || s === "Menunggu provider" ? "b-wait" : "b-idle"); }


export function renderPlanner() {
    renderNativePlanner();
  }

/* Kanban persistensi (audit v66 L-B1): snapshot build-time hanya
   fallback — bila localStorage punya Kanban tersimpan, itulah yang
   dipakai, termasuk saat ganti bahasa (refreshBackendData). */
var KANBAN_LS = "minime.kanban";
function saveKanban() {
  try {
    var cards = {}, team = {};
    Object.keys(PROJECTS).forEach(function (k) { cards[k] = PROJECTS[k].kanban; if (PROJECTS[k].team) team[k] = PROJECTS[k].team; });
    window.localStorage.setItem(KANBAN_LS, JSON.stringify({ v: 2, cards: cards, team: team, extraCols: extraCols }));
  } catch (_) {
    // Kuota penuh: perubahan sesi tetap tampil, hilang saat reload —
    // sama seperti sebelum v66, tapi tidak pernah diklaim tersimpan.
  }
}
function loadKanban() {
  try {
    var raw = window.localStorage.getItem(KANBAN_LS);
    var store = raw ? JSON.parse(raw) : null;
    if (store && typeof store === "object") {
      if (store.v === 2) {
        Object.keys(PROJECTS).forEach(function (k) {
          if (store.cards && Array.isArray(store.cards[k])) PROJECTS[k].kanban = store.cards[k].filter(function (c) { return c && typeof c.t === "string"; });
          if (store.team && Array.isArray(store.team[k])) PROJECTS[k].team = store.team[k];
        });
        if (Array.isArray(store.extraCols)) extraCols = store.extraCols;
      } else {
        Object.keys(PROJECTS).forEach(function (k) {
          if (Array.isArray(store[k])) PROJECTS[k].kanban = store[k].filter(function (c) { return c && typeof c.t === "string"; });
        });
      }
    }
  } catch (_) {
    // Korup: pakai snapshot.
  }
}

/** B7: re-derive backend data in the current language (after a language switch). */
export function refreshBackendData() {
  // v84: tanpa seed proyek — hanya Kanban tersimpan user yang dimuat.
  loadKanban();
}

function tabSwitcher(panelPrefix, btnPrefix, keys, id) {
  keys.forEach(function (k) {
    var p = document.getElementById(panelPrefix + k);
    if (p) p.style.display = (k === id) ? 'block' : 'none';
    var b = document.getElementById(btnPrefix + k);
    if (b) b.classList.toggle('active', k === id);
  });
}

export function mediaTab(id) {
  tabSwitcher('ms-tab-', 'ms-tabbtn-', ['script', 'image', 'batch', 'voice', 'video'], id);
}

export function campaignTab(id) {
  tabSwitcher('cp-tab-', 'cp-tabbtn-', ['leads', 'crm', 'outreach', 'followup'], id);
}

/** Campaign tab bodies, DERIVED from the real Fase 4 artifact via
 *  backend-data (build-time snapshot, like Kanban/Planner). CRM
 *  lists pipeline counts + every deduped lead with score/stage;
 *  Outreach lists the 6 draft records (draft-only, never sent).
 *  Called on init and on language switch (like renderPlanner). */
/* Campaign operabel (audit v79): snapshot Fase 4 tetap jadi dasar, tapi
   CRM kini bisa ditambah lead manual (minime.crmAdded, ID M1, M2, ...),
   stage bisa diubah per lead (minime.crmStages; lead manual tersimpan
   langsung di record-nya), draf Outreach bisa disalin, dan Follow Up
   punya daftar tugas manual (minime.followups). Snapshot tidak pernah
   ditulis ulang — override hanya di localStorage. */
var CP_STAGES = ['Prioritas', 'Prospek', 'Nurture', 'Dingin'];
function cpAddedLoad() { try { return JSON.parse(localStorage.getItem('minime.crmAdded') || '[]'); } catch (_) { return []; } }
function cpAddedSave(a) { try { localStorage.setItem('minime.crmAdded', JSON.stringify(a)); return true; } catch (_) { return false; } }
function cpStagesLoad() { try { return JSON.parse(localStorage.getItem('minime.crmStages') || '{}'); } catch (_) { return {}; } }
function cpStagesSave(m) { try { localStorage.setItem('minime.crmStages', JSON.stringify(m)); return true; } catch (_) { return false; } }
function cpFuLoad() { try { return JSON.parse(localStorage.getItem('minime.followups') || '[]'); } catch (_) { return []; } }
function cpFuSave(a) { try { localStorage.setItem('minime.followups', JSON.stringify(a)); return true; } catch (_) { return false; } }
function cpSeqNext() {
  var n = parseInt(localStorage.getItem('minime.crmAddedSeq') || '0', 10) || 0;
  n += 1;
  try { localStorage.setItem('minime.crmAddedSeq', String(n)); } catch (_) {}
  return 'M' + n;
}
function cpLeadsAll() {
  var stages = cpStagesLoad();
  var list = campaignLeads().map(function (l) {
    return { id: l.id, name: l.name, channel: l.channel, score: l.score, stage: stages[l.id] || l.stage, manual: false, contact: '' };
  });
  cpAddedLoad().forEach(function (a) {
    list.push({ id: a.id, name: a.name, channel: a.channel, score: null, stage: a.stage, manual: true, contact: a.contact || '' });
  });
  return list;
}
export function cpAddLead() {
  var nameEl = document.getElementById('cpLeadName');
  var contactEl = document.getElementById('cpLeadContact');
  var channelEl = document.getElementById('cpLeadChannel');
  var stageEl = document.getElementById('cpLeadStage');
  var noteEl = document.getElementById('cpLeadNote');
  var name = (nameEl ? nameEl.value : '').trim();
  if (!name) { if (noteEl) noteEl.textContent = tr('cp.lead.empty'); return; }
  var added = cpAddedLoad();
  added.push({ id: cpSeqNext(), name: name, contact: contactEl ? contactEl.value.trim() : '', channel: channelEl ? channelEl.value : '', stage: stageEl ? stageEl.value : 'Prospek' });
  if (!cpAddedSave(added)) { if (noteEl) noteEl.textContent = tr('lib.err.save'); return; }
  if (nameEl) nameEl.value = '';
  if (contactEl) contactEl.value = '';
  if (noteEl) noteEl.textContent = tr('cp.lead.added');
  renderCampaign();
}
export function cpDelAdded(id) {
  cpAddedSave(cpAddedLoad().filter(function (a) { return String(a.id) !== String(id); }));
  renderCampaign();
}
export function cpLeadDetail(id) {
  var lead = cpLeadsAll().find(function (l) { return String(l.id) === String(id); });
  var box = document.getElementById('cpDlg');
  if (!box || !lead) return;
  var stageOpts = CP_STAGES.map(function (st) { return '<option' + (st === lead.stage ? ' selected' : '') + '>' + esc(st) + '</option>'; }).join('');
  box.innerHTML = '<div class="kb-dlg"><h3>' + esc(lead.id) + ' ' + esc(lead.name) + '</h3>'
    + '<p>' + esc(lead.channel) + (lead.contact ? ' · ' + esc(lead.contact) : '') + ' · ' + tr('cp.score') + ' ' + (lead.score == null ? '—' : lead.score) + (lead.manual ? ' · ' + tr('cp.lead.manual') : '') + '</p>'
    + '<label>' + tr('cp.lead.stage') + '<br><select id="cpDlgStage" class="input" style="width:100%">' + stageOpts + '</select></label>'
    + '<div style="margin-top:12px;display:flex;gap:8px"><button class="btn" id="cpDlgSave">' + tr('cp.lead.save') + '</button>'
    + (lead.manual ? '<button class="btn" id="cpDlgDel">' + tr('cp.lead.delete') + '</button>' : '')
    + '<button class="btn" id="cpDlgClose">' + tr('kb.dlg.close') + '</button></div>'
    + '<input type="hidden" id="cpDlgId" value="' + esc(lead.id) + '"></div>';
  var saveBtn = document.getElementById('cpDlgSave');
  if (saveBtn) saveBtn.addEventListener('click', cpLeadSaveStage);
  var closeBtn = document.getElementById('cpDlgClose');
  if (closeBtn) closeBtn.addEventListener('click', cpLeadClose);
  var delBtn = document.getElementById('cpDlgDel');
  if (delBtn) delBtn.addEventListener('click', function () {
    delBtn.textContent = tr('cp.lead.del_ask');
    delBtn.addEventListener('click', function () {
      cpDelAdded(lead.id);
      cpLeadClose();
    }, { once: true });
  }, { once: true });
}
export function cpLeadClose() {
  var box = document.getElementById('cpDlg');
  if (box) box.innerHTML = '';
}
export function cpLeadSaveStage() {
  var idEl = document.getElementById('cpDlgId');
  var stageEl = document.getElementById('cpDlgStage');
  if (!idEl || !stageEl) return;
  var id = idEl.value;
  var stage = stageEl.value;
  var added = cpAddedLoad();
  var found = false;
  added.forEach(function (a) { if (String(a.id) === String(id)) { a.stage = stage; found = true; } });
  if (found) { cpAddedSave(added); }
  else {
    var stages = cpStagesLoad();
    stages[id] = stage;
    cpStagesSave(stages);
  }
  cpLeadClose();
  renderCampaign();
}
export function cpCopyDraft(i) {
  var drafts = campaignDrafts();
  var d = drafts[i];
  if (!d) return;
  var btn = document.querySelector('[data-cp-copy="' + i + '"]');
  var done = function () {
    if (!btn) return;
    btn.textContent = tr('cp.copied');
    setTimeout(function () { btn.textContent = tr('cp.copy'); }, 2000);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(d.text).then(done, function () { done(); });
  } else {
    var ta = document.createElement('textarea');
    ta.value = d.text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (_) {}
    document.body.removeChild(ta);
    done();
  }
}
export function cpFuAdd() {
  var leadEl = document.getElementById('cpFuLead');
  var textEl = document.getElementById('cpFuText');
  var noteEl = document.getElementById('cpFuNote');
  var text = (textEl ? textEl.value : '').trim();
  if (!text) { if (noteEl) noteEl.textContent = tr('cp.fu.empty'); return; }
  var list = cpFuLoad();
  list.push({ id: 'F' + Date.now(), leadId: leadEl ? leadEl.value : '', text: text, done: false });
  cpFuSave(list);
  if (textEl) textEl.value = '';
  renderCampaign();
}
export function cpFuToggle(id) {
  var list = cpFuLoad();
  list.forEach(function (t) { if (String(t.id) === String(id)) t.done = !t.done; });
  cpFuSave(list);
  renderCampaign();
}
export function cpFuDel(id) {
  cpFuSave(cpFuLoad().filter(function (t) { return String(t.id) !== String(id); }));
  renderCampaign();
}
export function renderCampaign() {
  var counts = campaignCounts();
  var leads = cpLeadsAll();
  var added = cpAddedLoad();
  var crm = document.getElementById('cp-crm-body');
  if (crm) {
    var rows = leads.map(function (l) {
      return '<tr data-cp-lead="' + esc(l.id) + '" style="cursor:pointer"><td><b>' + esc(l.id) + '</b> ' + esc(l.name) + '</td><td>' + esc(l.channel) + '</td><td>' + tr('cp.score') + ' ' + (l.score == null ? '—' : l.score) + '</td><td>' + esc(l.stage) + (l.manual ? ' · ' + tr('cp.lead.manual') : '') + '</td></tr>';
    }).join('');
    var sum = {};
    leads.forEach(function (l) { sum[l.stage] = (sum[l.stage] || 0) + 1; });
    var summary = CP_STAGES.filter(function (st) { return sum[st]; }).map(function (st) { return st + ': ' + sum[st]; }).join(' · ');
    crm.innerHTML = '<p>' + counts.raw + ' → ' + counts.deduped + ' lead (' + tr('cp.crm.dedupe', { merged: counts.merged }) + ')' + (added.length ? ' + ' + added.length + ' ' + tr('cp.lead.manual') : '') + ' · ' + summary + '</p><table><tr><th>Lead</th><th>' + tr('word.channel') + '</th><th>' + tr('cp.score') + '</th><th>' + tr('cp.stage') + '</th></tr>' + rows + '</table>';
  }
  var addedBox = document.getElementById('cp-leads-added');
  if (addedBox) {
    addedBox.innerHTML = added.map(function (a) {
      return '<div style="background:#1e1e1e;border:1px solid #2a2a2a;border-radius:12px;padding:12px 16px;margin-bottom:8px;display:flex;justify-content:space-between;gap:8px"><span><b>' + esc(a.id) + ' ' + esc(a.name) + '</b> · ' + esc(a.channel) + (a.contact ? ' · ' + esc(a.contact) : '') + ' · ' + esc(a.stage) + '</span><button class="btn btn-sm" data-cp-deladded="' + esc(a.id) + '">' + tr('cp.lead.delete') + '</button></div>';
    }).join('');
  }
  var out = document.getElementById('cp-outreach-body');
  if (out) {
    var drafts = campaignDrafts().map(function (d, i) {
      var link = d.waLink ? ' · <a href="' + esc(d.waLink) + '" target="_blank" rel="noreferrer">wa.me</a>' : '';
      return '<div style="margin-bottom:12px"><b>' + esc(d.leadId) + ' ' + esc(d.leadName) + '</b> (' + esc(d.stage) + ', ' + tr('cp.score') + ' ' + d.score + ', ' + esc(d.channel) + ') <span class="badge b-wait">' + tr('cp.status.draft') + '</span> <button class="btn btn-sm" data-cp-copy="' + i + '">' + tr('cp.copy') + '</button><div style="color:#a1a1a1;font-size:13px">' + esc(d.text) + link + '</div></div>';
    }).join('');
    out.innerHTML = drafts;
  }
  var fu = document.getElementById('cp-followup-body');
  if (fu) {
    var leadOpts = leads.map(function (l) { return '<option value="' + esc(l.id) + '">' + esc(l.id) + ' ' + esc(l.name) + '</option>'; }).join('');
    var tasks = cpFuLoad().map(function (t) {
      var lead = leads.find(function (l) { return String(l.id) === String(t.leadId); });
      return '<div style="display:flex;gap:8px;align-items:center;margin-bottom:6px"><input type="checkbox" data-cp-futoggle="' + esc(t.id) + '"' + (t.done ? ' checked' : '') + '><span style="' + (t.done ? 'text-decoration:line-through;color:#a1a1a1' : '') + '">' + esc(t.text) + (lead ? ' (' + esc(lead.name) + ')' : '') + '</span><button class="btn btn-sm" data-cp-fudel="' + esc(t.id) + '">' + tr('cp.fu.delete') + '</button></div>';
    }).join('');
    fu.innerHTML = '<div style="display:flex;gap:8px;align-items:end;margin-bottom:12px"><label>' + tr('cp.fu.lead') + '<br><select id="cpFuLead" class="input">' + leadOpts + '</select></label><label style="flex:1">' + tr('cp.fu.task_ph') + '<br><input id="cpFuText" class="input" style="width:100%"></label><button class="btn" data-cp-fuadd="1">' + tr('cp.fu.add') + '</button></div><p id="cpFuNote" style="margin:0 0 8px"></p>' + tasks;
  }
  document.querySelectorAll('[data-cp-lead]').forEach(function (r) {
    r.addEventListener('click', function () { cpLeadDetail(r.getAttribute('data-cp-lead')); });
  });
  document.querySelectorAll('[data-cp-deladded]').forEach(function (b) {
    b.addEventListener('click', function () { cpDelAdded(b.getAttribute('data-cp-deladded')); });
  });
  document.querySelectorAll('[data-cp-copy]').forEach(function (b) {
    b.addEventListener('click', function () { cpCopyDraft(parseInt(b.getAttribute('data-cp-copy'), 10)); });
  });
  document.querySelectorAll('[data-cp-fuadd]').forEach(function (b) {
    b.addEventListener('click', cpFuAdd);
  });
  document.querySelectorAll('[data-cp-futoggle]').forEach(function (b) {
    b.addEventListener('change', function () { cpFuToggle(b.getAttribute('data-cp-futoggle')); });
  });
  document.querySelectorAll('[data-cp-fudel]').forEach(function (b) {
    b.addEventListener('click', function () { cpFuDel(b.getAttribute('data-cp-fudel')); });
  });
}

/* ---------- Sidebar, resizer, init ---------- */
export function showView(id) {
    document.querySelectorAll(".sidebar button").forEach(function (b) { b.classList.toggle("active", b.getAttribute("data-view") === id); });
    document.querySelectorAll(".view").forEach(function (v) { v.classList.remove("active"); });
    document.getElementById("view-" + id).classList.add("active");
    document.querySelector(".app").classList.toggle("no-nav", id !== "home" && id !== "newagent");
    // Audit v66: Billing selalu menampilkan pemakaian live terbaru
    // saat dibuka (angka tidak beku di render pertama).
    if (id === "billing" && typeof window.refreshLiveCost === "function") { try { window.refreshLiveCost(); } catch (_) {} }
  }

export function makeResizer(handleId, colId, minW, maxW) {
    var handle = document.getElementById(handleId), col = document.getElementById(colId);
    var startX = 0, startW = 0, dragging = false;
    handle.addEventListener("mousedown", function (e) {
      dragging = true; startX = e.clientX; startW = col.getBoundingClientRect().width;
      e.preventDefault();
    });
    document.addEventListener("mousemove", function (e) {
      if (!dragging) return;
      var dx = e.clientX - startX;
      var w = handleId === "resizeAgent" ? startW + dx : startW - dx;
      w = Math.max(minW, Math.min(maxW, w));
      col.style.width = w + "px";
    });
    document.addEventListener("mouseup", function () { if (dragging && (colId === "agentCol" || colId === "detailCol")) { try { localStorage.setItem("minime.colW." + colId, col.style.width); } catch (_) {} } dragging = false; });
  }

export function filterAgents(q) {
  q = (q || "").toLowerCase();
  if (!q) { renderAgents(); return; }
  document.querySelectorAll('#agentList .gagents').forEach(function (wrap) {
    var any = false;
    wrap.querySelectorAll('.agent').forEach(function (el) {
      var show = el.textContent.toLowerCase().indexOf(q) !== -1;
      el.style.display = show ? '' : 'none';
      if (show) any = true;
    });
    wrap.style.display = any ? '' : 'none';
    var g = wrap.previousElementSibling;
    if (g && g.classList.contains('group')) g.style.display = any ? '' : 'none';
  });
}

export function waInputChanged() {
    var inp = document.getElementById("chatInput"), c = document.getElementById("chatCount");
    if (c) c.textContent = inp && inp.value ? String(inp.value.length) : "";
  }

export function waToggleAttach() {
    document.getElementById('attachMenu').classList.toggle('open');
  }

export function waAttach(kind) {
    document.getElementById('attachMenu').classList.remove('open');
    if (kind === 'Gambar') { waPickFile('image/*', function (f) { waAddMeta(f.name, f.size, 'image'); }); return; }
    if (kind === 'Dokumen') { waPickFile('', function (f) { waAddMeta(f.name, f.size, 'doc'); }); return; }
    if (kind === 'Kamera') {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices.getUserMedia({ video: true }).then(function (stream) {
          waCamStream = stream;
          var n = waNoteEl(); n.style.display = 'block';
          n.innerHTML = "<div id='waChips'></div><div id='waCamBox'><video id='waCamVideo' autoplay playsinline style='width:100%;max-height:220px;background:#000'></video> <button class='btn btn-primary' onclick='waCamShot()'>" + tr('att.take') + "</button></div><div id='waRecBox'></div>";
          waRenderChips();
          document.getElementById('waCamVideo').srcObject = stream;
        }).catch(function () { var n2 = waNoteEl(); n2.style.display = 'block'; n2.textContent = tr('att.cam_unavail'); waPickFile('image/*', function (f) { waAddMeta(f.name, f.size, 'image'); }); });
      } else { var n3 = waNoteEl(); n3.style.display = 'block'; n3.textContent = tr('att.cam_unavail'); waPickFile('image/*', function (f) { waAddMeta(f.name, f.size, 'image'); }); }
      return;
    }
    if (kind === 'Audio') {
      if (window.MediaRecorder && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        var n4 = waNoteEl(); n4.style.display = 'block';
        n4.innerHTML = "<div id='waChips'></div><div id='waCamBox'></div><div id='waRecBox'><button class='btn btn-primary' onclick='waRecToggle()'>" + tr('att.rec_start') + "</button></div>";
        waRenderChips();
      } else { var n5 = waNoteEl(); n5.style.display = 'block'; n5.textContent = tr('att.mic_unavail'); waPickFile('audio/*', function (f) { waAddMeta(f.name, f.size, 'audio'); }); }
      return;
    }
  }

export function waMic() {
    // Audit v66 overlap m4: tombol mic di slot utama chat bukan lagi
    // fungsi simulasi — jadi pintasan nyata ke Editor Suara.
    showView('media');
    mediaTab('voice');
  }

export function toggleAddMenu() { document.getElementById('addMenu').classList.toggle('open'); }

export function renderAddMenu() {
    var menu = document.getElementById('addMenu');
    if (!menu) return;
    menu.innerHTML = '<button class="plus-item" onclick="plusNewAgent()"><span class="plus-ic">◎</span>' + tr('plus.new_agent') + '</button>'
      + '<button class="plus-item" onclick="plusNewChannel()"><span class="plus-ic">#</span>' + tr('plus.new_channel') + '</button>'
      + '<button class="plus-item" onclick="plusNewSection()"><span class="plus-ic">▤</span>' + tr('plus.new_section') + '</button>';
  }

/* ---------- Menu + v76: New agent / New channel / New section (ala OpenBot) ---------- */
var NA_COLORS = ['#F97316', '#EF4444', '#F59E0B', '#EAB308', '#22C55E', '#14B8A6', '#3B82F6', '#A855F7', '#EB87B4'];
var NA_SHAPES = ['circle', 'squircle', 'blob', 'hexagon', 'diamond'];
var NA_EFFORTS = ['Low', 'Medium', 'High', 'Extra high', 'Max'];
var NA_SUGS = [
  { name: 'na.sug1', help: 'Research the market, digital behaviour, and spending patterns — verified, no made-up numbers.' },
  { name: 'na.sug2', help: 'Turn research into specific, testable positioning, pillars, and STP.' },
  { name: 'na.sug3', help: 'Write hooks, CTAs, and creative briefs ready for social production.' },
  { name: 'na.sug4', help: 'Manage native scheduling drafts per social channel.' },
];
var naState = { color: '#F97316', shape: 'blob', model: 'meta', effort: 'Medium', modelOpen: false, name: '', help: '' };
var ncSel = {};
var nsBusy = false;

export function naModelLabel(m) { return tr('na.model_' + m); }
export function naEffortLabel(e) { return tr('na.effort_' + e.toLowerCase().replace(' ', '_')); }

export function plusNewAgent() {
    plusCloseMenu();
    naState = { color: '#F97316', shape: 'blob', model: 'meta', effort: 'Medium', modelOpen: false, name: '', help: '' };
    naRender();
    showView('newagent');
  }

export function naRender() {
    var body = document.getElementById('newAgentBody');
    if (!body) return;
    var letter = (naState.name.trim().charAt(0) || 'A').toUpperCase();
    var colors = NA_COLORS.map(function (c) { return '<button class="na-dot' + (naState.color === c ? ' sel' : '') + '" style="background:' + c + '" onclick="naPickColor(\'' + c + '\')"></button>'; }).join('');
    var shapes = NA_SHAPES.map(function (sh) { return '<button class="na-shape' + (naState.shape === sh ? ' sel' : '') + '" onclick="naPickShape(\'' + sh + '\')"><span class="av av-shape-' + sh + '" style="background:' + naState.color + '">' + letter + '</span></button>'; }).join('');
    var models = ['meta', 'gemini', 'deepseek', 'qwen'].map(function (m) { return '<div class="na-model-row" onclick="naPickModel(\'' + m + '\')"><span class="na-radio' + (naState.model === m ? ' on' : '') + '">' + (naState.model === m ? '✓' : '') + '</span><span>' + naModelLabel(m) + '</span></div>'; }).join('');
    var efforts = NA_EFFORTS.map(function (e) { return '<button class="na-effort-btn' + (naState.effort === e ? ' sel' : '') + '" onclick="naEffort(\'' + e + '\')">' + naEffortLabel(e) + '</button>'; }).join('');
    var sugs = NA_SUGS.map(function (sg, i) { return '<div class="na-sug-card" onclick="naSuggest(' + i + ')"><b>' + tr(sg.name) + '</b><br><small>' + tr(sg.name + 'd') + '</small></div>'; }).join('');
    body.innerHTML = '<div class="na-wrap">'
      + '<div class="na-top"><span style="flex:1"></span><button class="na-cancel" onclick="naCancel()">' + tr('na.cancel') + '</button></div>'
      + '<div class="na-preview"><div id="naPreview" class="av av-shape-' + naState.shape + ' na-big" style="background:' + naState.color + '">' + letter + '</div></div>'
      + '<div class="na-colors">' + colors + '</div>'
      + '<div class="na-shapes">' + shapes + '</div>'
      + '<div class="d-label">' + tr('na.name') + ' *</div><input id="naName" class="d-field" value="' + esc(naState.name) + '" oninput="naNameInput(this)">'
      + '<div class="d-label">' + tr('na.help') + '</div><textarea id="naHelp" class="d-field d-area" placeholder="' + esc(tr('na.help_ph')) + '" oninput="naHelpInput(this)">' + esc(naState.help) + '</textarea>'
      + '<div class="d-label">' + tr('na.model') + '</div><div class="na-model-field" onclick="naModelToggle()"><span>' + naModelLabel(naState.model) + ' · ' + naEffortLabel(naState.effort) + '</span><span>⌄</span></div>'
      + (naState.modelOpen ? '<div class="na-model-pop"><input class="d-field" placeholder="' + esc(tr('na.search_models')) + '" oninput="naModelFilter(this.value)"><div class="na-model-list">' + models + '</div><div class="d-label">' + tr('na.effort') + '</div><div class="na-effort">' + efforts + '</div></div>' : '')
      + '<button id="naCreateBtn" class="na-create" ' + (naState.name.trim() ? '' : 'disabled') + ' onclick="naCreate()">' + tr('na.create') + '</button>'
      + '<div class="d-label">' + tr('na.suggestions') + '</div><div class="na-sug">' + sugs + '</div>'
      + '</div>';
  }

export function naPickColor(c) { naState.color = c; naRender(); }
export function naPickShape(sh) { naState.shape = sh; naRender(); }
export function naModelToggle() { naState.modelOpen = !naState.modelOpen; naRender(); }
export function naPickModel(m) { naState.model = m; naState.modelOpen = false; naRender(); }
export function naEffort(e) { naState.effort = e; naRender(); }
export function naModelFilter(q) {
    q = (q || '').toLowerCase();
    document.querySelectorAll('.na-model-row').forEach(function (el) { el.style.display = el.textContent.toLowerCase().indexOf(q) !== -1 ? '' : 'none'; });
  }
export function naNameInput(el) {
    naState.name = el.value;
    var pv = document.getElementById('naPreview'); if (pv) pv.textContent = (el.value.trim().charAt(0) || 'A').toUpperCase();
    var b = document.getElementById('naCreateBtn'); if (b) b.disabled = !el.value.trim();
  }
export function naHelpInput(el) { naState.help = el.value; }
export function naSuggest(i) {
    var sg = NA_SUGS[i]; if (!sg) return;
    naState.name = tr(sg.name); naState.help = sg.help; naRender();
  }
export function naCancel() { showView('home'); }
export function naCreate() {
    var nameEl = document.getElementById('naName'), helpEl = document.getElementById('naHelp');
    var name = nameEl ? nameEl.value.trim() : naState.name.trim();
    var help = helpEl ? helpEl.value.trim() : naState.help.trim();
    if (!name) return;
    var key = plusSlug(name, function (s) { return !!AGENTS[s]; });
    AGENTS[key] = { name: name, color: naState.color, shape: naState.shape, role: help || 'General-purpose assistant', goal: help || 'General-purpose assistant', skills: [], model: naModelLabel(naState.model), effort: naState.effort };
    if (PROJECTS[currentProj]) {
      PROJECTS[currentProj].agents.push({ key: key, status: 'Idle', task: 'Baru dibuat' });
      saveHomeState();
      showView('home');
      selectAgent(key, currentProj);
      detailNote(tr('na.note.created', { name: name, proj: PROJECTS[currentProj].name }));
    } else {
      saveHomeState();
      showView('home');
    }
  }

export function plusNewChannel() {
    plusCloseMenu();
    ncSel = {};
    var rows = Object.keys(AGENTS).map(function (k) {
      var ag = AGENTS[k];
      return '<label class="chan-row"><input type="checkbox" onchange="ncToggle(\'' + k + '\', this.checked)"><span class="av av-shape-' + (ag.shape || 'circle') + '" style="background:' + ag.color + '">' + esc(ag.name.charAt(0)) + '</span><span><b>' + esc(ag.name) + '</b><br><small>' + esc(ag.role) + '</small></span></label>';
    }).join('');
    document.getElementById('chanOverlay').innerHTML = '<div class="chan-back" onclick="ncClose()"></div><div class="chan-card">'
      + '<div class="chan-head"><b>' + tr('nc.title') + '</b><button class="chan-x" onclick="ncClose()">×</button></div>'
      + '<div class="d-label">' + tr('nc.name') + '</div><input id="ncName" class="d-field" placeholder="' + esc(tr('nc.name_ph')) + '" oninput="ncUpdateCreate()">'
      + '<div class="d-label">' + tr('nc.add') + '</div><input class="d-field" placeholder="' + esc(tr('nc.search')) + '" oninput="ncFilter(this.value)">'
      + '<div class="chan-list">' + rows + '</div>'
      + '<div class="chan-foot"><button id="ncCreateBtn" class="na-create" disabled onclick="ncCreate()">' + tr('nc.create') + '</button></div>'
      + '</div>';
  }
export function ncClose() { document.getElementById('chanOverlay').innerHTML = ''; }
export function ncToggle(k, v) { ncSel[k] = !!v; }
export function ncUpdateCreate() { var b = document.getElementById('ncCreateBtn'), n = document.getElementById('ncName'); if (b) b.disabled = !(n && n.value.trim()); }
export function ncFilter(q) {
    q = (q || '').toLowerCase();
    document.querySelectorAll('.chan-row').forEach(function (el) { el.style.display = el.textContent.toLowerCase().indexOf(q) !== -1 ? '' : 'none'; });
  }
export function ncCreate() {
    var nameEl = document.getElementById('ncName');
    var name = nameEl ? nameEl.value.trim() : '';
    if (!name) return;
    var pid = plusSlug(name, function (s) { return !!PROJECTS[s]; });
    var keys = Object.keys(ncSel).filter(function (k) { return ncSel[k] && AGENTS[k]; });
    PROJECTS[pid] = { name: name, agents: keys.map(function (k) { return { key: k, status: 'Idle', task: '—' }; }), chat: [], kanban: [] };
    currentProj = pid;
    saveHomeState();
    ncClose();
    var ps = document.getElementById('projectSel'); if (ps) ps.value = pid;
    var cp = document.getElementById('chatProj'); if (cp) cp.textContent = name;
    renderAgents(); renderDetail(); renderChat(); renderKanban();
    detailNote(tr('nc.note.created', { name: name, n: keys.length }));
  }

export function plusNewSection() {
    plusCloseMenu();
    nsBusy = false;
    var list = document.getElementById('agentList');
    var row = document.createElement('div');
    row.className = 'agent ns-new';
    row.innerHTML = '<input id="nsInput" placeholder="' + esc(tr('ns.name_ph')) + '" onkeydown="if (event.key === \'Enter\') nsConfirm(); if (event.key === \'Escape\') { nsBusy = true; renderAgents(); }" onblur="nsConfirm()"><button onmousedown="nsConfirm()">▾</button>';
    list.insertBefore(row, list.firstChild);
    var inp = document.getElementById('nsInput'); if (inp) inp.focus();
  }
export function nsConfirm() {
    if (nsBusy) return;
    var inp = document.getElementById('nsInput');
    var v = inp ? inp.value.trim() : '';
    nsBusy = true;
    if (!v) { renderAgents(); return; }
    var pid = plusSlug(v, function (s) { return !!PROJECTS[s]; });
    PROJECTS[pid] = { name: v, agents: [], chat: [], kanban: [] };
    currentProj = pid;
    saveHomeState();
    var ps = document.getElementById('projectSel'); if (ps) ps.value = pid;
    var cp = document.getElementById('chatProj'); if (cp) cp.textContent = v;
    renderAgents(); renderDetail(); renderChat(); renderKanban();
    detailNote(tr('ns.note.created', { name: v }));
  }

/* Audit v66 C-M1: status Nonaktif agen dipakai chat.ts — agen yang
   dinonaktifkan user tidak menjawab lewat chat (delegasi jatuh ke
   Prime). Toggle agen hanya mengubah label tampilannya bila helper
   ini tidak dipakai — helper inilah yang menutup celah itu. */
export function isAgentDeactivated(key) {
  var proj = PROJECTS[currentProj];
  if (!proj || !Array.isArray(proj.agents)) return false;
  var m = proj.agents.filter(function (a) { return a.key === key; })[0];
  return !!m && m.status === "Nonaktif";
}

export function viewBack() { if (viewHistIdx > 0) { navJump = true; viewHistIdx--; _sv2(viewHist[viewHistIdx]); navJump = false; } }

export function viewForward() { if (viewHistIdx < viewHist.length - 1) { navJump = true; viewHistIdx++; _sv2(viewHist[viewHistIdx]); navJump = false; } }

export var AGENTS = {
    prime: { name: "Prime Agent", color: "#EB87B4", role: "Personal Assistant — orkestrasi & kurasi", goal: "Memastikan setiap arahan menjadi tugas yang jelas, didelegasikan ke agen yang tepat, dan hasilnya dikurasi sebelum final.", skills: ["Orkestrasi delegasi", "Kurasi hasil agen", "Penegakan gerbang GSTP/GKonten/GBatch"], model: "Meta (Muse) → Gemini → Ollama", always: true },
    riset: { name: "Riset", color: "#525252", role: "Riset pasar & audiens", goal: "Riset pasar, behaviour digital, dan pola spending yang terverifikasi — tanpa mengarang angka/URL.", skills: ["riset-pasar", "behaviour-digital", "spending-digital", "verifikasi-fakta"], model: "Gemini (fallback dari Meta)", always: false },
    strategi: { name: "Strategi", color: "#404040", role: "Positioning & STP", goal: "Mengubah riset menjadi positioning, pilar, dan STP yang spesifik dan bisa diuji.", skills: ["positioning-stp", "pak-bi-branding", "segmentasi-spending"], model: "Gemini (fallback dari Meta)", always: false },
    kreatif: { name: "Kreatif", color: "#5b5b5b", role: "Naskah & Brief", goal: "Kalender, hook, CTA, dan CreativeBrief text-free yang siap diproduksi Media.", skills: ["copywriting-hook-cta", "brief-text-free", "overlay-template"], model: "Gemini (fallback dari Meta)", always: false },
    media: { name: "Media", color: "#333333", role: "Produksi media", goal: "Gambar, carousel, reels, dan talking head yang lolos QC dan siap untuk post (setelah GKonten).", skills: ["image-text-free", "carousel-slide", "reels-pendek", "talking-head-avatar"], model: "Meta Image (menunggu aktif) → Gemini → Canva fallback", always: false },
    distribusi: { name: "Distribusi", color: "#4a4a4a", role: "Draf distribusi", goal: "Draf penjadwalan native per channel tanpa pernah terbit live di slice ini.", skills: ["jadwal-native", "status-channel"], model: "Penjadwal native (DRAF saja)", always: false },
    produk: { name: "Produk Digital", color: "#666666", role: "Brief produk digital", goal: "Brief, struktur fitur MVP, dan riset pengguna dari arahan produk.", skills: ["brief-produk", "riset-pengguna", "fitur-mvp"], model: "Gemini (fallback dari Meta)", always: false }
  };

var PROJECTS = {};
var currentProj = null, selectedAgent = "prime";

/* Collapsible project groups (28 Okt): status buka/tutup per project
   disimpan di localStorage agar bertahan antar restart; default semua
   terbuka. renderAgents() menggambar ulang seluruh list tiap ada
   perubahan, jadi statusnya tinggal di variabel ini, bukan di DOM. */
var collapsedGroups = (function () { try { return JSON.parse(window.localStorage.getItem('minime.agentGroups') || '{}'); } catch (e) { return {}; } })();
export function toggleGroup(pid) {
  collapsedGroups[pid] = !collapsedGroups[pid];
  try { window.localStorage.setItem('minime.agentGroups', JSON.stringify(collapsedGroups)); } catch (e) {}
  renderAgents();
}

function kcols() { return [tr('kcol.0'), tr('kcol.1'), tr('kcol.2'), tr('kcol.3'), tr('kcol.4')]; }

/* ---------- Kanban (drag & drop) ---------- */
var dragCard = null;

var kanbanTab = "kanban", extraCols = [];

/* ---------- Graph gaya n8n: trigger + agent + decision + sub-node ---------- */
var GNODES = {
    trigger: { name: "Arahan Pengguna", sub: "Trigger • chat pengguna", icon: "⚡", x: 3, y: 32, w: 175, kind: "trigger", desc: "Titik awal alur: arahan pengguna masuk dari chat dan memicu Prime Agent." },
    prime: { name: "Prime Agent", sub: "Orkestrasi & kurasi", icon: "🤖", x: 30, y: 32, w: 195, kind: "prime", desc: "Agen utama: memecah arahan, memanggil agen, dan mengkurasi semua hasil sebelum final." },
    gate: { name: "GSTP lolos?", sub: "Gerbang manusia", icon: "◈", x: 57, y: 32, w: 150, kind: "decision", desc: "Decision seperti 'Is manager?' di lampiran: true → distribusi, false → revisi. Keputusan selalu oleh pengguna, bukan model." },
    dist: { name: "Distribusi", sub: "draf penjadwalan", icon: "▸", x: 82, y: 10, w: 155, kind: "output", desc: "Cabang true: hasil yang lolos GKonten disiapkan sebagai DRAF penjadwalan native (bukan terbit live)." },
    revisi: { name: "Revisi", sub: "kembali ke Kreatif", icon: "↩", x: 82, y: 56, w: 155, kind: "output", desc: "Cabang false: tugas kembali ke agen pemiliknya dengan catatan revisi pengguna." },
    model: { name: "Chat Model", sub: "Meta → Gemini → Ollama", icon: "AI", x: 27, y: 70, kind: "circle", desc: "Sub-node model Prime Agent (garis putus-putus): rantai Meta → Gemini → Ollama lokal." },
    memory: { name: "Memory", sub: "PostgreSQL • riwayat", icon: "DB", x: 41, y: 70, kind: "circle", desc: "Sub-node memori Prime Agent (garis putus-putus): riwayat chat dan konteks proyek." },
    toolmedia: { name: "Tool: Media", sub: "image • carousel • reels", icon: "▷", x: 55, y: 70, kind: "circle", desc: "Sub-node tool Prime Agent (garis putus-putus): produksi media via agen Media." },
    tooljadwal: { name: "Tool: Penjadwal", sub: "draf saja", icon: "P", x: 69, y: 70, kind: "circle", desc: "Sub-node tool Prime Agent (garis putus-putus): draf penjadwalan native, tanpa terbit live di slice ini." }
  };

var GEDGES = [
    { f: "trigger", t: "prime", l: "" },
    { f: "prime", t: "gate", l: "" },
    { f: "gate", t: "dist", l: "true", branch: "T" },
    { f: "gate", t: "revisi", l: "false", branch: "F" },
    { f: "prime", t: "model", l: "", dashed: true },
    { f: "prime", t: "memory", l: "", dashed: true },
    { f: "prime", t: "toolmedia", l: "", dashed: true },
    { f: "prime", t: "tooljadwal", l: "", dashed: true }
  ];

var dragNode = null, dragMoved = false, dragStart = null, grabDX = 0, grabDY = 0, graphRunning = false;

var nodeCounter = 0;

/* ---------- Graph v77: setting per node ala OpenBot ---------- */
var graphSel = null, graphZoom = 1, graphDelAsk = false, graphHistOn = false, graphTimer = null, graphLastCheck = null, graphPopupOpen = false;

function graphZoomEl() { return document.getElementById("graphZoom") || document.getElementById("graphBox"); }
function graphLocale() { var l = getLang(); return l === "id" ? "id-ID" : l === "zh" ? "zh-CN" : "en-US"; }

function graphTrigDef() {
  var d = new Date();
  return { type: "schedule", freq: "daily", days: [0, 1, 2, 3, 4, 5, 6], hour: 9, min: 0, ampm: "AM", active: true,
           date: graphISODate(d), monthDay: d.getDate(), month: d.getMonth() + 1, day: d.getDate(), cron: "", firedOnce: false };
}
function graphISODate(d) { return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }
function graphTrigFill(t) {
  var d = graphTrigDef();
  if (!t || typeof t !== "object") return d;
  Object.keys(d).forEach(function (k) { if (t[k] === undefined) t[k] = d[k]; });
  if (!Array.isArray(t.days) || !t.days.length) t.days = d.days;
  return t;
}
function graphTrigOf(nd) { if (!nd.trig) nd.trig = graphTrigDef(); return graphTrigFill(nd.trig); }

export function graphNextRun(t, now) {
  if (!t || t.type !== "schedule") return null;
  t = graphTrigFill(t);
  var h = t.hour % 12 + (t.ampm === "PM" ? 12 : 0);
  function at(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, t.min, 0, 0); }
  var n = now || new Date();
  if (t.freq === "once") { var c1 = at(new Date(t.date + "T00:00:00")); return c1 > n ? c1 : null; }
  if (t.freq === "hourly") { var c2 = new Date(n.getFullYear(), n.getMonth(), n.getDate(), n.getHours(), t.min, 0, 0); if (c2 <= n) c2 = new Date(c2.getTime() + 3600000); return c2; }
  if (t.freq === "daily") { var c3 = at(n); if (c3 <= n) c3 = new Date(c3.getTime() + 86400000); return c3; }
  if (t.freq === "weekly") {
    var days = t.days.slice().sort(function (a, b) { return a - b; });
    for (var i = 0; i < 8; i++) { var d = new Date(n.getFullYear(), n.getMonth(), n.getDate() + i); if (days.indexOf(d.getDay()) >= 0) { var c4 = at(d); if (c4 > n) return c4; } }
    return null;
  }
  if (t.freq === "monthly") {
    var md = Math.min(t.monthDay, 31), y = n.getFullYear(), m = n.getMonth();
    for (var k = 0; k < 2; k++) { var last = new Date(y, m + 1, 0).getDate(); var c5 = new Date(y, m, Math.min(md, last), h, t.min, 0, 0); if (c5 > n) return c5; m++; if (m > 11) { m = 0; y++; } }
    return null;
  }
  if (t.freq === "yearly") {
    var y2 = n.getFullYear();
    for (var k2 = 0; k2 < 2; k2++) { var last2 = new Date(y2, t.month, 0).getDate(); var c6 = new Date(y2, t.month - 1, Math.min(t.day, last2), h, t.min, 0, 0); if (c6 > n) return c6; y2++; }
    return null;
  }
  return null;
}

export function graphPrevRun(t, now) {
  if (!t || t.type !== "schedule") return null;
  t = graphTrigFill(t);
  var h = t.hour % 12 + (t.ampm === "PM" ? 12 : 0);
  function at(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, t.min, 0, 0); }
  var n = now || new Date();
  if (t.freq === "once") { var c1 = at(new Date(t.date + "T00:00:00")); return c1 <= n ? c1 : null; }
  if (t.freq === "hourly") { var c2 = new Date(n.getFullYear(), n.getMonth(), n.getDate(), n.getHours(), t.min, 0, 0); if (c2 > n) c2 = new Date(c2.getTime() - 3600000); return c2; }
  if (t.freq === "daily") { var c3 = at(n); if (c3 > n) c3 = new Date(c3.getTime() - 86400000); return c3; }
  if (t.freq === "weekly") {
    var days = t.days.slice().sort(function (a, b) { return a - b; });
    for (var i = 0; i < 8; i++) { var d = new Date(n.getFullYear(), n.getMonth(), n.getDate() - i); if (days.indexOf(d.getDay()) >= 0) { var c4 = at(d); if (c4 <= n) return c4; } }
    return null;
  }
  if (t.freq === "monthly") {
    var md = Math.min(t.monthDay, 31), y = n.getFullYear(), m = n.getMonth();
    for (var k = 0; k < 2; k++) { var last = new Date(y, m + 1, 0).getDate(); var c5 = new Date(y, m, Math.min(md, last), h, t.min, 0, 0); if (c5 <= n) return c5; m--; if (m < 0) { m = 11; y--; } }
    return null;
  }
  if (t.freq === "yearly") {
    var y2 = n.getFullYear();
    for (var k2 = 0; k2 < 2; k2++) { var last2 = new Date(y2, t.month, 0).getDate(); var c6 = new Date(y2, t.month - 1, Math.min(t.day, last2), h, t.min, 0, 0); if (c6 <= n) return c6; y2--; }
    return null;
  }
  return null;
}

export function graphTrigSummary(t) {
  if (!t) return "";
  if (t.type === "manual") return tr("graph.trig.manual");
  if (t.type === "webhook") return tr("graph.trig.webhook");
  t = graphTrigFill(t);
  var freq = tr("graph.freq." + t.freq);
  var time = t.hour + ":" + ("0" + t.min).slice(-2) + " " + t.ampm;
  var days = "";
  if (t.freq === "daily") days = tr("graph.every_day");
  else if (t.freq === "weekly") days = t.days.length >= 7 ? tr("graph.every_day") : t.days.slice().sort(function (a, b) { return a - b; }).map(function (d) { return "SMTWTFS"[d]; }).join(" ");
  else if (t.freq === "hourly") days = tr("graph.every_hour");
  else if (t.freq === "monthly") days = String(t.monthDay);
  else if (t.freq === "yearly") days = t.day + " " + MONTHS[getLang()][t.month - 1];
  else if (t.freq === "once") days = t.date;
  else days = t.cron || tr("graph.freq.custom");
  return freq + " • " + days + " • " + time;
}

export function graphNextText(t, now) {
  var c = graphNextRun(t, now);
  if (!c) return tr("graph.next_none");
  return c.toLocaleDateString(graphLocale(), { weekday: "short", day: "numeric", month: "short" }) + ", " + ("0" + c.getHours()).slice(-2) + ":" + ("0" + c.getMinutes()).slice(-2);
}

export function saveGraphState() {
  try { localStorage.setItem("minime.graphState", JSON.stringify({ nodes: GNODES, edges: GEDGES, counter: nodeCounter })); return true; }
  catch (_) { return false; }
}
export function loadGraphState() {
  var raw = null;
  try { raw = localStorage.getItem("minime.graphState"); } catch (_) {}
  if (!raw) return false;
  try {
    var s = JSON.parse(raw);
    if (!s || typeof s.nodes !== "object" || !Array.isArray(s.edges)) throw new Error("bad");
    var ok = true;
    Object.keys(s.nodes).forEach(function (k) { var nd = s.nodes[k]; if (!nd || typeof nd.name !== "string" || typeof nd.kind !== "string" || typeof nd.x !== "number" || typeof nd.y !== "number") ok = false; });
    if (!ok) throw new Error("bad node");
    GNODES = s.nodes; GEDGES = s.edges; nodeCounter = s.counter || 0;
    Object.keys(GNODES).forEach(function (k) { if (GNODES[k].kind === "trigger") { GNODES[k].trig = graphTrigFill(GNODES[k].trig); GNODES[k].sub = graphTrigSummary(GNODES[k].trig); } });
    return true;
  } catch (_) {
    try { localStorage.setItem("minime.graphState.corrupt", raw); localStorage.removeItem("minime.graphState"); } catch (_) {}
    return false;
  }
}

export function graphSelect(key) { graphSel = GNODES[key] ? key : null; graphDelAsk = false; graphSelEdge = null; graphEdgeDelAsk = false; renderGraph(); renderGraphPanel(); }
export function graphClosePanel() { graphPopupOpen = false; graphSel = null; graphDelAsk = false; graphSelEdge = null; graphEdgeDelAsk = false; renderGraph(); renderGraphPanel(); }
export function graphOpenPopup(k) { if (!GNODES[k]) return; graphSelect(k); graphPopupOpen = true; renderGraphPanel(); }
export function renderGraphProjSel() {
  ["graphProjSel", "projectSel"].forEach(function (id) {
    var el = document.getElementById(id); if (!el) return;
    el.innerHTML = "";
    var keys = Object.keys(PROJECTS);
    if (!keys.length) { var o0 = document.createElement("option"); o0.value = ""; o0.textContent = "—"; o0.selected = true; el.appendChild(o0); return; }
    keys.forEach(function (pid) {
      var o = document.createElement("option"); o.value = pid; o.textContent = PROJECTS[pid].name; if (pid === currentProj) o.selected = true; el.appendChild(o);
    });
  });
}
function graphSelNode() { return graphSel && GNODES[graphSel] ? GNODES[graphSel] : null; }

export function renderGraphPanel() {
  var p = document.getElementById("graphPopupCard");
  var ov = document.getElementById("graphPopup");
  if (!p || !ov) return;
  if (!graphPopupOpen) { ov.style.display = "none"; p.innerHTML = ""; return; }
  ov.style.display = "flex";
  if (graphSelEdge) {
    var ef = GNODES[graphSelEdge.f], et = GNODES[graphSelEdge.t];
    var eh = "<div class='g-head'><span>" + tr("graph.edge.title") + "</span><button class='g-x' onclick='graphClosePanel()'>×</button></div>";
    eh += "<div class='g-row'><label>" + tr("graph.edge.from") + "</label><div>" + esc(ef ? ef.name : graphSelEdge.f) + "</div></div>";
    eh += "<div class='g-row'><label>" + tr("graph.edge.to") + "</label><div>" + esc(et ? et.name : graphSelEdge.t) + "</div></div>";
    eh += "<div class='g-actions'><button class='btn' onclick='graphAskEdgeDel()'>" + tr("graph.edge.delete") + "</button></div>";
    if (graphEdgeDelAsk) eh += "<div class='g-delask'>" + tr("kb.dlg.del_ask") + " <button class='btn' onclick='graphConfirmEdgeDel()'>" + tr("graph.edge.delete") + "</button> <button class='btn' onclick='graphCancelEdgeDel()'>" + tr("kb.dlg.close") + "</button></div>";
    p.innerHTML = eh;
    return;
  }
  var nd = graphSelNode();
  if (!nd) { ov.style.display = "none"; p.innerHTML = ""; return; }
  var html = "<div class='g-head'><span>" + esc(nd.icon || "") + " " + esc(nd.name) + (nd.locked ? " 🔒" : "") + "</span><button class='g-x' onclick='graphClosePanel()'>×</button></div>";
  html += "<div class='g-row'><label>" + tr("graph.name") + "</label><input class='g-input' value=\"" + esc(nd.name) + "\" oninput='graphRename(this.value)'></div>";
  html += "<div class='g-row'><label>" + tr("graph.desc") + "</label><textarea class='g-input' oninput='graphRedesc(this.value)'>" + esc(nd.desc || "") + "</textarea></div>";
  if (nd.kind === "decision") {
    html += "<div class='g-row'><label>" + tr("graph.branch_true") + "</label><input class='g-input' value=\"" + esc(nd.branchT || "true") + "\" onchange='graphSetBranch(\"T\", this.value)'></div>";
    html += "<div class='g-row'><label>" + tr("graph.branch_false") + "</label><input class='g-input' value=\"" + esc(nd.branchF || "false") + "\" onchange='graphSetBranch(\"F\", this.value)'></div>";
  }
  if (nd.kind === "trigger") {
    var t = graphTrigOf(nd);
    html += "<div class='g-row'><label>" + tr("graph.type") + "</label><select class='g-input' onchange='graphSetTrig(\"type\", this.value)'>";
    ["schedule", "manual", "webhook"].forEach(function (v) { html += "<option value='" + v + "'" + (t.type === v ? " selected" : "") + ">" + tr("graph.trig." + v) + "</option>"; });
    html += "</select></div>";
    if (t.type === "schedule") {
      html += "<div class='g-row'><label>" + tr("graph.freq") + "</label><select class='g-input' onchange='graphSetTrig(\"freq\", this.value)'>";
      ["once", "hourly", "daily", "weekly", "monthly", "yearly", "custom"].forEach(function (v) { html += "<option value='" + v + "'" + (t.freq === v ? " selected" : "") + ">" + tr("graph.freq." + v) + "</option>"; });
      html += "</select></div>";
      if (t.freq === "weekly") {
        html += "<div class='g-row'><label>" + tr("graph.days") + "</label><div class='g-days'>";
        for (var d = 0; d < 7; d++) html += "<button class='g-day" + (t.days.indexOf(d) >= 0 ? " on" : "") + "' onclick='graphToggleDay(" + d + ")'>" + "SMTWTFS"[d] + "</button>";
        html += "</div></div>";
      }
      if (t.freq === "once") html += "<div class='g-row'><label>" + tr("graph.date") + "</label><input class='g-input' type='date' value='" + esc(t.date) + "' onchange='graphSetTrig(\"date\", this.value)'></div>";
      if (t.freq === "monthly") html += "<div class='g-row'><label>" + tr("graph.date") + "</label><input class='g-input' type='number' min='1' max='31' value='" + t.monthDay + "' onchange='graphSetTrigNum(\"monthDay\", this.value)'></div>";
      if (t.freq === "yearly") {
        html += "<div class='g-row'><label>" + tr("graph.date") + "</label><div class='g-flex'><select class='g-input' onchange='graphSetTrigNum(\"month\", this.value)'>";
        MONTHS[getLang()].forEach(function (m, i) { html += "<option value='" + (i + 1) + "'" + (t.month === i + 1 ? " selected" : "") + ">" + m + "</option>"; });
        html += "</select><input class='g-input' type='number' min='1' max='31' value='" + t.day + "' onchange='graphSetTrigNum(\"day\", this.value)'></div></div>";
      }
      if (t.freq === "hourly") html += "<div class='g-row'><label>" + tr("graph.time") + "</label><input class='g-input' type='number' min='0' max='59' value='" + t.min + "' onchange='graphSetTrigNum(\"min\", this.value)'></div>";
      if (t.freq === "custom") html += "<div class='g-row'><label>" + tr("graph.cron") + "</label><input class='g-input' value=\"" + esc(t.cron) + "\" onchange='graphSetTrig(\"cron\", this.value)'></div>";
      if (t.freq !== "hourly" && t.freq !== "custom") {
        html += "<div class='g-row'><label>" + tr("graph.time") + "</label><div class='g-flex'><input class='g-input' type='number' min='1' max='12' value='" + t.hour + "' onchange='graphSetTrigNum(\"hour\", this.value)'><span>:</span><input class='g-input' type='number' min='0' max='59' value='" + t.min + "' onchange='graphSetTrigNum(\"min\", this.value)'><button class='g-ampm" + (t.ampm === "AM" ? " on" : "") + "' onclick='graphSetAmpm(\"AM\")'>AM</button><button class='g-ampm" + (t.ampm === "PM" ? " on" : "") + "' onclick='graphSetAmpm(\"PM\")'>PM</button></div></div>";
      }
      html += "<div class='g-sum'>" + esc(graphTrigSummary(t)) + "</div>";
      html += "<div class='g-next'>" + tr("graph.next") + ": <b>" + esc(graphNextText(t)) + "</b></div>";
      html += "<label class='g-check'><input type='checkbox'" + (t.active ? " checked" : "") + " onchange='graphSetTrigBool(\"active\", this.checked)'> " + tr("graph.active") + "</label>";
      html += "<div class='g-note'>" + tr("graph.note.open") + "</div>";
      if (t.freq === "custom") html += "<div class='g-note'>" + tr("graph.note.custom") + "</div>";
    } else if (t.type === "manual") {
      html += "<div class='g-note'>" + tr("graph.note.manual") + "</div>";
    } else {
      html += "<div class='g-note'>" + tr("graph.note.webhook") + "</div>";
    }
    html += "<button class='g-run' onclick='graphRunNow()'>" + tr("graph.run_now") + "</button>";
  }
  html += "<div class='g-actions'><button class='btn' onclick='graphDuplicate()'>" + tr("graph.dup") + "</button><button class='btn' onclick='graphToggleLock()'>" + (nd.locked ? tr("graph.unlock") : tr("graph.lock")) + "</button><button class='btn' onclick='graphAskDelete()'>" + tr("graph.del") + "</button></div>";
  if (graphDelAsk) html += "<div class='g-delask'>" + tr("graph.del_ask") + " <button class='btn' onclick='graphConfirmDelete()'>" + tr("graph.del_yes") + "</button> <button class='btn' onclick='graphCancelDelete()'>" + tr("graph.del_no") + "</button></div>";
  p.innerHTML = html;
}

export function graphRename(v) { var nd = graphSelNode(); if (!nd) return; nd.name = v; saveGraphState(); renderGraph(); }
export function graphRedesc(v) { var nd = graphSelNode(); if (!nd) return; nd.desc = v; saveGraphState(); }
export function graphSetBranch(side, v) { var nd = graphSelNode(); if (!nd) return; if (side === "T") nd.branchT = v; else nd.branchF = v; saveGraphState(); renderGraph(); renderGraphPanel(); }
function graphTrigSync(nd) { var t = graphTrigOf(nd); nd.sub = graphTrigSummary(t); }
export function graphSetTrig(field, v) { var nd = graphSelNode(); if (!nd || nd.kind !== "trigger") return; graphTrigOf(nd)[field] = v; graphTrigSync(nd); saveGraphState(); renderGraph(); renderGraphPanel(); }
export function graphSetTrigNum(field, v) {
  var nd = graphSelNode(); if (!nd || nd.kind !== "trigger") return;
  var n = parseInt(v, 10); if (isNaN(n)) return;
  var max = field === "hour" ? 12 : field === "min" ? 59 : field === "month" ? 12 : 31;
  var min = (field === "monthDay" || field === "day" || field === "hour" || field === "month") ? 1 : 0;
  graphTrigOf(nd)[field] = Math.max(min, Math.min(max, n));
  graphTrigSync(nd); saveGraphState(); renderGraph(); renderGraphPanel();
}
export function graphSetTrigBool(field, v) { var nd = graphSelNode(); if (!nd || nd.kind !== "trigger") return; graphTrigOf(nd)[field] = !!v; saveGraphState(); renderGraph(); renderGraphPanel(); }
export function graphSetAmpm(v) { var nd = graphSelNode(); if (!nd || nd.kind !== "trigger") return; graphTrigOf(nd).ampm = v; graphTrigSync(nd); saveGraphState(); renderGraph(); renderGraphPanel(); }
export function graphToggleDay(d) {
  var nd = graphSelNode(); if (!nd || nd.kind !== "trigger") return;
  var t = graphTrigOf(nd);
  var i = t.days.indexOf(d);
  if (i >= 0) { if (t.days.length > 1) t.days.splice(i, 1); }
  else t.days.push(d);
  t.days.sort(function (a, b) { return a - b; });
  graphTrigSync(nd); saveGraphState(); renderGraph(); renderGraphPanel();
}
export function graphRunNow() { runGraphSim("manual"); }
export function graphDuplicate() {
  var nd = graphSelNode(); if (!nd) return;
  nodeCounter++;
  var nk = "baru" + nodeCounter;
  var copy = JSON.parse(JSON.stringify(nd));
  copy.name = (nd.name || "Node") + " (salinan)";
  copy.x = Math.min(90, (copy.x || 10) + 6);
  copy.y = Math.min(84, (copy.y || 10) + 12);
  if (copy.kind === "trigger" && copy.trig) copy.trig.active = false;
  GNODES[nk] = copy;
  saveGraphState();
  graphSelect(nk);
  var n = document.getElementById("graphNotice"); if (n) { n.style.display = "block"; n.textContent = tr("graph.node_added"); }
}
export function graphToggleLock() { var nd = graphSelNode(); if (!nd) return; nd.locked = !nd.locked; saveGraphState(); renderGraph(); renderGraphPanel(); }
export function graphAskDelete() { if (graphSel && GNODES[graphSel]) graphPopupOpen = true; graphDelAsk = true; renderGraphPanel(); }
export function graphCancelDelete() { graphDelAsk = false; renderGraphPanel(); }
export function graphConfirmDelete() {
  if (!graphSel || !GNODES[graphSel]) return;
  var key = graphSel;
  delete GNODES[key];
  for (var i = GEDGES.length - 1; i >= 0; i--) { if (GEDGES[i].f === key || GEDGES[i].t === key) GEDGES.splice(i, 1); }
  graphSel = null; graphDelAsk = false; graphPopupOpen = false;
  saveGraphState(); renderGraph(); renderGraphPanel();
  var n = document.getElementById("graphNotice"); if (n) { n.style.display = "block"; n.textContent = tr("graph.node_deleted"); }
}
export function graphAddNode() {
  if (graphSel && GNODES[graphSel]) { addNodeAfter(graphSel); return; }
  nodeCounter++;
  var nk = "baru" + nodeCounter;
  GNODES[nk] = { name: "Node Baru " + nodeCounter, sub: "simulasi", icon: "＋", x: 45, y: 45, w: 150, kind: "output", desc: "Node baru dari toolbar + Add node." };
  saveGraphState();
  graphSelect(nk);
  var n = document.getElementById("graphNotice"); if (n) { n.style.display = "block"; n.textContent = tr("graph.node_added"); }
}

function graphRunsGet() { try { return JSON.parse(localStorage.getItem("minime.graphRuns") || "[]"); } catch (_) { return []; } }
function graphRunsAdd(kind) {
  var r = graphRunsGet();
  r.unshift({ at: new Date().toISOString(), kind: kind });
  r = r.slice(0, 50);
  try { localStorage.setItem("minime.graphRuns", JSON.stringify(r)); } catch (_) {}
  renderGraphHist();
}
export function graphToggleHist() { graphHistOn = !graphHistOn; renderGraphHist(); }
export function renderGraphHist() {
  var el = document.getElementById("graphHist"); if (!el) return;
  var badge = document.getElementById("graphHistBadge");
  var runs = graphRunsGet();
  if (badge) badge.textContent = runs.length ? String(runs.length) : "";
  if (!graphHistOn) { el.style.display = "none"; return; }
  el.style.display = "block";
  if (!runs.length) { el.innerHTML = "<div class='g-hist-empty'>" + tr("graph.hist_empty") + "</div>"; return; }
  el.innerHTML = runs.slice(0, 10).map(function (r) {
    var d = new Date(r.at);
    return "<div class='g-hist-row'>" + d.toLocaleString(graphLocale(), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) + " — " + tr("graph.hist_run") + " (" + esc(r.kind) + ")</div>";
  }).join("");
}
export function initGraphScheduler() {
  if (graphTimer) return;
  graphLastCheck = new Date();
  graphTimer = setInterval(function () {
    if (graphRunning) return;
    var now = new Date(), due = false;
    Object.keys(GNODES).forEach(function (k) {
      var nd = GNODES[k];
      if (nd.kind !== "trigger") return;
      var t = graphTrigOf(nd);
      if (t.type !== "schedule" || !t.active) return;
      if (t.freq === "once") {
        if (!t.firedOnce) { var oc = graphPrevRun(t, now); if (oc && oc > graphLastCheck && oc <= now) { t.firedOnce = true; due = true; } }
        return;
      }
      var prev = graphPrevRun(t, now);
      if (prev && prev > graphLastCheck && prev <= now) due = true;
    });
    graphLastCheck = now;
    if (due) { saveGraphState(); runGraphSim("auto"); }
  }, 30000);
}
export function graphZoomSet(z) {
  graphZoom = Math.max(0.5, Math.min(2, z));
  var el = document.getElementById("graphZoom"); if (el) el.style.transform = "scale(" + graphZoom + ")";
  var lab = document.getElementById("graphZoomLabel"); if (lab) lab.textContent = Math.round(graphZoom * 100) + "%";
}
export function graphZoomIn() { graphZoomSet(graphZoom + 0.25); }
export function graphZoomOut() { graphZoomSet(graphZoom - 0.25); }
export function graphFullscreen() { var el = document.getElementById("graphBox"); if (el && el.requestFullscreen) { try { el.requestFullscreen(); } catch (_) {} } }

/* ---------- Audit menu v78: chat, detail, search, kanban, graph, settings ---------- */
var waAttachments = [], waCamStream = null, waRec = null, waRecChunks = [], waAttErr = "";
var detailModelOpen = false, detailEffortOpen = false, detailMemOpen = false, detailFilesOpen = false;
var kbDlgIdx = null, kbDlgMode = null, kbDelAsk = false, kbDownPos = null;
var graphSelEdge = null, graphEdgeDelAsk = false, graphSimTimer = null;

function waNoteEl() { return document.getElementById("waNote"); }
function waRenderChips() {
  var n = waNoteEl(); if (!n) return;
  var chips = waAttachments.map(function (a, i) { return "<span class='wa-chip'>" + esc(a.name) + " <button onclick='waRemoveAtt(" + i + ")'>×</button></span>"; }).join(" ");
  var err = waAttErr ? "<div class='wa-err'>" + esc(waAttErr) + "</div>" : "";
  var cam = document.getElementById("waCamBox") ? document.getElementById("waCamBox").outerHTML : "";
  var rec = document.getElementById("waRecBox") ? document.getElementById("waRecBox").outerHTML : "";
  if (!waAttachments.length && !err && !cam && !rec && !waCamStream && !waRec) { n.style.display = "none"; n.innerHTML = ""; return; }
  n.style.display = "block";
  n.innerHTML = "<div id='waChips'>" + chips + "</div>" + err + "<div id='waCamBox'>" + (document.getElementById("waCamBox") ? document.getElementById("waCamBox").innerHTML : "") + "</div><div id='waRecBox'>" + (document.getElementById("waRecBox") ? document.getElementById("waRecBox").innerHTML : "") + "</div>";
}
export function waRemoveAtt(i) { waAttachments.splice(i, 1); waRenderChips(); }
function waAddMeta(name, size, kind) {
  waAttErr = "";
  if (size > 5 * 1024 * 1024) { waAttErr = tr("att.too_big"); waRenderChips(); return; }
  waAttachments.push({ name: name, size: size, kind: kind });
  waRenderChips();
}
function waPickFile(accept, fn) {
  var inp = document.createElement("input");
  inp.type = "file"; inp.style.display = "none"; inp.accept = accept || "";
  inp.addEventListener("change", function () { var f = inp.files && inp.files[0]; if (f) fn(f); if (inp.parentNode) inp.parentNode.removeChild(inp); });
  document.body.appendChild(inp);
  inp.click();
}
function waStopCam() { try { if (waCamStream) waCamStream.getTracks().forEach(function (t) { t.stop(); }); } catch (_) {} waCamStream = null; }
export function waApplyAttachments() {
  var inp = document.getElementById("chatInput");
  if (!inp || !waAttachments.length) return;
  var names = waAttachments.map(function (a) { return a.name; }).join(", ");
  inp.value = (inp.value ? inp.value + " " : "") + "[" + tr("att.prefix") + ": " + names + "]";
}
export function waClearAttachments() { waAttachments = []; waStopCam(); waRenderChips(); }
export function waCamShot() {
  var v = document.getElementById("waCamVideo");
  if (!v) return;
  try {
    var c = document.createElement("canvas");
    c.width = v.videoWidth || 640; c.height = v.videoHeight || 480;
    c.getContext("2d").drawImage(v, 0, 0);
    c.toDataURL("image/jpeg", 0.85);
    waAddMeta("Kamera-" + Date.now() + ".jpg", 200000, "camera");
  } catch (_) {}
  waStopCam();
  var box = document.getElementById("waCamBox"); if (box) box.innerHTML = "";
  waRenderChips();
}
export function waRecToggle() {
  var box = document.getElementById("waRecBox"); if (!box) return;
  if (waRec) {
    try { waRec.stop(); } catch (_) {}
    return;
  }
  try {
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
      waRecChunks = [];
      waRec = new MediaRecorder(stream);
      waRec.ondataavailable = function (e) { if (e.data && e.data.size) waRecChunks.push(e.data); };
      waRec.onstop = function () {
        try { stream.getTracks().forEach(function (t) { t.stop(); }); } catch (_) {}
        var blob = new Blob(waRecChunks, { type: "audio/webm" });
        waRec = null;
        waAddMeta("Audio-" + Date.now() + ".webm", blob.size, "audio");
        var b2 = document.getElementById("waRecBox"); if (b2) b2.innerHTML = "";
        waRenderChips();
      };
      waRec.start();
      box.innerHTML = "<span>" + tr("att.recording") + "</span> <button onclick='waRecToggle()'>" + tr("att.rec_stop") + "</button>";
    }).catch(function () { box.innerHTML = esc(tr("att.mic_unavail")); waPickFile("audio/*", function (f) { waAddMeta(f.name, f.size, "audio"); }); });
  } catch (_) { box.innerHTML = esc(tr("att.mic_unavail")); }
}

function memLoad() { try { return JSON.parse(localStorage.getItem("minime.agentMemories") || "{}"); } catch (_) { return {}; } }
function memSave(o) { try { localStorage.setItem("minime.agentMemories", JSON.stringify(o)); } catch (_) {} }
function fileLoad() { try { return JSON.parse(localStorage.getItem("minime.agentFiles") || "{}"); } catch (_) { return {}; } }
function fileSave(o) { try { localStorage.setItem("minime.agentFiles", JSON.stringify(o)); } catch (_) {} }
export function detailModelToggle() { detailModelOpen = !detailModelOpen; renderDetail(); }
export function detailModelSet(v) { var ag = AGENTS[selectedAgent]; if (!ag) return; ag.model = v; detailModelOpen = false; saveHomeState(); renderDetail(); }
export function detailEffortToggle() { detailEffortOpen = !detailEffortOpen; renderDetail(); }
export function detailEffortSet(v) { var ag = AGENTS[selectedAgent]; if (!ag) return; ag.effort = v; detailEffortOpen = false; saveHomeState(); renderDetail(); }
export function detailSkillToggle(s, on) {
  var ag = AGENTS[selectedAgent]; if (!ag) return;
  var off = ag.skillsOff || (ag.skillsOff = []);
  var i = off.indexOf(s);
  if (on && i >= 0) off.splice(i, 1);
  if (!on && i < 0) off.push(s);
  saveHomeState();
}
export function detailMemToggle() { detailMemOpen = !detailMemOpen; renderDetail(); }
export function detailMemAdd() {
  var ta = document.getElementById("memNew"); if (!ta) return;
  var v = ta.value.trim(); if (!v) return;
  var o = memLoad(); var list = o[selectedAgent] || (o[selectedAgent] = []);
  list.push(v); memSave(o); renderDetail();
}
export function detailMemDel(i) { var o = memLoad(); var list = o[selectedAgent] || []; list.splice(i, 1); o[selectedAgent] = list; memSave(o); renderDetail(); }
export function detailFilesToggle() { detailFilesOpen = !detailFilesOpen; renderDetail(); }
export function detailFilesPick() { waPickFile("", function (f) { detailFilesAddFiles([f]); }); }
export function detailFilesAddFiles(list) {
  var o = fileLoad(); var arr = o[selectedAgent] || (o[selectedAgent] = []);
  for (var i = 0; i < list.length; i++) arr.push({ name: list[i].name, size: list[i].size || 0 });
  fileSave(o); renderDetail();
}
export function detailFilesDel(i) { var o = fileLoad(); var arr = o[selectedAgent] || []; arr.splice(i, 1); o[selectedAgent] = arr; fileSave(o); renderDetail(); }
export function detailAvatarPick() {
  waPickFile("image/*", function (f) {
    if (f.size > 1024 * 1024) { detailNote(tr("detail.avatar.big")); return; }
    var r = new FileReader();
    r.onload = function () {
      var img = new Image();
      img.onload = function () {
        var url = String(r.result || "");
        try {
          var c = document.createElement("canvas");
          var s = Math.min(img.width, img.height) || 96, sx = (img.width - s) / 2, sy = (img.height - s) / 2;
          c.width = 96; c.height = 96;
          c.getContext("2d").drawImage(img, sx, sy, s, s, 0, 0, 96, 96);
          url = c.toDataURL("image/jpeg", 0.85);
        } catch (_) {}
        AGENTS[selectedAgent].avatar = url; saveHomeState(); renderAgents(); renderDetail();
      };
      img.src = String(r.result || "");
    };
    r.readAsDataURL(f);
  });
}

export function searchJump(i) {
  var chat = PROJECTS[currentProj] ? PROJECTS[currentProj].chat : [];
  if (!chat[i]) return;
  showView("home");
  renderChat();
  var el = document.querySelector('#chatBox .msg[data-idx="' + i + '"]');
  if (el) { el.classList.add("hl"); try { el.scrollIntoView({ block: "center" }); } catch (_) {} }
}

function kbCards() { return PROJECTS[currentProj] ? (PROJECTS[currentProj].kanban || []) : []; }
function kbTeam() { var p = PROJECTS[currentProj]; if (!p) return []; if (!p.team) p.team = p.agents.map(function (a) { return a.key; }); return p.team; }
export function kbOpen(i) { kbDlgIdx = i; kbDlgMode = "card"; kbDelAsk = false; kbRenderDlg(); }
export function kbClose() { kbDlgIdx = null; kbDlgMode = null; kbDelAsk = false; kbRenderDlg(); }
export function kbRenderDlg() {
  var box = document.getElementById("kbDlg"); if (!box) return;
  if (!kbDlgMode) { box.style.display = "none"; box.innerHTML = ""; return; }
  box.style.display = "block";
  if (kbDlgMode === "team") {
    var team = kbTeam();
    var rows = Object.keys(AGENTS).map(function (k) {
      return "<label class='kb-teamrow'><input type='checkbox' data-teamkey='" + esc(k) + "'" + (team.indexOf(k) >= 0 ? " checked" : "") + "> " + esc(AGENTS[k].name) + "</label>";
    }).join("");
    box.innerHTML = "<div class='kb-dlg'><h4>" + tr("kb.team.title") + "</h4><p>" + tr("kb.team.note") + "</p>" + rows
      + "<div class='kb-dlg-btns'><button class='btn btn-primary' onclick='kbTeamSave()'>" + tr("kb.team.save") + "</button> <button class='btn' onclick='kbClose()'>" + tr("kb.dlg.close") + "</button></div></div>";
    return;
  }
  var cards = kbCards(), card = cards[kbDlgIdx];
  if (!card) { kbClose(); return; }
  var agOpts = "";
  var seen = {};
  (PROJECTS[currentProj].agents || []).forEach(function (a) { if (AGENTS[a.key]) { seen[a.key] = true; agOpts += "<option" + (card.a === AGENTS[a.key].name ? " selected" : "") + ">" + esc(AGENTS[a.key].name) + "</option>"; } });
  if (!seen[agentKeyByName(card.a)]) agOpts += "<option selected>" + esc(card.a) + "</option>";
  var colOpts = "";
  var total = kcols().length + extraCols.length;
  for (var ci = 0; ci < total; ci++) colOpts += "<option value='" + ci + "'" + (card.c === ci ? " selected" : "") + ">" + esc(colName(ci)) + "</option>";
  var comments = (card.comments || []).map(function (c) { return "<div class='kb-comment'>" + esc(c.text) + "</div>"; }).join("") || "<p>" + tr("detail.mem.empty") + "</p>";
  var html = "<div class='kb-dlg'><h4>" + tr("kb.dlg.title") + "</h4>"
    + "<label>" + tr("kb.dlg.title_label") + "</label><input id='kbDlgTitle' class='g-input' value=\"" + esc(card.t) + "\">"
    + "<label>" + tr("kb.dlg.agent") + "</label><select id='kbDlgAgent' class='g-input'>" + agOpts + "</select>"
    + "<label>" + tr("kb.dlg.col") + "</label><select id='kbDlgCol' class='g-input'>" + colOpts + "</select>"
    + "<div class='kb-dlg-btns'><button class='btn btn-primary' onclick='kbSave()'>" + tr("kb.dlg.save") + "</button> "
    + (card.c === 2 ? "<button class='btn' onclick='kbApprove()'>" + tr("kb.dlg.approve") + "</button> " : "")
    + "<button class='btn' onclick='kbAskDel()'>" + tr("kb.dlg.delete") + "</button> <button class='btn' onclick='kbClose()'>" + tr("kb.dlg.close") + "</button></div>";
  if (kbDelAsk) html += "<div class='g-delask'>" + tr("kb.dlg.del_ask") + " <button class='btn' onclick='kbDel()'>" + tr("kb.dlg.delete") + "</button> <button class='btn' onclick='kbClose()'>" + tr("kb.dlg.close") + "</button></div>";
  html += "<h4>" + tr("kb.dlg.comments") + " (" + (card.comments || []).length + ")</h4>" + comments
    + "<div class='g-flex'><input id='kbDlgComment' class='g-input' placeholder=\"" + esc(tr("kb.dlg.comment_ph")) + "\"> <button class='btn btn-primary' onclick='kbAddComment()'>" + tr("kb.dlg.comment_add") + "</button></div></div>";
  box.innerHTML = html;
}
export function kbSave() {
  var cards = kbCards(), card = cards[kbDlgIdx]; if (!card) return;
  var t = document.getElementById("kbDlgTitle"), a = document.getElementById("kbDlgAgent"), c = document.getElementById("kbDlgCol");
  if (t && t.value.trim()) card.t = t.value.trim();
  if (a) card.a = a.value;
  if (c) card.c = parseInt(c.value, 10) || 0;
  renderKanban(); kbClose();
}
export function kbAskDel() { kbDelAsk = true; kbRenderDlg(); }
export function kbDel() { var cards = kbCards(); if (kbDlgIdx !== null) cards.splice(kbDlgIdx, 1); renderKanban(); kbClose(); }
export function kbApprove() { var card = kbCards()[kbDlgIdx]; if (!card) return; card.c = 4; renderKanban(); kbClose(); }
export function kbAddComment() {
  var inp = document.getElementById("kbDlgComment"); if (!inp) return;
  var v = inp.value.trim(); if (!v) return;
  var card = kbCards()[kbDlgIdx]; if (!card) return;
  (card.comments || (card.comments = [])).push({ text: v, at: Date.now() });
  renderKanban(); kbRenderDlg();
}
export function kbTeamOpen() { kbDlgMode = "team"; kbDelAsk = false; kbRenderDlg(); }
export function kbTeamSave() {
  var keys = [];
  document.querySelectorAll("[data-teamkey]").forEach(function (el) { if (el.checked) keys.push(el.getAttribute("data-teamkey")); });
  PROJECTS[currentProj].team = keys;
  renderKanban(); kbClose();
}

export function graphStopSim() {
  if (!graphRunning) return;
  if (graphSimTimer) { clearTimeout(graphSimTimer); graphSimTimer = null; }
  graphRunning = false;
  document.querySelectorAll(".n8n-node").forEach(function (el) { el.classList.remove("exec"); });
  var n = document.getElementById("graphNotice");
  if (n) { n.style.display = "block"; n.textContent = tr("graph.stopped"); }
}
export function graphSelectEdge(f, t) { graphSelEdge = { f: f, t: t }; graphSel = null; graphPopupOpen = true; graphDelAsk = false; graphEdgeDelAsk = false; renderGraph(); renderGraphPanel(); }
export function graphConfirmEdgeDel() {
  if (!graphSelEdge) return;
  var f = graphSelEdge.f, t = graphSelEdge.t;
  for (var i = GEDGES.length - 1; i >= 0; i--) { if (GEDGES[i].f === f && GEDGES[i].t === t) GEDGES.splice(i, 1); }
  graphSelEdge = null; graphEdgeDelAsk = false; graphPopupOpen = false;
  saveGraphState(); renderGraph(); renderGraphPanel();
  var n = document.getElementById("graphNotice"); if (n) { n.style.display = "block"; n.textContent = tr("graph.edge.deleted"); }
}

export function saveSettings() {
  var fields = [];
  var g = document.getElementById("apiKeyGemini"), m = document.getElementById("apiKeyMeta"), o = document.getElementById("ollamaUrl");
  try {
    if (g && g.value) { localStorage.setItem("minime.geminiKey", g.value); fields.push("Gemini"); }
    if (m && m.value) { localStorage.setItem("minime.metaKey", m.value); fields.push("Meta"); }
    if (o && o.value) { localStorage.setItem("minime.ollamaUrl", o.value); fields.push("Ollama"); }
  } catch (_) {}
  var n = document.getElementById("setNotice");
  if (n) { n.style.display = "block"; n.textContent = fields.length ? tr("set.save.done", { fields: fields.join(", ") }) : tr("set.save.none"); }
}
function detailModelOpts(ag) {
  var labels = ["meta", "gemini", "deepseek", "qwen"].map(function (m) { return naModelLabel(m); });
  var opts = "<option value=''>" + esc(tr("detail.model.default")) + "</option>";
  labels.forEach(function (l) { opts += "<option value=\"" + esc(l) + "\"" + (ag.model === l ? " selected" : "") + ">" + esc(l) + "</option>"; });
  if (ag.model && labels.indexOf(ag.model) < 0) opts += "<option value=\"" + esc(ag.model) + "\" selected>" + esc(ag.model) + "</option>";
  return opts;
}
function detailEffortOpts(ag) {
  var vals = [["Low", "na.effort_low"], ["Medium", "na.effort_medium"], ["High", "na.effort_high"], ["Extra high", "na.effort_extra"], ["Max", "na.effort_max"]];
  return vals.map(function (v) { return "<option value='" + v[0] + "'" + ((ag.effort || "Low") === v[0] ? " selected" : "") + ">" + tr(v[1]) + "</option>"; }).join("");
}
function detailMemSection() {
  var list = (memLoad()[selectedAgent] || []);
  var rows = list.map(function (t, i) { return "<div class='d-memrow'><span>" + esc(t) + "</span> <button class='btn btn-sm' onclick='detailMemDel(" + i + ")'>" + tr("detail.mem.del") + "</button></div>"; }).join("") || "<p>" + tr("detail.mem.empty") + "</p>";
  return "<div class='d-label'>" + tr("detail.memories") + "</div><div class='d-rows'>" + rows + "<textarea id='memNew' class='d-field d-area' placeholder=\"" + esc(tr("detail.mem.ph")) + "\"></textarea><button class='btn btn-primary' onclick='detailMemAdd()'>" + tr("detail.mem.add") + "</button></div>";
}
function detailFilesSection() {
  var list = (fileLoad()[selectedAgent] || []);
  var rows = list.map(function (f, i) { return "<div class='d-memrow'><span>" + esc(f.name) + " (" + f.size + " B)</span> <button class='btn btn-sm' onclick='detailFilesDel(" + i + ")'>" + tr("detail.mem.del") + "</button></div>"; }).join("") || "<p>" + tr("detail.files.empty") + "</p>";
  return "<div class='d-label'>" + tr("detail.files") + "</div><div class='d-rows'>" + rows + "<button class='btn btn-primary' onclick='detailFilesPick()'>" + tr("detail.files.add") + "</button></div>";
}
export function graphAskEdgeDel() { graphEdgeDelAsk = true; renderGraphPanel(); }
export function graphCancelEdgeDel() { graphEdgeDelAsk = false; renderGraphPanel(); }

export function ollamaCheck() {
  var inp = document.getElementById("ollamaUrl"), note = document.getElementById("ollamaNote");
  var url = (inp && inp.value ? inp.value : "http://127.0.0.1:11434").replace(/\/$/, "");
  if (inp) inp.value = url;
  fetch(url + "/api/tags").then(function (r) { return r.json(); }).then(function (j) {
    var n = (j && j.models) ? j.models.length : 0;
    try { localStorage.setItem("minime.ollamaUrl", url); } catch (_) {}
    if (note) { note.textContent = tr("set.ollama.ok", { n: n }); }
  }).catch(function () { if (note) note.textContent = tr("set.ollama.fail"); });
}

/* ---------- Library ---------- */
var LIB_ADDED = loadLibAdded();
var LIB = [];

/* ---------- Media Studio ---------- */


var _ra2 = renderAgents;

var viewHist = ['home'], viewHistIdx = 0, navJump = false;

var _sv2 = showView;

var _sa2 = selectAgent;


/* v84: migrasi sekali jalan — backup simpanan lama, lalu HAPUS SEMUA proyek
   tersimpan (seed + buatan user) + Kanban per-proyek + Library tambahan,
   sesuai perintah "hapus semua, mulai nol". Agen roster, alur Graph, dan
   data Campaign tidak disentuh. Berjalan sebelum loadKanban/loadHomeState. */
function runCleanV84() {
  try {
    if (window.localStorage.getItem('minime.cleaned-v84')) return;
    var raw = null; try { raw = window.localStorage.getItem('minime.homeState'); } catch (_) {}
    if (raw) {
      try { window.localStorage.setItem('minime.homeState.pre-v84', raw); } catch (_) {}
      try { var st = JSON.parse(raw); if (st && typeof st === 'object') { st.projects = {}; st.currentProj = null; window.localStorage.setItem('minime.homeState', JSON.stringify(st)); } } catch (_) {}
    }
    try { var lb = window.localStorage.getItem('minime.library.added'); if (lb) window.localStorage.setItem('minime.library.added.pre-v84', lb); } catch (_) {}
    try { window.localStorage.setItem('minime.library.added', '[]'); } catch (_) {}
    try { LIB_ADDED = []; } catch (_) {}
    try { var kb = window.localStorage.getItem('minime.kanban'); if (kb) window.localStorage.setItem('minime.kanban.pre-v84', kb); } catch (_) {}
    try { window.localStorage.setItem('minime.kanban', JSON.stringify({ v: 2, cards: {}, team: {}, extraCols: [] })); } catch (_) {}
    try { window.localStorage.setItem('minime.cleaned-v84', '1'); } catch (_) {}
  } catch (_) {}
}
export function initV5() {
  runCleanV84();
  // Penjadwal native (v61): timer antrean mulai sekali saat app hidup.
  initSocialScheduler();
  // v77: penjadwal trigger Graph (hanya selama app terbuka).
  initGraphScheduler();
  // Audit v66 L-B1: Kanban tersimpan dimuat sebelum render pertama.
  loadKanban();
  // v76: agen/proyek kustom + pilihan terakhir dimuat sebelum render pertama.
  loadHomeState();
  // v77: node Graph + setting trigger dimuat sebelum render pertama.
  loadGraphState();
  document.addEventListener("mousemove", function (e) {
      if (!dragNode) return;
      var box = graphZoomEl().getBoundingClientRect();
      if (dragStart && Math.abs(e.clientX - dragStart.x) + Math.abs(e.clientY - dragStart.y) > 5) dragMoved = true;
      var nx = (e.clientX - box.left) / box.width * 100 - grabDX;
      var ny = (e.clientY - box.top) / box.height * 100 - grabDY;
      GNODES[dragNode].x = Math.max(1, Math.min(90, nx));
      GNODES[dragNode].y = Math.max(1, Math.min(84, ny));
      renderGraph();
    });
  document.addEventListener("mouseup", function () { if (dragNode && dragMoved) saveGraphState(); dragNode = null; });
  var gb = document.getElementById("graphBox");
  if (gb) gb.addEventListener("click", function (e) { if (e.target.closest && e.target.closest(".n8n-node")) return; graphClosePanel(); });
  document.querySelectorAll(".sidebar button").forEach(function (b) {
      b.addEventListener("click", function () { showView(b.getAttribute("data-view")); });
    });
  makeResizer("resizeAgent", "agentCol", 180, 420);
  makeResizer("resizeDetail", "detailCol", 220, 420);
  ["agentCol", "detailCol"].forEach(function (id) { try { var w = localStorage.getItem("minime.colW." + id); var el = document.getElementById(id); if (w && el && /^\d+px$/.test(w)) el.style.width = w; } catch (_) {} });
  renderAgents();
  renderDetail();
  renderChat();
  renderKanban();
  renderGraph();
  renderGraphHist();
  renderLib();
  renderPlanner();
  (function () {
    document.querySelectorAll('[data-kbtab]').forEach(function (b) {
      b.addEventListener('click', function () {
        kanbanTab = b.getAttribute('data-kbtab');
        document.querySelectorAll('[data-kbtab]').forEach(function (x) { x.classList.toggle('active', x === b); });
        renderKanban();
      });
    });
  })();
  document.getElementById('chatInput').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); sendChat(); }
    });
  (function () {
      var _sc = sendChat;
      sendChat = function () { waApplyAttachments(); _sc(); waClearAttachments(); waInputChanged(); };
    })();
  renderAgents = function () { _ra2(); renderAddMenu(); };
  showView = function (id) {
      if (!navJump) { viewHist = viewHist.slice(0, viewHistIdx + 1); if (viewHist[viewHistIdx] !== id) { viewHist.push(id); viewHistIdx++; } }
      _sv2(id);
    };
  renderAgents();
  selectAgent = function (k, pid) { _sa2(k, pid); var inp = document.getElementById('chatInput'); if (inp) inp.placeholder = 'Message ' + AGENTS[k].name; };
  waInputChanged();
  var ou = document.getElementById("ollamaUrl");
  if (ou) { try { ou.value = localStorage.getItem("minime.ollamaUrl") || "http://127.0.0.1:11434"; } catch (_) { ou.value = "http://127.0.0.1:11434"; } }
  Object.assign(window, { AGENTS, GEDGES, GNODES, kcols, LIB, LIB_ADDED, PROJECTS, _ra2, _sa2, _sv2, activateAgent, addKanbanList, addNodeAfter, agentKeyByName, campaignTab, cardComments, colColor, colName, currentProj, curvePath, detailNote, doSearch, dragCard, dragMoved, dragNode, dragStart, extraCols, filterAgents, homeNotifyToggle, grabDX, loadHomeState, naCancel, naCreate, naEffort, naHelpInput, naModelFilter, naModelToggle, naNameInput, naPickColor, naPickModel, naPickShape, naSuggest, ncClose, ncCreate, ncFilter, ncToggle, ncUpdateCreate, nsConfirm, plusNewAgent, plusNewChannel, plusNewSection, saveHomeState, grabDY, graphRunning, graphSelect, graphClosePanel, renderGraphPanel, graphRename, graphRedesc, graphSetBranch, graphSetTrig, graphSetTrigNum, graphSetTrigBool, graphSetAmpm, graphToggleDay, graphRunNow, graphDuplicate, graphToggleLock, graphAskDelete, graphCancelDelete, graphConfirmDelete, graphAddNode, graphToggleHist, renderGraphHist, initGraphScheduler, graphZoomSet, graphZoomIn, graphZoomOut, graphFullscreen, saveGraphState, loadGraphState, graphNextRun, graphPrevRun, graphTrigSummary, graphNextText, isAgentDeactivated, kanbanTab, libAddImage, libAddScript, libAll, libConfirmClose, libConfirmDelete, libDelete, libDetail, libDetailClose, libMedia, libRevise, libSetFilter, makeResizer, mediaBadge, mediaTab, navJump, nodeCounter, nodeRects, postChat, renameAgent, renderAddMenu, renderAgents, renderCampaign, renderChat, renderDetail, renderGraph, renderKanban, renderLib, renderPlanner, retitleAgent, socNextRepeat, runGraphSim, selectAgent, selectedAgent, sendChat, setInstructions, showView, switchProject, toggleAddMenu, toggleAgent, toggleGroup, toggleSkillList, viewBack, viewForward, viewHist, viewHistIdx, waAttach, waInputChanged, waMic, waToggleAttach, waRemoveAtt, waApplyAttachments, waClearAttachments, waCamShot, waRecToggle, detailModelToggle, detailModelSet, detailEffortToggle, detailEffortSet, detailSkillToggle, detailMemToggle, detailMemAdd, detailMemDel, detailFilesToggle, detailFilesPick, detailFilesAddFiles, detailFilesDel, detailAvatarPick, searchJump, kbOpen, kbClose, kbRenderDlg, kbSave, kbAskDel, kbDel, kbApprove, kbAddComment, kbTeamOpen, kbTeamSave, graphStopSim, graphSelectEdge, graphAskEdgeDel, graphCancelEdgeDel, graphConfirmEdgeDel, saveSettings, ollamaCheck, cpAddLead, cpDelAdded, cpLeadDetail, cpLeadClose, cpLeadSaveStage, cpCopyDraft, cpFuAdd, cpFuToggle, cpFuDel });
}
