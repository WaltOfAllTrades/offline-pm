// ---------- Popover + modal helpers ----------
// onClose runs when the popover is dismissed by clicking elsewhere (it's how pickers save); Escape cancels.
let popOnClose = null;
let popReturn = null, modalReturn = null; // where focus goes back to when they close
function openPop(x, y, content, onClose = null) {
  closePop();
  popReturn = document.activeElement;
  const pop = $("pop"); pop.innerHTML = ""; pop.append(content); pop.hidden = false; popOnClose = onClose;
  const r = pop.getBoundingClientRect();
  pop.style.left = clamp(x, 8, innerWidth - r.width - 8) + "px";
  pop.style.top = (y + r.height > innerHeight - 8 ? Math.max(8, y - r.height - 8) : y) + "px";
  const first = pop.querySelector("input:not([type=checkbox]),select,input"); if (first) first.focus();
}
function closePop(commit = false) {
  const pop = $("pop"), cb = popOnClose; popOnClose = null;
  const hadFocus = pop.contains(document.activeElement);
  if (!pop.hidden) { pop.hidden = true; pop.innerHTML = ""; }
  if (commit && cb) cb();
  if (hadFocus || document.activeElement === document.body) restoreFocus(popReturn); popReturn = null;
}
document.addEventListener("pointerdown", e => {
  if (!$("pop").hidden && !e.target.closest("#pop")) closePop(true);
  if (!e.target.closest(".menuwrap")) $$(".menu").forEach(m => m.hidden = true);
  if (!$("logPanel").hidden && !e.target.closest("#logPanel,#savePill")) $("logPanel").hidden = true;
}, true);

function openModal(title, body, footer, cls = "") {
  const m = $("modal"); m.className = "modal " + cls; m.innerHTML = "";
  if ($("modalBack").hidden) modalReturn = document.activeElement;
  m.append(h("div", { class: "modal-h" }, h("h2", { id: "modalTitle" }, title), h("button", { class: "icon", title: "Close", "aria-label": "Close", onclick: closeModal }, "✕")), body);
  if (footer) m.append(footer);
  $("modalBack").hidden = false;
  (body.querySelector?.("input,select,textarea,button") || m).focus();
}
function closeModal() { $("modalBack").hidden = true; $("modal").innerHTML = ""; restoreFocus(modalReturn); modalReturn = null; }
// Back to the element that had focus, or to the outline when it's gone (keyboard shortcuts live there).
function restoreFocus(el) {
  if (el && el.isConnected && el !== document.body && !el.closest("[hidden]")) el.focus({ preventScroll: true });
  else if (UI.view === "plan") $("gridBody").focus({ preventScroll: true });
}
// Tab stays inside an open dialog.
document.addEventListener("keydown", e => {
  if (e.key !== "Tab" || !modalOpen()) return;
  const items = $$("#modal input:not([disabled]),#modal select:not([disabled]),#modal textarea:not([disabled]),#modal button:not([disabled]),#modal a[href]").filter(x => x.offsetParent);
  if (!items.length) return;
  const first = items[0], last = items[items.length - 1];
  if (e.shiftKey && (document.activeElement === first || !$("modal").contains(document.activeElement))) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
});
const modalOpen = () => !$("modalBack").hidden;

// Dark enough for white initials to pass WCAG AA (4.5:1) at every hue, yellow included.
const avatarColor = p => { let hsh = 0; for (const c of p.name) hsh = (hsh * 31 + c.charCodeAt(0)) >>> 0; return `hsl(${hsh % 360} 55% 30%)`; };
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

// ---------- Paste chooser (DECISIONS #84) ----------
// Asks what a multi-line paste should do. The preview shows what was copied, so it opens even with one option.
// options: [{ id, label, sub, run() }]; key remembers the last choice per column ("paste.name"), highlighted next time.
function openPasteChooser(rect, { title, lines, cols = 1, options, key }) {
  const saved = lsGet("pm.pasteChoice", {});
  let cur = Math.max(0, options.findIndex(o => o.id === saved[key]));
  const pick = i => {
    const o = options[i]; if (!o) return;
    closePop(); lsSet("pm.pasteChoice", { ...lsGet("pm.pasteChoice", {}), [key]: o.id });
    o.run();
  };
  const btns = options.map((o, i) => h("button", { class: "pick-btn", "data-opt": o.id, onclick: () => pick(i), onfocus: () => { cur = i; mark(); } },
    h("kbd", {}, String(i + 1)), " ", o.label, o.sub ? h("span", { class: "sub" }, o.sub) : null));
  const mark = () => btns.forEach((b, i) => { b.classList.toggle("on", i === cur); b.setAttribute("aria-selected", String(i === cur)); });
  const box = h("div", { class: "paste-pick", tabindex: "-1", role: "dialog", "aria-label": title },
    h("h4", {}, title),
    h("ol", { class: "paste-prev" }, ...lines.slice(0, 5).map(l => h("li", {}, l ? shortText(l, 80) : h("i", { class: "hint" }, "(blank)")))),
    lines.length > 5 ? h("div", { class: "hint" }, `…and ${lines.length - 5} more`) : null,
    cols > 1 ? h("div", { class: "msg warn" }, `You copied ${cols} columns. Only the first is used. Copy one column at a time.`) : null,
    h("div", { class: "pick" }, ...btns));
  box.addEventListener("keydown", e => {
    if (e.key === "Escape") return; // the global handler closes the popover
    const n = /^[1-9]$/.test(e.key) ? +e.key : 0;
    if (n && n <= options.length) pick(n - 1);
    else if (e.key === "ArrowDown" || e.key === "ArrowUp") { cur = (cur + (e.key === "ArrowDown" ? 1 : options.length - 1)) % options.length; mark(); }
    else if (e.key === "Enter") pick(cur);
    else return;
    e.preventDefault(); e.stopPropagation();
  });
  mark();
  openPop(rect.left, rect.bottom + 4, box);
  box.focus();
  return box;
}

