// ---------- Import (xlsx/csv) ----------
const IMPORT_FIELDS = [
  { key: "id", label: "ID", syn: ["id", "task id", "unique id", "uid", "key", "#", "row id"] },
  { key: "wbs", label: "WBS number (1.2.3)", syn: ["wbs", "wbs number", "wbs code", "outline number", "task number", "wbs no"] },
  { key: "level", label: "Outline level", syn: ["outline level", "level", "indent level", "hierarchy level"] },
  { key: "parent", label: "Parent (ID or name)", syn: ["parent", "parent id", "parent task", "parent key", "parent task id", "summary task"] },
  { key: "name", label: "Task name", required: true, syn: ["name", "task name", "task", "title", "summary", "activity", "item", "item name", "subject", "description", "deliverable"] },
  { key: "type", label: "Type (task / milestone)", syn: ["type", "kind", "milestone", "task type", "item type"] },
  { key: "start", label: "Start date", syn: ["start", "start date", "begin", "begin date", "planned start", "start time", "baseline start"] },
  { key: "finish", label: "Finish date", syn: ["finish", "finish date", "end", "end date", "due", "due date", "planned finish", "planned end", "deadline", "target date"] },
  { key: "duration", label: "Duration", syn: ["duration", "dur", "days", "work days", "working days", "length", "planned duration"] },
  { key: "percent", label: "% complete", syn: ["% complete", "percent complete", "percent", "progress", "complete", "% done", "pct", "pct complete", "percentage"] },
  { key: "status", label: "Status", syn: ["status", "state", "stage", "task status"] },
  { key: "pred", label: "Predecessors", syn: ["predecessors", "predecessor", "depends on", "dependencies", "dependency", "blocked by", "waiting on", "preds"] },
  { key: "R", label: "Responsible (R)", syn: ["responsible", "r", "assignee", "assignees", "assigned to", "owner", "owners", "resource names", "resources", "resource", "people", "person"] },
  { key: "A", label: "Accountable (A)", syn: ["accountable", "a", "approver", "accountable person"] },
  { key: "C", label: "Consulted (C)", syn: ["consulted", "c"] },
  { key: "I", label: "Informed (I)", syn: ["informed", "i", "watchers", "followers"] },
  { key: "code", label: "Code / reference", syn: ["code", "reference", "ref", "external id"] },
  { key: "notes", label: "Notes", syn: ["notes", "note", "comments", "comment", "details", "remarks"] },
];
const normHdr = s => String(s ?? "").toLowerCase().replace(/[^a-z0-9%#]+/g, " ").trim();
const STATUS_GUESS = v => {
  const s = String(v).toLowerCase().trim();
  const exact = STATUSES.find(x => x.toLowerCase() === s); if (exact) return exact;
  if (/not\s*started|to\s*do|backlog|^open$|^new$|planned|pending/.test(s)) return "Not started";
  if (/incomplete|not\s*(done|complete)/.test(s)) return "In progress";
  if (/done|complete|closed|finished|resolved|shipped/.test(s)) return "Done";
  if (/block|hold|stuck|risk|waiting/.test(s)) return "Blocked";
  if (/progress|started|doing|active|wip|working|on track|review|ongoing/.test(s)) return "In progress";
  return "Not started";
};

let W = null; // wizard state

function autoMap(headers) {
  const map = {}; const used = new Set();
  const nh = headers.map(normHdr);
  // Exact matches go by synonym order, so "Start" beats "Baseline Start" and "Task Name" beats "Description"
  // wherever they sit in the sheet. Date-like headers never count as "% complete" ("Completed On").
  for (const pass of ["exact", "contains"]) {
    for (const f of IMPORT_FIELDS) {
      if (used.has(f.key)) continue;
      const syns = [normHdr(f.label), ...f.syn.map(normHdr)];
      const free = idx => map[idx] == null && nh[idx];
      let i = -1;
      if (pass === "exact") { for (const s of syns) { i = nh.findIndex((h0, idx) => free(idx) && h0 === s); if (i >= 0) break; } }
      else i = nh.findIndex((h0, idx) => free(idx) && !(f.key === "percent" && /\b(date|on|by|at)\b/.test(h0)) && syns.some(s => s.length >= 4 && h0.includes(s)));
      if (i >= 0) { map[i] = f.key; used.add(f.key); }
    }
  }
  return map;
}

// CSV text is UTF-8 when it decodes cleanly; otherwise it's what Excel's plain "CSV (Comma delimited)" writes
// on Western Windows (Windows-1252), so "José" doesn't turn into "Jos�" (DECISIONS #67).
function decodeCsv(buf) {
  try { return { text: new TextDecoder("utf-8", { fatal: true }).decode(buf), encoding: "utf-8" }; }
  catch { return { text: new TextDecoder("windows-1252").decode(buf), encoding: "windows-1252" }; }
}
function readWorkbook(file, buf) {
  const isCsv = /\.(csv|txt|tsv)$/i.test(file.name);
  const csv = isCsv ? decodeCsv(buf) : null;
  const wb = isCsv ? XLSX.read(csv.text, { type: "string", raw: true }) : XLSX.read(buf, { type: "array", cellDates: false });
  return { wb, isCsv, encoding: csv?.encoding ?? null, date1904: !!wb.Workbook?.WBProps?.date1904 };
}
// The task id an ID cell refers to: whole numbers only, so "12b", "1.9" or "1,234" never update task 12, 1 or 1.
const idKey = v => { const s = String(v ?? "").trim(); return /^\d+$/.test(s) ? String(+s) : null; };
// Update mode: which rows update which existing task. Only the first row with a given ID does; later copies
// (a row copied and pasted to make a new task) are added as new tasks (DECISIONS #67).
function updateMatches(plan, taskIds) {
  const match = new Map(), seen = new Set(), dupRows = [];
  for (const it of plan.items) {
    const k = idKey(it.srcId); if (k == null || !taskIds.has(k)) continue;
    if (seen.has(k)) { dupRows.push(it.rowNo); continue; }
    seen.add(k); match.set(it, taskIds.get(k));
  }
  return { match, dupRows };
}
// A sheet's declared range can be far bigger than its cells (whole columns formatted, say), and reading it
// would freeze the tab. Read only up to the last real cell, and at most MAX_ROWS × MAX_COLS.
const MAX_ROWS = 100000, MAX_COLS = 300;
function trimRange(ws) {
  if (!ws["!ref"]) return false;
  const decl = XLSX.utils.decode_range(ws["!ref"]); let maxR = decl.s.r, maxC = decl.s.c;
  for (const k in ws) { if (k[0] === "!") continue; const c = XLSX.utils.decode_cell(k); if (c.r > maxR) maxR = c.r; if (c.c > maxC) maxC = c.c; }
  const e = { r: Math.min(maxR, decl.e.r, decl.s.r + MAX_ROWS), c: Math.min(maxC, decl.e.c, decl.s.c + MAX_COLS - 1) };
  ws["!ref"] = XLSX.utils.encode_range({ s: decl.s, e });
  return maxR > e.r || maxC > e.c;
}
function sheetRows(ws) {
  if (trimRange(ws)) toast(`Only the first ${MAX_ROWS.toLocaleString()} rows and ${MAX_COLS} columns of that sheet are read.`, "err");
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "", blankrows: false });
  const text = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "", blankrows: false });
  return { raw, text };
}
function readMeta(wb) {
  const ws = wb.Sheets["_meta"]; if (!ws) return null;
  const o = Object.create(null); for (const [k, v] of XLSX.utils.sheet_to_json(ws, { header: 1, raw: true })) if (k) o[k] = v;
  return o.app === "offline-pm" ? o : null;
}

function startImport() {
  const input = h("input", { type: "file", accept: ".xlsx,.xlsm,.xls,.csv,.txt", hidden: true });
  input.addEventListener("change", async () => {
    const file = input.files[0]; if (!file) return;
    try { await loadImportFile(file.name, await file.arrayBuffer()); }
    catch (e) { toast("Couldn't read that file: " + e.message, "err"); console.error(e); }
  });
  document.body.append(input); input.click(); setTimeout(() => input.remove(), 60000);
}

