// ---------- Risks page: risk/mitigant grid, plan pane for drag-to-link, record panel, closeout, import ----------
Object.assign(UI, { riskFilter: "all", riskSearch: "", planSearch: "", riskSel: null, riskForm: false, riskFocus: null });
let riskBusy = false, riskHeldRender = false;

const recOf = sel => !sel ? null : sel.kind === "risk" ? M.riskById.get(sel.id) : M.mitById.get(sel.id);
const keyOf = rec => (rec.kind === "risk" ? "r" : "m") + rec.id;
const riskMatches = r => {
  const s = UI.riskSearch.trim().toLowerCase();
  if (s && !r.name.toLowerCase().includes(s) && !r.mitigants.some(m => m.text.toLowerCase().includes(s))) return false;
  return UI.riskFilter !== "gaps" || r.gaps.length > 0;
};

let riskRendering = false, riskRenderAgain = false;
function renderRisks() {
  if (UI.view !== "risks" || riskBusy) return;
  if (formHold) { riskHeldRender = true; return; }
  if (riskRendering) { riskRenderAgain = true; return; } // a blur-commit fired mid-render: render again afterwards
  riskRendering = true;
  try {
    const body = $("riskBody"), ae = document.activeElement;
    const inView = $("view-risks").contains(ae);
    // Commit a half-typed cell or panel field before rebuilding (its own re-render is skipped while riskBusy).
    if (inView && ae._commit) { riskBusy = true; try { ae._commit(); } finally { riskBusy = false; } }
    if (inView) ae._cancel?.(); // the element is about to be removed; its blur must not commit again
    const pending = UI.riskFocus; UI.riskFocus = null;
    const keep = pending?.key || (inView ? ae.dataset.keep : null);
    const caret = !pending && inView && ae.selectionStart != null ? [ae.selectionStart, ae.selectionEnd] : null;
    const sTop = body.scrollTop;
    if (UI.riskSel && !recOf(UI.riskSel)) UI.riskSel = null;
    renderRiskGrid(); renderPlanList(); renderRiskForm();
    body.scrollTop = sTop;
    if (keep) {
      const el = $("view-risks").querySelector(`[data-keep="${keep}"]`);
      if (el) {
        el.focus();
        try { const n = el.value?.length ?? 0; if (pending?.select) el.select(); else el.setSelectionRange(...(caret || [n, n])); } catch { }
      }
    }
  } finally { riskRendering = false; }
  if (riskRenderAgain) { riskRenderAgain = false; renderRisks(); }
}

// ---------- Grid ----------
// Text that commits once on change/blur; Enter/Backspace/Escape keyboard handled by the caller.
function bindText(el, orig, commit) {
  let done = false;
  const go = () => { if (done || el.value.trim() === orig.trim()) return; done = true; commit(el.value); };
  el._commit = go; el._orig = orig; el._cancel = () => { done = true; };
  el._dirty = () => !done && el.value.trim() !== orig.trim();
  el.addEventListener("change", go); el.addEventListener("blur", go);
  return el;
}
const autoGrow = ta => { ta.style.height = "auto"; ta.style.height = ta.scrollHeight + "px"; };
function partyCell(rec, role) {
  const eff = role === "A" ? recAccountable(rec) : recResponsible(rec);
  const dim = !!eff.inherited || !!eff.same;
  const btn = h("button", { class: "rk-party", disabled: role === "R" && !!rec.r_is_a, title: role === "R" && rec.r_is_a ? "Same as Accountable" : `Choose ${ROLE_NAMES[role]}`,
    html: eff.list.length ? eff.list.map(p => chipFor(p, dim, eff.same ? " (same as Accountable)" : eff.inherited ? " (from the risk)" : "")).join("") : `<span class="hint">—</span>` });
  btn.addEventListener("click", e => { e.stopPropagation(); pickRecParties(btn, rec, role); });
  return btn;
}
function pickRecParties(anchor, rec, role) {
  openPartyPickerFor(anchor.getBoundingClientRect(), {
    title: `${ROLE_NAMES[role]}: ${shortText(recLabel(rec), 50)}`, role,
    current: recRoles(rec, role).map(p => p.party_id),
    others: new Map(recRoles(rec).filter(p => p.role !== role).map(p => [p.party_id, p.role])),
    save: ids => mutate(`${rec.kind === "risk" ? "Risk" : "Mitigant"}: ${ROLE_NAMES[role]} → ${ids.map(partyName).join(", ") || "none"}`, () => opSetRecParties(rec.kind, rec.id, role, ids)),
    onDone: () => { },
  });
}
const riskBadge = r => `<span class="rs rs-${r.status.toLowerCase()}">${r.status}${r.response === "mitigate" && r.mitigants.length ? ` · ${r.achievedCount}/${r.mitigants.length}` : ""}</span>`;
const gapIcon = gaps => gaps.length ? h("span", { class: "warn-dot", title: gaps.join("\n") }, "⚠") : null;

