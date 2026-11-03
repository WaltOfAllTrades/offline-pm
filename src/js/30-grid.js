// ---------- Outline / WBS grid (virtualized) ----------
const ROW = 30;
const UI = {
  view: "plan", selId: null, anchorId: null, col: "name", collapsed: new Set(), search: "", person: "", grain: "week",
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
  { key: "notes", label: "Description", w: 220, edit: "record" }, // several lines, so it's edited in the record (DECISIONS #86)
];
const colByKey = k => COLS.find(c => c.key === k);
const colIndex = k => COLS.findIndex(c => c.key === k);
const gridWidth = () => COLS.reduce((s, c) => s + c.w, 0);
const ROLLED = new Set(["start", "finish", "duration", "percent", "status"]);
const stClass = s => ({ "Not started": "st-ns", "In progress": "st-ip", "Blocked": "st-bl", "Done": "st-dn" }[s] || "st-ns");

const gridFullWidth = () => lsGet("pm.split", null) ?? Math.round(($("split").clientWidth || innerWidth) * 2 / 3);
// Keyed by the plan's file id too: task ids restart at 1 in every file, so another plan mustn't inherit this one's state.
const collapsedKey = () => `pm.collapsed.${readFileId(db) || "?"}.${M.projectId}`;
function loadCollapsed() { UI.collapsedFor = collapsedKey(); UI.collapsed = new Set(lsGet(UI.collapsedFor, [])); }
function saveCollapsed() { lsSet(collapsedKey(), [...UI.collapsed]); }

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
  const a = M.tasks.get(UI.anchorId); if (!a || UI.rows[a.row] !== a) UI.anchorId = null; // a hidden anchor ends the block
}

function renderGridHead() {
  setHtml($("gridHead"), html`<div class="ghead-row" style="width:${gridWidth() + 40}px">${COLS.map(c => html`<div class="gh" style="width:${c.w}px">${c.label}</div>`)}</div>`);
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
  const team = p.kind === "team";
  return html`<span class="chip ${team ? "team" : ""} ${inherited ? "inh" : ""} ${p.active ? "" : "inactive"}" title="${p.name}${team ? " (team)" : ""}${note}">${team ? "👥 " : ""}${p.name}</span>`;
}
const rChips = t => { const r = responsible(t); return r.list.map(x => chipFor(x, r.same, r.same ? " (same as Accountable)" : "")); };
function cellHtml(t, c) {
  switch (c.key) {
    case "wbs": return t.wbs;
    case "name": {
      const caret = t.isSummary ? html`<span class="caret" data-caret>${UI.collapsed.has(t.id) && !filterActive() ? "▶" : "▼"}</span>` : html`<span class="caret"></span>`;
      const notes = M.noteCount.get(t.id) || 0, mits = M.mitByTask.get(t.id)?.length || 0;
      const warn = _warnSet.has(t.id) ? html`<span class="warn-dot" title="Has warnings, see Issues">⚠</span>` : "";
      const nc = notes ? html`<span class="nc" title="${notes} work note(s)">💬${notes}</span>` : "";
      const mc = mits ? html`<span class="nc" title="Implements ${mits} risk mitigant(s)">🛡${mits}</span>` : "";
      return html`<span style="width:${t.depth * 16}px;flex:none"></span>${caret}${t.isMilestone ? html`<span class="ms-ico">◆</span>` : ""}<span class="nm">${t.name}</span>${warn}${nc}${mc}<span class="open-rec" data-open title="Open record form">↗</span>`;
    }
    case "start": return fmtShort(t.S);
    case "finish": return fmtShort(t.F);
    case "duration": return t.dur == null ? "" : t.dur + "d";
    case "percent": return t.P + "%";
    case "status": return html`<span class="st ${stClass(t.ST)}">${t.ST}</span>`;
    case "pred": return predText(t);
    case "R": return html`<span class="chips">${rChips(t)}</span>`;
    case "A": { const a = accountable(t); return html`<span class="chips">${a.list.map(r => chipFor(r, a.inherited))}</span>`; }
    case "notes": return t.notes ? html`<span class="nm" title="${t.notes}">${t.notes.split("\n")[0]}</span>` : "";
  }
  return "";
}

