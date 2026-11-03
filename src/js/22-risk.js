// ---------- Risks and mitigants (model + operations) ----------
// A risk is Accepted or Mitigated by its mitigants; a mitigant is carried out by tasks it "implements" (DECISIONS #51-#58).
const MIT_STATUSES = ["Not started", "Planned", "Implemented", "Tested"];
const LMH = { "": "—", L: "Low", M: "Medium", H: "High" };

function loadRisks() {
  const pid = M.projectId;
  M.risks = q("SELECT * FROM risk WHERE project_id=? ORDER BY position, id", [pid]).map(r => ({ ...r, kind: "risk", mitigants: [], parties: [] }));
  M.riskById = new Map(M.risks.map(r => [r.id, r]));
  M.mitById = new Map(); M.mitByTask = new Map();
  for (const m of q("SELECT m.* FROM mitigant m JOIN risk r ON r.id=m.risk_id WHERE r.project_id=? ORDER BY m.position, m.id", [pid])) {
    const risk = M.riskById.get(m.risk_id); const x = { ...m, kind: "mitigant", risk, tasks: [], parties: [] };
    risk.mitigants.push(x); M.mitById.set(x.id, x);
  }
  for (const l of q("SELECT mt.* FROM mitigant_task mt JOIN mitigant m ON m.id=mt.mitigant_id JOIN risk r ON r.id=m.risk_id WHERE r.project_id=?", [pid])) {
    const m = M.mitById.get(l.mitigant_id), t = M.tasks.get(l.task_id); if (!m || !t) continue;
    m.tasks.push(t);
    if (!M.mitByTask.has(t.id)) M.mitByTask.set(t.id, []); M.mitByTask.get(t.id).push(m);
  }
  for (const m of M.mitById.values()) m.tasks.sort((a, b) => a.index - b.index);
  for (const p of q("SELECT rp.* FROM risk_party rp JOIN risk r ON r.id=rp.risk_id WHERE r.project_id=?", [pid])) M.riskById.get(p.risk_id)?.parties.push(p);
  for (const p of q("SELECT mp.* FROM mitigant_party mp JOIN mitigant m ON m.id=mp.mitigant_id JOIN risk r ON r.id=m.risk_id WHERE r.project_id=?", [pid])) M.mitById.get(p.mitigant_id)?.parties.push(p);
  for (const r of M.risks) {
    for (const m of r.mitigants) { m.eff = mitStatus(m); m.achieved = mitAchieved(m); m.gaps = mitGaps(m); }
    const done = r.mitigants.filter(m => m.achieved).length;
    r.achievedCount = done;
    r.status = r.response === "accept" ? "Accepted" : r.mitigants.length && done === r.mitigants.length ? "Mitigated" : "Mitigating";
    r.gaps = riskGaps(r);
  }
}

// Status: with linked tasks, Planned until every task is Done, then Implemented, or Tested if set by hand.
// A hand-set Tested doesn't count while a linked task is still open. Without tasks the hand-set status applies (DECISIONS #53).
function mitStatus(m) {
  if (m.tasks.length) return !m.tasks.every(t => t.ST === "Done") ? "Planned" : m.status === "Tested" ? "Tested" : "Implemented";
  return m.status || "Not started";
}
// Achieved: Implemented for a one-off mitigant, Tested for a control (DECISIONS #54).
const mitAchieved = m => m.is_control ? m.eff === "Tested" : m.eff === "Implemented" || m.eff === "Tested";
function mitGaps(m) {
  const g = [], today = todayNum();
  if (!m.tasks.length && m.eff === "Not started") g.push("No task and not started");
  if (m.is_control && m.eff === "Implemented") g.push("Control implemented but not tested");
  if (m.is_control && m.eff === "Tested" && !m.testing.trim()) g.push("Tested, but no testing notes");
  if (m.status === "Tested" && m.eff !== "Tested") g.push(`Marked Tested, but ${m.tasks.filter(t => t.ST !== "Done").map(t => "task " + t.wbs).join(", ")} ${m.tasks.filter(t => t.ST !== "Done").length > 1 ? "aren't" : "isn't"} done`);
  for (const t of m.tasks) if (t.F != null && t.F < today && t.ST !== "Done") g.push(`Task ${t.wbs} is overdue`);
  return g;
}
function riskGaps(r) {
  const g = [];
  if (r.response === "accept") { if (!r.accept_reason.trim()) g.push("Accepted without a reason"); return g; }

  if (!r.parties.some(p => p.role === "A")) g.push("No Accountable");
  if (!r.mitigants.length) g.push("No mitigants");
  const bad = r.mitigants.filter(m => m.gaps.length);
  if (bad.length) g.push(`${bad.length} mitigant${bad.length > 1 ? "s have" : " has"} gaps: ${bad.map(m => `“${shortText(m.text, 40)}” (${m.gaps.join(", ")})`).join("; ")}`);
  return g;
}

