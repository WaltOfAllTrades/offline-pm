// ---------- Outline / WBS grid (virtualized) ----------
const ROW = 30;
const UI = {
  view: "plan", selId: null, col: "name", collapsed: new Set(), search: "", person: "", grain: "week",
  rows: [], editing: null, selDep: null,
};
const COLS = [
  { key: "wbs", label: "WBS", w: 64 },
  { key: "name", label: "Task name", w: 290, edit: "text" },
  { key: "start", label: "Start", w: 92, edit: "date" },
  { key: "finish", label: "Finish", w: 92, edit: "date" },
  { key: "duration", label: "Dur.", w: 54, edit: "text" },
  { key: "percent", label: "%", w: 50, edit: "text" },
  { key: "status", label: "Status", w: 104, edit: "select" },
  { key: "pred", label: "Predecessors", w: 112, edit: "text" },
  { key: "R", label: "Responsible", w: 150, edit: "party" },
  { key: "A", label: "Accountable", w: 140, edit: "party" },
];
const colByKey = k => COLS.find(c => c.key === k);
const colIndex = k => COLS.findIndex(c => c.key === k);
const gridWidth = () => COLS.reduce((s, c) => s + c.w, 0);
const ROLLED = new Set(["start", "finish", "duration", "percent", "status"]);
const stClass = s => ({ "Not started": "st-ns", "In progress": "st-ip", "Blocked": "st-bl", "Done": "st-dn" }[s] || "st-ns");

const gridFullWidth = () => lsGet("pm.split", null) ?? Math.round(($("split").clientWidth || innerWidth) * 2 / 3);
function loadCollapsed() { UI.collapsed = new Set(lsGet("pm.collapsed." + M.projectId, [])); }
function saveCollapsed() { lsSet("pm.collapsed." + M.projectId, [...UI.collapsed]); }

function filterActive() { return !!(UI.search.trim() || UI.person); }
function matchesFilter(t) {
  if (UI.search.trim()) {
    const s = UI.search.trim().toLowerCase();
    if (!(t.name.toLowerCase().includes(s) || t.wbs === s || t.wbs.startsWith(s + ".") || (t.code || "").toLowerCase().includes(s))) return false;
  }
  if (UI.person) {
    const pid = +UI.person.slice(2), p = M.parties.get(pid);
    if (!p) return true;
    const set = p.kind === "person" ? partySetFor(pid) : new Set([pid, ...(M.members.get(pid) || [])]);
    if (!rolesOf(t.id).some(r => set.has(r.party_id))) return false;
  }
  return true;
}
function computeRows() {
  if (filterActive()) {
    const keep = new Set();
    for (const t of M.order) if (matchesFilter(t)) for (let x = t; x; x = x.parent) keep.add(x.id);
    UI.rows = M.order.filter(t => keep.has(t.id));
  } else {
    UI.rows = [];
    const walk = list => { for (const t of list) { UI.rows.push(t); if (!UI.collapsed.has(t.id)) walk(t.children); } };
    walk(M.roots);
  }
  UI.rows.forEach((t, i) => t.row = i);
}

function renderGridHead() {
  $("gridHead").innerHTML = `<div class="ghead-row" style="width:${gridWidth() + 40}px">${COLS.map(c => `<div class="gh" style="width:${c.w}px">${c.label}</div>`).join("")}</div>`;
}
function renderGrid() {
  const canvas = $("gridCanvas");
  canvas.style.height = Math.max(UI.rows.length * ROW, 10) + "px";
  canvas.style.width = gridWidth() + "px";
  renderGridRows();
}

const warnTasks = () => { const s = new Set(); for (const i of M.issues) if (i.level === "warn") s.add(i.task.id); return s; };
let _warnSet = new Set();