// Rows live in #gridRows; the cell editor is a sibling, so re-rendering rows (e.g. on scroll) never destroys it.
function renderGridRows() {
  const body = $("gridBody"), canvas = $("gridRows");
  _warnSet = warnTasks();
  if (!UI.rows.length) {
    setHtml(canvas, html`<div class="empty" style="width:${Math.min(gridWidth(), body.clientWidth || 600)}px">${filterActive() ? "No tasks match the filter." : html`No tasks yet. Click <b>＋ Task</b> or press <kbd>Insert</kbd> to add one, or import a spreadsheet from the File menu.`}</div>`);
    return;
  }
  const first = Math.max(0, Math.floor(body.scrollTop / ROW) - 8);
  const last = Math.min(UI.rows.length, Math.ceil((body.scrollTop + body.clientHeight) / ROW) + 8);
  const block = selBlock(), inBlock = new Set(block.map(t => t.id));
  $("selCount").hidden = block.length < 2; $("selCount").textContent = `${block.length} rows`;
  const rows = [];
  for (let i = first; i < last; i++) {
    const t = UI.rows[i], sel = inBlock.has(t.id), active = t.id === UI.selId;
    const expanded = t.isSummary ? html` aria-expanded="${String(!(UI.collapsed.has(t.id) && !filterActive()))}"` : "";
    const cells = COLS.map(c => {
      const ro = (t.isSummary && ROLLED.has(c.key)) ? " ro" : "", cur = active && c.key === UI.col ? " cur" : "";
      return html`<div class="gc c-${c.key}${ro}${cur}" role="gridcell" aria-label="${c.label}" data-col="${c.key}" style="width:${c.w}px"${c.key === "wbs" ? html` title="Drag to move"` : ""}>${cellHtml(t, c)}</div>`;
    });
    rows.push(html`<div class="grow ${t.isSummary ? "summary" : ""} ${sel ? "sel" : ""}" id="gr-${t.id}" role="row" aria-rowindex="${i + 1}" aria-level="${t.depth + 1}" aria-selected="${String(sel)}"${expanded} data-id="${t.id}" style="top:${i * ROW}px;width:${gridWidth()}px">${cells}</div>`);
  }
  setHtml(canvas, html`${rows}`);
  body.setAttribute("aria-rowcount", UI.rows.length);
  if (UI.selId != null && $("gr-" + UI.selId)) body.setAttribute("aria-activedescendant", "gr-" + UI.selId); else body.removeAttribute("aria-activedescendant");
}

// ---------- Selection ----------
// extend: Shift+click or Shift+arrow, which keeps the anchor and makes a block of the rows between (DECISIONS #82).
function selectTask(id, { scroll = true, col, extend = false } = {}) {
  UI.anchorId = extend ? (UI.anchorId ?? UI.selId) : null;
  UI.selId = id; if (col) UI.col = col;
  if (id != null && scroll) revealTask(id);
  redraw("gridRows", "ganttRows", "form");
}
function revealTask(id) {
  const t = M.tasks.get(id); if (!t) return;
  let changed = false;
  for (let x = t.parent; x; x = x.parent) if (UI.collapsed.delete(x.id)) changed = true;
  if (changed) { saveCollapsed(); computeRows(); redraw("rows"); drawNow(); } // the scrolling below needs the new height
  if (t.row == null || UI.rows[t.row] !== t) return;
  const body = $("gridBody"), top = t.row * ROW;
  if (top < body.scrollTop) body.scrollTop = top;
  else if (top + ROW > body.scrollTop + body.clientHeight) body.scrollTop = top + ROW - body.clientHeight;
  const c = colIndex(UI.col), left = COLS.slice(0, c).reduce((s, x) => s + x.w, 0), w = COLS[c]?.w || 0;
  if (left < body.scrollLeft) body.scrollLeft = left;
  else if (left + w > body.scrollLeft + body.clientWidth) body.scrollLeft = left + w - body.clientWidth;
}
const selTask = () => M.tasks.get(UI.selId) || null;
// The selected rows, in outline order: from the anchor to the active row, or just the active row.
function selBlock() {
  const t = selTask(), a = M.tasks.get(UI.anchorId);
  if (!t) return [];
  if (!a || a === t || UI.rows[a.row] !== a || UI.rows[t.row] !== t) return [t];
  return UI.rows.slice(Math.min(a.row, t.row), Math.max(a.row, t.row) + 1);
}
// The rows of a block that none of its other rows contain: structure commands move these, each with its subtree.
const blockTops = list => { const ids = new Set(list.map(t => t.id)); return list.filter(t => { for (let x = t.parent; x; x = x.parent) if (ids.has(x.id)) return false; return true; }); };
function moveSel(dr, { extend = false } = {}) {
  if (!UI.rows.length) return;
  const cur = selTask(); let i = cur && UI.rows[cur.row] === cur ? cur.row : -1;
  i = clamp(i + dr, 0, UI.rows.length - 1);
  if (UI.form) UI.histMode = "replace"; // stepping through rows doesn't fill the Back history
  selectTask(UI.rows[i].id, { extend });
}
function moveCol(dc) { UI.col = COLS[clamp(colIndex(UI.col) + dc, 0, COLS.length - 1)].key; if (UI.selId) revealTask(UI.selId); redraw("gridRows"); }

