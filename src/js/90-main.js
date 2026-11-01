// ---------- Wiring ----------
let ready = false;

function refresh() {
  loadModel();
  if (UI.selId != null && !M.tasks.has(UI.selId)) UI.selId = null;
  if (UI.selDep != null && !M.deps.some(d => d.id === UI.selDep)) UI.selDep = null;
}
function renderPersonFilter() {
  const sel = $("personFilter"), cur = UI.person;
  sel.innerHTML = "";
  sel.append(h("option", { value: "" }, "Everyone"));
  if (M.people.length) sel.append(h("optgroup", { label: "People" }, ...M.people.map(p => h("option", { value: "p:" + p.id, selected: cur === "p:" + p.id }, p.name))));
  if (M.teams.length) sel.append(h("optgroup", { label: "Teams" }, ...M.teams.map(p => h("option", { value: "p:" + p.id, selected: cur === "p:" + p.id }, "👥 " + p.name))));
  if (cur && !M.parties.has(+cur.slice(2))) UI.person = "";
}
// ---------- Redraws ----------
// The one place that decides what gets drawn (DECISIONS #75). Code names what went stale with redraw(...parts), and
// whatever the current view shows of it is drawn once, in a fixed order, in a microtask straight after the code that
// asked: several requests from one event draw once, and it still runs in a background tab. Code that reads the new
// DOM right away calls drawNow(). The render* functions are the drawing itself; only drawNow() calls them.
//   all            everything: header bits and the whole current view (after any data change)
//   rows           the outline's rows changed (filter, collapse): grid and Gantt in full
//   gridRows, ganttRows   repaint the visible rows (selection, scrolling)      gantt   rescale the Gantt
//   form, formForce       the record panel; formForce rebuilds it even while one of its fields has focus
//   risks, planList, raci, issues, save
const stale = new Set(); let drawQueued = false;
function redraw(...parts) {
  for (const p of parts) stale.add(p);
  if (!drawQueued) { drawQueued = true; queueMicrotask(drawNow); }
}
function drawNow() {
  drawQueued = false;
  if (!ready || !stale.size) return; // before startup finishes, requests wait for its redraw("all")
  const s = new Set(stale); stale.clear();
  const all = s.has("all"), v = UI.view, any = p => all || s.has(p);
  if (all) { renderProjectMenu(); updateIssueBadge(); updateRiskBadge(); renderPersonFilter(); }
  if (any("save")) renderSaveState();
  if (v === "plan") {
    if (any("rows")) { renderGrid(); renderGantt(); }
    else {
      if (s.has("gridRows")) renderGridRows();
      if (s.has("gantt")) renderGantt(); else if (s.has("ganttRows")) renderGanttRows();
    }
  }
  if (v === "risks") { if (any("risks")) renderRisks(); else if (s.has("planList")) renderPlanList(); }
  if (v === "raci" && any("raci")) renderRaci();
  if (v === "people" && all) renderPeople();
  if (v === "issues" && any("issues")) renderIssues();
  // The record panel last, beside the plan or the RACI matrix; asked for elsewhere, it just closes.
  if (s.has("formForce")) renderForm(true);
  else if (s.has("form") || (all && (v === "plan" || v === "raci"))) renderForm();
}
function onDataChanged() { if (!ready) return; refresh(); if (UI.collapsedFor !== collapsedKey()) loadCollapsed(); computeRows(); redraw("all"); } // another file or project: its own collapse state

function switchView(v) {
  UI.view = v; closePop();
  if (v !== "plan" && v !== "raci") { const fp = $("formPane"); fp.classList.remove("open"); }
  $$(".tab").forEach(b => b.classList.toggle("active", b.dataset.view === v));
  for (const s of ["plan", "risks", "raci", "people", "issues"]) $("view-" + s).hidden = s !== v;
  redraw("all"); drawNow(); // a view that was hidden has stale sizes and contents
  if (v === "plan") $("gridBody").focus();
}