// Responsible / Accountable on risks and mitigants. A mitigant without its own Accountable inherits the risk's.
const recRoles = (rec, role) => rec.parties.filter(p => !role || p.role === role);
function recAccountable(rec) {
  const own = recRoles(rec, "A"); if (own.length || rec.kind !== "mitigant") return { list: own, inherited: false };
  const up = recRoles(rec.risk, "A"); return { list: up, inherited: !!up.length, from: rec.risk };
}
function recResponsible(rec) {
  if (rec.r_is_a) { const a = recAccountable(rec); return { ...a, same: true }; }
  return { list: recRoles(rec, "R"), same: false };
}
const recLabel = rec => rec.kind === "risk" ? rec.name : rec.text;
const shortText = (s, n = 80) => { s = String(s || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s; };

// ---------- Operations (call inside mutate) ----------
const riskRow = id => { const r = one("SELECT * FROM risk WHERE id=?", [id]); if (!r) throw new Error("Risk not found"); return r; };
const mitRow = id => { const r = one("SELECT * FROM mitigant WHERE id=?", [id]); if (!r) throw new Error("Mitigant not found"); return r; };
function placeAfter(table, scopeCol, scopeId, id, afterId) {
  const ids = q(`SELECT id FROM ${table} WHERE ${scopeCol}=? AND id<>? ORDER BY position, id`, [scopeId, id]).map(r => r.id);
  const i = afterId === 0 ? 0 : afterId != null && ids.includes(afterId) ? ids.indexOf(afterId) + 1 : ids.length;
  ids.splice(i, 0, id);
  ids.forEach((x, k) => run(`UPDATE ${table} SET position=? WHERE id=?`, [k, x]));
}
function opAddRisk({ name = "New risk", afterId = null, projectId = M.projectId, ...fields } = {}) {
  name = String(name || "").trim(); if (!name) throw new Error("A risk needs a name");
  run("INSERT INTO risk(project_id, position, name, created_at, updated_at) VALUES (?,?,?,?,?)", [projectId, 1e9, name, nowIso(), nowIso()]);
  const id = lastId();
  placeAfter("risk", "project_id", projectId, id, afterId);
  if (Object.keys(fields).length) opUpdateRisk(id, fields);
  return id;
}
function opUpdateRisk(id, fields) {
  riskRow(id);
  for (const [k, v0] of Object.entries(fields)) {
    let v = v0 == null ? "" : String(v0);
    if (k === "name") { v = v.trim(); if (!v) throw new Error("A risk needs a name"); }
    else if (k === "response") { if (!["mitigate", "accept"].includes(v)) throw new Error("Response must be Mitigate or Accept"); }
    else if (k === "probability" || k === "impact") { if (!(v in LMH)) throw new Error("Use Low, Medium or High"); }
    else if (!["description", "plan", "accept_reason"].includes(k)) continue;
    run(`UPDATE risk SET ${k}=?, updated_at=? WHERE id=?`, [v, nowIso(), id]);
  }
}
function opDeleteRisk(id) { run("DELETE FROM risk WHERE id=?", [id]); }
function opAddMitigant(riskId, text = "New mitigant", afterId = null, fields = {}) {
  riskRow(riskId);
  text = String(text || "").trim(); if (!text) throw new Error("A mitigant needs some text");
  run("INSERT INTO mitigant(risk_id, position, text, created_at, updated_at) VALUES (?,?,?,?,?)", [riskId, 1e9, text, nowIso(), nowIso()]);
  const id = lastId();
  placeAfter("mitigant", "risk_id", riskId, id, afterId);
  if (Object.keys(fields).length) opUpdateMitigant(id, fields);
  return id;
}
function opUpdateMitigant(id, fields) {
  mitRow(id);
  for (const [k, v0] of Object.entries(fields)) {
    let v = v0;
    if (k === "text") { v = String(v ?? "").trim(); if (!v) throw new Error("A mitigant needs some text. Delete it instead"); }
    else if (k === "is_control") v = v ? 1 : 0;
    else if (k === "status") { v = v || ""; if (v && !MIT_STATUSES.includes(v)) throw new Error("Unknown status"); }
    else if (k === "testing" || k === "handed_to") v = String(v ?? "");
    else continue;
    run(`UPDATE mitigant SET ${k}=?, updated_at=? WHERE id=?`, [v, nowIso(), id]);
  }
}
function opDeleteMitigant(id) { run("DELETE FROM mitigant WHERE id=?", [id]); }
function opLinkTask(mitId, taskId) {
  const m = mitRow(mitId), t = taskRow(taskId);
  if (riskRow(m.risk_id).project_id !== t.project_id) throw new Error("The task is in a different project");
  run("INSERT OR IGNORE INTO mitigant_task(mitigant_id, task_id) VALUES (?,?)", [mitId, taskId]);
  run("UPDATE mitigant SET status='' WHERE id=? AND status NOT IN ('', 'Tested')", [mitId]); // the tasks drive it now; don't resurrect it on unlink
}
function opUnlinkTask(mitId, taskId) { run("DELETE FROM mitigant_task WHERE mitigant_id=? AND task_id=?", [mitId, taskId]); }
const recTable = kind => kind === "risk" ? ["risk_party", "risk_id", "risk"] : ["mitigant_party", "mitigant_id", "mitigant"];
// Exactly these parties hold `role` (R or A) on the risk/mitigant; a party can hold only one of the two.
function opSetRecParties(kind, id, role, partyIds) {
  const [tbl, col, base] = recTable(kind);
  if (role === "R") run(`UPDATE ${base} SET r_is_a=0 WHERE id=?`, [id]);
  run(`DELETE FROM ${tbl} WHERE ${col}=? AND role=?`, [id, role]);
  for (const pid of partyIds) run(`INSERT INTO ${tbl}(${col}, party_id, role) VALUES (?,?,?) ON CONFLICT(${col}, party_id) DO UPDATE SET role=excluded.role`, [id, pid, role]);
}
function opSetRecRIsA(kind, id, on) {
  const [tbl, col, base] = recTable(kind);
  run(`UPDATE ${base} SET r_is_a=? WHERE id=?`, [on ? 1 : 0, id]);
  if (on) run(`DELETE FROM ${tbl} WHERE ${col}=? AND role='R'`, [id]);
}

// "Split into mitigants": one per line or bullet, else one per sentence (DECISIONS #56).
function splitMitigationPlan(text) {
  const s = String(text || "").replace(/\r/g, "").trim(); if (!s) return [];
  const bullet = /^\s*(?:[-*•▪◦–]|\(?\d+[.)]|\(?[a-z][.)])\s+/, enumr = /(?:^|\s)\(?\d{1,2}[.)]\s+/g;
  let parts = s.split(/\n+/).map(x => x.trim()).filter(Boolean);
  if (parts.length === 1 && (s.match(enumr) || []).length >= 2) parts = s.split(enumr).map(x => x.trim()).filter(Boolean); // "1. … 2. …" on one line
  if (parts.length === 1) { // sentences, without breaking after abbreviations like "e.g."
    const out = [];
    for (const p of s.split(/(?<=[.!?])\s+(?=["'(\[]?[A-Z0-9])/)) {
      const prev = out[out.length - 1];
      if (prev && (/\b(e\.g|i\.e|etc|vs|approx|incl|no|mr|mrs|ms|dr|st)\.$/i.test(prev) || prev.length < 4)) out[out.length - 1] = prev + " " + p; else out.push(p);
    }
    parts = out;
  }
  return parts.map(x => x.replace(bullet, "").trim()).filter(x => x.length > 1);
}

// Where "＋ Task" puts new tasks: the parent last used, else a top-level "Risk mitigation" summary (made if missing).
// Stored as { parent } so "top level" (null) can be remembered too; keyed by file id like the collapse state.
const mitParentKey = () => `pm.mitParent.${readFileId(db) || "?"}.${M.projectId}`;
function mitigationParent() {
  const saved = lsGet(mitParentKey(), null);
  if (saved && typeof saved === "object" && "parent" in saved) {
    if (saved.parent == null || one("SELECT 1 FROM task WHERE id=? AND project_id=?", [saved.parent, M.projectId])) return saved.parent;
  }
  const found = one("SELECT id FROM task WHERE project_id=? AND parent_id IS NULL AND name='Risk mitigation' ORDER BY position LIMIT 1", [M.projectId]);
  return found ? found.id : opAddTask({ name: "Risk mitigation", start: null });
}
// Create a task that implements the mitigant, linked, carrying its Responsible / Accountable (DECISIONS #57).
// place = { targetId, where: "before" | "after" } puts it at that spot in the WBS.
function opTaskFromMitigant(mitId, place = null) {
  const m = mitRow(mitId);
  const name = "Implement: " + shortText(m.text, 80);
  let id;
  if (place) {
    const tgt = taskRow(place.targetId);
    id = opAddTask({ name, parentId: tgt.parent_id, start: null, finish: null });
    opMoveTo(id, place.targetId, place.where);
    lsSet(mitParentKey(), { parent: tgt.parent_id });
  } else id = opAddTask({ name, parentId: mitigationParent(), start: null, finish: null });
  opLinkTask(mitId, id);
  const rec = M.mitById.get(mitId);
  if (rec) {
    const A = recAccountable(rec).list.map(p => p.party_id), R = recResponsible(rec);
    for (const pid of A) opSetRole(id, pid, "A");
    const rIds = R.list.map(p => p.party_id);
    if (R.same || (rIds.length && rIds.every(x => A.includes(x)))) { if (A.length) opSetRIsA(id, true); }
    else for (const pid of rIds) if (!A.includes(pid)) opSetRole(id, pid, "R");
  }
  return id;
}

// Notes on risks and mitigants share the task journal (note.risk_id / note.mitigant_id).
function opAddRecNote(kind, id, body) {
  body = String(body ?? "").trim(); if (!body) throw new Error("A note can't be empty");
  (kind === "risk" ? riskRow : mitRow)(id);
  run(`INSERT INTO note(${kind === "risk" ? "risk_id" : "mitigant_id"}, body, created_at) VALUES (?,?,?)`, [id, body, noteStamp()]);
  return lastId();
}
const recNotes = (kind, id) => q(`SELECT * FROM note WHERE ${kind === "risk" ? "risk_id" : "mitigant_id"}=? ORDER BY created_at DESC, id DESC`, [id]);

function seedRisks(tasks) {
  const r1 = opAddRisk({ name: "Content migration overruns", description: "Old pages are messier than expected and migration takes longer than planned.", probability: "M", impact: "H",
    plan: "Start migration early with a pilot batch of 50 pages. Freeze new content on the old site two weeks before go-live. Weekly migration burn-down review with marketing." });
  const m1 = opAddMitigant(r1, "Start migration early with a pilot batch of 50 pages.");
  const m2 = opAddMitigant(r1, "Freeze new content on the old site two weeks before go-live.", null, { is_control: 1 });
  opAddMitigant(r1, "Weekly migration burn-down review with marketing.", null, { is_control: 1 });
  opLinkTask(m1, tasks.migration); opLinkTask(m2, tasks.uat);
  opSetRecParties("risk", r1, "A", [tasks.ana]); opSetRecParties("mitigant", m1, "R", [tasks.dev]);
  opAddRisk({ name: "Designer unavailable during build", response: "accept", accept_reason: "Short design tail after mockups; agency backup available on call.", probability: "L", impact: "M" });
}
