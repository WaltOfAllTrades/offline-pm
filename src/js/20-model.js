// ---------- In-memory model (rebuilt from SQLite after every change) ----------
const STATUSES = ["Not started", "In progress", "Blocked", "Done"];
const ROLES = ["R", "A", "C", "I"];
const ROLE_NAMES = { R: "Responsible", A: "Accountable", C: "Consulted", I: "Informed" };
const DEP_TYPES = ["FS", "SS", "FF", "SF"];
const DEP_NAMES = { FS: "Finish → Start", SS: "Start → Start", FF: "Finish → Finish", SF: "Start → Finish" };

const M = {
  projects: [], projectId: null,
  tasks: new Map(), roots: [], order: [], byWbs: new Map(),
  deps: [], depsIn: new Map(), depsOut: new Map(),
  parties: new Map(), people: [], teams: [], members: new Map(), teamsOf: new Map(),
  raci: new Map(), issues: [], noteCount: new Map(),
};

function loadModel() {
  M.projects = q("SELECT * FROM project ORDER BY position, id");
  const saved = lsGet("pm.project", null);
  if (!M.projects.some(p => p.id === M.projectId)) M.projectId = M.projects.some(p => p.id === saved) ? saved : M.projects[0]?.id;
  lsSet("pm.project", M.projectId);

  M.tasks = new Map(); M.roots = []; M.order = []; M.byWbs = new Map();
  for (const r of q("SELECT * FROM task WHERE project_id=? ORDER BY position, id", [M.projectId])) {
    M.tasks.set(r.id, { ...r, start: parseYMD(r.start), finish: parseYMD(r.finish), children: [] });
  }
  for (const t of M.tasks.values()) {
    const p = t.parent_id != null ? M.tasks.get(t.parent_id) : null;
    (p ? p.children : M.roots).push(t);
  }
  const walk = (list, depth, prefix, parent) => list.forEach((t, i) => {
    t.depth = depth; t.wbs = prefix + (i + 1); t.parent = parent; t.index = M.order.length;
    t.isSummary = t.children.length > 0; t.isMilestone = !t.isSummary && t.kind === "milestone";
    M.order.push(t); M.byWbs.set(t.wbs, t);
    walk(t.children, depth + 1, t.wbs + ".", t);
  });
  walk(M.roots, 0, "", null);
  // Rollups, bottom-up (DECISIONS #5–#7).
  for (let i = M.order.length - 1; i >= 0; i--) rollup(M.order[i]);

  M.parties = new Map(); M.people = []; M.teams = []; M.members = new Map(); M.teamsOf = new Map();
  for (const p of q("SELECT * FROM party ORDER BY kind DESC, name COLLATE NOCASE")) {
    M.parties.set(p.id, p); (p.kind === "person" ? M.people : M.teams).push(p);
  }
  for (const { team_id, person_id } of q("SELECT * FROM team_member")) {
    if (!M.members.has(team_id)) M.members.set(team_id, []); M.members.get(team_id).push(person_id);
    if (!M.teamsOf.has(person_id)) M.teamsOf.set(person_id, []); M.teamsOf.get(person_id).push(team_id);
  }

  M.raci = new Map();
  for (const r of q("SELECT r.* FROM raci r JOIN task t ON t.id=r.task_id WHERE t.project_id=?", [M.projectId])) {
    if (!M.raci.has(r.task_id)) M.raci.set(r.task_id, []); M.raci.get(r.task_id).push(r);
  }
  for (const list of M.raci.values()) list.sort((a, b) => ROLES.indexOf(a.role) - ROLES.indexOf(b.role) || partyName(a.party_id).localeCompare(partyName(b.party_id)));

  M.deps = q("SELECT d.* FROM dep d JOIN task t ON t.id=d.succ_id WHERE t.project_id=? ORDER BY d.id", [M.projectId]);
  M.depsIn = new Map(); M.depsOut = new Map();
  for (const d of M.deps) {
    d.violated = depViolated(d);
    if (!M.depsIn.has(d.succ_id)) M.depsIn.set(d.succ_id, []); M.depsIn.get(d.succ_id).push(d);
    if (!M.depsOut.has(d.pred_id)) M.depsOut.set(d.pred_id, []); M.depsOut.get(d.pred_id).push(d);
  }
  M.noteCount = new Map(q("SELECT n.task_id, COUNT(*) c FROM note n JOIN task t ON t.id=n.task_id WHERE t.project_id=? GROUP BY n.task_id", [M.projectId]).map(r => [r.task_id, r.c]));
  M.issues = computeIssues();
}

