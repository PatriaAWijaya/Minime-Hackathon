// Mechanical migration of prototype-v5/index.html <script> blocks.
// Logic is UNCHANGED: declarations kept at module level, executable
// top-level statements moved into initV5() in original order.
// initV5() must run after mount (DOM ready); it ends by exposing
// every top-level name on window, as the original page had them
// as globals (runtime-generated innerHTML handlers need this).

// B4: Kanban (TEST Kopi) + Planner now come from real artifacts via
// backend-data.js; the dummy literals below were replaced, not kept.
import { campaignCounts, campaignDrafts, campaignLeads, campaignPipeline, kopiKanban, plannerReal } from './backend-data.js';
import { tr } from './i18n.js';

/* ---------- Agen ---------- */
export function renderAgents() {
    var html = "", rowNo = -1;
    Object.keys(PROJECTS).forEach(function (pid) {
      var proj = PROJECTS[pid];
      var collapsed = !!collapsedGroups[pid];
      html += '<div class="group" onclick="toggleGroup(\'' + pid + '\')">' + (collapsed ? '▸' : '▾') + ' ' + proj.name + (pid === currentProj ? ' • PROYEK AKTIF' : '') + '</div>';
      html += '<div class="gagents" data-pid="' + pid + '"' + (collapsed ? ' style="display:none"' : '') + '>';
      proj.agents.forEach(function (a, i) {
        var ag = AGENTS[a.key], off = a.status === "Nonaktif";
        rowNo++;
        var times = ["2:32 PM", "1:47 PM", "12:05 PM", "11:20 AM", "10:02 AM", "9:15 AM", "8:40 AM", "7:55 AM"];
        html += '<div class="agent ' + (selectedAgent === a.key && pid === currentProj ? 'sel' : '') + (off ? ' off' : '') + (pid === currentProj ? ' curproj' : '') + '" onclick="selectAgent(\'' + a.key + '\',\'' + pid + '\')">'
          + '<div class="av" style="background:' + ag.color + '">' + ag.name.charAt(0) + '</div>'
          + '<div class="meta"><b>' + ag.name + '</b> <span class="badge ' + (off ? 'b-no' : 'b-ok') + '">' + a.status + '</span><br><small>' + a.task + '</small></div>'
          + (ag.always ? '' : '<button class="toggle" onclick="event.stopPropagation();toggleAgent(' + i + ',\'' + pid + '\')">' + (off ? 'Aktifkan' : 'Nonaktifkan') + '</button>')
          + '</div>';
      });
      html += '</div>';
    });
    document.getElementById("agentList").innerHTML = html;
  }

export function toggleAgent(idx, pid) {
    var a = PROJECTS[pid].agents[idx];
    a.status = a.status === "Nonaktif" ? "Idle" : "Nonaktif";
    renderAgents(); renderDetail();
  }

export function addAgent(key) {
    if (!key) return;
    var proj = PROJECTS[currentProj];
    var n = document.getElementById("addNotice"); n.style.display = "block";
    if (proj.agents.some(function (a) { return a.key === key; })) {
      n.textContent = tr('agent.add.exists', {name: AGENTS[key].name});
      return;
    }
    proj.agents.push({ key: key, status: "Idle", task: "Baru ditambahkan (simulasi)" });
    document.getElementById("addMenu").classList.remove("open");
    renderAgents();
    n.textContent = tr('agent.add.done', {name: AGENTS[key].name, proj: proj.name});
  }

export function selectAgent(key, pid) {
    selectedAgent = key;
    if (pid) currentProj = pid;
    document.getElementById("projectSel").value = currentProj;
    renderAgents(); renderDetail(); renderChat(); renderKanban();
    document.getElementById("chatProj").textContent = PROJECTS[currentProj].name;
  }

