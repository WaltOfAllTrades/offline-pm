// ---------- SQLite, schema, revisions, undo, live save ----------
const SCHEMA_VERSION = 4;
const IDB_NAME = "offline-pm";
let SQL, db;
let rev = 0, mirrorRev = null, diskRev = null, lastDiskAt = null, lastSize = 0;
let fileHandle = null, filePerm = false;
let saving = false, pending = false, pendingReasons = [], lastErr = null;
const saveLog = [];
const undoStack = [], redoStack = [];
// Undo keeps whole copies of the plan, so it's capped by memory as well as by count (DECISIONS #77): up to 40 steps
// within 64 MB together with redo, dropping the oldest first, but always the last step even when one copy is bigger.
const UNDO_LIMIT = 40;
let undoBudget = 64 * 2 ** 20;
const historyBytes = () => [...undoStack, ...redoStack].reduce((n, b) => n + b.byteLength, 0);
function trimUndo() {
  let total = historyBytes();
  while (undoStack.length > 1 && (undoStack.length > UNDO_LIMIT || total > undoBudget)) total -= undoStack.shift().byteLength;
  while (redoStack.length && total > undoBudget) total -= redoStack.shift().byteLength;
}
const hooks = { onChange() { }, onSaveState() { }, onReplace() { }, onReadOnly() { } };
let slowSaves = false; // test/demo aid

function q(sql, params = []) {
  const st = db.prepare(sql); st.bind(params); const out = [];
  while (st.step()) out.push(st.getAsObject());
  st.free(); return out;
}
const run = (sql, params = []) => db.run(sql, params);
const one = (sql, params = []) => q(sql, params)[0] || null;
const scalar = (sql, params = []) => { const r = db.exec(sql, params)[0]; return r ? r.values[0][0] : null; };
const lastId = () => scalar("SELECT last_insert_rowid()");
const nowIso = () => new Date().toISOString().slice(0, 19).replace("T", " ");

// sql.js export() closes and reopens the connection, which resets pragmas (DECISIONS #23).
// dbGen counts reopenings (export, install, undo), which reset SQLite's total_changes(); caches key on both.
let dbGen = 0, inMutate = false;
function exportBytes() {
  // export() closes the connection, which would silently roll back an open transaction.
  if (inMutate) throw new Error("Internal error: the database can't be copied in the middle of a change");
  const b = db.export(); dbGen++; db.run("PRAGMA foreign_keys = ON"); return b;
}
// The last export's bytes, reused as the next undo snapshot while nothing has changed since (saves one full
// export per edit). total_changes() restarts at 0 on the fresh connection export() leaves behind.
let snapCache = null;
function exportForSave() { const b = exportBytes(); snapCache = { bytes: b, gen: dbGen }; return b; }
function snapshot() { return snapCache && snapCache.gen === dbGen && scalar("SELECT total_changes()") === 0 ? snapCache.bytes : exportBytes(); }

