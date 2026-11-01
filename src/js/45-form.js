// ---------- Record form (ServiceNow-style: fields, mini Gantt, work notes, related records) ----------
// Slides in from the left over the WBS outline; the Gantt stays visible and clicking a bar switches records (DECISIONS #38).
Object.assign(UI, {
  form: false, formTab: lsGet("pm.formTab", "children"), mgAll: lsGet("pm.mgAll", false),
  notesWithSub: lsGet("pm.notesWithSub", true), noteDrafts: new Map(), editNote: null,
  secClosed: new Set(lsGet("pm.formClosed", [])),
});
// Collapsible section header; open/closed state is remembered per browser.
function secHead(key, title, ...extras) {
  const closed = UI.secClosed.has(key);
  const toggle = () => { closed ? UI.secClosed.delete(key) : UI.secClosed.add(key); lsSet("pm.formClosed", [...UI.secClosed]); renderForm(true); };
  return h("div", { class: "f-sec-h" }, h("button", { class: "sec-tog", "aria-expanded": String(!closed), title: closed ? "Show section" : "Hide section", onclick: toggle }, h("span", { class: "car" }, closed ? "▶" : "▼"), h("h3", {}, title)), ...extras);
}

function toggleForm(force) {
  const want = force ?? !UI.form;
  if (want === UI.form) { renderForm(); return; }
  UI.form = want;
  formHold = formHeldRender = false; // closing/opening must not wait for a held render
  if (want) { renderForm(true); return; }
  UI.editNote = null; renderForm();
  $("gridBody").focus();
}
function openRecord(id) {
  if (!M.tasks.has(id)) return;
  if (UI.view !== "plan") switchView("plan");
  UI.form = true;
  if (UI.selId !== id) { UI.editNote = null; selectTask(id); } // selectTask re-renders the form
  else renderForm(true);
}
// The panel covers the outline exactly (at least 460px, always leaving some Gantt visible).
function sizeForm() {
  const split = $("split").clientWidth || innerWidth;
  $("formPane").style.width = clamp($("gridPane").offsetWidth, Math.min(460, split - 160), split - 160) + "px";
}
// Window resize / splitter: only the mini Gantt depends on the pane width, so leave fields (and focus) alone.
function relayoutForm() {
  sizeForm();
  const old = $("formPane").querySelector(".f-sec.mg"), t = selTask();
  if (old && t && UI.form) old.replaceWith(miniGanttSection(t));
}
// 2. A pointerdown inside the form commits a pending field edit, but the re-render waits until the click has landed,
// so the button (or note box) under the pointer still exists when the click arrives.
let formHold = false, formHeldRender = false;
function holdFormRender() {
  formHold = true;
  const release = () => {
    removeEventListener("pointerup", release, true); removeEventListener("pointercancel", release, true);
    setTimeout(() => { formHold = false; if (formHeldRender) { formHeldRender = false; renderForm(true); } }, 0);
  };
  addEventListener("pointerup", release, true); addEventListener("pointercancel", release, true);
}

let formBusy = false;
function renderForm(force = false) {
  if (formBusy) return;
  if (formHold) { formHeldRender = true; return; }
  const pane = $("formPane"), show = UI.form && UI.view === "plan";
  if (show && !pane.classList.contains("open")) sizeForm();
  pane.classList.toggle("open", show); pane.setAttribute("aria-hidden", String(!show));
  $("detailsBtn").classList.toggle("primary", show);
  if (!show) { pane.dataset.task = ""; return; }
  const ae = document.activeElement;
  // Don't clobber a field being typed in; when switching records, commit the pending edit first.
  if (pane.contains(ae) && ae.closest(".f-fields") && ae.matches("input,select,textarea")) {
    if (!force && pane.dataset.task === String(UI.selId)) { refreshFieldsInPlace(selTask(), ae); return; }
    formBusy = true; try { ae._commit?.(); ae.blur(); } finally { formBusy = false; }
  }
  const t = selTask();
  const keep = pane.contains(ae) ? ae.dataset.keep : null;
  const selRange = keep && ae.selectionStart != null ? [ae.selectionStart, ae.selectionEnd] : null;
  const scroll = pane.dataset.task === String(t?.id ?? "") ? pane.scrollTop : 0;
  pane.dataset.task = t?.id ?? "";
  pane.innerHTML = "";
  if (!t) {
    pane.append(h("div", { class: "f-head" }, h("div", { class: "f-title" }, h("h2", {}, "Record")), h("button", { class: "icon", title: "Close form (Ctrl+I)", onclick: () => toggleForm(false) }, "✕")),
      h("div", { class: "empty" }, "Select a task or milestone (click a Gantt bar) to open its record."));
    return;
  }
  if (UI.editNote && !one("SELECT 1 FROM note WHERE id=? AND created_at=?", [UI.editNote.id, UI.editNote.created])) UI.editNote = null;
  pane.append(formHeader(t), formFields(t));
  if (t.isSummary) pane.append(miniGanttSection(t));
  pane.append(notesSection(t), relatedSection(t));
  pane.scrollTop = scroll;
  if (keep) {
    const el = pane.querySelector(`[data-keep="${keep}"]`);
    if (el) { el.focus(); if (selRange && el.setSelectionRange) try { el.setSelectionRange(...selRange); } catch { } }
  }
}