function rollup(t) {
  if (!t.isSummary) {
    t.S = t.start; t.F = t.isMilestone ? t.start : (t.finish ?? t.start);
    t.P = t.percent; t.ST = t.status;
    t.dur = t.isMilestone ? 0 : workdays(t.S, t.F);
    const w = t.isMilestone ? 0 : (t.dur || 0);
    t._agg = { w, wp: w * t.P, n: 1, sp: t.P };
    return;
  }
  let S = null, F = null, w = 0, wp = 0, n = 0, sp = 0;
  const sts = new Set();
  for (const c of t.children) {
    if (c.S != null && (S == null || c.S < S)) S = c.S;
    if (c.F != null && (F == null || c.F > F)) F = c.F;
    w += c._agg.w; wp += c._agg.wp; n += c._agg.n; sp += c._agg.sp;
    sts.add(c.ST);
  }
  t.S = S; t.F = F; t.dur = workdays(S, F);
  t.P = w > 0 ? Math.round(wp / w) : n ? Math.round(sp / n) : 0;
  t.ST = [...sts].every(s => s === "Done") ? "Done" : sts.has("Blocked") ? "Blocked"
    : [...sts].some(s => s !== "Not started") ? "In progress" : "Not started";
  t._agg = { w, wp, n, sp };
}

function taskSpan(t) { return t ? span(t.S, t.F, t.isMilestone) : null; }
function depViolated(d) {
  const a = taskSpan(M.tasks.get(d.pred_id)), b = taskSpan(M.tasks.get(d.succ_id));
  if (!a || !b) return false;
  switch (d.type) {
    case "FS": return b.s < a.e + d.lag;
    case "SS": return b.s < a.s + d.lag;
    case "FF": return b.e < a.e + d.lag;
    case "SF": return b.e < a.s + d.lag;
  }
  return false;
}

const partyName = id => M.parties.get(id)?.name ?? "?";
const rolesOf = (taskId, role) => (M.raci.get(taskId) || []).filter(r => !role || r.role === role);
function accountable(t) { // own A list, or nearest ancestor's (DECISIONS #12)
  for (let x = t; x; x = x.parent) { const a = rolesOf(x.id, "A"); if (a.length) return { list: a, inherited: x !== t, from: x }; }
  return { list: [], inherited: false, from: null };
}
function isAncestor(a, b) { for (let x = b?.parent; x; x = x.parent) if (x === a) return true; return false; }
// Parties a person is "in": themselves plus their teams.
const partySetFor = personId => new Set([personId, ...(M.teamsOf.get(personId) || [])]);

function fmtPred(d) {
  const p = M.tasks.get(d.pred_id); if (!p) return "";
  return p.wbs + (d.type !== "FS" || d.lag ? d.type : "") + (d.lag ? (d.lag > 0 ? "+" : "") + d.lag + "d" : "");
}
const predText = t => (M.depsIn.get(t.id) || []).map(fmtPred).join(", ");

// "1.2FS+3d, 4, 2.1 SS -1" → [{ref, type, lag}]
function parsePredText(text) {
  const out = [];
  for (const raw of String(text || "").split(/[,;]+/)) {
    const tok = raw.trim(); if (!tok) continue;
    const m = /^#?(\d+(?:\.\d+)*)\s*(FS|SS|FF|SF)?\s*(?:([+-])\s*(\d+(?:\.\d+)?)\s*(d|days?|w|wks?|weeks?|ed|edays?)?)?$/i.exec(tok);
    if (!m) throw new Error(`Can't read predecessor “${tok}”. Use e.g. 1.2, 3FS+2d, 4SS-1d`);
    let lag = m[4] ? parseFloat(m[4]) : 0;
    if (m[5] && /^w/i.test(m[5])) lag *= 5;
    out.push({ ref: m[1], type: (m[2] || "FS").toUpperCase(), lag: Math.round(m[3] === "-" ? -lag : lag) });
  }
  return out;
}