// ---------- Searchable pickers (DECISIONS #88) ----------
// items: [{ id, label, depth? }], match(item, lowercased search). Type to filter, ↑/↓ and Enter or a click to pick.
function openSearchPicker(rect, { title, placeholder, items, match, onPick, empty = "Nothing to pick." }) {
  const search = h("input", { type: "search", placeholder, style: { width: "100%" } });
  const list = h("div", { class: "pick" });
  let shown = [], cur = 0;
  const mark = () => list.querySelectorAll(".pick-btn").forEach((b, i) => { b.classList.toggle("on", i === cur); b.setAttribute("aria-selected", String(i === cur)); });
  const pick = i => { const x = shown[i]; if (!x) return; closePop(); onPick(x.id); };
  const draw = () => {
    const s = search.value.trim().toLowerCase(), all = s ? items.filter(x => match(x, s)) : items;
    shown = all.slice(0, 300); cur = 0;
    list.replaceChildren(...shown.map((x, i) => h("button", { class: "pick-btn", "data-id": x.id, style: x.depth ? { paddingLeft: 8 + x.depth * 14 + "px" } : null, onclick: () => pick(i) }, x.label)));
    if (!shown.length) list.append(h("div", { class: "hint", style: { padding: "6px" } }, items.length ? "No match." : empty));
    if (all.length > shown.length) list.append(h("div", { class: "hint", style: { padding: "6px" } }, `${all.length - shown.length} more. Type to narrow down`));
    mark();
  };
  search.addEventListener("input", draw);
  search.addEventListener("keydown", e => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); cur = clamp(cur + (e.key === "ArrowDown" ? 1 : -1), 0, Math.max(0, shown.length - 1)); mark(); list.querySelectorAll(".pick-btn")[cur]?.scrollIntoView({ block: "nearest" }); }
    else if (e.key === "Enter") { e.preventDefault(); pick(cur); }
  });
  draw();
  openPop(rect.left, rect.bottom + 4, h("div", { class: "search-pick" }, h("h4", {}, title), search, list));
  search.focus();
}
// The project's tasks in outline order; search by name or WBS (equal or a prefix, as the outline filter does).
function openTaskPicker(rect, { title, exclude = new Set(), onPick }) {
  const items = M.order.filter(t => !exclude.has(t.id)).map(t => ({ id: t.id, label: `${t.wbs} ${t.name}`, depth: t.depth, t }));
  openSearchPicker(rect, { title, placeholder: "Search by name or WBS…", items, onPick, empty: "No other tasks to pick.",
    match: (x, s) => x.t.name.toLowerCase().includes(s) || x.t.wbs === s || x.t.wbs.startsWith(s + ".") });
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
    h("div", { class: "acts" }, h("button", { class: "danger", onclick: () => { closePop(); UI.selDep = null; if (mutate(`Removed link ${p.wbs} → ${s.wbs}`, () => opRemoveDep(d.id))) toast(`Removed link ${p.wbs} → ${s.wbs}`, "", { undo: true }); } }, "Delete link"), h("button", { onclick: closePop }, "Close")));
  openPop(x + 8, y + 8, box);
}

