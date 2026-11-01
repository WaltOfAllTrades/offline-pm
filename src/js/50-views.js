// ---------- Popover + modal helpers ----------
// onClose runs when the popover is dismissed by clicking elsewhere (it's how pickers save); Escape cancels.
let popOnClose = null;
function openPop(x, y, content, onClose = null) {
  closePop();
  const pop = $("pop"); pop.innerHTML = ""; pop.append(content); pop.hidden = false; popOnClose = onClose;
  const r = pop.getBoundingClientRect();
  pop.style.left = clamp(x, 8, innerWidth - r.width - 8) + "px";
  pop.style.top = (y + r.height > innerHeight - 8 ? Math.max(8, y - r.height - 8) : y) + "px";
  const first = pop.querySelector("input:not([type=checkbox]),select,input"); if (first) first.focus();
}
function closePop(commit = false) {
  const pop = $("pop"), cb = popOnClose; popOnClose = null;
  if (!pop.hidden) { pop.hidden = true; pop.innerHTML = ""; }
  if (commit && cb) cb();
}
document.addEventListener("pointerdown", e => {
  if (!$("pop").hidden && !e.target.closest("#pop")) closePop(true);
  if (!e.target.closest(".menuwrap")) $$(".menu").forEach(m => m.hidden = true);
  if (!$("logPanel").hidden && !e.target.closest("#logPanel,#savePill")) $("logPanel").hidden = true;
}, true);

function openModal(title, body, footer, cls = "") {
  const m = $("modal"); m.className = "modal " + cls; m.innerHTML = "";
  m.append(h("div", { class: "modal-h" }, h("h2", {}, title), h("button", { class: "icon", title: "Close", onclick: closeModal }, "✕")), body);
  if (footer) m.append(footer);
  $("modalBack").hidden = false;
}
function closeModal() { $("modalBack").hidden = true; $("modal").innerHTML = ""; }
const modalOpen = () => !$("modalBack").hidden;

const avatarColor = p => { let hsh = 0; for (const c of p.name) hsh = (hsh * 31 + c.charCodeAt(0)) >>> 0; return `hsl(${hsh % 360} 55% 48%)`; };
const initials = n => n.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join("");

// ---------- Party picker (R/A cells, record form) ----------
function openPartyPicker(rect, taskId, role) {
  const t = M.tasks.get(taskId); if (!t) return;
  openPartyPickerFor(rect, {
    title: `${ROLE_NAMES[role]}: ${t.wbs} ${t.name}`, role,
    current: rolesOf(taskId, role).map(r => r.party_id),
    others: new Map(rolesOf(taskId).filter(r => r.role !== role).map(r => [r.party_id, r.role])),
    save: ids => mutate(`Task ${t.wbs}: ${ROLE_NAMES[role]} → ${ids.map(partyName).join(", ") || "none"}`, () => opSetRoleParties(taskId, role, ids)),
  });
}
// Generic picker: { title, role, current: [ids], others: Map(id → role), save(ids), onDone? }.
function openPartyPickerFor(rect, o) {
  const current = new Set(o.current);
  const box = h("div");
  box.append(h("h4", {}, o.title));
  const search = h("input", { type: "search", placeholder: "Search people & teams…", style: { width: "100%" } });
  const list = h("div", { class: "pick" });
  const all = [...M.people, ...M.teams].filter(p => p.active || current.has(p.id));
  const draw = () => {
    const s = search.value.trim().toLowerCase(); list.innerHTML = "";
    for (const p of all) {
      if (s && !p.name.toLowerCase().includes(s) && !p.email.toLowerCase().includes(s)) continue;
      const cb = h("input", { type: "checkbox", checked: current.has(p.id) });
      cb.addEventListener("change", () => { cb.checked ? current.add(p.id) : current.delete(p.id); });
      list.append(h("label", {}, cb, (p.kind === "team" ? "👥 " : "") + p.name, o.others.has(p.id) ? h("span", { class: "sub" }, `now ${o.others.get(p.id)}`) : p.kind === "team" ? h("span", { class: "sub" }, "team") : null));
    }
    if (!list.children.length) list.append(h("div", { class: "hint", style: { padding: "6px" } }, all.length ? "No match." : "No people yet."));
  };
  search.addEventListener("input", draw);
  const addNew = kind => {
    const name = search.value.trim() || prompt(`New ${kind} name:`); if (!name) return;
    let pid; if (mutate(`Added ${kind} ${name}`, () => { pid = opAddParty(kind, name); })) { current.add(pid); const p = M.parties.get(pid); if (p) all.push(p); search.value = ""; draw(); }
  };
  draw();
  const done = () => { if (o.onDone) o.onDone(); else $("gridBody").focus(); };
  const save = () => {
    closePop(false);
    const ids = [...current];
    if (o.current.slice().sort().join() !== ids.slice().sort().join()) o.save(ids);
    done();
  };
  search.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); save(); } if (e.key === "Escape") { closePop(); done(); } });
  box.append(search, list, h("div", { class: "acts" },
    h("button", { onclick: () => addNew("person") }, "＋ Person"), h("button", { onclick: () => addNew("team") }, "＋ Team"),
    h("span", { class: "spacer" }), h("button", { class: "primary", onclick: save }, "Done")));
  if (o.role === "A" && current.size > 1) box.prepend(h("div", { class: "msg warn" }, "RACI expects exactly one Accountable."));
  openPop(rect.left, rect.bottom + 4, box, save);
}