function computeIssues() {
  const out = [], today = todayNum();
  const add = (level, task, text, kind) => out.push({ level, task, text, kind });
  for (const t of M.order) {
    const acc = accountable(t);
    if (!acc.list.length) add("warn", t, "No Accountable assigned", "raci");
    const ownA = rolesOf(t.id, "A");
    if (ownA.length > 1) add("warn", t, `${ownA.length} Accountables (should be exactly one)`, "raci");
    for (const a of ownA) if (M.parties.get(a.party_id)?.kind === "team") add("info", t, `Accountable is a team (${partyName(a.party_id)}). One person is recommended`, "raci");
    if (!t.isSummary && !t.isMilestone && !rolesOf(t.id, "R").length) add("info", t, "No Responsible assigned", "raci");
    for (const r of rolesOf(t.id)) {
      const p = M.parties.get(r.party_id);
      if (p && !p.active) add("warn", t, `${p.name} is inactive but assigned as ${ROLE_NAMES[r.role]}`, "raci");
      if (p?.kind === "team" && !(M.members.get(p.id) || []).length) add("info", t, `Team ${p.name} has no members`, "raci");
    }
    if (!t.isSummary && t.S == null) add("info", t, "No dates set", "dates");
    if (!t.isSummary && t.F != null && t.S != null && t.F < t.S) add("warn", t, "Finish is before start", "dates");
    if (t.F != null && t.F < today && t.ST !== "Done" && !t.isSummary) add("info", t, `Overdue: finish was ${fmtShort(t.F)}`, "dates");
  }
  for (const d of M.deps) if (d.violated) {
    const p = M.tasks.get(d.pred_id), s = M.tasks.get(d.succ_id);
    add("warn", s, `Dependency conflict: ${p.wbs} ${DEP_NAMES[d.type]}${d.lag ? ` (lag ${d.lag}d)` : ""} → ${s.wbs}: dates don't satisfy the link`, "dep");
  }
  return out;
}

// ---------- Operations (call inside mutate) ----------
const siblingsOf = parentId => q("SELECT id, position FROM task WHERE project_id=? AND parent_id IS ? ORDER BY position, id", [M.projectId, parentId]).map(r => r.id);
function renumber(ids) { ids.forEach((id, i) => run("UPDATE task SET position=? WHERE id=?", [i, id])); }
function taskRow(id) { const r = one("SELECT * FROM task WHERE id=?", [id]); if (!r) throw new Error("Task not found"); return r; }
const hasChildren = id => !!scalar("SELECT 1 FROM task WHERE parent_id=? LIMIT 1", [id]);
function subtreeIds(id) { return q("WITH RECURSIVE s(id) AS (SELECT ? UNION ALL SELECT t.id FROM task t JOIN s ON t.parent_id=s.id) SELECT id FROM s", [id]).map(r => r.id); }

function insertAt(parentId, index, id) {
  const sib = siblingsOf(parentId).filter(x => x !== id);
  sib.splice(index == null ? sib.length : clamp(index, 0, sib.length), 0, id);
  run("UPDATE task SET parent_id=? WHERE id=?", [parentId, id]);
  renumber(sib);
}

function opAddTask({ parentId = null, afterId = null, name = "New task", start, finish, kind = "task", projectId = M.projectId } = {}) {
  let s = start ?? nextWorkday(todayNum());
  let f = kind === "milestone" ? s : (finish ?? s);
  run("INSERT INTO task(project_id, parent_id, position, name, kind, start, finish, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)",
    [projectId, parentId, 1e9, name, kind, fmtYMD(s), fmtYMD(f), nowIso(), nowIso()]);
  const id = lastId();
  if (projectId === M.projectId) {
    const sib = siblingsOf(parentId).filter(x => x !== id);
    const idx = afterId != null && sib.includes(afterId) ? sib.indexOf(afterId) + 1 : sib.length;
    sib.splice(idx, 0, id); renumber(sib);
  }
  return id;
}