// ---------- RACI matrix ----------
// By team (default): columns are teams; each cell shows the team's own role plus its members' roles (home team).
// Click opens a picker for the team's own role; the small + hands that role to one of the team's members (DECISIONS #61).
// The matrix is a keyboard grid too (DECISIONS #78): arrows move, R A C I set a role, Shift+A sets A/R, Delete clears,
// Enter opens the picker, + opens the member picker. Alt+click keeps the old one-step cycle.
UI.raciBy = lsGet("pm.raciBy", "team");
const RACI_SEQ = ["", "R", "A", "A/R", "C", "I", ""];
const roleLabel = (t, role) => role === "A" && t.r_is_a ? "A/R" : role;
const roleTitle = r => r === "A/R" ? "Accountable and Responsible" : ROLE_NAMES[r] || "No role";
let raciCur = ""; // data-* selector of the cell that holds the grid's one tab stop
// The matrix is drawn like the outline (DECISIONS #77): only the rows near the viewport, between two spacer rows
// that keep the scrollbar honest, so a big plan costs no more per click or scroll than a small one.
let RX = null; // { cls, head, rows, rowHtml(t), cols, rowH }
function showRaci(cls, head, rows, cols, rowHtml) {
  RX = { cls, head, rows, cols, rowHtml, rowH: RX?.rowH || 31 };
  renderRaciRows(true);
}
// whole: replace the table too (new data). It goes in complete, spacers included, so the scroll position survives.
function renderRaciRows(whole = false) {
  const wrap = $("raciWrap"), body = wrap.querySelector("tbody"); if (!RX?.rows || (!whole && !body)) return;
  const { scrollTop, scrollLeft } = wrap, rowH = RX.rowH, top = scrollTop - (wrap.querySelector("thead")?.offsetHeight ?? 60);
  const first = Math.max(0, Math.floor(top / rowH) - 10), last = Math.min(RX.rows.length, Math.ceil((top + wrap.clientHeight) / rowH) + 10);
  const pad = n => n > 0 ? html`<tr class="pad" aria-hidden="true"><td colspan="${RX.cols + 2}" style="height:${n * rowH}px;padding:0;border:0"></td></tr>` : "";
  const rows = html`${pad(first)}${RX.rows.slice(first, last).map(RX.rowHtml)}${pad(RX.rows.length - last)}`;
  if (whole) setHtml(wrap, html`<table class="${RX.cls}" role="grid" aria-label="RACI matrix" aria-rowcount="${RX.rows.length + 1}"><thead>${RX.head}</thead><tbody>${rows}</tbody></table>`); else setHtml(body, rows);
  wrap.scrollTop = scrollTop; wrap.scrollLeft = scrollLeft;
  // Roving tab stop: Tab enters the grid at the last cell used (or the first drawn one), arrows do the rest.
  (raciCur && wrap.querySelector("td.cell" + raciCur) || wrap.querySelector("td.cell"))?.setAttribute("tabindex", "0");
  const real = wrap.querySelector("tbody tr:not(.pad)")?.offsetHeight; // measured once the first rows are on screen
  if (real && real !== rowH) { RX.rowH = real; renderRaciRows(); }
}
function renderRaci() {
  $$("#raciBySeg button").forEach(b => b.classList.toggle("on", b.dataset.by === UI.raciBy));
  $("raciHint").textContent = UI.raciBy === "team"
    ? "Click a cell to pick the team's role; + hands it to a member. Keys: arrows, R A C I, Shift+A for A/R, Delete, +"
    : "Click a cell to pick a role. Keys: arrows, R A C I, Shift+A for A/R, Delete clears";
  $("raciOnlyUsed").parentElement.lastChild.textContent = UI.raciBy === "team" ? " Only teams with assignments" : " Only people/teams with assignments";
  RX = RX && { rowH: RX.rowH };
  if (UI.raciBy === "team") return renderRaciTeams();
  const wrap = $("raciWrap");
  const onlyUsed = $("raciOnlyUsed").checked, leaves = $("raciLeaves").checked;
  const used = new Set(); for (const list of M.raci.values()) for (const r of list) used.add(r.party_id);
  const cols = [...M.people, ...M.teams].filter(p => onlyUsed ? used.has(p.id) : (p.active || used.has(p.id)));
  const rows = M.order.filter(t => !leaves || !t.isSummary);
  if (!M.order.length) { setHtml(wrap, html`<div class="empty">No tasks in this project yet.</div>`); return; }
  if (!cols.length) { setHtml(wrap, html`<div class="empty">No ${onlyUsed ? "assignments" : "people or teams"} yet. Untick “Only people/teams with assignments” or add people on the People &amp; teams tab.</div>`); return; }
  const issuesBy = new Map(); for (const i of M.issues) if (i.kind === "raci" && i.level === "warn") { if (!issuesBy.has(i.task.id)) issuesBy.set(i.task.id, []); issuesBy.get(i.task.id).push(i.text); }
  const rowHtml = t => {
    const map = new Map(rolesOf(t.id).map(r => [r.party_id, r.role]));
    const inh = accountable(t);
    const cells = cols.map(p => {
      const r = map.get(p.id) || "";
      const ghost = !r && inh.inherited && inh.list.some(a => a.party_id === p.id);
      const ar = t.r_is_a && (r === "A" || ghost); // Responsible = Accountable
      return html`<td class="cell ${r}" data-t="${t.id}" data-p="${p.id}" role="gridcell" tabindex="-1" title="${p.name}: ${r ? ROLE_NAMES[r] : ghost ? "Accountable (inherited)" : "none"}${ar ? " and Responsible" : ""}">${r ? r + (ar ? "/R" : "") : ghost ? html`<span style="opacity:.35">a${ar ? "/r" : ""}</span>` : ""}</td>`;
    });
    return html`<tr class="${t.isSummary ? "summary" : ""}"><td class="tn" style="padding-left:${8 + t.depth * 16}px" title="${t.name}"><a href="#" class="tn-link" data-open="${t.id}" title="Open record">${t.wbs}&nbsp; ${t.name}</a></td>${cells}<td class="flag">${(issuesBy.get(t.id) || []).join("; ")}</td></tr>`;
  };
  showRaci("raci", html`<tr><th class="tn">Task</th>${cols.map(p => html`<th class="pc" title="${p.name}">${p.name}<span class="k">${p.kind === "team" ? "team" : p.title || ""}</span></th>`)}<th>Warnings</th></tr>`, rows, cols.length, rowHtml);
}
function renderRaciTeams() {
  const wrap = $("raciWrap");
  const onlyUsed = $("raciOnlyUsed").checked, leaves = $("raciLeaves").checked;
  const rows = M.order.filter(t => !leaves || !t.isSummary);
  if (!M.order.length) { setHtml(wrap, html`<div class="empty">No tasks in this project yet.</div>`); return; }
  const teamOf = pid => { const p = M.parties.get(pid); return !p ? null : p.kind === "team" ? pid : homeTeam(pid) ?? 0; }; // 0 = no team
  const used = new Set(); for (const list of M.raci.values()) for (const r of list) used.add(teamOf(r.party_id));
  const cols = M.teams.filter(tm => onlyUsed ? used.has(tm.id) : (tm.active || used.has(tm.id))).map(tm => ({ id: tm.id, name: tm.name, team: tm }));
  if (used.has(0)) cols.push({ id: 0, name: "No team", team: null });
  if (!cols.length) { setHtml(wrap, html`<div class="empty">${M.teams.length ? "No team has assignments yet. Untick “Only teams with assignments”." : "No teams yet. Add teams on the People & teams tab."}</div>`); return; }
  const issuesBy = new Map(); for (const i of M.issues) if (i.kind === "raci" && i.level === "warn") { if (!issuesBy.has(i.task.id)) issuesBy.set(i.task.id, []); issuesBy.get(i.task.id).push(i.text); }
  const rowHtml = t => {
    const roles = rolesOf(t.id);
    const cells = cols.map(c => {
      const own = c.team ? roles.find(r => r.party_id === c.id) : null;
      const mem = roles.filter(r => M.parties.get(r.party_id)?.kind === "person" && teamOf(r.party_id) === c.id);
      const ownL = own ? roleLabel(t, own.role) : "";
      const top = ownL || (mem[0] ? roleLabel(t, mem[0].role) : "");
      const tip = [own ? `${c.name} (team): ${ownL}` : "", ...mem.map(r => `${partyName(r.party_id)}: ${roleLabel(t, r.role)}`)].filter(Boolean).join("\n") || `${c.name}: none`;
      const chips = mem.map(r => html`<span class="mr r-${r.role}" data-p="${r.party_id}" title="${partyName(r.party_id)}: ${roleTitle(roleLabel(t, r.role))}">${roleLabel(t, r.role)}·${initials(partyName(r.party_id))}</span>`);
      const plus = c.team && (M.members.get(c.id) || []).length ? html`<button class="plus" data-plus="${c.id}" tabindex="-1" title="Give this to a member of ${c.name} (key: +)">+</button>` : "";
      return html`<td class="cell tcell ${top[0] || ""}" data-t="${t.id}" data-team="${c.id}" role="gridcell" tabindex="-1" title="${tip}">${ownL ? html`<b>${ownL}</b>` : ""}${chips}${plus}</td>`;
    });
    return html`<tr class="${t.isSummary ? "summary" : ""}${t.id === UI.selId && UI.form ? " sel" : ""}"><td class="tn" style="padding-left:${8 + t.depth * 16}px" title="${t.name}"><a href="#" class="tn-link" data-open="${t.id}" title="Open record">${t.wbs}&nbsp; ${t.name}</a></td>${cells}<td class="flag">${(issuesBy.get(t.id) || []).join("; ")}</td></tr>`;
  };
  showRaci("raci team", html`<tr><th class="tn">Task</th>${cols.map(c => html`<th class="pc" title="${c.name}">${c.name}<span class="k">${c.team ? `${(M.members.get(c.id) || []).length} people` : "people without a team"}</span></th>`)}<th>Warnings</th></tr>`, rows, cols.length, rowHtml);
}
// Hand the team's role on a task to one of its members (or set a member's role when the team has none).
function teamMemberPicker(anchor, tid, teamId) {
  const t = M.tasks.get(tid), team = M.parties.get(teamId);
  const own = rolesOf(tid).find(r => r.party_id === teamId);
  const role = own?.role || "R";
  const box = h("div", {}, h("h4", {}, own ? `Give ${team.name}'s ${roleLabel(t, own.role)} on ${t.wbs} to…` : `Assign a member of ${team.name} to ${t.wbs} as…`));
  const roleSel = own ? null : h("select", {}, ...["R", "A", "C", "I"].map(x => h("option", { value: x }, `${x}: ${ROLE_NAMES[x]}`)));
  if (roleSel) box.append(roleSel);
  const list = h("div", { class: "pick" });
  for (const pid of M.members.get(teamId) || []) {
    const cur = rolesOf(tid).find(r => r.party_id === pid);
    list.append(h("button", { class: "pick-btn", onclick: () => {
      closePop();
      const give = own ? own.role : roleSel.value;
      mutate(`RACI ${t.wbs}: ${partyName(pid)} → ${give}${own ? ` (from ${team.name})` : ""}`, () => { if (own) opSetRole(tid, teamId, null); opSetRole(tid, pid, give); });
    } }, partyName(pid), cur ? h("span", { class: "sub" }, ` now ${roleLabel(t, cur.role)}`) : null));
  }
  box.append(list);
  openPop(anchor.left, anchor.bottom + 4, box);
}
const raciCellRole = td => { const tid = +td.dataset.t, pid = +(td.dataset.team || td.dataset.p); return roleLabel(M.tasks.get(tid), rolesOf(tid).find(r => r.party_id === pid)?.role || ""); };
// One change, one undo step. A/R = Accountable plus the task's "Responsible same as Accountable" switch (DECISIONS #48).
function setRaciRole(td, next) {
  if (td.dataset.team === "0") return; // "No team" column: display only
  const tid = +td.dataset.t, pid = +(td.dataset.team || td.dataset.p), t = M.tasks.get(tid), cur = raciCellRole(td);
  if (next === cur) return;
  mutate(`RACI ${t.wbs}: ${partyName(pid)} → ${next || "none"}`, () => {
    if (next === "A/R") { opSetRole(tid, pid, "A"); opSetRIsA(tid, true); return; }
    if (cur === "A/R") opSetRIsA(tid, false);
    opSetRole(tid, pid, next || null);
  });
}
// The picker under a cell: every role in one click, and in the team view who of the team has which role, by full name.
function raciPicker(td) {
  const tid = +td.dataset.t, team = td.dataset.team, pid = +(team ?? td.dataset.p), t = M.tasks.get(tid), cur = raciCellRole(td);
  const box = h("div", { class: "raci-pick" }, h("h4", {}, `${team === "0" ? "No team" : partyName(pid) + (team ? " (team)" : "")} · ${t.wbs} ${t.name}`));
  if (team !== "0") {
    const btns = h("div", { class: "roles" }, ...RACI_SEQ.slice(0, -1).map(r => h("button", {
      class: "role-btn" + (r ? " r-" + r[0] : ""), "aria-pressed": String(r === cur), title: roleTitle(r),
      onclick: () => { closePop(); setRaciRole(td, r); },
    }, r || "—")));
    btns.addEventListener("keydown", e => {
      const all = [...btns.children], i = all.indexOf(document.activeElement);
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); all[(i + (e.key === "ArrowRight" ? 1 : all.length - 1)) % all.length].focus(); }
    });
    box.append(btns);
  }
  if (team) {
    const mem = rolesOf(tid).filter(r => M.parties.get(r.party_id)?.kind === "person" && (homeTeam(r.party_id) ?? 0) === pid);
    if (mem.length) box.append(h("div", { class: "pick" }, ...mem.map(r => h("div", { class: "hint" }, `${partyName(r.party_id)}: ${roleTitle(roleLabel(t, r.role))}`))));
    if (team !== "0" && (M.members.get(pid) || []).length) box.append(h("div", { class: "acts" }, h("button", { onclick: () => { const a = td.getBoundingClientRect(); closePop(); teamMemberPicker(a, tid, pid); } }, `Give to a member of ${partyName(pid)}… (+)`)));
  }
  box.append(h("div", { class: "hint" }, "On a cell: R A C I, Shift+A for A/R, Delete clears, arrows move. Alt+click cycles."));
  const a = td.getBoundingClientRect(); openPop(a.left, a.bottom + 4, box);
  ($("pop").querySelector('[aria-pressed="true"]') || $("pop").querySelector("button"))?.focus();
}
// Move focus to another cell. Rows off screen aren't drawn, so scroll there and draw them first.
function raciMove(td, dr, dc) {
  const wrap = $("raciWrap"), cells = [...td.parentElement.querySelectorAll("td.cell")];
  const ci = clamp(dc === -Infinity ? 0 : dc === Infinity ? cells.length - 1 : cells.indexOf(td) + dc, 0, cells.length - 1);
  const ri = clamp(RX.rows.findIndex(t => t.id === +td.dataset.t) + dr, 0, RX.rows.length - 1), tid = RX.rows[ri].id;
  const rowOf = () => wrap.querySelector(`td.cell[data-t="${tid}"]`)?.parentElement;
  if (!rowOf()) { wrap.scrollTop = ri * RX.rowH - wrap.clientHeight / 2; renderRaciRows(); }
  const el = rowOf()?.querySelectorAll("td.cell")[ci]; if (!el) return;
  el.focus({ preventScroll: true });
  // Bring it into view clear of the sticky header row and task column.
  const head = wrap.querySelector("thead").offsetHeight, side = el.parentElement.querySelector(".tn").offsetWidth;
  if (el.offsetTop - head < wrap.scrollTop) wrap.scrollTop = el.offsetTop - head;
  else if (el.offsetTop + el.offsetHeight > wrap.scrollTop + wrap.clientHeight) wrap.scrollTop = el.offsetTop + el.offsetHeight - wrap.clientHeight;
  if (el.offsetLeft - side < wrap.scrollLeft) wrap.scrollLeft = el.offsetLeft - side;
  else if (el.offsetLeft + el.offsetWidth > wrap.scrollLeft + wrap.clientWidth) wrap.scrollLeft = el.offsetLeft + el.offsetWidth - wrap.clientWidth;
}
function initRaci() {
  $("raciWrap").addEventListener("click", e => {
    const link = e.target.closest("[data-open]"); if (link) { e.preventDefault(); openRecord(+link.dataset.open); redraw("raci"); return; }
    const plus = e.target.closest("[data-plus]");
    if (plus) { const td = plus.closest("td.cell"); teamMemberPicker(plus.getBoundingClientRect(), +td.dataset.t, +plus.dataset.plus); return; }
    const td = e.target.closest("td.cell"); if (!td) return;
    if (e.altKey) setRaciRole(td, RACI_SEQ[RACI_SEQ.indexOf(raciCellRole(td)) + 1]); // the old one-step cycle
    else raciPicker(td);
  });
  $("raciWrap").addEventListener("focusin", e => {
    const td = e.target.closest("td.cell"); if (!td) return;
    for (const x of $("raciWrap").querySelectorAll('td.cell[tabindex="0"]')) if (x !== td) x.tabIndex = -1;
    td.tabIndex = 0; raciCur = dataSel(td);
  });
  $("raciWrap").addEventListener("keydown", e => {
    const td = e.target.closest("td.cell"); if (!td || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key, page = Math.max(1, Math.floor($("raciWrap").clientHeight / RX.rowH) - 1);
    const move = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1], Home: [0, -Infinity], End: [0, Infinity], PageUp: [-page, 0], PageDown: [page, 0] }[k];
    const role = { r: "R", a: e.shiftKey ? "A/R" : "A", c: "C", i: "I" }[k.toLowerCase()] ?? (k === "Delete" || k === "Backspace" ? "" : null);
    if (move) raciMove(td, ...move);
    else if (role != null) setRaciRole(td, role);
    else if (k === "Enter" || k === " " || k === "F2") raciPicker(td);
    else if (k === "+" && td.querySelector("[data-plus]")) teamMemberPicker(td.getBoundingClientRect(), +td.dataset.t, +td.dataset.team);
    else return;
    e.preventDefault();
  });
  $$("#raciBySeg button").forEach(b => b.addEventListener("click", () => { UI.raciBy = b.dataset.by; lsSet("pm.raciBy", UI.raciBy); redraw("raci"); }));
  $("raciOnlyUsed").addEventListener("change", () => redraw("raci"));
  $("raciLeaves").addEventListener("change", () => redraw("raci"));
  $("raciWrap").addEventListener("scroll", () => redraw("raciRows"));
}