// ---------- Dependency editor popover ----------
function openDepEditor(depId, x, y) {
  const d = M.deps.find(z => z.id === depId); if (!d) return;
  const p = M.tasks.get(d.pred_id), s = M.tasks.get(d.succ_id);
  const type = h("select", {}, ...DEP_TYPES.map(k => h("option", { value: k, selected: k === d.type }, `${k}: ${DEP_NAMES[k]}`)));
  const lag = h("input", { type: "number", value: d.lag, step: 1, style: { width: "80px" } });
  const apply = () => { const cur = M.deps.find(z => z.id === depId) || d; if (type.value !== cur.type || +lag.value !== cur.lag) mutate(`Link ${p.wbs} → ${s.wbs}: ${type.value} lag ${lag.value}d`, () => opUpdateDep(d.id, type.value, +lag.value)); };
  type.addEventListener("change", apply); lag.addEventListener("change", apply);
  const box = h("div", {},
    h("h4", {}, "Dependency"),
    h("div", { class: "hint" }, `${p.wbs} ${p.name}`), h("div", { class: "hint" }, `→ ${s.wbs} ${s.name}`),
    h("div", { class: "frm", style: { marginTop: "8px" } }, h("label", {}, "Type"), type, h("label", {}, "Lag (days)"), h("div", {}, lag, h("span", { class: "hint" }, "  negative = lead"))),
    d.violated ? h("div", { class: "msg warn" }, "Dates currently conflict with this link. Dates are never moved automatically.") : null,
    h("div", { class: "acts" }, h("button", { class: "danger", onclick: () => { closePop(); UI.selDep = null; mutate(`Removed link ${p.wbs} → ${s.wbs}`, () => opRemoveDep(d.id)); } }, "Delete link"), h("button", { onclick: closePop }, "Close")));
  openPop(x + 8, y + 8, box);
}

