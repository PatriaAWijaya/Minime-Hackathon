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
import { campaignCounts, campaignDrafts, campaignLeads } from './backend-data.js';
import { tr, getLang, MONTHS } from './i18n.js';
import { COST_TOTAL, readLiveCost, fmtInt } from './cost.js';

/* ---------- Agen ---------- */
var agentListWired = false;
function agentListWire() {
  var list = document.getElementById("agentList"); if (!list || agentListWired) return; agentListWired = true;
  list.addEventListener("click", function (e) {
    var el = e.target.closest ? e.target.closest("[data-act]") : null;
    if (!el || !list.contains(el)) return;
    var act = el.getAttribute("data-act");
    if (act === "sel-agent") selectAgent(el.getAttribute("data-key"), el.getAttribute("data-pid"));
    else if (act === "a-play") agentPlay(parseInt(el.getAttribute("data-idx"), 10), el.getAttribute("data-pid"));
    else if (act === "a-stop") agentStop(parseInt(el.getAttribute("data-idx"), 10), el.getAttribute("data-pid"));
    else if (act === "a-deact") agentDeactivate(parseInt(el.getAttribute("data-idx"), 10), el.getAttribute("data-pid"));
    else if (act === "g-play") agentGraphPlay(el.getAttribute("data-key") || "");
    else if (act === "g-stop") agentGraphStop(el.getAttribute("data-key") || "");
    else if (act === "g-deact") agentGraphDeact(el.getAttribute("data-key") || "");
    else if (act === "toggle-group") toggleGroup(el.getAttribute("data-pid"));
  });
  list.addEventListener("dragstart", function (e) {
    var el = e.target.closest ? e.target.closest("[data-dragkey]") : null;
    if (!el || !list.contains(el)) return;
    agentDragStart(e, el.getAttribute("data-dragkey"));
  });
  list.addEventListener("dragover", function (e) {
    var holder = e.target.closest ? e.target.closest("[data-pid]") : null;
    if (!holder || !list.contains(holder)) return;
    e.preventDefault();
    var pid = holder.getAttribute("data-pid");
    list.querySelectorAll(".group.drop-over").forEach(function (g) { if (g.getAttribute("data-pid") !== pid) g.classList.remove("drop-over"); });
    var head = list.querySelector('.group[data-pid="' + pid + '"]');
    if (head) head.classList.add("drop-over");
  });
  list.addEventListener("drop", function (e) {
    var holder = e.target.closest ? e.target.closest("[data-pid]") : null;
    if (!holder || !list.contains(holder)) return;
    e.preventDefault();
    list.querySelectorAll(".group.drop-over").forEach(function (g) { g.classList.remove("drop-over"); });
    agentDrop(e, holder.getAttribute("data-pid"));
  });
  list.addEventListener("dragend", function () {
    list.querySelectorAll(".group.drop-over").forEach(function (g) { g.classList.remove("drop-over"); });
  });
}
export function agentDragStart(e, key) { try { e.dataTransfer.setData("text/plain", key); e.dataTransfer.effectAllowed = "move"; } catch (_) {} }
export function agentDrop(e, pid) {
  var key = "";
  try { key = e.dataTransfer.getData("text/plain"); } catch (_) {}
  if (key) agentDropToProject(pid, key);
}
export function agentDropToProject(pid, key) {
  if (!PROJECTS[pid] || !AGENTS[key] || key === "prime") return false;
  graphSyncAgent(key, pid, "");
  graphEnsureAgentNode(key, pid);
  saveGraphState();
  renderAgents(); renderGraph();
  return true;
}
/* v94: agen yang hanya ada di Graph (node ber-agent tanpa project, dan
   belum jadi anggota project manapun) tetap tampil di list utama, di bawah
   grup project — bukan hilang diam-diam seperti sebelum v94. Prime
   dikecualikan (dia Main chat, bukan anggota). */
function graphOnlyAgents() {
  var inProj = {};
  Object.keys(PROJECTS).forEach(function (pid) { (PROJECTS[pid].agents || []).forEach(function (a) { inProj[a.key] = true; }); });
  var seen = {}, out = [];
  Object.keys(GNODES).forEach(function (k) {
    var nd = GNODES[k];
    if (!nd.agent || nd.agent === "prime" || !AGENTS[nd.agent] || inProj[nd.agent] || seen[nd.agent]) return;
    if (nd.proj && PROJECTS[nd.proj]) return;
    seen[nd.agent] = true;
    out.push({ key: nd.agent, brief: nd.brief || "" });
  });
  return out;
}
// v97: delegated wiring — ganti inline onclick/onchange/oninput (kelas yang
// terbukti mati di WebView live, v91/v93). Pola: data-act + SATU listener
// per container persisten; render ulang innerHTML tidak memutus wiring.
var detailWired = false;
function detailWire() {
  if (detailWired) return;
  var box = document.getElementById("detailBody"); if (!box) return; detailWired = true;
  box.addEventListener("click", function (e) {
    if (!e.target || !e.target.closest) return;
    var el = e.target.closest("[data-act]"); if (!el || !box.contains(el)) return;
    var act = el.getAttribute("data-act"), idx = parseInt(el.getAttribute("data-idx") || "0", 10);
    if (act === "d-avatar") detailAvatarPick();
    else if (act === "d-model-toggle") detailModelToggle();
    else if (act === "d-effort-toggle") detailEffortToggle();
    else if (act === "d-note") detailNote(el.getAttribute("data-text") || "");
    else if (act === "d-mem-toggle") detailMemToggle();
    else if (act === "d-skill-list") toggleSkillList();
    else if (act === "d-files-toggle") detailFilesToggle();
    else if (act === "d-show") showView(el.getAttribute("data-view") || "home");
    else if (act === "d-mem-add") detailMemAdd();
    else if (act === "d-mem-del") detailMemDel(idx);
    else if (act === "d-files-pick") detailFilesPick();
    else if (act === "d-files-del") detailFilesDel(idx);
    else if (act === "d-go-graph") detailGoGraph(el.getAttribute("data-key") || "");
  });
  box.addEventListener("change", function (e) {
    if (!e.target || !e.target.closest) return;
    var el = e.target.closest("[data-act]"); if (!el || !box.contains(el)) return;
    var act = el.getAttribute("data-act");
    if (act === "d-skill") detailSkillToggle(el.getAttribute("data-skill") || "", el.checked);
    else if (act === "d-rename") renameAgent(el.value);
    else if (act === "d-retitle") retitleAgent(el.value);
    else if (act === "d-instructions") setInstructions(el.value);
    else if (act === "d-model-set") detailModelSet(el.value);
    else if (act === "d-effort-set") detailEffortSet(el.value);
    else if (act === "d-notify") homeNotifyToggle(el.checked);
  });
}
var searchWired = false;
function searchWire() {
  if (searchWired) return;
  var box = document.getElementById("searchResults"); if (!box) return; searchWired = true;
  box.addEventListener("click", function (e) {
    if (!e.target || !e.target.closest) return;
    var el = e.target.closest("[data-act]"); if (!el || !box.contains(el)) return;
    if (el.getAttribute("data-act") === "s-jump") searchJump(parseInt(el.getAttribute("data-idx") || "0", 10));
  });
}
var kanbanWired = false;
function kanbanWire() {
  if (kanbanWired) return;
  var box = document.getElementById("kanbanBox");
  if (box) box.addEventListener("click", function (e) {
    if (!e.target || !e.target.closest) return;
    var el = e.target.closest("[data-act]"); if (!el || !box.contains(el)) return;
    var act = el.getAttribute("data-act"), idx = parseInt(el.getAttribute("data-idx") || "0", 10);
    if (act === "kb-open") kbOpen(idx);
    else if (act === "kb-open-pid") kbOpenPid(el.getAttribute("data-pid") || "", idx);
    else if (act === "kb-add-list") addKanbanList();
  });
  var dlg = document.getElementById("kbDlg");
  if (dlg) dlg.addEventListener("click", function (e) {
    if (!e.target || !e.target.closest) return;
    var el = e.target.closest("[data-act]"); if (!el || !dlg.contains(el)) return;
    var act = el.getAttribute("data-act");
    if (act === "kb-close") kbClose();
    else if (act === "kb-team-save") kbTeamSave();
    else if (act === "kb-save") kbSave();
    else if (act === "kb-approve") kbApprove();
    else if (act === "kb-ask-del") kbAskDel();
    else if (act === "kb-del") kbDel();
    else if (act === "kb-add-comment") kbAddComment();
  });
  if (box || dlg) kanbanWired = true;
}
var libWired = false;
function libWire() {
  if (libWired) return;
  var grid = document.getElementById("libGrid");
  if (grid) grid.addEventListener("click", function (e) {
    if (!e.target || !e.target.closest) return;
    var el = e.target.closest("[data-act]"); if (!el || !grid.contains(el)) return;
    var act = el.getAttribute("data-act"), idx = parseInt(el.getAttribute("data-idx") || "0", 10);
    if (act === "lib-media") libMedia(idx);
    else if (act === "lib-delete") libDelete(idx);
    else if (act === "lib-revise") libRevise(idx);
    else if (act === "lib-restore") libRestoreArchived(idx);
  });
  var dd = document.getElementById("libDetailDlg");
  if (dd) dd.addEventListener("click", function (e) {
    if (!e.target || !e.target.closest) return;
    var el = e.target.closest("[data-act]"); if (!el || !dd.contains(el)) return;
    var act = el.getAttribute("data-act"), idx = parseInt(el.getAttribute("data-idx") || "0", 10);
    if (act === "lib-close") libDetailClose();
    else if (act === "lib-close-media") { libDetailClose(); libMedia(idx); }
    else if (act === "lib-delete") libDelete(idx);
    else if (act === "lib-close-revise") { libDetailClose(); libRevise(idx); }
  });
  var cd = document.getElementById("libConfirmDlg");
  if (cd) cd.addEventListener("click", function (e) {
    if (!e.target || !e.target.closest) return;
    var el = e.target.closest("[data-act]"); if (!el || !cd.contains(el)) return;
    var act = el.getAttribute("data-act");
    if (act === "lib-confirm-close") libConfirmClose();
    else if (act === "lib-confirm-delete") libConfirmDelete();
  });
  if (grid || dd || cd) libWired = true;
}
var homeChatWired = false;
function homeChatWire() {
  if (homeChatWired) return;
  var box = document.getElementById("view-home"); if (!box) return; homeChatWired = true;
  box.addEventListener("click", function (e) {
    if (!e.target || !e.target.closest) return;
    var el = e.target.closest("[data-act]"); if (!el || !box.contains(el)) return;
    var act = el.getAttribute("data-act"), idx = parseInt(el.getAttribute("data-idx") || "0", 10);
    if (act === "chat-approve") { if (window.approveStudio) window.approveStudio(idx); }
    else if (act === "wa-cam") waCamShot();
    else if (act === "wa-rec") waRecToggle();
    else if (act === "wa-rm") waRemoveAtt(idx);
  });
}
export function renderAgents() {
    agentListWire(); detailWire(); searchWire(); kanbanWire(); libWire(); homeChatWire();
    var html = "", rowNo = -1;
    Object.keys(PROJECTS).forEach(function (pid) {
      var proj = PROJECTS[pid];
      var collapsed = !!collapsedGroups[pid];
      html += '<div class="group" data-act="toggle-group" data-pid="' + pid + '">' + (collapsed ? '▸' : '▾') + ' ' + esc(proj.name) + (pid === currentProj ? ' • PROYEK AKTIF' : '') + '</div>';
      html += '<div class="gagents" data-pid="' + pid + '"' + (collapsed ? ' style="display:none"' : '') + '>';
      proj.agents.forEach(function (a, i) {
        var ag = AGENTS[a.key], off = a.status === "Nonaktif";
        rowNo++;
        if (a.key === "prime" || off) return;
        var badgeTxt = a.running ? tr('agent.working') : a.status;
        var times = ["2:32 PM", "1:47 PM", "12:05 PM", "11:20 AM", "10:02 AM", "9:15 AM", "8:40 AM", "7:55 AM"];
        html += '<div class="agent ' + (selectedAgent === a.key && pid === currentProj ? 'sel' : '') + (a.running ? ' running' : '') + (pid === currentProj ? ' curproj' : '') + '" data-act="sel-agent" data-key="' + a.key + '" data-pid="' + pid + '" draggable="true" data-dragkey="' + a.key + '">'
          + (ag.avatar ? '<img class="av av-shape-' + (ag.shape || 'circle') + '" src="' + esc(ag.avatar) + '" style="background:' + ag.color + ';object-fit:cover;padding:0" alt="">' : '<div class="av av-shape-' + (ag.shape || 'circle') + '" style="background:' + ag.color + '">' + esc(ag.name.charAt(0)) + '</div>')
          + '<div class="meta"><b>' + esc(ag.name) + '</b> <span class="badge b-ok">' + esc(badgeTxt) + '</span><br><small>' + esc(a.task) + '</small></div>'
          + '<span class="agent-acts"><button class="iconbtn" data-act="a-play" data-idx="' + i + '" data-pid="' + pid + '" title="' + esc(tr('agent.play')) + '">\u25B6</button><button class="iconbtn" data-act="a-stop" data-idx="' + i + '" data-pid="' + pid + '" title="' + esc(tr('agent.stop')) + '">\u23F9</button><button class="iconbtn" data-act="a-deact" data-idx="' + i + '" data-pid="' + pid + '" title="' + esc(tr('agent.deactivate')) + '">\u2715</button></span>'
          + '</div>';
      });
      html += '</div>';
    });
    var gh = "";
    graphOnlyAgents().forEach(function (g) {
      var ag = AGENTS[g.key];
      var task = (g.brief || "").split("\n")[0].slice(0, 60) || ag.role;
      var grunning = graphOnlyNodes(g.key).some(function (k) { return !!GNODES[k].running; });
      gh += '<div class="agent ' + (selectedAgent === g.key ? 'sel' : '') + (grunning ? ' running' : '') + '" data-act="sel-agent" data-key="' + g.key + '" draggable="true" data-dragkey="' + g.key + '">'
        + (ag.avatar ? '<img class="av av-shape-' + (ag.shape || 'circle') + '" src="' + esc(ag.avatar) + '" style="background:' + ag.color + ';object-fit:cover;padding:0" alt="">' : '<div class="av av-shape-' + (ag.shape || 'circle') + '" style="background:' + ag.color + '">' + esc(ag.name.charAt(0)) + '</div>')
        + '<div class="meta"><b>' + esc(ag.name) + '</b> <span class="badge b-ok">' + esc(grunning ? tr('agent.working') : tr('agent.graph_badge')) + '</span><br><small>' + esc(task) + '</small></div>'
        + '<span class="agent-acts"><button class="iconbtn" data-act="g-play" data-key="' + g.key + '" title="' + esc(tr('agent.play')) + '">\u25B6</button><button class="iconbtn" data-act="g-stop" data-key="' + g.key + '" title="' + esc(tr('agent.stop')) + '">\u23F9</button><button class="iconbtn" data-act="g-deact" data-key="' + g.key + '" title="' + esc(tr('agent.deactivate')) + '">\u2715</button></span>'
        + '</div>';
    });
    if (gh) gh = '<div class="group">' + esc(tr('agent.graph_group')) + '</div><div class="gagents">' + gh + '</div>';
    /* v100 (perintah Patria 30 Okt 15:26): kotak panduan "Belum ada proyek"
       di list dihapus — list kosong cukup kosong; kunci proj.empty tetap
       dipakai empty-state Kanban, jadi tidak ikut dicabut. */
    html += gh;
    document.getElementById("agentList").innerHTML = html;
    renderGraphProjSel();
  }