function chipFor(r, inherited, note = inherited ? " (inherited)" : "") {
  const p = M.parties.get(r.party_id); if (!p) return "";
  return `<span class="chip ${p.kind === "team" ? "team" : ""} ${inherited ? "inh" : ""} ${p.active ? "" : "inactive"}" title="${esc(p.name)}${p.kind === "team" ? " (team)" : ""}${esc(note)}">${p.kind === "team" ? "👥 " : ""}${esc(p.name)}</span>`;
}
const rChips = t => { const r = responsible(t); return r.list.map(x => chipFor(x, r.same, r.same ? " (same as Accountable)" : "")).join(""); };
function cellHtml(t, c) {
  switch (c.key) {
    case "wbs": return esc(t.wbs);
    case "name": {
      const caret = t.isSummary ? `<span class="caret" data-caret>${UI.collapsed.has(t.id) && !filterActive() ? "▶" : "▼"}</span>` : `<span class="caret"></span>`;
      return `<span style="width:${t.depth * 16}px;flex:none"></span>${caret}${t.isMilestone ? '<span class="ms-ico">◆</span>' : ""}<span class="nm">${esc(t.name)}</span>${_warnSet.has(t.id) ? '<span class="warn-dot" title="Has warnings, see Issues">⚠</span>' : ""}${M.noteCount.get(t.id) ? `<span class="nc" title="${M.noteCount.get(t.id)} work note(s)">💬${M.noteCount.get(t.id)}</span>` : ""}<span class="open-rec" data-open title="Open record form">↗</span>`;
    }
    case "start": return fmtShort(t.S);
    case "finish": return fmtShort(t.F);
    case "duration": return t.dur == null ? "" : t.dur + "d";
    case "percent": return t.P + "%";
    case "status": return `<span class="st ${stClass(t.ST)}">${esc(t.ST)}</span>`;
    case "pred": return esc(predText(t));
    case "R": return `<span class="chips">${rChips(t)}</span>`;
    case "A": { const a = accountable(t); return `<span class="chips">${a.list.map(r => chipFor(r, a.inherited)).join("")}</span>`; }
  }
  return "";
}

// Rows live in #gridRows; the cell editor is a sibling, so re-rendering rows (e.g. on scroll) never destroys it.
function renderGridRows() {
  const body = $("gridBody"), canvas = $("gridRows");
  _warnSet = warnTasks();
  if (!UI.rows.length) {
    canvas.innerHTML = `<div class="empty" style="width:${Math.min(gridWidth(), body.clientWidth || 600)}px">${filterActive() ? "No tasks match the filter." : "No tasks yet. Click <b>＋ Task</b> or press <kbd>Insert</kbd> to add one, or import a spreadsheet from the File menu."}</div>`;
    return;
  }
  const first = Math.max(0, Math.floor(body.scrollTop / ROW) - 8);
  const last = Math.min(UI.rows.length, Math.ceil((body.scrollTop + body.clientHeight) / ROW) + 8);
  let html = "";
  for (let i = first; i < last; i++) {
    const t = UI.rows[i];
    html += `<div class="grow ${t.isSummary ? "summary" : ""} ${t.id === UI.selId ? "sel" : ""}" data-id="${t.id}" style="top:${i * ROW}px;width:${gridWidth()}px">`;
    for (const c of COLS) {
      const ro = (t.isSummary && ROLLED.has(c.key)) ? " ro" : "";
      const cur = t.id === UI.selId && c.key === UI.col ? " cur" : "";
      html += `<div class="gc c-${c.key}${ro}${cur}" data-col="${c.key}" style="width:${c.w}px"${c.key === "wbs" ? ' title="Drag to move"' : ""}>${cellHtml(t, c)}</div>`;
    }
    html += `</div>`;
  }
  canvas.innerHTML = html;
}

// ---------- Selection ----------
function selectTask(id, { scroll = true, col } = {}) {
  UI.selId = id; if (col) UI.col = col;
  if (id != null && scroll) revealTask(id);
  renderGridRows(); renderGanttRows(); renderForm();
}
function revealTask(id) {
  const t = M.tasks.get(id); if (!t) return;
  let changed = false;
  for (let x = t.parent; x; x = x.parent) if (UI.collapsed.delete(x.id)) changed = true;
  if (changed) { saveCollapsed(); computeRows(); renderGrid(); renderGantt(); }
  if (t.row == null || UI.rows[t.row] !== t) return;
  const body = $("gridBody"), top = t.row * ROW;
  if (top < body.scrollTop) body.scrollTop = top;
  else if (top + ROW > body.scrollTop + body.clientHeight) body.scrollTop = top + ROW - body.clientHeight;
  const c = colIndex(UI.col), left = COLS.slice(0, c).reduce((s, x) => s + x.w, 0), w = COLS[c]?.w || 0;
  if (left < body.scrollLeft) body.scrollLeft = left;
  else if (left + w > body.scrollLeft + body.clientWidth) body.scrollLeft = left + w - body.clientWidth;
}
const selTask = () => M.tasks.get(UI.selId) || null;
function moveSel(dr) {
  if (!UI.rows.length) return;
  const cur = selTask(); let i = cur && UI.rows[cur.row] === cur ? cur.row : -1;
  i = clamp(i + dr, 0, UI.rows.length - 1);
  selectTask(UI.rows[i].id);
}
function moveCol(dc) { UI.col = COLS[clamp(colIndex(UI.col) + dc, 1, COLS.length - 1)].key; if (UI.selId) revealTask(UI.selId); renderGridRows(); }