function renderRiskGrid() {
  const body = $("riskBody");
  const risks = M.risks.filter(riskMatches);
  const tb = h("tbody");
  for (const r of risks) {
    tb.append(riskRowEl(r));
    for (const m of r.mitigants) tb.append(mitRowEl(m));
  }
  const table = h("table", { class: "rk" },
    h("thead", {}, h("tr", {}, h("th", { title: "Drag a row by ⠿ onto a task in the plan" }, "⠿"), ...["Risk / mitigant", "Status", "Achieved", "Implemented by", "Accountable", "Responsible", "P · I / Control", ""].map(x => h("th", {}, x)))), tb);
  body.innerHTML = "";
  if (!M.risks.length) body.append(h("div", { class: "empty" }, "No risks yet. Click ", h("b", {}, "＋ Risk"), ", or import a risk register from Excel."));
  else if (!risks.length) body.append(h("div", { class: "empty" }, UI.riskFilter === "gaps" ? "No gaps. Every risk is covered." : "No risks match the filter."));
  else body.append(table);
  for (const ta of body.querySelectorAll("textarea")) autoGrow(ta);
}
function updateRiskBadge() { const g = M.risks.filter(r => r.gaps.length).length; $("riskGapCount").textContent = g ? String(g) : ""; $("riskGapCount").hidden = !g; }
function riskRowEl(r) {
  const name = bindText(h("input", { class: "rk-name", value: r.name, "data-keep": `r${r.id}:name` }), r.name, v => mutate(`Renamed risk to “${v.trim()}”`, () => opUpdateRisk(r.id, { name: v })));
  name.addEventListener("keydown", e => {
    if (e.key === "Enter") { e.preventDefault(); name._commit(); let id; if (mutate("Added mitigant", () => { id = opAddMitigant(r.id, "New mitigant", 0); })) focusRisk(`m${id}:text`, true); }
    else if (e.key === "Escape") { name.value = r.name; name.blur(); }
    e.stopPropagation();
  });
  const sel = (field, title) => { const s = h("select", { class: "rk-lmh", title }, ...Object.entries(LMH).map(([k, v]) => h("option", { value: k, selected: r[field] === k }, k || "–"))); s.addEventListener("change", () => mutate(`Risk ${title} → ${LMH[s.value]}`, () => opUpdateRisk(r.id, { [field]: s.value }))); return s; };
  const tr = h("tr", { class: "rk-risk" + (isSel(r) ? " sel" : ""), "data-risk": r.id },
    h("td", { class: "rk-drag", title: "Drag onto a task in the plan" }, "⠿"),
    h("td", { class: "rk-tc" }, h("div", { class: "rk-cell" }, h("span", { class: "rk-kind" }, "Risk"), name, gapIcon(r.gaps), openBtn("risk", r.id))),
    h("td", { html: riskBadge(r) }),
    h("td", { class: "num" }, r.response === "accept" ? "—" : `${r.achievedCount} of ${r.mitigants.length}`),
    h("td", {}, r.response === "accept" ? h("span", { class: "hint", title: r.accept_reason }, "Accepted") : null),
    h("td", {}, partyCell(r, "A")), h("td", {}, partyCell(r, "R")),
    h("td", {}, h("span", { class: "hint" }, "P "), sel("probability", "probability"), h("span", { class: "hint" }, " I "), sel("impact", "impact")),
    h("td", { class: "rk-acts" },
      h("button", { class: "icon", title: "Add mitigant", onclick: () => { let id; if (mutate("Added mitigant", () => { id = opAddMitigant(r.id); })) focusRisk(`m${id}:text`, true); } }, "＋"),
      h("button", { class: "icon", title: "Delete risk", onclick: () => deleteRiskRec(r) }, "✕")));
  return tr;
}
function mitRowEl(m) {
  const ta = bindText(h("textarea", { class: "rk-text", rows: 1, "data-keep": `m${m.id}:text` }, m.text), m.text, v => mutate("Edited mitigant", () => opUpdateMitigant(m.id, { text: v })));
  ta.addEventListener("input", () => autoGrow(ta));
  ta.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (!ta.value.trim()) return; ta._commit(); let id; if (mutate("Added mitigant", () => { id = opAddMitigant(m.risk_id, "New mitigant", m.id); })) focusRisk(`m${id}:text`, true); }
    else if (e.key === "Backspace" && !ta.value && !m.tasks.length && !m.parties.length && !m.testing.trim() && !m.handed_to.trim() && !scalar("SELECT COUNT(*) FROM note WHERE mitigant_id=?", [m.id])) {
      e.preventDefault(); const i = m.risk.mitigants.indexOf(m), prev = m.risk.mitigants[i - 1];
      ta._cancel(); ta._commit = null;
      if (mutate("Deleted mitigant", () => opDeleteMitigant(m.id))) focusRisk(prev ? `m${prev.id}:text` : `r${m.risk_id}:name`);
    } else if (e.key === "Escape") { ta.value = m.text; ta.blur(); }
    e.stopPropagation();
  });
  const st = statusSelect(m, "rk-st");
  const ctl = h("input", { type: "checkbox", checked: !!m.is_control, title: "Control: achieved only when Tested" });
  ctl.addEventListener("change", () => mutate(`Mitigant ${ctl.checked ? "is" : "is not"} a control`, () => opUpdateMitigant(m.id, { is_control: ctl.checked })));
  const tasks = h("div", { class: "rk-tasks" },
    ...m.tasks.map(t => h("span", { class: "tchip st-" + stClass(t.ST).slice(3), "data-task": t.id, title: `${t.wbs} ${t.name} · ${t.ST} · ${fmtShort(t.S)} → ${fmtShort(t.F)}` },
      h("a", { href: "#", onclick: e => { e.preventDefault(); taskPopover(t.id, e.currentTarget.getBoundingClientRect()); } }, `${t.wbs} ${shortText(t.name, 26)}`),
      h("button", { class: "x", title: "Unlink", onclick: () => mutate(`Unlinked ${t.wbs}`, () => opUnlinkTask(m.id, t.id)) }, "✕"))),
    h("button", { class: "rk-add", title: "Create a task that implements this mitigant", onclick: () => quickTask(m) }, "＋ Task"));
  return h("tr", { class: "rk-mit" + (isSel(m) ? " sel" : ""), "data-mit": m.id },
    h("td", { class: "rk-drag", title: "Drag onto a task to link it, or between tasks to create one there" }, "⠿"),
    h("td", { class: "rk-tc" }, h("div", { class: "rk-cell rk-indent" }, h("span", { class: "rk-kind mit" }, "Mit."), ta, gapIcon(m.gaps), openBtn("mitigant", m.id))),
    h("td", {}, st),
    h("td", { class: "num", title: m.is_control ? "Control: achieved when Tested" : "Achieved when Implemented" }, m.achieved ? "✓" : "✗"),
    h("td", {}, tasks),
    h("td", {}, partyCell(m, "A")), h("td", {}, partyCell(m, "R")),
    h("td", {}, h("label", { class: "hint rk-ctl" }, ctl, " Control")),
    h("td", { class: "rk-acts" },
      h("button", { class: "icon", title: "Delete mitigant", onclick: () => deleteMitRec(m) }, "✕")));
}
// With linked tasks only the derived status and Tested can be chosen (DECISIONS #53).
function statusSelect(m, cls = "") {
  const done = m.tasks.filter(t => t.ST === "Done").length;
  const st = h("select", { class: cls, title: m.tasks.length ? `Follows the linked tasks (${done} of ${m.tasks.length} done). Tested is set by hand` : "Set by hand (no linked tasks)" },
    ...MIT_STATUSES.map(s => h("option", { selected: s === m.eff, disabled: m.tasks.length > 0 && s !== "Tested" && s !== m.eff && !(m.eff === "Tested" && s === (done === m.tasks.length ? "Implemented" : "Planned")) }, s)));
  st.addEventListener("change", () => {
    const v = st.value === "Tested" ? "Tested" : m.tasks.length ? "" : st.value;
    if (v === m.status) return;
    if (v === "Tested" && m.is_control && !m.testing.trim()) toast("Marked Tested. Add how it was tested in the mitigant's Testing field");
    mutate(`Mitigant status → ${st.value}`, () => opUpdateMitigant(m.id, { status: v }));
  });
  return st;
}
// Same place as the Plan outline: right after the name, shown on hover or when the row is selected.
const openBtn = (kind, id) => h("button", { class: "open-rec rk-open", title: "Open record", onclick: e => { e.stopPropagation(); openRiskRecord(kind, id); } }, "↗");
const isSel = rec => UI.riskSel && UI.riskSel.kind === rec.kind && UI.riskSel.id === rec.id;
function focusRisk(key, select) { UI.riskFocus = { key, select }; renderRisks(); }
function deleteRiskRec(r) {
  const n = r.mitigants.length;
  if (n && !confirm(`Delete risk “${r.name}” and its ${n} mitigant${n > 1 ? "s" : ""}? (Undo is available.)`)) return;
  mutate(`Deleted risk “${r.name}”`, () => opDeleteRisk(r.id));
}
function deleteMitRec(m) {
  if (m.tasks.length && !confirm(`Delete this mitigant? It is linked to ${m.tasks.length} task(s); the tasks stay. (Undo is available.)`)) return;
  mutate("Deleted mitigant", () => opDeleteMitigant(m.id));
}
function quickTask(m, place) {
  let id;
  if (mutate(`Created a task for a mitigant`, () => { id = opTaskFromMitigant(m.id, place); })) {
    // After the (possibly deferred) re-render: flash it in the plan and offer an inline rename.
    setTimeout(() => {
      flashPlanRow(id);
      const chip = $("view-risks").querySelector(`.tchip[data-task="${id}"]`) || $("riskPlanList").querySelector(`.rp-row[data-id="${id}"]`);
      if (chip) taskPopover(id, chip.getBoundingClientRect(), true);
    }, 30);
  }
}
// Quick look at a linked task without leaving the Risks page: rename, status, dates, open in the plan.
function taskPopover(id, rect, fresh) {
  const t = M.tasks.get(id); if (!t) return;
  const name = h("input", { value: t.name, style: { width: "100%" } });
  const st = h("select", { disabled: t.isSummary }, ...STATUSES.map(s => h("option", { selected: s === t.ST }, s)));
  const save = () => {
    const ops = [];
    if (name.value.trim() && name.value.trim() !== t.name) ops.push(() => opSetField(id, "name", name.value));
    if (!t.isSummary && st.value !== t.ST) ops.push(() => opSetField(id, "status", st.value));
    if (ops.length) mutate(`Task ${t.wbs} updated`, () => ops.forEach(f => f()));
  };
  name.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); closePop(true); } if (e.key === "Escape") { closePop(); } e.stopPropagation(); });
  const box = h("div", { class: "tpop" },
    h("h4", {}, fresh ? `New task ${t.wbs}: name it` : `Task ${t.wbs}`), name,
    h("div", { class: "frm", style: { marginTop: "8px" } }, h("label", {}, "Status"), st, h("label", {}, "Dates"), h("span", {}, `${fmtShort(t.S)} → ${fmtShort(t.F)} (${t.dur ?? 0}d)`), h("label", {}, "Under"), h("span", {}, t.parent ? `${t.parent.wbs} ${t.parent.name}` : "Top level")),
    h("div", { class: "acts" }, h("button", { onclick: () => { closePop(true); openRecord(id); } }, "Open in plan ↗"), h("span", { class: "spacer" }), h("button", { class: "primary", onclick: () => closePop(true) }, "Done")));
  openPop(rect.left, rect.bottom + 4, box, save);
  name.focus(); if (fresh) name.select();
}