/* v98 (perintah Patria 30 Okt 14:40): tombol kerja per agen aktif.
   - Play: tandai Bekerja, pastikan node Graph project itu ada, jalankan
     simulasi alur (satu-satunya "proses kerja" app saat ini).
   - Stop: bersihkan tanda Bekerja + hentikan simulasi yang sedang jalan.
   - X: Nonaktifkan -> baris hilang dari list aktif (renderAgents hanya
     merender agen aktif) DAN node Graph project itu milik agen dihapus
     (edge-nya ikut, splice in-place; node TERKUNCI dipertahankan, aturan v86).
     Reaktivasi tetap bisa lewat menu + picker (pickActivate) dan popup Graph
     (graphSyncAgent) — agen tidak dihapus permanen, hanya Nonaktif. */
export function agentPlay(idx, pid) {
    var proj = PROJECTS[pid]; if (!proj || !proj.agents[idx]) return;
    var a = proj.agents[idx]; if (a.status === "Nonaktif") return;
    a.running = true;
    var nodeKey = graphEnsureAgentNode(a.key, pid);
    if (nodeKey) { graphSel = nodeKey; renderGraph(); }
    saveHomeState(); saveGraphState(); renderAgents();
    runGraphSim("manual");
  }
export function agentStop(idx, pid) {
    var proj = PROJECTS[pid]; if (!proj || !proj.agents[idx]) return;
    proj.agents[idx].running = false;
    graphStopSim();
    saveHomeState(); renderAgents(); renderGraph();
  }
/* v99 (perintah Patria 30 Okt 14:52 + screenshot: app nol project, satu-satunya
   kartu agen yang terlihat adalah baris Dari Graph — tanpa tombol di v98).
   Koreksi cakupan: kartu Dari Graph ikut dapat kontrol langsung yang sama.
   Bedanya dengan agen project: tidak ada objek anggota project — status jalan
   disimpan di node-nya sendiri (nd.running, persisten via saveGraphState),
   dan X berarti hapus node Graph-only milik agen itu (bukan Nonaktif, karena
   memang belum jadi anggota project manapun; node terkunci dipertahankan). */
function graphOnlyNodes(key) {
  return Object.keys(GNODES).filter(function (k) { var nd = GNODES[k]; return nd.agent === key && (!nd.proj || !PROJECTS[nd.proj]); });
}
function agentGraphPlay(key) {
  var keys = graphOnlyNodes(key); if (!keys.length || !AGENTS[key]) return;
  keys.forEach(function (k) { GNODES[k].running = true; });
  graphSel = keys[0]; renderGraph();
  saveGraphState(); renderAgents();
  runGraphSim("manual");
}
function agentGraphStop(key) {
  graphOnlyNodes(key).forEach(function (k) { GNODES[k].running = false; });
  graphStopSim();
  saveGraphState(); renderAgents(); renderGraph();
}
function agentGraphDeact(key) {
  var keys = graphOnlyNodes(key).filter(function (k) { return !GNODES[k].locked; });
  if (!keys.length) return;
  keys.forEach(function (k) { delete GNODES[k]; });
  for (var i = GEDGES.length - 1; i >= 0; i--) { if (keys.indexOf(GEDGES[i].f) >= 0 || keys.indexOf(GEDGES[i].t) >= 0) GEDGES.splice(i, 1); }
  if (graphSel && keys.indexOf(graphSel) >= 0) { graphSel = null; graphPopupOpen = false; }
  saveGraphState(); renderAgents(); renderGraph(); renderGraphPopup(); renderDetail();
}
export function agentDeactivate(idx, pid) {
    var proj = PROJECTS[pid]; if (!proj || !proj.agents[idx]) return;
    var a = proj.agents[idx], key = a.key;
    a.status = "Nonaktif"; a.running = false;
    var removed = [];
    Object.keys(GNODES).forEach(function (k) { var nd = GNODES[k]; if (nd.agent === key && nd.proj === pid && !nd.locked) removed.push(k); });
    removed.forEach(function (k) { delete GNODES[k]; });
    for (var i = GEDGES.length - 1; i >= 0; i--) { if (removed.indexOf(GEDGES[i].f) >= 0 || removed.indexOf(GEDGES[i].t) >= 0) GEDGES.splice(i, 1); }
    if (graphSel && removed.indexOf(graphSel) >= 0) { graphSel = null; graphPopupOpen = false; }
    saveHomeState(); saveGraphState(); renderAgents(); renderGraph(); renderGraphPopup(); renderDetail();
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
    syncProjectUI(currentProj);
  }