// ---------- People & teams ----------
function assignmentCounts() { const c = new Map(); for (const r of q("SELECT party_id, COUNT(*) n FROM (SELECT party_id FROM raci UNION ALL SELECT party_id FROM risk_party UNION ALL SELECT party_id FROM mitigant_party) GROUP BY party_id")) c.set(r.party_id, r.n); return c; }
// Two tables edited in place, like the Risks grid (DECISIONS #92). Rows carry data-party and inputs data-f, so focus
// survives the redraw after every change; UI.peopleFocus ("id:field") puts the cursor in a new row once.
UI.peopleFocus = null;
function renderPeople() {
  const counts = assignmentCounts(), focus = UI.peopleFocus; UI.peopleFocus = null;
  const txt = (p, f, ph) => {
    const el = bindText(h("input", { value: p[f] || "", "data-f": f, placeholder: ph }), p[f] || "",
      v => { if (!mutate(`${p.kind === "team" ? "Team" : "Person"} ${p.name}: ${f} → “${v.trim()}”`, () => opUpdateParty(p.id, { [f]: v }))) el.value = p[f] || ""; });
    el.addEventListener("keydown", e => {
      if (e.key === "Enter") { // like a spreadsheet: save and go to the same column in the next row (Shift: the row above)
        e.preventDefault(); el._commit();
        const tr = el.closest("tr"), next = (e.shiftKey ? tr.previousElementSibling : tr.nextElementSibling)?.querySelector(`[data-f="${f}"]`);
        if (next) { next.focus(); next.select(); }
      } else if (e.key === "Escape") { el.value = p[f] || ""; el._cancel(); el.blur(); }
    });
    return el;
  };
  const active = p => { const cb = h("input", { type: "checkbox", checked: !!p.active, "data-f": "active", title: "Can be assigned to tasks" }); cb.addEventListener("change", () => mutate(`${p.name} ${cb.checked ? "active" : "inactive"}`, () => opUpdateParty(p.id, { active: cb.checked }))); return cb; };
  const acts = p => h("td", { class: "pt-acts" }, h("button", { onclick: () => showInvolvement(p.id) }, "Involvement"), h("button", { onclick: () => editParty(p.id) }, "Edit…"));
  const tasks = p => h("td", { class: "num", title: "Assignments across all projects" }, String(counts.get(p.id) || 0));
  const people = M.people.map(p => {
    const team = h("select", { "data-f": "team" }, h("option", { value: "" }, "— no team —"), ...M.teams.map(tm => h("option", { value: tm.id, selected: homeTeam(p.id) === tm.id }, tm.name)));
    team.addEventListener("change", () => mutate(`${p.name}: team → ${team.value ? partyName(+team.value) : "none"}`, () => opSetPersonTeam(p.id, +team.value || null)));
    return h("tr", { "data-party": p.id, class: p.active ? "" : "inactive" },
      h("td", {}, txt(p, "name", "Name")), h("td", {}, txt(p, "email", "name@company.com")), h("td", {}, txt(p, "title", "Role or job title")),
      h("td", {}, team), h("td", { class: "c" }, active(p)), tasks(p), acts(p));
  });
  const teams = M.teams.map(p => h("tr", { "data-party": p.id, class: p.active ? "" : "inactive" },
    h("td", {}, txt(p, "name", "Name")), h("td", { class: "pt-mem" }, (M.members.get(p.id) || []).map(partyName).join(", ") || h("span", { class: "hint" }, "No members")),
    h("td", { class: "c" }, active(p)), tasks(p), acts(p)));
  const table = (kind, heads, rows, empty) => rows.length
    ? h("table", { class: "ptable", "data-kind": kind }, h("thead", {}, h("tr", {}, ...heads.map(x => h("th", {}, x)))), h("tbody", {}, ...rows))
    : h("div", { class: "hint", style: { padding: "8px" } }, empty);
  $("peopleList").replaceChildren(table("person", ["Name", "Email", "Title", "Team", "Active", "Tasks", ""], people, "No people yet. Click ＋ Person, or add one and paste a column of names into it."));
  $("teamList").replaceChildren(table("team", ["Name", "Members", "Active", "Tasks", ""], teams, "No teams yet."));
  if (focus) {
    const [id, f] = focus.split(":"), el = $("view-people").querySelector(`tr[data-party="${id}"] [data-f="${f}"]`);
    if (el) { el.focus(); el.select?.(); }
  }
}
// Multi-line paste into a People or Teams column: the same chooser as the outline. Fill down follows the rows as shown
// when the paste started.
function peoplePaste(e) {
  const el = e.target.closest?.("[data-f]"), tr = e.target.closest?.("tr[data-party]"); if (!el || !tr) return;
  const f = el.dataset.f; if (!["name", "email", "title", "team"].includes(f)) return;
  const { lines, cols } = parseClipColumn(e.clipboardData?.getData("text/plain") ?? "");
  if (lines.length < 2) return;
  e.preventDefault();
  if (el._cancel) { el._cancel(); el.value = el._orig; } // the paste replaces whatever was half-typed
  const table = tr.closest("table"), kind = table.dataset.kind, rows = [...table.querySelectorAll("tr[data-party]")].map(x => +x.dataset.party);
  const from = rows.indexOf(+tr.dataset.party), order = rows.slice(from), nouns = kind === "team" ? "teams" : "people";
  const label = { name: "Name", email: "Email", title: "Title", team: "Team" }[f];
  const run = mode => () => cmdPeoplePaste(kind, f, mode, order, lines);
  const past = lines.slice(order.length).filter(Boolean).length;
  const options = [{ id: "fill", label: f === "name" ? "Fill down names" : "Fill down", sub: f === "name" ? `Overwrite names from this row down${past ? `; adds ${past} new ${past === 1 ? (kind === "team" ? "team" : "person") : nouns} past the end` : ""}` : f === "team" ? "Match team names; a team that doesn't exist yet is created" : `Overwrite ${label.toLowerCase()} from this row down`, run: run("fill") }];
  if (f === "name") options.push({ id: "add", label: `Add as new ${nouns}`, sub: "Names already on the roster are skipped", run: run("add") });
  openPasteChooser(el.getBoundingClientRect(), { title: `Paste ${lines.length} lines into ${kind === "team" ? "Teams" : "People"} › ${label}`, lines, cols, key: `paste.${kind}.${f}`, options });
}
// rows: party ids in the order shown, from the row pasted into. One change, one undo step, a message with Undo.
function cmdPeoplePaste(kind, f, mode, rows, lines) {
  let last = null;
  const noun = kind === "team" ? "team" : "person", nouns = kind === "team" ? "teams" : "people", many = (n, a, b) => `${n} ${n === 1 ? a : b}`;
  const ok = mutate(`Pasted ${lines.length} lines into ${nouns}: ${f}`, () => {
    const byName = new Map([...M.parties.values()].filter(p => p.kind === kind).map(p => [p.name.trim().toLowerCase(), p.id]));
    if (mode === "add") {
      const dup = []; let added = 0;
      for (const l of lines) {
        if (!l) continue;
        if (byName.has(l.toLowerCase())) { dup.push(l); continue; }
        last = opAddParty(kind, l); byName.set(l.toLowerCase(), last); added++;
      }
      opNotes.push(`Added ${many(added, noun, nouns)}.`);
      if (dup.length) opNotes.push(`Already on the roster: ${dup.join(", ")}.`);
      return;
    }
    const teams = new Map(M.teams.map(t => [t.name.trim().toLowerCase(), t.id])), created = [];
    let changed = 0, added = 0, over = 0;
    lines.forEach((l, i) => {
      const id = rows[i];
      if (id == null) { if (f === "name" && l) { last = opAddParty(kind, l); added++; } else if (l) over++; return; }
      last = id;
      if (f === "name") { if (l) { opUpdateParty(id, { name: l }); changed++; } }
      else if (f === "team") { // one team per person still holds (DECISIONS #60)
        let tid = null;
        if (l) { tid = teams.get(l.toLowerCase()); if (tid == null) { tid = opAddParty("team", l); teams.set(l.toLowerCase(), tid); created.push(l); } }
        opSetPersonTeam(id, tid); changed++;
      } else { opUpdateParty(id, { [f]: l }); changed++; }
    });
    opNotes.push(f === "name" ? `Pasted ${lines.length} names: ${changed} renamed, ${many(added, "new " + noun, "new " + nouns)}.` : `Pasted ${f} into ${many(changed, "row", "rows")}.`);
    if (created.length) opNotes.push(`Created teams: ${created.join(", ")}.`);
    if (over) opNotes.push(`${many(over, "line", "lines")} didn't fit below the last row.`);
  });
  if (ok && last != null) UI.peopleFocus = `${last}:${f}`;
  return ok;
}
function addPartyRow(kind) {
  let id; if (mutate(kind === "team" ? "Added team" : "Added person", () => { id = opAddParty(kind, kind === "team" ? "New team" : "New person"); })) UI.peopleFocus = `${id}:name`;
}
function editParty(id, kind) {
  const p = id ? M.parties.get(id) : { kind, name: "", email: "", title: "", active: 1 };
  const name = h("input", { value: p.name, placeholder: "Name" }), email = h("input", { value: p.email, placeholder: "name@company.com", type: "email" });
  const title = h("input", { value: p.title, placeholder: "Role or job title" }), active = h("input", { type: "checkbox", checked: !!p.active });
  const memberSet = new Set(id ? M.members.get(id) || [] : []);
  const body = h("div", { class: "modal-b" });
  const frm = h("div", { class: "frm" }, h("label", {}, "Name"), name);
  const teamSel = h("select", {}, h("option", { value: "" }, "— no team —"), ...M.teams.map(tm => h("option", { value: tm.id, selected: id && homeTeam(id) === tm.id }, tm.name)));
  if (p.kind === "person") frm.append(h("label", {}, "Email"), email, h("label", {}, "Title"), title, h("label", {}, "Team"), teamSel);
  frm.append(h("label", {}, "Active"), h("label", { style: { color: "inherit" } }, active, " Can be assigned to tasks"));
  body.append(frm);
  if (p.kind === "team") {
    body.append(h("h4", { style: { margin: "14px 0 6px" } }, "Members"));
    const pick = h("div", { class: "pick" });
    for (const person of M.people) {
      const cb = h("input", { type: "checkbox", checked: memberSet.has(person.id) });
      cb.addEventListener("change", () => cb.checked ? memberSet.add(person.id) : memberSet.delete(person.id));
      const other = homeTeam(person.id); const moving = other && other !== id;
      pick.append(h("label", {}, cb, person.name, h("span", { class: "sub" }, moving ? `in ${partyName(other)} (will move)` : person.title || "")));
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
      else if ((homeTeam(newId) ?? "") !== (+teamSel.value || "")) opSetPersonTeam(newId, +teamSel.value || null);
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
  UI.selId = null; UI.anchorId = null; UI.selDep = null; clearHistory();
  refresh(); loadCollapsed(); computeRows(); redraw("all");
  const b = $("ganttBody"); const r = projectRange(); if (SC) scrollGanttTo(r.lo, 0.05); b.scrollTop = 0;
}

// ---------- Save pill + log ----------
const fmtAgo = t => { if (!t) return "never"; const s = Math.round((Date.now() - t) / 1000); return s < 5 ? "just now" : s < 60 ? s + "s ago" : s < 3600 ? Math.round(s / 60) + "m ago" : new Date(t).toLocaleTimeString(); };
function renderSaveState() {
  const pill = $("savePill");
  let cls, text;
  if (readOnly) { cls = "warn"; text = "Read-only tab"; }
  else if (saving || pending) { cls = "busy"; text = "Saving…"; }
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

// ---------- Recover replaced copies (DECISIONS #64) ----------
async function showBackups() {
  let list = [];
  try { list = (await idb.get("backups")) || []; } catch (e) { return toast("Couldn't read the backups: " + e.message, "err"); }
  const download = b => {
    const stamp = new Date(b.ts).toISOString().slice(0, 16).replace(/[T:]/g, "-");
    const a = h("a", { href: URL.createObjectURL(new Blob([b.bytes], { type: "application/x-sqlite3" })), download: `backup ${stamp}.db` });
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const body = h("div", { class: "modal-b" },
    h("p", { style: { marginTop: 0 } }, "Copies the app kept because it had to replace them: a browser copy that lost to the plan file, a plan replaced by opening another, or a copy that couldn't be opened. Download one, then use File → Open plan file to look at it."),
    list.length ? h("ul", { class: "bk-list" }, ...list.map(b => h("li", {},
      h("div", {}, h("div", {}, new Date(b.ts).toLocaleString()), h("div", { class: "hint" }, `${b.reason} · ${(b.size / 1024).toFixed(1)} KB`)),
      h("button", { onclick: () => download(b) }, "Download .db"))))
      : h("p", { class: "hint" }, "No copies have been replaced in this browser."));
  openModal("Recover replaced copies", body, h("div", { class: "modal-f" }, h("button", { class: "primary", onclick: closeModal }, "Close")));
}

// ---------- Help ----------
function showHelp() {
  const rows = [
    ["Insert", "New task below (with the record open, it opens the new record)"], ["Ctrl+Insert", "New subtask"], ["Shift+click / Shift+↑↓", "Select a block of rows; ⇤ ⇥ and Delete then work on the whole block"],
    ["Ctrl+V", "Paste a column copied from Excel: choose fill down, add as subtasks or add below. # (WBS) nests rows by the pasted numbers"], ["Tab / Shift+Tab", "Next / previous cell (past the row's end, out of the outline)"], ["Alt+Shift+→ / Alt+Shift+←", "Indent / outdent"], ["Alt+Shift+↑/↓", "Move task up / down"],
    ["Alt+← / Alt+→", "Collapse / expand"], ["Enter or F2", "Edit cell (Enter again to save)"], ["Type", "Start editing the cell"], ["Esc", "Cancel edit, or clear the selection"],
    ["Delete", "Delete task and subtasks (Undo appears in the message)"], ["Ctrl+Z / Ctrl+Y", "Undo / redo"], ["Ctrl+I", "Open / close the record form"], ["Alt+← (in the record)", "Back to the record you came from (or the mouse's Back button)"], ["Arrows, PgUp/PgDn", "Move around"],
  ];
  const body = h("div", { class: "modal-b" },
    h("h3", { style: { marginTop: 0 } }, "Keyboard (outline grid)"),
    h("div", { class: "help-grid" }, ...rows.flatMap(([k, v]) => [h("div", {}, ...k.split(" / ").flatMap((x, i) => i ? [" / ", h("kbd", {}, x)] : [h("kbd", {}, x)])), h("div", {}, v)])),
    h("h3", {}, "Gantt"),
    h("ul", {}, h("li", {}, "Drag a bar to move it; drag its left or right edge to change dates. A new task has no dates: drag across its empty row to draw its bar."),
      h("li", {}, "Hover a bar to see link handles (○). Drag from a handle onto another bar: the end you start from and the half of the target you drop on decide the type (Finish→Start, Start→Start, …)."),
      h("li", {}, "Click an arrow to change its type and lag, or delete it. Red arrows mean the dates conflict with the link; dates are never moved automatically."),
      h("li", {}, "Double-click a bar, or click ↗ next to a task name, to open its record form.")),
    h("h3", {}, "Record form"),
    h("p", {}, "Shows every field of a task, a mini Gantt of a summary task's subtasks, its work notes (dated, editable) and related records in tabs. It slides in over the outline; the Gantt stays visible, and clicking a bar switches records. ", h("b", {}, "← Back"), " returns to the record you were on before, even across pages. Esc or ✕ closes it. ", h("kbd", {}, "Ctrl+Enter"), " posts a note."),
    h("h3", {}, "Predecessors cell"),
    h("p", {}, "Type WBS numbers separated by commas, with an optional type and lag: ", h("kbd", {}, "1.2"), " ", h("kbd", {}, "3FS+2d"), " ", h("kbd", {}, "2.1SS-1d"), " ", h("kbd", {}, "4FF+1w")),
    h("h3", {}, "Saving"),
    h("p", {}, "Every change is saved immediately: to your .db plan file (if one is connected) and to a crash buffer inside the browser. If the app ever has to replace work that isn't anywhere else, it keeps a copy under File → ", h("b", {}, "Recover replaced copies"), ". Only one tab can edit at a time; others open read-only. After a refresh Chrome may ask you to click ", h("b", {}, "Reconnect"), ". Share the .db file, an Excel export, or a printed PDF with your team."));
  openModal("Help & shortcuts", body, h("div", { class: "modal-f" }, h("button", { class: "primary", onclick: closeModal }, "Close")));
}