function toggleCollapse(id, force) {
  const has = UI.collapsed.has(id), want = force ?? !has;
  if (want === has) return;
  want ? UI.collapsed.add(id) : UI.collapsed.delete(id);
  saveCollapsed(); computeRows(); renderGrid(); renderGantt();
}
function showLevel(level) {
  UI.collapsed.clear();
  if (level !== "all") for (const t of M.order) if (t.isSummary && t.depth >= +level - 1) UI.collapsed.add(t.id);
  if (UI.selId && UI.collapsed.size) { const t = selTask(); if (t && t.depth >= +level) UI.selId = t.parent ? ancestorAtDepth(t, +level - 1).id : t.id; }
  saveCollapsed(); computeRows(); renderGrid(); renderGantt(); renderForm();
}
function ancestorAtDepth(t, d) { let x = t; while (x.depth > d && x.parent) x = x.parent; return x; }

// ---------- Inline editing ----------
function startEdit(colKey = UI.col, initial = null) {
  const t = selTask(); if (!t) return;
  const c = colByKey(colKey); if (!c || !c.edit) return;
  if (UI.editing) commitEdit(0, 0, true);
  if (t.isSummary && ROLLED.has(c.key)) { toast("Summary rows roll up from their subtasks"); return; }
  UI.col = colKey; revealTask(t.id); renderGridRows();
  const cell = $("gridCanvas").querySelector(`.grow[data-id="${t.id}"] [data-col="${colKey}"]`);
  if (!cell) return;
  if (c.edit === "party") { openPartyPicker(cell.getBoundingClientRect(), t.id, colKey); return; }
  const left = COLS.slice(0, colIndex(colKey)).reduce((s, x) => s + x.w, 0);
  let el;
  if (c.edit === "select") {
    el = h("select", {}, ...STATUSES.map(s => h("option", { value: s, selected: s === t.ST }, s)));
    el.addEventListener("change", () => commitEdit(0, 0));
  } else {
    el = h("input", { type: c.edit === "date" && initial == null ? "date" : "text" });
    const v = { name: t.name, start: fmtYMD(t.S), finish: fmtYMD(t.F), duration: t.dur == null ? "" : t.dur + "d", percent: String(t.P), pred: predText(t) }[colKey] ?? "";
    el.value = initial ?? v;
  }
  el.className = "cell-editor";
  Object.assign(el.style, { left: left + "px", top: t.row * ROW + "px", width: c.w + (colKey === "name" ? 120 : c.edit === "date" ? 40 : 30) + "px" });
  UI.editing = { el, taskId: t.id, col: colKey, done: false };
  el.addEventListener("keydown", e => {
    if (e.key === "Enter") { e.preventDefault(); commitEdit(1, 0); }
    else if (e.key === "Tab") { e.preventDefault(); commitEdit(0, e.shiftKey ? -1 : 1); }
    else if (e.key === "Escape") { e.preventDefault(); cancelEdit(); }
    e.stopPropagation();
  });
  el.addEventListener("blur", () => setTimeout(() => { if (UI.editing && UI.editing.el === el) commitEdit(0, 0, true); }, 0));
  $("gridCanvas").append(el);
  el.focus();
  if (el.select && initial == null && el.type === "text") el.select();
  if (el.tagName === "SELECT" && el.showPicker) try { el.showPicker(); } catch { }
}
function cancelEdit() { if (!UI.editing) return; const e = UI.editing; UI.editing = null; e.el.remove(); $("gridBody").focus(); renderGridRows(); }
function commitEdit(dr, dc, fromBlur) {
  const e = UI.editing; if (!e || e.done) return;
  e.done = true; UI.editing = null;
  const val = e.el.value; e.el.remove();
  const t = M.tasks.get(e.taskId);
  const orig = t && { name: t.name, start: fmtYMD(t.S), finish: fmtYMD(t.F), duration: t.dur == null ? "" : t.dur + "d", percent: String(t.P), pred: predText(t), status: t.ST }[e.col];
  if (t && val !== orig && !(e.col === "duration" && parseDuration(val) === t.dur)) {
    if (e.col === "pred") mutate(`Task ${t.wbs}: predecessors → “${val || "none"}”`, () => opSetPredText(t.id, val));
    else mutate(`Task ${t.wbs}: ${e.col} → “${val}”`, () => opSetField(t.id, e.col, val));
  } else renderGridRows();
  if (!fromBlur) {
    $("gridBody").focus();
    if (dr) moveSel(dr);
    if (dc) moveCol(dc);
  }
}

