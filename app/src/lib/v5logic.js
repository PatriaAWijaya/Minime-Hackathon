// Mechanical migration of prototype-v5/index.html <script> blocks.
// Logic is UNCHANGED: declarations kept at module level, executable
// top-level statements moved into initV5() in original order.
// initV5() must run after mount (DOM ready); it ends by exposing
// every top-level name on window, as the original page had them
// as globals (runtime-generated innerHTML handlers need this).

/* ---------- Agen ---------- */
export function renderAgents() {
    var html = "", rowNo = -1;
    Object.keys(PROJECTS).forEach(function (pid) {
      var proj = PROJECTS[pid];
      html += '<div class="group">' + proj.name + (pid === currentProj ? ' • PROYEK AKTIF' : '') + '</div>';
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
      n.textContent = "Simulasi: agen " + AGENTS[key].name + " sudah ada di proyek ini (satu agen bisa muncul di beberapa proyek, tapi tidak dua kali di proyek yang sama).";
      return;
    }
    proj.agents.push({ key: key, status: "Idle", task: "Baru ditambahkan (simulasi)" });
    document.getElementById("addMenu").classList.remove("open");
    renderAgents();
    n.textContent = "Simulasi: agen " + AGENTS[key].name + " ditambahkan ke " + proj.name + ".";
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
    var skills = ag.skills.map(function (s) { return '<div class="skillrow"><input type="checkbox" checked onchange="detailNote(\'Simulasi: skill ' + s + ' diubah (tampilan saja).\')"> <span>' + s + '</span></div>'; }).join("");
    document.getElementById("detailBody").innerHTML =
      '<div class="detail-avatar-wrap"><div class="detail-avatar" style="background:' + ag.color + '">' + ag.name.charAt(0) + '</div><button class="avatar-edit" onclick="detailNote(\'Simulasi: ganti avatar ' + ag.name + ' (tampilan saja).\')" title="Ubah avatar">✎</button></div>'
      + '<div class="d-label">Name</div><input type="text" class="d-field" value="' + ag.name + '" onchange="renameAgent(this.value)">'
      + '<div class="d-label">Title</div><input type="text" class="d-field" placeholder="Describe what your agent does" value="' + ag.role + '" onchange="retitleAgent(this.value)">'
      + '<div class="d-label">Instructions</div><textarea class="d-field d-area" onchange="setInstructions(this.value)">' + ins + '</textarea>'
      + '<div class="d-label">Brain</div><div class="d-rows">'
      + '<div class="d-row" onclick="detailNote(\'Simulasi: ganti model — rantai aktif Meta → Gemini → Ollama (tampilan saja).\')"><span>Model</span><span class="d-val">' + ag.model + ' ›</span></div>'
      + '<div class="d-row" onclick="detailNote(\'Simulasi: ubah Reasoning (tampilan saja).\')"><span>Reasoning</span><span class="d-val">Low ↕</span></div>'
      + '<div class="d-row" onclick="detailNote(\'Simulasi: atur Backup models (tampilan saja).\')"><span>Backup models</span><span class="d-val">Ask first ›</span></div></div>'
      + '<div class="d-label">Knows</div><div class="d-rows">'
      + '<div class="d-row" onclick="detailNote(\'Simulasi: Memories ' + ag.name + ' masih kosong di prototype ini.\')"><span>Memories</span><span class="d-val">0 saved ›</span></div>'
      + '<div class="d-row" onclick="toggleSkillList()"><span>Skills</span><span class="d-val">' + ag.skills.length + ' assigned ›</span></div>'
      + '<div id="skillList" style="display:none">' + skills + '</div>'
      + '<div class="d-row" onclick="detailNote(\'Simulasi: Files ' + ag.name + ' (tampilan saja).\')"><span>Files</span><span class="d-val">17 KB ›</span></div>'
      + '<div class="d-row" onclick="detailNote(\'Simulasi: Tables ' + ag.name + ' (tampilan saja).\')"><span>Tables</span><span class="d-val">0 tables ›</span></div></div>'
      + '<div class="d-label">Does</div><div class="d-rows">'
      + '<div class="d-row" onclick="detailNote(\'Simulasi: Routines ' + ag.name + ' (tampilan saja).\')"><span>Routines</span><span class="d-val">0 configured ›</span></div>'
      + '<div class="d-row" onclick="detailNote(\'Simulasi: Usage ' + ag.name + ' (tampilan saja).\')"><span>Usage</span><span class="d-val">— ›</span></div></div>'
      + '<div class="notice" id="detailNotice" style="display:none"></div>'
      + '<p style="font-size:13px;color:#737373">Gerbang (GSTP/GKonten/GBatch) tidak bisa dimatikan dari panel ini.</p>';
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
      div.innerHTML = m.curation
        ? '<div class="msg-col"><div class="cur-label">KURASI PRIME</div><div class="bubble">' + m.text + '</div></div>'
        : '<div class="bubble">' + m.text + '</div>';
      box.appendChild(div);
    });
    box.scrollTop = box.scrollHeight;
  }