export function renderDetail() {
    var ag = AGENTS[selectedAgent], proj = PROJECTS[currentProj];
    var ins = ag.instructions || (selectedAgent === "prime" ? "General-purpose assistant" : ag.goal);
    var skills = ag.skills.map(function (s) { return '<div class="skillrow"><input type="checkbox" checked onchange="detailNote(\'' + tr('detail.note.skill', {s: s}) + '\')"> <span>' + s + '</span></div>'; }).join("");
    document.getElementById("detailBody").innerHTML =
      '<div class="detail-avatar-wrap"><div class="detail-avatar" style="background:' + ag.color + '">' + ag.name.charAt(0) + '</div><button class="avatar-edit" onclick="detailNote(\'' + tr('detail.note.avatar', {name: ag.name}) + '\')" title="Ubah avatar">✎</button></div>'
      + '<div class="d-label">' + tr('detail.name') + '</div><input type="text" class="d-field" value="' + ag.name + '" onchange="renameAgent(this.value)">'
      + '<div class="d-label">' + tr('detail.title') + '</div><input type="text" class="d-field" placeholder="Describe what your agent does" value="' + ag.role + '" onchange="retitleAgent(this.value)">'
      + '<div class="d-label">' + tr('detail.instructions') + '</div><textarea class="d-field d-area" onchange="setInstructions(this.value)">' + ins + '</textarea>'
      + '<div class="d-label">' + tr('detail.brain') + '</div><div class="d-rows">'
      + '<div class="d-row" onclick="detailNote(\'' + tr('detail.note.model') + '\')"><span>' + tr('detail.model') + '</span><span class="d-val">' + ag.model + ' ›</span></div>'
      + '<div class="d-row" onclick="detailNote(\'' + tr('detail.note.reasoning') + '\')"><span>' + tr('detail.reasoning') + '</span><span class="d-val">' + tr('detail.val.low') + '</span></div>'
      + '<div class="d-row" onclick="detailNote(\'' + tr('detail.note.backup') + '\')"><span>' + tr('detail.backup') + '</span><span class="d-val">' + tr('detail.val.askfirst') + '</span></div></div>'
      + '<div class="d-label">' + tr('detail.knows') + '</div><div class="d-rows">'
      + '<div class="d-row" onclick="detailNote(\'' + tr('detail.note.memories', {name: ag.name}) + '\')"><span>' + tr('detail.memories') + '</span><span class="d-val">' + tr('detail.val.saved') + '</span></div>'
      + '<div class="d-row" onclick="toggleSkillList()"><span>' + tr('detail.skills') + '</span><span class="d-val">' + ag.skills.length + ' assigned ›</span></div>'
      + '<div id="skillList" style="display:none">' + skills + '</div>'
      + '<div class="d-row" onclick="detailNote(\'' + tr('detail.note.files', {name: ag.name}) + '\')"><span>' + tr('detail.files') + '</span><span class="d-val">17 KB ›</span></div>'
      + '<div class="d-row" onclick="detailNote(\'' + tr('detail.note.tables', {name: ag.name}) + '\')"><span>' + tr('detail.tables') + '</span><span class="d-val">' + tr('detail.val.tables') + '</span></div></div>'
      + '<div class="d-label">' + tr('detail.does') + '</div><div class="d-rows">'
      + '<div class="d-row" onclick="detailNote(\'' + tr('detail.note.routines', {name: ag.name}) + '\')"><span>' + tr('detail.routines') + '</span><span class="d-val">' + tr('detail.val.configured') + '</span></div>'
      + '<div class="d-row" onclick="detailNote(\'' + tr('detail.note.usage', {name: ag.name}) + '\')"><span>' + tr('detail.usage') + '</span><span class="d-val">— ›</span></div></div>'
      + '<div class="notice" id="detailNotice" style="display:none"></div>';
  }

export function detailNote(t) { var n = document.getElementById("detailNotice"); if (n) { n.style.display = "block"; n.textContent = t; } }

export function toggleSkillList() { var el = document.getElementById("skillList"); if (el) el.style.display = el.style.display === "none" ? "block" : "none"; }

export function renameAgent(v) { if (!v.trim()) return; AGENTS[selectedAgent].name = v.trim(); renderAgents(); renderDetail(); detailNote("Simulasi: nama agen diubah menjadi " + v.trim() + " (tampilan saja)."); }

export function retitleAgent(v) { AGENTS[selectedAgent].role = v; renderAgents(); renderDetail(); }

export function setInstructions(v) { AGENTS[selectedAgent].instructions = v; detailNote("Simulasi: instructions tersimpan (tampilan saja)."); }

/* ---------- Proyek & Chat ---------- */
export function switchProject(pid) {
    currentProj = pid;
    document.getElementById("chatProj").textContent = PROJECTS[pid].name;
    renderAgents(); renderChat(); renderKanban(); renderDetail();
  }

export function renderChat() {
    var box = document.getElementById("chatBox");
    box.innerHTML = "";
    PROJECTS[currentProj].chat.forEach(function (m) {
      var div = document.createElement("div");
      div.className = "msg " + (m.who === "user" ? "user" : (m.curation ? "curation" : (m.who === "prime" ? "prime" : "")));
      var who = String(m.name || "").replace(/&/g, "&amp;").replace(/</g, "&lt;");
      div.innerHTML = m.curation
        ? '<div class="msg-col"><div class="cur-label">KURASI PRIME</div><div class="bubble">' + m.text + '</div></div>'
        : '<div class="body"><div class="who">' + who + '</div><div class="bubble">' + m.text + '</div></div>';
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
    if (PROJECTS[currentProj].agents.some(function (a) { return a.key === key; })) pid = currentProj;
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
    PROJECTS[currentProj].chat.push({ who: who, name: name, color: color, text: text, curation: !!curation });
    renderChat();
  }

export function quickChat(text) { document.getElementById("chatInput").value = text; sendChat(); }

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
      postChat("prime", "Prime Agent", "#FFD1DC", "Diterima. Saya pecah arahanmu dan tugaskan agen yang dibutuhkan — hasilnya muncul di chat ini dan kartunya di Kanban (simulasi).");
    }, 700);
    setTimeout(function () {
      var low = saved.toLowerCase();
      var agent = "Riset", color = "#FFD1DC", reply = "Saya mulai risetnya dari behaviour digital dan spending audiens (simulasi).";
      if (low.indexOf("gambar") !== -1 || low.indexOf("carousel") !== -1 || low.indexOf("reels") !== -1 || low.indexOf("talking") !== -1) { agent = "Media"; color = "#5b5b5b"; reply = "Saya siapkan medianya — gambar/carousel/reels/talking head tampil di Media Studio setelah lolos GKonten (simulasi)."; }
      else if (low.indexOf("produk") !== -1) { agent = "Produk Digital"; color = "#666666"; reply = "Saya susun brief produk dan struktur fitur MVP-nya (simulasi)."; }
      postChat("x", agent, color, reply);
    }, 1500);
  }