// ---------- Structure commands ----------
function newTaskDefaults(ref) {
  const s = ref && ref.S != null ? ref.S : nextWorkday(todayNum());
  return { start: s, finish: s };
}
function cmdAdd(kind = "task", asChild = false) {
  if (filterActive()) { // a new task wouldn't match the filter and would vanish
    UI.search = ""; UI.person = ""; $("searchBox").value = ""; $("personFilter").value = "";
    toast("Filter cleared so you can see the new task");
  }
  const t = selTask(); let id;
  const opts = { name: kind === "milestone" ? "New milestone" : "New task", kind, ...newTaskDefaults(t) };
  if (asChild && t) { opts.parentId = t.id; UI.collapsed.delete(t.id); saveCollapsed(); }
  else if (t) { opts.parentId = t.parent_id; opts.afterId = t.id; }
  if (asChild && t && !t.isSummary && (rolesOf(t.id).length || M.depsIn.get(t.id))) toast(`“${t.name}” is now a summary task; its dates roll up from subtasks`);
  if (mutate(kind === "milestone" ? "Added milestone" : asChild ? "Added subtask" : "Added task", () => { id = opAddTask(opts); })) {
    selectTask(id, { col: "name" });
    startEdit("name");
  }
}
function cmdStructure(op) {
  const t = selTask(); if (!t) return toast("Select a task first");
  const id = t.id;
  const labels = { indent: "Indented", outdent: "Outdented", up: "Moved up", down: "Moved down" };
  const fn = { indent: () => opIndent(id), outdent: () => opOutdent(id), up: () => opMove(id, -1), down: () => opMove(id, 1) }[op];
  if (op === "indent") { const sib = t.parent ? t.parent.children : M.roots; const prev = sib[sib.indexOf(t) - 1]; if (prev) { UI.collapsed.delete(prev.id); saveCollapsed(); } }
  if (mutate(`${labels[op]} “${t.name}”`, fn)) selectTask(id);
}
function cmdDelete() {
  const t = selTask(); if (!t) return;
  const n = countDesc(t);
  const notes = [t, ...M.order.slice(t.index + 1, t.index + 1 + n)].reduce((s, x) => s + (M.noteCount.get(x.id) || 0), 0);
  const parts = [n ? `its ${n} subtask${n > 1 ? "s" : ""}` : "", notes ? `${notes} work note${notes > 1 ? "s" : ""}` : ""].filter(Boolean);
  if (parts.length && !confirm(`Delete “${t.name}” and ${parts.join(" and ")}? (Undo is available.)`)) return;
  const next = UI.rows[t.row + 1 + (UI.collapsed.has(t.id) ? 0 : n)] || UI.rows[t.row - 1];
  if (mutate(`Deleted “${t.name}”${n ? ` (+${n} subtasks)` : ""}`, () => opDelete(t.id))) selectTask(next && M.tasks.has(next.id) ? next.id : null);
}
const countDesc = t => t.children.reduce((s, c) => s + 1 + countDesc(c), 0);

// ---------- Grid events ----------
let lastDown = null;
function initGrid() {
  renderGridHead();
  const body = $("gridBody");
  body.addEventListener("scroll", () => {
    $("gridHead").scrollLeft = body.scrollLeft;
    if ($("ganttBody").scrollTop !== body.scrollTop) $("ganttBody").scrollTop = body.scrollTop;
    renderGridRows();
  });
  body.addEventListener("pointerdown", e => {
    if (e.target.closest(".cell-editor")) return;
    const row = e.target.closest(".grow"); if (!row) return;
    const id = +row.dataset.id, cell = e.target.closest(".gc");
    if (e.target.closest("[data-open]")) { e.preventDefault(); openRecord(id); return; }
    if (e.target.closest("[data-caret]")) { toggleCollapse(id); return; }
    const col = cell?.dataset.col;
    if (col === "wbs") { beginRowDrag(e, id); }
    const now = performance.now();
    const dbl = lastDown && lastDown.id === id && lastDown.col === col && now - lastDown.t < 450;
    lastDown = { id, col, t: now };
    const wasSel = UI.selId === id && UI.col === col;
    if (!wasSel) selectTask(id, { scroll: false, col: col && col !== "wbs" ? col : UI.col });
    // Deferred so the browser's own mousedown focus handling can't steal focus from the editor/picker.
    if (col && col !== "wbs" && (dbl || (wasSel && colByKey(col)?.edit === "party"))) { e.preventDefault(); lastDown = null; setTimeout(() => startEdit(col), 0); }
  });
  body.addEventListener("keydown", gridKey);
}