const SCHEMA_V1 = `
CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS project(
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
  position INTEGER NOT NULL DEFAULT 0, created_at TEXT);
CREATE TABLE IF NOT EXISTS task(
  id INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  parent_id INTEGER REFERENCES task(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'task' CHECK(kind IN ('task','milestone')),
  start TEXT, finish TEXT,
  percent INTEGER NOT NULL DEFAULT 0 CHECK(percent BETWEEN 0 AND 100),
  status TEXT NOT NULL DEFAULT 'Not started',
  code TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '',
  created_at TEXT, updated_at TEXT);
CREATE INDEX IF NOT EXISTS task_tree ON task(project_id, parent_id, position);
CREATE TABLE IF NOT EXISTS party(
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL CHECK(kind IN ('person','team')),
  name TEXT NOT NULL, email TEXT NOT NULL DEFAULT '', title TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1, notes TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS team_member(
  team_id INTEGER NOT NULL REFERENCES party(id) ON DELETE CASCADE,
  person_id INTEGER NOT NULL REFERENCES party(id) ON DELETE CASCADE,
  PRIMARY KEY(team_id, person_id));
CREATE TABLE IF NOT EXISTS raci(
  task_id INTEGER NOT NULL REFERENCES task(id) ON DELETE CASCADE,
  party_id INTEGER NOT NULL REFERENCES party(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('R','A','C','I')),
  PRIMARY KEY(task_id, party_id));
CREATE TABLE IF NOT EXISTS dep(
  id INTEGER PRIMARY KEY,
  pred_id INTEGER NOT NULL REFERENCES task(id) ON DELETE CASCADE,
  succ_id INTEGER NOT NULL REFERENCES task(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'FS' CHECK(type IN ('FS','SS','FF','SF')),
  lag INTEGER NOT NULL DEFAULT 0,
  UNIQUE(pred_id, succ_id));
CREATE TABLE IF NOT EXISTS import_map(signature TEXT PRIMARY KEY, config TEXT NOT NULL, updated_at TEXT);
CREATE TRIGGER IF NOT EXISTS team_member_kinds BEFORE INSERT ON team_member BEGIN
  SELECT RAISE(ABORT, 'team_member must link a team to a person')
  WHERE (SELECT kind FROM party WHERE id = NEW.team_id) IS NOT 'team'
     OR (SELECT kind FROM party WHERE id = NEW.person_id) IS NOT 'person';
END;
INSERT OR IGNORE INTO meta VALUES ('rev','0'), ('app','offline-pm'), ('file_id', lower(hex(randomblob(8))));
`;
// v2: work notes journal on tasks (DECISIONS #38-#41).
const SCHEMA_V2 = `
CREATE TABLE IF NOT EXISTS note(
  id INTEGER PRIMARY KEY,
  task_id INTEGER NOT NULL REFERENCES task(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  author TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT);
CREATE INDEX IF NOT EXISTS note_task ON note(task_id, created_at);
`;
// v4: risks, their mitigants, mitigant → task "implements" links, R/A on both (DECISIONS #51-#58).
const SCHEMA_V4 = `
CREATE TABLE IF NOT EXISTS risk(
  id INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', plan TEXT NOT NULL DEFAULT '',
  response TEXT NOT NULL DEFAULT 'mitigate' CHECK(response IN ('mitigate','accept')),
  accept_reason TEXT NOT NULL DEFAULT '',
  probability TEXT NOT NULL DEFAULT '' CHECK(probability IN ('','L','M','H')),
  impact TEXT NOT NULL DEFAULT '' CHECK(impact IN ('','L','M','H')),
  r_is_a INTEGER NOT NULL DEFAULT 0, created_at TEXT, updated_at TEXT);
CREATE TABLE IF NOT EXISTS mitigant(
  id INTEGER PRIMARY KEY,
  risk_id INTEGER NOT NULL REFERENCES risk(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  text TEXT NOT NULL, is_control INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT '' CHECK(status IN ('','Not started','Planned','Implemented','Tested')),
  testing TEXT NOT NULL DEFAULT '', handed_to TEXT NOT NULL DEFAULT '',
  r_is_a INTEGER NOT NULL DEFAULT 0, created_at TEXT, updated_at TEXT);
CREATE TABLE IF NOT EXISTS mitigant_task(
  mitigant_id INTEGER NOT NULL REFERENCES mitigant(id) ON DELETE CASCADE,
  task_id INTEGER NOT NULL REFERENCES task(id) ON DELETE CASCADE,
  PRIMARY KEY(mitigant_id, task_id));
CREATE INDEX IF NOT EXISTS mitigant_task_t ON mitigant_task(task_id);
CREATE TABLE IF NOT EXISTS risk_party(
  risk_id INTEGER NOT NULL REFERENCES risk(id) ON DELETE CASCADE,
  party_id INTEGER NOT NULL REFERENCES party(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('R','A')), PRIMARY KEY(risk_id, party_id));
CREATE TABLE IF NOT EXISTS mitigant_party(
  mitigant_id INTEGER NOT NULL REFERENCES mitigant(id) ON DELETE CASCADE,
  party_id INTEGER NOT NULL REFERENCES party(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('R','A')), PRIMARY KEY(mitigant_id, party_id));
`;
const SCHEMA_ALL = SCHEMA_V1 + SCHEMA_V2 + SCHEMA_V4;
// Changes CREATE ... IF NOT EXISTS can't express: v3 task.r_is_a (DECISIONS #48); v4 notes on risks and mitigants too.
function upgradeTables(d) {
  const cols = t => d.exec(`PRAGMA table_info(${t})`)[0].values.map(r => r[1]);
  if (!cols("task").includes("r_is_a")) d.run("ALTER TABLE task ADD COLUMN r_is_a INTEGER NOT NULL DEFAULT 0");
  if (!cols("note").includes("risk_id")) d.run(`
    CREATE TABLE note_v4(
      id INTEGER PRIMARY KEY,
      task_id INTEGER REFERENCES task(id) ON DELETE CASCADE,
      risk_id INTEGER REFERENCES risk(id) ON DELETE CASCADE,
      mitigant_id INTEGER REFERENCES mitigant(id) ON DELETE CASCADE,
      body TEXT NOT NULL, author TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT,
      CHECK((task_id IS NOT NULL) + (risk_id IS NOT NULL) + (mitigant_id IS NOT NULL) = 1));
    INSERT INTO note_v4(id, task_id, body, author, created_at, updated_at) SELECT id, task_id, body, author, created_at, updated_at FROM note;
    DROP TABLE note; ALTER TABLE note_v4 RENAME TO note;
    CREATE INDEX IF NOT EXISTS note_task ON note(task_id, created_at);
    CREATE INDEX IF NOT EXISTS note_risk ON note(risk_id, created_at);
    CREATE INDEX IF NOT EXISTS note_mit ON note(mitigant_id, created_at);`);
}