// Another view changed the task while a form field has focus: update the other fields, keep the one being typed in.
const fieldValue = (t, f) => ({ name: t.name, start: fmtYMD(t.S), finish: fmtYMD(t.F), percent: String(t.P), duration: t.dur == null ? "" : t.dur + "d", code: t.code || "", notes: t.notes || "", status: t.ST, kind: t.isMilestone ? "milestone" : "task" })[f];
function refreshFieldsInPlace(t, focused) {
  if (!t) return;
  for (const el of $("formPane").querySelectorAll(".f-fields [data-f]")) {
    if (el === focused) continue;
    const v = fieldValue(t, el.dataset.f); if (v == null || el.value === v) continue;
    el.value = v; el._orig = v;
  }
  const h2 = $("formPane").querySelector(".f-title h2");
  if (h2) h2.lastChild.textContent = t.name;
}

const recordLabel = t => t.isSummary ? "Summary task" : t.isMilestone ? "Milestone" : "Task";
function formHeader(t) {
  const i = M.order.indexOf(t), prev = M.order[i - 1], next = M.order[i + 1];
  const crumbs = [];
  for (let x = t.parent; x; x = x.parent) crumbs.unshift(h("a", { href: "#", onclick: e => { e.preventDefault(); openRecord(x.id); } }, `${x.wbs} ${x.name}`), h("span", { class: "sep" }, "›"));
  const proj = M.projects.find(p => p.id === M.projectId);
  return h("div", { class: "f-head" },
    h("div", { class: "f-title" },
      h("div", { class: "f-crumbs" }, h("span", {}, proj?.name || ""), h("span", { class: "sep" }, "›"), ...crumbs),
      h("h2", {}, h("span", { class: "f-kind" }, recordLabel(t)), h("span", { class: "f-wbs" }, t.wbs), t.name)),
    h("div", { class: "f-acts" },
      h("button", { class: "icon", title: "Previous record", disabled: !prev, onclick: () => prev && openRecord(prev.id) }, "▲"),
      h("button", { class: "icon", title: "Next record", disabled: !next, onclick: () => next && openRecord(next.id) }, "▼"),
      h("button", { class: "icon", title: "Close form, back to the Gantt (Ctrl+I)", onclick: () => toggleForm(false) }, "✕")));
}