// After structure changes, remove links that now join a task to its own ancestor/descendant (not allowed, DECISIONS #10).
function dropHierarchyLinks() {
  const bad = q(`WITH RECURSIVE anc(id, a) AS (
      SELECT id, parent_id FROM task WHERE parent_id IS NOT NULL AND project_id = ?
      UNION ALL SELECT anc.id, t.parent_id FROM anc JOIN task t ON t.id = anc.a WHERE t.parent_id IS NOT NULL)
    SELECT DISTINCT d.id FROM dep d JOIN anc ON (anc.id = d.succ_id AND anc.a = d.pred_id) OR (anc.id = d.pred_id AND anc.a = d.succ_id)`, [M.projectId]);
  for (const r of bad) run("DELETE FROM dep WHERE id=?", [r.id]);
  if (bad.length) opNotes.push(`Removed ${bad.length} link${bad.length > 1 ? "s" : ""} between a summary task and its own subtask.`);
}

function opIndent(id) {
  const t = taskRow(id), sib = siblingsOf(t.parent_id), i = sib.indexOf(id);
  if (i <= 0) throw new Error("Nothing above to indent under. A task can only be indented under the task directly above it at the same level");
  const newParent = sib[i - 1];
  insertAt(newParent, null, id);
  renumber(siblingsOf(t.parent_id));
  dropHierarchyLinks();
}

// Outdent keeps the visual row order: later siblings become children of the outdented task (DECISIONS #27).
function opOutdent(id) {
  const t = taskRow(id);
  if (t.parent_id == null) throw new Error("Already at the top level");
  const parent = taskRow(t.parent_id), sib = siblingsOf(t.parent_id), i = sib.indexOf(id);
  const later = sib.slice(i + 1);
  const gp = siblingsOf(parent.parent_id);
  insertAt(parent.parent_id, gp.indexOf(parent.id) + 1, id);
  if (later.length) { const kids = siblingsOf(id); later.forEach(x => run("UPDATE task SET parent_id=? WHERE id=?", [id, x])); renumber([...kids, ...later]); }
  renumber(siblingsOf(parent.id));
  dropHierarchyLinks();
}

function opMove(id, delta) {
  const t = taskRow(id), sib = siblingsOf(t.parent_id), i = sib.indexOf(id), j = i + delta;
  if (j < 0 || j >= sib.length) throw new Error(delta < 0 ? "Already first at this level" : "Already last at this level");
  [sib[i], sib[j]] = [sib[j], sib[i]]; renumber(sib);
}

// where: "before" | "after" | "child"
function opMoveTo(id, targetId, where) {
  if (id === targetId) return;
  if (subtreeIds(id).includes(targetId)) throw new Error("Can't move a task inside itself");
  const t = taskRow(id), target = taskRow(targetId);
  if (where === "child") insertAt(targetId, null, id);
  else {
    const sib = siblingsOf(target.parent_id).filter(x => x !== id);
    insertAt(target.parent_id, sib.indexOf(targetId) + (where === "after" ? 1 : 0), id);
  }
  if (t.parent_id !== (where === "child" ? targetId : target.parent_id)) renumber(siblingsOf(t.parent_id));
  dropHierarchyLinks();
}

function opDelete(id) {
  const t = taskRow(id);
  run("DELETE FROM task WHERE id=?", [id]); // cascades to subtree, deps, raci
  renumber(siblingsOf(t.parent_id));
}