const tableExists = (d, name) => !!d.exec("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", [name])[0];

// Bring any database up to SCHEMA_VERSION. Returns a description of what happened, or "".
function migrate(d) {
  const ver = d.exec("PRAGMA user_version")[0].values[0][0];
  if (ver > SCHEMA_VERSION) throw new Error(`This file was made by a newer version of the app (schema ${ver}). Please use the newer app.`);
  if (ver === SCHEMA_VERSION) { d.run(SCHEMA_ALL); upgradeTables(d); return ""; }
  let note = "";
  d.run("BEGIN");
  try {
    const legacy = tableExists(d, "tasks"); // proof-of-concept layout
    const oldRev = legacy && tableExists(d, "meta") ? +(d.exec("SELECT value FROM meta WHERE key='rev'")[0]?.values[0][0] ?? 0) : 0;
    if (legacy && tableExists(d, "meta")) d.run("ALTER TABLE meta RENAME TO meta_v0");
    d.run(SCHEMA_ALL); upgradeTables(d);
    if (legacy) {
      d.run("INSERT INTO project(name, created_at) VALUES ('Imported plan', ?)", [nowIso()]);
      const pid = d.exec("SELECT last_insert_rowid()")[0].values[0][0];
      const st = { todo: "Not started", doing: "In progress", done: "Done" };
      const rows = d.exec("SELECT id, title, status, due, notes FROM tasks ORDER BY id")[0]?.values || [];
      rows.forEach(([id, title, status, due, notes], i) => {
        d.run("INSERT INTO task(id, project_id, position, name, status, percent, start, finish, notes, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
          [id, pid, i, title || "Untitled", st[status] || "Not started", status === "done" ? 100 : 0, due || null, due || null, notes || "", nowIso()]);
      });
      if (tableExists(d, "deps")) d.run("INSERT OR IGNORE INTO dep(pred_id, succ_id, type, lag) SELECT depends_on, task_id, 'FS', 0 FROM deps WHERE depends_on <> task_id AND depends_on IN (SELECT id FROM task) AND task_id IN (SELECT id FROM task)");
      d.run("DROP TABLE IF EXISTS deps"); d.run("DROP TABLE tasks"); d.run("DROP TABLE IF EXISTS meta_v0");
      d.run("UPDATE meta SET value=? WHERE key='rev'", [String(oldRev)]);
      note = `Upgraded a proof-of-concept file: ${rows.length} tasks moved into project “Imported plan”.`;
    }
    d.run(`PRAGMA user_version = ${SCHEMA_VERSION}`);
    d.run("COMMIT");
  } catch (e) { try { d.run("ROLLBACK"); } catch { } throw e; }
  return note;
}

const readRev = d => { const n = +(d.exec("SELECT value FROM meta WHERE key='rev'")[0]?.values[0][0] ?? 0); return Number.isSafeInteger(n) && n >= 0 ? n : 0; };
const readFileId = d => { try { return d.exec("SELECT value FROM meta WHERE key='file_id'")[0]?.values[0][0] ?? null; } catch { return null; } };
const isSqlite = b => b.length >= 16 && String.fromCharCode(...b.slice(0, 15)) === "SQLite format 3";