function initToolbar() {
  $$(".tab").forEach(b => b.addEventListener("click", () => switchView(b.dataset.view)));
  $("addTaskBtn").onclick = () => cmdAdd("task");
  $("addSubBtn").onclick = () => { if (!selTask()) return toast("Select the task that should get a subtask"); cmdAdd("task", true); };
  $("addMsBtn").onclick = () => cmdAdd("milestone");
  $("indentBtn").onclick = () => cmdStructure("indent");
  $("outdentBtn").onclick = () => cmdStructure("outdent");
  $("upBtn").onclick = () => cmdStructure("up");
  $("downBtn").onclick = () => cmdStructure("down");
  $("delBtn").onclick = cmdDelete;
  $("levelSel").onchange = e => { if (e.target.value) showLevel(e.target.value); e.target.value = ""; };
  let searchTimer; // re-filter after a short pause, not on every keystroke
  $("searchBox").addEventListener("input", e => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { UI.search = e.target.value; computeRows(); redraw("rows"); }, 150); });
  $("personFilter").addEventListener("change", e => { UI.person = e.target.value; computeRows(); redraw("rows"); });
  $("detailsBtn").onclick = () => toggleForm();
  $$("#grainSeg button").forEach(b => b.addEventListener("click", () => setGrain(b.dataset.grain)));
  $("todayBtn").onclick = () => scrollGanttTo(todayNum(), 0.3);
  $("undoBtn").onclick = undo; $("redoBtn").onclick = redo;
  $("savePill").onclick = () => { $("logPanel").hidden = !$("logPanel").hidden; redraw("save"); };
  $("logClose").onclick = () => $("logPanel").hidden = true;
  $("slowMo").onchange = e => slowSaves = e.target.checked;
  $("projBtn").onclick = () => { const m = $("projMenu"); const open = m.hidden; $$(".menu").forEach(x => x.hidden = true); m.hidden = !open; };
  $("fileBtn").onclick = () => { const m = $("fileMenu"); const open = m.hidden; $$(".menu").forEach(x => x.hidden = true); m.hidden = !open; };
  $("fileMenu").addEventListener("click", e => {
    const act = e.target.closest("button")?.dataset.act; if (!act) return;
    $("fileMenu").hidden = true;
    ({ new: newPlanFile, open: openPlanFile, copy: saveCopy, reconnect, import: startImport, riskImport: startRiskImport, xlsx: exportXlsx, csv: exportCsv, print: () => { if (UI.view !== "plan") switchView("plan"); printPlan(); }, help: showHelp, backups: showBackups })[act]?.();
  });
  $("addPersonBtn").onclick = () => editParty(null, "person");
  $("addTeamBtn").onclick = () => editParty(null, "team");
  $$("#issueSeg button").forEach(b => b.addEventListener("click", () => { issueFilter = b.dataset.f; $$("#issueSeg button").forEach(x => x.classList.toggle("on", x === b)); redraw("issues"); }));
  $("modalBack").addEventListener("pointerdown", e => { if (e.target === $("modalBack")) closeModal(); });
  // Committing a form field blurs it first, so the re-render after the change isn't skipped.
  $("formPane").addEventListener("pointerdown", e => {
    const ae = document.activeElement;
    if (ae?._commit && $("formPane").contains(ae) && !ae.contains(e.target)) { holdFormRender(); ae._commit(); }
  }, true);
  $("formPane").addEventListener("change", e => { if (e.target.closest(".f-fields") && e.target.matches("input:not([type=date]),select,textarea")) e.target.blur(); }, true);

  // splitter
  const sp = $("splitter"), pane = $("gridPane");
  pane.style.width = gridFullWidth() + "px";
  sp.addEventListener("pointerdown", e => {
    sp.setPointerCapture(e.pointerId); sp.classList.add("drag");
    const x0 = e.clientX, w0 = pane.offsetWidth;
    const mv = ev => { pane.style.width = clamp(w0 + ev.clientX - x0, 240, innerWidth - 160) + "px"; };
    const up = () => { sp.classList.remove("drag"); sp.removeEventListener("pointermove", mv); sp.removeEventListener("pointerup", up); lsSet("pm.split", pane.offsetWidth + (UI.form ? formWidth() : 0)); redraw("gridRows", "gantt"); if (UI.form) relayoutForm(); };
    sp.addEventListener("pointermove", mv); sp.addEventListener("pointerup", up);
  });
  let rt; window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { if (UI.view === "risks") { if (UI.riskForm) sizeRiskForm(); $$("#riskBody textarea").forEach(autoGrow); } if (UI.view === "plan") { if (UI.form) relayoutForm(); else if (lsGet("pm.split", null) == null) pane.style.width = gridFullWidth() + "px"; redraw("gridRows", "gantt"); } }, 120); });

  document.addEventListener("keydown", e => {
    const ctrl = e.ctrlKey || e.metaKey;
    const typing = e.target.matches("input,textarea,select") && !e.target.matches("[type=checkbox]");
    if (e.key === "Escape") { if (!$("pop").hidden) { closePop(); return; } if (modalOpen()) { closeModal(); return; } $("logPanel").hidden = true; if (!typing && !modalOpen()) { if (UI.view === "risks" && UI.riskForm) { closeRiskForm(); return; } if (UI.form && (UI.view === "plan" || UI.view === "raci")) { toggleForm(false); return; } } }
    if (modalOpen() || typing) return;
    if (ctrl && !e.shiftKey && e.key.toLowerCase() === "z") { e.preventDefault(); undo(); }
    else if (ctrl && (e.key.toLowerCase() === "y" || (e.shiftKey && e.key.toLowerCase() === "z"))) { e.preventDefault(); redo(); }
    else if (ctrl && e.key.toLowerCase() === "i" && (UI.view === "plan" || UI.view === "raci")) { e.preventDefault(); toggleForm(); }
  });
}

hooks.onChange = onDataChanged;
hooks.onSaveState = () => redraw("save");
hooks.onReadOnly = () => { $("roText").textContent = readOnlyWhy; $("roBanner").hidden = false; };
hooks.onReplace = () => { UI.selId = null; UI.noteDrafts.clear(); UI.editNote = null; UI.riskSel = null; UI.riskForm = false; UI.riskFocus = null; }; // ids from another file mean nothing here
setInterval(() => { if (fileHandle) redraw("save"); }, 15000); // "saved 2 min ago" ages