// ---------- Plan pane (drop targets) ----------
function renderPlanList() {
  const list = $("riskPlanList"); const s = UI.planSearch.trim().toLowerCase();
  let rows = M.order;
  if (s) { const keep = new Set(); for (const t of M.order) if (t.name.toLowerCase().includes(s) || t.wbs.startsWith(s)) for (let x = t; x; x = x.parent) keep.add(x.id); rows = M.order.filter(t => keep.has(t.id)); }
  list.innerHTML = rows.length ? rows.map(t => {
    const n = (M.mitByTask.get(t.id) || []).length;
    return `<div class="rp-row${t.isSummary ? " summary" : ""}" data-id="${t.id}" title="${esc(t.wbs + " " + t.name)} · ${esc(t.ST)} · ${fmtShort(t.S)} → ${fmtShort(t.F)}"><span style="width:${t.depth * 14}px;flex:none"></span><span class="w">${esc(t.wbs)}</span><span class="dot ${stClass(t.ST)}"></span><span class="n">${t.isMilestone ? "◆ " : ""}${esc(t.name)}</span>${n ? `<span class="sh" title="Implements ${n} mitigant(s)">🛡${n}</span>` : ""}</div>`;
  }).join("") : `<div class="empty">${M.order.length ? "No tasks match." : "No tasks in this project yet."}</div>`;
}
function flashPlanRow(id) { const el = $("riskPlanList").querySelector(`.rp-row[data-id="${id}"]`); if (el) { el.scrollIntoView({ block: "nearest" }); el.classList.add("flash"); setTimeout(() => el.classList.remove("flash"), 1400); } }