function formFields(t) {
  const commit = (fieldName, el) => () => { const v = el.value; mutate(`Task ${t.wbs}: ${fieldName} → “${v}”`, () => opSetField(t.id, fieldName, v)); };
  // Text commits once, on change or blur, whichever comes first (blur also covers values set without a change event).
  const commitOnce = (fieldName, el) => {
    el._orig = el.value; let done = false;
    const same = () => el.value === el._orig || (fieldName === "duration" && parseDuration(el.value) === t.dur) || (fieldName === "percent" && parsePercent(el.value) === t.P);
    const go = () => { if (done || same() || (el.type === "date" && !el.value)) return; done = true; commit(fieldName, el)(); };
    el._commit = go; // renderForm calls this directly when switching records
    if (el.type !== "date") el.addEventListener("change", go); // date inputs fire change per keystroke
    el.addEventListener("blur", go);
    if (el.tagName === "INPUT") el.addEventListener("keydown", e => { if (e.key === "Enter") el.blur(); });
  };
  const inp = (fieldName, value, attrs = {}) => { const el = h("input", { value: value ?? "", "data-f": fieldName, ...attrs }); commitOnce(fieldName, el); return el; };
  const ro = t.isSummary, rollHint = ro ? "Rolls up from subtasks" : null;
  const kind = h("select", { disabled: ro, "data-f": "kind", title: rollHint }, h("option", { value: "task", selected: !t.isMilestone }, "Task"), h("option", { value: "milestone", selected: t.isMilestone }, "Milestone"));
  kind.addEventListener("change", commit("kind", kind));
  const status = h("select", { disabled: ro, "data-f": "status", title: rollHint }, ...STATUSES.map(s => h("option", { selected: s === t.ST }, s)));
  status.addEventListener("change", commit("status", status));
  const desc = h("textarea", { placeholder: "What this task covers, scope, links…", "data-f": "notes", rows: 3 }, t.notes || "");
  commitOnce("notes", desc);
  const party = role => {
    const own = rolesOf(t.id, role), acc = role === "A" ? accountable(t) : null;
    const list = role === "A" ? acc.list : own, inh = role === "A" && acc.inherited;
    const btn = h("button", { class: "f-party", title: `Choose ${ROLE_NAMES[role]}`, html: (list.length ? list.map(r => chipFor(r, inh)).join("") : `<span class="hint">None</span>`) + (inh && list.length ? `<span class="hint"> from ${esc(acc.from.wbs)}</span>` : "") });
    btn.addEventListener("click", () => openPartyPicker(btn.getBoundingClientRect(), t.id, role));
    return btn;
  };
  const parent = t.parent ? h("a", { href: "#", onclick: e => { e.preventDefault(); openRecord(t.parent.id); } }, `${t.parent.wbs} ${t.parent.name}`) : h("span", { class: "hint" }, "Top level");
  const F = (label, el, cls = "") => h("div", { class: "f-field " + cls }, h("label", {}, label), el);
  if (UI.secClosed.has("details")) return h("section", { class: "f-sec det" }, secHead("details", "Details", h("span", { class: "hint" }, `${t.ST} · ${fmtShort(t.S)} → ${fmtShort(t.F)} · ${t.P}%`)));
  return h("section", { class: "f-sec det" }, secHead("details", "Details"), h("div", { class: "f-fields" },
    F("Name", inp("name", t.name), "wide"),
    F("Type", kind), F("Start", inp("start", fmtYMD(t.S), { type: "date", disabled: ro, title: rollHint })),
    F("Status", status), F("Finish", inp("finish", fmtYMD(t.F), { type: "date", disabled: ro || t.isMilestone, title: rollHint })),
    F("% complete", inp("percent", t.P, { type: "number", min: 0, max: 100, disabled: ro, title: rollHint })),
    F("Duration", inp("duration", t.dur == null ? "" : t.dur + "d", { disabled: ro, title: ro ? rollHint : "Working days, e.g. 5, 5d, 2w. 0 makes a milestone" })),
    F("Responsible", party("R")), F("Accountable", party("A")),
    F("Parent", parent), F("WBS code", inp("code", t.code, { placeholder: "Optional stable code" })),
    F("Description", desc, "wide")));
}