function toggleCollapse(id, force) {
  const has = UI.collapsed.has(id), want = force ?? !has;
  if (want === has) return;
  want ? UI.collapsed.add(id) : UI.collapsed.delete(id);
  saveCollapsed(); computeRows(); redraw("rows");
}
function showLevel(level) {
  UI.collapsed.clear();
  if (level !== "all") for (const t of M.order) if (t.isSummary && t.depth >= +level - 1) UI.collapsed.add(t.id);
  if (UI.selId && UI.collapsed.size) { const t = selTask(); if (t && t.depth >= +level) UI.selId = t.parent ? ancestorAtDepth(t, +level - 1).id : t.id; }
  saveCollapsed(); computeRows(); redraw("rows", "form");
}
function ancestorAtDepth(t, d) { let x = t; while (x.depth > d && x.parent) x = x.parent; return x; }

// ---------- Inline editing ----------
function startEdit(colKey = UI.col, initial = null) {
  const t = selTask(); if (!t) return;
  const c = colByKey(colKey); if (!c || !c.edit) return;
  if (UI.editing) commitEdit(0, 0, true);
  if (t.isSummary && ROLLED.has(c.key)) { toast("Summary rows roll up from their subtasks"); return; }
  UI.col = colKey;
  if (c.edit === "record") { UI.formFocus = "notes"; openRecord(t.id); return; }
  revealTask(t.id); redraw("gridRows"); drawNow(); // the cell is looked up next
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
function cancelEdit() { if (!UI.editing) return; const e = UI.editing; UI.editing = null; e.el.remove(); $("gridBody").focus(); redraw("gridRows"); }
function commitEdit(dr, dc, fromBlur) {
  const e = UI.editing; if (!e || e.done) return;
  e.done = true; UI.editing = null;
  const val = e.el.value;
  const t = M.tasks.get(e.taskId);
  const orig = t && { name: t.name, start: fmtYMD(t.S), finish: fmtYMD(t.F), duration: t.dur == null ? "" : t.dur + "d", percent: String(t.P), pred: predText(t), status: t.ST }[e.col];
  if (t && val !== orig && !(e.col === "duration" && parseDuration(val) === t.dur)) {
    const ok = e.col === "pred" ? mutate(`Task ${t.wbs}: predecessors → “${val || "none"}”`, () => opSetPredText(t.id, val))
      : mutate(`Task ${t.wbs}: ${e.col} → “${val}”`, () => opSetField(t.id, e.col, val));
    // Refused (bad date, finish before start…): keep the editor open with what was typed, so it can be fixed.
    if (!ok && M.tasks.has(e.taskId)) { e.done = false; UI.editing = e; e.el.focus(); e.el.select?.(); return; }
    e.el.remove();
  } else { e.el.remove(); redraw("gridRows"); }
  if (!fromBlur) {
    $("gridBody").focus();
    if (dr) moveSel(dr);
    if (dc) moveCol(dc);
  }
}

// ---------- Structure commands ----------
// Tasks you add start with no dates (DECISIONS #80): plans arrive as names, and dates are set on the Gantt or typed in.
function newTaskDefaults() { return { start: null, finish: null }; }
function clearFilter() {
  if (!filterActive()) return false;
  UI.search = ""; UI.person = ""; $("searchBox").value = ""; $("personFilter").value = "";
  computeRows(); redraw("rows");
  return true;
}
function cmdAdd(kind = "task", asChild = false) {
  if (clearFilter()) toast("Filter cleared so you can see the new task"); // a new task wouldn't match the filter and would vanish
  const t = selTask(); let id;
  const opts = { name: kind === "milestone" ? "New milestone" : "New task", kind, ...newTaskDefaults(t) };
  if (asChild && t) { opts.parentId = t.id; UI.collapsed.delete(t.id); saveCollapsed(); }
  else if (t) { opts.parentId = t.parent_id; opts.afterId = t.id; }
  if (asChild && t && !t.isSummary && (rolesOf(t.id).length || M.depsIn.get(t.id))) toast(`“${t.name}” is now a summary task; its dates roll up from subtasks`);
  if (mutate(kind === "milestone" ? "Added milestone" : asChild ? "Added subtask" : "Added task", () => { id = opAddTask(opts); })) {
    selectTask(id, { col: "name" });
    // With the record panel open the new record opens, name selected; closed, the outline's own editor (DECISIONS #90).
    if (UI.form) { UI.formFocus = "name"; openRecord(id); } else startEdit("name");
  }
}
function cmdStructure(op) {
  const t = selTask(); if (!t) return toast("Select a task first");
  const id = t.id;
  const labels = { indent: "Indented", outdent: "Outdented", up: "Moved up", down: "Moved down" };
  const tops = blockTops(selBlock());
  if (tops.length > 1) { // a block: every top row moves one level, in order, in one undo step (DECISIONS #83)
    if (op === "up" || op === "down") return toast("Move up and down work on one row at a time. Select one row.");
    if (op === "indent") { const f = tops[0], sib = f.parent ? f.parent.children : M.roots, prev = sib[sib.indexOf(f) - 1]; if (prev) { UI.collapsed.delete(prev.id); saveCollapsed(); } }
    mutate(`${labels[op]} ${tops.length} tasks`, () => {
      if (op === "outdent") for (const x of tops) if (taskRow(x.id).parent_id == null) throw new Error(`“${x.name}” is already at the top level`);
      for (const x of tops) (op === "indent" ? opIndent : opOutdent)(x.id);
    });
    return; // the same ids stay selected, so ⇥ again indents again
  }
  const fn = { indent: () => opIndent(id), outdent: () => opOutdent(id), up: () => opMove(id, -1), down: () => opMove(id, 1) }[op];
  if (op === "indent") { const sib = t.parent ? t.parent.children : M.roots; const prev = sib[sib.indexOf(t) - 1]; if (prev) { UI.collapsed.delete(prev.id); saveCollapsed(); } }
  if (mutate(`${labels[op]} “${t.name}”`, fn)) selectTask(id);
}
function cmdDelete() {
  const t = selTask(); if (!t) return;
  const tops = blockTops(selBlock());
  if (tops.length > 1) {
    const n = tops.reduce((s, x) => s + countDesc(x), 0);
    const notes = tops.flatMap(x => [x, ...descendantsOf(x)]).reduce((s, x) => s + (M.noteCount.get(x.id) || 0), 0);
    const parts = [n ? `${n} subtask${n > 1 ? "s" : ""}` : "", notes ? `${notes} work note${notes > 1 ? "s" : ""}` : ""].filter(Boolean);
    const lastTop = tops.at(-1), end = lastTop.row + 1 + countDesc(lastTop);
    const next = UI.rows.slice(end).find(r => !tops.some(x => isAncestor(x, r))) || UI.rows[tops[0].row - 1];
    if (mutate(`Deleted ${tops.length} tasks`, () => tops.forEach(x => opDelete(x.id)))) {
      selectTask(next && M.tasks.has(next.id) ? next.id : null);
      toast(`Deleted ${tops.length} tasks${parts.length ? ` with ${parts.join(" and ")}` : ""}`, "", { undo: true });
    }
    return;
  }
  const n = countDesc(t);
  const notes = [t, ...M.order.slice(t.index + 1, t.index + 1 + n)].reduce((s, x) => s + (M.noteCount.get(x.id) || 0), 0);
  const parts = [n ? `${n} subtask${n > 1 ? "s" : ""}` : "", notes ? `${notes} work note${notes > 1 ? "s" : ""}` : ""].filter(Boolean);
  const next = UI.rows.slice(t.row + 1).find(r => !isAncestor(t, r)) || UI.rows[t.row - 1]; // first visible row after the subtree
  // No "are you sure?": it deletes at once and offers Undo, which is quicker and harder to get wrong.
  if (mutate(`Deleted “${t.name}”${n ? ` (+${n} subtasks)` : ""}`, () => opDelete(t.id))) {
    selectTask(next && M.tasks.has(next.id) ? next.id : null);
    toast(`Deleted “${shortText(t.name, 40)}”${parts.length ? ` with ${parts.join(" and ")}` : ""}`, "", { undo: true });
  }
}
const countDesc = t => t.children.reduce((s, c) => s + 1 + countDesc(c), 0);

// ---------- Column paste (DECISIONS #84, #85) ----------
// Ctrl+V with more than one line asks what to do with them; the selected cell says which column and row it starts at.
// One line pasted while editing a cell goes into the editor; one line on a selected cell fills just that cell.
function gridPaste(e) {
  const { lines, cols } = parseClipColumn(e.clipboardData?.getData("text/plain") ?? "");
  if (UI.editing) { if (lines.length < 2) return; e.preventDefault(); cancelEdit(); }
  else e.preventDefault();
  openGridPaste(lines, cols);
}
async function pasteFromClipboard() {
  let text;
  try { text = await navigator.clipboard.readText(); } catch { text = null; }
  if (text == null) return toast("The browser didn't allow reading the clipboard. Click a cell and press Ctrl+V instead.");
  const { lines, cols } = parseClipColumn(text);
  openGridPaste(lines, cols, true);
}
function openGridPaste(lines, cols, always = false) {
  const t = selTask(); if (!t) return toast("Click the cell where the pasted list should start.");
  if (!lines.length || (lines.length === 1 && !lines[0])) return toast("The clipboard is empty.");
  const col = UI.col, options = pasteOptions(t, col, lines);
  if (lines.length === 1 && !always) { if (col !== "wbs") cmdPaste(options[0].id, col, lines); return; }
  revealTask(t.id); redraw("gridRows"); drawNow(); // the cell is looked up next
  const cell = $("gridCanvas").querySelector(`.grow[data-id="${t.id}"] [data-col="${col}"]`);
  const rect = (cell || $("gridBody")).getBoundingClientRect();
  openPasteChooser(rect, { title: `Paste ${lines.length} line${lines.length === 1 ? "" : "s"} into ${colByKey(col).label}`, lines, cols, key: "paste." + col, options });
}
function pasteOptions(t, col, lines) {
  const room = UI.rows.length - t.row, n = lines.filter(Boolean).length, past = lines.slice(room).filter(Boolean).length;
  const run = mode => () => cmdPaste(mode, col, lines), at = `${t.wbs} ${shortText(t.name, 30)}`;
  const fits = lines.length > room ? `; ${lines.length - room} line${lines.length - room === 1 ? "" : "s"} won't fit` : "";
  if (col === "wbs") return [{ id: "nest", label: "Nest these rows by WBS", sub: `Uses the numbers for levels only, from row ${t.wbs} down${fits}`, run: run("nest") }];
  if (col === "name") return [
    { id: "fill", label: "Fill down", sub: `Overwrite names from row ${t.wbs} down${past ? `; adds ${past} new task${past === 1 ? "" : "s"} past the end` : ""}`, run: run("fill") },
    { id: "child", label: `Add as subtasks of “${at}”`, sub: `${n} new task${n === 1 ? "" : "s"} after its existing subtasks`, run: run("child") },
    { id: "below", label: `Add below “${at}”`, sub: `${n} new task${n === 1 ? "" : "s"} at the same level, straight after it`, run: run("below") },
  ];
  const what = col === "R" || col === "A" ? "names matched to people and teams" : colByKey(col).label;
  return [{ id: "fill", label: col === "R" || col === "A" ? "Fill down (match names)" : "Fill down", sub: `Overwrite ${what} from row ${t.wbs} down${fits}`, run: run("fill") }];
}
// mode: "fill" | "child" | "below" (Name) | "nest" (WBS). One change, one undo step; afterwards the affected rows are
// selected as a block, since the next step is usually to indent them (DECISIONS #91).
function cmdPaste(mode, col, lines) {
  const t0 = selTask(); if (!t0) return toast("Click the cell where the pasted list should start.");
  const cleared = clearFilter();
  if (cleared) revealTask(t0.id);
  const rows = UI.rows.slice(t0.row), affected = [];
  const label = colByKey(col).label;
  if (mode === "child") { UI.collapsed.delete(t0.id); saveCollapsed(); }
  const ok = mutate(`Pasted ${lines.length} lines into ${label}`, () => {
    if (cleared) opNotes.push("Filter cleared so you can see the pasted rows.");
    const over = lines.length - rows.length, overNote = () => { if (over > 0) opNotes.push(`${over} line${over === 1 ? "" : "s"} didn't fit below the last row.`); };
    if (col === "name") {
      if (mode === "fill") {
        let renamed = 0, added = 0, after = rows.at(-1).id; const parentId = rows.at(-1).parent_id;
        lines.forEach((l, i) => {
          const r = rows[i];
          if (r) { affected.push(r.id); if (l && l !== r.name) { opSetField(r.id, "name", l); renamed++; } }
          else if (l) { after = opAddTask({ parentId, afterId: after, name: l, ...newTaskDefaults() }); affected.push(after); added++; }
        });
        opNotes.push(`Pasted ${lines.length} names: ${renamed} renamed, ${added} new task${added === 1 ? "" : "s"}.`);
      } else {
        if (mode === "child" && !t0.isSummary && (rolesOf(t0.id).length || M.depsIn.get(t0.id))) opNotes.push(`“${t0.name}” is now a summary task; its dates roll up from subtasks.`);
        let after = mode === "below" ? t0.id : null;
        for (const l of lines) if (l) {
          const id = opAddTask(mode === "child" ? { parentId: t0.id, name: l, ...newTaskDefaults() } : { parentId: t0.parent_id, afterId: after, name: l, ...newTaskDefaults() });
          affected.push(after = id);
        }
        opNotes.push(`Added ${affected.length} ${mode === "child" ? "subtask" : "task"}${affected.length === 1 ? "" : "s"} ${mode === "child" ? "under" : "below"} ${t0.wbs} ${t0.name}.`);
      }
      return;
    }
    const list = rows.slice(0, lines.length);
    affected.push(...list.map(r => r.id));
    if (col === "wbs") {
      const { levels, bad } = wbsLevels(lines.slice(0, list.length));
      opNestByWbs(affected, levels);
      opNotes.push(`Nested ${list.length} rows by WBS.`);
      if (bad) opNotes.push(`${bad} line${bad === 1 ? " wasn't a WBS number, so that row was" : "s weren't WBS numbers, so those rows were"} kept at the level above ${bad === 1 ? "it" : "them"}.`);
      return overNote();
    }
    if (col === "R" || col === "A") {
      const byName = new Map(); for (const p of [...M.teams, ...M.people]) if (p.active) byName.set(p.name.trim().toLowerCase(), p.id); // people win a name clash
      const unknown = new Map(); let set = 0;
      list.forEach((r, i) => {
        const names = lines[i].split(/[,;/]/).map(x => x.trim()).filter(Boolean);
        if (!names.length) { opSetRoleParties(r.id, col, []); set++; return; }
        const ids = [];
        for (const nm of names) { const id = byName.get(nm.toLowerCase()); if (id != null) { if (!ids.includes(id)) ids.push(id); } else unknown.set(nm, (unknown.get(nm) || 0) + 1); }
        if (ids.length) { opSetRoleParties(r.id, col, ids); set++; }
      });
      opNotes.push(`Set ${ROLE_NAMES[col]} on ${set} row${set === 1 ? "" : "s"}.`);
      if (unknown.size) opNotes.push(`Not on the roster: ${[...unknown].map(([nm, k]) => `${nm} (${k} row${k === 1 ? "" : "s"})`).join(", ")}. Add them on the People page, then paste again.`);
      return overNote();
    }
    // Description and the other columns: each line goes through the same op as typing into the cell.
    const skipped = []; let done = 0;
    list.forEach((r, i) => {
      const l = lines[i];
      if (!l && col !== "notes" && col !== "start" && col !== "pred") return;
      run("SAVEPOINT paste_row");
      try { col === "pred" ? opSetPredText(r.id, l) : opSetField(r.id, col, l); run("RELEASE paste_row"); done++; }
      catch (x) { run("ROLLBACK TO paste_row"); run("RELEASE paste_row"); dateGraphCache = null; skipped.push(`${r.wbs} (${shortText(x.message, 32)})`); }
    });
    opNotes.push(`Pasted ${done} value${done === 1 ? "" : "s"} into ${label}.`);
    if (skipped.length) opNotes.push(`Skipped ${skipped.length} row${skipped.length === 1 ? "" : "s"}: ${skipped.slice(0, 3).join(", ")}${skipped.length > 3 ? ` and ${skipped.length - 3} more` : ""}.`);
    overNote();
  });
  if (!ok || !affected.length) return ok;
  const live = affected.filter(id => M.tasks.has(id));
  UI.selId = live.at(-1) ?? null; UI.anchorId = live.length > 1 ? live[0] : null;
  if (UI.selId != null) revealTask(UI.selId);
  redraw("rows", "form");
  return ok;
}

// ---------- Grid events ----------
let lastDown = null;
function initGrid() {
  renderGridHead();
  const body = $("gridBody");
  body.addEventListener("scroll", () => {
    $("gridHead").scrollLeft = body.scrollLeft;
    if ($("ganttBody").scrollTop !== body.scrollTop) $("ganttBody").scrollTop = body.scrollTop;
    redraw("gridRows");
  });
  body.addEventListener("pointerdown", e => {
    if (e.target.closest(".cell-editor")) return;
    const row = e.target.closest(".grow"); if (!row) return;
    const id = +row.dataset.id, cell = e.target.closest(".gc");
    if (e.target.closest("[data-open]")) { e.preventDefault(); openRecord(id); return; }
    if (e.target.closest("[data-caret]")) { toggleCollapse(id); return; }
    const col = cell?.dataset.col;
    if (e.shiftKey) { e.preventDefault(); selectTask(id, { scroll: false, extend: true }); return; } // a block, not a drag or an edit
    if (col === "wbs") { beginRowDrag(e, id); }
    const now = performance.now();
    const dbl = lastDown && lastDown.id === id && lastDown.col === col && now - lastDown.t < 450;
    lastDown = { id, col, t: now };
    const wasSel = UI.selId === id && UI.col === col;
    if (!wasSel || UI.anchorId != null) selectTask(id, { scroll: false, col: col || UI.col });
    // Deferred so the browser's own mousedown focus handling can't steal focus from the editor/picker.
    if (col && col !== "wbs" && (dbl || (wasSel && colByKey(col)?.edit === "party"))) { e.preventDefault(); lastDown = null; setTimeout(() => startEdit(col), 0); }
  });
  body.addEventListener("keydown", gridKey);
  body.addEventListener("paste", gridPaste);
}

function gridKey(e) {
  if (UI.editing || modalOpen() || !$("pop").hidden) return;
  const ctrl = e.ctrlKey || e.metaKey;
  const t = selTask();
  if (e.key === "ArrowDown" && e.altKey && e.shiftKey) { e.preventDefault(); return cmdStructure("down"); }
  if (e.key === "ArrowUp" && e.altKey && e.shiftKey) { e.preventDefault(); return cmdStructure("up"); }
  if (e.key === "ArrowRight" && e.altKey && e.shiftKey) { e.preventDefault(); return cmdStructure("indent"); }
  if (e.key === "ArrowLeft" && e.altKey && e.shiftKey) { e.preventDefault(); return cmdStructure("outdent"); }
  if (e.key === "ArrowLeft" && e.altKey) { e.preventDefault(); if (t?.isSummary) toggleCollapse(t.id, true); return; }
  if (e.key === "ArrowRight" && e.altKey) { e.preventDefault(); if (t?.isSummary) toggleCollapse(t.id, false); return; }
  switch (e.key) {
    case "ArrowDown": e.preventDefault(); return moveSel(1, { extend: e.shiftKey && !e.altKey });
    case "ArrowUp": e.preventDefault(); return moveSel(-1, { extend: e.shiftKey && !e.altKey });
    case "ArrowLeft": e.preventDefault(); return moveCol(-1);
    case "ArrowRight": e.preventDefault(); return moveCol(1);
    case "PageDown": e.preventDefault(); return moveSel(Math.floor($("gridBody").clientHeight / ROW));
    case "PageUp": e.preventDefault(); return moveSel(-Math.floor($("gridBody").clientHeight / ROW));
    case "Home": if (ctrl) { e.preventDefault(); return UI.rows[0] && selectTask(UI.rows[0].id); } return;
    case "End": if (ctrl) { e.preventDefault(); return UI.rows.length && selectTask(UI.rows.at(-1).id); } return;
    // Tab moves along the row as in a spreadsheet, and past the last (or first) cell it leaves the grid. It no longer
    // indents: Enter-then-Tab used to restructure the plan by accident (DECISIONS #72). Alt+Shift+→/← indent.
    case "Tab": { if (!t) return; const c = colIndex(UI.col) + (e.shiftKey ? -1 : 1); if (c < 1 || c >= COLS.length) return; e.preventDefault(); return moveCol(e.shiftKey ? -1 : 1); }
    case "Enter": case "F2": e.preventDefault(); return startEdit();
    case "Insert": e.preventDefault(); return cmdAdd("task", ctrl);
    case "Delete": e.preventDefault(); return cmdDelete();
    case "Escape": if (UI.anchorId != null) { UI.anchorId = null; redraw("gridRows", "ganttRows"); } else if (!UI.form && t) selectTask(null); return;
  }
  const altGr = e.getModifierState?.("AltGraph"); // AltGr arrives as Ctrl+Alt on Windows: "@" or "{" on many layouts
  if ((altGr || (!ctrl && !e.altKey)) && e.key.length === 1 && t) {
    const c = colByKey(UI.col);
    if (c?.edit === "text" || c?.edit === "date") { e.preventDefault(); startEdit(UI.col, e.key); }
    else if (c?.edit === "party" || c?.edit === "select" || c?.edit === "record") { e.preventDefault(); startEdit(UI.col); } // the key itself isn't typed in
  }
}

// ---------- Drag rows to reorder / re-parent ----------
function beginRowDrag(e, id) {
  const sx = e.clientX, sy = e.clientY; let active = false, drop = null, timer = null, last = null;
  const body = $("gridBody");
  const clear = () => $$(".grow.drop-before,.grow.drop-after,.grow.drop-child").forEach(r => r.classList.remove("drop-before", "drop-after", "drop-child"));
  const move = ev => {
    if (!active && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 5) return;
    active = true; document.body.style.cursor = "grabbing"; last = ev;
    const r = body.getBoundingClientRect();
    clearInterval(timer);
    // Scrolling re-renders the rows, so the target is found again on every tick, under the pointer.
    const dy = ev.clientY < r.top + 24 ? -12 : ev.clientY > r.bottom - 24 ? 12 : 0;
    if (dy) timer = setInterval(() => { body.scrollTop += dy; redraw("gridRows"); drawNow(); hit(last); }, 30); // hit() reads the new rows
    hit(ev);
  };
  const hit = ev => {
    const r = body.getBoundingClientRect();
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
  const stop = () => { clearInterval(timer); clear(); hideTip(); document.body.style.cursor = ""; };
  trackDrag(window, {
    move,
    drop: () => {
      stop();
      if (!active || !drop) return;
      const self = M.tasks.get(id), target = M.tasks.get(drop.tid);
      if (drop.where === "child") { UI.collapsed.delete(drop.tid); saveCollapsed(); }
      if (mutate(`Moved “${self.name}” ${drop.where === "child" ? "under" : drop.where} “${target.name}”`, () => opMoveTo(id, drop.tid, drop.where))) selectTask(id);
    },
    cancel: stop,
  });
}
function showTip(ev, text) { const tip = $("dragTip"); tip.hidden = false; tip.textContent = text; tip.style.left = ev.clientX + 14 + "px"; tip.style.top = ev.clientY + 14 + "px"; }
function hideTip() { $("dragTip").hidden = true; }