// ---------- Drag and drop: mitigant/risk → task, task → mitigant/risk ----------
function beginRecDrag(e, src) {
  const sx = e.clientX, sy = e.clientY; let active = false, drop = null, timer = null;
  const plan = $("riskPlanList"), grid = $("riskBody");
  const clear = () => $$(".drop-before,.drop-after,.drop-on", $("view-risks")).forEach(x => x.classList.remove("drop-before", "drop-after", "drop-on"));
  const label = src.kind === "task" ? `${M.tasks.get(src.id).wbs} ${M.tasks.get(src.id).name}` : shortText(recLabel(recOf(src)), 50);
  let last = null;
  const move = ev => {
    if (!active && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 5) return;
    active = true; document.body.style.cursor = "grabbing"; last = ev;
    const scroller = src.kind === "task" ? grid : plan, r = scroller.getBoundingClientRect();
    clearInterval(timer);
    if (ev.clientX > r.left && ev.clientX < r.right) {
      const dy = ev.clientY < r.top + 28 ? -14 : ev.clientY > r.bottom - 28 ? 14 : 0;
      if (dy) timer = setInterval(() => { scroller.scrollTop += dy; hit(last); }, 30); // the row under the pointer changes as it scrolls
    }
    hit(ev);
  };
  const hit = ev => {
    clear(); drop = null;
    const el = document.elementFromPoint(ev.clientX, ev.clientY);
    if (src.kind === "task") {
      const row = el?.closest("tr.rk-mit, tr.rk-risk"); if (!row) { showTip(ev, `Drop on a mitigant: ${label}`); return; }
      row.classList.add("drop-on");
      drop = row.dataset.mit ? { kind: "mitigant", id: +row.dataset.mit } : { kind: "risk", id: +row.dataset.risk };
      showTip(ev, drop.kind === "mitigant" ? `${label} implements “${shortText(M.mitById.get(drop.id).text, 40)}”` : `Link ${label} to a mitigant of “${shortText(M.riskById.get(drop.id).name, 40)}”…`);
      return;
    }
    const row = el?.closest(".rp-row"); if (!row) { showTip(ev, `Drop on a task to link, or between tasks to create one: ${label}`); return; }
    const t = M.tasks.get(+row.dataset.id), rr = row.getBoundingClientRect(), y = (ev.clientY - rr.top) / rr.height;
    let where = y < .25 ? "before" : y > .75 ? "after" : "on";
    let target = t;
    if (where === "after" && t.isSummary && !UI.collapsed.has(t.id) && t.children.length) { where = "before"; target = t.children[0]; } // just below a summary = its first child
    row.classList.add("drop-" + (target === t ? where : "after")); drop = { taskId: target.id, where };
    showTip(ev, where === "on" ? `Link: ${t.wbs} ${t.name} implements “${label}”` : `Create a new task ${target === t ? where + " " + t.wbs : "as first subtask of " + t.wbs} implementing “${label}”`);
  };
  const up = ev => {
    removeEventListener("pointermove", move); removeEventListener("pointerup", up); removeEventListener("pointercancel", cancel); removeEventListener("blur", cancel); removeEventListener("keydown", esc, true);
    clearInterval(timer); clear(); hideTip(); document.body.style.cursor = "";
    if (!active || !drop || ev.type !== "pointerup") return;
    if (src.kind === "task") {
      if (drop.kind === "mitigant") linkMit(drop.id, src.id);
      else chooseMitigant(ev, M.riskById.get(drop.id), M.tasks.get(src.id).name, mid => linkMit(mid, src.id));
      return;
    }
    const act = mid => drop.where === "on" ? linkMit(mid, drop.taskId) : quickTask(M.mitById.get(mid) || { id: mid }, { targetId: drop.taskId, where: drop.where });
    if (src.kind === "mitigant") act(src.id);
    else chooseMitigant(ev, M.riskById.get(src.id), drop.where === "on" ? M.tasks.get(drop.taskId).name : "", act);
  };
  const cancel = ev => up(ev);
  const esc = ev => { if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); removeEventListener("keydown", esc, true); cancel(ev); } };
  addEventListener("pointermove", move); addEventListener("pointerup", up); addEventListener("pointercancel", cancel); addEventListener("blur", cancel); addEventListener("keydown", esc, true);
}
function linkMit(mitId, taskId) {
  const m = M.mitById.get(mitId), t = M.tasks.get(taskId);
  if (m.tasks.includes(t)) { toast("Already linked"); return; }
  if (mutate(`Linked ${t.wbs} to a mitigant`, () => opLinkTask(mitId, taskId))) toast(`${t.wbs} ${shortText(t.name, 30)} now implements “${shortText(m.text, 40)}”`);
}
// A risk was dropped: ask which of its mitigants (or a new one) the link is for.
function chooseMitigant(ev, r, suggested, then) {
  const box = h("div", {}, h("h4", {}, `Which mitigant of “${shortText(r.name, 40)}”?`));
  const list = h("div", { class: "pick" });
  for (const m of r.mitigants) list.append(h("button", { class: "pick-btn", onclick: () => { closePop(); then(m.id); } }, shortText(m.text, 70)));
  const newText = h("input", { value: suggested || "", placeholder: "New mitigant text", style: { width: "100%" } });
  const addNew = () => { const v = newText.value.trim(); if (!v) return newText.focus(); closePop(); let id; if (mutate("Added mitigant", () => { id = opAddMitigant(r.id, v); })) then(id); };
  newText.addEventListener("keydown", e => { if (e.key === "Enter") addNew(); e.stopPropagation(); });
  box.append(list, h("div", { class: "acts" }, newText, h("button", { class: "primary", onclick: addNew }, "＋ New")));
  openPop(ev.clientX, ev.clientY, box);
}