async function loadImportFile(name, buf) {
  const { wb, isCsv, encoding, date1904 } = readWorkbook({ name }, buf);
  const meta = readMeta(wb);
  const sheetName = meta && wb.Sheets.Tasks ? "Tasks" : wb.SheetNames.find(n => n !== "_meta") || wb.SheetNames[0];
  // Default to "update" only for an export of this same project from this same .db (ids mean nothing elsewhere).
  const sameFile = meta && +meta.project_id === M.projectId && meta.file_id && meta.file_id === scalar("SELECT value FROM meta WHERE key='file_id'");
  W = { fileName: name, wb, isCsv, encoding, sameFile: !!sameFile, updateConfirmed: false, date1904, meta, sheetName, risks: meta ? readRiskSheets(wb) : null, headerRow: 0, map: {}, hierarchy: "auto", predRef: "auto", dateOrder: "MDY", mode: sameFile ? "update" : "new", projectName: (meta?.project || name.replace(/\.[^.]+$/, "")), statusMap: Object.create(null), peopleMap: Object.create(null), step: 1 }; // keyed by file text: no prototype keys
  loadSheet();
  renderWizard();
}
function loadSheet() {
  const ws = W.wb.Sheets[W.sheetName];
  const { raw, text } = sheetRows(ws);
  W.allRaw = raw; W.allText = text;
  if (!W.headerRowTouched) { // header = first row with ≥2 non-empty cells
    const i = text.findIndex(r => r.filter(c => String(c).trim()).length >= 2); W.headerRow = Math.max(0, i);
  }
  applyHeaderRow();
}
function applyHeaderRow() {
  W.headers = (W.allText[W.headerRow] || []).map(x => String(x).trim());
  // Filter blank rows by index on both arrays together so raw and text rows stay aligned.
  const blank = r => !r || !r.some(c => String(c).trim() !== "");
  const keep = [];
  for (let i = W.headerRow + 1; i < Math.max(W.allRaw.length, W.allText.length); i++) if (!(blank(W.allText[i]) && blank(W.allRaw[i]))) keep.push(i);
  W.raw = keep.map(i => W.allRaw[i] || []); W.text = keep.map(i => W.allText[i] || []);
  W.rowNos = keep.map(i => i + 1);
  W.own = !!W.meta || ["ID", "WBS", "Outline Level", "Name"].every((c, i) => W.headers[i] === c); // our own export (xlsx or csv)
  W.signature = W.headers.map(normHdr).join("|");
  W.saved = one("SELECT * FROM import_map WHERE signature=?", [W.signature]);
  W.map = autoMap(W.headers);
  if (W.saved) {
    try {
      const cfg = JSON.parse(W.saved.config);
      W.map = {}; W.headers.forEach((hd, i) => { const k = Object.hasOwn(cfg.map, normHdr(hd)) && cfg.map[normHdr(hd)]; if (k) W.map[i] = k; });
      Object.assign(W, { hierarchy: cfg.hierarchy || "auto", predRef: cfg.predRef || "auto", dateOrder: cfg.dateOrder || W.dateOrder });
      W.statusMap = Object.assign(Object.create(null), cfg.statusMap);
    } catch { }
  } else W.dateOrder = guessDateOrder();
}
function colOf(key) { for (const [i, k] of Object.entries(W.map)) if (k === key) return +i; return -1; }
function guessDateOrder() {
  for (const key of ["start", "finish"]) {
    const c = colOf(key); if (c < 0) continue;
    for (const r of W.text) { const m = /^(\d{1,2})[/.-](\d{1,2})[/.-]\d{2,4}/.exec(String(r[c] || "").trim()); if (m) { if (+m[1] > 12) return "DMY"; if (+m[2] > 12) return "MDY"; } }
  }
  return "MDY";
}

// ---------- Build a plan from the sheet (pure: no DB writes) ----------
function cellDate(r, c) {
  const v = W.raw[r][c];
  if (v === "" || v == null) return { v: null };
  if (typeof v === "number") return { v: W.isCsv ? null : excelSerialToDay(v, W.date1904), bad: W.isCsv ? String(v) : null };
  if (v instanceof Date) return { v: dayOf(v.getFullYear(), v.getMonth(), v.getDate()) };
  const d = parseDateText(v, W.dateOrder);
  return d == null ? { v: null, bad: String(v) } : { v: d };
}
function resolveHierarchyMode() {
  if (W.hierarchy !== "auto") return W.hierarchy;
  const wc = colOf("wbs");
  if (wc >= 0) { const ok = W.text.filter(r => /^\d+(\.\d+)*\.?$/.test(String(r[wc]).trim())).length; if (ok >= W.text.length * 0.5) return "wbs"; }
  if (colOf("level") >= 0) return "level";
  if (colOf("parent") >= 0) return "parent";
  const nc = colOf("name");
  if (nc >= 0 && W.text.some(r => /^[ \t ]+\S/.test(String(r[nc])))) return "indent";
  return "flat";
}
function resolvePredRef() {
  if (W.predRef !== "auto") return W.predRef;
  if (W.own) return "wbs";
  const pc = colOf("pred"); if (pc < 0) return "wbs";
  const toks = W.text.flatMap(r => String(r[pc] || "").split(/[,;]+/).map(s => s.trim()).filter(Boolean));
  if (toks.some(t => /^\d+\.\d+/.test(t)) && colOf("wbs") >= 0) return "wbs";
  if (colOf("id") >= 0) return "id";
  return colOf("wbs") >= 0 ? "wbs" : "row";
}
function cmpWbs(a, b) { const x = a.split("."), y = b.split("."); for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (+(x[i] ?? -1)) - (+(y[i] ?? -1)); if (d) return d; } return 0; }