// ---------- Mini Gantt of a summary task's subtasks ----------
const MG_LBL = 230, MG_MAX = 80;
function descendantsOf(t) { return M.order.slice(t.index + 1, t.index + 1 + countDesc(t)); }
function miniGanttSection(t) {
  const rows = UI.mgAll ? descendantsOf(t) : t.children;
  const shown = rows.slice(0, MG_MAX);
  const allCb = h("input", { type: "checkbox", checked: UI.mgAll });
  allCb.addEventListener("change", () => { UI.mgAll = allCb.checked; lsSet("pm.mgAll", UI.mgAll); renderForm(true); });
  const sec = h("section", { class: "f-sec mg" },
    secHead("mg", "Subtask schedule", h("span", { class: "hint" }, `${rows.length} ${UI.mgAll ? "subtasks at all levels" : "direct subtasks"}`),
      h("span", { class: "spacer" }), h("label", { class: "hint" }, allCb, " All levels")));
  if (UI.secClosed.has("mg")) return sec;
  const avail = ($("formPane").clientWidth || 760) - 66; // pane + section padding and borders
  const lbl = clamp(Math.round(avail * 0.34), 140, MG_LBL);
  sec.append(h("div", { class: "mg-wrap" }, miniGanttLabels(t, shown, lbl), h("div", { class: "mg-chart", html: miniGanttSvg(t, shown, Math.max(200, avail - lbl - 1)) })));
  if (rows.length > shown.length) sec.append(h("div", { class: "hint" }, `Showing the first ${MG_MAX} of ${rows.length}.`));
  sec.addEventListener("click", e => {
    const dep = e.target.closest(".dep"); if (dep) { openDepEditor(+dep.dataset.dep, e.clientX, e.clientY); return; }
    const el = e.target.closest("[data-id]"); if (el) openRecord(+el.dataset.id);
  });
  return sec;
}
function miniGanttLabels(t, rows, width) {
  return h("div", { class: "mg-lbls", style: { width: width + "px" } }, h("div", { class: "mg-lh" }, "Subtask"),
    ...rows.map(r => h("div", { class: "mg-l" + (r.isSummary ? " summary" : ""), "data-id": r.id, title: `${r.wbs} ${r.name} · ${fmtShort(r.S)} → ${fmtShort(r.F)} · ${r.ST}` },
      h("span", { style: { width: (r.depth - t.depth - 1) * 14 + "px", flex: "none" } }), h("span", { class: "w" }, r.wbs), h("span", { class: "n" }, (r.isMilestone ? "◆ " : "") + r.name),
      M.noteCount.get(r.id) ? h("span", { class: "nc", title: "Work notes" }, "💬" + M.noteCount.get(r.id)) : null)));
}
function miniGanttSvg(t, rows, width) {
  const sc = buildScale("fit", width, [t, ...rows]);
  const H = Math.max(rows.length, 1) * ROW, HD = 44;
  const idx = new Map(rows.map((r, i) => [r.id, i]));
  const rowOf = x => idx.get(x.id) ?? null;
  let body = backgroundSvg(sc, H);
  if (t.S != null) body += `<rect class="mg-span" x="${xOf(sc, t.S)}" y="0" width="${Math.max(2, xOf(sc, t.F + 1) - xOf(sc, t.S))}" height="${H}"/>`;
  body += rows.map((r, i) => `<line class="mg-row" x1="0" x2="${sc.width}" y1="${(i + 1) * ROW}" y2="${(i + 1) * ROW}"/>`).join("");
  body += M.deps.filter(d => idx.has(d.pred_id) && idx.has(d.succ_id)).map(d => depPath(sc, d, rowOf, "mg")).join("");
  body += rows.map((r, i) => barSvg(sc, r, i * ROW, { print: true, noLabel: true })).join("");
  return `<svg width="${sc.width}" height="${H + HD}" class="mg-svg">${defs("mg")}<g class="mg-hdr">${headerSvg(sc)}</g><g transform="translate(0,${HD})">${body}</g></svg>`;
}