// ---------- Trust boundary: a shared .db is untrusted input (DECISIONS #62) ----------
// Only empty databases, our own plans and proof-of-concept files are opened. Anything else is refused
// before migrate() touches it, so another app's database is never rewritten.
function assertPlanFile(d) {
  const tables = d.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")[0]?.values.map(r => r[0]) || [];
  if (!tables.length) return;
  if (tables.includes("tasks") && d.exec("PRAGMA table_info(tasks)")[0].values.some(r => r[1] === "title")) return; // PoC layout
  const app = tables.includes("meta") ? d.exec("SELECT value FROM meta WHERE key='app'")[0]?.values[0][0] : null;
  if (app !== "offline-pm") throw new Error("That file is a SQLite database, but not an Offline PM plan. It was not opened or changed.");
}
// Column name/type/pk per table, as a fresh database has them after SCHEMA_ALL + upgradeTables.
const layoutOf = (d, tables) => Object.fromEntries(tables.map(t => [t, (d.exec(`PRAGMA table_info(${t})`)[0]?.values || []).map(r => `${r[1]}:${String(r[2]).toUpperCase()}:${r[5]}`).sort().join(",")]));
let expectedLayout = null;
function getExpectedLayout() {
  if (expectedLayout) return expectedLayout;
  const f = new SQL.Database(); f.run(SCHEMA_ALL); upgradeTables(f);
  const tables = f.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")[0].values.map(r => r[0]);
  expectedLayout = layoutOf(f, tables); f.close();
  return expectedLayout;
}
// Values the UI trusts to be numbers or fixed words. CHECK constraints don't protect them: a file can be
// written with them switched off. [table, column, allowed, replacement (null = delete the row)]
const ENUM_COLS = [
  ["task", "kind", ["task", "milestone"], "task"], ["task", "status", ["Not started", "In progress", "Blocked", "Done"], "Not started"],
  ["party", "kind", ["person", "team"], null], ["raci", "role", ["R", "A", "C", "I"], null], ["dep", "type", ["FS", "SS", "FF", "SF"], "FS"],
  ["risk", "response", ["mitigate", "accept"], "mitigate"], ["risk", "probability", ["", "L", "M", "H"], ""], ["risk", "impact", ["", "L", "M", "H"], ""],
  ["mitigant", "status", ["", "Not started", "Planned", "Implemented", "Tested"], ""],
  ["risk_party", "role", ["R", "A"], null], ["mitigant_party", "role", ["R", "A"], null],
];
// Check the layout, drop foreign triggers/views, and repair values. Returns how many rows were changed.
function sanitizePlan(d) {
  const exp = getExpectedLayout(), got = layoutOf(d, Object.keys(exp));
  for (const t in exp) if (exp[t] !== got[t]) throw new Error(`That file's “${t}” table doesn't have the layout this app expects, so it wasn't opened.`);
  let fixed = 0; const exec = (sql, p) => { d.run(sql, p); fixed += d.getRowsModified(); };
  d.run("BEGIN");
  try {
    // Triggers and views can only come from another tool; ours are recreated by SCHEMA_ALL.
    for (const [type, name] of d.exec("SELECT type, name FROM sqlite_master WHERE type IN ('trigger','view')")[0]?.values || [])
      d.run(`DROP ${type === "view" ? "VIEW" : "TRIGGER"} "${String(name).replace(/"/g, '""')}"`);
    d.run(SCHEMA_ALL);
    for (const t in exp) for (const [, c, type] of d.exec(`PRAGMA table_info(${t})`)[0].values) {
      if (String(type).toUpperCase() !== "INTEGER") continue;
      if (c === "id" || c.endsWith("_id")) exec(`DELETE FROM ${t} WHERE typeof(${c}) NOT IN ('integer','null')`);
      else exec(`UPDATE ${t} SET ${c} = COALESCE(CAST(${c} AS INTEGER), 0) WHERE typeof(${c}) <> 'integer'`);
    }
    exec("UPDATE task SET percent = MAX(0, MIN(100, percent)) WHERE percent NOT BETWEEN 0 AND 100");
    for (const [t, c, allowed, repl] of ENUM_COLS) {
      const where = `WHERE ${c} IS NULL OR typeof(${c}) <> 'text' OR ${c} NOT IN (${allowed.map(() => "?").join(",")})`;
      if (repl == null) exec(`DELETE FROM ${t} ${where}`, allowed); else exec(`UPDATE ${t} SET ${c} = ? ${where}`, [repl, ...allowed]);
    }
    // Rows pointing at rows that don't exist (cascades never ran with foreign keys off).
    for (let i = 0; i < 20; i++) {
      const bad = d.exec("PRAGMA foreign_key_check")[0]?.values || [];
      if (!bad.length) break;
      for (const [t, rowid] of bad) { if (rowid == null) throw new Error(`That file's “${t}” table can't be checked, so it wasn't opened.`); exec(`DELETE FROM "${String(t).replace(/"/g, '""')}" WHERE rowid = ?`, [rowid]); }
    }
    d.run("COMMIT");
  } catch (e) { try { d.run("ROLLBACK"); } catch { } throw e; }
  return fixed;
}

// Replace the live database. bytes=null → brand new empty plan.
function installDb(bytes) {
  const d = bytes && bytes.length ? new SQL.Database(bytes) : new SQL.Database();
  let note;
  try {
    assertPlanFile(d);
    note = migrate(d);
    const fixed = sanitizePlan(d);
    if (fixed) note = (note ? note + " " : "") + `Repaired ${fixed} invalid ${fixed === 1 ? "row" : "rows"} in the file.`;
  } catch (e) { d.close(); throw e; }
  if (db) db.close();
  db = d; dbGen++;
  db.run("PRAGMA foreign_keys = ON");
  if (!scalar("SELECT COUNT(*) FROM project")) run("INSERT INTO project(name, created_at) VALUES ('My project', ?)", [nowIso()]);
  rev = readRev(db);
  undoStack.length = 0; redoStack.length = 0;
  hooks.onReplace();
  return note;
}