// ---------- RACI matrix ----------
function renderRaci() {
  const wrap = $("raciWrap");
  const onlyUsed = $("raciOnlyUsed").checked, leaves = $("raciLeaves").checked;
  const used = new Set(); for (const list of M.raci.values()) for (const r of list) used.add(r.party_id);
  const cols = [...M.people, ...M.teams].filter(p => onlyUsed ? used.has(p.id) : (p.active || used.has(p.id)));
  const rows = M.order.filter(t => !leaves || !t.isSummary);
  if (!M.order.length) { wrap.innerHTML = `<div class="empty">No tasks in this project yet.</div>`; return; }
  if (!cols.length) { wrap.innerHTML = `<div class="empty">No ${onlyUsed ? "assignments" : "people or teams"} yet. Untick “Only people/teams with assignments” or add people on the People &amp; teams tab.</div>`; return; }
  const issuesBy = new Map(); for (const i of M.issues) if (i.kind === "raci" && i.level === "warn") { if (!issuesBy.has(i.task.id)) issuesBy.set(i.task.id, []); issuesBy.get(i.task.id).push(i.text); }
  let html = `<table class="raci"><thead><tr><th class="tn">Task</th>${cols.map(p => `<th class="pc" title="${esc(p.name)}">${esc(p.name)}<span class="k">${p.kind === "team" ? "team" : esc(p.title || "")}</span></th>`).join("")}<th>Warnings</th></tr></thead><tbody>`;
  for (const t of rows) {
    const map = new Map(rolesOf(t.id).map(r => [r.party_id, r.role]));
    const inh = accountable(t);
    html += `<tr class="${t.isSummary ? "summary" : ""}"><td class="tn" style="padding-left:${8 + t.depth * 16}px" title="${esc(t.name)}"><a href="#" class="tn-link" data-open="${t.id}" title="Open record">${esc(t.wbs)}&nbsp; ${esc(t.name)}</a></td>`;
    for (const p of cols) {
      const r = map.get(p.id) || "";
      const ghost = !r && inh.inherited && inh.list.some(a => a.party_id === p.id);
      const ar = t.r_is_a && (r === "A" || ghost); // Responsible = Accountable
      html += `<td class="cell ${r}" data-t="${t.id}" data-p="${p.id}" title="${esc(p.name)}: ${r ? ROLE_NAMES[r] : ghost ? "Accountable (inherited)" : "none"}${ar ? " and Responsible" : ""}">${r ? r + (ar ? "/R" : "") : ghost ? `<span style="opacity:.35">a${ar ? "/r" : ""}</span>` : ""}</td>`;
    }
    html += `<td class="flag">${(issuesBy.get(t.id) || []).map(esc).join("; ")}</td></tr>`;
  }
  wrap.innerHTML = html + "</tbody></table>";
}
function initRaci() {
  $("raciWrap").addEventListener("click", e => {
    const link = e.target.closest("[data-open]"); if (link) { e.preventDefault(); openRecord(+link.dataset.open); return; }
    const td = e.target.closest("td.cell"); if (!td) return;
    const tid = +td.dataset.t, pid = +td.dataset.p, t = M.tasks.get(tid);
    const role = rolesOf(tid).find(r => r.party_id === pid)?.role || "";
    const cur = role === "A" && t.r_is_a ? "A/R" : role;
    // A/R = Accountable plus the task's "Responsible same as Accountable" switch (DECISIONS #48).
    const seq = ["", "R", "A", "A/R", "C", "I", ""]; const next = seq[seq.indexOf(cur) + 1];
    const keep = $("raciWrap").scrollTop, keepL = $("raciWrap").scrollLeft;
    mutate(`RACI ${t.wbs}: ${partyName(pid)} → ${next || "none"}`, () => {
      if (next === "A/R") { opSetRole(tid, pid, "A"); opSetRIsA(tid, true); return; }
      if (cur === "A/R") opSetRIsA(tid, false);
      opSetRole(tid, pid, next || null);
    });
    $("raciWrap").scrollTop = keep; $("raciWrap").scrollLeft = keepL;
  });
  $("raciOnlyUsed").addEventListener("change", renderRaci);
  $("raciLeaves").addEventListener("change", renderRaci);
}