// Field edits on a single task; dates use working-day rules (DECISIONS #2–#4, #8).
function opSetField(id, field, value) {
  const t = taskRow(id);
  const summary = hasChildren(id);
  const set = (cols) => {
    const keys = Object.keys(cols);
    run(`UPDATE task SET ${keys.map(k => k + "=?").join(", ")}, updated_at=? WHERE id=?`, [...keys.map(k => cols[k]), nowIso(), id]);
  };
  const s0 = parseYMD(t.start), f0 = parseYMD(t.finish);
  const rolled = ["start", "finish", "duration", "percent", "status"];
  if (summary && rolled.includes(field)) throw new Error("Summary tasks roll up from their subtasks. Edit the subtasks instead");
  switch (field) {
    case "name": { const v = String(value).trim(); if (!v) throw new Error("Name can't be empty"); set({ name: v }); break; }
    case "code": case "notes": set({ [field]: String(value ?? "") }); break;
    case "start": {
      const s = value == null || value === "" ? null : (typeof value === "number" ? value : parseYMD(value) ?? parseDateText(value));
      if (value && s == null) throw new Error("Couldn't read that date");
      if (s == null) { set({ start: null, finish: null }); break; }
      if (t.kind === "milestone") { set({ start: fmtYMD(s), finish: fmtYMD(s) }); break; }
      const dur = s0 != null && f0 != null ? Math.max(1, workdays(s0, f0)) : 1;
      set({ start: fmtYMD(s), finish: fmtYMD(finishFor(s, dur)) });
      break;
    }
    case "finish": {
      const f = typeof value === "number" ? value : parseYMD(value) ?? parseDateText(value);
      if (f == null) throw new Error("Couldn't read that date");
      if (t.kind === "milestone") { set({ start: fmtYMD(f), finish: fmtYMD(f) }); break; }
      if (s0 == null) { set({ start: fmtYMD(f), finish: fmtYMD(f) }); break; }
      if (f < s0) throw new Error("Finish can't be before start");
      set({ finish: fmtYMD(f) }); break;
    }
    case "dates": { // {start, finish} from Gantt drag
      const { start, finish } = value;
      if (t.kind === "milestone") set({ start: fmtYMD(start), finish: fmtYMD(start) });
      else set({ start: fmtYMD(start), finish: fmtYMD(Math.max(start, finish)) });
      break;
    }
    case "duration": {
      const d = parseDuration(value); if (d == null || d < 0) throw new Error("Duration must be a number of working days, e.g. 5 or 5d or 2w");
      const s = s0 ?? nextWorkday(todayNum());
      if (d === 0) set({ kind: "milestone", start: fmtYMD(s), finish: fmtYMD(s) });
      else set({ kind: "task", start: fmtYMD(s), finish: fmtYMD(finishFor(s, d)) });
      break;
    }
    case "kind": {
      if (value === "milestone") set({ kind: "milestone", finish: t.start });
      else set({ kind: "task", finish: t.start ? fmtYMD(finishFor(s0, 1)) : null });
      break;
    }
    case "percent": {
      const p = parsePercent(value); if (p == null) throw new Error("Percent must be 0–100");
      let status = t.status;
      if (p === 100) status = "Done";
      else if (p === 0 && status === "Done") status = "Not started";
      else if (p > 0 && (status === "Not started" || status === "Done")) status = "In progress";
      set({ percent: p, status }); break;
    }
    case "status": {
      const st = STATUSES.find(s => s.toLowerCase() === String(value).toLowerCase());
      if (!st) throw new Error("Unknown status");
      let p = t.percent;
      if (st === "Done") p = 100; else if (st === "Not started") p = 0; else if (p === 100) p = 50;
      set({ status: st, percent: p }); break;
    }
    default: throw new Error("Unknown field " + field);
  }
}

function depCheck(pred, succ) {
  if (pred === succ) throw new Error("A task can't depend on itself");
  const a = taskRow(pred), b = taskRow(succ);
  if (a.project_id !== b.project_id) throw new Error("Links between projects aren't supported");
  if (subtreeIds(pred).includes(succ) || subtreeIds(succ).includes(pred)) throw new Error("Can't link a summary task to its own subtask");
  const cyc = scalar("WITH RECURSIVE down(id) AS (SELECT ? UNION SELECT d.succ_id FROM dep d JOIN down ON d.pred_id=down.id) SELECT 1 FROM down WHERE id=?", [succ, pred]);
  if (cyc) throw new Error("That link would create a circular dependency");
}
function opAddDep(pred, succ, type = "FS", lag = 0) {
  if (!DEP_TYPES.includes(type)) throw new Error("Unknown link type");
  const existing = one("SELECT id FROM dep WHERE pred_id=? AND succ_id=?", [pred, succ]);
  if (existing) { run("UPDATE dep SET type=?, lag=? WHERE id=?", [type, Math.round(lag), existing.id]); return existing.id; }
  depCheck(pred, succ);
  run("INSERT INTO dep(pred_id, succ_id, type, lag) VALUES (?,?,?,?)", [pred, succ, type, Math.round(lag)]);
  return lastId();
}
function opUpdateDep(id, type, lag) { if (!DEP_TYPES.includes(type)) throw new Error("Unknown link type"); run("UPDATE dep SET type=?, lag=? WHERE id=?", [type, Math.round(+lag || 0), id]); }
function opRemoveDep(id) { run("DELETE FROM dep WHERE id=?", [id]); }
function opSetPredText(succId, text) {
  const items = parsePredText(text);
  run("DELETE FROM dep WHERE succ_id=?", [succId]);
  for (const it of items) {
    const p = M.byWbs.get(it.ref);
    if (!p) throw new Error(`No task with WBS ${it.ref}`);
    opAddDep(p.id, succId, it.type, it.lag);
  }
}