function buildPlan() {
  const errors = [], warnings = [];
  const nc = colOf("name");
  if (nc < 0) return { items: [], errors: ["Map a column to “Task name”."], warnings, mode: "flat" };
  const unguard = s => W.isCsv && /^'[=+\-@\t\r]/.test(s) ? s.slice(1) : s; // undo our CSV formula-injection guard (CSV only)
  const txt = (r, key) => { const c = colOf(key); return c < 0 ? "" : unguard(String(W.text[r][c] ?? "").trim()); };
  // A % column holding only plain numbers 0..1 is fractions (Excel "General" format); otherwise numbers are percents.
  const pcol = colOf("percent");
  const pnums = pcol < 0 ? [] : W.raw.map((r, i) => typeof r[pcol] === "number" && !String(W.text[i][pcol]).includes("%") ? r[pcol] : null).filter(v => v != null);
  const csvNums = pcol < 0 || !W.isCsv ? [] : W.text.map(r => String(r[pcol]).trim()).filter(s => /^\d+(\.\d+)?$/.test(s)).map(Number);
  const fracMode = [...pnums, ...csvNums].length > 0 && [...pnums, ...csvNums].every(v => v >= 0 && v <= 1);
  const typeMapped = colOf("type") >= 0;
  const items = [];
  for (let r = 0; r < W.text.length; r++) {
    const rawName = unguard(String(W.text[r][nc] ?? ""));
    const name = rawName.trim();
    const rowNo = W.rowNos[r];
    if (!name) { warnings.push(`Row ${rowNo}: no task name, skipped`); continue; }
    const it = { r, rowNo, name, rawName, key: items.length, parentKey: null, children: [] };
    it.srcId = txt(r, "id"); it.srcWbs = txt(r, "wbs").replace(/\.$/, ""); it.level = txt(r, "level"); it.srcParent = txt(r, "parent");
    // dates
    let s = null, f = null;
    for (const [key, set] of [["start", v => s = v], ["finish", v => f = v]]) {
      const c = colOf(key); if (c < 0) continue;
      const d = cellDate(r, c); if (d.bad) warnings.push(`Row ${it.rowNo}: couldn't read ${key} date “${d.bad}”`); set(d.v);
    }
    it.hasStart = s != null; it.hasFinish = f != null;
    const durTxt = txt(r, "duration"); const dur = durTxt ? parseDuration(durTxt) : null;
    if (durTxt && dur == null) warnings.push(`Row ${it.rowNo}: couldn't read duration “${durTxt}”`);
    it.hasDur = dur != null; it.dur = dur;
    const typeTxt = txt(r, "type").toLowerCase();
    // With a Type column, it alone decides; otherwise an explicit 0 duration means milestone.
    let milestone = typeMapped ? /milestone|^yes$|^true$|^y$|^1$|◆/.test(typeTxt) : dur === 0;
    it.typeGiven = typeMapped && !!typeTxt;
    if (s == null && f != null && dur != null && dur > 0) s = wdDay(wdIndex(f + 1) - dur);
    if (s != null && f == null) f = dur != null && dur > 0 ? finishFor(s, dur) : s;
    if (s == null && f != null) s = f;
    if (s != null && f != null && f < s) { warnings.push(`Row ${it.rowNo}: finish before start, finish set to start`); f = s; }
    if (milestone && s != null) f = s;
    Object.assign(it, { start: s, finish: f, kind: milestone ? "milestone" : "task" });
    const ptxt = txt(r, "percent"), praw = pcol >= 0 ? W.raw[r][pcol] : "";
    if (!ptxt) it.percent = null;
    else if (ptxt.includes("%")) it.percent = parsePercent(ptxt);
    else { const n = typeof praw === "number" ? praw : /^-?\d+(\.\d+)?$/.test(ptxt) ? +ptxt : NaN; it.percent = isNaN(n) ? null : clamp(Math.round(fracMode ? n * 100 : n), 0, 100); }
    if (ptxt && it.percent == null) warnings.push(`Row ${it.rowNo}: couldn't read % complete “${ptxt}”`);
    const st = txt(r, "status");
    it.statusGiven = !!st;
    it.status = st ? (W.statusMap[st] || STATUS_GUESS(st)) : it.percent === 100 ? "Done" : it.percent > 0 ? "In progress" : colOf("status") >= 0 ? "Not started" : null;
    if (it.status === "Done") it.percent = 100;
    else if (it.percent === 100 && it.status) it.status = "Done";
    it.code = txt(r, "code"); it.notes = colOf("notes") >= 0 ? unguard(String(W.text[r][colOf("notes")] ?? "")) : null;
    it.pred = txt(r, "pred");
    it.people = {}; for (const role of ROLES) if (colOf(role) >= 0) it.people[role] = splitNames(txt(r, role), W.own);
    items.push(it);
  }
  // hierarchy
  const mode = resolveHierarchyMode();
  const byKey = k => items[k];
  if (mode === "wbs") {
    const byWbs = new Map();
    for (const it of items) {
      if (!/^\d+(\.\d+)*$/.test(it.srcWbs)) { warnings.push(`Row ${it.rowNo}: WBS “${it.srcWbs}” isn't like 1.2.3; placed at top level`); it.sortWbs = null; continue; }
      if (byWbs.has(it.srcWbs)) warnings.push(`Row ${it.rowNo}: duplicate WBS ${it.srcWbs}`); else byWbs.set(it.srcWbs, it);
      it.sortWbs = it.srcWbs;
    }
    for (const it of items) {
      if (!it.sortWbs) continue;
      let p = it.sortWbs.split(".").slice(0, -1);
      let missing = false;
      while (p.length && !byWbs.has(p.join("."))) { p = p.slice(0, -1); missing = true; }
      if (missing) warnings.push(`Row ${it.rowNo}: parent of WBS ${it.sortWbs} not found; attached to ${p.length ? p.join(".") : "top level"}`);
      if (p.length) it.parentKey = byWbs.get(p.join(".")).key;
    }
  } else if (mode === "level" || mode === "indent") {
    let levels;
    if (mode === "level") {
      levels = items.map(it => { const n = parseInt(it.level, 10); if (isNaN(n)) warnings.push(`Row ${it.rowNo}: outline level “${it.level}” isn't a number; using 1`); return isNaN(n) ? 1 : n; });
      const min = Math.min(...levels); if (min < 1) levels = levels.map(l => l - min + 1);
    } else {
      const ind = items.map(it => (/^[ \t ]*/.exec(it.rawName)[0].replace(/\t/g, "    ")).length);
      const unit = Math.min(...ind.filter(x => x > 0)) || 1;
      levels = ind.map(x => Math.round(x / unit) + 1);
    }
    const stack = [];
    items.forEach((it, i) => {
      let lv = levels[i];
      if (lv > stack.length + 1) { warnings.push(`Row ${it.rowNo}: jumps from level ${stack.length} to ${lv}; attached one level down`); lv = stack.length + 1; }
      stack.length = lv - 1;
      it.parentKey = stack.length ? stack[stack.length - 1].key : null;
      stack.push(it);
    });
  } else if (mode === "parent") {
    const byId = new Map(), byName = new Map();
    for (const it of items) { if (it.srcId) byId.set(it.srcId, it); if (!byName.has(it.name.toLowerCase())) byName.set(it.name.toLowerCase(), it); }
    for (const it of items) {
      if (!it.srcParent) continue;
      const p = byId.get(it.srcParent) || byName.get(it.srcParent.toLowerCase());
      if (!p || p === it) { warnings.push(`Row ${it.rowNo}: parent “${it.srcParent}” not found; placed at top level`); continue; }
      it.parentKey = p.key;
    }
    for (const it of items) { // break cycles
      const seen = new Set([it.key]);
      for (let x = it; x.parentKey != null; x = byKey(x.parentKey)) {
        if (seen.has(x.parentKey)) { warnings.push(`Row ${it.rowNo}: circular parent chain; placed at top level`); it.parentKey = null; break; }
        seen.add(x.parentKey);
      }
    }
  }
  // order: children in file order, or by WBS when rebuilding from WBS
  const roots = [];
  for (const it of items) (it.parentKey != null ? byKey(it.parentKey).children : roots).push(it);
  if (mode === "wbs") { const srt = l => { l.sort((a, b) => a.sortWbs && b.sortWbs ? cmpWbs(a.sortWbs, b.sortWbs) : a.sortWbs ? -1 : b.sortWbs ? 1 : a.r - b.r); l.forEach(x => srt(x.children)); }; srt(roots); }
  const ordered = []; const walk = (l, depth, prefix) => l.forEach((it, i) => { it.depth = depth; it.newWbs = prefix + (i + 1); ordered.push(it); walk(it.children, depth + 1, it.newWbs + "."); });
  walk(roots, 0, "");
  if (!items.length) errors.push("No rows with a task name were found.");
  const plan = { items: ordered, roots, errors, warnings, mode, predMode: resolvePredRef() };
  if (colOf("pred") >= 0) resolvePreds(plan);
  return plan;
}
// Resolve each row's predecessor tokens against the sheet now, so the preview lists the ones that won't work.
// A row with an unresolved token keeps its existing links in update mode (see applyPlan).
const PRED_TOKEN = /^#?(.+?)\s*(FS|SS|FF|SF)?\s*(?:([+-])\s*(\d+(?:\.\d+)?)\s*(d|days?|w|wks?|weeks?|ed|edays?|h|hrs?)?)?$/i;
function resolvePreds(plan) {
  const ref = new Map();
  for (const it of plan.items) {
    if (plan.predMode === "wbs" && it.srcWbs) ref.set(it.srcWbs, it);
    if (plan.predMode === "id" && it.srcId) ref.set(it.srcId, it);
    if (plan.predMode === "row") ref.set(String(it.r + 1), it);
  }
  for (const it of plan.items) {
    it.predLinks = []; it.predBad = false;
    for (const tok of String(it.pred || "").split(/[,;]+/).map(s => s.trim()).filter(Boolean)) {
      const m = PRED_TOKEN.exec(tok), target = m && ref.get(m[1].trim().replace(/\.$/, ""));
      if (!target || target === it) { it.predBad = true; plan.warnings.push(`Row ${it.rowNo}: predecessor “${tok}” not found${W.mode === "update" ? "; this row's existing links are kept" : ""}`); continue; }
      let lag = m[4] ? parseFloat(m[4]) : 0; if (m[5] && /^w/i.test(m[5])) lag *= 5; if (m[5] && /^h/i.test(m[5])) lag /= 8; if (m[3] === "-") lag = -lag;
      it.predLinks.push({ tok, target, type: (m[2] || "FS").toUpperCase(), lag: Math.round(lag) });
    }
  }
}

