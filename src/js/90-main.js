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
function renderAll() {
  renderProjectMenu(); updateIssueBadge(); renderSaveState(); renderPersonFilter();
  if (UI.view === "plan") { renderGrid(); renderGantt(); renderForm(); }
  else if (UI.view === "raci") renderRaci();
  else if (UI.view === "people") renderPeople();
  else if (UI.view === "issues") renderIssues();
}
function onDataChanged() { if (!ready) return; refresh(); computeRows(); renderAll(); }

function switchView(v) {
  UI.view = v; closePop();
  $$(".tab").forEach(b => b.classList.toggle("active", b.dataset.view === v));
  for (const s of ["plan", "raci", "people", "issues"]) $("view-" + s).hidden = s !== v;
  renderAll();
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
  $("searchBox").addEventListener("input", e => { UI.search = e.target.value; computeRows(); renderGrid(); renderGantt(); });
  $("personFilter").addEventListener("change", e => { UI.person = e.target.value; computeRows(); renderGrid(); renderGantt(); });
  $("detailsBtn").onclick = () => toggleForm();
  $$("#grainSeg button").forEach(b => b.addEventListener("click", () => setGrain(b.dataset.grain)));
  $("todayBtn").onclick = () => scrollGanttTo(todayNum(), 0.3);
  $("undoBtn").onclick = undo; $("redoBtn").onclick = redo;
  $("savePill").onclick = () => { $("logPanel").hidden = !$("logPanel").hidden; renderSaveState(); };
  $("logClose").onclick = () => $("logPanel").hidden = true;
  $("slowMo").onchange = e => slowSaves = e.target.checked;
  $("projBtn").onclick = () => { const m = $("projMenu"); const open = m.hidden; $$(".menu").forEach(x => x.hidden = true); m.hidden = !open; };
  $("fileBtn").onclick = () => { const m = $("fileMenu"); const open = m.hidden; $$(".menu").forEach(x => x.hidden = true); m.hidden = !open; };
  $("fileMenu").addEventListener("click", e => {
    const act = e.target.closest("button")?.dataset.act; if (!act) return;
    $("fileMenu").hidden = true;
    ({ new: newPlanFile, open: openPlanFile, copy: saveCopy, reconnect, import: startImport, xlsx: exportXlsx, csv: exportCsv, print: () => { if (UI.view !== "plan") switchView("plan"); printPlan(); }, help: showHelp })[act]?.();
  });
  $("addPersonBtn").onclick = () => editParty(null, "person");
  $("addTeamBtn").onclick = () => editParty(null, "team");
  $$("#issueSeg button").forEach(b => b.addEventListener("click", () => { issueFilter = b.dataset.f; $$("#issueSeg button").forEach(x => x.classList.toggle("on", x === b)); renderIssues(); }));
  $("modalBack").addEventListener("pointerdown", e => { if (e.target === $("modalBack")) closeModal(); });
  // Committing a form field blurs it first, so the re-render after the change isn't skipped.
  $("formPane").addEventListener("pointerdown", e => {
    const ae = document.activeElement;
    if (ae?._commit && $("formPane").contains(ae) && !ae.contains(e.target)) { holdFormRender(); ae._commit(); }
  }, true);
  $("formPane").addEventListener("change", e => { if (e.target.closest(".f-fields") && e.target.matches("input:not([type=date]),select,textarea")) e.target.blur(); }, true);

  // splitter
  const sp = $("splitter"), pane = $("gridPane");
  pane.style.width = lsGet("pm.split", 760) + "px";
  sp.addEventListener("pointerdown", e => {
    sp.setPointerCapture(e.pointerId); sp.classList.add("drag");
    const x0 = e.clientX, w0 = pane.offsetWidth;
    const mv = ev => { pane.style.width = clamp(w0 + ev.clientX - x0, 240, innerWidth - 160) + "px"; };
    const up = () => { sp.classList.remove("drag"); sp.removeEventListener("pointermove", mv); sp.removeEventListener("pointerup", up); lsSet("pm.split", pane.offsetWidth); renderGridRows(); renderGantt(); if (UI.form) relayoutForm(); };
    sp.addEventListener("pointermove", mv); sp.addEventListener("pointerup", up);
  });
  let rt; window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { if (UI.view === "plan") { renderGridRows(); renderGantt(); if (UI.form) relayoutForm(); } }, 120); });

  document.addEventListener("keydown", e => {
    const ctrl = e.ctrlKey || e.metaKey;
    const typing = e.target.matches("input,textarea,select") && !e.target.matches("[type=checkbox]");
    if (e.key === "Escape") { if (!$("pop").hidden) { closePop(); return; } if (modalOpen()) { closeModal(); return; } $("logPanel").hidden = true; if (UI.form && !typing && !modalOpen()) { toggleForm(false); return; } }
    if (modalOpen() || typing) return;
    if (ctrl && !e.shiftKey && e.key.toLowerCase() === "z") { e.preventDefault(); undo(); }
    else if (ctrl && (e.key.toLowerCase() === "y" || (e.shiftKey && e.key.toLowerCase() === "z"))) { e.preventDefault(); redo(); }
    else if (ctrl && e.key.toLowerCase() === "i" && UI.view === "plan") { e.preventDefault(); toggleForm(); }
  });
}