function opSetRole(taskId, partyId, role) {
  if (!role) run("DELETE FROM raci WHERE task_id=? AND party_id=?", [taskId, partyId]);
  else run("INSERT INTO raci(task_id, party_id, role) VALUES (?,?,?) ON CONFLICT(task_id, party_id) DO UPDATE SET role=excluded.role", [taskId, partyId, role]);
}
// Make exactly this set of parties hold `role` on a task (others with that role are cleared).
function opSetRoleParties(taskId, role, partyIds) {
  run("DELETE FROM raci WHERE task_id=? AND role=?", [taskId, role]);
  for (const pid of partyIds) opSetRole(taskId, pid, role);
}

function opAddParty(kind, name, extra = {}) {
  name = String(name || "").trim(); if (!name) throw new Error("Name is required");
  run("INSERT INTO party(kind, name, email, title) VALUES (?,?,?,?)", [kind, name, extra.email || "", extra.title || ""]);
  return lastId();
}
function opUpdateParty(id, fields) {
  const allowed = ["name", "email", "title", "active", "notes"];
  for (const [k, v] of Object.entries(fields)) {
    if (!allowed.includes(k)) continue;
    if (k === "name" && !String(v).trim()) throw new Error("Name is required");
    run(`UPDATE party SET ${k}=? WHERE id=?`, [k === "active" ? (v ? 1 : 0) : String(v).trim(), id]);
  }
}
function opDeleteParty(id) { run("DELETE FROM party WHERE id=?", [id]); }
function opSetMembers(teamId, personIds) {
  run("DELETE FROM team_member WHERE team_id=?", [teamId]);
  for (const p of personIds) run("INSERT INTO team_member VALUES (?,?)", [teamId, p]);
}

// Work notes: a dated journal per task. Unlike ServiceNow's journal, notes can be edited and deleted (DECISIONS #39).
const noteStamp = () => new Date().toISOString();
function opAddNote(taskId, body, author = "") {
  body = String(body ?? "").trim(); if (!body) throw new Error("A note can't be empty");
  taskRow(taskId);
  run("INSERT INTO note(task_id, body, author, created_at) VALUES (?,?,?,?)", [taskId, body, String(author || "").trim(), noteStamp()]);
  return lastId();
}
function opEditNote(id, body) {
  body = String(body ?? "").trim(); if (!body) throw new Error("A note can't be empty. Delete it instead");
  const n = one("SELECT body FROM note WHERE id=?", [id]); if (!n) throw new Error("Note not found");
  if (n.body !== body) run("UPDATE note SET body=?, updated_at=? WHERE id=?", [body, noteStamp(), id]);
}
function opDeleteNote(id) { run("DELETE FROM note WHERE id=?", [id]); }
// Notes for a task, newest first; withSubtasks adds notes from every descendant.
function notesFor(taskId, withSubtasks = false) {
  if (!withSubtasks) return q("SELECT * FROM note WHERE task_id=? ORDER BY created_at DESC, id DESC", [taskId]);
  return q(`WITH RECURSIVE s(id) AS (SELECT ? UNION ALL SELECT t.id FROM task t JOIN s ON t.parent_id=s.id)
            SELECT n.* FROM note n JOIN s ON s.id=n.task_id ORDER BY n.created_at DESC, n.id DESC`, [taskId]);
}