// ---------- Work notes (activity stream) ----------
const linkify = s => s.replace(/https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"]/g, u => `<a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`);
function fmtWhen(iso) {
  const d = new Date(iso); if (isNaN(d)) return { abs: iso || "", rel: "" };
  const abs = d.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
  const s = (Date.now() - d) / 1000;
  const rel = s < 60 ? "just now" : s < 3600 ? Math.floor(s / 60) + " min ago" : s < 86400 ? Math.floor(s / 3600) + " h ago" : s < 172800 ? "yesterday" : s < 14 * 86400 ? Math.floor(s / 86400) + " days ago" : "";
  return { abs, rel };
}
const PERSON_SVG = `<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="7" r="3.6"/><path d="M3.2 17.5c.6-3.6 3.4-5.6 6.8-5.6s6.2 2 6.8 5.6z"/></svg>`;
function notesSection(t) {
  const withSub = t.isSummary && UI.notesWithSub;
  const list = notesFor(t.id, withSub);
  const sec = h("section", { class: "f-sec notes" });
  const subCb = t.isSummary ? h("input", { type: "checkbox", checked: UI.notesWithSub }) : null;
  subCb?.addEventListener("change", () => { UI.notesWithSub = subCb.checked; lsSet("pm.notesWithSub", UI.notesWithSub); renderForm(true); });
  sec.append(h("div", { class: "f-sec-h" }, h("h3", {}, "Work notes"), h("span", { class: "hint" }, list.length ? `${list.length}` : ""), h("span", { class: "spacer" }),
    subCb ? h("label", { class: "hint" }, subCb, " Include subtask notes") : null));

  // Compose box (notes carry a date, not a name: DECISIONS #41)
  const ta = h("textarea", { class: "n-compose", "data-keep": "compose", rows: 3, placeholder: "Add a work note… (Ctrl+Enter to post)" });
  ta.value = UI.noteDrafts.get(t.id) || "";
  ta.addEventListener("input", () => { ta.value ? UI.noteDrafts.set(t.id, ta.value) : UI.noteDrafts.delete(t.id); });
  const post = () => {
    if (!ta.value.trim()) { toast("Write something first"); ta.focus(); return; }
    const body = ta.value;
    UI.noteDrafts.delete(t.id);
    if (!mutate(`Task ${t.wbs}: added a work note`, () => opAddNote(t.id, body))) { UI.noteDrafts.set(t.id, body); renderForm(true); }
  };
  ta.addEventListener("keydown", e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); post(); } e.stopPropagation(); });
  sec.append(h("div", { class: "n-composer" }, ta, h("div", { class: "n-cbar" }, h("span", { class: "spacer" }), h("button", { class: "primary", onclick: post }, "Post"))));

  // Stream, newest first
  const stream = h("div", { class: "n-stream" });
  if (!list.length) stream.append(h("div", { class: "hint n-empty" }, withSub ? "No work notes on this task or its subtasks yet." : "No work notes yet."));
  for (const n of list) stream.append(noteEntry(t, n));
  sec.append(stream);
  return sec;
}
function noteEntry(t, n) {
  const c = fmtWhen(n.created_at), ed = n.updated_at ? fmtWhen(n.updated_at) : null;
  const on = n.task_id !== t.id ? M.tasks.get(n.task_id) : null;
  const editing = UI.editNote?.id === n.id;
  const head = h("div", { class: "n-head" },
    n.author ? h("b", {}, n.author) : null,
    on ? h("span", { class: "n-on" }, "on ", h("a", { href: "#", onclick: e => { e.preventDefault(); openRecord(on.id); } }, `${on.wbs} ${on.name}`)) : null,
    h("time", { title: n.created_at }, c.abs + (c.rel ? ` · ${c.rel}` : "")),
    ed ? h("span", { class: "n-ed", title: `Edited ${ed.abs}` }, "(edited)") : null,
    h("span", { class: "spacer" }),
    editing ? null : h("button", { class: "link", onclick: () => { UI.editNote = { id: n.id, created: n.created_at, text: n.body }; renderForm(true); const ta = $("formPane").querySelector(".n-edit"); if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); } } }, "Edit"),
    editing ? null : h("button", { class: "link danger", onclick: () => { if (confirm("Delete this work note? (Undo is available.)")) mutate(`Task ${on?.wbs || t.wbs}: deleted a work note`, () => opDeleteNote(n.id)); } }, "Delete"));
  let body;
  if (editing) {
    const ta = h("textarea", { class: "n-edit", "data-keep": "note-edit", rows: Math.min(10, n.body.split("\n").length + 1) });
    ta.value = UI.editNote.text;
    ta.addEventListener("input", () => { if (UI.editNote) UI.editNote.text = ta.value; });
    const save = () => { const v = ta.value; const prev = UI.editNote; UI.editNote = null; if (v.trim() === n.body) { renderForm(true); return; } if (!mutate(`Task ${on?.wbs || t.wbs}: edited a work note`, () => opEditNote(n.id, v))) { UI.editNote = prev; renderForm(true); } };
    const cancel = () => { UI.editNote = null; renderForm(true); };
    ta.addEventListener("keydown", e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); save(); } else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); cancel(); } e.stopPropagation(); });
    body = h("div", {}, ta, h("div", { class: "n-cbar" }, h("span", { class: "spacer" }), h("button", { onclick: cancel }, "Cancel"), h("button", { class: "primary", onclick: save }, "Save")));
  } else body = h("div", { class: "n-body", html: linkify(esc(n.body)) });
  return h("div", { class: "n-entry", "data-note": n.id },
    h("div", { class: "n-av", title: n.author || "", html: PERSON_SVG }),
    h("div", { class: "n-main" }, head, body));
}