hooks.onChange = onDataChanged;
hooks.onSaveState = () => { if (ready) renderSaveState(); };
hooks.onReplace = () => { UI.noteDrafts.clear(); UI.editNote = null; }; // ids from another file mean nothing here
setInterval(() => { if (ready && fileHandle) renderSaveState(); }, 15000);

(async () => {
  initToolbar(); initGrid(); initGantt(); initRaci();
  try {
    const fresh = await bootDb(WASM_B64);
    loadModel();
    if (fresh && !fileHandle && !scalar("SELECT COUNT(*) FROM task")) { mutate("Created sample plan", seedSample); undoStack.length = 0; }
  } catch (e) { toast("Startup failed: " + e.message, "err"); console.error(e); return; }
  UI.grain = lsGet("pm.grain", "week");
  $$("#grainSeg button").forEach(b => b.classList.toggle("on", b.dataset.grain === UI.grain));
  ready = true;
  refresh(); loadCollapsed(); computeRows(); renderAll();
  const r = projectRange(); scrollGanttTo(r.lo, 0.05);
  // Warn when the app is open in two tabs: both would save whole-database copies over each other.
  try {
    const bc = new BroadcastChannel("offline-pm"); let warned = false;
    bc.onmessage = e => { if (e.data === "hello") bc.postMessage("here"); if (!warned) { warned = true; toast("Offline PM is open in another tab. Edit in one tab only, or changes may overwrite each other.", "err"); } };
    bc.postMessage("hello");
  } catch { }
  if (!fsSupported) toast("This browser can't save to files. Use Chrome or Edge for live saving; Excel export still works.", "err");
  window.PM = {
    M, UI, q, run, one, scalar, mutate, undo, redo, flushSaves, refresh, renderAll, selectTask, switchView, switchProject, openRecord, toggleForm, renderForm, notesFor,
    op: { opAddTask, opIndent, opOutdent, opMove, opMoveTo, opDelete, opSetField, opAddDep, opUpdateDep, opRemoveDep, opSetPredText, opSetRole, opSetRoleParties, opAddParty, opUpdateParty, opDeleteParty, opSetMembers, opAddProject, opRenameProject, opDeleteProject, opAddNote, opEditNote, opDeleteNote },
    util: { parseYMD, fmtYMD, wdIndex, wdDay, workdays, finishFor, span, parseDuration, parsePercent, parseDateText, excelSerialToDay, parsePredText, nextWorkday, todayNum },
    io: { loadImportFile, buildPlan, doImport, collectPeople, exportWorkbook, autoMap, get W() { return W; } },
    db: { installDb, exportBytes, migrate, get rev() { return rev; }, get undoDepth() { return undoStack.length; }, get mirrorRev() { return mirrorRev; } },
    gantt: { buildScale, get SC() { return SC; }, setGrain }, cmd: { cmdAdd, cmdStructure, cmdDelete, startEdit, commitEdit, gridKey, toggleCollapse, showLevel, startImport, printPlan },
    reset() { installDb(null); M.projectId = null; UI.selId = null; refresh(); loadCollapsed(); computeRows(); renderAll(); },
    get XLSX() { return XLSX; }, get SQL() { return SQL; },
  };
})();