function plusSlug(name, taken) {
    var base = (name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'item';
    var slug = base, i = 2;
    while (taken(slug)) { slug = base + '-' + i; i++; }
    return slug;
  }

function plusCloseMenu() { var m = document.getElementById('addMenu'); if (m) m.classList.remove('open'); }

export function selectAgent(key, pid) {
    selectedAgent = key;
    if (pid) currentProj = pid;
    syncProjectUI(currentProj);
    renderAgents(); renderDetail(); renderChat(); renderKanban();
    saveHomeState();
  }

function detailGraphTasks() {
  var rows = [];
  Object.keys(GNODES).forEach(function (k) {
    var nd = GNODES[k];
    if (nd.agent !== selectedAgent) return;
    var pn = (nd.proj && PROJECTS[nd.proj]) ? PROJECTS[nd.proj].name : "—";
    rows.push("<div class='d-row' data-act=\"d-go-graph\" data-key=\"" + esc(k) + "\"><span>" + esc(nd.name) + " • " + esc(pn) + "</span><span class='d-val'>" + esc((nd.brief || "").split("\n")[0].slice(0, 40) || "—") + " ›</span></div>");
  });
  if (!rows.length) return "";
  return "<div class='d-label'>" + tr('detail.graph_tasks') + "</div><div class='d-rows'>" + rows.join("") + "</div>";
}
export function detailGoGraph(k) {
  var nd = GNODES[k]; if (!nd) return;
  if (nd.proj && PROJECTS[nd.proj] && nd.proj !== currentProj) switchProject(nd.proj);
  showView("graph"); graphOpenPopup(k);
}
export function renderDetail() {
    var ag = AGENTS[selectedAgent];
    var ins = ag.instructions || (selectedAgent === "prime" ? "General-purpose assistant" : ag.goal);
    // Usage nyata (v75): konstanta historis + pemakaian live device-only.
    var live = readLiveCost();
    var usageVal = fmtInt(COST_TOTAL.calls + live.calls, getLang()) + ' calls · ' + fmtInt(COST_TOTAL.tokens + live.tokens, getLang()) + ' token';
    // Toggle notifikasi tersimpan (default ON, seperti lampiran).
    var notiOn = true;
    try { notiOn = window.localStorage.getItem('minime.notify') !== '0'; } catch (_) {}
    var skillsOff = ag.skillsOff || [];
    var skills = ag.skills.map(function (s) { return '<div class="skillrow"><input type="checkbox"' + (skillsOff.indexOf(s) >= 0 ? '' : ' checked') + ' data-act="d-skill" data-skill="' + esc(s) + '"> <span>' + s + '</span></div>'; }).join("");
    var memCount = (memLoad()[selectedAgent] || []).length;
    var fileCount = (fileLoad()[selectedAgent] || []).length;
    document.getElementById("detailBody").innerHTML =
      '<div class="detail-avatar-wrap"><div class="detail-avatar av-shape-' + (ag.shape || 'circle') + '" style="background:' + ag.color + '">' + (ag.avatar ? '<img src="' + esc(ag.avatar) + '" style="width:100%;height:100%;object-fit:cover;border-radius:inherit" alt="">' : esc(ag.name.charAt(0))) + '</div><button class="avatar-edit" data-act="d-avatar" title="Ubah avatar">✎</button></div>'
      + '<div class="d-label">' + tr('detail.name') + '</div><input type="text" class="d-field" value="' + esc(ag.name) + '" data-act="d-rename">'
      + '<div class="d-label">' + tr('detail.title') + '</div><input type="text" class="d-field" placeholder="Describe what your agent does" value="' + esc(ag.role) + '" data-act="d-retitle">'
      + '<div class="d-label">' + tr('detail.instructions') + '</div><textarea class="d-field d-area" data-act="d-instructions">' + esc(ins) + '</textarea>'
      + '<div class="d-label">' + tr('detail.brain') + '</div><div class="d-rows">'
      + (detailModelOpen ? '<div class="d-row"><span>' + tr('detail.model') + '</span><select class="d-val" data-act="d-model-set">' + detailModelOpts(ag) + '</select></div>' : '<div class="d-row" data-act="d-model-toggle"><span>' + tr('detail.model') + '</span><span class="d-val">' + esc(ag.model || tr('detail.model.default')) + ' ›</span></div>')
      + (detailEffortOpen ? '<div class="d-row"><span>' + tr('detail.reasoning') + '</span><select class="d-val" data-act="d-effort-set">' + detailEffortOpts(ag) + '</select></div>' : '<div class="d-row" data-act="d-effort-toggle"><span>' + tr('detail.reasoning') + '</span><span class="d-val">' + (ag.effort ? esc(ag.effort) + ' ↕' : tr('detail.val.low')) + '</span></div>')
      + '</div>'
      + '<div class="d-label">' + tr('detail.knows') + '</div><div class="d-rows">'
      + '<div class="d-row" data-act="d-mem-toggle"><span>' + tr('detail.memories') + '</span><span class="d-val">' + tr('detail.mem.count', {n: memCount}) + ' ›</span></div>'
      + '<div class="d-row" data-act="d-skill-list"><span>' + tr('detail.skills') + '</span><span class="d-val">' + ag.skills.length + ' assigned ›</span></div>'
      + '<div id="skillList" style="display:none">' + skills + '</div>'
      + '<div class="d-row" data-act="d-files-toggle"><span>' + tr('detail.files') + '</span><span class="d-val">' + tr('detail.files.count', {n: fileCount}) + ' ›</span></div>'
      + '<div class="d-row" data-act="d-note" data-text="' + esc(tr('detail.note.tables', {name: ag.name})) + '"><span>' + tr('detail.tables') + '</span><span class="d-val">' + tr('detail.val.tables') + '</span></div></div>'
      + '<div class="d-label">' + tr('detail.does') + '</div><div class="d-rows">'
      + '<div class="d-row" data-act="d-show" data-view="graph"><span>' + tr('detail.routines') + '</span><span class="d-val">' + tr('detail.val.configured') + '</span></div>'
      + '<div class="d-row" data-act="d-show" data-view="billing"><span>' + tr('detail.usage') + '</span><span class="d-val">' + usageVal + ' ›</span></div>'
      + '<div class="d-row" data-act="d-note" data-text="' + esc(tr('detail.note.publish')) + '"><span>' + tr('detail.publish') + '</span><span class="d-val">›</span></div></div>'
      + detailGraphTasks()
      + '<div class="d-label">' + tr('detail.rules') + '</div><div class="d-rows">'
      + '<div class="d-row" data-act="d-note" data-text="' + esc(tr('detail.note.permissions')) + '"><span>' + tr('detail.permissions') + '</span><span class="d-val">' + tr('detail.val.fullaccess') + '</span></div>'
      + '<div class="d-row" data-act="d-note" data-text="' + esc(tr('detail.note.folders')) + '"><span>' + tr('detail.folders') + '</span><span class="d-val">' + tr('detail.val.allfiles') + '</span></div>'
      + '<div class="d-row"><span>' + tr('detail.notifications') + '</span><label class="d-switch"><input type="checkbox" id="homeNotify"' + (notiOn ? ' checked' : '') + ' data-act="d-notify"><span class="d-slider"></span></label></div>'
      + '<div class="d-row" data-act="d-show" data-view="settings"><span>' + tr('detail.advanced') + '</span><span class="d-val">›</span></div></div>'
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
function syncProjectUI(pid) {
  var cp = document.getElementById('chatProj'); if (cp) cp.textContent = PROJECTS[pid] ? PROJECTS[pid].name : "—";
  renderGraphProjSel();
}
export function switchProject(pid) {
    if (!PROJECTS[pid]) return;
    currentProj = pid;
    var _pa = PROJECTS[pid].agents || [];
    if (_pa.length && !_pa.some(function (a) { return a.key === selectedAgent; })) selectedAgent = _pa[0].key; saveHomeState();
    syncProjectUI(pid);
    renderAgents(); renderChat(); renderKanban(); renderDetail(); renderGraph();
  }

/* v101 (temuan live Patria 30 Okt 15:46: tanpa project, input chat terkunci
   total — renderChat men-disable input DAN sendChatReal early-return).
   Main chat kini jalan tanpa project: pesannya disimpan di localStorage
   'minime.mainChat' (bukan PROJECTS), tampil di kotak chat yang sama, dan
   tetap bisa delegasi + model call (graphNoteDelegation dan
   isAgentDeactivated sudah aman tanpa project). Begitu project pertama
   dibuat, chat beralih ke chat project itu; Main chat tersimpan terpisah. */
var MAINCHAT = null;
function mainChatGet() {
  if (MAINCHAT) return MAINCHAT;
  try { MAINCHAT = JSON.parse(window.localStorage.getItem('minime.mainChat') || '[]'); } catch (_) { MAINCHAT = []; }
  if (!Array.isArray(MAINCHAT)) MAINCHAT = [];
  return MAINCHAT;
}
function mainChatSave() { try { window.localStorage.setItem('minime.mainChat', JSON.stringify(mainChatGet().slice(-500))); } catch (_) {} }
export function renderChat() {
    var box = document.getElementById("chatBox");
    box.innerHTML = "";
    var _cp = PROJECTS[currentProj];
    var _cpEl = document.getElementById("chatProj"); if (_cpEl) _cpEl.textContent = _cp ? _cp.name : "Main chat";
    var _ci = document.getElementById("chatInput"); if (_ci) _ci.disabled = false;
    var _msgs = _cp ? _cp.chat : mainChatGet();
    _msgs.forEach(function (m, i) {
      var div = document.createElement("div");
      div.setAttribute("data-idx", String(i));
      div.className = "msg " + (m.who === "user" ? "user" : (m.curation ? "curation" : (m.who === "prime" ? "prime" : "")));
      var who = esc(String(m.name || ""));
      // N1 v87: hanya pesan user di-escape (input luar tak boleh jadi HTML);
      // pesan agen adalah HTML app sendiri (mis. tombol Buka di Media Studio).
      var body = m.who === "user" ? esc(m.text) : m.text;
      div.innerHTML = m.curation
        ? '<div class="msg-col"><div class="cur-label">KURASI PRIME</div><div class="bubble">' + body + '</div></div>'
        : '<div class="body"><div class="bubble"><div class="who">' + who + '</div>' + body + '</div></div>';
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
    if (!pid) {
      var inGraph = Object.keys(GNODES).some(function (k) { return GNODES[k].agent === key; });
      if (inGraph) selectAgent(key, null);
      return;
    }
    if (pid === currentProj) { selectAgent(key, pid); return; }
    collapsedGroups[pid] = false;
    try { window.localStorage.setItem('minime.agentGroups', JSON.stringify(collapsedGroups)); } catch (e) {}
    renderAgents();
  }

export function postChat(who, name, color, text, curation) {
    if (!PROJECTS[currentProj]) {
      var _mc = mainChatGet();
      _mc.push({ who: who, name: name, color: color, text: text, curation: !!curation });
      if (_mc.length > 500) _mc.splice(0, _mc.length - 500);
      mainChatSave(); renderChat(); return;
    }
    PROJECTS[currentProj].chat.push({ who: who, name: name, color: color, text: text, curation: !!curation });
    // v89 (audit m2): cap 500 pesan/proyek — tanpa cap, tiap aksi menulis
    // ulang seluruh riwayat (saveHomeState men-stringify semua chat).
    var _c = PROJECTS[currentProj].chat;
    if (_c.length > 500) _c.splice(0, _c.length - 500);
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
    postChat("user", "Patria", "#374151", text);
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
    results.innerHTML = hits.map(function (h) { return '<div class="search-hit" data-act=\"s-jump\" data-idx=\"' + h.i + '\" style="background:#fff;border:1px solid #ddd;border-radius:8px;padding:12px;margin-bottom:8px;cursor:pointer"><b>' + esc(h.m.name) + ':</b> ' + h.m.text + '</div>'; }).join("") || "<p>" + tr('search.empty') + "</p>";
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
    if (kbProjView === "all") { if (teamAvs) teamAvs.innerHTML = ""; if (teamNote) teamNote.textContent = ""; }
    var kbGroups = [];
    if (kbProjView === "all") kbGroups = Object.keys(PROJECTS);
    else if (kbProjView && PROJECTS[kbProjView]) kbGroups = [kbProjView];
    else if (currentProj && PROJECTS[currentProj]) kbGroups = [currentProj];
    if (!kbGroups.length) { document.getElementById("kanbanTitle").textContent = "—"; var _kbw = document.getElementById("kanbanBox"); if (_kbw) _kbw.innerHTML = "<div class='notice'>" + tr("proj.empty") + "</div>"; return; }
    document.getElementById("kanbanTitle").textContent = kbProjView === "all" ? tr("kb.proj.all") : PROJECTS[kbGroups[0]].name;
    var wrap = document.getElementById("kanbanBox");
    kbGroups.forEach(function (pid) { if (!PROJECTS[pid].kanban) PROJECTS[pid].kanban = []; });
    (function () { var ks = document.getElementById("kbProjSel"); if (!ks) return; ks.innerHTML = "<option value=\"cur\">" + esc(tr('kb.proj.cur')) + "</option><option value=\"all\">" + esc(tr('kb.proj.all')) + "</option>" + Object.keys(PROJECTS).map(function (pid) { return "<option value=\"" + esc(pid) + "\">" + esc(PROJECTS[pid].name) + "</option>"; }).join(""); ks.value = kbProjView; })();
    (function () { var kf = document.getElementById("kbFilter"); if (!kf) return; var cur = kf.value; kf.innerHTML = "<option value=\"\">" + tr('home.allagents') + "</option>" + Object.keys(AGENTS).map(function (k) { return "<option>" + esc(AGENTS[k].name) + "</option>"; }).join(""); if (cur) kf.value = cur; })();
    var filter = document.getElementById("kbFilter") ? document.getElementById("kbFilter").value : "";
    function vis(card) { return !filter || card.a === filter; }
    function kbOpenAttrs(pid, i) { return pid === currentProj ? "data-act=\"kb-open\" data-idx=\"" + i + "\"" : "data-act=\"kb-open-pid\" data-pid=\"" + esc(pid) + "\" data-idx=\"" + i + "\""; }
    if (kanbanTab === "table") {
      var rows = "";
      kbGroups.forEach(function (gpid) {
        var gc = PROJECTS[gpid].kanban || [];
        if (kbProjView === "all") rows += "<tr><td colspan='4'><b>" + esc(PROJECTS[gpid].name) + "</b></td></tr>";
        rows += gc.map(function (card, i) { return { card: card, i: i }; }).filter(function (x) { return vis(x.card); }).map(function (x) {
          return "<tr " + kbOpenAttrs(gpid, x.i) + " style='cursor:pointer'><td><b>" + esc(x.card.t) + "</b></td><td>" + esc(x.card.a) + "</td><td>" + colName(x.card.c) + "</td><td>💬 " + cardComments(x.card) + "</td></tr>";
        }).join("");
      });
      wrap.innerHTML = "<table><tr><th>Tugas</th><th>Agen</th><th>Status</th><th>Komentar</th></tr>" + rows + "</table>";
      return;
    }
    if (kanbanTab === "list") {
      var listHtml = "";
      kbGroups.forEach(function (gpid) {
        var gc = PROJECTS[gpid].kanban || [];
        if (kbProjView === "all") listHtml += "<div class='kb-projhead'>" + esc(PROJECTS[gpid].name) + "</div>";
        listHtml += gc.map(function (card, i) { return { card: card, i: i }; }).filter(function (x) { return vis(x.card); }).map(function (x) {
          return "<div class='todayitem' " + kbOpenAttrs(gpid, x.i) + " style='cursor:pointer'><b>" + esc(x.card.t) + "</b><br><small style='color:#a1a1a1'>" + tr('kanban.card.agent') + esc(x.card.a) + " • " + colName(x.card.c) + " • 💬 " + cardComments(x.card) + "</small></div>";
        }).join("");
      });
      wrap.innerHTML = listHtml || "<p>Tidak ada tugas untuk filter ini.</p>";
      return;
    }
    var totalCols = kcols().length + extraCols.length;
    wrap.innerHTML = "";
    kbGroups.forEach(function (gpid) {
      var cards = PROJECTS[gpid].kanban || [];
      if (kbProjView === "all") { var ph = document.createElement("div"); ph.className = "kb-projhead"; ph.textContent = PROJECTS[gpid].name; wrap.appendChild(ph); }
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
          if (dragCard !== null && dragPid === gpid) { cards[dragCard].c = ci; }
          dragCard = null; dragPid = null; renderKanban();
        });
        cards.forEach(function (card, i) {
          if (card.c !== ci || !vis(card)) return;
          var key = agentKeyByName(card.a), ag = AGENTS[key];
          var k = document.createElement("div"); k.className = "kcard"; k.draggable = true;
          k.innerHTML = "<div class='accent' style='background:" + colColor(ci) + "'></div><b>" + esc(card.t) + "</b><br><small style='color:#a1a1a1'>" + tr('kanban.card.agent') + esc(card.a) + "</small>"
            + "<div class='kb-cardfoot'><span>💬 " + cardComments(card) + "</span><span class='av' style='width:26px;height:26px;font-size:12px;background:" + ag.color + "'>" + esc(ag.name.charAt(0)) + "</span></div>";
          k.addEventListener("dragstart", function () { dragCard = i; dragPid = gpid; });
          k.addEventListener("mousedown", function (e) { kbDownPos = { x: e.clientX, y: e.clientY }; });
          k.addEventListener("click", function (e) { if (kbDownPos && Math.abs(e.clientX - kbDownPos.x) + Math.abs(e.clientY - kbDownPos.y) > 5) return; if (gpid === currentProj) kbOpen(i); else kbOpenPid(gpid, i); });
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
      wrap.appendChild(board);
    });
    var addList = document.createElement("div"); addList.className = "addlist";
    addList.innerHTML = "<button class='btn' data-act='kb-add-list'>＋ Add another list</button>";
    wrap.appendChild(addList);
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
    if ((e.f === k || e.t === k) && GNODES[e.f] && GNODES[e.t] && graphVisible(e.f) && graphVisible(e.t)) return "ok";
  }
  return "bad";
}
function graphVisible(k) { var nd = GNODES[k]; return !nd || !nd.proj || nd.proj === currentProj; }
function graphVisibleKeys() { return Object.keys(GNODES).filter(function (k) { return graphVisible(k); }); }
export function renderGraph() {
    var ep = document.getElementById("graphEmptyPlus");
    if (ep) ep.style.display = graphVisibleKeys().length ? "none" : "flex";
    var wrap = document.getElementById("graphNodes");
    wrap.innerHTML = "";
    var firstKey = graphVisibleKeys()[0];
    renderGraphProjSel();
    graphVisibleKeys().forEach(function (k) {
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
        [["\u29C9", graphDuplicate, "graph.dup"], [nd.locked ? "\uD83D\uDD13" : "\uD83D\uDD12", graphToggleLock, nd.locked ? "graph.unlock" : "graph.lock"]].forEach(function (b) {
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
      del.addEventListener("click", function (e) { e.stopPropagation(); graphSelect(k); graphDeleteNode(); });
      el.appendChild(del);
      el.addEventListener("mousedown", function (e) {
        if (nd.locked) return;
        dragNode = k; dragMoved = false;
        var box = graphZoomEl().getBoundingClientRect();
        var r = el.getBoundingClientRect();
        grabDX = (e.clientX - r.left) / box.width * 100;
        grabDY = (e.clientY - r.top) / box.height * 100;
        dragStart = { x: e.clientX, y: e.clientY };
        dragWH = { w: r.width / box.width * 100, h: r.height / box.height * 100 };
        e.preventDefault();
      });
      el.addEventListener("click", function () { if (!dragMoved) graphSelect(k); });
      el.addEventListener("dblclick", function () { if (!dragMoved) graphOpenPopup(k); });
      wrap.appendChild(el);
    });
    var rects = nodeRects();
    lastNodeRects = rects;
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
      path.setAttribute("data-f", e.f); path.setAttribute("data-t", e.t);
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

function createNode(template, opts) {
  opts = opts || {};
  nodeCounter++;
  var nk = "baru" + nodeCounter;
  var nd = template;
  if (!nd.name) nd.name = "Node Baru " + nodeCounter;
  GNODES[nk] = nd;
  if (opts.edgeFrom && GNODES[opts.edgeFrom]) GEDGES.push({ f: opts.edgeFrom, t: nk, l: "" });
  saveGraphState();
  graphSelect(nk);
  return nk;
}
export function addNodeAfter(key) {
  var src = GNODES[key]; if (!src) return null;
  return createNode({ sub: "simulasi", icon: "＋", x: Math.min(90, src.x + 14), y: src.y, w: 150, kind: "output", desc: "Node baru dari tombol ＋ (simulasi) — di aplikasi sungguhan, node ini bisa diisi agen/tool lain.", proj: src.proj || currentProj }, { edgeFrom: key });
}

function showNotice(id, msg) { var n = document.getElementById(id); if (n) { n.style.display = "block"; n.textContent = msg; } }
export function runGraphSim(kind) {
    kind = kind || "manual";
    if (graphRunning) return;
    graphRunning = true;
    var seq = ["trigger", "prime", "gate", "dist"];
    var i = 0;
    function step() {
      document.querySelectorAll(".n8n-node").forEach(function (el) { el.classList.remove("exec"); });
      if (i >= seq.length) {
        graphRunning = false;
        graphSimTimer = null;
        Object.keys(PROJECTS).forEach(function (pid) { (PROJECTS[pid].agents || []).forEach(function (a) { a.running = false; }); });
        Object.keys(GNODES).forEach(function (k) { GNODES[k].running = false; });
        saveGraphState();
        saveHomeState(); if (document.getElementById("agentList")) renderAgents();
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
var LIB_ARC_LS = "minime.library.archived";
var libView = "active";
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

/* v103 (Alur 1): laporan akhir project sebagai dokumen Library (kind
   "report" dirender galeri sebagai dokumen umum — lib.kind.doc). */
export function libAddReport(title, content) {
  var all = libAll();
  for (var k = 0; k < all.length; k++) {
    if (all[k].content && all[k].content === content) return { index: k, added: false };
  }
  LIB_ADDED.push({ o: title, a: "Prime Agent", s: "Selesai", badge: "b-ok", content: content, kind: "report", proj: currentProjectName(), addedAt: libTodayISO() });
  if (!saveLibAdded()) { LIB_ADDED.pop(); renderLib(); return { index: -1, added: false, saveFailed: true }; }
  renderLib();
  return { index: all.length, added: true };
}

/* Filter Library: 4 dimensi — jenis file, periode produksi, agen,
   project. Baris tanpa tanggal hanya muncul di periode "Semua" (bukan
   ditebak tanggalnya). Indeks kartu = indeks global libAll(), karena
   aksi (Media/Hapus/Revisi/detail) memakai indeks itu. */
var libFilter = { kind: "all", period: "all", agent: "all", proj: "all" };
function dateISO(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
function libTodayISO() { return dateISO(new Date()); }
function libKindOf(item) {
  if (item.kind === "script") return "script";
  if (item.kind === "image") return "image";
  return "doc";
}
function libKindLabel(kind) {
  return kind === "script" ? tr('lib.kind.script') : kind === "image" ? tr('lib.kind.image') : tr('lib.kind.doc');
}
function parseISODate(s) {
  if (!s) return null;
  var parts = s.split("-");
  if (parts.length !== 3) return null;
  var d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  return isNaN(d.getTime()) ? null : d;
}
function libDayDiff(addedAt) {
  var d = parseISODate(addedAt);
  if (!d) return null;
  var now = new Date();
  var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((today.getTime() - d.getTime()) / 86400000);
}
function libDateLabel(item) {
  var d = parseISODate(item.addedAt);
  if (!d) return "—";
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
function optionHtml(value, label, selected) { return "<option" + (value === label ? "" : " value='" + esc(String(value)) + "'") + (selected ? " selected" : "") + ">" + esc(String(label)) + "</option>"; }
function fillLibSelect(id, values, current) {
  var sel = document.getElementById(id);
  if (!sel) return "all";
  var keep = values.indexOf(current) !== -1 ? current : "all";
  sel.innerHTML = optionHtml('all', tr('lib.filter.all'), false) + values.map(function (v) { return optionHtml(v, v, v === keep); }).join("");
  return keep;
}
export function libSetFilter(dim, value) {
  if (dim === "kind" || dim === "period" || dim === "agent" || dim === "proj") libFilter[dim] = value;
  renderLib();
}

function loadLibArchived() {
  try {
    var raw = window.localStorage.getItem(LIB_ARC_LS);
    var arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter(function (x) { return x && typeof x.o === "string"; }) : [];
  } catch (_) {
    try { window.localStorage.setItem(LIB_ARC_LS + ".corrupt", window.localStorage.getItem(LIB_ARC_LS) || ""); } catch (_) {}
    return [];
  }
}
/* v90 (perintah Patria 30 Okt 09:17: Library berbatas 3 bulan, selebihnya
   DIARSIPKAN — bukan dihapus — ke storage user): batas = 3 bulan kalender
   lalu (hari dijepit ke akhir bulan target). Banding string ISO valid
   karena format YYYY-MM-DD berpadding. Item tanpa addedAt tak bisa
   dibuktikan usianya -> tidak diarsipkan. */
function libArchiveCutoff() {
  var n = new Date();
  var y = n.getFullYear(), m = n.getMonth() - 3;
  while (m < 0) { m += 12; y--; }
  var last = new Date(y, m + 1, 0).getDate();
  return dateISO(new Date(y, m, Math.min(n.getDate(), last)));
}
function libArchiveSweep() {
  var cutoff = libArchiveCutoff();
  var keep = [], moved = [];
  LIB_ADDED.forEach(function (it) {
    if (it.addedAt && it.addedAt < cutoff) {
      var c = {}; Object.keys(it).forEach(function (k) { c[k] = it[k]; });
      c.archivedAt = libTodayISO(); moved.push(c);
    } else keep.push(it);
  });
  if (!moved.length) return 0;
  var arc = loadLibArchived();
  var have = {};
  arc.forEach(function (it) { have[(it.o || "") + "|" + (it.addedAt || "") + "|" + (it.kind || "")] = true; });
  var fresh = moved.filter(function (it) { return !have[(it.o || "") + "|" + (it.addedAt || "") + "|" + (it.kind || "")]; });
  // Simpan arsip dulu; bila gagal, batal total (tidak ada data hilang).
  try { window.localStorage.setItem(LIB_ARC_LS, JSON.stringify(arc.concat(fresh))); }
  catch (_) { libSaveError = true; return 0; }
  LIB_ADDED = keep;
  saveLibAdded(); // bila ini gagal, sweep berikut melewati item ganda via dedupe di atas
  return moved.length;
}
export function libToggleView() {
  libView = libView === "archived" ? "active" : "archived";
  renderLib();
}
export function libRestoreArchived(ai) {
  var arc = loadLibArchived();
  var it = arc[ai]; if (!it) return;
  var c = {}; Object.keys(it).forEach(function (k) { if (k !== "archivedAt") c[k] = it[k]; });
  c.addedAt = libTodayISO(); // tanggal baru — kalau tidak, sweep berikut langsung mengarsipkannya lagi
  LIB_ADDED.push(c);
  if (!saveLibAdded()) { LIB_ADDED.pop(); return; } // aktif gagal simpan -> batal, arsip utuh
  arc.splice(ai, 1);
  try { window.localStorage.setItem(LIB_ARC_LS, JSON.stringify(arc)); }
  catch (_) { LIB_ADDED.pop(); saveLibAdded(); libSaveError = true; return; } // rollback terbaik (duplikat lebih baik daripada hilang)
  renderLib();
}
export function renderLib() {
    var grid = document.getElementById("libGrid");
    if (!grid) return;
    libArchiveSweep();
    var arcBtn = document.getElementById("libArchiveBtn");
    var arc = loadLibArchived();
    if (arcBtn) arcBtn.textContent = libView === "archived" ? tr('lib.view.active') : tr('lib.view.archive') + " (" + arc.length + ")";
    if (libView === "archived") {
      // Tampilan arsip terpisah: filter lain diabaikan; tanpa thumbnail (indeks beda).
      var acards = arc.map(function (item, ai) {
        return "<div class='lib-card'>"
          + "<div class='lib-title'>" + esc(item.o) + "</div>"
          + "<div class='lib-meta'>" + esc(tr('lib.card.agent')) + ": " + esc(item.a) + " • " + esc(tr('lib.card.project')) + ": " + esc(item.proj || "—") + "</div>"
          + "<div class='lib-meta'>" + esc(tr('lib.card.type')) + ": " + esc(libKindLabel(libKindOf(item))) + " • " + esc(tr('lib.card.date')) + ": " + esc(libDateLabel(item)) + " • " + esc(tr('lib.view.archive')) + ": " + esc(item.archivedAt || "—") + "</div>"
          + "<div class='lib-actions'><button class='btn btn-sm' data-act='lib-restore' data-idx='" + ai + "'>" + esc(tr('lib.btn.restore')) + "</button></div></div>";
      });
      grid.innerHTML = acards.join("") || "<div class='se-note'>" + esc(tr('lib.archive_empty')) + "</div>";
      var cntA = document.getElementById("libFilterCount");
      if (cntA) cntA.textContent = tr('lib.count', { n: arc.length, total: arc.length });
      return;
    }
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
        + "<button class='btn btn-sm' data-act='lib-media' data-idx='" + gi + "'>" + esc(tr('lib.btn.media')) + "</button>"
        + "<button class='btn btn-sm' data-act='lib-delete' data-idx='" + gi + "'>" + esc(tr('lib.btn.delete')) + "</button>"
        + "<button class='btn btn-sm' data-act='lib-revise' data-idx='" + gi + "'>" + esc(tr('lib.btn.revise')) + "</button>"
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
  dlg.innerHTML = "<div class='lib-dialog-backdrop' data-act='lib-close'></div><div class='lib-dialog-card'>"
    + "<div class='lib-title'>" + esc(item.o) + "</div>"
    + "<div class='lib-meta'>" + esc(tr('lib.card.agent')) + ": " + esc(item.a) + " • " + esc(tr('lib.card.project')) + ": " + esc(item.proj || "—") + "</div>"
    + "<div class='lib-meta'>" + esc(tr('lib.card.type')) + ": " + esc(libKindLabel(libKindOf(item))) + " • " + esc(tr('lib.card.date')) + ": " + esc(libDateLabel(item)) + " <span class='badge " + item.badge + "'>" + esc(item.s) + "</span></div>"
    + preview
    + "<div class='lib-actions'>"
    + "<button class='btn btn-sm' data-act='lib-close-media' data-idx='" + i + "'>" + esc(tr('lib.btn.media')) + "</button>"
    + "<button class='btn btn-sm' data-act='lib-delete' data-idx='" + i + "'>" + esc(tr('lib.btn.delete')) + "</button>"
    + "<button class='btn btn-sm' data-act='lib-close-revise' data-idx='" + i + "'>" + esc(tr('lib.btn.revise')) + "</button>"
    + "<button class='btn btn-sm' data-act='lib-close'>" + esc(tr('lib.detail.close')) + "</button>"
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
  dlg.innerHTML = "<div class='lib-dialog-backdrop' data-act='lib-confirm-close'></div><div class='lib-dialog-card'>"
    + "<div class='lib-title'>" + esc(tr('lib.confirm.title')) + "</div>"
    + "<div class='lib-detail-pre'>" + esc(tr('lib.confirm.text', { title: item.o })) + "</div>"
    + "<div class='lib-actions'>"
    + "<button class='btn btn-sm' data-act='lib-confirm-delete'>" + esc(tr('lib.confirm.yes')) + "</button>"
    + "<button class='btn btn-sm' data-act='lib-confirm-close'>" + esc(tr('lib.confirm.no')) + "</button>"
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



export function renderPlanner() {
    renderNativePlanner();
  }

/* Kanban persistensi (audit v66 L-B1): snapshot build-time hanya
   fallback — bila localStorage punya Kanban tersimpan, itulah yang
   dipakai, termasuk saat ganti bahasa. */
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
    // Korup: backup mentah (pola loadGraphState) lalu pakai snapshot.
    try { var _raw = window.localStorage.getItem(KANBAN_LS); if (_raw) window.localStorage.setItem(KANBAN_LS + ".corrupt", _raw); window.localStorage.removeItem(KANBAN_LS); } catch (_) {}
  }
}

/** B7: re-derive backend data in the current language (after a language switch). */


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
  var stageOpts = CP_STAGES.map(function (st) { return optionHtml(st, st, st === lead.stage); }).join('');
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
    var leadOpts = leads.map(function (l) { return optionHtml(l.id, l.id + ' ' + l.name, false); }).join('');
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
          n.innerHTML = "<div id='waChips'></div><div id='waCamBox'><video id='waCamVideo' autoplay playsinline style='width:100%;max-height:220px;background:#000'></video> <button class='btn btn-primary' data-act='wa-cam'>" + tr('att.take') + "</button></div><div id='waRecBox'></div>";
          waRenderChips();
          document.getElementById('waCamVideo').srcObject = stream;
        }).catch(function () { var n2 = waNoteEl(); n2.style.display = 'block'; n2.textContent = tr('att.cam_unavail'); waPickFile('image/*', function (f) { waAddMeta(f.name, f.size, 'image'); }); });
      } else { var n3 = waNoteEl(); n3.style.display = 'block'; n3.textContent = tr('att.cam_unavail'); waPickFile('image/*', function (f) { waAddMeta(f.name, f.size, 'image'); }); }
      return;
    }
    if (kind === 'Audio') {
      if (window.MediaRecorder && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        var n4 = waNoteEl(); n4.style.display = 'block';
        n4.innerHTML = "<div id='waChips'></div><div id='waCamBox'></div><div id='waRecBox'><button class='btn btn-primary' data-act='wa-rec'>" + tr('att.rec_start') + "</button></div>";
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

var addMenuWired = false;
function addMenuWire() {
  var m = document.getElementById("addMenu"); if (!m || addMenuWired) return; addMenuWired = true;
  m.addEventListener("click", function (e) {
    var el = e.target.closest ? e.target.closest("[data-act]") : null;
    if (!el || !m.contains(el)) return;
    if (el.getAttribute("data-act") === "plus-agent") plusNewAgent();
    else if (el.getAttribute("data-act") === "plus-channel") plusNewChannel();
  });
}
export function renderAddMenu() {
    var menu = document.getElementById('addMenu');
    if (!menu) return;
    addMenuWire();
    menu.innerHTML = '<button class="plus-item" data-act="plus-agent"><span class="plus-ic">◎</span><span><b>' + tr('plus.new_agent') + '</b><br><small class="plus-sub">' + tr('plus.new_agent_d') + '</small></span></button>'
      + '<button class="plus-item" data-act="plus-channel"><span class="plus-ic">#</span><span><b>' + tr('plus.new_channel') + '</b><br><small class="plus-sub">' + tr('plus.new_channel_d') + '</small></span></button>';
  }

/* ---------- Menu + v76: New agent / New project / New section (ala OpenBot) ---------- */
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

function naModelLabel(m) { return tr('na.model_' + m); }
function naEffortLabel(e) { return tr('na.effort_' + e.toLowerCase().replace(' ', '_')); }

export function plusNewAgent() {
    plusCloseMenu();
    pickRender();
  }
/* v92: picker aktivasi agen (kartu ringkas, ketuk kartu -> deskripsi
   lengkap; tombol Aktifkan -> agen masuk list aktif + graph project).
   Satu listener delegated di #chanOverlay (elemen persisten) melayani
   picker + dialog project — tanpa inline onclick di innerHTML. */
var chanWired = false;
function chanWire() {
  var ov = document.getElementById("chanOverlay"); if (!ov || chanWired) return; chanWired = true;
  ov.addEventListener("click", function (e) {
    if (e.target && e.target.tagName === "INPUT" && e.target.type === "checkbox") return;
    var el = e.target.closest ? e.target.closest("[data-act]") : null;
    if (!el || !ov.contains(el)) return;
    var act = el.getAttribute("data-act"), key = el.getAttribute("data-key");
    if (act === "chan-close") ncClose();
    else if (act === "pick-expand" || act === "nc-expand") chanToggleDesc(el);
    else if (act === "pick-activate") pickActivate(key, el);
    else if (act === "pick-new") { ncClose(); naState = { color: '#F97316', shape: 'blob', model: 'meta', effort: 'Medium', modelOpen: false, name: '', help: '' }; naRender(); showView('newagent'); }
    else if (act === "pick-goto-project") { ncClose(); plusNewChannel(); }
    else if (act === "nc-create") ncCreate();
  });
  ov.addEventListener("change", function (e) {
    var t = e.target;
    if (t && t.classList && t.classList.contains("chan-check")) ncToggle(t.getAttribute("data-key"), t.checked);
  });
  ov.addEventListener("input", function (e) {
    var t = e.target; if (!t) return;
    if (t.id === "ncName") ncUpdateCreate();
    else if (t.id === "ncSearch") ncFilter(t.value);
  });
}
function chanToggleDesc(card) {
  var ov = document.getElementById("chanOverlay"); if (!ov || !card) return;
  var desc = card.querySelector(".pick-desc"); if (!desc) return;
  var show = desc.style.display === "none";
  ov.querySelectorAll(".pick-desc").forEach(function (d) { d.style.display = "none"; });
  desc.style.display = show ? "block" : "none";
}
function pickRender() {
  chanWire();
  var body = "";
  if (!currentProj || !PROJECTS[currentProj]) {
    body = "<p>" + tr('pick.noproj') + "</p><button class='btn btn-primary' data-act='pick-goto-project'>" + tr('pick.create_proj') + "</button>";
  } else {
    body = Object.keys(AGENTS).filter(function (k) { return k !== "prime"; }).map(function (k) {
      var ag = AGENTS[k];
      var ex = (PROJECTS[currentProj].agents || []).find(function (a) { return a.key === k; });
      var on = !!ex && ex.status !== "Nonaktif";
      var btn = on ? "<button class='btn' disabled>" + tr('pick.active') + "</button>" : "<button class='btn btn-primary' data-act='pick-activate' data-key='" + k + "'>" + tr('pick.activate') + "</button>";
      return "<div class='pick-card' data-act='pick-expand' data-key='" + k + "'><div class='pick-top'><span class='av av-shape-" + (ag.shape || 'circle') + "' style='background:" + ag.color + "'>" + esc(ag.name.charAt(0)) + "</span><span><b>" + esc(ag.name) + "</b><br><small>" + esc(ag.role) + "</small></span><span style='flex:1'></span>" + btn + "</div><div class='pick-desc' style='display:none'>" + esc(ag.goal || ag.role) + "</div></div>";
    }).join("");
  }
  document.getElementById('chanOverlay').innerHTML = '<div class="chan-back" data-act="chan-close"></div><div class="chan-card">'
    + '<div class="chan-head"><b>' + tr('pick.title') + '</b><button class="chan-x" data-act="chan-close">×</button></div>'
    + body
    + '<div style="margin-top:12px"><button class="btn" data-act="pick-new">' + tr('pick.new_custom') + '</button></div>'
    + '</div>';
}
function pickActivate(key, btnEl) {
  if (!currentProj || !PROJECTS[currentProj] || !AGENTS[key] || key === "prime") return;
  graphSyncAgent(key, currentProj, "");
  graphEnsureAgentNode(key, currentProj);
  saveGraphState();
  renderAgents(); renderGraph();
  if (btnEl) { btnEl.textContent = tr('pick.active'); btnEl.disabled = true; }
}
function naRender() {
    var body = document.getElementById('newAgentBody');
    if (!body) return;
    naWire();
    var letter = (naState.name.trim().charAt(0) || 'A').toUpperCase();
    var colors = NA_COLORS.map(function (c) { return '<button class="na-dot' + (naState.color === c ? ' sel' : '') + '" style="background:' + c + '" data-act="na-color" data-val="' + c + '"></button>'; }).join('');
    var shapes = NA_SHAPES.map(function (sh) { return '<button class="na-shape' + (naState.shape === sh ? ' sel' : '') + '" data-act="na-shape" data-val="' + sh + '"><span class="av av-shape-' + sh + '" style="background:' + naState.color + '">' + letter + '</span></button>'; }).join('');
    var models = ['meta', 'gemini', 'deepseek', 'qwen'].map(function (m) { return '<div class="na-model-row" data-act="na-model" data-val="' + m + '"><span class="na-radio' + (naState.model === m ? ' on' : '') + '">' + (naState.model === m ? '✓' : '') + '</span><span>' + naModelLabel(m) + '</span></div>'; }).join('');
    var efforts = NA_EFFORTS.map(function (e) { return '<button class="na-effort-btn' + (naState.effort === e ? ' sel' : '') + '" data-act="na-effort" data-val="' + e + '">' + naEffortLabel(e) + '</button>'; }).join('');
    var sugs = NA_SUGS.map(function (sg, i) { return '<div class="na-sug-card" data-act="na-sug" data-val="' + i + '"><b>' + tr(sg.name) + '</b><br><small>' + tr(sg.name + 'd') + '</small></div>'; }).join('');
    body.innerHTML = '<div class="na-wrap">'
      + '<div class="na-top"><span style="flex:1"></span><button class="na-cancel" data-act="na-cancel">' + tr('na.cancel') + '</button></div>'
      + '<div class="na-preview"><div id="naPreview" class="av av-shape-' + naState.shape + ' na-big" style="background:' + naState.color + '">' + letter + '</div></div>'
      + '<div class="na-colors">' + colors + '</div>'
      + '<div class="na-shapes">' + shapes + '</div>'
      + '<div class="d-label">' + tr('na.name') + ' *</div><input id="naName" class="d-field" value="' + esc(naState.name) + '">'
      + '<div class="d-label">' + tr('na.help') + '</div><textarea id="naHelp" class="d-field d-area" placeholder="' + esc(tr('na.help_ph')) + '">' + esc(naState.help) + '</textarea>'
      + '<div class="d-label">' + tr('na.model') + '</div><div class="na-model-field" data-act="na-model-toggle"><span>' + naModelLabel(naState.model) + ' · ' + naEffortLabel(naState.effort) + '</span><span>⌄</span></div>'
      + (naState.modelOpen ? '<div class="na-model-pop"><input id="naModelQ" class="d-field" placeholder="' + esc(tr('na.search_models')) + '"><div class="na-model-list">' + models + '</div><div class="d-label">' + tr('na.effort') + '</div><div class="na-effort">' + efforts + '</div></div>' : '')
      + '<button id="naCreateBtn" class="na-create" ' + (naState.name.trim() ? '' : 'disabled') + ' data-act="na-create">' + tr('na.create') + '</button>'
      + '<div class="d-label">' + tr('na.suggestions') + '</div><div class="na-sug">' + sugs + '</div>'
      + '</div>';
  }
var naWired = false;
function naWire() {
  var b = document.getElementById('newAgentBody'); if (!b || naWired) return; naWired = true;
  b.addEventListener("click", function (e) {
    var el = e.target.closest ? e.target.closest("[data-act]") : null;
    if (!el || !b.contains(el)) return;
    var act = el.getAttribute("data-act"), val = el.getAttribute("data-val");
    if (act === "na-color") naPickColor(val);
    else if (act === "na-shape") naPickShape(val);
    else if (act === "na-model-toggle") naModelToggle();
    else if (act === "na-model") naPickModel(val);
    else if (act === "na-effort") naEffort(val);
    else if (act === "na-sug") naSuggest(parseInt(val, 10));
    else if (act === "na-cancel") naCancel();
    else if (act === "na-create") naCreate();
  });
  b.addEventListener("input", function (e) {
    var t = e.target; if (!t) return;
    if (t.id === "naName") naNameInput(t);
    else if (t.id === "naHelp") naHelpInput(t);
    else if (t.id === "naModelQ") naModelFilter(t.value);
  });
}

export function naPickColor(c) { naState.color = c; naRender(); }
export function naPickShape(sh) { naState.shape = sh; naRender(); }
export function naModelToggle() { naState.modelOpen = !naState.modelOpen; naRender(); }
export function naPickModel(m) { naState.model = m; naState.modelOpen = false; naRender(); }
export function naEffort(e) { naState.effort = e; naRender(); }
function filterRows(selector, q) {
    q = (q || '').toLowerCase();
    document.querySelectorAll(selector).forEach(function (el) { el.style.display = el.textContent.toLowerCase().indexOf(q) !== -1 ? '' : 'none'; });
  }
export function naModelFilter(q) { filterRows('.na-model-row', q); }
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
      detailNote(tr('na.note.noproj'));
    }
  }

export function plusNewChannel() {
    plusCloseMenu(); chanWire(); ncSel = {};
    var rows = Object.keys(AGENTS).filter(function (k) { return k !== "prime"; }).map(function (k) {
      var ag = AGENTS[k];
      return '<div class="pick-card" data-act="nc-expand" data-key="' + k + '"><div class="pick-top"><input type="checkbox" class="chan-check" data-key="' + k + '"><span class="av av-shape-' + (ag.shape || 'circle') + '" style="background:' + ag.color + '">' + esc(ag.name.charAt(0)) + '</span><span><b>' + esc(ag.name) + '</b><br><small>' + esc(ag.role) + '</small></span></div><div class="pick-desc" style="display:none">' + esc(ag.goal || ag.role) + '</div></div>';
    }).join('');
    document.getElementById('chanOverlay').innerHTML = '<div class="chan-back" data-act="chan-close"></div><div class="chan-card">'
      + '<div class="chan-head"><b>' + tr('nc.title') + '</b><button class="chan-x" data-act="chan-close">×</button></div>'
      + '<div class="d-label">' + tr('nc.name') + '</div><input id="ncName" class="d-field" placeholder="' + esc(tr('nc.name_ph')) + '">'
      + '<div class="d-label">' + tr('nc.add') + '</div><input id="ncSearch" class="d-field" placeholder="' + esc(tr('nc.search')) + '">'
      + '<div class="chan-list">' + rows + '</div>'
      + '<div class="chan-foot"><button id="ncCreateBtn" class="na-create" disabled data-act="nc-create">' + tr('nc.create') + '</button></div>'
      + '</div>';
  }
export function ncClose() { document.getElementById('chanOverlay').innerHTML = ''; }
export function ncToggle(k, v) { ncSel[k] = !!v; }
export function ncUpdateCreate() { var b = document.getElementById('ncCreateBtn'), n = document.getElementById('ncName'); if (b) b.disabled = !(n && n.value.trim()); }
export function ncFilter(q) { filterRows('.chan-list .pick-card', q); }
export function ncCreate() {
    var nameEl = document.getElementById('ncName');
    var name = nameEl ? nameEl.value.trim() : '';
    if (!name) return;
    var pid = plusSlug(name, function (s) { return !!PROJECTS[s]; });
    var keys = Object.keys(ncSel).filter(function (k) { return ncSel[k] && AGENTS[k] && k !== 'prime'; });
    PROJECTS[pid] = { name: name, agents: keys.map(function (k) { return { key: k, status: 'Idle', task: '—' }; }), chat: [], kanban: [] };
    currentProj = pid;
    saveHomeState();
    ncClose();
    syncProjectUI(pid);
    graphBuildProject(pid);
    renderAgents(); renderDetail(); renderChat(); renderKanban(); renderGraph();
    detailNote(tr('nc.note.created', { name: name, n: keys.length }));
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
var dragCard = null, dragPid = null;

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
var lastNodeRects = {}, dragWH = null;

var nodeCounter = 0;

/* ---------- Graph v77: setting per node ala OpenBot ---------- */
var graphSel = null, graphZoom = 1, graphHistOn = false, graphTimer = null, graphLastCheck = null, graphPopupOpen = false;

function graphZoomEl() { return document.getElementById("graphZoom") || document.getElementById("graphBox"); }
function graphLocale() { var l = getLang(); return l === "id" ? "id-ID" : l === "zh" ? "zh-CN" : "en-US"; }

function graphTrigDef() {
  var d = new Date();
  return { type: "schedule", freq: "daily", days: [0, 1, 2, 3, 4, 5, 6], hour: 9, min: 0, ampm: "AM", active: true,
           date: graphISODate(d), monthDay: d.getDate(), month: d.getMonth() + 1, day: d.getDate(), cron: "", firedOnce: false };
}
function graphISODate(d) { return dateISO(d); }
function graphTrigFill(t) {
  var d = graphTrigDef();
  if (!t || typeof t !== "object") return d;
  Object.keys(d).forEach(function (k) { if (t[k] === undefined) t[k] = d[k]; });
  if (!Array.isArray(t.days) || !t.days.length) t.days = d.days;
  return t;
}
function graphTrigOf(nd) { if (!nd.trig) nd.trig = graphTrigDef(); return graphTrigFill(nd.trig); }

function sortDays(days) { return days.slice().sort(function (a, b) { return a - b; }); }
function graphRunAt(t, now, dir) {
  if (!t || t.type !== "schedule") return null;
  t = graphTrigFill(t);
  var h = t.hour % 12 + (t.ampm === "PM" ? 12 : 0);
  function at(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, t.min, 0, 0); }
  var n = now || new Date();
  var fwd = dir > 0;
  function after(c) { return fwd ? c > n : c <= n; }
  if (t.freq === "once") { var c1 = at(new Date(t.date + "T00:00:00")); return after(c1) ? c1 : null; }
  if (t.freq === "hourly") { var c2 = new Date(n.getFullYear(), n.getMonth(), n.getDate(), n.getHours(), t.min, 0, 0); if (fwd ? c2 <= n : c2 > n) c2 = new Date(c2.getTime() + dir * 3600000); return c2; }
  if (t.freq === "daily") { var c3 = at(n); if (fwd ? c3 <= n : c3 > n) c3 = new Date(c3.getTime() + dir * 86400000); return c3; }
  if (t.freq === "weekly") {
    var days = sortDays(t.days);
    for (var i = 0; i < 8; i++) { var d = new Date(n.getFullYear(), n.getMonth(), n.getDate() + dir * i); if (days.indexOf(d.getDay()) >= 0) { var c4 = at(d); if (after(c4)) return c4; } }
    return null;
  }
  if (t.freq === "monthly") {
    var md = Math.min(t.monthDay, 31), y = n.getFullYear(), m = n.getMonth();
    for (var k = 0; k < 2; k++) { var last = new Date(y, m + 1, 0).getDate(); var c5 = new Date(y, m, Math.min(md, last), h, t.min, 0, 0); if (after(c5)) return c5; m += dir; if (m > 11) { m = 0; y++; } if (m < 0) { m = 11; y--; } }
    return null;
  }
  if (t.freq === "yearly") {
    var y2 = n.getFullYear();
    for (var k2 = 0; k2 < 2; k2++) { var last2 = new Date(y2, t.month, 0).getDate(); var c6 = new Date(y2, t.month - 1, Math.min(t.day, last2), h, t.min, 0, 0); if (after(c6)) return c6; y2 += dir; }
    return null;
  }
  return null;
}
export function graphNextRun(t, now) { return graphRunAt(t, now, 1); }
export function graphPrevRun(t, now) { return graphRunAt(t, now, -1); }

export function graphTrigSummary(t) {
  if (!t) return "";
  if (t.type === "manual") return tr("graph.trig.manual");
  if (t.type === "webhook") return tr("graph.trig.webhook");
  t = graphTrigFill(t);
  var freq = tr("graph.freq." + t.freq);
  var time = t.hour + ":" + ("0" + t.min).slice(-2) + " " + t.ampm;
  var days = "";
  if (t.freq === "daily") days = tr("graph.every_day");
  else if (t.freq === "weekly") days = t.days.length >= 7 ? tr("graph.every_day") : sortDays(t.days).map(function (d) { return "SMTWTFS"[d]; }).join(" ");
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

/* v89 (audit M1): perbarui hanya garis yang menyentuh node yang di-drag,
   dari rect terakhir + posisi baru node (matematika murni, tanpa DOM read). */
function updateDragEdges() {
  var nd = GNODES[dragNode]; if (!nd || !dragWH) return;
  var dr = { l: nd.x, t: nd.y, r: nd.x + dragWH.w, b: nd.y + dragWH.h, cx: nd.x + dragWH.w / 2, cy: nd.y + dragWH.h / 2 };
  GEDGES.forEach(function (e) {
    if (e.f !== dragNode && e.t !== dragNode) return;
    var a = e.f === dragNode ? dr : lastNodeRects[e.f];
    var b = e.t === dragNode ? dr : lastNodeRects[e.t];
    if (!a || !b || !GNODES[e.t]) return;
    var path = document.querySelector('#graphEdges path[data-f="' + e.f + '"][data-t="' + e.t + '"]');
    if (!path) return;
    var x1, y1, x2, y2;
    if (GNODES[e.t].kind === "circle") { x1 = a.cx; y1 = a.b; x2 = b.cx; y2 = b.t; }
    else { x1 = a.r; y1 = a.cy; x2 = b.l; y2 = b.cy; }
    path.setAttribute("d", curvePath(x1, y1, x2, y2));
  });
}
export function graphSelect(key) { graphSel = GNODES[key] ? key : null; graphSelEdge = null; graphEdgeDelAsk = false; renderGraph(); renderGraphPopup(); }
export function graphClosePanel() { graphPopupOpen = false; graphSel = null; graphSelEdge = null; graphEdgeDelAsk = false; renderGraph(); renderGraphPopup(); }
function graphOpenPopup(k) { if (!GNODES[k]) return; graphSelect(k); graphPopupOpen = true; renderGraphPopup(); }
export function renderGraphProjSel() {
  ["graphProjSel"].forEach(function (id) {
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

export function renderGraphPopup() {
  var p = document.getElementById("graphPopupCard");
  var ov = document.getElementById("graphPopup");
  if (!p || !ov) return;
  graphPopupWire();
  if (!graphPopupOpen) { ov.style.display = "none"; p.innerHTML = ""; return; }
  ov.style.display = "flex";
  if (graphSelEdge) {
    var ef = GNODES[graphSelEdge.f], et = GNODES[graphSelEdge.t];
    var eh = "<div class='g-head'><span>" + tr("graph.edge.title") + "</span><button class='g-x' data-act='gclose'>×</button></div>";
    eh += "<div class='g-row'><label>" + tr("graph.edge.from") + "</label><div>" + esc(ef ? ef.name : graphSelEdge.f) + "</div></div>";
    eh += "<div class='g-row'><label>" + tr("graph.edge.to") + "</label><div>" + esc(et ? et.name : graphSelEdge.t) + "</div></div>";
    eh += "<div class='g-actions'><button class='btn' data-act='gaskedgedel'>" + tr("graph.edge.delete") + "</button></div>";
    if (graphEdgeDelAsk) eh += "<div class='g-delask'>" + tr("kb.dlg.del_ask") + " <button class='btn' data-act='gconfirmedgedel'>" + tr("graph.edge.delete") + "</button> <button class='btn' data-act='gcanceledgedel'>" + tr("kb.dlg.close") + "</button></div>";
    p.innerHTML = eh;
    return;
  }
  var nd = graphSelNode();
  if (!nd) { ov.style.display = "none"; p.innerHTML = ""; return; }
  var dis = nd.locked ? " disabled" : "";
  var html = "<div class='g-head'><span id='graphPopupTitle'>" + esc(nd.icon || "") + " " + esc(nd.name) + (nd.locked ? " 🔒" : "") + "</span><button class='g-x' data-act='gclose'>×</button></div>";
  html += "<div class='g-saved' id='graphPopupSaved'></div>";
  html += "<div class='g-row'><label>" + tr("graph.name") + "</label><input class='g-input' value=\"" + esc(nd.name) + "\" data-act='grename'" + dis + "></div>";
  html += "<div class='g-row'><label>" + tr("graph.desc") + "</label><textarea class='g-input' data-act='gredesc'" + dis + ">" + esc(nd.desc || "") + "</textarea></div>";
  if (nd.kind === "decision") {
    html += "<div class='g-row'><label>" + tr("graph.branch_true") + "</label><input class='g-input' value=\"" + esc(nd.branchT || "true") + "\" data-act='gbranch' data-side='T'" + dis + "></div>";
    html += "<div class='g-row'><label>" + tr("graph.branch_false") + "</label><input class='g-input' value=\"" + esc(nd.branchF || "false") + "\" data-act='gbranch' data-side='F'" + dis + "></div>";
  }
  if (nd.kind === "trigger") {
    var t = graphTrigOf(nd);
    html += "<div class='g-row'><label>" + tr("graph.type") + "</label><select class='g-input' data-act='gtrig' data-field='type'" + dis + ">";
    ["schedule", "manual", "webhook"].forEach(function (v) { html += optionHtml(v, tr("graph.trig." + v), t.type === v); });
    html += "</select></div>";
    if (t.type === "schedule") {
      html += "<div class='g-row'><label>" + tr("graph.freq") + "</label><select class='g-input' data-act='gtrig' data-field='freq'" + dis + ">";
      ["once", "hourly", "daily", "weekly", "monthly", "yearly", "custom"].forEach(function (v) { html += optionHtml(v, tr("graph.freq." + v), t.freq === v); });
      html += "</select></div>";
      if (t.freq === "weekly") {
        html += "<div class='g-row'><label>" + tr("graph.days") + "</label><div class='g-days'>";
        for (var d = 0; d < 7; d++) html += "<button class='g-day" + (t.days.indexOf(d) >= 0 ? " on" : "") + "' data-act='gday' data-day='" + d + "'" + dis + ">" + "SMTWTFS"[d] + "</button>";
        html += "</div></div>";
      }
      if (t.freq === "once") html += "<div class='g-row'><label>" + tr("graph.date") + "</label><input class='g-input' type='date' value='" + esc(t.date) + "' data-act='gtrig' data-field='date'" + dis + "></div>";
      if (t.freq === "monthly") html += "<div class='g-row'><label>" + tr("graph.date") + "</label><input class='g-input' type='number' min='1' max='31' value='" + t.monthDay + "' data-act='gtrignum' data-field='monthDay'" + dis + "></div>";
      if (t.freq === "yearly") {
        html += "<div class='g-row'><label>" + tr("graph.date") + "</label><div class='g-flex'><select class='g-input' data-act='gtrignum' data-field='month'>";
        MONTHS[getLang()].forEach(function (m, i) { html += optionHtml(i + 1, m, t.month === i + 1); });
        html += "</select><input class='g-input' type='number' min='1' max='31' value='" + t.day + "' data-act='gtrignum' data-field='day'" + dis + "></div></div>";
      }
      if (t.freq === "hourly") html += "<div class='g-row'><label>" + tr("graph.time") + "</label><input class='g-input' type='number' min='0' max='59' value='" + t.min + "' data-act='gtrignum' data-field='min'" + dis + "></div>";
      if (t.freq === "custom") html += "<div class='g-row'><label>" + tr("graph.cron") + "</label><input class='g-input' value=\"" + esc(t.cron) + "\" data-act='gtrig' data-field='cron'" + dis + "></div>";
      if (t.freq !== "hourly" && t.freq !== "custom") {
        html += "<div class='g-row'><label>" + tr("graph.time") + "</label><div class='g-flex'><input class='g-input' type='number' min='1' max='12' value='" + t.hour + "' data-act='gtrignum' data-field='hour'" + dis + "><span>:</span><input class='g-input' type='number' min='0' max='59' value='" + t.min + "' data-act='gtrignum' data-field='min'" + dis + "><button class='g-ampm" + (t.ampm === "AM" ? " on" : "") + "' data-act='gampm' data-val='AM'" + dis + ">AM</button><button class='g-ampm" + (t.ampm === "PM" ? " on" : "") + "' data-act='gampm' data-val='PM'" + dis + ">PM</button></div></div>";
      }
      html += "<div class='g-sum'>" + esc(graphTrigSummary(t)) + "</div>";
      html += "<div class='g-next'>" + tr("graph.next") + ": <b>" + esc(graphNextText(t)) + "</b></div>";
      html += "<label class='g-check'><input type='checkbox'" + (t.active ? " checked" : "") + " data-act='gtrigbool' data-field='active'" + dis + "> " + tr("graph.active") + "</label>";
      html += "<div class='g-note'>" + tr("graph.note.open") + "</div>";
      if (t.freq === "custom") html += "<div class='g-note'>" + tr("graph.note.custom") + "</div>";
    } else if (t.type === "manual") {
      html += "<div class='g-note'>" + tr("graph.note.manual") + "</div>";
    } else {
      html += "<div class='g-note'>" + tr("graph.note.webhook") + "</div>";
    }
    html += "<button class='g-run' data-act='grun'>" + tr("graph.run_now") + "</button>";
  }
  html += "<div class='g-row'><label>" + tr("graph.agent") + "</label><select class='g-input' data-act='gagent'" + dis + ">";
  html += optionHtml("", tr("graph.agent_none"), !nd.agent);
  Object.keys(AGENTS).forEach(function (k) { html += optionHtml(k, AGENTS[k].name, nd.agent === k); });
  html += "</select></div>";
  html += "<div class='g-row'><label>" + tr("graph.brief") + "</label><textarea class='g-input' data-act='gbrief'" + dis + ">" + esc(nd.brief || "") + "</textarea></div>";
  html += "<div class='g-actions'><button class='btn' data-act='gdup'>" + tr("graph.dup") + "</button><button class='btn' data-act='glock'>" + (nd.locked ? tr("graph.unlock") : tr("graph.lock")) + "</button><button class='btn' data-act='gdel'" + dis + ">" + tr("graph.del") + "</button></div>";
  p.innerHTML = html;
}

/* v91: popup Graph di-wire lewat listener terdaftar di kartu popup (bukan
   inline onclick). Inline terbukti mati di WebView live: tombol × node
   (addEventListener) bekerja, tapi semua tombol popup
   (Duplikat/Kunci/Hapus) tidak merespons sama sekali.
   Delegasi di kartu bertahan melewati penggantian innerHTML tiap render.
   v92: hapus node satu langkah — graphDeleteNode saja, tanpa konfirmasi
   (perintah Patria 30 Okt 11:29). */
var graphPopupWired = false;
function graphPopupDispatch(act, el) {
  switch (act) {
    case "gclose": graphClosePanel(); break;
    case "grename": graphRename(el.value); break;
    case "gredesc": graphRedesc(el.value); break;
    case "gagent": graphSetAgent(el.value); break;
    case "gbrief": graphSetBrief(el.value); break;
    case "gbranch": graphSetBranch(el.getAttribute("data-side"), el.value); break;
    case "gtrig": graphSetTrig(el.getAttribute("data-field"), el.value); break;
    case "gtrignum": graphSetTrigNum(el.getAttribute("data-field"), el.value); break;
    case "gday": graphToggleDay(parseInt(el.getAttribute("data-day"), 10)); break;
    case "gampm": graphSetAmpm(el.getAttribute("data-val")); break;
    case "gtrigbool": graphSetTrigBool(el.getAttribute("data-field"), el.checked); break;
    case "grun": graphRunNow(); break;
    case "gdup": graphDuplicate(); break;
    case "glock": graphToggleLock(); break;
    case "gdel": graphDeleteNode(); break;
    case "gaskedgedel": graphAskEdgeDel(); break;
    case "gconfirmedgedel": graphConfirmEdgeDel(); break;
    case "gcanceledgedel": graphCancelEdgeDel(); break;
  }
}
function graphPopupWire() {
  if (graphPopupWired) return;
  var card = document.getElementById("graphPopupCard");
  if (!card) return;
  graphPopupWired = true;
  card.addEventListener("click", function (e) {
    var el = e.target.closest ? e.target.closest("[data-act]") : null;
    if (!el || el.tagName !== "BUTTON" || !card.contains(el)) return;
    graphPopupDispatch(el.getAttribute("data-act"), el);
  });
  card.addEventListener("input", function (e) {
    var el = e.target.closest ? e.target.closest("[data-act]") : null;
    if (!el || !card.contains(el)) return;
    var a = el.getAttribute("data-act");
    if (a === "grename" || a === "gredesc" || a === "gbrief") graphPopupDispatch(a, el);
  });
  card.addEventListener("change", function (e) {
    var el = e.target.closest ? e.target.closest("[data-act]") : null;
    if (!el || !card.contains(el)) return;
    graphPopupDispatch(el.getAttribute("data-act"), el);
  });
}

function graphPopupSaved() { var el = document.getElementById("graphPopupSaved"); if (el) el.textContent = "✓ " + tr("graph.saved"); }
function graphPopupTitle(nd) { var el = document.getElementById("graphPopupTitle"); if (el) el.textContent = (nd.icon || "") + " " + nd.name + (nd.locked ? " 🔒" : ""); }
export function graphRename(v) { var nd = graphSelNode(); if (!nd || nd.locked) return; nd.name = v; saveGraphState(); var nl = document.querySelector('[data-nkey="' + graphSel + '"] .nname'); if (nl) nl.textContent = v; graphPopupTitle(nd); graphPopupSaved(); }
export function graphRedesc(v) { var nd = graphSelNode(); if (!nd || nd.locked) return; nd.desc = v; saveGraphState(); graphPopupSaved(); }
export function graphSetAgent(v) {
  var nd = graphSelNode(); if (!nd || nd.locked) return;
  nd.agent = v || "";
  if (v && AGENTS[v] && nd.kind !== "trigger") nd.sub = AGENTS[v].name;
  saveGraphState();
  if (v) graphSyncAgent(v, currentProj, nd.brief);
  renderGraph(); renderAgents(); renderDetail(); graphPopupSaved();
}
export function graphSetBrief(v) {
  var nd = graphSelNode(); if (!nd || nd.locked) return;
  nd.brief = v; saveGraphState(); graphPopupSaved();
  if (nd.agent) graphSyncAgent(nd.agent, currentProj, v);
}
export function graphSetBranch(side, v) { var nd = graphSelNode(); if (!nd || nd.locked) return; if (side === "T") nd.branchT = v; else nd.branchF = v; saveGraphState(); renderGraph(); renderGraphPopup(); }
function graphTrigSync(nd) { var t = graphTrigOf(nd); nd.sub = graphTrigSummary(t); }
export function graphSetTrig(field, v) { var nd = graphSelNode(); if (!nd || nd.kind !== "trigger" || nd.locked) return; graphTrigOf(nd)[field] = v; graphTrigSync(nd); saveGraphState(); renderGraph(); renderGraphPopup(); }
export function graphSetTrigNum(field, v) {
  var nd = graphSelNode(); if (!nd || nd.kind !== "trigger" || nd.locked) return;
  var n = parseInt(v, 10); if (isNaN(n)) return;
  var max = field === "hour" ? 12 : field === "min" ? 59 : field === "month" ? 12 : 31;
  var min = (field === "monthDay" || field === "day" || field === "hour" || field === "month") ? 1 : 0;
  graphTrigOf(nd)[field] = Math.max(min, Math.min(max, n));
  graphTrigSync(nd); saveGraphState(); renderGraph(); renderGraphPopup();
}
export function graphSetTrigBool(field, v) { var nd = graphSelNode(); if (!nd || nd.kind !== "trigger" || nd.locked) return; graphTrigOf(nd)[field] = !!v; saveGraphState(); renderGraph(); renderGraphPopup(); }
export function graphSetAmpm(v) { var nd = graphSelNode(); if (!nd || nd.kind !== "trigger" || nd.locked) return; graphTrigOf(nd).ampm = v; graphTrigSync(nd); saveGraphState(); renderGraph(); renderGraphPopup(); }
export function graphToggleDay(d) {
  var nd = graphSelNode(); if (!nd || nd.kind !== "trigger" || nd.locked) return;
  var t = graphTrigOf(nd);
  var i = t.days.indexOf(d);
  if (i >= 0) { if (t.days.length > 1) t.days.splice(i, 1); }
  else t.days.push(d);
  t.days = sortDays(t.days);
  graphTrigSync(nd); saveGraphState(); renderGraph(); renderGraphPopup();
}
export function graphRunNow() { runGraphSim("manual"); }
export function graphDuplicate() {
  var nd = graphSelNode(); if (!nd) return;
  var copy = JSON.parse(JSON.stringify(nd));
  copy.locked = false;
  copy.name = (nd.name || "Node") + " (salinan)";
  copy.x = Math.min(90, (copy.x || 10) + 6);
  copy.y = Math.min(84, (copy.y || 10) + 12);
  if (copy.kind === "trigger" && copy.trig) copy.trig.active = false;
  createNode(copy, {});
}
export function graphToggleLock() { var nd = graphSelNode(); if (!nd) return; nd.locked = !nd.locked; saveGraphState(); renderGraph(); renderGraphPopup(); }
/* v92 (perintah Patria 30 Okt 11:29): SATU fungsi hapus node, tanpa
   konfirmasi dua langkah. Tombol Hapus di popup dan handle × di node
   sama-sama memanggil fungsi ini; klik hapus = node terhapus. */
export function graphDeleteNode() {
  if (!graphSel || !GNODES[graphSel] || GNODES[graphSel].locked) return;
  var key = graphSel;
  delete GNODES[key];
  for (var i = GEDGES.length - 1; i >= 0; i--) { if (GEDGES[i].f === key || GEDGES[i].t === key) GEDGES.splice(i, 1); }
  graphSel = null; graphPopupOpen = false;
  saveGraphState(); renderGraph(); renderGraphPopup(); renderAgents(); renderDetail();
}
export function graphPrimeFirst() {
  // v90 (perintah Patria 30 Okt 09:23): kanvas kosong -> tombol + tengah
  // memanggil Prime sebagai tugas pertama (tengah kanvas, x/y persen).
  // v91: node + langsung terikat agen prime + project aktif.
  if (graphVisibleKeys().length) return;
  createNode({ name: "Prime Agent", sub: "Orkestrasi & kurasi", icon: "\uD83E\uDD16", x: 45, y: 45, w: 195, kind: "prime", desc: "Agen utama: memecah arahan, memanggil agen, dan mengkurasi semua hasil sebelum final.", agent: "prime", proj: currentProj }, {});
}
/* v91 (perintah Patria 30 Okt 12:38): dua arah Graph <-> menu utama.
   - Popup node: pilih agen + brief tugas -> agen itu AKTIF di project
     (ditambah bila belum ada, diaktifkan lagi bila Nonaktif) dan tugasnya
     tampil di list agen + panel detail.
   - Delegasi chat: Prime mendelegasikan -> node agen dibuat di graph
     project itu, dirangkai dari node Prime (bintang, bukan rantai palsu:
     tiap agen digantung langsung di Prime). Brief diisi dari pesan user
     hanya bila masih kosong (editan popup menang). */
function graphSyncAgent(agentKey, pid, brief) {
  if (agentKey === "prime") return;
  var proj = PROJECTS[pid]; if (!proj || !AGENTS[agentKey]) return;
  if (!proj.agents) proj.agents = [];
  var ex = null;
  proj.agents.forEach(function (a) { if (a.key === agentKey) ex = a; });
  var t = brief ? String(brief).split("\n")[0].slice(0, 60) : "";
  if (!ex) proj.agents.push({ key: agentKey, status: "Idle", task: t || "—" });
  else { if (ex.status === "Nonaktif") ex.status = "Idle"; if (t) ex.task = t; }
  saveHomeState();
}
/* v92: satu jalur pembuatan node agen per-project (dipakai delegasi chat,
   picker aktivasi, DnD, dan pembuatan project). Prime selalu dibuat sebagai
   node orkestrator, BUKAN sebagai anggota project. */
export function graphEnsureAgentNode(agentKey, pid, briefText) {
  if (!pid || !PROJECTS[pid] || !AGENTS[agentKey]) return null;
  var chain = Object.keys(GNODES).filter(function (k) { return GNODES[k].proj === pid && GNODES[k].agent; });
  var primeKey = null, aKey = null;
  chain.forEach(function (k) { if (GNODES[k].agent === "prime") primeKey = k; if (GNODES[k].agent === agentKey) aKey = k; });
  if (!primeKey) {
    primeKey = createNode({ name: "Prime Agent", sub: "Orkestrasi & kurasi", icon: "\uD83E\uDD16", x: 10, y: 32, w: 195, kind: "prime", desc: "Agen utama: memecah arahan, memanggil agen, dan mengkurasi semua hasil sebelum final.", agent: "prime", proj: pid, brief: briefText || "" }, { quiet: true });
  } else if (briefText && !GNODES[primeKey].brief) { GNODES[primeKey].brief = briefText; saveGraphState(); }
  if (agentKey === "prime") return primeKey;
  if (!aKey) {
    var n = Object.keys(GNODES).filter(function (k) { return GNODES[k].proj === pid && GNODES[k].agent; }).length;
    var nx = n < 4 ? 10 + 22 * n : 10 + 22 * (n - 4), ny = n < 4 ? 32 : 60;
    aKey = createNode({ name: AGENTS[agentKey].name, sub: AGENTS[agentKey].role || "", icon: AGENTS[agentKey].name.charAt(0), x: Math.min(88, nx), y: ny, w: 170, kind: "output", desc: "", agent: agentKey, proj: pid, brief: briefText || "" }, { edgeFrom: primeKey, quiet: true });
  } else if (briefText && !GNODES[aKey].brief) { GNODES[aKey].brief = briefText; saveGraphState(); }
  return aKey;
}
export function graphBuildProject(pid) {
  if (!pid || !PROJECTS[pid]) return;
  graphEnsureAgentNode("prime", pid);
  (PROJECTS[pid].agents || []).forEach(function (a) { if (a.key !== "prime") graphEnsureAgentNode(a.key, pid); });
}

/* v103 (Alur 1, perintah Patria 30 Okt 16:02 "lanjut"): project dari brief.
   hasProject sempat dihapus v101 sebagai dead code — kini dipakai gerbang
   Alur 1. ensureProjectForBrief membuat project HANYA bila belum ada
   project aktif; nama = baris pertama brief (maks 60 karakter). */
export function hasProject() { return !!PROJECTS[currentProj]; }
export function currentProjectName() { var p = PROJECTS[currentProj]; return p ? p.name : ""; }
export function ensureProjectForBrief(text) {
  if (PROJECTS[currentProj]) return PROJECTS[currentProj].name;
  var first = String(text || "").split("\n")[0].trim().slice(0, 60) || "Project";
  var pid = plusSlug(first, function (s) { return !!PROJECTS[s]; });
  PROJECTS[pid] = { name: first, agents: [], chat: [], kanban: [] };
  currentProj = pid;
  saveHomeState();
  syncProjectUI(pid);
  graphBuildProject(pid);
  renderAgents(); renderDetail(); renderChat(); renderKanban(); renderGraph();
  return first;
}
export function graphNoteDelegation(agentKey, briefText) {
  var pid = currentProj; if (!pid || !PROJECTS[pid] || !AGENTS[agentKey]) return;
  graphEnsureAgentNode(agentKey, pid, briefText);
  if (agentKey !== "prime") graphSyncAgent(agentKey, pid, briefText);
}
export function graphAddNode() {
  if (graphSel && GNODES[graphSel]) { addNodeAfter(graphSel); return; }
  var keys = Object.keys(GNODES);
  var last = keys.length ? keys[keys.length - 1] : null;
  var src = last ? GNODES[last] : null;
  createNode({ sub: "simulasi", icon: "＋", x: src ? Math.min(90, src.x + 14) : 45, y: src ? src.y : 45, w: 150, kind: "output", desc: "Node baru dari toolbar + Add node.", proj: currentProj }, last ? { edgeFrom: last } : {});
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
var kbDlgIdx = null, kbDlgMode = null, kbDelAsk = false, kbDownPos = null, kbDlgPid = null, kbProjView = "cur";
var graphSelEdge = null, graphEdgeDelAsk = false, graphSimTimer = null;

function waNoteEl() { return document.getElementById("waNote"); }
function waRenderChips() {
  var n = waNoteEl(); if (!n) return;
  var chips = waAttachments.map(function (a, i) { return "<span class='wa-chip'>" + esc(a.name) + " <button data-act='wa-rm' data-idx='" + i + "'>×</button></span>"; }).join(" ");
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
      box.innerHTML = "<span>" + tr("att.recording") + "</span> <button data-act='wa-rec'>" + tr("att.rec_stop") + "</button>";
    }).catch(function () { box.innerHTML = esc(tr("att.mic_unavail")); waPickFile("audio/*", function (f) { waAddMeta(f.name, f.size, "audio"); }); });
  } catch (_) { box.innerHTML = esc(tr("att.mic_unavail")); }
}

function jsonStore(key) {
  return {
    load: function () { try { return JSON.parse(localStorage.getItem(key) || "{}"); } catch (_) { return {}; } },
    save: function (o) { try { localStorage.setItem(key, JSON.stringify(o)); } catch (_) {} }
  };
}
var memStore = jsonStore("minime.agentMemories"), fileStore = jsonStore("minime.agentFiles");
function memLoad() { return memStore.load(); }
function memSave(o) { memStore.save(o); }
function fileLoad() { return fileStore.load(); }
function fileSave(o) { fileStore.save(o); }
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

function kbCards() { var pid = kbDlgPid || currentProj; return PROJECTS[pid] ? (PROJECTS[pid].kanban || []) : []; }
function kbTeam() { var p = PROJECTS[currentProj]; if (!p) return []; if (!p.team) p.team = p.agents.map(function (a) { return a.key; }); return p.team; }
export function kbOpen(i) { kbDlgPid = currentProj; kbDlgIdx = i; kbDlgMode = "card"; kbDelAsk = false; kbRenderDlg(); }
export function kbOpenPid(pid, i) { kbDlgPid = pid; kbDlgIdx = i; kbDlgMode = "card"; kbDelAsk = false; kbRenderDlg(); }
export function kbSetProj(v) { kbProjView = v; renderKanban(); }
export function kbClose() { kbDlgIdx = null; kbDlgMode = null; kbDelAsk = false; kbDlgPid = null; kbRenderDlg(); }
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
      + "<div class='kb-dlg-btns'><button class='btn btn-primary' data-act='kb-team-save'>" + tr("kb.team.save") + "</button> <button class='btn' data-act='kb-close'>" + tr("kb.dlg.close") + "</button></div></div>";
    return;
  }
  var cards = kbCards(), card = cards[kbDlgIdx];
  if (!card) { kbClose(); return; }
  var agOpts = "";
  var seen = {};
  (PROJECTS[kbDlgPid || currentProj] ? (PROJECTS[kbDlgPid || currentProj].agents || []) : []).forEach(function (a) { if (AGENTS[a.key]) { seen[a.key] = true; agOpts += optionHtml(AGENTS[a.key].name, AGENTS[a.key].name, card.a === AGENTS[a.key].name); } });
  if (!seen[agentKeyByName(card.a)]) agOpts += optionHtml(card.a, card.a, true);
  var colOpts = "";
  var total = kcols().length + extraCols.length;
  for (var ci = 0; ci < total; ci++) colOpts += optionHtml(ci, colName(ci), card.c === ci);
  var comments = (card.comments || []).map(function (c) { return "<div class='kb-comment'>" + esc(c.text) + "</div>"; }).join("") || "<p>" + tr("detail.mem.empty") + "</p>";
  var html = "<div class='kb-dlg'><h4>" + tr("kb.dlg.title") + "</h4>"
    + "<label>" + tr("kb.dlg.title_label") + "</label><input id='kbDlgTitle' class='g-input' value=\"" + esc(card.t) + "\">"
    + "<label>" + tr("kb.dlg.agent") + "</label><select id='kbDlgAgent' class='g-input'>" + agOpts + "</select>"
    + "<label>" + tr("kb.dlg.col") + "</label><select id='kbDlgCol' class='g-input'>" + colOpts + "</select>"
    + "<div class='kb-dlg-btns'><button class='btn btn-primary' data-act='kb-save'>" + tr("kb.dlg.save") + "</button> "
    + (card.c === 2 ? "<button class='btn' data-act='kb-approve'>" + tr("kb.dlg.approve") + "</button> " : "")
    + "<button class='btn' data-act='kb-ask-del'>" + tr("kb.dlg.delete") + "</button> <button class='btn' data-act='kb-close'>" + tr("kb.dlg.close") + "</button></div>";
  if (kbDelAsk) html += "<div class='g-delask'>" + tr("kb.dlg.del_ask") + " <button class='btn' data-act='kb-del'>" + tr("kb.dlg.delete") + "</button> <button class='btn' data-act='kb-close'>" + tr("kb.dlg.close") + "</button></div>";
  html += "<h4>" + tr("kb.dlg.comments") + " (" + (card.comments || []).length + ")</h4>" + comments
    + "<div class='g-flex'><input id='kbDlgComment' class='g-input' placeholder=\"" + esc(tr("kb.dlg.comment_ph")) + "\"> <button class='btn btn-primary' data-act='kb-add-comment'>" + tr("kb.dlg.comment_add") + "</button></div></div>";
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
export function kbTeamOpen() { if (!PROJECTS[currentProj]) return; kbDlgMode = "team"; kbDelAsk = false; kbRenderDlg(); }
export function kbTeamSave() {
  if (!PROJECTS[currentProj]) return;
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
}
export function graphSelectEdge(f, t) { graphSelEdge = { f: f, t: t }; graphSel = null; graphPopupOpen = true; graphEdgeDelAsk = false; renderGraph(); renderGraphPopup(); }
export function graphConfirmEdgeDel() {
  if (!graphSelEdge) return;
  var f = graphSelEdge.f, t = graphSelEdge.t;
  for (var i = GEDGES.length - 1; i >= 0; i--) { if (GEDGES[i].f === f && GEDGES[i].t === t) GEDGES.splice(i, 1); }
  graphSelEdge = null; graphEdgeDelAsk = false; graphPopupOpen = false;
  saveGraphState(); renderGraph(); renderGraphPopup();
}


function detailModelOpts(ag) {
  var labels = ["meta", "gemini", "deepseek", "qwen"].map(function (m) { return naModelLabel(m); });
  var opts = optionHtml('', tr("detail.model.default"), false);
  labels.forEach(function (l) { opts += optionHtml(l, l, ag.model === l); });
  if (ag.model && labels.indexOf(ag.model) < 0) opts += optionHtml(ag.model, ag.model, true);
  return opts;
}
function detailEffortOpts(ag) {
  var vals = [["Low", "na.effort_low"], ["Medium", "na.effort_medium"], ["High", "na.effort_high"], ["Extra high", "na.effort_extra"], ["Max", "na.effort_max"]];
  return vals.map(function (v) { return optionHtml(v[0], tr(v[1]), (ag.effort || "Low") === v[0]); }).join("");
}
function detailMemSection() {
  var list = (memLoad()[selectedAgent] || []);
  var rows = list.map(function (t, i) { return "<div class='d-memrow'><span>" + esc(t) + "</span> <button class='btn btn-sm' data-act='d-mem-del' data-idx='" + i + "'>" + tr("detail.mem.del") + "</button></div>"; }).join("") || "<p>" + tr("detail.mem.empty") + "</p>";
  return "<div class='d-label'>" + tr("detail.memories") + "</div><div class='d-rows'>" + rows + "<textarea id='memNew' class='d-field d-area' placeholder=\"" + esc(tr("detail.mem.ph")) + "\"></textarea><button class='btn btn-primary' data-act='d-mem-add'>" + tr("detail.mem.add") + "</button></div>";
}
function detailFilesSection() {
  var list = (fileLoad()[selectedAgent] || []);
  var rows = list.map(function (f, i) { return "<div class='d-memrow'><span>" + esc(f.name) + " (" + f.size + " B)</span> <button class='btn btn-sm' data-act='d-files-del' data-idx='" + i + "'>" + tr("detail.mem.del") + "</button></div>"; }).join("") || "<p>" + tr("detail.files.empty") + "</p>";
  return "<div class='d-label'>" + tr("detail.files") + "</div><div class='d-rows'>" + rows + "<button class='btn btn-primary' data-act='d-files-pick'>" + tr("detail.files.add") + "</button></div>";
}
export function graphAskEdgeDel() { graphEdgeDelAsk = true; renderGraphPopup(); }
export function graphCancelEdgeDel() { graphEdgeDelAsk = false; renderGraphPopup(); }

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
      try { if (!window.localStorage.getItem('minime.homeState.pre-v84')) window.localStorage.setItem('minime.homeState.pre-v84', raw); } catch (_) {}
      try { var st = JSON.parse(raw); if (st && typeof st === 'object') { st.projects = {}; st.currentProj = null; window.localStorage.setItem('minime.homeState', JSON.stringify(st)); } } catch (_) {}
    }
    try { var lb = window.localStorage.getItem('minime.library.added'); if (lb && !window.localStorage.getItem('minime.library.added.pre-v84')) window.localStorage.setItem('minime.library.added.pre-v84', lb); } catch (_) {}
    try { window.localStorage.setItem('minime.library.added', '[]'); } catch (_) {}
    try { LIB_ADDED = []; } catch (_) {}
    try { var kb = window.localStorage.getItem('minime.kanban'); if (kb && !window.localStorage.getItem('minime.kanban.pre-v84')) window.localStorage.setItem('minime.kanban.pre-v84', kb); } catch (_) {}
    try { window.localStorage.setItem('minime.kanban', JSON.stringify({ v: 2, cards: {}, team: {}, extraCols: [] })); } catch (_) {}
    var _ok = !raw;
    if (raw) { try { var vb = JSON.parse(window.localStorage.getItem('minime.homeState') || 'null'); _ok = !!vb && vb.projects && Object.keys(vb.projects).length === 0; } catch (_) { _ok = true; } }
    if (_ok) { try { window.localStorage.setItem('minime.cleaned-v84', '1'); } catch (_) {} }
  } catch (_) {}
}
/* v88 (perintah Patria 30 Okt 05:07: bersihkan dummy di menu Graph):
   migrasi sekali-jalan ala runCleanV84 — kanvas + riwayat simulasi
   dikosongkan dengan backup *.pre-v88. Hanya berjalan bila storage
   berisi (rig/storage kosong tak tersentuh: seed kode tetap berlaku
   untuk instalasi baru). Flag hanya bila baca-balik sudah kosong. */
function runCleanGraphV88() {
  try {
    if (window.localStorage.getItem('minime.cleaned-graph-v88')) return;
    var raw = null; try { raw = window.localStorage.getItem('minime.graphState'); } catch (_) {}
    var runs = null; try { runs = window.localStorage.getItem('minime.graphRuns'); } catch (_) {}
    if (raw) {
      try { if (!window.localStorage.getItem('minime.graphState.pre-v88')) window.localStorage.setItem('minime.graphState.pre-v88', raw); } catch (_) {}
      try { window.localStorage.setItem('minime.graphState', JSON.stringify({ nodes: {}, edges: [], counter: 0 })); } catch (_) {}
    }
    if (runs) {
      try { if (!window.localStorage.getItem('minime.graphRuns.pre-v88')) window.localStorage.setItem('minime.graphRuns.pre-v88', runs); } catch (_) {}
      try { window.localStorage.setItem('minime.graphRuns', '[]'); } catch (_) {}
    }
    var ok = true;
    try { var vb = JSON.parse(window.localStorage.getItem('minime.graphState') || 'null'); ok = !vb || !vb.nodes || Object.keys(vb.nodes).length === 0; } catch (_) { ok = true; }
    if (ok) { try { window.localStorage.setItem('minime.cleaned-graph-v88', '1'); } catch (_) {} }
  } catch (_) {}
}
export function initV5() {
  runCleanV84();
  runCleanGraphV88();
  libArchiveSweep();
  // Penjadwal native (v61): timer antrean mulai sekali saat app hidup.
  initSocialScheduler();
  // v77: penjadwal trigger Graph (hanya selama app terbuka).
  initGraphScheduler();
  // Audit v66 L-B1: Kanban tersimpan dimuat sebelum render pertama.
  loadKanban();
  // v76: agen/proyek kustom + pilihan terakhir dimuat sebelum render pertama.
  loadHomeState();
  // v85 (audit B1/M1): store Kanban (kartu+tim) menang atas snapshot homeState yang usang.
  loadKanban();
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
      // v89 (audit M1): geser elemen yang di-drag + garis yang menyentuhnya saja;
      // renderGraph penuh hanya sekali saat mouseup, bukan per mousemove.
      var del = document.querySelector('[data-nkey="' + dragNode + '"]');
      if (del) { del.style.left = GNODES[dragNode].x + "%"; del.style.top = GNODES[dragNode].y + "%"; }
      updateDragEdges();
    });
  document.addEventListener("mouseup", function () { if (dragNode && dragMoved) { saveGraphState(); renderGraph(); } dragNode = null; });
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
  showView = function (id) { _sv2(id); if (id === "home") renderAgents(); };
  renderAgents();
  selectAgent = function (k, pid) { _sa2(k, pid); var inp = document.getElementById('chatInput'); if (inp) inp.placeholder = 'Message ' + AGENTS[k].name; };
  waInputChanged();
  var ou = document.getElementById("ollamaUrl");
  if (ou) { try { ou.value = localStorage.getItem("minime.ollamaUrl") || "http://127.0.0.1:11434"; } catch (_) { ou.value = "http://127.0.0.1:11434"; } }

  Object.assign(window, {AGENTS, GEDGES, GNODES, LIB, PROJECTS, activateAgent, addKanbanList, addNodeAfter, agentKeyByName, campaignTab, cardComments, colColor, colName, curvePath, detailNote, doSearch, filterAgents, homeNotifyToggle, loadHomeState, naCancel, naCreate, naEffort, naHelpInput, naModelFilter, naModelToggle, naNameInput, naPickColor, naPickModel, naPickShape, naSuggest, ncClose, ncCreate, ncFilter, ncToggle, ncUpdateCreate, plusNewAgent, plusNewChannel, saveHomeState, graphSelect, graphClosePanel, renderGraphPopup, graphRename, graphRedesc, graphSetBranch, graphSetTrig, graphSetTrigNum, graphSetTrigBool, graphSetAmpm, graphToggleDay, graphRunNow, graphDuplicate, graphToggleLock, graphDeleteNode, graphAddNode, graphPrimeFirst, graphSetAgent, graphSetBrief, graphNoteDelegation, graphEnsureAgentNode, graphBuildProject, detailGoGraph, agentDropToProject, agentDrop, graphToggleHist, renderGraphHist, initGraphScheduler, graphZoomSet, graphZoomIn, graphZoomOut, graphFullscreen, saveGraphState, loadGraphState, graphNextRun, graphPrevRun, graphTrigSummary, graphNextText, isAgentDeactivated, libAddImage, libAddScript, libAll, libConfirmClose, libConfirmDelete, libDelete, libDetail, libDetailClose, libMedia, libRevise, libSetFilter, libRestoreArchived, makeResizer, mediaTab, nodeRects, postChat, renameAgent, renderAddMenu, renderAgents, renderCampaign, renderChat, renderDetail, renderGraph, renderKanban, renderLib, renderPlanner, retitleAgent, socNextRepeat, runGraphSim, selectAgent, sendChat, setInstructions, showView, switchProject, toggleAddMenu, toggleGroup, toggleSkillList, waAttach, waInputChanged, waMic, waToggleAttach, waRemoveAtt, waApplyAttachments, waClearAttachments, waCamShot, waRecToggle, detailModelToggle, detailModelSet, detailEffortToggle, detailEffortSet, detailSkillToggle, detailMemToggle, detailMemAdd, detailMemDel, detailFilesToggle, detailFilesPick, detailFilesAddFiles, detailFilesDel, detailAvatarPick, searchJump, kbOpen, kbOpenPid, kbClose, kbRenderDlg, kbSetProj, kbSave, kbAskDel, kbDel, kbApprove, kbAddComment, kbTeamOpen, kbTeamSave, graphStopSim, graphSelectEdge, graphAskEdgeDel, graphCancelEdgeDel, graphConfirmEdgeDel, ollamaCheck, cpAddLead, cpDelAdded, cpLeadDetail, cpLeadClose, cpLeadSaveStage, cpCopyDraft, cpFuAdd, cpFuToggle, cpFuDel});
}