(async () => {
  initToolbar(); initGrid(); initGantt(); initRaci(); initRisks();
  $("roTake").onclick = takeOverEditing;
  try {
    // Before anything is read or written: only one tab may write the buffer and the file.
    if (!(await acquireWriterLock())) setReadOnly("Offline PM is open in another tab, so this tab is read-only. Edit in the other tab, or take over here.");
    const fresh = await bootDb(WASM_B64);
    loadModel();
    if (fresh && !readOnly && !fileHandle && !scalar("SELECT COUNT(*) FROM task")) { mutate("Created sample plan", seedSample); undoStack.length = 0; }
  } catch (e) { toast("Startup failed: " + e.message, "err"); console.error(e); return; }
  UI.grain = lsGet("pm.grain", "week");
  $$("#grainSeg button").forEach(b => b.classList.toggle("on", b.dataset.grain === UI.grain));
  ready = true;
  refresh(); loadCollapsed(); computeRows(); redraw("all"); drawNow();
  const r = projectRange(); scrollGanttTo(r.lo, 0.05);
  // Browsers without Web Locks can't make a second tab read-only, so at least warn.
  if (!navigator.locks) try {
    const bc = new BroadcastChannel("offline-pm"); let warned = false;
    bc.onmessage = e => { if (e.data === "hello") bc.postMessage("here"); if (!warned) { warned = true; toast("Offline PM is open in another tab. Edit in one tab only, or changes may overwrite each other.", "err"); } };
    bc.postMessage("hello");
  } catch { }
  if (!fsSupported) toast("This browser can't save to files. Use Chrome or Edge for live saving; Excel export still works.", "err");
  const drawn = fn => (...a) => { try { return fn(...a); } finally { drawNow(); } }; // console/test calls see the result drawn
  window.PM = {
    M, UI, q, run, one, scalar, undo: drawn(undo), redo: drawn(redo), flushSaves, refresh, redraw, drawNow, notesFor,
    mutate: drawn(mutate), selectTask: drawn(selectTask), switchView: drawn(switchView), switchProject: drawn(switchProject), openRecord: drawn(openRecord), toggleForm: drawn(toggleForm),
    renderAll: drawn(() => redraw("all")), renderForm: drawn(force => redraw(force ? "formForce" : "form")),
    op: { opAddTask, opIndent, opOutdent, opMove, opMoveTo, opDelete, opSetField, opAddDep, opUpdateDep, opRemoveDep, opSetPredText, opSetRole, opSetRoleParties, opAddParty, opUpdateParty, opDeleteParty, opSetMembers, opAddProject, opRenameProject, opDeleteProject, opAddNote, opEditNote, opDeleteNote, opSetRIsA,
      opSetPersonTeam, opAddRisk, opUpdateRisk, opDeleteRisk, opAddMitigant, opUpdateMitigant, opDeleteMitigant, opLinkTask, opUnlinkTask, opSetRecParties, opSetRecRIsA, opTaskFromMitigant, opAddRecNote },
    risk: { splitMitigationPlan, closeoutRows, closeoutSummary, loadRiskImport: drawn(loadRiskImport), riskImportItems, doRiskImport: drawn(doRiskImport), openRiskRecord: drawn(openRiskRecord), closeRiskForm: drawn(closeRiskForm), renderRisks: drawn(() => redraw("risks")), get RI() { return RI; }, recNotes, toLMH },
    util: { parseYMD, fmtYMD, wdIndex, wdDay, workdays, finishFor, span, parseDuration, parsePercent, parseDateText, excelSerialToDay, parsePredText, nextWorkday, todayNum, html, setHtml },
    io: { loadImportFile, buildPlan, doImport: drawn(doImport), collectPeople, exportWorkbook, csvText, autoMap, riskPreviewText, get W() { return W; } },
    db: { installDb, exportBytes, migrate, sanitizePlan, syncWithFile, keepBackup, idb, setReadOnly, get rev() { return rev; }, get undoDepth() { return undoStack.length; }, get mirrorRev() { return mirrorRev; },
      get diskRev() { return diskRev; }, get readOnly() { return readOnly; }, get fileId() { return readFileId(db); },
      // test aid: attach a stand-in file handle without a picker
      attach(h, base = null) { fileHandle = h; filePerm = !!h; diskRev = base; }, endReadOnly() { readOnly = false; readOnlyWhy = ""; $("roBanner").hidden = true; } },
    gantt: { buildScale, get SC() { return SC; }, setGrain },
    cmd: Object.fromEntries(Object.entries({ cmdAdd, cmdStructure, cmdDelete, startEdit, commitEdit, gridKey, toggleCollapse, showLevel, startImport, printPlan }).map(([k, f]) => [k, drawn(f)])),
    reset: drawn(() => { installDb(null); M.projectId = null; UI.selId = null; refresh(); loadCollapsed(); computeRows(); redraw("all"); }),
    get XLSX() { return XLSX; }, get SQL() { return SQL; },
  };
})();