// ---------- People & teams ----------
function assignmentCounts() { const c = new Map(); for (const r of q("SELECT party_id, COUNT(*) n FROM (SELECT party_id FROM raci UNION ALL SELECT party_id FROM risk_party UNION ALL SELECT party_id FROM mitigant_party) GROUP BY party_id")) c.set(r.party_id, r.n); return c; }
function renderPeople() {
  const counts = assignmentCounts();
  const pl = $("peopleList"), tl = $("teamList"); pl.innerHTML = ""; tl.innerHTML = "";
  if (!M.people.length) pl.append(h("div", { class: "hint", style: { padding: "8px" } }, "No people yet."));
  for (const p of M.people) {
    const teams = (M.teamsOf.get(p.id) || []).map(partyName);
    pl.append(h("div", { class: "prow" + (p.active ? "" : " inactive") },
      h("div", { class: "avatar", style: { background: avatarColor(p) } }, initials(p.name)),
      h("div", { class: "info" }, h("div", { class: "nm" }, p.name + (p.active ? "" : " (inactive)")),
        h("div", { class: "meta" }, [p.title, p.email, teams.length ? "Teams: " + teams.join(", ") : ""].filter(Boolean).join(" · ") || "—")),
      h("span", { class: "hint", title: "Assignments across all projects" }, `${counts.get(p.id) || 0} tasks`),
      h("button", { onclick: () => showInvolvement(p.id) }, "Involvement"),
      h("button", { onclick: () => editParty(p.id) }, "Edit")));
  }
  if (!M.teams.length) tl.append(h("div", { class: "hint", style: { padding: "8px" } }, "No teams yet."));
  for (const p of M.teams) {
    const mem = (M.members.get(p.id) || []).map(partyName);
    tl.append(h("div", { class: "prow" + (p.active ? "" : " inactive") },
      h("div", { class: "avatar team", style: { background: avatarColor(p) } }, initials(p.name)),
      h("div", { class: "info" }, h("div", { class: "nm" }, p.name + (p.active ? "" : " (inactive)")), h("div", { class: "meta" }, mem.length ? mem.join(", ") : "No members")),
      h("span", { class: "hint" }, `${counts.get(p.id) || 0} tasks`),
      h("button", { onclick: () => showInvolvement(p.id) }, "Involvement"),
      h("button", { onclick: () => editParty(p.id) }, "Edit")));
  }
}
function editParty(id, kind) {
  const p = id ? M.parties.get(id) : { kind, name: "", email: "", title: "", active: 1 };
  const name = h("input", { value: p.name, placeholder: "Name" }), email = h("input", { value: p.email, placeholder: "name@company.com", type: "email" });
  const title = h("input", { value: p.title, placeholder: "Role or job title" }), active = h("input", { type: "checkbox", checked: !!p.active });
  const memberSet = new Set(id ? M.members.get(id) || [] : []);
  const body = h("div", { class: "modal-b" });
  const frm = h("div", { class: "frm" }, h("label", {}, "Name"), name);
  if (p.kind === "person") frm.append(h("label", {}, "Email"), email, h("label", {}, "Title"), title);
  frm.append(h("label", {}, "Active"), h("label", { style: { color: "inherit" } }, active, " Can be assigned to tasks"));
  body.append(frm);
  if (p.kind === "team") {
    body.append(h("h4", { style: { margin: "14px 0 6px" } }, "Members"));
    const pick = h("div", { class: "pick" });
    for (const person of M.people) {
      const cb = h("input", { type: "checkbox", checked: memberSet.has(person.id) });
      cb.addEventListener("change", () => cb.checked ? memberSet.add(person.id) : memberSet.delete(person.id));
      pick.append(h("label", {}, cb, person.name, h("span", { class: "sub" }, person.title || "")));
    }
    if (!M.people.length) pick.append(h("div", { class: "hint" }, "Add people first."));
    body.append(pick);
  }
  const save = () => {
    let newId = id;
    const ok = mutate(id ? `Edited ${p.kind} ${name.value}` : `Added ${p.kind} ${name.value}`, () => {
      if (!id) newId = opAddParty(p.kind, name.value, { email: email.value, title: title.value });
      opUpdateParty(newId, { name: name.value, email: email.value, title: title.value, active: active.checked });
      if (p.kind === "team") opSetMembers(newId, [...memberSet]);
    });
    if (ok) closeModal();
  };
  const del = () => {
    const n = assignmentCounts().get(id) || 0;
    if (!confirm(`Delete ${p.name}? ${n ? `They hold ${n} task or risk role(s); those will be removed. Consider marking them inactive instead.` : ""}`)) return;
    if (mutate(`Deleted ${p.kind} ${p.name}`, () => opDeleteParty(id))) closeModal();
  };
  const foot = h("div", { class: "modal-f" }, id ? h("button", { class: "danger", onclick: del }, "Delete") : null, h("span", { class: "spacer" }), h("button", { onclick: closeModal }, "Cancel"), h("button", { class: "primary", onclick: save }, "Save"));
  openModal(id ? `Edit ${p.kind}` : `New ${p.kind}`, body, foot, "small");
  name.focus();
  body.addEventListener("keydown", e => { if (e.key === "Enter" && e.target.tagName === "INPUT" && e.target.type !== "checkbox") save(); });
}