function gridKey(e) {
  if (UI.editing || modalOpen() || !$("pop").hidden) return;
  const ctrl = e.ctrlKey || e.metaKey;
  const t = selTask();
  if (e.key === "ArrowDown" && e.altKey && e.shiftKey) { e.preventDefault(); return cmdStructure("down"); }
  if (e.key === "ArrowUp" && e.altKey && e.shiftKey) { e.preventDefault(); return cmdStructure("up"); }
  if (e.key === "ArrowLeft" && e.altKey) { e.preventDefault(); if (t?.isSummary) toggleCollapse(t.id, true); return; }
  if (e.key === "ArrowRight" && e.altKey) { e.preventDefault(); if (t?.isSummary) toggleCollapse(t.id, false); return; }
  switch (e.key) {
    case "ArrowDown": e.preventDefault(); return moveSel(1);
    case "ArrowUp": e.preventDefault(); return moveSel(-1);
    case "ArrowLeft": e.preventDefault(); return moveCol(-1);
    case "ArrowRight": e.preventDefault(); return moveCol(1);
    case "PageDown": e.preventDefault(); return moveSel(Math.floor($("gridBody").clientHeight / ROW));
    case "PageUp": e.preventDefault(); return moveSel(-Math.floor($("gridBody").clientHeight / ROW));
    case "Home": if (ctrl) { e.preventDefault(); return UI.rows[0] && selectTask(UI.rows[0].id); } return;
    case "End": if (ctrl) { e.preventDefault(); return UI.rows.length && selectTask(UI.rows.at(-1).id); } return;
    case "Tab": e.preventDefault(); return cmdStructure(e.shiftKey ? "outdent" : "indent");
    case "Enter": case "F2": e.preventDefault(); return startEdit();
    case "Insert": e.preventDefault(); return cmdAdd("task", ctrl);
    case "Delete": e.preventDefault(); return cmdDelete();
    case "Escape": return;
  }
  if (!ctrl && !e.altKey && e.key.length === 1 && t) {
    const c = colByKey(UI.col);
    if (c?.edit === "text" || c?.edit === "date") { e.preventDefault(); startEdit(UI.col, e.key); }
    else if (c?.edit === "party" || c?.edit === "select") { e.preventDefault(); startEdit(UI.col); }
  }
}

// ---------- Drag rows to reorder / re-parent ----------
function beginRowDrag(e, id) {
  const sx = e.clientX, sy = e.clientY; let active = false, drop = null, timer = null;
  const body = $("gridBody");
  const clear = () => $$(".grow.drop-before,.grow.drop-after,.grow.drop-child").forEach(r => r.classList.remove("drop-before", "drop-after", "drop-child"));
  const move = ev => {
    if (!active && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 5) return;
    active = true; document.body.style.cursor = "grabbing";
    const r = body.getBoundingClientRect();
    clearInterval(timer);
    if (ev.clientY < r.top + 24) timer = setInterval(() => body.scrollTop -= 12, 30);
    else if (ev.clientY > r.bottom - 24) timer = setInterval(() => body.scrollTop += 12, 30);
    clear(); drop = null;
    const row = document.elementFromPoint(r.left + 20, ev.clientY)?.closest(".grow");
    if (!row) return;
    const tid = +row.dataset.id; if (tid === id) return;
    const target = M.tasks.get(tid), self = M.tasks.get(id);
    if (isAncestor(self, target)) return;
    const rr = row.getBoundingClientRect(), y = (ev.clientY - rr.top) / rr.height;
    const where = y < .3 ? "before" : y > .7 ? "after" : "child";
    row.classList.add("drop-" + where); drop = { tid, where };
    showTip(ev, `${where === "child" ? "Make subtask of" : "Move " + where} ${target.wbs} ${target.name}`);
  };
  const up = () => {
    window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up);
    clearInterval(timer); clear(); hideTip(); document.body.style.cursor = "";
    if (active && drop) {
      const self = M.tasks.get(id), target = M.tasks.get(drop.tid);
      if (drop.where === "child") { UI.collapsed.delete(drop.tid); saveCollapsed(); }
      if (mutate(`Moved “${self.name}” ${drop.where === "child" ? "under" : drop.where} “${target.name}”`, () => opMoveTo(id, drop.tid, drop.where))) selectTask(id);
    }
  };
  window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
}
function showTip(ev, text) { const tip = $("dragTip"); tip.hidden = false; tip.textContent = text; tip.style.left = ev.clientX + 14 + "px"; tip.style.top = ev.clientY + 14 + "px"; }
function hideTip() { $("dragTip").hidden = true; }