// Every change goes through mutate(): one transaction, one revision, one save.
const opNotes = []; // messages ops want shown after a successful change
function mutate(desc, fn) {
  if (readOnly) { toast(readOnlyWhy || "This tab is read-only.", "err"); return false; }
  // One change at a time: a change started inside another would commit half of the outer one.
  if (inMutate) throw new Error(`Internal error: “${desc}” started inside another change`);
  const snap = snapshot();
  opNotes.length = 0;
  try {
    inMutate = true;
    run("BEGIN");
    fn();
    run("UPDATE meta SET value=? WHERE key='rev'", [String(rev + 1)]);
    run("COMMIT");
    rev++;
  } catch (e) {
    try { run("ROLLBACK"); } catch { }
    inMutate = false;
    toast(e.message, "err");
    hooks.onChange();
    return false;
  }
  inMutate = false;
  redoStack.length = 0;
  undoStack.push(snap); trimUndo();
  afterChange(desc);
  if (opNotes.length) toast(opNotes.splice(0).join(" "));
  return true;
}
function afterChange(desc) { hooks.onChange(); queueSave(desc); }


// Undo/redo bring back an earlier state of the plan, but never an earlier file id (DECISIONS #63).
function restoreSnapshot(bytes, desc) {
  const next = rev + 1, fid = readFileId(db);
  db.close(); db = new SQL.Database(bytes); dbGen++; db.run("PRAGMA foreign_keys = ON");
  if (fid) run("UPDATE meta SET value=? WHERE key='file_id'", [fid]);
  rev = next; run("UPDATE meta SET value=? WHERE key='rev'", [String(rev)]);
  afterChange(desc);
}
function undo() {
  if (readOnly) return toast(readOnlyWhy, "err");
  if (!undoStack.length) return toast("Nothing to undo");
  redoStack.push(exportBytes()); restoreSnapshot(undoStack.pop(), "Undo"); trimUndo();
}
function redo() {
  if (readOnly) return toast(readOnlyWhy, "err");
  if (!redoStack.length) return toast("Nothing to redo");
  undoStack.push(exportBytes()); restoreSnapshot(redoStack.pop(), "Redo"); trimUndo();
}

// ---------- One writer at a time (DECISIONS #29) ----------
// The first tab holds a Web Lock until it closes; any other tab opens read-only and can take over.
let readOnly = false, readOnlyWhy = "";
function setReadOnly(why) { readOnly = true; readOnlyWhy = why; hooks.onReadOnly(); hooks.onSaveState(); }
function acquireWriterLock(steal = false) {
  if (!navigator.locks) return Promise.resolve(true);
  return new Promise(res => {
    navigator.locks.request("offline-pm-writer", steal ? { steal: true } : { ifAvailable: true }, lock => {
      res(!!lock);
      return lock ? new Promise(() => { }) : null; // held for the life of the tab
    }).catch(() => setReadOnly("Another tab took over editing. This tab is now read-only: close it, or reload it to see the latest plan."));
  });
}
async function takeOverEditing() { await acquireWriterLock(true); await sleep(400); location.reload(); }
function needWriter() { if (readOnly) { toast(readOnlyWhy, "err"); return false; } return true; }