export function primeCurate() {
    postChat("prime", "Prime Agent", "#FFD1DC", "Kurasi Prime (simulasi): semua hasil agen di atas sudah saya periksa konsistensinya terhadap STP dan riset. Yang masih menunggu keputusanmu: gerbang GKonten untuk media dan gerbang distribusi untuk draf Postiz.", true);
  }

export function doSearch() {
    var q = document.getElementById("searchInput").value.trim().toLowerCase();
    var results = document.getElementById("searchResults");
    if (!q) { results.innerHTML = ""; document.getElementById("searchCount").textContent = ""; return; }
    var hits = PROJECTS[currentProj].chat.filter(function (m) { return m.text.toLowerCase().indexOf(q) !== -1 || m.name.toLowerCase().indexOf(q) !== -1; });
    document.getElementById("searchCount").textContent = tr('search.count', {n: hits.length, q: q, proj: PROJECTS[currentProj].name});
    results.innerHTML = hits.map(function (m) { return '<div style="background:#fff;border:1px solid #ddd;border-radius:8px;padding:12px;margin-bottom:8px"><b>' + m.name + ':</b> ' + m.text + '</div>'; }).join("") || "<p>" + tr('search.empty') + "</p>";
  }

export function agentKeyByName(n) {
    var keys = Object.keys(AGENTS);
    for (var i = 0; i < keys.length; i++) { if (AGENTS[keys[i]].name === n) return keys[i]; }
    return "prime";
  }

export function cardComments(card) { return 0; } // B4: no comment backend yet — never fabricate a count

export function colName(ci) { var kc = kcols(); return ci < kc.length ? kc[ci] : extraCols[ci - kc.length]; }

export function colColor(ci) { return ["#525252", "#6b7280", "#FFD1DC", "#737373", "#404040"][ci] || "#737373"; }