// Tasks a party is involved in, across all projects (person includes their teams).
function involvementRows(pid) {
  const p = M.parties.get(pid);
  const ids = p.kind === "person" ? [pid, ...(M.teamsOf.get(pid) || [])] : [pid];
  return q(`SELECT r.role, r.party_id, t.id, t.name, t.start, t.finish, t.status, t.project_id, pr.name AS project
            FROM raci r JOIN task t ON t.id=r.task_id JOIN project pr ON pr.id=t.project_id
            WHERE r.party_id IN (${ids.map(() => "?").join(",")}) ORDER BY pr.position, pr.id, t.start`, ids);
}
function showInvolvement(pid) {
  const p = M.parties.get(pid); const rows = involvementRows(pid);
  const body = h("div", { class: "modal-b" });
  if (!rows.length) body.append(h("p", { class: "hint" }, "Not assigned to any tasks."));
  for (const role of ROLES) {
    const list = rows.filter(r => r.role === role); if (!list.length) continue;
    body.append(h("h3", { style: { margin: "12px 0 6px", fontSize: "14px" } }, `${ROLE_NAMES[role]} (${list.length})`));
    const tb = h("table", { class: "map" }, h("tr", {}, h("th", {}, "Project"), h("th", {}, "Task"), h("th", {}, "Start"), h("th", {}, "Finish"), h("th", {}, "Status"), h("th", {}, "Via")));
    for (const r of list) tb.append(h("tr", {}, h("td", {}, r.project), h("td", {}, r.name), h("td", {}, fmtShort(parseYMD(r.start))), h("td", {}, fmtShort(parseYMD(r.finish))), h("td", {}, r.status), h("td", {}, r.party_id === pid ? "direct" : "team " + partyName(r.party_id))));
    body.append(tb);
  }
  openModal(`Involvement: ${p.name}`, body, h("div", { class: "modal-f" }, h("button", { onclick: () => printInvolvement(pid) }, "Print"), h("button", { class: "primary", onclick: closeModal }, "Close")));
}

// ---------- Issues ----------
let issueFilter = "all";
function renderIssues() {
  const list = $("issueList"); list.innerHTML = "";
  const items = M.issues.filter(i => issueFilter === "all" || (issueFilter === "warn" ? i.level === "warn" : i.kind === issueFilter))
    .sort((a, b) => (a.level === b.level ? 0 : a.level === "warn" ? -1 : 1) || a.task.index - b.task.index);
  if (!items.length) list.append(h("div", { class: "empty" }, M.order.length ? "No issues. Nice plan!" : "No tasks yet."));
  for (const i of items) list.append(h("div", { class: "issue", onclick: () => { switchView("plan"); selectTask(i.task.id); } },
    h("span", { class: "lvl " + i.level }, i.level === "warn" ? "warning" : "info"), h("span", { class: "tk" }, `${i.task.wbs} ${i.task.name}`), h("span", {}, i.text)));
}
function updateIssueBadge() {
  const n = M.issues.filter(i => i.level === "warn").length, b = $("issueBadge");
  b.hidden = !n; b.textContent = n;
}