// People names → actions. Returns Map(lowerName → {name, kind, action, partyId})
function collectPeople(plan) {
  const out = new Map();
  const extra = W.meta ? metaParties() : [];
  const parse = raw => { const m = /^(team|user|person)\s*:\s*(.+)$/i.exec(raw); return { kind: m ? (m[1].toLowerCase() === "team" ? "team" : "person") : null, name: (m ? m[2] : raw).trim() }; };
  const sources = [...plan.items.map(it => it.people), ...(W.risks ? [...W.risks.risks, ...W.risks.mits] : [])]; // { R: [...], A: [...] }
  const prefixed = new Map(); // name → kind, when the file uses a team:/user: prefix somewhere
  for (const src of sources) for (const role of ROLES) for (const raw of src[role] || []) { const p = parse(raw); if (p.kind) prefixed.set(p.name.toLowerCase(), p.kind); }
  W.prefixed = prefixed;
  for (const src of sources) for (const role of ROLES) for (const raw of src[role] || []) {
    const pr = parse(raw);
    const kind = pr.kind || prefixed.get(pr.name.toLowerCase()) || null;
    const name = pr.name; const key = (kind ? kind + ":" : "") + name.toLowerCase();
    if (out.has(key)) continue;
    const existing = [...M.parties.values()].find(p => (p.name.toLowerCase() === name.toLowerCase() || (p.email && p.email.toLowerCase() === name.toLowerCase())) && (!kind || p.kind === kind));
    const fromSheet = extra.find(p => p.name.toLowerCase() === name.toLowerCase() && (!kind || p.kind === kind));
    const saved = Object.hasOwn(W.peopleMap, key) ? W.peopleMap[key] : null;
    out.set(key, { name, kind: kind || fromSheet?.kind || "person", action: saved || (existing ? "map:" + existing.id : (kind || fromSheet?.kind) === "team" ? "team" : "person") });
  }
  return out;
}
function metaParties() { // People sheet of our own xlsx export only
  const ws = W.meta && W.wb.Sheets.People; if (!ws) return [];
  return XLSX.utils.sheet_to_json(ws, { defval: "" }).map(r => ({ name: String(r.Name || "").trim(), kind: String(r.Kind || "person").toLowerCase() === "team" ? "team" : "person", email: r.Email || "", title: r.Title || "", active: !/^(no|false|0)$/i.test(String(r.Active)), members: splitNames(r.Members, true) })).filter(p => p.name);
}
// Dates for an updated task: only what the sheet provides changes; the rest keeps the task's current values.
function updatedDates(it, ex) {
  const es = parseYMD(ex.start), ef = parseYMD(ex.finish);
  const exDur = es != null && ef != null ? Math.max(1, workdays(es, ef)) : 1;
  let s = es, f = ef, kind = ex.kind;
  if (it.typeGiven) kind = it.kind;
  else if (it.hasDur) kind = it.dur === 0 ? "milestone" : "task";
  const d = it.hasDur && it.dur > 0 ? it.dur : exDur;
  if (it.hasStart && it.hasFinish) { s = it.start; f = it.finish; }
  else if (it.hasStart) { s = it.start; f = finishFor(s, d); }
  else if (it.hasFinish) { f = it.finish; if (it.hasDur && it.dur > 0) s = wdDay(wdIndex(f + 1) - it.dur); else if (s == null || s > f) s = f; }
  else if (it.hasDur && it.dur > 0 && s != null) f = finishFor(s, it.dur);
  if (kind === "milestone" && s != null) f = s;
  return { start: fmtYMD(s) || null, finish: fmtYMD(f) || null, kind };
}

// ---------- Apply (inside mutate) ----------
function applyPlan(plan, people) {
  const report = { added: 0, updated: 0, deps: 0, people: 0, warnings: [] };
  let pid = M.projectId;
  if (W.mode === "new") pid = opAddProject(W.projectName || "Imported plan");
  // parties. Names match case-insensitively in JS (SQLite's lower() only folds ASCII, so "Élodie" would duplicate).
  const partyId = new Map(); // "kind:lower name" → id
  for (const p of q("SELECT id, kind, name FROM party")) if (!partyId.has(p.kind + ":" + p.name.toLowerCase())) partyId.set(p.kind + ":" + p.name.toLowerCase(), p.id);
  const decision = (name, kind) => people.get(kind + ":" + name.toLowerCase()) || people.get(name.toLowerCase()); // step-3 choice, if the name is used
  for (const p of metaParties()) {
    const key = p.kind + ":" + p.name.toLowerCase(), d = decision(p.name, p.kind);
    if (d && d.action === "ignore") continue; // step 3 wins over the People sheet
    if (d && d.action.startsWith("map:")) { partyId.set(key, +d.action.slice(4)); continue; }
    if (partyId.has(key)) continue;
    const id = opAddParty(p.kind, p.name, p); if (!p.active) opUpdateParty(id, { active: false }); report.people++;
    partyId.set(key, id);
  }
  // Team members from the People sheet; a person stays on one team (DECISIONS #60).
  for (const p of metaParties()) if (p.kind === "team" && p.members.length) {
    const tid = partyId.get("team:" + p.name.toLowerCase()); if (!tid) continue;
    for (const m of p.members) {
      const mid = partyId.get("person:" + m.toLowerCase()); if (!mid) continue;
      const cur = scalar("SELECT team_id FROM team_member WHERE person_id=? LIMIT 1", [mid]);
      if (cur == null) run("INSERT INTO team_member VALUES (?,?)", [tid, mid]);
      else if (cur !== tid) report.warnings.push(`${m} is already on team “${scalar("SELECT name FROM party WHERE id=?", [cur])}”, so wasn't added to “${p.name}”`);
    }
  }
  const resolved = new Map();
  for (const [key, v] of people) {
    if (v.action === "ignore") continue;
    if (v.action.startsWith("map:")) { resolved.set(key, +v.action.slice(4)); continue; }
    const known = partyId.get(v.action + ":" + v.name.toLowerCase());
    if (known) { resolved.set(key, known); continue; }
    const id = opAddParty(v.action, v.name); partyId.set(v.action + ":" + v.name.toLowerCase(), id);
    resolved.set(key, id); report.people++;
  }
  const lookupParty = raw => { const m = /^(team|user|person)\s*:\s*(.+)$/i.exec(raw); const name = (m ? m[2] : raw).trim(); const kind = m ? (m[1].toLowerCase() === "team" ? "team" : "person") : (W.prefixed?.get(name.toLowerCase()) || null); return resolved.get((kind ? kind + ":" : "") + name.toLowerCase()); };

  // tasks
  const existing = W.mode === "update" ? new Map(q("SELECT id FROM task WHERE project_id=?", [pid]).map(r => [String(r.id), r.id])) : new Map();
  const { match: matches } = W.mode === "update" ? updateMatches(plan, existing) : { match: new Map() };
  const nextPos = new Map(); const posFor = parent => { if (!nextPos.has(parent)) nextPos.set(parent, scalar("SELECT COALESCE(MAX(position)+1,0) FROM task WHERE project_id=? AND parent_id IS ?", [pid, parent])); const p = nextPos.get(parent); nextPos.set(parent, p + 1); return p; };
  const mapped = k => colOf(k) >= 0;
  for (const it of plan.items) {
    const match = matches.get(it);
    if (match) {
      it.taskId = match;
      const cols = { name: it.name };
      if (it.hasStart || it.hasFinish || it.hasDur || it.typeGiven) Object.assign(cols, updatedDates(it, one("SELECT start, finish, kind FROM task WHERE id=?", [match])));
      if (mapped("code")) cols.code = it.code;
      if (mapped("notes")) cols.notes = it.notes ?? "";
      const keys = Object.keys(cols);
      run(`UPDATE task SET ${keys.map(k => k + "=?").join(", ")}, updated_at=? WHERE id=?`, [...keys.map(k => cols[k]), nowIso(), match]);
      // status/percent go through the normal edit rules so they stay in sync (DECISIONS #8)
      if (!hasChildren(match)) {
        if (it.statusGiven) opSetField(match, "status", it.status);
        if (it.percent != null) opSetField(match, "percent", it.percent);
      }
      report.updated++;
    } else {
      const parent = it.parentKey != null ? plan.items.find(x => x.key === it.parentKey)?.taskId ?? null : null;
      run("INSERT INTO task(project_id, parent_id, position, name, kind, start, finish, percent, status, code, notes, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
        [pid, parent, posFor(parent), it.name, it.kind, fmtYMD(it.start) || null, fmtYMD(it.finish) || null, it.percent ?? 0, it.status || "Not started", it.code || "", it.notes || "", nowIso(), nowIso()]);
      it.taskId = lastId(); report.added++;
    }
    // RACI: later roles win when one party appears twice (A strongest).
    const roleCols = ["I", "C", "R", "A"].filter(r => it.people[r]);
    if (match) for (const role of roleCols) run("DELETE FROM raci WHERE task_id=? AND role=?", [it.taskId, role]);
    if (match && it.people.R) run("UPDATE task SET r_is_a=0 WHERE id=?", [it.taskId]);
    // Export writes the Accountable into Responsible for "same as Accountable" tasks, so an R that equals the
    // task's own A turns the switch back on instead of becoming R rows (DECISIONS #48). An R equal to an inherited
    // A stays as R rows: the sheet can't tell that apart from naming the same person on purpose.
    const ids = role => [...new Set((it.people[role] || []).map(lookupParty).filter(Boolean))].sort((x, y) => x - y);
    const rIds = ids("R"), aIds = ids("A");
    const rIsA = rIds.length > 0 && rIds.join() === aIds.join();
    for (const role of roleCols) if (!(role === "R" && rIsA)) for (const raw of it.people[role]) { const p = lookupParty(raw); if (p) opSetRole(it.taskId, p, role); }
    if (rIsA) opSetRIsA(it.taskId, true);
  }
  // dependencies
  if (mapped("pred")) {
    if (!plan.items.every(it => it.predLinks)) resolvePreds(plan);
    // Update mode replaces only links between tasks that are both in the sheet; links from rows a teammate removed survive,
    // and so do those of a row with a predecessor that can't be found. They all go first, so a link reversed in the
    // sheet doesn't trip over the old one.
    if (W.mode === "update") {
      const inSheet = JSON.stringify(plan.items.map(i => i.taskId)), matched = JSON.stringify(plan.items.filter(i => existing.has(String(i.taskId)) && !i.predBad).map(i => i.taskId));
      run("DELETE FROM dep WHERE succ_id IN (SELECT value FROM json_each(?)) AND pred_id IN (SELECT value FROM json_each(?))", [matched, inSheet]);
    }
    for (const it of plan.items) for (const l of it.predLinks) {
      try { opAddDep(l.target.taskId, it.taskId, l.type, l.lag); report.deps++; }
      catch (e) { report.warnings.push(`Row ${it.rowNo}: link from “${l.tok}” skipped (${e.message})`); }
    }
  }
  if (W.risks) applyRisks(pid, plan, lookupParty, report);
  // remember mapping
  const cfg = { map: Object.fromEntries(Object.entries(W.map).map(([i, k]) => [normHdr(W.headers[i]), k])), hierarchy: W.hierarchy, predRef: W.predRef, dateOrder: W.dateOrder, statusMap: W.statusMap };
  run("INSERT OR REPLACE INTO import_map(signature, config, updated_at) VALUES (?,?,?)", [W.signature, JSON.stringify(cfg), nowIso()]);
  report.projectId = pid;
  return report;
}