export function renderKanban() {
    document.getElementById("kanbanTitle").textContent = PROJECTS[currentProj].name;
    var wrap = document.getElementById("kanbanBox");
    var cards = PROJECTS[currentProj].kanban;
    var filter = document.getElementById("kbFilter") ? document.getElementById("kbFilter").value : "";
    function vis(card) { return !filter || card.a === filter; }
    if (kanbanTab === "table") {
      var rows = cards.filter(vis).map(function (card) {
        return "<tr><td><b>" + card.t + "</b></td><td>" + card.a + "</td><td>" + colName(card.c) + "</td><td>💬 " + cardComments(card) + "</td></tr>";
      }).join("");
      wrap.innerHTML = "<table><tr><th>Tugas</th><th>Agen</th><th>Status</th><th>Komentar</th></tr>" + rows + "</table>";
      return;
    }
    if (kanbanTab === "list") {
      wrap.innerHTML = cards.filter(vis).map(function (card) {
        return "<div class='todayitem'><b>" + card.t + "</b><br><small style='color:#a1a1a1'>" + tr('kanban.card.agent') + card.a + " • " + colName(card.c) + " • 💬 " + cardComments(card) + "</small></div>";
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
          k.innerHTML = "<div class='accent' style='background:" + colColor(ci) + "'></div><b>" + card.t + "</b><br><small style='color:#a1a1a1'>" + tr('kanban.card.agent') + card.a + "</small>"
            + "<div class='kb-cardfoot'><span>💬 " + cardComments(card) + "</span><span class='av' style='width:26px;height:26px;font-size:12px;background:" + ag.color + "'>" + ag.name.charAt(0) + "</span></div>";
          k.addEventListener("dragstart", function () { dragCard = i; });
          if (ci < totalCols - 1) {
            var b = document.createElement("button"); b.className = "btn btn-sm"; b.textContent = tr('kanban.advance');
            b.addEventListener("click", function () { card.c = ci + 1; renderKanban(); });
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
    var box = document.getElementById("graphBox").getBoundingClientRect();
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

export function renderGraph() {
    var wrap = document.getElementById("graphNodes");
    wrap.innerHTML = "";
    Object.keys(GNODES).forEach(function (k) {
      var nd = GNODES[k];
      var el = document.createElement("div");
      el.className = "n8n-node " + nd.kind;
      el.setAttribute("data-nkey", k);
      if (nd.kind === "circle") {
        el.style.left = "calc(" + nd.x + "% - 59px)";
        el.style.top = nd.y + "%";
      } else {
        el.style.left = nd.x + "%";
        el.style.top = nd.y + "%";
        el.style.width = nd.w + "px";
      }
      el.innerHTML = "<div class='nname'>" + nd.icon + " " + nd.name + "</div><div class='nsub'>" + nd.sub + "</div>";
      if (nd.kind === "output") {
        var plus = document.createElement("div");
        plus.className = "n8n-plus"; plus.textContent = "+"; plus.title = "Tambah node setelah ini";
        plus.addEventListener("mousedown", function (e) { e.stopPropagation(); });
        plus.addEventListener("click", function (e) { e.stopPropagation(); addNodeAfter(k); });
        el.appendChild(plus);
      }
      el.addEventListener("mousedown", function (e) {
        dragNode = k; dragMoved = false;
        var box = document.getElementById("graphBox").getBoundingClientRect();
        var r = el.getBoundingClientRect();
        grabDX = (e.clientX - r.left) / box.width * 100;
        grabDY = (e.clientY - r.top) / box.height * 100;
        dragStart = { x: e.clientX, y: e.clientY };
        e.preventDefault();
      });
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
      if (e.dashed) path.setAttribute("stroke-dasharray", "1.2 1.2");
      svg.appendChild(path);
      [ [x1, y1], [x2, y2] ].forEach(function (pt) {
        var c = document.createElementNS(NS, "circle");
        c.setAttribute("cx", pt[0]); c.setAttribute("cy", pt[1]); c.setAttribute("r", "1.1");
        c.setAttribute("fill", "#6b7280"); c.setAttribute("stroke", "#0e0e0e"); c.setAttribute("stroke-width", "0.3");
        svg.appendChild(c);
      });
      if (e.l) {
        var t = document.createElementNS(NS, "text");
        t.setAttribute("x", (x1 + x2) / 2); t.setAttribute("y", (y1 + y2) / 2 - 1.5);
        t.setAttribute("fill", "#a1a1a1"); t.setAttribute("font-size", "3"); t.setAttribute("text-anchor", "middle");
        t.textContent = e.l;
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
    renderGraph();
    var n = document.getElementById("graphNotice");
    n.style.display = "block";
    n.textContent = "Simulasi: node baru ditambahkan setelah " + src.name + " (tampilan saja).";
  }

export function runGraphSim() {
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
        n.textContent = "Simulasi selesai: alur berjalan Trigger → Prime Agent → GSTP (true) → Distribusi (draf). Gerbang sungguhan tetap menunggu keputusanmu — simulasi ini tidak menyetujui apa pun.";
        return;
      }
      var el = document.querySelector('[data-nkey="' + seq[i] + '"]');
      if (el) el.classList.add("exec");
      i++;
      setTimeout(step, 700);
    }
    step();
  }

/* Library: baris bawaan (artefak fase) + baris yang disimpan user.
   Baris user PERSISTEN di localStorage 'minime.library.added' — bukan
   lagi simulasi. libSave/libUse simulasi lama DIHAPUS (tidak ada
   pemakai lain); diganti aksi recall nyata: Media Studio + Chat. */
var LIB_LS = "minime.library.added";
function loadLibAdded() {
  try {
    var raw = window.localStorage.getItem(LIB_LS);
    var arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter(function (x) { return x && typeof x.o === "string"; }) : [];
  } catch (_) { return []; }
}
function saveLibAdded() {
  try { window.localStorage.setItem(LIB_LS, JSON.stringify(LIB_ADDED)); } catch (_) {}
}
function libAll() { return LIB.concat(LIB_ADDED); }

export function libAddScript(title, content) {
  var all = libAll();
  for (var k = 0; k < all.length; k++) {
    if (all[k].content && all[k].content === content) return { index: k, added: false };
  }
  LIB_ADDED.push({ o: title, a: "Kreatif", s: "Draf", badge: "b-idle", content: content, kind: "script" });
  saveLibAdded();
  renderLib();
  return { index: all.length, added: true };
}

export function renderLib() {
    document.getElementById("libBody").innerHTML = "<tr><th>Output</th><th>Agen</th><th>Status</th><th>Aksi</th></tr>" + libAll().map(function (item, i) {
      return "<tr><td>" + item.o + "</td><td>" + item.a + "</td><td><span class='badge " + item.badge + "'>" + item.s + "</span></td>"
        + "<td><button class='btn btn-sm' onclick='libMedia(" + i + ")'>" + tr('lib.btn.media') + "</button><button class='btn btn-sm' onclick='libChat(" + i + ")'>" + tr('lib.btn.chat') + "</button><button class='btn btn-sm' onclick='libRevise(" + i + ")'>Perbaiki Lanjut</button></td></tr>";
    }).join("");
  }

/* Recall ke Media Studio: muat isi (atau judul bila tanpa isi) ke
   output Script Editor yang bisa diedit, lalu buka tab Script.
   Jembatan window.seLoadOutput dipasang modul script-editor saat init. */
export function libAddImage(title, prompt, imageFile, costUsd) {
  var all = libAll();
  for (var k = 0; k < all.length; k++) {
    if (all[k].imageFile && all[k].imageFile === imageFile) return { index: k, added: false };
  }
  LIB_ADDED.push({ o: title, a: "Kreatif", s: "Disetujui", badge: "b-ok", content: prompt, kind: "image", imageFile: imageFile, costUsd: costUsd });
  saveLibAdded();
  renderLib();
  return { index: all.length, added: true };
}

export function libMedia(i) {
    var item = libAll()[i];
    if (!item) return;
    if (item.kind === "image" && item.imageFile) {
      showView("media");
      mediaTab("image");
      if (typeof window.imgLoadSaved === "function") window.imgLoadSaved(item);
      return;
    }
    var text = item.content || item.o;
    if (typeof window.seLoadOutput === "function") window.seLoadOutput(text);
    showView("media");
    mediaTab("script");
  }

/* Recall ke chat agen: kirim brief ke Prime Agent lewat delegasi chat
   yang sama dengan tombol kirim (AI beneran, bukan simulasi). */
export function libChat(i) {
    var item = libAll()[i];
    if (!item) return;
    var brief = tr('lib.chat.brief') + "\n\n" + (item.content || item.o);
    showView("home");
    var inp = document.getElementById("chatInput");
    if (inp) inp.value = brief;
    sendChat();
  }

export function libRevise(i) {
    var item = libAll()[i];
    if (!item) return;
    PROJECTS[currentProj].kanban.push({ t: "Revisi: " + item.o, a: item.a, c: 3 });
    renderKanban();
    showView("home");
    postChat("prime", "Prime Agent", "#FFD1DC", "Perbaikan dibuka untuk '" + item.o + "' — kartunya masuk kolom Revisi di Kanban, menunggu catatanmu (simulasi).", true);
  }

export function mediaBadge(s) { return s === "Siap untuk Post" ? "b-ok" : (s === "Menunggu GKonten" || s === "Menunggu provider" ? "b-wait" : "b-idle"); }


export function renderPlanner() {
    document.getElementById("plannerBody").innerHTML = PLANNER.map(function (p) {
      return "<tr><td>" + p.item + "</td><td>" + p.ch + "</td><td>" + p.when + "</td><td><span class='badge b-wait'>" + p.st + "</span></td><td><small>" + p.postId + "</small></td></tr>";
    }).join("");
  }

/** B5: append one planner row (used by the Postiz composer). Session-only. */
export function addPlannerRow(row) {
  PLANNER.push(row);
  renderPlanner();
}

/** B7: re-derive backend data in the current language (after a language switch). */
export function refreshBackendData() {
  PLANNER = plannerReal();
  PROJECTS.kopi.kanban = kopiKanban();
}

export function mediaTab(id) {
  ['script', 'image', 'batch', 'voice', 'video'].forEach(function (k) {
    var p = document.getElementById('ms-tab-' + k);
    if (p) p.style.display = (k === id) ? 'block' : 'none';
    var b = document.getElementById('ms-tabbtn-' + k);
    if (b) b.classList.toggle('active', k === id);
  });
}

export function campaignTab(id) {
  ['leads', 'crm', 'outreach', 'followup'].forEach(function (k) {
    var p = document.getElementById('cp-tab-' + k);
    if (p) p.style.display = (k === id) ? 'block' : 'none';
    var b = document.getElementById('cp-tabbtn-' + k);
    if (b) b.classList.toggle('active', k === id);
  });
}

/** Campaign tab bodies, DERIVED from the real Fase 4 artifact via
 *  backend-data (build-time snapshot, like Kanban/Planner). CRM
 *  lists pipeline counts + every deduped lead with score/stage;
 *  Outreach lists the 6 draft records (draft-only, never sent).
 *  Called on init and on language switch (like renderPlanner). */
export function renderCampaign() {
  var counts = campaignCounts();
  var pipe = campaignPipeline();
  var crm = document.getElementById('cp-crm-body');
  if (crm) {
    var rows = campaignLeads().map(function (l) {
      return '<tr><td><b>' + l.id + '</b> ' + l.name + '</td><td>' + l.channel + '</td><td>' + tr('cp.score') + ' ' + l.score + '</td><td>' + l.stage + '</td></tr>';
    }).join('');
    var summary = pipe.map(function (s) { return s.stage + ': ' + s.ids.length; }).join(' · ');
    crm.innerHTML = '<p>' + counts.raw + ' → ' + counts.deduped + ' lead (' + tr('cp.crm.dedupe', { merged: counts.merged }) + ') · ' + summary + '</p><table><tr><th>Lead</th><th>' + tr('word.channel') + '</th><th>' + tr('cp.score') + '</th><th>' + tr('cp.stage') + '</th></tr>' + rows + '</table>';
  }
  var out = document.getElementById('cp-outreach-body');
  if (out) {
    var drafts = campaignDrafts().map(function (d) {
      var link = d.waLink ? ' · <a href="' + d.waLink + '" target="_blank" rel="noreferrer">wa.me</a>' : '';
      return '<div style="margin-bottom:12px"><b>' + d.leadId + ' ' + d.leadName + '</b> (' + d.stage + ', ' + tr('cp.score') + ' ' + d.score + ', ' + d.channel + ') <span class="badge b-wait">' + tr('cp.status.draft') + '</span><div style="color:#a1a1a1;font-size:13px">' + d.text + link + '</div></div>';
    }).join('');
    out.innerHTML = drafts;
  }
}

export function veTool(tool) {
  document.querySelectorAll(".veToolNote").forEach(function (n) { n.textContent = "Simulasi: '" + tool + "' belum terhubung ke Diffusion (tampilan saja)."; });
}

export function ve2Select(el, name, start, dur, track) {
    document.querySelectorAll("#ms-tab-video .ve-clip").forEach(function (c) { c.classList.remove("selected"); });
    el.classList.add("selected");
    document.getElementById("ve2Name").value = name;
    document.getElementById("ve2Start").value = start;
    document.getElementById("ve2Dur").value = dur;
    document.getElementById("ve2Track").textContent = track;
    document.getElementById("ve2PreviewLabel").textContent = "Preview: " + name;
  }

export function ve2SyncName() {
    var v = document.getElementById("ve2Name").value;
    var sel = document.querySelector("#ms-tab-video .ve-clip.selected");
    if (sel) sel.textContent = v;
    document.getElementById("ve2PreviewLabel").textContent = "Preview: " + v;
  }

export function ve2Note(t) { document.getElementById("ve2Note").textContent = t; }

export function ve2Add(a) { ve2Note("Simulasi: '" + a + "' belum ditambahkan — butuh engine aset/timeline."); }

export function ve2Play() {
    if (playTimer2) clearInterval(playTimer2);
    var p = 0, el = document.getElementById("playhead2");
    playTimer2 = setInterval(function () {
      p += 2;
      if (p >= 100) { clearInterval(playTimer2); playTimer2 = null; }
      el.style.left = p + "%";
      var s = Math.round(p * 30 / 100);
      document.getElementById("ve2Time").textContent = "00:00:" + (s < 10 ? "0" + s : s) + " / 00:00:30";
    }, 120);
  }

export function ve2Transport(dir) {
    if (playTimer2) { clearInterval(playTimer2); playTimer2 = null; }
    var el = document.getElementById("playhead2");
    if (dir === "start") { el.style.left = "0%"; document.getElementById("ve2Time").textContent = "00:00:00 / 00:00:30"; }
    else { el.style.left = "100%"; document.getElementById("ve2Time").textContent = "00:00:30 / 00:00:30"; }
  }

/* ---------- Sidebar, resizer, init ---------- */
export function showView(id) {
    document.querySelectorAll(".sidebar button").forEach(function (b) { b.classList.toggle("active", b.getAttribute("data-view") === id); });
    document.querySelectorAll(".view").forEach(function (v) { v.classList.remove("active"); });
    document.getElementById("view-" + id).classList.add("active");
    document.querySelector(".app").classList.toggle("no-nav", id !== "home");
  }

export function showSetNotice() {
    var n = document.getElementById("setNotice");
    n.style.display = "block"; n.textContent = tr('settings.saved.note');
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
    document.addEventListener("mouseup", function () { dragging = false; });
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

export function waInputChanged() { /* lampiran: mic + kirim selalu tampil, tidak ada toggle */ }

export function waToggleAttach() {
    document.getElementById('attachMenu').classList.toggle('open');
  }

export function waAttach(kind) {
    document.getElementById('attachMenu').classList.remove('open');
    var n = document.getElementById('waNote');
    n.style.display = 'block';
    n.textContent = 'Simulasi: lampirkan ' + kind + ' — di aplikasi sungguhan, file ini masuk sebagai lampiran pesan untuk Prime Agent.';
  }

export function waMic() {
    var n = document.getElementById('waNote');
    n.style.display = 'block';
    n.textContent = tr('voice.note');
  }

export function toggleAddMenu() { document.getElementById('addMenu').classList.toggle('open'); }

export function renderAddMenu() {
    var menu = document.getElementById('addMenu');
    var proj = PROJECTS[currentProj];
    var avail = Object.keys(AGENTS).filter(function (k) { return k !== 'prime' && !proj.agents.some(function (a) { return a.key === k; }); });
    menu.innerHTML = '<div style="font-size:13px;color:#a1a1a1;margin-bottom:8px">Tambah agen ke ' + proj.name + '</div>'
      + (avail.length ? avail.map(function (k) { return '<button onclick="addAgent(\'' + k + '\')">' + AGENTS[k].name + ' — ' + AGENTS[k].role + '</button>'; }).join('') : '<div style="font-size:13px;color:#a1a1a1">Semua agen sudah ada di proyek ini.</div>');
  }

export function viewBack() { if (viewHistIdx > 0) { navJump = true; viewHistIdx--; _sv2(viewHist[viewHistIdx]); navJump = false; } }

export function viewForward() { if (viewHistIdx < viewHist.length - 1) { navJump = true; viewHistIdx++; _sv2(viewHist[viewHistIdx]); navJump = false; } }

export var AGENTS = {
    prime: { name: "Prime Agent", color: "#FFD1DC", role: "Personal Assistant — orkestrasi & kurasi", goal: "Memastikan setiap arahan menjadi tugas yang jelas, didelegasikan ke agen yang tepat, dan hasilnya dikurasi sebelum final.", skills: ["Orkestrasi delegasi", "Kurasi hasil agen", "Penegakan gerbang GSTP/GKonten/GBatch"], model: "Meta (Muse) → Gemini → Ollama", always: true },
    riset: { name: "Riset", color: "#525252", role: "Riset pasar & audiens", goal: "Riset pasar, behaviour digital, dan pola spending yang terverifikasi — tanpa mengarang angka/URL.", skills: ["riset-pasar", "behaviour-digital", "spending-digital", "verifikasi-fakta"], model: "Gemini (fallback dari Meta)", always: false },
    strategi: { name: "Strategi", color: "#404040", role: "Positioning & STP", goal: "Mengubah riset menjadi positioning, pilar, dan STP yang spesifik dan bisa diuji.", skills: ["positioning-stp", "pak-bi-branding", "segmentasi-spending"], model: "Gemini (fallback dari Meta)", always: false },
    kreatif: { name: "Kreatif", color: "#5b5b5b", role: "Naskah & Brief", goal: "Kalender, hook, CTA, dan CreativeBrief text-free yang siap diproduksi Media.", skills: ["copywriting-hook-cta", "brief-text-free", "overlay-template"], model: "Gemini (fallback dari Meta)", always: false },
    media: { name: "Media", color: "#333333", role: "Produksi media", goal: "Gambar, carousel, reels, dan talking head yang lolos QC dan siap untuk post (setelah GKonten).", skills: ["image-text-free", "carousel-slide", "reels-pendek", "talking-head-avatar"], model: "Meta Image (menunggu aktif) → Gemini → Canva fallback", always: false },
    distribusi: { name: "Distribusi", color: "#4a4a4a", role: "Draf distribusi", goal: "Draf Postiz per channel tanpa pernah terbit live di slice ini.", skills: ["postiz-draft-only", "status-channel"], model: "Postiz (DRAF saja)", always: false },
    produk: { name: "Produk Digital", color: "#666666", role: "Brief produk digital", goal: "Brief, struktur fitur MVP, dan riset pengguna dari arahan produk.", skills: ["brief-produk", "riset-pengguna", "fitur-mvp"], model: "Gemini (fallback dari Meta)", always: false }
  };

var PROJECTS = {
    kopi: { name: "TEST Kopi Surabaya", agents: [
      { key: "prime", status: "Aktif", task: "Mengkurasi hasil tim" },
      { key: "riset", status: "Selesai", task: "Riset behaviour + spending" },
      { key: "strategi", status: "Selesai", task: "STP v2 (GSTP lolos)" },
      { key: "kreatif", status: "Selesai", task: "Kalender 7 hari + brief" },
      { key: "media", status: "Menunggu provider", task: "Gambar Hari 1–7" },
      { key: "distribusi", status: "Idle", task: "—" }
    ], chat: [
      { who: "user", name: "Patria", color: "#374151", text: "Riset pasar es kopi Surabaya untuk mahasiswa, lalu buatkan konten 7 hari beserta gambarnya." },
      { who: "prime", name: "Prime Agent", color: "#FFD1DC", text: "Siap. Saya pecah jadi: Riset → Strategi (STP, menunggu GSTP darimu) → Kreatif (kalender + brief) → Media (gambar) → Distribusi (draf Postiz). Saya tugaskan Riset sekarang." },
      { who: "riset", name: "Riset", color: "#525252", text: "Riset selesai: audiens mahasiswa/pekerja muda Surabaya, behaviour digital tinggi (on-screen panjang, video pendek), spending sensitif harga, transaksi dominan via WhatsApp + QRIS." },
      { who: "strategi", name: "Strategi", color: "#404040", text: "STP draf: segmen mahasiswa/pekerja muda 18–28, targeting Urban Hustlers via WhatsApp Business + Reels/TikTok, positioning es kopi susu harian paling praktis via WA + QRIS. Menunggu GSTP." },
      { who: "prime", name: "Prime Agent", color: "#FFD1DC", text: "Kurasi Prime: STP di atas sudah saya periksa — segmen dan targetingnya konsisten dengan riset behaviour dan spending. Saya rekomendasikan untuk disetujui di gerbang GSTP, tetapi keputusan tetap di tanganmu.", curation: true },
      { who: "kreatif", name: "Kreatif", color: "#5b5b5b", text: "Kalender 7 hari + 7 brief selesai (setelah GSTP). Tema mencakup kenyamanan digital, konsistensi kualitas, dan efisiensi urban; semua CTA mengarah ke WA/QRIS." },
      { who: "media", name: "Media", color: "#5b5b5b", text: "Gambar Hari 1–7 masih menunggu provider (Meta Image belum aktif). Saya tidak membuat gambar palsu — statusnya pending-provider sampai generator aktif atau fallback Canva dipakai." }
    ], kanban: kopiKanban() },
    produk: { name: "TEST Produk Digital", agents: [
      { key: "prime", status: "Aktif", task: "Mengkurasi brief produk" },
      { key: "riset", status: "Mengerjakan", task: "Riset pengguna aplikasi kopi" },
      { key: "produk", status: "Mengerjakan", task: "Struktur fitur MVP" }
    ], chat: [
      { who: "user", name: "Patria", color: "#374151", text: "Buatkan brief produk digital untuk aplikasi pemesanan kopi via WhatsApp." },
      { who: "prime", name: "Prime Agent", color: "#FFD1DC", text: "Siap. Saya tugaskan Riset untuk riset pengguna, lalu Produk Digital menyusun brief dan struktur fitur MVP." },
      { who: "riset", name: "Riset", color: "#525252", text: "Riset pengguna berjalan: pemesanan via chat sudah jadi kebiasaan, hambatan utamanya antre dan pembayaran tunai (simulasi)." }
    ], kanban: [
      { t: "Riset pengguna aplikasi kopi", a: "Riset", c: 1 },
      { t: "Struktur fitur MVP", a: "Produk Digital", c: 1 },
      { t: "Brief produk (draf)", a: "Produk Digital", c: 0 }
    ]}
  };

var currentProj = "kopi", selectedAgent = "prime";

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
    dist: { name: "Distribusi", sub: "draf Postiz", icon: "▸", x: 82, y: 10, w: 155, kind: "output", desc: "Cabang true: hasil yang lolos GKonten disiapkan sebagai DRAF Postiz (bukan terbit live)." },
    revisi: { name: "Revisi", sub: "kembali ke Kreatif", icon: "↩", x: 82, y: 56, w: 155, kind: "output", desc: "Cabang false: tugas kembali ke agen pemiliknya dengan catatan revisi pengguna." },
    model: { name: "Chat Model", sub: "Meta → Gemini → Ollama", icon: "AI", x: 27, y: 70, kind: "circle", desc: "Sub-node model Prime Agent (garis putus-putus): rantai Meta → Gemini → Ollama lokal." },
    memory: { name: "Memory", sub: "PostgreSQL • riwayat", icon: "DB", x: 41, y: 70, kind: "circle", desc: "Sub-node memori Prime Agent (garis putus-putus): riwayat chat dan konteks proyek." },
    toolmedia: { name: "Tool: Media", sub: "image • carousel • reels", icon: "▷", x: 55, y: 70, kind: "circle", desc: "Sub-node tool Prime Agent (garis putus-putus): produksi media via agen Media." },
    toolpostiz: { name: "Tool: Postiz", sub: "draf saja", icon: "P", x: 69, y: 70, kind: "circle", desc: "Sub-node tool Prime Agent (garis putus-putus): draf distribusi, tanpa terbit live di slice ini." }
  };

var GEDGES = [
    { f: "trigger", t: "prime", l: "" },
    { f: "prime", t: "gate", l: "" },
    { f: "gate", t: "dist", l: "true" },
    { f: "gate", t: "revisi", l: "false" },
    { f: "prime", t: "model", l: "", dashed: true },
    { f: "prime", t: "memory", l: "", dashed: true },
    { f: "prime", t: "toolmedia", l: "", dashed: true },
    { f: "prime", t: "toolpostiz", l: "", dashed: true }
  ];

var dragNode = null, dragMoved = false, dragStart = null, grabDX = 0, grabDY = 0, graphRunning = false;

var nodeCounter = 0;

/* ---------- Library ---------- */
var LIB_ADDED = loadLibAdded();
var LIB = [
    { o: "STP v2 — TEST Kopi Surabaya", a: "Strategi", s: "Disetujui (GSTP)", badge: "b-ok" },
    { o: "Riset behaviour digital + spending", a: "Riset", s: "Disetujui", badge: "b-ok" },
    { o: "Kalender 7 hari + 7 brief", a: "Kreatif", s: "Disetujui (GKonten)", badge: "b-ok" },
    { o: "Gambar Hari 1–7 (menunggu provider)", a: "Media", s: "Menunggu provider", badge: "b-wait" },
    { o: "Brief produk digital (draf)", a: "Produk Digital", s: "DRAF", badge: "b-idle" }
  ];

/* ---------- Media Studio ---------- */

var PLANNER = plannerReal();

var playTimer2 = null;

var _ra2 = renderAgents;

var viewHist = ['home'], viewHistIdx = 0, navJump = false;

var _sv2 = showView;

var _sa2 = selectAgent;

export function initV5() {
  document.addEventListener("mousemove", function (e) {
      if (!dragNode) return;
      var box = document.getElementById("graphBox").getBoundingClientRect();
      if (dragStart && Math.abs(e.clientX - dragStart.x) + Math.abs(e.clientY - dragStart.y) > 5) dragMoved = true;
      var nx = (e.clientX - box.left) / box.width * 100 - grabDX;
      var ny = (e.clientY - box.top) / box.height * 100 - grabDY;
      GNODES[dragNode].x = Math.max(1, Math.min(90, nx));
      GNODES[dragNode].y = Math.max(1, Math.min(84, ny));
      renderGraph();
    });
  document.addEventListener("mouseup", function () { dragNode = null; });
  document.querySelectorAll(".sidebar button").forEach(function (b) {
      b.addEventListener("click", function () { showView(b.getAttribute("data-view")); });
    });
  makeResizer("resizeAgent", "agentCol", 180, 420);
  makeResizer("resizeDetail", "detailCol", 220, 420);
  renderAgents();
  renderDetail();
  renderChat();
  renderKanban();
  renderGraph();
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
      sendChat = function () { _sc(); waInputChanged(); };
      var _qc = quickChat;
      quickChat = function (t) { _qc(t); waInputChanged(); };
    })();
  renderAgents = function () { _ra2(); renderAddMenu(); };
  showView = function (id) {
      if (!navJump) { viewHist = viewHist.slice(0, viewHistIdx + 1); if (viewHist[viewHistIdx] !== id) { viewHist.push(id); viewHistIdx++; } }
      _sv2(id);
    };
  renderAgents();
  selectAgent = function (k, pid) { _sa2(k, pid); var inp = document.getElementById('chatInput'); if (inp) inp.placeholder = 'Message ' + AGENTS[k].name; };
  waInputChanged();
  var _ms = document.getElementById('msScript');
  if (_ms) { try { _ms.value = localStorage.getItem('minime.script') || ''; } catch (_) {} }
  Object.assign(window, { AGENTS, GEDGES, GNODES, kcols, LIB, LIB_ADDED, PLANNER, PROJECTS, _ra2, _sa2, _sv2, activateAgent, addAgent, addKanbanList, addNodeAfter, agentKeyByName, campaignTab, cardComments, colColor, colName, currentProj, curvePath, detailNote, doSearch, dragCard, dragMoved, dragNode, dragStart, extraCols, filterAgents, grabDX, grabDY, graphRunning, kanbanTab, libAddImage, libAddScript, libAll, libChat, libMedia, libRevise, makeResizer, mediaBadge, mediaTab, navJump, nodeCounter, nodeRects, playTimer2, postChat, primeCurate, quickChat, renameAgent, renderAddMenu, renderAgents, renderCampaign, renderChat, renderDetail, renderGraph, renderKanban, renderLib, renderPlanner, retitleAgent, runGraphSim, selectAgent, selectedAgent, sendChat, setInstructions, showSetNotice, showView, switchProject, toggleAddMenu, toggleAgent, toggleGroup, toggleSkillList, ve2Add, ve2Note, ve2Play, ve2Select, ve2SyncName, ve2Transport, veTool, viewBack, viewForward, viewHist, viewHistIdx, waAttach, waInputChanged, waMic, waToggleAttach });
}