// ---------- Projects menu ----------
function renderProjectMenu() {
  const cur = M.projects.find(p => p.id === M.projectId);
  $("projName").textContent = cur?.name ?? "—";
  const menu = $("projMenu"); menu.innerHTML = "";
  for (const p of M.projects) menu.append(h("button", { class: p.id === M.projectId ? "cur" : "", onclick: () => { menu.hidden = true; switchProject(p.id); } }, p.name));
  menu.append(h("hr"),
    h("button", { onclick: () => { menu.hidden = true; const n = prompt("New project name:", "New project"); if (n == null) return; let id; if (mutate(`Added project ${n}`, () => { id = opAddProject(n); })) switchProject(id); } }, "＋ New project…"),
    h("button", { onclick: () => { menu.hidden = true; const n = prompt("Rename project:", cur.name); if (n) mutate(`Renamed project to ${n}`, () => opRenameProject(cur.id, n)); } }, "Rename project…"),
    h("button", { class: "danger", onclick: () => { menu.hidden = true; if (confirm(`Delete project “${cur.name}” and all its tasks? (Undo is available.)`)) mutate(`Deleted project ${cur.name}`, () => opDeleteProject(cur.id)); } }, "Delete project…"));
}
function switchProject(id) {
  M.projectId = id; lsSet("pm.project", id);
  UI.selId = null; UI.selDep = null;
  refresh(); loadCollapsed(); computeRows(); renderAll();
  const b = $("ganttBody"); const r = projectRange(); if (SC) scrollGanttTo(r.lo, 0.05); b.scrollTop = 0;
}

// ---------- Save pill + log ----------
const fmtAgo = t => { if (!t) return "never"; const s = Math.round((Date.now() - t) / 1000); return s < 5 ? "just now" : s < 60 ? s + "s ago" : s < 3600 ? Math.round(s / 60) + "m ago" : new Date(t).toLocaleTimeString(); };
function renderSaveState() {
  const pill = $("savePill");
  let cls, text;
  if (saving || pending) { cls = "busy"; text = "Saving…"; }
  else if (lastErr) { cls = "err"; text = "Save problem"; }
  else if (!fileHandle) { cls = "warn"; text = "Not saved to a file"; }
  else if (!filePerm) { cls = "warn"; text = "Reconnect needed"; }
  else { cls = "ok"; text = `✓ Saved · ${fileHandle.name}`; }
  pill.className = "pill " + cls; pill.textContent = text;
  pill.title = !fileHandle ? "Changes are kept in this browser only. Use File → New plan file or Save a copy to put them in a .db file you can share." : `Plan file: ${fileHandle.name}. Last write ${fmtAgo(lastDiskAt)}. Click for the save log.`;
  $("mReconnect").hidden = !(fileHandle && !filePerm);
  $("undoBtn").disabled = !undoStack.length; $("redoBtn").disabled = !redoStack.length;
  if ($("logPanel").hidden) return;
  $("laneMirror").textContent = mirrorRev == null ? "empty" : `rev ${mirrorRev}`;
  $("laneDiskName").textContent = fileHandle ? fileHandle.name : "Plan file";
  $("laneDisk").textContent = !fileHandle ? "not connected" : !filePerm ? `rev ${diskRev ?? "?"} · locked` : `rev ${diskRev ?? "…"}`;
  const ol = $("logList"); ol.innerHTML = "";
  for (const e of saveLog.slice(0, 50)) {
    const time = new Date(e.at).toLocaleTimeString();
    if (e.info) { ol.append(h("li", { class: "info" }, h("div", { class: "lt" }, h("span", {}, e.info), h("time", {}, time)))); continue; }
    const li = h("li", { class: e.err ? "bad" : "" }, h("div", { class: "lt" }, h("b", {}, `rev ${e.r}`), h("time", {}, time)),
      h("div", {}, e.reasons.join(" · ") + (e.reasons.length > 1 ? ` (${e.reasons.length} edits batched)` : "")),
      h("div", {}, h("span", { class: "tag " + (e.mirrorOk ? "ok" : "bad") }, "buffer " + (e.mirrorOk ? "✓" : "✗")),
        h("span", { class: "tag " + (e.disk === "ok" ? "ok" : e.disk === "fail" ? "bad" : "no") }, e.disk === "ok" ? `disk ✓ ${e.diskMs}ms` : e.disk === "fail" ? "disk ✗" : "no file"),
        h("span", { class: "hint" }, (e.size / 1024).toFixed(1) + " KB")),
      e.err ? h("div", { style: { color: "var(--err)" } }, e.err) : null);
    ol.append(li);
  }
}