// ---------- Record panel (same slide-out pattern as tasks) ----------
function openRiskRecord(kind, id) {
  if (UI.view !== "risks") switchView("risks");
  UI.riskSel = { kind, id }; UI.riskForm = true; UI.editNote = null;
  renderRisks();
}
function sizeRiskForm() {
  const split = $("riskSplit").clientWidth || innerWidth;
  $("riskFormPane").style.width = (UI.riskForm ? Math.round(clamp(split / 3, Math.min(420, split - 200), split - 200)) : 0) + "px";
}
function closeRiskForm() { UI.riskForm = false; UI.editNote = null; renderRisks(); }
function renderRiskForm() {
  const pane = $("riskFormPane"), rec = UI.riskForm ? recOf(UI.riskSel) : null;
  const show = !!rec && UI.view === "risks";
  if (show !== pane.classList.contains("open")) { UI.riskForm = show; sizeRiskForm(); }
  pane.classList.toggle("open", show); pane.setAttribute("aria-hidden", String(!show));
  if (!show) { pane.dataset.rec = ""; return; }
  if (UI.editNote && !one("SELECT 1 FROM note WHERE id=? AND created_at=?", [UI.editNote.id, UI.editNote.created])) UI.editNote = null;
  const key = keyOf(rec), scroll = pane.dataset.rec === key ? pane.scrollTop : 0;
  pane.dataset.rec = key; pane.innerHTML = "";
  const proj = M.projects.find(p => p.id === M.projectId);
  const crumbs = [h("span", {}, proj?.name || ""), h("span", { class: "sep" }, "›"), h("span", {}, "Risks")];
  if (rec.kind === "mitigant") crumbs.push(h("span", { class: "sep" }, "›"), h("a", { href: "#", onclick: e => { e.preventDefault(); openRiskRecord("risk", rec.risk_id); } }, shortText(rec.risk.name, 40)));
  pane.append(h("div", { class: "f-head" },
    h("div", { class: "f-title" }, h("div", { class: "f-crumbs" }, ...crumbs),
      h("h2", {}, h("span", { class: "f-kind" }, rec.kind === "risk" ? "Risk" : rec.is_control ? "Control" : "Mitigant"), shortText(recLabel(rec), 90))),
    h("div", { class: "f-acts" }, h("button", { class: "icon", title: "Close (Esc)", onclick: closeRiskForm }, "✕"))));
  pane.append(rec.kind === "risk" ? riskFields(rec) : mitFields(rec));
  pane.append(rec.kind === "risk" ? riskMitList(rec) : mitTaskList(rec));
  pane.append(notesBlock({
    draftKey: key, list: recNotes(rec.kind, rec.id), pane: "riskFormPane", rerender: () => renderRisks(), label: rec.kind === "risk" ? "Risk" : "Mitigant",
    empty: "No work notes yet.", post: body => mutate(`${rec.kind === "risk" ? "Risk" : "Mitigant"}: added a work note`, () => opAddRecNote(rec.kind, rec.id, body)),
  }));
  pane.scrollTop = scroll;
}
function recField(label, el, cls = "") { return h("div", { class: "f-field " + cls }, h("label", {}, label), el); }
function recText(rec, field, multi, attrs = {}) {
  const v = rec[field] ?? "";
  const el = multi ? h("textarea", { rows: attrs.rows || 3, "data-keep": `f:${field}`, ...attrs }, v) : h("input", { value: v, "data-keep": `f:${field}`, ...attrs });
  const upd = rec.kind === "risk" ? opUpdateRisk : opUpdateMitigant;
  bindText(el, v, nv => mutate(`${rec.kind === "risk" ? "Risk" : "Mitigant"}: ${field} changed`, () => upd(rec.id, { [field]: nv })));
  if (!multi) el.addEventListener("keydown", e => { if (e.key === "Enter") el.blur(); });
  el.addEventListener("keydown", e => e.stopPropagation());
  return el;
}
function recParty(rec, role) {
  const eff = role === "A" ? recAccountable(rec) : recResponsible(rec);
  const same = role === "R" && !!rec.r_is_a;
  const btn = h("button", { class: "f-party", disabled: same, html: (eff.list.length ? eff.list.map(p => chipFor(p, !!eff.inherited || same)).join("") : `<span class="hint">None</span>`) + (eff.inherited ? `<span class="hint"> from the risk</span>` : "") });
  btn.addEventListener("click", () => pickRecParties(btn, rec, role));
  if (role !== "R") return btn;
  const sw = h("input", { type: "checkbox", role: "switch", class: "sw", checked: same });
  sw.addEventListener("change", () => mutate(`Responsible ${sw.checked ? "= Accountable" : "chosen separately"}`, () => opSetRecRIsA(rec.kind, rec.id, sw.checked)));
  return h("div", { class: "f-rbox" }, btn, h("label", { class: "f-sw" }, sw, " Same as Accountable"));
}
function riskFields(r) {
  const resp = h("select", {}, h("option", { value: "mitigate", selected: r.response === "mitigate" }, "Mitigate"), h("option", { value: "accept", selected: r.response === "accept" }, "Accept"));
  resp.addEventListener("change", () => mutate(`Risk response → ${resp.value}`, () => opUpdateRisk(r.id, { response: resp.value })));
  const lmh = f => { const s = h("select", {}, ...Object.entries(LMH).map(([k, v]) => h("option", { value: k, selected: r[f] === k }, v))); s.addEventListener("change", () => mutate(`Risk ${f} → ${LMH[s.value]}`, () => opUpdateRisk(r.id, { [f]: s.value }))); return s; };
  const split = h("button", { onclick: () => splitDialog(r) }, "✂ Split into mitigants");
  return h("section", { class: "f-sec det" }, h("div", { class: "f-fields" },
    recField("Name", recText(r, "name"), "wide"),
    recField("Response", resp), recField("Status", h("div", { html: riskBadge(r) })),
    recField("Probability", lmh("probability")), recField("Impact", lmh("impact")),
    recField("Accountable", recParty(r, "A")), recField("Responsible", recParty(r, "R")),
    r.response === "accept" ? recField("Reason for accepting", recText(r, "accept_reason", true, { rows: 2 }), "wide") : null,
    recField("Description", recText(r, "description", true, { rows: 2 }), "wide"),
    recField("Mitigation plan (as received)", h("div", { class: "f-rbox" }, recText(r, "plan", true, { rows: 4, placeholder: "Paste the mitigation plan here, then split it into mitigants" }), split), "wide")),
    r.gaps.length ? h("div", { class: "msg warn" }, r.gaps.join(". ") + ".") : null);
}
function mitFields(m) {
  const st = statusSelect(m);
  const ctl = h("input", { type: "checkbox", role: "switch", class: "sw", checked: !!m.is_control });
  ctl.addEventListener("change", () => mutate(`Mitigant ${ctl.checked ? "is" : "is not"} a control`, () => opUpdateMitigant(m.id, { is_control: ctl.checked })));
  return h("section", { class: "f-sec det" }, h("div", { class: "f-fields" },
    recField("Mitigant", recText(m, "text", true, { rows: 2 }), "wide"),
    recField("Control", h("label", { class: "f-sw" }, ctl, m.is_control ? " Achieved when Tested" : " One-off: achieved when Implemented")),
    recField("Status", st),
    recField("Accountable", recParty(m, "A")), recField("Responsible", recParty(m, "R")),
    recField("Handed to (after the project)", recText(m, "handed_to", false, { placeholder: "Team or person who runs it afterwards" })),
    recField("Achieved", h("div", {}, m.achieved ? "✓ Yes" : "✗ Not yet")),
    recField("Testing", recText(m, "testing", true, { rows: 3, placeholder: "How it was or will be tested, evidence, dates…" }), "wide")),
    h("div", { class: "hint", style: { marginTop: "6px" } }, m.tasks.length ? "Planned / Implemented follow the linked tasks. Tested is set by hand." : "No linked tasks, so the status is set by hand."),
    m.gaps.length ? h("div", { class: "msg warn" }, m.gaps.join(". ") + ".") : null);
}
function riskMitList(r) {
  const add = h("button", { onclick: () => { let id; if (mutate("Added mitigant", () => { id = opAddMitigant(r.id); })) openRiskRecord("mitigant", id); } }, "＋ Mitigant");
  const rows = r.mitigants.map(m => h("tr", { class: "click", onclick: () => openRiskRecord("mitigant", m.id) },
    h("td", {}, m.text), h("td", {}, m.eff), h("td", {}, m.is_control ? "Control" : ""), h("td", {}, m.achieved ? "✓" : "✗"),
    h("td", {}, m.tasks.map(t => t.wbs).join(", "))));
  return h("section", { class: "f-sec" }, h("div", { class: "f-sec-h" }, h("h3", {}, "Mitigants"), h("span", { class: "hint" }, r.response === "accept" ? "Accepted risk" : `${r.achievedCount} of ${r.mitigants.length} achieved`), h("span", { class: "spacer" }), add),
    relTable(["Mitigant", "Status", "", "Achieved", "Tasks"], rows, "No mitigants yet. Add one, or paste the plan above and split it."));
}
function mitTaskList(m) {
  const linked = new Set(m.tasks.map(t => t.id));
  const addSel = h("select", {}, h("option", { value: "" }, "＋ Link a task…"), ...M.order.filter(t => !linked.has(t.id)).map(t => h("option", { value: t.id }, `${t.wbs} ${t.name}`)));
  addSel.addEventListener("change", () => { const id = +addSel.value; if (id) linkMit(m.id, id); });
  const rows = m.tasks.map(t => h("tr", {},
    h("td", {}, h("a", { href: "#", onclick: e => { e.preventDefault(); openRecord(t.id); } }, t.wbs)), h("td", {}, t.name),
    h("td", {}, fmtShort(t.S)), h("td", {}, fmtShort(t.F)), h("td", { html: `<span class="st ${stClass(t.ST)}">${esc(t.ST)}</span>` }),
    h("td", {}, h("button", { class: "x", title: "Unlink", onclick: () => mutate(`Unlinked ${t.wbs}`, () => opUnlinkTask(m.id, t.id)) }, "✕"))));
  return h("section", { class: "f-sec" }, h("div", { class: "f-sec-h" }, h("h3", {}, "Implemented by"), h("span", { class: "spacer" }), addSel, h("button", { onclick: () => quickTask(m) }, "＋ Task")),
    relTable(["WBS", "Task", "Start", "Finish", "Status", ""], rows, "No tasks yet. Drag this mitigant onto a task, or click ＋ Task."));
}