// ---------- Wizard UI ----------
function renderWizard() {
  const steps = ["1 File", "2 Columns", "3 Values", "4 Preview"];
  const stepBar = h("div", { class: "steps" }, ...steps.map((s, i) => h("span", { class: i + 1 === W.step ? "on" : "" }, s + (i < 3 ? "  ›" : ""))));
  const body = h("div", { class: "modal-b" });
  const foot = h("div", { class: "modal-f" }, stepBar, h("span", { class: "spacer" }));
  const back = h("button", { onclick: () => { W.step--; renderWizard(); } }, "Back");
  const next = h("button", { class: "primary", onclick: () => { W.step++; renderWizard(); } }, "Next");
  if (W.step === 1) {
    const sheets = h("select", {}, ...W.wb.SheetNames.map(n => h("option", { selected: n === W.sheetName }, n)));
    sheets.addEventListener("change", () => { W.sheetName = sheets.value; W.headerRowTouched = false; loadSheet(); renderWizard(); });
    const hdr = h("input", { type: "number", min: 1, value: W.headerRow + 1, style: { width: "80px" } });
    hdr.addEventListener("change", () => { W.headerRow = clamp(+hdr.value - 1, 0, Math.max(0, W.allText.length - 1)); W.headerRowTouched = true; applyHeaderRow(); renderWizard(); });
    body.append(h("p", {}, `File: `, h("b", {}, W.fileName), ` · ${W.raw.length} data rows`),
      W.meta ? h("div", { class: "msg ok" }, "This is an export from Offline PM. Columns, hierarchy and people will be matched automatically.") : "",
      h("div", { class: "opts" }, h("label", {}, "Sheet", sheets), h("label", {}, "Header row number", hdr)),
      h("h4", {}, "First rows"), previewTable([W.headers, ...W.text.slice(0, 8)], true));
    foot.append(h("button", { onclick: closeModal }, "Cancel"), next);
  } else if (W.step === 2) {
    if (W.saved) body.append(h("div", { class: "msg ok" }, `Using the mapping you saved for these columns on ${W.saved.updated_at}.`));
    const tb = h("table", { class: "map" }, h("tr", {}, h("th", {}, "Column in your file"), h("th", {}, "Sample values"), h("th", {}, "Import as")));
    W.headers.forEach((hd, i) => {
      const sel = h("select", {}, h("option", { value: "" }, "— don't import —"), ...IMPORT_FIELDS.map(f => h("option", { value: f.key, selected: W.map[i] === f.key }, f.label + (f.required ? " *" : ""))));
      sel.addEventListener("change", () => {
        for (const [j, k] of Object.entries(W.map)) if (k === sel.value && +j !== i) delete W.map[j];
        if (sel.value) W.map[i] = sel.value; else delete W.map[i];
        renderWizard();
      });
      const samples = W.text.slice(0, 4).map(r => String(r[i] ?? "")).filter(Boolean).join(" · ");
      tb.append(h("tr", {}, h("td", {}, hd || h("i", { class: "hint" }, `(column ${i + 1})`)), h("td", { class: "sample", title: samples }, samples), h("td", {}, sel)));
    });
    const hier = h("select", {}, ...[["auto", `Auto (detected: ${resolveHierarchyMode()})`], ["wbs", "From WBS numbers (1.2.3)"], ["level", "From Outline level"], ["parent", "From Parent column"], ["indent", "From name indentation"], ["flat", "Flat list (no hierarchy)"]].map(([v, l]) => h("option", { value: v, selected: W.hierarchy === v }, l)));
    hier.addEventListener("change", () => { W.hierarchy = hier.value; renderWizard(); });
    const pref = h("select", {}, ...[["auto", `Auto (detected: ${resolvePredRef()})`], ["wbs", "WBS numbers"], ["id", "ID column values"], ["row", "Row numbers (1 = first data row)"]].map(([v, l]) => h("option", { value: v, selected: W.predRef === v }, l)));
    pref.addEventListener("change", () => { W.predRef = pref.value; renderWizard(); });
    const dord = h("select", {}, h("option", { value: "MDY", selected: W.dateOrder === "MDY" }, "Month/Day/Year (03/14/2026)"), h("option", { value: "DMY", selected: W.dateOrder === "DMY" }, "Day/Month/Year (14/03/2026)"));
    dord.addEventListener("change", () => { W.dateOrder = dord.value; });
    body.append(tb, h("div", { class: "opts" }, h("label", {}, "Build hierarchy", hier), h("label", {}, "Predecessors refer to", pref), h("label", {}, "Text dates are written as", dord)));
    if (colOf("name") < 0) { body.prepend(h("div", { class: "msg err" }, "Choose which column holds the task name.")); next.disabled = true; }
    foot.append(back, next);
  } else if (W.step === 3) {
    const plan = buildPlan();
    const sc = colOf("status");
    if (sc >= 0) {
      const vals = [...new Set(W.text.map(r => String(r[sc] ?? "").trim()).filter(Boolean))];
      body.append(h("h4", { style: { margin: "0 0 6px" } }, "Status values"));
      const tb = h("table", { class: "map" }, h("tr", {}, h("th", {}, "In your file"), h("th", {}, "Becomes")));
      for (const v of vals) {
        if (!Object.hasOwn(W.statusMap, v)) W.statusMap[v] = STATUS_GUESS(v);
        const sel = h("select", {}, ...STATUSES.map(s => h("option", { selected: W.statusMap[v] === s }, s)));
        sel.addEventListener("change", () => W.statusMap[v] = sel.value);
        tb.append(h("tr", {}, h("td", {}, v), h("td", {}, sel)));
      }
      body.append(tb);
    }
    const people = collectPeople(plan);
    if (people.size) {
      body.append(h("h4", { style: { margin: "16px 0 6px" } }, "People and teams"));
      const tb = h("table", { class: "map" }, h("tr", {}, h("th", {}, "Name in your file"), h("th", {}, "Match to")));
      for (const [key, v] of people) {
        const sel = h("select", {},
          h("option", { value: "person", selected: v.action === "person" }, "Create new person"),
          h("option", { value: "team", selected: v.action === "team" }, "Create new team"),
          ...[...M.people, ...M.teams].map(p => h("option", { value: "map:" + p.id, selected: v.action === "map:" + p.id }, `${p.kind === "team" ? "Team" : "Person"}: ${p.name}`)),
          h("option", { value: "ignore", selected: v.action === "ignore" }, "Ignore"));
        sel.addEventListener("change", () => W.peopleMap[key] = sel.value);
        tb.append(h("tr", {}, h("td", {}, v.name), h("td", {}, sel)));
      }
      body.append(tb);
    }
    if (sc < 0 && !people.size) body.append(h("p", { class: "hint" }, "Nothing to match: no Status or people columns were mapped."));
    foot.append(back, next);
  } else {
    const plan = buildPlan();
    W.plan = plan;
    const mode = h("select", {}, h("option", { value: "new", selected: W.mode === "new" }, "Create a new project"), h("option", { value: "append", selected: W.mode === "append" }, `Add to “${M.projects.find(p => p.id === M.projectId)?.name}”`), h("option", { value: "update", selected: W.mode === "update" }, "Update current project (match by ID column)"));
    const pname = h("input", { value: W.projectName });
    mode.addEventListener("change", () => { W.mode = mode.value; renderWizard(); });
    pname.addEventListener("input", () => W.projectName = pname.value);
    body.append(h("div", { class: "opts" }, h("label", {}, "Import into", mode), W.mode === "new" ? h("label", {}, "New project name", pname) : h("span")));
    if (W.encoding === "windows-1252") body.append(h("div", { class: "msg" }, "This CSV isn't UTF-8, so it was read as Windows-1252 (Excel's plain “CSV (Comma delimited)”). Check that accented names look right below."));
    let needConfirm = false;
    if (W.mode === "update") {
      const { match, dupRows } = updateMatches(plan, new Map(M.order.map(t => [String(t.id), t.id])));
      const n = match.size;
      body.append(h("div", { class: colOf("id") < 0 ? "msg err" : "msg" }, colOf("id") < 0 ? "Map an ID column to update existing tasks." : `${n} rows match existing tasks and will be updated; ${plan.items.length - n} new rows will be added. Hierarchy of existing tasks isn't changed.`));
      if (dupRows.length) body.append(h("div", { class: "msg warn" }, `${dupRows.length === 1 ? "Row" : "Rows"} ${dupRows.slice(0, 20).join(", ")}${dupRows.length > 20 ? "…" : ""} repeat an ID used by an earlier row, so they'll be added as new tasks instead of overwriting it.`));
      // Task ids restart at 1 in every file, so updating from another file's sheet overwrites unrelated tasks (DECISIONS #31).
      if (!W.sameFile && colOf("id") >= 0) {
        needConfirm = !W.updateConfirmed;
        const cb = h("input", { type: "checkbox", checked: W.updateConfirmed });
        cb.addEventListener("change", () => { W.updateConfirmed = cb.checked; renderWizard(); });
        body.append(h("div", { class: "msg err" }, W.isCsv ? "A CSV doesn't record which plan it came from. " : "This workbook wasn't exported from this plan file and project. ",
          "IDs only mean something in the plan they came from: in any other plan they'd overwrite unrelated tasks. ",
          h("label", { style: { display: "block", marginTop: "6px", fontWeight: 600 } }, cb, " This sheet came from this project: update tasks by ID anyway")));
      }
    }
    for (const e of plan.errors) body.append(h("div", { class: "msg err" }, e));
    body.append(h("p", {}, `${plan.items.length} tasks · hierarchy from `, h("b", {}, plan.mode), colOf("pred") >= 0 ? ` · predecessors by ${plan.predMode}` : ""));
    if (W.risks) body.append(h("p", {}, riskPreviewText()));
    const warns = [...plan.warnings, ...(W.risks?.warnings || [])];
    if (warns.length) {
      const det = h("details", {}, h("summary", { class: "msg warn" }, `${warns.length} warning${warns.length > 1 ? "s" : ""} (rows still import)`), h("ul", {}, ...warns.slice(0, 200).map(w => h("li", {}, w))));
      body.append(det);
    }
    const rows = [["WBS", "Task", "Start", "Finish", "Status", "%", "R", "A"]];
    for (const it of plan.items.slice(0, 400)) rows.push([it.newWbs, "  ".repeat(it.depth) + (it.kind === "milestone" ? "◆ " : "") + it.name, fmtYMD(it.start), fmtYMD(it.finish), it.status || "", it.percent ?? "", (it.people.R || []).join(", "), (it.people.A || []).join(", ")]);
    body.append(previewTable(rows, true));
    if (plan.items.length > 400) body.append(h("p", { class: "hint" }, `…and ${plan.items.length - 400} more.`));
    const go = h("button", { class: "primary", disabled: !!plan.errors.length || needConfirm || (W.mode === "update" && colOf("id") < 0), onclick: () => doImport() }, `Import ${plan.items.length} tasks`);
    foot.append(back, go);
  }
  const keep = W._lastStep === W.step ? $("modal").querySelector(".modal-b")?.scrollTop : 0;
  openModal("Import from Excel / CSV", body, foot);
  W._lastStep = W.step; if (keep) body.scrollTop = keep;
}
function previewTable(rows, header) {
  const t = h("table");
  rows.forEach((r, i) => t.append(h("tr", {}, ...r.map(c => h(i === 0 && header ? "th" : "td", {}, String(c ?? ""))))));
  return h("div", { class: "preview" }, t);
}
function doImport() {
  const plan = W.plan || buildPlan();
  const people = collectPeople(plan);
  let report;
  const ok = mutate(`Imported ${W.fileName} (${plan.items.length} rows)`, () => { report = applyPlan(plan, people); });
  if (!ok) return;
  closeModal();
  if (report.projectId !== M.projectId) switchProject(report.projectId);
  const warn = plan.warnings.length + (W.risks?.warnings.length || 0) + report.warnings.length, rk = report.risks;
  toast(`Imported: ${report.added} added, ${report.updated} updated, ${report.deps} links${rk ? `, ${rk.added + rk.updated} risks, ${rk.mitAdded + rk.mitUpdated} mitigants` : ""}${report.people ? `, ${report.people} people/teams created` : ""}${warn ? ` · ${warn} warnings` : ""}`);
  if (report.warnings.length) logInfo("Import warnings: " + report.warnings.slice(0, 20).join(" | "));
  return report;
}