// ---------- Help ----------
function showHelp() {
  const rows = [
    ["Insert", "New task below"], ["Ctrl+Insert", "New subtask"], ["Tab / Shift+Tab", "Indent / outdent"], ["Alt+Shift+↑/↓", "Move task up / down"],
    ["Alt+← / Alt+→", "Collapse / expand"], ["Enter or F2", "Edit cell (Enter again to save)"], ["Type", "Start editing the cell"], ["Esc", "Cancel edit"],
    ["Delete", "Delete task (and subtasks)"], ["Ctrl+Z / Ctrl+Y", "Undo / redo"], ["Ctrl+I", "Open / close the record form"], ["Arrows, PgUp/PgDn", "Move around"],
  ];
  const body = h("div", { class: "modal-b" },
    h("h3", { style: { marginTop: 0 } }, "Keyboard (outline grid)"),
    h("div", { class: "help-grid" }, ...rows.flatMap(([k, v]) => [h("div", {}, ...k.split(" / ").flatMap((x, i) => i ? [" / ", h("kbd", {}, x)] : [h("kbd", {}, x)])), h("div", {}, v)])),
    h("h3", {}, "Gantt"),
    h("ul", {}, h("li", {}, "Drag a bar to move it; drag its left or right edge to change dates."),
      h("li", {}, "Hover a bar to see link handles (○). Drag from a handle onto another bar: the end you start from and the half of the target you drop on decide the type (Finish→Start, Start→Start, …)."),
      h("li", {}, "Click an arrow to change its type and lag, or delete it. Red arrows mean the dates conflict with the link; dates are never moved automatically."),
      h("li", {}, "Double-click a bar, or click ↗ next to a task name, to open its record form.")),
    h("h3", {}, "Record form"),
    h("p", {}, "Shows every field of a task, a mini Gantt of a summary task's subtasks, its work notes (dated, editable) and related records in tabs. It slides in over the outline; the Gantt stays visible, and clicking a bar switches records. Esc or ✕ closes it. ", h("kbd", {}, "Ctrl+Enter"), " posts a note."),
    h("h3", {}, "Predecessors cell"),
    h("p", {}, "Type WBS numbers separated by commas, with an optional type and lag: ", h("kbd", {}, "1.2"), " ", h("kbd", {}, "3FS+2d"), " ", h("kbd", {}, "2.1SS-1d"), " ", h("kbd", {}, "4FF+1w")),
    h("h3", {}, "Saving"),
    h("p", {}, "Every change is saved immediately: first to a crash buffer inside the browser, then to your .db plan file (if one is connected). After a refresh Chrome may ask you to click ", h("b", {}, "Reconnect"), ". Share the .db file, an Excel export, or a printed PDF with your team."));
  openModal("Help & shortcuts", body, h("div", { class: "modal-f" }, h("button", { class: "primary", onclick: closeModal }, "Close")));
}