function opAddProject(name) {
  name = String(name || "").trim() || "New project";
  run("INSERT INTO project(name, position, created_at) VALUES (?, (SELECT COALESCE(MAX(position),0)+1 FROM project), ?)", [name, nowIso()]);
  return lastId();
}
function opRenameProject(id, name) { name = String(name || "").trim(); if (!name) throw new Error("Name is required"); run("UPDATE project SET name=? WHERE id=?", [name, id]); }
function opDeleteProject(id) {
  run("DELETE FROM project WHERE id=?", [id]);
  if (!scalar("SELECT COUNT(*) FROM project")) opAddProject("My project");
}

// ---------- Sample plan shown on first run ----------
function seedSample() {
  const pid = M.projectId;
  run("UPDATE project SET name='Website relaunch (sample)' WHERE id=?", [pid]);
  const P = n => opAddParty("person", n[0], { email: n[1], title: n[2] });
  const ana = P(["Ana Ruiz", "ana@example.com", "Project manager"]), ben = P(["Ben Okafor", "ben@example.com", "Lead developer"]);
  const chloe = P(["Chloe Park", "chloe@example.com", "Designer"]), dev = P(["Dev Patel", "dev@example.com", "Marketing"]);
  const eng = opAddParty("team", "Engineering"), mkt = opAddParty("team", "Marketing team");
  opSetMembers(eng, [ben]); opSetMembers(mkt, [dev, chloe]);
  const base = nextWorkday(todayNum() - 10);
  const T = (name, parentId, startOff, dur, extra = {}) => {
    const s = wdDay(wdIndex(base) + startOff);
    const id = opAddTask({ parentId, name, start: s, finish: dur ? finishFor(s, dur) : s, kind: dur ? "task" : "milestone" });
    if (extra.pct != null) opSetField(id, "percent", extra.pct);
    return id;
  };
  const p1 = T("Discovery", null, 0, 1);
  const a = T("Stakeholder interviews", p1, 0, 4, { pct: 100 }), b = T("Requirements sign-off", p1, 5, 0, { pct: 100 });
  const p2 = T("Design", null, 0, 1);
  const c = T("Wireframes", p2, 5, 5, { pct: 60 });
  const p2a = T("Visual design", p2, 0, 1);
  const d = T("Style guide", p2a, 9, 4), e = T("Page mockups", p2a, 10, 6);
  const p3 = T("Build", null, 0, 1);
  const f = T("Set up hosting", p3, 8, 2), g = T("Develop templates", p3, 14, 8), h2 = T("Content migration", p3, 18, 6);
  const p4 = T("Launch", null, 0, 1);
  const i = T("User acceptance testing", p4, 22, 4), j = T("Go live", p4, 27, 0);
  opAddDep(a, b); opAddDep(b, c); opAddDep(c, d, "SS", 2); opAddDep(d, e, "SS", 1); opAddDep(e, g); opAddDep(f, g, "FS", 0);
  opAddDep(g, h2, "SS", 2); opAddDep(g, i); opAddDep(h2, i, "FF", 0); opAddDep(i, j);
  const R = (t, p, r) => opSetRole(t, p, r);
  for (const t of [p1, p2, p3, p4]) R(t, ana, "A");
  R(a, ana, "R"); R(a, dev, "C"); R(b, ana, "R"); R(b, mkt, "I");
  R(c, chloe, "R"); R(c, ben, "C"); R(d, chloe, "R"); R(e, chloe, "R"); R(e, mkt, "C");
  R(f, eng, "R"); R(g, eng, "R"); R(g, ben, "A"); R(h2, mkt, "R"); R(h2, dev, "A");
  R(i, ana, "R"); R(i, eng, "C"); R(i, mkt, "C"); R(j, ben, "R"); R(j, mkt, "I"); R(j, dev, "I");
  opAddNote(a, "Interviewed 8 stakeholders. Main theme: the current site is hard to update without a developer.");
  opAddNote(c, "Homepage and product page wireframes reviewed with marketing. Navigation still open.");
  opAddNote(c, "Decision: keep the mega-menu, but limit it to 3 columns.");
  opAddNote(g, "Waiting on the final style guide before starting the article template.");
  // Spread the sample notes over the past days so the stream looks lived-in.
  q("SELECT id FROM note ORDER BY id").forEach((n, k) => run("UPDATE note SET created_at=? WHERE id=?", [new Date(Date.now() - (8 - k * 2) * 864e5 - 3600e3 * (k + 1)).toISOString(), n.id]));
}