// ---------- Related records (tabbed lists at the bottom) ----------
// Each tab: key, label, count(t) (null = no badge), render(t) → element. New record types (e.g. RAID) register here (DECISIONS #40).
const RELATED_TABS = [
  { key: "children", label: "Subtasks", count: t => t.children.length, render: relChildren },
  { key: "pred", label: "Predecessors", count: t => (M.depsIn.get(t.id) || []).length, render: t => relDeps(t, "in") },
  { key: "succ", label: "Successors", count: t => (M.depsOut.get(t.id) || []).length, render: t => relDeps(t, "out") },
  { key: "raci", label: "People (RACI)", count: t => rolesOf(t.id).length, render: relRaci },
  { key: "issues", label: "Plan issues", count: t => M.issues.filter(i => i.task === t).length, render: relIssues },
  { key: "raid", label: "RAID", count: () => null, render: relRaid, soon: true },
];
function relatedSection(t) {
  const cur = RELATED_TABS.find(x => x.key === UI.formTab) || RELATED_TABS[0];
  const bar = h("div", { class: "rel-tabs", role: "tablist" });
  for (const tab of RELATED_TABS) {
    const n = tab.count(t);
    bar.append(h("button", { class: "rel-tab" + (tab === cur ? " on" : ""), role: "tab", "data-tab": tab.key, onclick: () => { UI.formTab = tab.key; lsSet("pm.formTab", tab.key); renderForm(true); } },
      tab.label, n != null ? h("span", { class: "cnt" }, String(n)) : null, tab.soon ? h("span", { class: "soon" }, "soon") : null));
  }
  return h("section", { class: "f-sec rel" }, h("div", { class: "f-sec-h" }, h("h3", {}, "Related records")), bar, h("div", { class: "rel-body" }, cur.render(t)));
}
const relTable = (heads, rows, empty) => rows.length
  ? h("table", { class: "rel-list" }, h("thead", {}, h("tr", {}, ...heads.map(x => h("th", {}, x)))), h("tbody", {}, ...rows))
  : h("div", { class: "hint rel-empty" }, empty);