// ---------- IndexedDB: crash buffer, remembered file handle, backups ----------
const IDB_TIMEOUT = 20000;
const idb = (() => {
  let p;
  const open = () => p ||= new Promise((res, rej) => {
    const r = indexedDB.open(IDB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore("kv");
    r.onsuccess = () => res(r.result); r.onerror = () => { p = null; rej(r.error); };
  });
  // A failed commit (QuotaExceededError, for one) fires only "abort", so listen for it, and never wait forever.
  const tx = async (mode, fn) => { const d = await open(); return new Promise((res, rej) => {
    const t = d.transaction("kv", mode); const req = fn(t.objectStore("kv"));
    const timer = setTimeout(() => { try { t.abort(); } catch { } rej(new Error("Browser storage didn't respond")); }, IDB_TIMEOUT);
    t.oncomplete = () => { clearTimeout(timer); res(req && req.result); };
    t.onerror = t.onabort = () => { clearTimeout(timer); rej(t.error || new Error("Browser storage write was cancelled")); };
  }); };
  return { tx, get: k => tx("readonly", s => s.get(k)), set: (k, v) => tx("readwrite", s => s.put(v, k)), del: k => tx("readwrite", s => s.delete(k)) };
})();

// Before the app replaces the only copy of some work, it keeps that copy so File → Recover replaced copies
// can hand it back (DECISIONS #64). The newest few are kept.
const BACKUP_LIMIT = 3;
async function keepBackup(bytes, reason, file = null) {
  if (readOnly) return false;
  try {
    const list = (await idb.get("backups")) || [];
    list.unshift({ ts: Date.now(), reason, file, size: bytes.length, bytes });
    await idb.set("backups", list.slice(0, BACKUP_LIMIT));
    logInfo(`Kept a backup of the ${reason}. File → Recover replaced copies.`);
    return true;
  } catch (e) { logInfo(`Couldn't keep a backup of the ${reason}: ${e.message}`); return false; }
}
const hasWork = () => !!scalar("SELECT (SELECT COUNT(*) FROM task) + (SELECT COUNT(*) FROM risk) + (SELECT COUNT(*) FROM party) + (SELECT COUNT(*) FROM note)");

// ---------- Save queue: serialized, coalesced, disk first then buffer ----------
let syncing = false; // comparing the file with the buffer: no disk writes until that's decided
// A failed disk write (file locked by antivirus or a sync client, say) is retried with growing gaps (DECISIONS #68).
const RETRY_SECS = [2, 5, 15, 30, 60];
let retryTimer = null, retryN = 0;
function scheduleRetry(target) {
  if (retryTimer) return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    if (fileHandle === target && filePerm && diskRev !== rev) queueSave(`Retry write to file (attempt ${retryN + 1})`);
  }, RETRY_SECS[Math.min(retryN++, RETRY_SECS.length - 1)] * 1000);
}
function queueSave(desc) {
  pendingReasons.push(desc); pending = true; hooks.onSaveState();
  if (!saving) drain();
}
async function drain() {
  saving = true; hooks.onSaveState();
  try {
    while (pending) {
      pending = false;
      const reasons = pendingReasons.splice(0), r = rev, target = fileHandle; // the file these bytes belong to
      const entry = { r, reasons, size: 0, mirrorOk: false, disk: "none", diskMs: 0, err: null, at: Date.now() };
      try {
        if (readOnly) { entry.err = "Read-only tab: nothing written"; continue; }
        const bytes = exportForSave(), fileId = readFileId(db); entry.size = lastSize = bytes.length;
        if (slowSaves) await sleep(1500);
        const errs = [];
        // Disk first: if the tab dies between the two writes, the buffer is behind the file, which loads cleanly.
        if (target && filePerm && !syncing && fileHandle === target) { // never write one plan's bytes into a file opened meanwhile
          try {
            const t0 = performance.now();
            const w = await target.createWritable(); // temp file swapped in on close() → atomic
            await w.write(bytes); await w.close();
            entry.disk = "ok"; entry.diskMs = Math.round(performance.now() - t0); retryN = 0;
            if (fileHandle === target) { diskRev = r; lastDiskAt = Date.now(); }
          } catch (e) {
            entry.disk = "fail"; errs.push("Disk: " + e.message);
            if (e.name === "NotAllowedError") filePerm = false; else scheduleRetry(target);
          }
        }
        if (!readOnly) {
          // disk = the revision the file is known to hold, so the next start can tell whose edits are whose.
          try { await idb.set("mirror", { rev: r, bytes, ts: Date.now(), file: target?.name ?? null, fileId, disk: target && fileHandle === target ? diskRev : null }); entry.mirrorOk = true; mirrorRev = r; }
          catch (e) { errs.push("Buffer: " + e.message); }
        }
        entry.err = errs.join(" · ") || null;
      } catch (e) {
        entry.err = "Save failed: " + e.message;
      } finally {
        lastErr = entry.err;
        saveLog.unshift(entry); if (saveLog.length > 80) saveLog.pop();
        try { hooks.onSaveState(); } catch (e) { console.error(e); }
      }
    }
  } finally {
    saving = false; hooks.onSaveState();
  }
}
async function flushSaves() { while (saving || pending) await sleep(20); }
// Warn while a save is under way, or while the connected file is behind (a write failed and hasn't been retried yet).
window.addEventListener("beforeunload", e => { if (!readOnly && (saving || pending || (fileHandle && filePerm && diskRev !== rev))) { e.preventDefault(); e.returnValue = ""; } });

function logInfo(text) { saveLog.unshift({ info: text, at: Date.now() }); if (saveLog.length > 80) saveLog.pop(); hooks.onSaveState(); }

// ---------- File handling (File System Access API) ----------
const pickerOpts = { types: [{ description: "Plan database", accept: { "application/x-sqlite3": [".db"] } }] };
const fsSupported = "showSaveFilePicker" in window;
const unsavedWork = () => (!fileHandle || diskRev !== rev) && hasWork();

async function readHandle(h) { return new Uint8Array(await (await h.getFile()).arrayBuffer()); }
// { rev, fileId } of a file's bytes, or null when it isn't a database.
function fileInfoOf(buf) {
  if (!buf.length) return { rev: 0, fileId: null };
  if (!isSqlite(buf)) return null;
  try {
    const t = new SQL.Database(buf);
    const out = tableExists(t, "meta") ? { rev: readRev(t), fileId: readFileId(t) } : { rev: 0, fileId: null };
    t.close(); return out;
  } catch { return null; }
}