// ---------- Split a pasted plan into mitigants ----------
function splitDialog(r) {
  const parts = splitMitigationPlan(r.plan);
  if (!parts.length) { toast("Paste the mitigation plan into the field first"); return; }
  const ta = h("textarea", { rows: Math.min(14, parts.length + 2), style: { width: "100%" } }, parts.join("\n"));
  const count = h("span", { class: "hint" });
  const upd = () => { const n = ta.value.split("\n").filter(x => x.trim()).length; count.textContent = `${n} mitigant${n === 1 ? "" : "s"} will be added`; };
  ta.addEventListener("input", upd); upd();
  const go = () => {
    const lines = ta.value.split("\n").map(x => x.trim()).filter(Boolean);
    if (mutate(`Split plan into ${lines.length} mitigants`, () => { for (const l of lines) opAddMitigant(r.id, l); })) closeModal();
  };
  openModal(`Split “${shortText(r.name, 40)}” into mitigants`, h("div", { class: "modal-b" }, h("p", { class: "hint", style: { marginTop: 0 } }, "One mitigant per line. Edit, merge or delete lines before adding."), ta),
    h("div", { class: "modal-f" }, count, h("span", { class: "spacer" }), h("button", { onclick: closeModal }, "Cancel"), h("button", { class: "primary", onclick: go }, "Add mitigants")), "small");
  ta.focus();
}

// ---------- Closeout report ----------
function closeoutRows() {
  const out = [];
  for (const r of M.risks) {
    const names = list => list.map(p => partyName(p.party_id)).join("; ");
    const base = { risk: r.name, response: r.response === "accept" ? "Accept" : "Mitigate", riskStatus: r.status, pi: `${r.probability || "–"} / ${r.impact || "–"}`, reason: r.response === "accept" ? r.accept_reason : "", riskA: names(recAccountable(r).list) };
    if (!r.mitigants.length) out.push({ ...base, mitigant: r.response === "accept" ? "" : "(no mitigants)", mitA: "", mitR: "", control: "", status: "", achieved: r.response === "accept" ? "n/a" : "No", evidence: "", testing: "", handed: "" });
    for (const m of r.mitigants) out.push({ ...base, mitigant: m.text, mitA: names(recAccountable(m).list), mitR: names(recResponsible(m).list), control: m.is_control ? "Yes" : "", status: m.eff, achieved: m.achieved ? "Yes" : "No",
      evidence: m.tasks.map(t => `${t.wbs} ${t.name} (${t.ST}${t.F != null ? ", " + fmtYMD(t.F) : ""})`).join("; "), testing: m.testing, handed: m.handed_to });
  }
  return out;
}
function closeoutSummary() {
  const mits = M.risks.flatMap(r => r.response === "mitigate" ? r.mitigants : []);
  const mitigated = M.risks.filter(r => r.status === "Mitigated").length, accepted = M.risks.filter(r => r.status === "Accepted").length;
  return `${mits.filter(m => m.achieved).length} of ${mits.length} mitigants achieved · ${mitigated} of ${M.risks.length - accepted} risks mitigated · ${accepted} accepted`;
}
const CLOSE_COLS = [["risk", "Risk"], ["response", "Response"], ["riskStatus", "Risk status"], ["pi", "P / I"], ["riskA", "Risk accountable"], ["reason", "Reason accepted"],
  ["mitigant", "Mitigant"], ["mitA", "Accountable"], ["mitR", "Responsible"], ["control", "Control"], ["status", "Status"], ["achieved", "Achieved"], ["evidence", "Evidence (tasks)"], ["testing", "Testing"], ["handed", "Handed to"]];
const RISK_LEVEL = new Set(["risk", "response", "riskStatus", "pi", "riskA", "reason"]);
function showCloseout() {
  const rows = closeoutRows();
  const tb = h("table", { class: "map closeout" }, h("tr", {}, ...CLOSE_COLS.map(c => h("th", {}, c[1]))));
  let last = null;
  for (const r of rows) {
    tb.append(h("tr", { class: r.achieved === "No" ? "bad" : "" }, ...CLOSE_COLS.map(([k]) => h("td", {}, RISK_LEVEL.has(k) ? (r.risk === last ? "" : r[k]) : k === "achieved" ? (r[k] === "Yes" ? "✓" : r[k] === "No" ? "✗" : r[k]) : r[k]))));
    last = r.risk;
  }
  openModal("Risk closeout", h("div", { class: "modal-b" }, h("p", { style: { marginTop: 0 } }, h("b", {}, closeoutSummary())), rows.length ? tb : h("p", { class: "hint" }, "No risks yet.")),
    h("div", { class: "modal-f" }, h("button", { onclick: printCloseout }, "Print"), h("button", { onclick: exportCloseout }, "Export to Excel"), h("span", { class: "spacer" }), h("button", { class: "primary", onclick: closeModal }, "Close")));
}
function closeoutSheet() {
  const ws = XLSX.utils.aoa_to_sheet([CLOSE_COLS.map(c => c[1]), ...closeoutRows().map(r => CLOSE_COLS.map(([k]) => r[k]))]);
  ws["!cols"] = [34, 10, 12, 7, 18, 30, 50, 18, 18, 8, 12, 9, 50, 40, 20].map(w => ({ wch: w }));
  return ws;
}
function exportCloseout() {
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, closeoutSheet(), "Risk closeout");
  const name = safeName(M.projects.find(p => p.id === M.projectId)?.name) + " - risk closeout.xlsx"; XLSX.writeFile(wb, name); logInfo(`Exported ${name}`);
}
function printCloseout() {
  const root = $("printRoot"); root.innerHTML = "";
  const proj = M.projects.find(p => p.id === M.projectId);
  root.append(h("h1", {}, `${proj?.name || "Project"}: risk closeout`), h("div", { class: "sub" }, `${closeoutSummary()} · printed ${new Date().toLocaleString()}`));
  const t = h("table", { class: "wrap" }, h("tr", {}, ...CLOSE_COLS.map(c => h("th", {}, c[1]))));
  for (const r of closeoutRows()) t.append(h("tr", {}, ...CLOSE_COLS.map(([k]) => h("td", {}, String(r[k] ?? "")))));
  root.append(t, h("div", { class: "signoff" }, h("div", {}, "Reviewed by: ____________________________"), h("div", {}, "Date: ______________")));
  setTimeout(() => window.print(), 50);
}