function relChildren(t) {
  const add = h("button", {
    onclick: () => {
      const last = t.children.at(-1);
      UI.collapsed.delete(t.id); saveCollapsed();
      if (mutate("Added subtask", () => opAddTask({ parentId: t.id, name: "New task", ...newTaskDefaults(last || t) }))) toast("Subtask added. Click it to open its record and rename it");
    }
  }, "＋ New subtask");
  const rows = t.children.map(c => h("tr", { class: "click" + (c.isSummary ? " summary" : ""), onclick: () => openRecord(c.id) },
    h("td", {}, c.wbs), h("td", {}, (c.isMilestone ? "◆ " : "") + c.name), h("td", {}, fmtShort(c.S)), h("td", {}, fmtShort(c.F)),
    h("td", {}, c.P + "%"), h("td", { html: `<span class="st ${stClass(c.ST)}">${esc(c.ST)}</span>` }),
    h("td", { html: `<span class="chips">${rolesOf(c.id, "R").map(r => chipFor(r)).join("")}</span>` }),
    h("td", { class: "num" }, M.noteCount.get(c.id) ? "💬 " + M.noteCount.get(c.id) : "")));
  return h("div", {}, h("div", { class: "rel-bar" }, add),
    relTable(["WBS", "Name", "Start", "Finish", "%", "Status", "Responsible", "Notes"], rows, t.isMilestone ? "Milestones normally have no subtasks." : "No subtasks. Adding one turns this into a summary task whose dates roll up."));
}
function relDeps(t, dir) {
  const list = (dir === "in" ? M.depsIn : M.depsOut).get(t.id) || [];
  const rows = list.map(d => {
    const o = M.tasks.get(dir === "in" ? d.pred_id : d.succ_id);
    const type = h("select", {}, ...DEP_TYPES.map(k => h("option", { value: k, selected: k === d.type }, `${k}: ${DEP_NAMES[k]}`)));
    const lag = h("input", { type: "number", value: d.lag, title: "Lag in working days (negative = lead)", style: { width: "64px" } });
    const ch = () => mutate(`Link ${M.tasks.get(d.pred_id).wbs} → ${M.tasks.get(d.succ_id).wbs}: ${type.value} ${lag.value}d`, () => opUpdateDep(d.id, type.value, +lag.value));
    type.addEventListener("change", ch); lag.addEventListener("change", ch);
    return h("tr", {}, h("td", {}, h("a", { href: "#", onclick: e => { e.preventDefault(); openRecord(o.id); } }, o.wbs)), h("td", {}, o.name),
      h("td", {}, type), h("td", {}, lag), h("td", { title: d.violated ? "Dates conflict with this link. Dates are never moved automatically." : "" }, d.violated ? "⚠ conflict" : "OK"),
      h("td", {}, h("button", { class: "x", title: "Remove link", onclick: () => mutate("Removed link", () => opRemoveDep(d.id)) }, "✕")));
  });
  const linked = new Set(list.map(d => dir === "in" ? d.pred_id : d.succ_id));
  const add = h("select", {}, h("option", { value: "" }, dir === "in" ? "＋ Add predecessor…" : "＋ Add successor…"),
    ...M.order.filter(x => x !== t && !isAncestor(x, t) && !isAncestor(t, x) && !linked.has(x.id)).map(x => h("option", { value: x.id }, `${x.wbs} ${x.name}`)));
  add.addEventListener("change", () => {
    const oid = +add.value; if (!oid) return;
    const [p, s] = dir === "in" ? [oid, t.id] : [t.id, oid];
    mutate(`Linked ${M.tasks.get(p).wbs} → ${M.tasks.get(s).wbs}`, () => opAddDep(p, s, "FS", 0));
  });
  return h("div", {}, h("div", { class: "rel-bar" }, add),
    relTable([dir === "in" ? "Predecessor" : "Successor", "Name", "Type", "Lag (d)", "Dates", ""], rows, dir === "in" ? "Nothing has to happen before this task." : "Nothing waits on this task."));
}
function relRaci(t) {
  const rows = rolesOf(t.id).map(r => {
    const p = M.parties.get(r.party_id);
    const sel = h("select", {}, ...ROLES.map(x => h("option", { value: x, selected: x === r.role }, `${x}: ${ROLE_NAMES[x]}`)));
    sel.addEventListener("change", () => mutate(`Task ${t.wbs}: ${p.name} → ${sel.value}`, () => opSetRole(t.id, p.id, sel.value)));
    return h("tr", {}, h("td", {}, (p.kind === "team" ? "👥 " : "") + p.name + (p.active ? "" : " (inactive)")), h("td", {}, p.kind === "team" ? "Team" : p.title || "Person"), h("td", {}, sel),
      h("td", {}, h("button", { class: "x", title: "Remove", onclick: () => mutate(`Task ${t.wbs}: removed ${p.name}`, () => opSetRole(t.id, p.id, null)) }, "✕")));
  });
  const assigned = new Set(rolesOf(t.id).map(r => r.party_id));
  const addRole = h("select", {}, ...ROLES.map(x => h("option", { value: x, selected: x === (rolesOf(t.id, "R").length ? "C" : "R") }, `${x}: ${ROLE_NAMES[x]}`)));
  const addSel = h("select", {}, h("option", { value: "" }, "＋ Add person or team…"),
    ...[...M.people, ...M.teams].filter(p => p.active && !assigned.has(p.id)).map(p => h("option", { value: p.id }, (p.kind === "team" ? "👥 " : "") + p.name)));
  addSel.addEventListener("change", () => { const pid = +addSel.value; if (pid) mutate(`Task ${t.wbs}: ${partyName(pid)} → ${addRole.value}`, () => opSetRole(t.id, pid, addRole.value)); });
  const acc = accountable(t);
  return h("div", {}, h("div", { class: "rel-bar" }, addRole, addSel),
    acc.inherited && acc.list.length ? h("div", { class: "hint", style: { margin: "0 0 6px" } }, `Accountable inherited from ${acc.from.wbs}: ${acc.list.map(r => partyName(r.party_id)).join(", ")}`) : null,
    relTable(["Person or team", "Kind / title", "Role", ""], rows, "Nobody is assigned to this task yet."));
}
function relIssues(t) {
  const list = M.issues.filter(i => i.task === t);
  if (!list.length) return h("div", { class: "hint rel-empty" }, "No plan issues for this task.");
  return h("div", {}, ...list.map(i => h("div", { class: "msg " + (i.level === "warn" ? "warn" : "") }, i.text)));
}
function relRaid() {
  return h("div", { class: "rel-soon" },
    h("p", {}, h("b", {}, "Risks, actions, issues and decisions"), " will be linked to tasks here in an upcoming version."),
    h("table", { class: "rel-list" }, h("thead", {}, h("tr", {}, ...["Type", "Number", "Short description", "State", "Owner", "Due"].map(x => h("th", {}, x)))),
      h("tbody", {}, h("tr", {}, h("td", { colspan: 6, class: "hint" }, "No RAID items yet.")))));
}