// Decide between the file on disk and the browser buffer. The plan's identity is meta.file_id, not the
// file name. diskRev on entry is the revision the file was last known to hold (null = unknown), so:
// a different file id → the file wins; edits on one side only → that side wins; edits on both sides →
// the higher revision wins (the file on a tie) and the other side is kept as a backup (DECISIONS #29, #64).
async function syncWithFile() {
  syncing = true; let reason = null;
  try {
    const name = fileHandle.name, buf = await readHandle(fileHandle), info = fileInfoOf(buf);
    if (!info) { toast("That file isn't a valid plan database", "err"); fileHandle = null; filePerm = false; idb.del("handle").catch(() => { }); hooks.onSaveState(); return; }
    const base = diskRev, myId = readFileId(db);
    const load = async (backupReason) => {
      const old = backupReason ? exportBytes() : null;
      const note = installDb(buf); diskRev = note ? null : rev; hooks.onChange();
      if (old) await keepBackup(old, backupReason);
      if (note) logInfo(note);
      reason = note ? "Write upgraded file" : "Refresh crash buffer from file";
    };
    if (buf.length && info.fileId && myId && info.fileId !== myId) {
      await load(hasWork() ? `browser copy of another plan (rev ${rev}), replaced by “${name}”` : null);
      logInfo(`Loaded “${name}” from disk (the browser buffer belonged to another plan).`);
    } else if (info.rev > rev || (info.rev === rev && base != null && base < rev)) {
      const ownEdits = base == null || base < rev, oldRev = rev;
      await load(ownEdits ? `browser copy at rev ${oldRev}, replaced by “${name}” at rev ${info.rev}` : null);
      logInfo(info.rev > oldRev ? `File is newer (rev ${info.rev}) than the browser buffer: loaded it from disk.`
        : `File and browser buffer were both changed (rev ${info.rev} each): loaded the file.`);
    } else if (info.rev < rev) {
      if (base != null && info.rev > base) await keepBackup(buf, `“${name}” at rev ${info.rev}, changed elsewhere and replaced by the browser copy at rev ${rev}`, name);
      diskRev = info.rev;
      logInfo(`File on disk was behind (rev ${info.rev}); buffer has rev ${rev}. Writing the missing changes…`);
      reason = `Catch up file: rev ${info.rev} → ${rev}`;
    } else {
      diskRev = info.rev; lastDiskAt = (await fileHandle.getFile()).lastModified;
      logInfo(`File and crash buffer agree (rev ${rev}). Nothing lost.`);
    }
  } finally { syncing = false; }
  if (reason) queueSave(reason);
  hooks.onSaveState();
}

// Write the buffer for the new file *before* remembering its handle, so a crash in between can't pair
// an old plan's buffer with the new file.
async function rememberHandle(h) {
  try { await idb.set("mirror", { rev, bytes: exportBytes(), ts: Date.now(), file: h.name, fileId: readFileId(db), disk: diskRev }); mirrorRev = rev; } catch { }
  await idb.set("handle", h);
}
// Is h the file this plan is saved in? (Chrome asks "Replace?" but that's easy to click through.)
async function isOpenFile(h) { try { return !!fileHandle && await h.isSameEntry(fileHandle); } catch { return false; } }
function needFs() { if (!needWriter()) return false; if (!fsSupported) { toast("Saving to files needs Chrome or Edge. You can still export to Excel.", "err"); return false; } return true; }
function confirmDiscard(action) {
  return !unsavedWork() || confirm(`The current plan has changes that aren't saved to a file.\n\n${action} will replace it in this window. Continue?\n(Tip: cancel and use File → Save a copy first. A backup is also kept under File → Recover replaced copies.)`);
}

