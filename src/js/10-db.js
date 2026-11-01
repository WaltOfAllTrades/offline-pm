// ---------- SQLite, schema, revisions, undo, live save ----------
const SCHEMA_VERSION = 1;
const IDB_NAME = "offline-pm";
let SQL, db;
let rev = 0, mirrorRev = null, diskRev = null, lastDiskAt = null, lastSize = 0;
let fileHandle = null, filePerm = false;
let saving = false, pending = false, pendingReasons = [], lastErr = null;
const saveLog = [];
const undoStack = [], redoStack = [];
const UNDO_LIMIT = 40;
const hooks = { onChange() { }, onSaveState() { } };
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
function exportBytes() { const b = db.export(); db.run("PRAGMA foreign_keys = ON"); return b; }

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

const tableExists = (d, name) => !!d.exec("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", [name])[0];

// Bring any database up to SCHEMA_VERSION. Returns a description of what happened, or "".
function migrate(d) {
  const ver = d.exec("PRAGMA user_version")[0].values[0][0];
  if (ver > SCHEMA_VERSION) throw new Error(`This file was made by a newer version of the app (schema ${ver}). Please use the newer app.`);
  if (ver === SCHEMA_VERSION) { d.run(SCHEMA_V1); return ""; }
  let note = "";
  d.run("BEGIN");
  try {
    const legacy = tableExists(d, "tasks"); // proof-of-concept layout
    const oldRev = legacy && tableExists(d, "meta") ? +(d.exec("SELECT value FROM meta WHERE key='rev'")[0]?.values[0][0] ?? 0) : 0;
    if (legacy && tableExists(d, "meta")) d.run("ALTER TABLE meta RENAME TO meta_v0");
    d.run(SCHEMA_V1);
    if (legacy) {
      d.run("INSERT INTO project(name, created_at) VALUES ('Imported plan', ?)", [nowIso()]);
      const pid = d.exec("SELECT last_insert_rowid()")[0].values[0][0];
      const st = { todo: "Not started", doing: "In progress", done: "Done" };
      const rows = d.exec("SELECT id, title, status, due, notes FROM tasks ORDER BY id")[0]?.values || [];
      rows.forEach(([id, title, status, due, notes], i) => {
        d.run("INSERT INTO task(id, project_id, position, name, status, percent, start, finish, notes, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
          [id, pid, i, title || "Untitled", st[status] || "Not started", status === "done" ? 100 : 0, due || null, due || null, notes || "", nowIso()]);
      });
      if (tableExists(d, "deps")) d.run("INSERT OR IGNORE INTO dep(pred_id, succ_id, type, lag) SELECT depends_on, task_id, 'FS', 0 FROM deps WHERE depends_on IN (SELECT id FROM task) AND task_id IN (SELECT id FROM task)");
      d.run("DROP TABLE IF EXISTS deps"); d.run("DROP TABLE tasks"); d.run("DROP TABLE IF EXISTS meta_v0");
      d.run("UPDATE meta SET value=? WHERE key='rev'", [String(oldRev)]);
      note = `Upgraded a proof-of-concept file: ${rows.length} tasks moved into project “Imported plan”.`;
    }
    d.run(`PRAGMA user_version = ${SCHEMA_VERSION}`);
    d.run("COMMIT");
  } catch (e) { try { d.run("ROLLBACK"); } catch { } throw e; }
  return note;
}

const readRev = d => +(d.exec("SELECT value FROM meta WHERE key='rev'")[0]?.values[0][0] ?? 0);
const isSqlite = b => b.length >= 16 && String.fromCharCode(...b.slice(0, 15)) === "SQLite format 3";

// Replace the live database. bytes=null → brand new empty plan.
function installDb(bytes) {
  const d = bytes && bytes.length ? new SQL.Database(bytes) : new SQL.Database();
  let note;
  try { note = migrate(d); } catch (e) { d.close(); throw e; }
  if (db) db.close();
  db = d;
  db.run("PRAGMA foreign_keys = ON");
  if (!scalar("SELECT COUNT(*) FROM project")) run("INSERT INTO project(name, created_at) VALUES ('My project', ?)", [nowIso()]);
  rev = readRev(db);
  undoStack.length = 0; redoStack.length = 0;
  return note;
}

// Every change goes through mutate(): one transaction, one revision, one save.
const opNotes = []; // messages ops want shown after a successful change
function mutate(desc, fn) {
  const snap = exportBytes();
  opNotes.length = 0;
  try {
    run("BEGIN");
    fn();
    rev++;
    run("UPDATE meta SET value=? WHERE key='rev'", [String(rev)]);
    run("COMMIT");
  } catch (e) {
    try { run("ROLLBACK"); } catch { }
    toast(e.message, "err");
    hooks.onChange();
    return false;
  }
  undoStack.push(snap); if (undoStack.length > UNDO_LIMIT) undoStack.shift();
  redoStack.length = 0;
  afterChange(desc);
  if (opNotes.length) toast(opNotes.splice(0).join(" "));
  return true;
}
function afterChange(desc) { hooks.onChange(); queueSave(desc); }