export function postChat(who, name, color, text, curation) {
    PROJECTS[currentProj].chat.push({ who: who, name: name, color: color, text: text, curation: !!curation });
    renderChat();
  }

export function quickChat(text) { document.getElementById("chatInput").value = text; sendChat(); }

export function sendChat() {
    var input = document.getElementById("chatInput");
    var text = input.value.trim();
    if (!text) return;
    postChat("user", "Kamu", "#374151", text.replace(/</g, "&lt;"));
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
    document.getElementById("searchCount").textContent = hits.length + " hasil untuk '" + q + "' di chat " + PROJECTS[currentProj].name + " (simulasi).";
    results.innerHTML = hits.map(function (m) { return '<div style="background:#fff;border:1px solid #ddd;border-radius:8px;padding:12px;margin-bottom:8px"><b>' + m.name + ':</b> ' + m.text + '</div>'; }).join("") || "<p>Tidak ada hasil.</p>";
  }

export function agentKeyByName(n) {
    var keys = Object.keys(AGENTS);
    for (var i = 0; i < keys.length; i++) { if (AGENTS[keys[i]].name === n) return keys[i]; }
    return "prime";
  }

export function cardComments(card) { return (card.t.length % 4) + 1; }

export function colName(ci) { return ci < KCOLS.length ? KCOLS[ci] : extraCols[ci - KCOLS.length]; }

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
        return "<div class='todayitem'><b>" + card.t + "</b><br><small style='color:#a1a1a1'>Agen: " + card.a + " • " + colName(card.c) + " • 💬 " + cardComments(card) + "</small></div>";
      }).join("") || "<p>Tidak ada tugas untuk filter ini.</p>";
      return;
    }
    var totalCols = KCOLS.length + extraCols.length;
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
          k.innerHTML = "<div class='accent' style='background:" + colColor(ci) + "'></div><b>" + card.t + "</b><br><small style='color:#a1a1a1'>Agen: " + card.a + "</small>"
            + "<div class='kb-cardfoot'><span>💬 " + cardComments(card) + "</span><span class='av' style='width:26px;height:26px;font-size:12px;background:" + ag.color + "'>" + ag.name.charAt(0) + "</span></div>";
          k.addEventListener("dragstart", function () { dragCard = i; });
          if (ci < totalCols - 1) {
            var b = document.createElement("button"); b.className = "btn btn-sm"; b.textContent = "Maju →";
            b.addEventListener("click", function () { card.c = ci + 1; renderKanban(); });
            k.appendChild(b);
          }
          div.appendChild(k);
        });
        var add = document.createElement("button"); add.className = "btn btn-sm"; add.style.width = "100%";
        add.textContent = "＋ Add task";
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
      el.addEventListener("click", function () {
        if (dragMoved) return;
        var outs = GEDGES.filter(function (e) { return e.f === k; }).map(function (e) { return GNODES[e.t].name + (e.l ? " (" + e.l + ")" : ""); }).join(", ") || "tidak ada";
        var ins = GEDGES.filter(function (e) { return e.t === k; }).map(function (e) { return GNODES[e.f].name + (e.l ? " (" + e.l + ")" : ""); }).join(", ") || "tidak ada";
        document.getElementById("gnodeInfo").textContent = nd.name;
        document.getElementById("gnodeDetail").textContent = nd.desc + " Keluar: " + outs + ". Masuk: " + ins + ".";
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
    document.getElementById("graphList").innerHTML = GEDGES.map(function (e) {
      return "<li>" + GNODES[e.f].name + " → " + GNODES[e.t].name + (e.l ? " — " + e.l : "") + (e.dashed ? " (putus-putus)" : "") + "</li>";
    }).join("");
  }

export function buildEdgeOptions() {
    var gf = document.getElementById("gFrom"), gt = document.getElementById("gTo");
    gf.innerHTML = ""; gt.innerHTML = "";
    Object.keys(GNODES).forEach(function (k) {
      var o1 = document.createElement("option"); o1.value = k; o1.textContent = GNODES[k].name; gf.appendChild(o1);
      var o2 = document.createElement("option"); o2.value = k; o2.textContent = GNODES[k].name; gt.appendChild(o2);
    });
  }

export function addGraphEdge() {
    var f = document.getElementById("gFrom").value, t = document.getElementById("gTo").value;
    var label = document.getElementById("gLabel").value.trim() || "";
    if (f === t) { alert("Sumber dan tujuan tidak boleh sama."); return; }
    GEDGES.push({ f: f, t: t, l: label });
    renderGraph();
    var n = document.getElementById("graphNotice");
    n.style.display = "block";
    n.textContent = "Simulasi: koneksi " + GNODES[f].name + " → " + GNODES[t].name + (label ? " (" + label + ")" : "") + " ditambahkan (tampilan saja).";
  }

export function addNodeAfter(key) {
    nodeCounter++;
    var src = GNODES[key];
    var nk = "baru" + nodeCounter;
    GNODES[nk] = { name: "Node Baru " + nodeCounter, sub: "simulasi", icon: "＋", x: Math.min(90, src.x + 14), y: src.y, w: 150, kind: "output", desc: "Node baru dari tombol ＋ (simulasi) — di aplikasi sungguhan, node ini bisa diisi agen/tool lain." };
    GEDGES.push({ f: key, t: nk, l: "" });
    buildEdgeOptions();
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

export function renderLib() {
    document.getElementById("libBody").innerHTML = "<tr><th>Output</th><th>Agen</th><th>Status</th><th>Aksi</th></tr>" + LIB.map(function (item, i) {
      return "<tr><td>" + item.o + "</td><td>" + item.a + "</td><td><span class='badge " + item.badge + "'>" + item.s + "</span></td>"
        + "<td><button class='btn btn-sm' onclick='libUse(" + i + ")'>Gunakan</button><button class='btn btn-sm' onclick='libSave(" + i + ")'>Simpan</button><button class='btn btn-sm' onclick='libRevise(" + i + ")'>Perbaiki Lanjut</button></td></tr>";
    }).join("");
  }

export function libUse(i) {
    showView("home");
    postChat("prime", "Prime Agent", "#FFD1DC", "Output '" + LIB[i].o + "' digunakan sebagai bahan tahap berikutnya di " + PROJECTS[currentProj].name + " (simulasi).", true);
    var n = document.getElementById("libNotice"); n.style.display = "block";
    n.textContent = "Simulasi: pesan Prime Agent terkirim ke chat proyek aktif.";
  }

export function libSave(i) {
    var n = document.getElementById("libNotice"); n.style.display = "block";
    n.textContent = "Simulasi: '" + LIB[i].o + "' ditandai tersimpan (tampilan saja).";
  }

export function libRevise(i) {
    PROJECTS[currentProj].kanban.push({ t: "Revisi: " + LIB[i].o, a: LIB[i].a, c: 3 });
    renderKanban();
    showView("home");
    postChat("prime", "Prime Agent", "#FFD1DC", "Perbaikan dibuka untuk '" + LIB[i].o + "' — kartunya masuk kolom Revisi di Kanban, menunggu catatanmu (simulasi).", true);
  }

export function mediaBadge(s) { return s === "Siap untuk Post" ? "b-ok" : (s === "Menunggu GKonten" || s === "Menunggu provider" ? "b-wait" : "b-idle"); }

export function renderMedia() {
    var grid = document.getElementById("mediaGrid");
    grid.innerHTML = "";
    MEDIA.filter(function (m) { return mediaFilter === "semua" || m.type === mediaFilter; }).forEach(function (m) {
      var idx = MEDIA.indexOf(m);
      var card = document.createElement("div"); card.className = "mediacard";
      var visual = "";
      if (m.type === "gambar") visual = '<div class="ph">Placeholder gambar dummy<br><small>Bukan hasil generate</small></div>';
      if (m.type === "carousel") visual = '<div class="ph">Placeholder carousel dummy<br><b>' + m.slides[m.cur] + '</b><br><small>Slide ' + (m.cur + 1) + ' dari ' + m.slides.length + '</small></div>'
        + '<button class="btn btn-sm" onclick="carSlide(' + idx + ',-1)">← Slide</button><button class="btn btn-sm" onclick="carSlide(' + idx + ',1)">Slide →</button>';
      if (m.type === "reels") visual = '<div class="ph tall"><div><div style="font-size:42px">▶</div>Placeholder reels dummy<br><small>9:16 — bukan video sungguhan</small></div></div>';
      if (m.type === "talking") visual = '<div class="ph"><div>Avatar dummy<br><small>Talking head — bukan video sungguhan</small></div></div>'
        + '<label>Naskah (bisa diedit)</label><textarea id="script' + idx + '">' + m.script + '</textarea><button class="btn btn-sm" onclick="saveScript(' + idx + ')">Simpan Naskah (simulasi)</button>';
      card.innerHTML = "<span class='badge " + mediaBadge(m.status) + "'>" + m.status + "</span> <span class='badge b-idle'>" + m.type + "</span><h3 style='margin-top:10px;font-size:15px'>" + m.title + "</h3>" + visual + "<p style='font-size:14px;color:#555'>" + m.desc + "</p>"
        + "<button class='btn btn-sm' onclick='mediaToPlanner(" + idx + ")'>Siapkan untuk Post → Planner</button>";
      grid.appendChild(card);
    });
  }

export function carSlide(idx, dir) {
    var m = MEDIA[idx];
    m.cur = (m.cur + dir + m.slides.length) % m.slides.length;
    renderMedia();
  }

export function saveScript(idx) {
    var v = document.getElementById("script" + idx).value;
    MEDIA[idx].script = v;
    var n = document.getElementById("mediaNotice"); n.style.display = "block";
    n.textContent = "Simulasi: naskah '" + MEDIA[idx].title + "' diperbarui (tampilan saja). Render ulang sungguhan adalah pekerjaan build.";
  }

export function mediaToPlanner(idx) {
    var m = MEDIA[idx];
    m.status = "Siap untuk Post";
    PLANNER.push({ item: m.title, ch: "Instagram / Postiz", when: "31 Okt, 11:30 WIB", st: "DRAF Postiz" });
    renderMedia(); renderPlanner();
    var n = document.getElementById("mediaNotice"); n.style.display = "block";
    n.textContent = "Simulasi: '" + m.title + "' ditandai Siap untuk Post dan ditambahkan sebagai DRAF di Planner (bukan terbit).";
  }

export function renderPlanner() {
    document.getElementById("plannerBody").innerHTML = PLANNER.map(function (p) {
      return "<tr><td>" + p.item + "</td><td>" + p.ch + "</td><td>" + p.when + "</td><td><span class='badge b-wait'>" + p.st + "</span></td></tr>";
    }).join("");
  }

export function playTimeline() {
    if (playTimer) clearInterval(playTimer);
    var p = 0, el = document.getElementById("playhead");
    playTimer = setInterval(function () {
      p += 2;
      if (p >= 100) { clearInterval(playTimer); playTimer = null; }
      el.style.left = p + "%";
    }, 120);
  }

export function selectClip(el, name, start, dur, track) {
    document.querySelectorAll(".ve-clip").forEach(function (c) { c.classList.remove("selected"); });
    el.classList.add("selected");
    document.getElementById("veClipName").textContent = name;
    document.getElementById("veClipStart").textContent = start;
    document.getElementById("veClipDur").textContent = dur;
    document.getElementById("veClipTrack").textContent = track;
    document.getElementById("vePreviewLabel").textContent = "Preview: " + name;
  }

export function veTool(tool) {
    document.getElementById("veToolNote").textContent = "Simulasi: '" + tool + "' belum terhubung ke Diffusion (tampilan saja).";
  }

export function ve2Select(el, name, start, dur, track) {
    document.querySelectorAll("#view-videoeditor .ve-clip").forEach(function (c) { c.classList.remove("selected"); });
    el.classList.add("selected");
    document.getElementById("ve2Name").value = name;
    document.getElementById("ve2Start").value = start;
    document.getElementById("ve2Dur").value = dur;
    document.getElementById("ve2Track").textContent = track;
    document.getElementById("ve2PreviewLabel").textContent = "Preview: " + name;
  }

export function ve2SyncName() {
    var v = document.getElementById("ve2Name").value;
    var sel = document.querySelector("#view-videoeditor .ve-clip.selected");
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
    n.style.display = "block"; n.textContent = "Simulasi: pengaturan tersimpan (tampilan saja).";
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
  document.querySelectorAll('#agentList .agent').forEach(function (el) {
    var t = el.textContent.toLowerCase();
    el.style.display = (!q || t.indexOf(q) !== -1) ? '' : 'none';
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
    n.textContent = 'Simulasi: rekam pesan suara — di aplikasi sungguhan, ini membuka perekam Voice Studio dan hasilnya ditranskripsi menjadi arahan untuk Prime Agent.';
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

var AGENTS = {
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
      { who: "user", name: "Kamu", color: "#374151", text: "Riset pasar es kopi Surabaya untuk mahasiswa, lalu buatkan konten 7 hari beserta gambarnya." },
      { who: "prime", name: "Prime Agent", color: "#FFD1DC", text: "Siap. Saya pecah jadi: Riset → Strategi (STP, menunggu GSTP darimu) → Kreatif (kalender + brief) → Media (gambar) → Distribusi (draf Postiz). Saya tugaskan Riset sekarang." },
      { who: "riset", name: "Riset", color: "#525252", text: "Riset selesai: audiens mahasiswa/pekerja muda Surabaya, behaviour digital tinggi (on-screen panjang, video pendek), spending sensitif harga, transaksi dominan via WhatsApp + QRIS." },
      { who: "strategi", name: "Strategi", color: "#404040", text: "STP draf: segmen mahasiswa/pekerja muda 18–28, targeting Urban Hustlers via WhatsApp Business + Reels/TikTok, positioning es kopi susu harian paling praktis via WA + QRIS. Menunggu GSTP." },
      { who: "prime", name: "Prime Agent", color: "#FFD1DC", text: "Kurasi Prime: STP di atas sudah saya periksa — segmen dan targetingnya konsisten dengan riset behaviour dan spending. Saya rekomendasikan untuk disetujui di gerbang GSTP, tetapi keputusan tetap di tanganmu.", curation: true },
      { who: "kreatif", name: "Kreatif", color: "#5b5b5b", text: "Kalender 7 hari + 7 brief selesai (setelah GSTP). Tema mencakup kenyamanan digital, konsistensi kualitas, dan efisiensi urban; semua CTA mengarah ke WA/QRIS." },
      { who: "media", name: "Media", color: "#5b5b5b", text: "Gambar Hari 1–7 masih menunggu provider (Meta Image belum aktif). Saya tidak membuat gambar palsu — statusnya pending-provider sampai generator aktif atau fallback Canva dipakai." }
    ], kanban: [
      { t: "Riset pasar & behaviour", a: "Riset", c: 4 }, { t: "STP v2", a: "Strategi", c: 4 },
      { t: "Kalender 7 hari", a: "Kreatif", c: 4 }, { t: "Gambar Hari 1–7", a: "Media", c: 1 },
      { t: "Carousel + Reels", a: "Media", c: 0 }, { t: "Talking Head promo", a: "Media", c: 0 },
      { t: "Draf Postiz", a: "Distribusi", c: 0 }
    ]},
    produk: { name: "TEST Produk Digital", agents: [
      { key: "prime", status: "Aktif", task: "Mengkurasi brief produk" },
      { key: "riset", status: "Mengerjakan", task: "Riset pengguna aplikasi kopi" },
      { key: "produk", status: "Mengerjakan", task: "Struktur fitur MVP" }
    ], chat: [
      { who: "user", name: "Kamu", color: "#374151", text: "Buatkan brief produk digital untuk aplikasi pemesanan kopi via WhatsApp." },
      { who: "prime", name: "Prime Agent", color: "#FFD1DC", text: "Siap. Saya tugaskan Riset untuk riset pengguna, lalu Produk Digital menyusun brief dan struktur fitur MVP." },
      { who: "riset", name: "Riset", color: "#525252", text: "Riset pengguna berjalan: pemesanan via chat sudah jadi kebiasaan, hambatan utamanya antre dan pembayaran tunai (simulasi)." }
    ], kanban: [
      { t: "Riset pengguna aplikasi kopi", a: "Riset", c: 1 },
      { t: "Struktur fitur MVP", a: "Produk Digital", c: 1 },
      { t: "Brief produk (draf)", a: "Produk Digital", c: 0 }
    ]}
  };

var currentProj = "kopi", selectedAgent = "prime", mediaFilter = "semua";

var KCOLS = ["Antrian", "Dikerjakan", "Butuh Approval", "Revisi", "Selesai"];

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
var LIB = [
    { o: "STP v2 — TEST Kopi Surabaya", a: "Strategi", s: "Disetujui (GSTP)", badge: "b-ok" },
    { o: "Riset behaviour digital + spending", a: "Riset", s: "Disetujui", badge: "b-ok" },
    { o: "Kalender 7 hari + 7 brief", a: "Kreatif", s: "Disetujui (GKonten)", badge: "b-ok" },
    { o: "Gambar Hari 1–7 (menunggu provider)", a: "Media", s: "Menunggu provider", badge: "b-wait" },
    { o: "Brief produk digital (draf)", a: "Produk Digital", s: "DRAF", badge: "b-idle" }
  ];

/* ---------- Media Studio ---------- */
var MEDIA = [
    { type: "gambar", title: "Gambar Hari 1 — Kemudahan Pesan via WA", status: "Siap untuk Post", desc: "Gambar statis text-free. Placeholder dummy — bukan hasil generate." },
    { type: "gambar", title: "Gambar Hari 4 — Higienitas Kopi Harian", status: "Menunggu provider", desc: "Placeholder dummy — bukan hasil generate." },
    { type: "carousel", title: "Carousel Hari 3 — Efisiensi QRIS", status: "Siap untuk Post", desc: "Slide hook → isi → CTA. Tombol geser slide di bawah (simulasi).", slides: ["Hook: Dompet ketinggalan?", "Isi: Scan QRIS, beres.", "CTA: Pesan via WA"], cur: 0 },
    { type: "carousel", title: "Carousel Hari 5 — Promo Bundling Hemat", status: "Menunggu GKonten", desc: "Slide hook → bundling → CTA. Placeholder dummy.", slides: ["Hook: Ngopi hemat tiap hari", "Isi: Bundling hemat", "CTA: Cek promo di WA"], cur: 0 },
    { type: "reels", title: "Reels Hari 1 — Capek antre kopi? (9:16)", status: "Siap untuk Post", desc: "Video pendek vertikal. Placeholder dummy — bukan video sungguhan." },
    { type: "talking", title: "Talking Head — Promo Bundling", status: "Menunggu GKonten", desc: "Avatar + naskah. Edit naskah di bawah, lalu Simpan (simulasi).", script: "Ngopi enak tiap hari tanpa bikin saldo menipis — cek promo bundling TEST Kopi di chat WA kita!" },
    { type: "talking", title: "Talking Head — Kenapa QRIS?", status: "Draf", desc: "Avatar + naskah edukasi QRIS. Placeholder dummy.", script: "Dompet ketinggalan bukan masalah — bayar pakai QRIS, scan langsung beres." }
  ];

var PLANNER = [
    { item: "Gambar Hari 1 — Kemudahan Pesan via WA", ch: "Instagram / Postiz", when: "28 Okt, 11:30 WIB", st: "DRAF Postiz" },
    { item: "Carousel Hari 3 — Efisiensi QRIS", ch: "Instagram / Postiz", when: "29 Okt, 19:00 WIB", st: "DRAF Postiz" },
    { item: "Reels Hari 1", ch: "TikTok / Meta", when: "30 Okt, 12:00 WIB", st: "Kandidat (belum GKonten video)" }
  ];

var playTimer = null;

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
  buildEdgeOptions();
  document.querySelectorAll("[data-filter]").forEach(function (b) {
      b.addEventListener("click", function () {
        document.querySelectorAll("[data-filter]").forEach(function (x) { x.classList.remove("active"); });
        b.classList.add("active");
        mediaFilter = b.getAttribute("data-filter");
        renderMedia();
      });
    });
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
  renderMedia();
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
  Object.assign(window, { AGENTS, GEDGES, GNODES, KCOLS, LIB, MEDIA, PLANNER, PROJECTS, _ra2, _sa2, _sv2, addAgent, addGraphEdge, addKanbanList, addNodeAfter, agentKeyByName, buildEdgeOptions, carSlide, cardComments, colColor, colName, currentProj, curvePath, detailNote, doSearch, dragCard, dragMoved, dragNode, dragStart, extraCols, filterAgents, grabDX, grabDY, graphRunning, kanbanTab, libRevise, libSave, libUse, makeResizer, mediaBadge, mediaFilter, mediaToPlanner, navJump, nodeCounter, nodeRects, playTimeline, playTimer, playTimer2, postChat, primeCurate, quickChat, renameAgent, renderAddMenu, renderAgents, renderChat, renderDetail, renderGraph, renderKanban, renderLib, renderMedia, renderPlanner, retitleAgent, runGraphSim, saveScript, selectAgent, selectClip, selectedAgent, sendChat, setInstructions, showSetNotice, showView, switchProject, toggleAddMenu, toggleAgent, toggleSkillList, ve2Add, ve2Note, ve2Play, ve2Select, ve2SyncName, ve2Transport, veTool, viewBack, viewForward, viewHist, viewHistIdx, waAttach, waInputChanged, waMic, waToggleAttach });
}