async function newPlanFile() {
  if (!needFs() || !confirmDiscard("Creating a new plan")) return;
  try {
    const h = await showSaveFilePicker({ ...pickerOpts, suggestedName: "plan.db" });
    if (await isOpenFile(h)) return toast("That's the file this plan is saved in. Pick another name: a new plan would wipe it.", "err");
    const old = unsavedWork() ? exportBytes() : null;
    installDb(null);
    fileHandle = h; filePerm = true; diskRev = null; await rememberHandle(h);
    if (old) await keepBackup(old, "unsaved plan replaced by a new plan file");
    hooks.onChange(); logInfo(`Created new plan file “${h.name}”.`); queueSave("First write to new file");
  } catch (e) { if (e.name !== "AbortError") toast(e.message, "err"); }
}
async function openPlanFile() {
  if (!needFs() || !confirmDiscard("Opening another file")) return;
  try {
    const [h] = await showOpenFilePicker(pickerOpts);
    if (await h.requestPermission({ mode: "readwrite" }) !== "granted") return toast("Write permission is needed so changes can be saved", "err");
    await openHandle(h);
  } catch (e) { if (e.name !== "AbortError") toast(e.message, "err"); }
}
async function openHandle(h) {
  const buf = await readHandle(h);
  if (buf.length && !isSqlite(buf)) return toast("That file isn't a plan database (.db)", "err");
  const old = unsavedWork() ? exportBytes() : null;
  const note = installDb(buf); // throws, before anything changes, for files that aren't plans
  fileHandle = h; filePerm = true; diskRev = buf.length && !note ? rev : null; await rememberHandle(h);
  lastDiskAt = (await h.getFile()).lastModified;
  if (old) await keepBackup(old, `unsaved plan replaced by opening “${h.name}”`);
  hooks.onChange();
  logInfo(buf.length ? `Opened “${h.name}” at rev ${rev}.` : `“${h.name}” was empty: started a new plan in it.`);
  if (note) logInfo(note);
  queueSave(note ? "Write upgraded file" : buf.length ? "Refresh crash buffer from opened file" : "First write to empty file");
}
async function saveCopy() {
  if (!needFs()) return;
  try {
    const h = await showSaveFilePicker({ ...pickerOpts, suggestedName: fileHandle ? fileHandle.name.replace(/\.db$/i, "") + " copy.db" : "plan.db" });
    if (await isOpenFile(h)) return toast("That's the file this plan is already saved in. Pick another name for the copy.", "err");
    // The copy is a new plan from here on: a new file id keeps the two apart (DECISIONS #31, #63).
    run("UPDATE meta SET value=lower(hex(randomblob(8))) WHERE key='file_id'");
    fileHandle = h; filePerm = true; diskRev = null; await rememberHandle(h);
    logInfo(`Saving to “${h.name}” from now on.`); queueSave("Save a copy");
  } catch (e) { if (e.name !== "AbortError") toast(e.message, "err"); }
}
async function reconnect() {
  if (!needWriter()) return;
  try {
    if (await fileHandle.requestPermission({ mode: "readwrite" }) !== "granted") return toast("Permission not granted", "err");
    filePerm = true; await syncWithFile();
  } catch (e) { toast(e.message, "err"); }
}
async function disconnectFile() {
  fileHandle = null; filePerm = false; diskRev = null;
  try { await idb.del("handle"); } catch { }
  hooks.onSaveState();
}

async function bootDb(wasmB64) {
  const b = atob(wasmB64), wasm = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) wasm[i] = b.charCodeAt(i);
  SQL = await initSqlJs({ wasmBinary: wasm });
  let mirrorErr = null;
  const [mirror, handle] = await Promise.all([idb.get("mirror").catch(e => { mirrorErr = e; return null; }), idb.get("handle").catch(() => null)]);
  if (mirrorErr) { // unreadable is not the same as empty: never write over it
    installDb(null);
    setReadOnly(`Couldn't read this browser's saved copy (${mirrorErr.message}). This tab is read-only so that copy isn't overwritten. Reload to try again.`);
    return false;
  }
  let fresh = false;
  if (mirror) {
    try {
      const note = installDb(mirror.bytes); mirrorRev = mirror.rev; lastSize = mirror.bytes.length; diskRev = mirror.disk ?? null;
      logInfo(`Restored rev ${rev} from the browser crash buffer.`); if (note) logInfo(note);
    } catch (e) {
      // Keep the copy we couldn't open (a newer app's file, say) and don't seed the sample plan over it.
      installDb(null);
      if (await keepBackup(mirror.bytes, `browser copy that couldn't be opened (${e.message})`, mirror.file ?? null))
        toast(`Couldn't open this browser's saved copy: ${e.message} It was kept under File → Recover replaced copies.`, "err");
      else setReadOnly(`Couldn't open this browser's saved copy (${e.message}) or back it up. This tab is read-only so the copy isn't overwritten.`);
    }
  } else { installDb(null); fresh = true; }
  // Ask the browser not to evict this site's storage under pressure: without a .db file it holds the only copy.
  if (!readOnly) navigator.storage?.persist?.().then(ok => { if (!ok) logInfo("The browser may clear its saved copy if disk space runs low. Save to a .db file to be safe."); }, () => { });
  if (handle) {
    fileHandle = handle;
    try {
      if (await handle.queryPermission({ mode: "readwrite" }) === "granted") { filePerm = true; await syncWithFile(); }
      else logInfo(`Remembered “${handle.name}”. Click Reconnect to resume saving to it.`);
    } catch (e) {
      logInfo(`Couldn't reach “${handle.name}” (${e.message}). It may have been moved or deleted.`);
      toast(`Couldn't reach the plan file “${handle.name}”. Use File → Open plan file to pick it again.`, "err");
      fileHandle = null; filePerm = false;
    }
  }
  return fresh;
}