// ---------- Import a risk register from Excel / CSV ----------
const RISK_FIELDS = [
  { key: "name", label: "Risk name", required: true, syn: ["risk", "risk name", "risk title", "title", "name", "risk description", "summary"] },
  { key: "description", label: "Description", syn: ["description", "details", "risk details", "cause", "effect", "impact description"] },
  { key: "plan", label: "Mitigation plan", syn: ["mitigation", "mitigation plan", "mitigations", "mitigants", "mitigating actions", "response plan", "controls", "risk response", "treatment", "actions"] },
  { key: "A", label: "Accountable", syn: ["accountable", "risk owner", "owner", "a"] },
  { key: "R", label: "Responsible", syn: ["responsible", "actionee", "assigned to", "r"] },
  { key: "probability", label: "Probability", syn: ["probability", "likelihood", "prob", "p"] },
  { key: "impact", label: "Impact", syn: ["impact", "severity", "consequence", "i"] },
  { key: "response", label: "Response (accept / mitigate)", syn: ["response", "strategy", "response strategy", "treatment type"] },
];
// Low/Medium/High from words, percentages/fractions, or a 1–3 / 1–5 score (max = largest number in the column).
function toLMH(v, max = 5) {
  let s = String(v ?? "").trim().toLowerCase(); if (!s) return "";
  const pct = s.endsWith("%"); s = s.replace(/%$/, "").trim();
  if (/^\d+(\.\d+)?$/.test(s)) {
    let n = +s;
    if (pct || (n <= 1 && s.includes("."))) { if (pct) n /= 100; return n >= .6 ? "H" : n >= .3 ? "M" : "L"; }
    if (max === 3) return n >= 3 ? "H" : n >= 2 ? "M" : n > 0 ? "L" : ""; // a column topping out at exactly 3 is a 1–3 scale
    return n >= 4 ? "H" : n >= 3 ? "M" : n > 0 ? "L" : "";
  }
  if (/^(very\s*low|vl|low|lo|l|minor|negligible|insignificant|rare|unlikely|remote)$/.test(s)) return "L";
  if (/^(medium|med|m|moderate|possible|average)$/.test(s)) return "M";
  if (/^(very\s*high|vh|high|hi|h|critical|severe|major|catastrophic|likely|almost\s*certain|certain)$/.test(s)) return "H";
  return "";
}
let RI = null; // risk import state
function startRiskImport() {
  const input = h("input", { type: "file", accept: ".xlsx,.xlsm,.xls,.csv,.txt", hidden: true });
  input.addEventListener("change", async () => {
    const file = input.files[0]; if (!file) return;
    try { loadRiskImport(file.name, await file.arrayBuffer()); } catch (e) { toast("Couldn't read that file: " + e.message, "err"); console.error(e); }
  });
  document.body.append(input); input.click(); setTimeout(() => input.remove(), 60000);
}
function loadRiskImport(name, buf) {
  const { wb } = readWorkbook({ name }, buf);
  RI = { name, wb, sheet: wb.SheetNames.find(n => /risk/i.test(n)) || wb.SheetNames[0], split: true, map: {} };
  riskImportSheet(); renderRiskImport();
}
const idLike = h0 => /(^| )(id|no|number|ref|#)( |$)/.test(h0);
function riskImportSheet() {
  const { text } = sheetRows(RI.wb.Sheets[RI.sheet]);
  // Header row: the row (in the first 15) with the most cells matching known column names; else the first row with 2+ cells.
  const known = new Set(RISK_FIELDS.flatMap(f => [normHdr(f.label), ...f.syn.map(normHdr)]));
  let hi = -1, best = 0;
  text.slice(0, 15).forEach((r, i) => { const n = r.filter(c => known.has(normHdr(c))).length; if (n > best) { best = n; hi = i; } });
  if (best < 2) hi = Math.max(0, text.findIndex(r => r.filter(c => String(c).trim()).length >= 2));
  RI.headers = (text[hi] || []).map(String); RI.rows = text.slice(hi + 1).filter(r => r.some(c => String(c).trim()));
  RI.map = {}; const nh = RI.headers.map(normHdr), used = new Set();
  for (const pass of ["exact", "contains"]) for (const f of RISK_FIELDS) {
    if (RI.map[f.key] != null) continue;
    const syns = [normHdr(f.label), ...f.syn.map(normHdr)];
    const i = nh.findIndex((x, k) => !used.has(k) && x && !(f.key === "name" && idLike(x)) && (pass === "exact" ? syns.includes(x) : syns.some(s => s.length >= 4 && x.includes(s))));
    if (i >= 0) { RI.map[f.key] = i; used.add(i); }
  }
}
function riskImportItems() {
  const col = k => RI.map[k], get = (r, k) => col(k) == null ? "" : String(r[col(k)] ?? "").trim();
  const maxOf = k => Math.max(0, ...RI.rows.map(r => get(r, k)).filter(v => /^\d+$/.test(v)).map(Number));
  const pMax = maxOf("probability"), iMax = maxOf("impact");
  return RI.rows.map(r => ({ name: get(r, "name"), description: get(r, "description"), plan: get(r, "plan"), A: get(r, "A"), R: get(r, "R"),
    probability: toLMH(get(r, "probability"), pMax), impact: toLMH(get(r, "impact"), iMax), response: /accept/i.test(get(r, "response")) ? "accept" : "mitigate" })).filter(x => x.name);
}
function renderRiskImport() {
  const sheetSel = h("select", {}, ...RI.wb.SheetNames.map(n => h("option", { selected: n === RI.sheet }, n)));
  sheetSel.addEventListener("change", () => { RI.sheet = sheetSel.value; riskImportSheet(); renderRiskImport(); });
  const frm = h("div", { class: "frm" }, h("label", {}, "Sheet"), sheetSel);
  for (const f of RISK_FIELDS) {
    const s = h("select", {}, h("option", { value: "" }, "— not in file —"), ...RI.headers.map((x, i) => h("option", { value: i, selected: RI.map[f.key] === i }, x || `Column ${i + 1}`)));
    s.addEventListener("change", () => { s.value === "" ? delete RI.map[f.key] : RI.map[f.key] = +s.value; renderRiskImport(); });
    frm.append(h("label", {}, f.label + (f.required ? " *" : "")), s);
  }
  const split = h("input", { type: "checkbox", checked: RI.split });
  split.addEventListener("change", () => { RI.split = split.checked; renderRiskImport(); });
  frm.append(h("label", {}, "Mitigants"), h("label", { style: { color: "inherit" } }, split, " Split each mitigation plan into mitigants (one per sentence or bullet)"));
  const items = RI.map.name == null ? [] : riskImportItems();
  const prev = h("table", { class: "map" }, h("tr", {}, h("th", {}, "Risk"), h("th", {}, "P · I"), h("th", {}, "Accountable"), h("th", {}, "Mitigants")),
    ...items.slice(0, 6).map(x => h("tr", {}, h("td", {}, x.name), h("td", {}, `${x.probability || "–"} · ${x.impact || "–"}`), h("td", {}, x.A), h("td", {}, x.response === "accept" ? "accepted" : RI.split ? String(splitMitigationPlan(x.plan).length) : x.plan ? "plan text only" : "—"))));
  const go = h("button", { class: "primary", disabled: !items.length, onclick: () => doRiskImport(items) }, `Import ${items.length} risk${items.length === 1 ? "" : "s"}`);
  openModal(`Import risks from ${RI.name}`, h("div", { class: "modal-b" }, frm, h("h4", { style: { margin: "14px 0 6px" } }, "Preview"), items.length ? prev : h("p", { class: "hint" }, "Map the Risk name column to see a preview.")),
    h("div", { class: "modal-f" }, h("span", { class: "hint" }, "Risks are added to the current project. Names in Accountable/Responsible are matched to people and teams, or added as people."), h("span", { class: "spacer" }), h("button", { onclick: closeModal }, "Cancel"), go));
}
function doRiskImport(items) {
  let nMit = 0;
  const ok = mutate(`Imported ${items.length} risks from ${RI.name}`, () => {
    const byName = new Map([...M.parties.values()].map(p => [p.kind + ":" + p.name.toLowerCase(), p.id]));
    const party = n => {
      const kind = /^team:/i.test(n) ? "team" : /^user:/i.test(n) ? "person" : null, k = n.replace(/^(team|user):/i, "").trim(); if (!k) return null;
      const key = kinds => kinds.map(x => x + ":" + k.toLowerCase()).find(x => byName.has(x));
      const hit = key(kind ? [kind] : ["person", "team"]); if (hit) return byName.get(hit);
      const id = opAddParty(kind || "person", k); byName.set((kind || "person") + ":" + k.toLowerCase(), id); return id;
    };
    let after = M.risks.at(-1)?.id ?? null;
    for (const x of items) {
      const id = opAddRisk({ name: x.name, afterId: after, description: x.description, plan: x.plan, probability: x.probability, impact: x.impact, response: x.response }); after = id;
      const A = splitNames(x.A, true).map(party).filter(Boolean), R = splitNames(x.R, true).map(party).filter(x2 => x2 && !A.includes(x2)); // ";" or new line only: "Smith, John" is one person
      if (A.length) opSetRecParties("risk", id, "A", A); if (R.length) opSetRecParties("risk", id, "R", R);
      if (RI.split && x.response === "mitigate") for (const t of splitMitigationPlan(x.plan)) { opAddMitigant(id, t); nMit++; }
    }
  });
  if (ok) { closeModal(); if (UI.view !== "risks") switchView("risks"); toast(`Imported ${items.length} risks${nMit ? ` with ${nMit} mitigants` : ""}`); }
}

function initRisks() {
  $("addRiskBtn").onclick = () => { if (UI.riskSearch || UI.riskFilter !== "all") { UI.riskSearch = ""; $("riskSearch").value = ""; UI.riskFilter = "all"; $$("#riskSeg button").forEach(x => x.classList.toggle("on", x.dataset.f === "all")); } let id; if (mutate("Added risk", () => { id = opAddRisk({ afterId: M.risks.at(-1)?.id ?? null }); })) focusRisk(`r${id}:name`, true); };
  $("riskImportBtn").onclick = startRiskImport;
  $("closeoutBtn").onclick = showCloseout;
  $$("#riskSeg button").forEach(b => b.addEventListener("click", () => { UI.riskFilter = b.dataset.f; $$("#riskSeg button").forEach(x => x.classList.toggle("on", x === b)); renderRisks(); }));
  $("riskSearch").addEventListener("input", e => { UI.riskSearch = e.target.value; renderRiskGrid(); });
  $("planSearch").addEventListener("input", e => { UI.planSearch = e.target.value; renderPlanList(); });
  $("riskBody").addEventListener("pointerdown", e => {
    const ae = document.activeElement;
    if (ae?._dirty?.() && $("view-risks").contains(ae) && !ae.contains(e.target)) { holdFormRender(); ae._commit(); }
    const tr = e.target.closest("tr.rk-risk, tr.rk-mit"); if (!tr) return;
    const sel = tr.dataset.risk ? { kind: "risk", id: +tr.dataset.risk } : { kind: "mitigant", id: +tr.dataset.mit };
    if (e.target.closest(".rk-drag")) { e.preventDefault(); beginRecDrag(e, sel); }
    if (!isSel(sel)) { UI.riskSel = sel; $$("#riskBody tr.sel").forEach(x => x.classList.remove("sel")); tr.classList.add("sel"); if (UI.riskForm) renderRisks(); }
  }, true);
  $("riskBody").addEventListener("dblclick", e => {
    const tr = e.target.closest("tr.rk-risk, tr.rk-mit"); if (!tr || e.target.closest("input,textarea,select,button")) return;
    openRiskRecord(tr.dataset.risk ? "risk" : "mitigant", +(tr.dataset.risk || tr.dataset.mit));
  });
  $("riskPlanList").addEventListener("pointerdown", e => { const row = e.target.closest(".rp-row"); if (row && e.button === 0) { e.preventDefault(); beginRecDrag(e, { kind: "task", id: +row.dataset.id }); } });
  $("riskPlanList").addEventListener("dblclick", e => { const row = e.target.closest(".rp-row"); if (row) openRecord(+row.dataset.id); });
  $("riskFormPane").addEventListener("pointerdown", e => {
    const ae = document.activeElement;
    if (ae?._dirty?.() && $("riskFormPane").contains(ae) && !ae.contains(e.target)) { holdFormRender(); ae._commit(); }
  }, true);
}