// ---------- Export ----------
const EXPORT_COLS = ["ID", "WBS", "Outline Level", "Name", "Type", "Start", "Finish", "Duration", "% Complete", "Status", "Predecessors", "Responsible", "Accountable", "Consulted", "Informed", "Code", "Notes"];
function partyLabel(id) {
  const p = M.parties.get(id); if (!p) return "";
  const clash = [...M.parties.values()].some(o => o.id !== id && o.name.toLowerCase() === p.name.toLowerCase());
  return clash ? `${p.kind === "team" ? "team" : "user"}:${p.name}` : p.name;
}
function exportWorkbook() {
  const aoa = [EXPORT_COLS];
  const dateCells = [];
  for (const t of M.order) {
    const names = role => (role === "R" ? responsible(t).list : rolesOf(t.id, role)).map(r => partyLabel(r.party_id)).join("; ");
    const r = aoa.length;
    aoa.push([t.id, t.wbs, t.depth + 1, t.name, t.isSummary ? "Summary" : t.isMilestone ? "Milestone" : "Task", "", "", t.dur == null ? "" : t.dur + "d", t.P / 100, t.ST, predText(t), names("R"), names("A"), names("C"), names("I"), t.code || "", t.notes || ""]);
    if (t.S != null) dateCells.push([r, 5, t.S]); if (t.F != null) dateCells.push([r, 6, t.F]);
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  for (const [r, c, d] of dateCells) ws[XLSX.utils.encode_cell({ r, c })] = { t: "n", v: d + 25569, z: "yyyy-mm-dd" };
  for (let r = 1; r < aoa.length; r++) { const ref = XLSX.utils.encode_cell({ r, c: 8 }); if (ws[ref]) ws[ref].z = "0%"; }
  ws["!cols"] = [6, 8, 6, 40, 10, 11, 11, 8, 9, 12, 16, 22, 18, 18, 18, 10, 40].map(w => ({ wch: w }));
  ws["!autofilter"] = { ref: ws["!ref"] };
  const people = [["Name", "Kind", "Email", "Title", "Active", "Members"]];
  for (const p of [...M.people, ...M.teams]) people.push([p.name, p.kind, p.email, p.title, p.active ? "Yes" : "No", p.kind === "team" ? (M.members.get(p.id) || []).map(partyName).join("; ") : ""]);
  const proj = M.projects.find(p => p.id === M.projectId);
  const meta = [["app", "offline-pm"], ["schema", SCHEMA_VERSION], ["project", proj?.name || ""], ["project_id", M.projectId], ["file_id", scalar("SELECT value FROM meta WHERE key='file_id'")], ["exported", nowIso()]];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Tasks");
  const pws = XLSX.utils.aoa_to_sheet(people); pws["!cols"] = [24, 8, 26, 20, 7, 40].map(w => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, pws, "People");
  // Work notes travel as a read-only sheet; import ignores it (DECISIONS #42).
  const notes = [["Task ID", "WBS", "Task", "Created", "Edited", "Note"]];
  const localTs = iso => { if (!iso) return ""; const d = new Date(iso); return isNaN(d) ? iso : `${fmtYMD(Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY))} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
  for (const t of M.order) for (const n of notesFor(t.id).reverse()) notes.push([t.id, t.wbs, t.name, localTs(n.created_at), localTs(n.updated_at), n.body]);
  const nws = XLSX.utils.aoa_to_sheet(notes); nws["!cols"] = [7, 8, 32, 16, 16, 80].map(w => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, nws, "Notes");
  if (M.risks.length) {
    const { risks, mits } = riskSheets();
    XLSX.utils.book_append_sheet(wb, risks, "Risk register"); XLSX.utils.book_append_sheet(wb, mits, "Mitigants");
    XLSX.utils.book_append_sheet(wb, closeoutSheet(), "Risk closeout"); // the report, for reading; import ignores it
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(meta), "_meta");
  return wb;
}
// ---------- Risks in the plan workbook (DECISIONS #73) ----------
// Two sheets meant for loading back: one row per risk, and one per mitigant with its risk's ID and its tasks' IDs.
// People are written the way the Tasks sheet writes them: an own Accountable, and the Accountable in Responsible
// when "same as Accountable" is on.
const RISK_COLS = ["ID", "Risk", "Description", "Mitigation plan", "Response", "Reason accepted", "Probability", "Impact", "Accountable", "Responsible"];
const MIT_COLS = ["ID", "Risk ID", "Mitigant", "Control", "Status", "Tasks", "Accountable", "Responsible", "Testing", "Handed to"];
function riskSheets() {
  const names = list => list.map(p => partyLabel(p.party_id)).join("; ");
  const lmh = v => v ? LMH[v] : "";
  const risks = [RISK_COLS], mits = [MIT_COLS];
  for (const r of M.risks) {
    risks.push([r.id, r.name, r.description, r.plan, r.response === "accept" ? "Accept" : "Mitigate", r.accept_reason, lmh(r.probability), lmh(r.impact), names(recRoles(r, "A")), names(recResponsible(r).list)]);
    // Status is the one set by hand: with tasks linked, the tasks decide it (DECISIONS #53), so it's blank or Tested.
    for (const x of r.mitigants) mits.push([x.id, r.id, x.text, x.is_control ? "Yes" : "No", x.status, x.tasks.map(t => t.id).join(", "), names(recRoles(x, "A")), names(recResponsible(x).list), x.testing, x.handed_to]);
  }
  const rws = XLSX.utils.aoa_to_sheet(risks); rws["!cols"] = [6, 34, 40, 40, 10, 30, 11, 9, 20, 20].map(w => ({ wch: w }));
  const mws = XLSX.utils.aoa_to_sheet(mits); mws["!cols"] = [6, 7, 44, 8, 12, 14, 20, 20, 30, 20].map(w => ({ wch: w }));
  return { risks: rws, mits: mws };
}
// Reads them back from our own export (pure: no DB writes). A missing column means "leave it as it is".
function readRiskSheets(wb) {
  const rs = wb.Sheets["Risk register"]; if (!rs) return null;
  const warnings = [];
  const rowsOf = (ws, label) => {
    if (!ws) return [];
    trimRange(ws);
    const all = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "", blankrows: true });
    const hd = (all[0] || []).map(x => String(x).trim());
    const out = [];
    all.slice(1).forEach((r, i) => {
      if (!r.some(c => String(c).trim())) return;
      out.push({ where: `${label} row ${i + 2}`, get: k => { const c = hd.indexOf(k); return c < 0 ? undefined : String(r[c] ?? "").trim(); } });
    });
    return { rows: out, has: k => hd.includes(k) };
  };
  const given = o => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
  const ppl = v => v === undefined ? undefined : splitNames(v, true);
  const lmh = (row, k) => { const v = row.get(k); if (v === undefined || v === "") return v; const x = toLMH(v); if (!x) warnings.push(`${row.where}: ${k} “${v}” isn't Low, Medium or High, so it's left as it is`); return x || undefined; };
  const R = rowsOf(rs, "Risk register");
  if (!R.has("Risk")) return { risks: [], mits: [], warnings: ["The Risk register sheet has no Risk column, so no risks are imported"] };
  const risks = [];
  for (const row of R.rows) {
    const name = row.get("Risk");
    if (!name) { warnings.push(`${row.where}: no risk name, so it's skipped`); continue; }
    let response = row.get("Response");
    if (response !== undefined) { const s = response.toLowerCase(); response = /^acc/.test(s) ? "accept" : /^mit/.test(s) || !s ? "mitigate" : (warnings.push(`${row.where}: response “${response}” isn't Accept or Mitigate, so it's left as it is`), undefined); }
    risks.push({ where: row.where, srcId: idKey(row.get("ID")), A: ppl(row.get("Accountable")), R: ppl(row.get("Responsible")),
      f: given({ name, description: row.get("Description"), plan: row.get("Mitigation plan"), response, accept_reason: row.get("Reason accepted"), probability: lmh(row, "Probability"), impact: lmh(row, "Impact") }) });
  }
  const mits = [];
  const MS = rowsOf(wb.Sheets.Mitigants, "Mitigants");
  if (MS.rows) for (const row of MS.rows) {
    const text = row.get("Mitigant");
    if (!text) { warnings.push(`${row.where}: no mitigant text, so it's skipped`); continue; }
    let status = row.get("Status");
    if (status) { const s = MIT_STATUSES.find(x => x.toLowerCase() === status.toLowerCase()); if (!s) warnings.push(`${row.where}: status “${status}” isn't one of ${MIT_STATUSES.join(", ")}, so it's left as it is`); status = s; }
    const ctl = row.get("Control"), tv = row.get("Tasks");
    const tasks = tv === undefined ? undefined : tv.split(/[,;\s]+/).filter(Boolean).filter(x => idKey(x) != null || (warnings.push(`${row.where}: “${x}” isn't a task ID, so that link is skipped`), false)).map(idKey);
    mits.push({ where: row.where, srcId: idKey(row.get("ID")), riskSrc: idKey(row.get("Risk ID")), tasks, A: ppl(row.get("Accountable")), R: ppl(row.get("Responsible")),
      f: given({ text, is_control: ctl === undefined ? undefined : /^(yes|y|true|1|x|✓)$/i.test(ctl) ? 1 : 0, status, testing: row.get("Testing"), handed_to: row.get("Handed to") }) });
  }
  return { risks, mits, warnings };
}
// Update mode matches by ID within the project, like tasks; anything else adds. Nothing missing from the sheet is deleted.
function riskIdMatches(pid) {
  const upd = W.mode === "update", seenR = new Set(), seenM = new Set();
  const riskIn = k => upd && k != null ? scalar("SELECT id FROM risk WHERE id=? AND project_id=?", [+k, pid]) : null;
  const mitIn = k => upd && k != null ? scalar("SELECT m.id FROM mitigant m JOIN risk r ON r.id=m.risk_id WHERE m.id=? AND r.project_id=?", [+k, pid]) : null;
  const risks = W.risks.risks.map(r => { const id = seenR.has(r.srcId) ? null : riskIn(r.srcId); if (r.srcId != null) seenR.add(r.srcId); return id; });
  const mits = W.risks.mits.map(x => { const id = seenM.has(x.srcId) ? null : mitIn(x.srcId); if (x.srcId != null) seenM.add(x.srcId); return id; });
  return { risks, mits, riskIn };
}
function riskPreviewText() {
  const { risks, mits } = W.risks, n = W.mode === "update" ? riskIdMatches(M.projectId) : null;
  const upd = a => n ? a.filter(Boolean).length : 0;
  const nr = upd(n?.risks || []), nm = upd(n?.mits || []);
  return `Also ${risks.length} risk${risks.length === 1 ? "" : "s"} and ${mits.length} mitigant${mits.length === 1 ? "" : "s"} from the Risk register and Mitigants sheets` +
    (n ? ` (${nr} risk${nr === 1 ? "" : "s"} and ${nm} mitigant${nm === 1 ? "" : "s"} match existing ones by ID and will be updated; the rest are added).` : ".");
}
function applyRisks(pid, plan, lookupParty, report) {
  const rk = report.risks = { added: 0, updated: 0, mitAdded: 0, mitUpdated: 0 };
  const match = riskIdMatches(pid), upd = W.mode === "update";
  // A task ID means the row with that ID in this sheet (first one wins), else in update mode an existing task of the project.
  const taskOf = new Map(); for (const it of plan.items) { const k = idKey(it.srcId); if (k != null && !taskOf.has(k)) taskOf.set(k, it.taskId); }
  const findTask = k => taskOf.get(k) ?? (upd ? scalar("SELECT id FROM task WHERE id=? AND project_id=?", [+k, pid]) : null);
  // Same rule as tasks (DECISIONS #48): a Responsible equal to the record's own Accountable turns "same as Accountable" back on.
  const setParties = (kind, id, rec) => {
    const ids = list => [...new Set(list.map(lookupParty).filter(Boolean))].sort((a, b) => a - b);
    const a = rec.A && ids(rec.A), r = rec.R && ids(rec.R);
    if (a) opSetRecParties(kind, id, "A", a);
    if (r) { if (a && r.length && r.join() === a.join()) opSetRecRIsA(kind, id, true); else opSetRecParties(kind, id, "R", r); }
  };
  const riskId = new Map(); // sheet ID → risk id
  W.risks.risks.forEach((r, i) => {
    let id = match.risks[i];
    try {
      if (id) { opUpdateRisk(id, r.f); rk.updated++; } else { id = opAddRisk({ ...r.f, projectId: pid }); rk.added++; }
      setParties("risk", id, r);
      if (r.srcId != null && !riskId.has(r.srcId)) riskId.set(r.srcId, id);
    } catch (e) { report.warnings.push(`${r.where}: skipped (${e.message})`); }
  });
  W.risks.mits.forEach((x, i) => {
    let id = match.mits[i];
    const rid = x.riskSrc == null ? null : riskId.get(x.riskSrc) ?? match.riskIn(x.riskSrc);
    if (x.riskSrc != null && !rid) return report.warnings.push(`${x.where}: risk ID ${x.riskSrc} isn't in the Risk register, so it's skipped`);
    if (!rid && !id) return report.warnings.push(`${x.where}: no Risk ID, so it's skipped`);
    try {
      if (id) {
        if (rid && rid !== scalar("SELECT risk_id FROM mitigant WHERE id=?", [id])) { run("UPDATE mitigant SET risk_id=? WHERE id=?", [rid, id]); placeAfter("mitigant", "risk_id", rid, id, null); }
        opUpdateMitigant(id, x.f); rk.mitUpdated++;
      } else { id = opAddMitigant(rid, x.f.text, null, x.f); rk.mitAdded++; }
      setParties("mitigant", id, x);
      if (x.tasks) {
        run("DELETE FROM mitigant_task WHERE mitigant_id=?", [id]);
        for (const k of x.tasks) { const t = findTask(k); if (t) opLinkTask(id, t); else report.warnings.push(`${x.where}: task ${k} isn't in the plan, so that link is skipped`); }
      }
    } catch (e) { report.warnings.push(`${x.where}: skipped (${e.message})`); }
  });
}
const safeName = s => (s || "plan").replace(/[\\/:*?"<>|]+/g, "-").trim() || "plan";
function exportXlsx() { const wb = exportWorkbook(); const name = safeName(M.projects.find(p => p.id === M.projectId)?.name) + ".xlsx"; XLSX.writeFile(wb, name); logInfo(`Exported ${name}`); }
function csvText() {
  const wb = exportWorkbook(); const ws = wb.Sheets.Tasks;
  for (const k of Object.keys(ws)) if (ws[k] && ws[k].z === "yyyy-mm-dd") { ws[k] = { t: "s", v: fmtYMD(ws[k].v - 25569) }; }
  for (const k of Object.keys(ws)) if (ws[k] && ws[k].z === "0%") { ws[k] = { t: "s", v: Math.round(ws[k].v * 100) + "%" }; }
  // One kind of line break (a lone CR isn't quoted and would split the row), and a guard against spreadsheet
  // formula injection: text starting with = + - @ tab or CR gets a leading apostrophe (stripped again on import).
  for (const k of Object.keys(ws)) if (k[0] !== "!" && ws[k].t === "s") {
    const v = String(ws[k].v).replace(/\r\n?/g, "\n");
    ws[k] = { t: "s", v: /^[=+\-@\t\r]/.test(v) ? "'" + v : v };
  }
  return XLSX.utils.sheet_to_csv(ws);
}
function exportCsv() {
  const csv = csvText();
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const a = h("a", { href: URL.createObjectURL(blob), download: safeName(M.projects.find(p => p.id === M.projectId)?.name) + ".csv" });
  document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  logInfo("Exported CSV");
}

// ---------- Print ----------
function printPlan() {
  const rows = UI.rows; const proj = M.projects.find(p => p.id === M.projectId);
  const root = $("printRoot"); root.innerHTML = "";
  const PER_PAGE = 20, W0 = 1500, COLW = [52, 290, 80, 80, 44, 150, 150], TX = COLW.reduce((a, b) => a + b, 0);
  const sc = buildScale("fit", W0 - TX, rows.length ? rows : M.order);
  const heads = ["WBS", "Task", "Start", "Finish", "%", "Responsible", "Accountable"];
  for (let p = 0; p * PER_PAGE < Math.max(rows.length, 1); p++) {
    const chunk = rows.slice(p * PER_PAGE, (p + 1) * PER_PAGE);
    const H = 44 + chunk.length * ROW + 4;
    const local = new Map(chunk.map((t, i) => [t.id, i]));
    let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W0} ${H}" font-family="system-ui,Segoe UI,sans-serif" font-size="12">${defs("p" + p)}`;
    let x = 0; heads.forEach((hd, i) => { s += `<text x="${x + 4}" y="37" font-weight="600" fill="#555">${hd}</text>`; x += COLW[i]; });
    s += `<g transform="translate(${TX},0)">${headerSvg(sc)}<g transform="translate(0,44)">${backgroundSvg(sc, chunk.length * ROW)}`;
    for (const d of M.deps) if (local.has(d.pred_id) && local.has(d.succ_id)) s += depPath(sc, d, t => local.get(t.id), "p" + p);
    chunk.forEach((t, i) => s += barSvg(sc, t, i * ROW, { print: true, noLabel: true }));
    s += `</g></g><g transform="translate(0,44)">`;
    chunk.forEach((t, i) => {
      const y = i * ROW + 19, a = accountable(t);
      const cells = [t.wbs, t.name, fmtShort(t.S), fmtShort(t.F), t.P + "%", rolesOf(t.id, "R").map(r => partyName(r.party_id)).join(", "), a.list.map(r => partyName(r.party_id)).join(", ")];
      s += `<line x1="0" x2="${W0}" y1="${i * ROW + ROW}" y2="${i * ROW + ROW}" stroke="#e5e5e5"/>`;
      let cx = 0; cells.forEach((c, j) => {
        const max = Math.floor((COLW[j] - 8 - (j === 1 ? t.depth * 14 : 0)) / 6.4); const txt = String(c).length > max ? String(c).slice(0, max - 1) + "…" : c;
        s += `<text x="${cx + 4 + (j === 1 ? t.depth * 14 : 0)}" y="${y}"${j === 1 && t.isSummary ? ' font-weight="700"' : ""}>${esc(txt)}</text>`; cx += COLW[j];
      });
    });
    s += `</g></svg>`;
    const page = h("div", { class: "pg" });
    if (p === 0) page.append(h("h1", {}, proj?.name || "Plan"), h("div", { class: "sub" }, `Printed ${new Date().toLocaleString()} · ${rows.length} tasks${filterActive() ? " (filtered)" : ""}`));
    page.insertAdjacentHTML("beforeend", s);
    root.append(page);
  }
  setTimeout(() => window.print(), 50);
}
function printInvolvement(pid) {
  const p = M.parties.get(pid), rows = involvementRows(pid);
  const root = $("printRoot"); root.innerHTML = "";
  root.append(h("h1", {}, `${p.name}: involvement`), h("div", { class: "sub" }, `${p.title || (p.kind === "team" ? "Team" : "")} · printed ${new Date().toLocaleString()}`));
  for (const role of ROLES) {
    const list = rows.filter(r => r.role === role); if (!list.length) continue;
    root.append(h("h2", { style: { fontSize: "13px" } }, ROLE_NAMES[role]));
    const t = h("table", {}, h("tr", {}, ...["Project", "Task", "Start", "Finish", "Status"].map(x => h("th", {}, x))));
    for (const r of list) t.append(h("tr", {}, h("td", {}, r.project), h("td", {}, r.name), h("td", {}, r.start || ""), h("td", {}, r.finish || ""), h("td", {}, r.status)));
    root.append(t);
  }
  setTimeout(() => window.print(), 50);
}