function restoreSnapshot(bytes, desc) {
  const next = rev + 1;
  db.close(); db = new SQL.Database(bytes); db.run("PRAGMA foreign_keys = ON");
  rev = next; run("UPDATE meta SET value=? WHERE key='rev'", [String(rev)]);
  afterChange(desc);
}
function undo() {
  if (!undoStack.length) return toast("Nothing to undo");
  redoStack.push(exportBytes()); restoreSnapshot(undoStack.pop(), "Undo");
}
function redo() {
  if (!redoStack.length) return toast("Nothing to redo");
  undoStack.push(exportBytes()); restoreSnapshot(redoStack.pop(), "Redo");
}

// ---------- IndexedDB: crash buffer + remembered file handle ----------
const idb = (() => {
  let p;
  const open = () => p ||= new Promise((res, rej) => {
    const r = indexedDB.open(IDB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore("kv");
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  const tx = async (mode, fn) => { const d = await open(); return new Promise((res, rej) => {
    const t = d.transaction("kv", mode); const req = fn(t.objectStore("kv"));
    t.oncomplete = () => res(req && req.result); t.onerror = () => rej(t.error);
  }); };
  return { get: k => tx("readonly", s => s.get(k)), set: (k, v) => tx("readwrite", s => s.put(v, k)), del: k => tx("readwrite", s => s.delete(k)) };
})();

// ---------- Save queue: serialized, coalesced, buffer first then disk ----------
function queueSave(desc) {
  pendingReasons.push(desc); pending = true; hooks.onSaveState();
  if (!saving) drain();
}
async function drain() {
  saving = true; hooks.onSaveState();
  while (pending) {
    pending = false;
    const reasons = pendingReasons.splice(0), r = rev, target = fileHandle; // the file these bytes belong to
    const bytes = exportBytes(); lastSize = bytes.length;
    if (slowSaves) await sleep(1500);
    const entry = { r, reasons, size: bytes.length, mirrorOk: false, disk: "none", diskMs: 0, err: null, at: Date.now() };
    try { await idb.set("mirror", { rev: r, bytes, ts: Date.now(), file: fileHandle?.name ?? null }); entry.mirrorOk = true; mirrorRev = r; }
    catch (e) { entry.err = "Buffer: " + e.message; }
    if (fileHandle && filePerm && fileHandle === target) { // never write one plan's bytes into a file opened meanwhile
      try {
        const t0 = performance.now();
        const w = await fileHandle.createWritable(); // temp file swapped in on close() → atomic
        await w.write(bytes); await w.close();
        entry.disk = "ok"; entry.diskMs = Math.round(performance.now() - t0);
        diskRev = r; lastDiskAt = Date.now();
      } catch (e) {
        entry.disk = "fail"; entry.err = "Disk: " + e.message;
        if (e.name === "NotAllowedError") filePerm = false;
      }
    }
    lastErr = entry.err;
    saveLog.unshift(entry); if (saveLog.length > 80) saveLog.pop();
    hooks.onSaveState();
  }
  saving = false; hooks.onSaveState();
}
async function flushSaves() { while (saving || pending) await sleep(20); }
window.addEventListener("beforeunload", e => { if (saving || pending) { e.preventDefault(); e.returnValue = ""; } });

function logInfo(text) { saveLog.unshift({ info: text, at: Date.now() }); if (saveLog.length > 80) saveLog.pop(); hooks.onSaveState(); }

// ---------- File handling (File System Access API) ----------
const pickerOpts = { types: [{ description: "Plan database", accept: { "application/x-sqlite3": [".db"] } }] };
const fsSupported = "showSaveFilePicker" in window;
const unsavedWork = () => (!fileHandle || diskRev !== rev) && scalar("SELECT COUNT(*) FROM task") > 0;

async function readHandle(h) { return new Uint8Array(await (await h.getFile()).arrayBuffer()); }
function fileRevOf(buf) {
  if (!buf.length) return 0;
  if (!isSqlite(buf)) return null;
  try { const t = new SQL.Database(buf); const r = tableExists(t, "meta") ? readRev(t) : 0; t.close(); return r; } catch { return null; }
}

// bufferForOtherFile: the crash buffer was written for a different file than the remembered handle,
// so revision numbers aren't comparable and the file on disk wins.
let bufferForOtherFile = false;
async function syncWithFile() {
  const buf = await readHandle(fileHandle);
  const fr = fileRevOf(buf);
  if (fr === null) { toast("That file isn't a valid plan database", "err"); fileHandle = null; filePerm = false; idb.del("handle").catch(() => { }); hooks.onSaveState(); return; }
  if (bufferForOtherFile && buf.length) {
    bufferForOtherFile = false;
    const note = installDb(buf); diskRev = note ? null : rev; hooks.onChange();
    logInfo(`Loaded “${fileHandle.name}” from disk (the browser buffer belonged to another file).`);
    queueSave(note ? "Write upgraded file" : "Refresh crash buffer from file");
  } else if (fr > rev) {
    const note = installDb(buf); diskRev = rev; hooks.onChange();
    logInfo(`File is newer (rev ${fr}) than the browser buffer: loaded it from disk.`);
    if (note) { logInfo(note); queueSave("Write upgraded file"); } else queueSave("Refresh crash buffer from file");
  } else if (fr < rev) {
    diskRev = fr;
    logInfo(`File on disk was behind (rev ${fr}); buffer has rev ${rev}. Writing the missing changes…`);
    queueSave(`Catch up file: rev ${fr} → ${rev}`);
  } else {
    diskRev = fr; lastDiskAt = (await fileHandle.getFile()).lastModified;
    logInfo(`File and crash buffer agree (rev ${rev}). Nothing lost.`);
  }
  hooks.onSaveState();
}

// Write the buffer for the new file *before* remembering its handle, so a crash in between can't pair
// an old plan's buffer with the new file (which would make the old plan overwrite it on the next load).
async function rememberHandle(h) {
  try { await idb.set("mirror", { rev, bytes: exportBytes(), ts: Date.now(), file: h.name }); mirrorRev = rev; } catch { }
  await idb.set("handle", h);
}
function needFs() { if (!fsSupported) { toast("Saving to files needs Chrome or Edge. You can still export to Excel.", "err"); return false; } return true; }
function confirmDiscard(action) {
  return !unsavedWork() || confirm(`The current plan has changes that aren't saved to a file.\n\n${action} will replace it in this window. Continue?\n(Tip: cancel and use File → Save a copy first.)`);
}

async function newPlanFile() {
  if (!needFs() || !confirmDiscard("Creating a new plan")) return;
  try {
    const h = await showSaveFilePicker({ ...pickerOpts, suggestedName: "plan.db" });
    installDb(null);
    fileHandle = h; filePerm = true; diskRev = null; await rememberHandle(h);
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
  const note = installDb(buf);
  fileHandle = h; filePerm = true; await rememberHandle(h);
  diskRev = buf.length && !note ? rev : null; lastDiskAt = (await h.getFile()).lastModified;
  hooks.onChange();
  logInfo(buf.length ? `Opened “${h.name}” at rev ${rev}.` : `“${h.name}” was empty: started a new plan in it.`);
  if (note) logInfo(note);
  queueSave(note ? "Write upgraded file" : buf.length ? "Refresh crash buffer from opened file" : "First write to empty file");
}
async function saveCopy() {
  if (!needFs()) return;
  try {
    const h = await showSaveFilePicker({ ...pickerOpts, suggestedName: fileHandle ? fileHandle.name.replace(/\.db$/i, "") + " copy.db" : "plan.db" });
    fileHandle = h; filePerm = true; diskRev = null; await rememberHandle(h);
    logInfo(`Saving to “${h.name}” from now on.`); queueSave("Save a copy");
  } catch (e) { if (e.name !== "AbortError") toast(e.message, "err"); }
}
async function reconnect() {
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
  const [mirror, handle] = await Promise.all([idb.get("mirror").catch(() => null), idb.get("handle").catch(() => null)]);
  let fresh = false;
  if (mirror) {
    try {
      const note = installDb(mirror.bytes); mirrorRev = mirror.rev; lastSize = mirror.bytes.length;
      logInfo(`Restored rev ${rev} from the browser crash buffer.`); if (note) logInfo(note);
    } catch (e) { toast("Couldn't restore the browser buffer: " + e.message, "err"); installDb(null); fresh = true; }
  } else { installDb(null); fresh = true; }
  if (handle) {
    fileHandle = handle;
    bufferForOtherFile = !!(mirror && mirror.file && mirror.file !== handle.name);
    try {
      if (await handle.queryPermission({ mode: "readwrite" }) === "granted") { filePerm = true; await syncWithFile(); }
      else logInfo(`Remembered “${handle.name}”. Click Reconnect to resume saving to it.`);
    } catch { fileHandle = null; }
  }
  return fresh;
}
