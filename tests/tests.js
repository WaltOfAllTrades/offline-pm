// Offline PM test suite. Load into the running app page (served from localhost) and call runPmTests().
// It wipes the in-page database, so never run it against a page holding real work.
window.runPmTests = async function () {
  const P = window.PM, results = [];
  if (P.db.readOnly) return { total: 0, passed: 0, failed: [{ tag: "setup", name: "page is read-only", pass: false, err: "Another tab holds the editing lock. Close it (or click Take over editing here) and run again." }] };
  const U = P.util, O = P.op;
  const eq = (a, b, msg) => { const A = JSON.stringify(a), B = JSON.stringify(b); if (A !== B) throw new Error(`${msg || "expected equal"}: got ${A}, want ${B}`); };
  const ok = (c, msg) => { if (!c) throw new Error(msg || "assertion failed"); };
  const throws = (fn, re, msg) => { let e; try { fn(); } catch (x) { e = x; } if (!e) throw new Error((msg || "expected throw") + " (did not throw)"); if (re && !re.test(e.message)) throw new Error(`${msg || "wrong error"}: ${e.message}`); };
  const fresh = () => { P.reset(); return P.M.projectId; };
  const m = (fn) => { const r = P.mutate("test", fn); ok(r, "mutate failed"); };
  const D = s => U.parseYMD(s);
  const T = (name, parentId = null, start = "2026-03-02", finish = start, extra = {}) => { let id; m(() => { id = O.opAddTask({ name, parentId, start: D(start), finish: D(finish), ...extra }); }); return id; };
  const task = id => P.M.tasks.get(id);
  const test = async (tag, name, fn) => {
    try { await fn(); results.push({ tag, name, pass: true }); }
    catch (e) { results.push({ tag, name, pass: false, err: e.message }); }
  };
  const origToast = null;
  // A real input event gets a microtask checkpoint after each listener, so the app's redraws (DECISIONS #75) land
  // before anything else happens. Events a test fires synchronously don't, so draw after each one the same way.
  const shims = [[EventTarget.prototype, "dispatchEvent"], [HTMLElement.prototype, "click"], [HTMLElement.prototype, "focus"], [HTMLElement.prototype, "blur"]]
    .map(([o, k]) => { const f = o[k]; o[k] = function (...a) { try { return f.apply(this, a); } finally { P.drawNow(); } }; return () => { o[k] = f; }; });
  try {

  await test("smoke", "app API and SQLite present", () => { ok(P && P.SQL && P.XLSX, "PM/SQL/XLSX"); eq(P.scalar("select sqlite_version() >= '3.45'"), 1); });

  await test("dates", "working-day math", () => {
    const mon = D("2026-03-02"), fri = D("2026-03-06"), sat = D("2026-03-07"), nextMon = D("2026-03-09");
    eq(U.workdays(mon, fri), 5, "Mon–Fri = 5");
    eq(U.workdays(mon, nextMon), 6, "Mon–next Mon = 6");
    eq(U.finishFor(fri, 2), nextMon, "Fri + 2d ends Mon");
    eq(U.wdDay(U.wdIndex(sat)), nextMon, "weekend rolls to Monday");
    eq(U.workdays(sat, D("2026-03-08")), 0, "weekend has 0 workdays");
    for (let n = D("2026-01-01"); n < D("2026-02-01"); n++) { const i = U.wdIndex(n); ok(U.wdDay(i) >= n, "wdDay(wdIndex(n)) >= n"); }
    eq(U.parseDuration("2w"), 10); eq(U.parseDuration("5 days"), 5); eq(U.parseDuration("3"), 3); eq(U.parseDuration("x"), null);
    eq(U.parsePercent("50%"), 50); eq(U.parsePercent(0.25), 25); eq(U.parsePercent("0.5"), 50); eq(U.parsePercent(100), 100); eq(U.parsePercent("abc"), null);
    eq(U.parseDateText("03/04/2026", "MDY"), D("2026-03-04")); eq(U.parseDateText("03/04/2026", "DMY"), D("2026-04-03"));
    eq(U.parseDateText("2026-12-31"), D("2026-12-31")); eq(U.parseDateText("Mar 5, 2026"), D("2026-03-05")); eq(U.parseDateText("5 March 2026"), D("2026-03-05"));
    eq(U.parseDateText("02/30/2026"), null, "invalid date rejected");
    eq(U.excelSerialToDay(46083, false), D("2026-03-02"), "1900 serial"); eq(U.excelSerialToDay(46083 - 1462, true), D("2026-03-02"), "1904 serial");
    eq(U.excelSerialToDay(46023, false), D("2026-01-01"), "Excel 2026-01-01 = 46023");
  });

  await test("wbs", "derived WBS numbering, deep nesting", () => {
    fresh();
    const a = T("A"), a1 = T("A1", a), a11 = T("A11", a1), a111 = T("A111", a11), a1111 = T("A1111", a111), b = T("B");
    eq(task(a1111).wbs, "1.1.1.1.1"); eq(task(b).wbs, "2"); eq(task(a111).depth, 3);
    ok(task(a).isSummary && !task(a1111).isSummary, "summary flags");
  });

  await test("wbs-ops", "add after, indent, outdent, move, moveTo, delete", () => {
    fresh();
    const a = T("A"), b = T("B"), c = T("C"), d = T("D");
    let x; m(() => { x = O.opAddTask({ name: "X", afterId: a }); });
    eq(P.M.order.map(t => t.name), ["A", "X", "B", "C", "D"], "insert after A");
    m(() => O.opIndent(x)); eq(task(x).wbs, "1.1", "indent under A");
    throws(() => { P.run("BEGIN"); try { O.opIndent(a); } finally { P.run("ROLLBACK"); } }, /Nothing above/, "can't indent first");
    m(() => O.opIndent(c)); m(() => O.opIndent(d)); // C, D under B
    eq([task(c).wbs, task(d).wbs], ["2.1", "2.2"]);
    m(() => O.opOutdent(c)); // C to top; D becomes child of C (keeps row order)
    eq([task(c).wbs, task(d).wbs], ["3", "3.1"], "outdent keeps visual order");
    eq(P.M.order.map(t => t.name), ["A", "X", "B", "C", "D"], "row order unchanged by outdent");
    m(() => O.opMove(c, -1)); eq(P.M.order.map(t => t.name), ["A", "X", "C", "D", "B"], "move up moves subtree");
    m(() => O.opMoveTo(b, a, "child")); eq(task(b).wbs, "1.2", "moveTo child appends");
    m(() => O.opMoveTo(b, x, "before")); eq(task(b).wbs, "1.1");
    throws(() => { P.run("BEGIN"); try { O.opMoveTo(a, b, "child"); } finally { P.run("ROLLBACK"); } }, /inside itself/);
    m(() => O.opDelete(a)); ok(!task(x) && !task(b), "subtree deleted"); eq(task(c).wbs, "1", "renumbered");
    const pos = P.q("select parent_id, group_concat(position) p from (select * from task order by position) group by parent_id");
    for (const r of pos) { const arr = r.p.split(",").map(Number); eq(arr, arr.map((_, i) => i), "contiguous positions"); }
  });

  await test("rollup", "summary dates, weighted %, derived status", () => {
    fresh();
    const p = T("P"), a = T("a", p, "2026-03-02", "2026-03-06"), b = T("b", p, "2026-03-09", "2026-03-18");
    m(() => { O.opSetField(a, "percent", 100); O.opSetField(b, "percent", 20); });
    const s = task(p);
    eq([U.fmtYMD(s.S), U.fmtYMD(s.F)], ["2026-03-02", "2026-03-18"], "min/max");
    eq(s.dur, 13, "span duration"); eq(s.P, Math.round((5 * 100 + 8 * 20) / 13), "duration-weighted %");
    eq(s.ST, "In progress");
    m(() => O.opSetField(b, "status", "Blocked")); eq(task(p).ST, "Blocked");
    m(() => O.opSetField(b, "status", "Done")); eq(task(p).ST, "Done"); eq(task(p).P, 100);
    throws(() => { P.run("BEGIN"); try { O.opSetField(p, "start", "2026-01-01"); } finally { P.run("ROLLBACK"); } }, /roll up/);
  });

  await test("dates", "field edits keep duration; status/percent sync", () => {
    fresh();
    const a = T("a", null, "2026-03-02", "2026-03-04"); // 3 days
    m(() => O.opSetField(a, "start", "2026-03-05")); eq(U.fmtYMD(task(a).F), "2026-03-09", "start move keeps 3 working days");
    m(() => O.opSetField(a, "duration", "2w")); eq(task(a).dur, 10);
    throws(() => { P.run("BEGIN"); try { O.opSetField(a, "finish", "2026-01-01"); } finally { P.run("ROLLBACK"); } }, /before start/);
    m(() => O.opSetField(a, "percent", 40)); eq(task(a).ST, "In progress");
    m(() => O.opSetField(a, "status", "Done")); eq(task(a).P, 100);
    m(() => O.opSetField(a, "status", "Not started")); eq(task(a).P, 0);
  });

  await test("milestone", "duration 0 makes a milestone", () => {
    fresh(); const a = T("a", null, "2026-03-02", "2026-03-06");
    m(() => O.opSetField(a, "duration", "0")); ok(task(a).isMilestone, "is milestone"); eq(task(a).S, task(a).F); eq(task(a).dur, 0);
    m(() => O.opSetField(a, "kind", "task")); ok(!task(a).isMilestone); eq(task(a).dur, 1);
  });

  await test("deps", "add, update, reject self/cycle/parent-child", () => {
    fresh();
    const p = T("P"), a = T("a", p), b = T("b"), c = T("c");
    m(() => { O.opAddDep(a, b); O.opAddDep(b, c, "SS", 2); });
    eq(P.M.deps.length, 2); eq(P.M.depsIn.get(c)[0].type, "SS");
    const tryOp = fn => { P.run("BEGIN"); try { fn(); } finally { P.run("ROLLBACK"); } };
    throws(() => tryOp(() => O.opAddDep(c, a)), /circular/, "cycle");
    throws(() => tryOp(() => O.opAddDep(a, a)), /itself/, "self");
    throws(() => tryOp(() => O.opAddDep(p, a)), /summary task/, "parent-child");
    m(() => O.opAddDep(a, b, "FF", -1)); eq(P.M.deps.length, 2, "duplicate updates instead"); eq(P.M.depsIn.get(b)[0].type, "FF");
    m(() => O.opDelete(b)); eq(P.M.deps.length, 0, "deleting a task removes its links");
  });

  await test("violation", "conflicts flagged for all four types, dates never moved", () => {
    fresh();
    const a = T("a", null, "2026-03-02", "2026-03-06"), b = T("b", null, "2026-03-06", "2026-03-10");
    m(() => O.opAddDep(a, b, "FS", 0));
    ok(P.M.deps[0].violated, "FS overlap is a conflict"); eq(U.fmtYMD(task(b).S), "2026-03-06", "dates unchanged");
    ok(P.M.issues.some(i => i.kind === "dep"), "issue listed");
    m(() => O.opSetField(b, "start", "2026-03-09")); ok(!P.M.deps[0].violated, "FS satisfied next workday (over weekend)");
    m(() => O.opUpdateDep(P.M.deps[0].id, "FS", 1)); ok(P.M.deps[0].violated, "lag 1 violated");
    m(() => O.opUpdateDep(P.M.deps[0].id, "SS", 5)); ok(!P.M.deps[0].violated, "SS+5 ok (Mar 9 = 5 wd after Mar 2)");
    m(() => O.opUpdateDep(P.M.deps[0].id, "SS", 6)); ok(P.M.deps[0].violated, "SS+6 violated");
    m(() => O.opUpdateDep(P.M.deps[0].id, "FF", 0)); ok(!P.M.deps[0].violated, "FF ok");
    m(() => O.opUpdateDep(P.M.deps[0].id, "SF", 0)); ok(!P.M.deps[0].violated, "SF ok");
  });

  await test("pred-parse", "predecessor text grammar", () => {
    eq(U.parsePredText("1.2FS+3d, 4, 2.1 SS -1, 5ff+1w"), [{ ref: "1.2", type: "FS", lag: 3 }, { ref: "4", type: "FS", lag: 0 }, { ref: "2.1", type: "SS", lag: -1 }, { ref: "5", type: "FF", lag: 5 }]);
    throws(() => U.parsePredText("abc"), /Can't read/);
    fresh();
    const a = T("a"), b = T("b"), c = T("c");
    m(() => O.opSetPredText(c, "1, 2SS+2d")); eq(P.M.depsIn.get(c).length, 2);
    ok(!P.mutate("bad", () => O.opSetPredText(c, "1, 9")), "unknown WBS fails");
    eq(P.M.depsIn.get(c).length, 2, "rollback kept old links");
    m(() => O.opSetPredText(c, "")); ok(!P.M.depsIn.get(c), "cleared");
  });

  await test("raci", "roles for people and teams; one role per party", () => {
    fresh();
    const a = T("a"); let ana, eng;
    m(() => { ana = O.opAddParty("person", "Ana"); eng = O.opAddParty("team", "Eng"); O.opSetMembers(eng, [ana]); });
    m(() => { O.opSetRole(a, ana, "R"); O.opSetRole(a, eng, "A"); });
    eq(P.M.raci.get(a).length, 2);
    m(() => O.opSetRole(a, ana, "C")); eq(P.M.raci.get(a).find(r => r.party_id === ana).role, "C", "role replaced");
    m(() => O.opSetRoleParties(a, "R", [ana, eng])); eq(P.M.raci.get(a).filter(r => r.role === "R").length, 2);
    ok(!P.mutate("bad member", () => O.opSetMembers(ana, [eng])), "trigger rejects person as team");
  });

  await test("raci-rules", "warnings: missing/multiple/team A, inherited, inactive, no R", () => {
    fresh();
    const p = T("P"), a = T("a", p), b = T("b"); let x, y, t;
    m(() => { x = O.opAddParty("person", "X"); y = O.opAddParty("person", "Y"); t = O.opAddParty("team", "T"); });
    const iss = (id, re) => P.M.issues.filter(i => i.task.id === id && re.test(i.text));
    ok(iss(b, /No Accountable/).length, "b missing A");
    m(() => O.opSetRole(p, x, "A")); ok(!iss(a, /No Accountable/).length, "a inherits A from P");
    m(() => { O.opSetRole(b, x, "A"); O.opSetRole(b, y, "A"); }); ok(iss(b, /2 Accountables/).length, "multiple A");
    m(() => O.opSetRole(b, y, null)); m(() => O.opSetRole(b, t, "R")); m(() => O.opSetRole(a, t, "A"));
    ok(iss(a, /team/).some(i => i.level === "info"), "team as A is info");
    ok(iss(a, /no members/).length, "empty team noted");
    ok(iss(a, /No Responsible/).length, "leaf without R");
    m(() => O.opUpdateParty(x, { active: false })); ok(iss(b, /inactive/).length, "inactive assigned");
  });

  await test("filter", "person filter includes their teams and keeps parents", async () => {
    fresh();
    const p = T("P"), a = T("a", p), b = T("b"); let x, t;
    m(() => { x = O.opAddParty("person", "X"); t = O.opAddParty("team", "T"); O.opSetMembers(t, [x]); O.opSetRole(a, t, "R"); });
    const pf = document.getElementById("personFilter");
    pf.value = "p:" + x; pf.dispatchEvent(new Event("change"));
    eq(P.UI.rows.map(r => r.name), ["P", "a"], "team task + ancestor");
    pf.value = ""; pf.dispatchEvent(new Event("change"));
    const sb = document.getElementById("searchBox");
    const typed = async v => { sb.value = v; sb.dispatchEvent(new Event("input")); await new Promise(r => setTimeout(r, 200)); }; // filtering waits for a pause
    await typed("b"); eq(P.UI.rows.map(r => r.name), ["b"], "text filter");
    await typed(""); eq(P.UI.rows.length, 3);
  });

  await test("undo", "undo/redo restore state under new revisions", () => {
    fresh();
    const a = T("a"); const r0 = P.db.rev;
    m(() => O.opSetField(a, "name", "renamed")); eq(task(a).name, "renamed");
    P.undo(); eq(task(a).name, "a", "undo"); ok(P.db.rev > r0 + 1, "rev increases on undo");
    P.redo(); eq(task(a).name, "renamed", "redo");
    eq(P.scalar("PRAGMA foreign_keys"), 1, "FKs on after restore");
  });

  await test("persist", "change reaches crash buffer; pragma survives export", async () => {
    fresh(); const a = T("persist-me");
    await P.flushSaves();
    eq(P.db.mirrorRev, P.db.rev, "mirror at current rev");
    eq(P.scalar("PRAGMA foreign_keys"), 1, "FKs on after export");
    const mirror = await new Promise((res, rej) => { const r = indexedDB.open("offline-pm", 1); r.onsuccess = () => { const g = r.result.transaction("kv").objectStore("kv").get("mirror"); g.onsuccess = () => res(g.result); g.onerror = rej; }; });
    const d = new P.SQL.Database(mirror.bytes);
    eq(d.exec("select name from task where id=" + a)[0].values[0][0], "persist-me"); d.close();
  });

  await test("migrate", "proof-of-concept file upgrades to the current schema", () => {
    const d = new P.SQL.Database();
    d.run("CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT); INSERT INTO meta VALUES('rev','7');" +
      "CREATE TABLE tasks(id INTEGER PRIMARY KEY, title TEXT, status TEXT, due TEXT, notes TEXT, updated_at TEXT);" +
      "CREATE TABLE deps(task_id INTEGER, depends_on INTEGER, PRIMARY KEY(task_id,depends_on));" +
      "INSERT INTO tasks VALUES (1,'One','done','2026-03-02','n',''),(2,'Two','doing','2026-03-05','',''),(3,'Three','todo',null,'','');" +
      "INSERT INTO deps VALUES (2,1),(3,2);");
    const bytes = d.export(); d.close();
    P.db.installDb(bytes); P.M.projectId = null; P.refresh();
    eq(P.scalar("PRAGMA user_version"), 4); eq(P.db.rev, 7, "rev kept");
    eq(P.M.order.map(t => [t.name, t.ST]), [["One", "Done"], ["Two", "In progress"], ["Three", "Not started"]]);
    eq(P.M.deps.length, 2); ok(!P.scalar("select count(*) from sqlite_master where name='tasks'"), "old table dropped");
  });

  await test("projects", "multiple projects; people shared", () => {
    const p1 = fresh(); T("in p1"); let p2, ana;
    m(() => { p2 = O.opAddProject("Second"); ana = O.opAddParty("person", "Ana"); });
    P.switchProject(p2); eq(P.M.order.length, 0); T("in p2"); ok(P.M.parties.has(ana), "people global");
    P.switchProject(p1); eq(P.M.order.map(t => t.name), ["in p1"]);
    m(() => O.opDeleteProject(p2)); eq(P.M.projects.length, 1);
  });

  // ---------- Import / export ----------
  const XL = P.XLSX;
  const wbBytes = (aoa, sheet = "Sheet1", extra) => { const wb = XL.utils.book_new(); XL.utils.book_append_sheet(wb, XL.utils.aoa_to_sheet(aoa), sheet); if (extra) extra(wb); return XL.write(wb, { type: "array", bookType: "xlsx" }); };
  const csvBytes = s => new TextEncoder().encode(s).buffer;
  const runImport = async (name, buf, tweak) => { await P.io.loadImportFile(name, buf); const W = P.io.W; if (tweak) tweak(W); W.plan = P.io.buildPlan(); const rep = P.io.doImport(); P.cmd && document.querySelector("#modalBack") && (document.querySelector("#modalBack").hidden = true); return { W, rep }; };

  await test("import", "xlsx auto-map, WBS hierarchy, people, preds", async () => {
    fresh();
    const s = 46083; // 2026-03-02
    const aoa = [["WBS", "Task Name", "Start Date", "Due date", "Status", "Owner", "Accountable", "Predecessors", "Notes"],
      ["2", "Build", "", "", "", "", "", "", ""],
      ["1", "Plan", "", "", "", "", "Ana", "", ""],
      ["1.1", "Kickoff", s, s, "Complete", "Ana", "", "", "hello"],
      ["1.2", "Scope", s + 1, s + 3, "WIP", "Ben; team:Eng", "", "1.1", ""],
      ["2.1", "Code", "2026-03-09", "03/13/2026", "On hold", "Eng", "Ben", "1.2FS+1d", ""]];
    const { W, rep } = await runImport("plan.xlsx", wbBytes(aoa), W => { W.mode = "new"; W.projectName = "Imported"; });
    eq(Object.values(W.map).sort(), ["A", "R", "finish", "name", "notes", "pred", "start", "status", "wbs"].sort(), "auto-mapped");
    eq(P.M.order.map(t => t.wbs + " " + t.name), ["1 Plan", "1.1 Kickoff", "1.2 Scope", "2 Build", "2.1 Code"], "hierarchy from WBS regardless of row order");
    const by = n => P.M.order.find(t => t.name === n);
    eq(U.fmtYMD(by("Kickoff").S), "2026-03-02"); eq(by("Kickoff").ST, "Done"); eq(by("Code").ST, "Blocked"); eq(by("Scope").ST, "In progress");
    eq(U.fmtYMD(by("Code").F), "2026-03-13", "text date MDY");
    eq(by("Kickoff").notes, "hello");
    eq(P.M.deps.length, 2); eq(P.M.depsIn.get(by("Code").id)[0].lag, 1);
    const eng = [...P.M.parties.values()].find(p => p.name === "Eng"); ok(eng && eng.kind === "team", "team: prefix creates team");
    eq(P.M.raci.get(by("Plan").id).map(r => r.role), ["A"]);
    eq(rep.added, 5);
  });

  await test("import-wbs", "outline level, parent column and indentation", async () => {
    fresh();
    await runImport("lv.csv", csvBytes("Name,Outline Level,Start\nA,1,2026-03-02\nA1,2,2026-03-03\nA11,3,2026-03-04\nB,1,2026-03-05\n"), W => W.mode = "append");
    eq(P.M.order.map(t => t.wbs + t.name), ["1A", "1.1A1", "1.1.1A11", "2B"], "level");
    fresh();
    await runImport("par.csv", csvBytes("ID,Name,Parent\n10,Child,20\n20,Parent,\n30,Grandchild,10\n"), W => W.mode = "append");
    eq(P.M.order.map(t => t.wbs + t.name), ["1Parent", "1.1Child", "1.1.1Grandchild"], "parent (child listed first)");
    fresh();
    await runImport("ind.csv", csvBytes("Task\nPhase\n  Step one\n    Detail\n  Step two\nPhase 2\n"), W => W.mode = "append");
    eq(P.M.order.map(t => t.wbs + t.name), ["1Phase", "1.1Step one", "1.1.1Detail", "1.2Step two", "2Phase 2"], "indent");
  });

  await test("import-parse", "DMY, durations, percent forms, row-number preds", async () => {
    fresh();
    await runImport("p.csv", csvBytes("Name,Start,Duration,% Complete,Predecessors\nA,14/03/2026,5d,50%,\nB,16/03/2026,2w,0.25,1\nM,20/03/2026,0,,2FF\n"), W => { W.mode = "append"; ok(W.dateOrder === "DMY", "DMY detected"); });
    const [a, b, mm] = P.M.order;
    eq(U.fmtYMD(a.S), "2026-03-14"); eq(a.P, 50); eq(b.P, 25); eq(b.dur, 10); ok(mm.isMilestone, "0 duration milestone");
    eq(P.M.deps.map(d => d.type), ["FS", "FF"], "row-number refs");
  });

  await test("roundtrip", "export → import as new project is lossless", async () => {
    fresh(); P.mutate("seed", () => {}); // sample-like data
    const p = T("Phase"), a = T("Alpha", p, "2026-03-02", "2026-03-06"), b = T("Beta", p, "2026-03-09", "2026-03-11"), ms = T("Done!", null, "2026-03-12", "2026-03-12", { kind: "milestone" });
    let x, t;
    m(() => { x = O.opAddParty("person", "Xena", { email: "x@e.com" }); t = O.opAddParty("team", "Squad"); O.opSetMembers(t, [x]); O.opSetRole(a, x, "R"); O.opSetRole(p, x, "A"); O.opSetRole(b, t, "C"); O.opAddDep(a, b, "SS", 2); O.opAddDep(b, ms); O.opSetField(a, "percent", 40); O.opSetField(b, "notes", "multi\nline"); O.opSetField(a, "code", "X-1"); });
    const snap = () => P.M.order.map(t => [t.wbs, t.name, t.kind, U.fmtYMD(t.S), U.fmtYMD(t.F), t.P, t.ST, t.code, t.notes, (P.M.raci.get(t.id) || []).map(r => r.role + ":" + P.M.parties.get(r.party_id).name).sort().join(","), (P.M.depsIn.get(t.id) || []).map(d => P.M.tasks.get(d.pred_id).wbs + d.type + d.lag).join(",")]);
    const before = snap(); const partiesBefore = P.M.parties.size;
    const bytes = XL.write(P.io.exportWorkbook(), { type: "array", bookType: "xlsx" });
    const { W } = await runImport("rt.xlsx", bytes, W => { W.mode = "new"; });
    ok(W.meta, "own export detected");
    eq(snap(), before, "identical after round trip"); eq(P.M.parties.size, partiesBefore, "no duplicate people");
  });

  await test("import-update", "edit exported sheet, re-import updates by ID", async () => {
    fresh();
    const a = T("Alpha", null, "2026-03-02", "2026-03-06"), b = T("Beta");
    const wb = P.io.exportWorkbook(); const ws = wb.Sheets.Tasks;
    ws["D2"].v = "Alpha renamed"; ws["J3"].v = "Done";
    XL.utils.sheet_add_aoa(ws, [["", "3", 1, "Gamma", "Task"]], { origin: -1 });
    const { rep } = await runImport("up.xlsx", XL.write(wb, { type: "array", bookType: "xlsx" }), W => eq(W.mode, "update", "defaults to update for same project"));
    eq(rep.updated, 2); eq(rep.added, 1);
    eq(P.M.order.map(t => t.name), ["Alpha renamed", "Beta", "Gamma"]); eq(task(b).ST, "Done");
  });

  await test("issues", "issue list + badge", () => {
    fresh(); T("lonely");
    P.switchView("issues"); ok(document.querySelectorAll("#issueList .issue").length >= 1, "rendered");
    P.switchView("plan");
  });

  await test("grid", "inline edit commits through the editor", () => {
    fresh(); const a = T("before");
    P.selectTask(a, { col: "name" }); P.cmd.startEdit("name");
    const ed = document.querySelector(".cell-editor"); ok(ed, "editor open"); ed.value = "after"; P.cmd.commitEdit(0, 0);
    eq(task(a).name, "after");
    P.selectTask(a, { col: "pred" });
    P.cmd.cmdAdd("task"); const ed2 = document.querySelector(".cell-editor"); ok(ed2, "new task editor"); ed2.value = "second"; P.cmd.commitEdit(0, 0);
    eq(P.M.order.map(t => t.name), ["after", "second"]);
    P.selectTask(P.M.order[1].id); P.cmd.gridKey(new KeyboardEvent("keydown", { key: "Tab" })); eq(P.M.order[1].wbs, "1.1", "Tab indents");
  });

  await test("gantt", "grains and fit build sane scales", () => {
    fresh(); T("x", null, "2026-03-02", "2026-06-30");
    for (const g of ["day", "week", "month", "quarter", "fit"]) { P.gantt.setGrain(g); ok(P.gantt.SC.width > 0 && P.gantt.SC.origin <= U.parseYMD("2026-03-02"), g); }
    ok(document.querySelectorAll("#gBars .bar").length === 1, "bar drawn");
    P.gantt.setGrain("week");
  });

  // ---------- Regression tests for review findings ----------
  await test("review", "update import with only Start keeps durations; only Duration keeps start", async () => {
    fresh(); const a = T("A", null, "2026-03-02", "2026-03-06"), b = T("B", null, "2026-03-02", "2026-03-04");
    await runImport("u.csv", csvBytes(`ID,Name,Start\n${a},A,2026-03-09\n`), W => W.mode = "update");
    eq([U.fmtYMD(task(a).S), U.fmtYMD(task(a).F)], ["2026-03-09", "2026-03-13"], "5 days kept");
    await runImport("u2.csv", csvBytes(`ID,Name,Duration\n${b},B,4d\n`), W => W.mode = "update");
    eq([U.fmtYMD(task(b).S), task(b).dur], ["2026-03-02", 4], "start kept, duration applied");
  });
  await test("review", "update import keeps links from rows not in the sheet; status/percent stay in sync", async () => {
    fresh(); const a = T("A"), b = T("B"), c = T("C");
    m(() => { O.opAddDep(a, c); O.opAddDep(b, c); O.opSetField(c, "status", "Done"); });
    await runImport("u.csv", csvBytes(`ID,WBS,Name,Predecessors,% Complete\n${b},2,B,,\n${c},3,C,2,0\n`), W => W.mode = "update");
    eq(P.M.depsIn.get(c).length, 2, "link from A (absent from sheet) survives");
    eq([task(c).P, task(c).ST], [0, "Not started"], "percent 0 also resets Done");
  });
  await test("review", "indent removes parent↔child links", () => {
    fresh(); const a = T("A"), b = T("B");
    m(() => O.opAddDep(a, b)); m(() => O.opIndent(b));
    eq(P.M.deps.length, 0);
  });
  await test("review", "fraction percent column treats 1 as 100%", async () => {
    fresh();
    await runImport("p.csv", csvBytes("Name,% Complete\nA,0.5\nB,1\nC,0\n"), W => W.mode = "append");
    eq(P.M.order.map(t => t.P), [50, 100, 0]); eq(P.M.order[1].ST, "Done");
  });
  await test("review", "names with commas, weekend tasks and CSV re-import survive a round trip", async () => {
    fresh(); const a = T("A", null, "2026-03-07", "2026-03-08"), b = T("B", null, "2026-03-09", "2026-03-09"); let x;
    m(() => { x = O.opAddParty("person", "Smith, John"); O.opSetRole(a, x, "R"); O.opAddDep(a, b); });
    const wb = P.io.exportWorkbook();
    const csv = XL.utils.sheet_to_csv(wb.Sheets.Tasks);
    const { W } = await runImport("rt.csv", csvBytes(csv), W => W.mode = "new");
    ok(W.own, "own CSV export recognised");
    const [a2, b2] = P.M.order;
    ok(!a2.isMilestone, "weekend task stays a task");
    eq(P.M.raci.get(a2.id).map(r => P.M.parties.get(r.party_id).name), ["Smith, John"]);
    eq(P.M.depsIn.get(b2.id)?.[0]?.pred_id, a2.id, "pred resolved by WBS, not internal id");
  });
  await test("review", "part-day durations are 1 day, not milestones", () => { eq(U.parseDuration("0.25d"), 1); eq(U.parseDuration("0"), 0); });

  // ---------- Record form + work notes (branch: notes) ----------
  const fp = () => document.getElementById("formPane");
  const inForm = sel => fp().querySelector(sel);
  const allInForm = sel => [...fp().querySelectorAll(sel)];
  const btnInForm = text => allInForm("button").find(b => b.textContent.trim() === text);

  await test("notes", "add, edit, delete, ordering, cascade, undo", async () => {
    fresh(); const a = T("A"), b = T("B", a); let n1, n2, n3;
    m(() => { n1 = O.opAddNote(a, "  first  ", "Ana"); });
    eq(P.one("select body, author, updated_at from note where id=?", [n1]), { body: "first", author: "Ana", updated_at: null }, "trimmed, no edit stamp");
    throws(() => { P.run("BEGIN"); try { O.opAddNote(a, "   "); } finally { P.run("ROLLBACK"); } }, /empty/, "empty note rejected");
    await new Promise(r => setTimeout(r, 5));
    m(() => { n2 = O.opAddNote(a, "second"); n3 = O.opAddNote(b, "child note", "Ben"); });
    eq(P.notesFor(a).map(n => n.body), ["second", "first"], "newest first");
    eq(P.notesFor(a, true).length, 3, "with subtasks");
    eq(P.M.noteCount.get(a), 2, "model count");
    m(() => O.opEditNote(n1, "first (fixed)"));
    const e = P.one("select body, created_at, updated_at from note where id=?", [n1]);
    ok(e.body === "first (fixed)" && e.updated_at && e.updated_at >= e.created_at, "edit stamps updated_at");
    m(() => O.opEditNote(n2, "second")); eq(P.one("select updated_at from note where id=?", [n2]).updated_at, null, "unchanged edit is a no-op");
    throws(() => { P.run("BEGIN"); try { O.opEditNote(n1, ""); } finally { P.run("ROLLBACK"); } }, /empty/, "edit to empty rejected");
    m(() => O.opDeleteNote(n2)); eq(P.notesFor(a).length, 1);
    P.undo(); eq(P.notesFor(a).length, 2, "undo restores note");
    m(() => O.opDelete(b)); eq(P.scalar("select count(*) from note where id=" + n3), 0, "notes cascade with task");
  });

  await test("migrate", "schema v1 file gains the note table, data kept", () => {
    fresh(); T("Keep me");
    const d = new P.SQL.Database(P.db.exportBytes()); d.run("DROP TABLE note; PRAGMA user_version = 1;");
    const bytes = d.export(); d.close();
    P.db.installDb(bytes); P.M.projectId = null; P.refresh();
    eq(P.scalar("PRAGMA user_version"), 4); ok(P.scalar("select count(*) from sqlite_master where name='note'"), "note table created");
    eq(P.M.order.map(t => t.name), ["Keep me"]);
    m(() => O.opAddNote(P.M.order[0].id, "works after upgrade")); eq(P.notesFor(P.M.order[0].id).length, 1);
  });

  await test("form", "opens in place of the Gantt, shows fields, closes back", () => {
    fresh(); const a = T("Parent"), c1 = T("Child 1", a, "2026-03-02", "2026-03-04"), c2 = T("Child 2", a, "2026-03-05", "2026-03-10"); T("Grandchild", c2, "2026-03-05", "2026-03-06");
    P.switchView("plan"); P.openRecord(c1);
    ok(fp().classList.contains("open") && !document.getElementById("ganttPane").hidden, "form slides over the outline, gantt stays");
    ok(inForm(".f-title h2").textContent.includes("Child 1"), "title");
    eq(inForm("[data-f=name]").value, "Child 1"); eq(inForm("[data-f=start]").value, "2026-03-02");
    ok(!inForm(".mg"), "no mini gantt for a leaf");
    ok(inForm(".f-crumbs").textContent.includes("1 Parent"), "breadcrumb shows parent");
    P.openRecord(a);
    ok(inForm("[data-f=start]").disabled && inForm("[data-f=status]").disabled, "rolled-up fields read-only on summary");
    P.UI.mgAll = false; P.renderForm(true);
    eq(allInForm(".mg-l").length, 2, "direct children"); eq(allInForm(".mg-svg .bar").length, 2);
    const cb = inForm(".mg .f-sec-h input[type=checkbox]"); cb.checked = true; cb.dispatchEvent(new Event("change"));
    eq(allInForm(".mg-l").map(x => x.textContent), ["1.1Child 1", "1.2Child 2", "1.2.1Grandchild"], "all levels in outline order");
    P.UI.mgAll = false; localStorage.removeItem("pm.mgAll");
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "i", ctrlKey: true, bubbles: true }));
    ok(!fp().classList.contains("open"), "Ctrl+I closes");
    ok(document.querySelectorAll("#gBars .bar").length >= 3, "gantt re-rendered after closing");
    P.toggleForm(false);
  });

  await test("form", "selecting another outline row switches the record and commits pending edits", () => {
    fresh(); const a = T("A"), b = T("B");
    P.openRecord(a);
    const nm = inForm("[data-f=name]"); nm.focus(); nm.value = "A renamed";
    P.selectTask(b); // the outline is the record list
    eq(task(a).name, "A renamed", "pending edit committed on switch");
    ok(inForm(".f-title h2").textContent.includes("B"), "form shows B");
    P.toggleForm(false);
  });

  await test("form", "post a note from the form, draft kept per record, Ctrl+Enter", () => {
    fresh(); const a = T("A"), b = T("B");
    P.openRecord(a);
    let ta = inForm(".n-compose"); ta.value = "draft for A"; ta.dispatchEvent(new Event("input"));
    P.openRecord(b); eq(inForm(".n-compose").value, "", "B starts empty");
    P.openRecord(a); eq(inForm(".n-compose").value, "draft for A", "A's draft restored");
    ok(!inForm("select[data-keep=author]"), "no author picker");
    btnInForm("Post").click();
    eq(P.notesFor(a).map(n => n.body), ["draft for A"]); eq(inForm(".n-compose").value, "", "compose cleared");
    eq(allInForm(".n-entry").length, 1);
    ta = inForm(".n-compose"); ta.value = "via keyboard"; ta.dispatchEvent(new Event("input"));
    ta.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true }));
    eq(P.notesFor(a).map(n => n.body), ["via keyboard", "draft for A"], "Ctrl+Enter posts");
    btnInForm("Post").click(); eq(P.notesFor(a).length, 2, "empty post ignored");
    P.toggleForm(false);
  });

  await test("form", "edit and cancel a note inline; notes render as text with safe links", () => {
    fresh(); const a = T("A");
    m(() => { O.opAddNote(a, `<img src=x onerror="window.__pwned=1"> see https://example.com/a?b=1&c=2. javascript:alert(1)`, "Ana"); });
    P.openRecord(a);
    const body = inForm(".n-body");
    ok(!body.querySelector("img") && !window.__pwned, "HTML not interpreted");
    eq([...body.querySelectorAll("a")].map(x => x.getAttribute("href")), ["https://example.com/a?b=1&c=2"], "only http(s) linked, trailing dot excluded");
    btnInForm("Edit").click();
    let ed = inForm(".n-edit"); ok(document.activeElement === ed, "editor focused");
    ed.value = "changed"; ed.dispatchEvent(new Event("input"));
    ed.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    ok(!inForm(".n-edit") && P.notesFor(a)[0].body.startsWith("<img"), "Esc cancels");
    btnInForm("Edit").click(); ed = inForm(".n-edit"); ed.value = "changed"; ed.dispatchEvent(new Event("input"));
    btnInForm("Save").click();
    eq(P.notesFor(a)[0].body, "changed"); ok(inForm(".n-ed"), "(edited) marker");
    P.toggleForm(false);
  });

  await test("form", "summary shows subtask notes with a link to the subtask", () => {
    fresh(); const a = T("Parent"), c = T("Kid", a);
    m(() => { O.opAddNote(c, "from the kid"); O.opAddNote(a, "on the parent"); });
    P.UI.notesWithSub = true; P.openRecord(a);
    eq(allInForm(".n-entry").length, 2); ok(inForm(".n-on").textContent.includes("1.1 Kid"), "shows which subtask");
    const cb = allInForm(".notes .f-sec-h input[type=checkbox]")[0]; cb.checked = false; cb.dispatchEvent(new Event("change"));
    eq(allInForm(".n-entry").length, 1, "own notes only");
    P.UI.notesWithSub = true; localStorage.removeItem("pm.notesWithSub"); P.toggleForm(false);
  });

  await test("related", "tabs with counts; add predecessor, successor, RACI, subtask; RAID placeholder", () => {
    fresh(); const a = T("A"), b = T("B"), c = T("C"); let ana;
    m(() => { ana = O.opAddParty("person", "Ana"); });
    P.openRecord(b);
    const tab = k => inForm(`.rel-tab[data-tab=${k}]`);
    tab("pred").click();
    let sel = inForm(".rel-body select"); sel.value = String(a); sel.dispatchEvent(new Event("change"));
    eq(P.M.depsIn.get(b).map(d => d.pred_id), [a], "predecessor added");
    eq(tab("pred").querySelector(".cnt").textContent, "1", "count badge");
    tab("succ").click(); sel = inForm(".rel-body select"); sel.value = String(c); sel.dispatchEvent(new Event("change"));
    eq(P.M.depsOut.get(b).map(d => d.succ_id), [c], "successor added");
    ok(![...inForm(".rel-body select").options].some(o => o.value === String(c)), "linked task not offered again");
    tab("raci").click(); sel = allInForm(".rel-body select")[1]; sel.value = String(ana); sel.dispatchEvent(new Event("change"));
    eq(P.M.raci.get(b).map(r => [r.party_id, r.role]), [[ana, "R"]], "RACI added as R");
    tab("children").click(); btnInForm("＋ New subtask").click();
    eq(task(b).children.length, 1, "subtask added"); ok(inForm(".mg"), "now a summary with mini gantt");
    eq(allInForm(".rel-body tbody tr").length, 1);
    tab("raid").click(); ok(inForm(".rel-soon"), "RAID placeholder"); eq(P.UI.formTab, "raid");
    tab("children").click(); P.toggleForm(false);
  });

  await test("mini-gantt", "draws links between subtasks and opens a subtask on click", () => {
    fresh(); const a = T("P"), x = T("X", a, "2026-03-02", "2026-03-03"), y = T("Y", a, "2026-03-02", "2026-03-03");
    m(() => O.opAddDep(x, y)); // FS conflict: Y starts with X
    P.openRecord(a);
    eq(allInForm(".mg-svg .dep").length, 1); ok(inForm(".mg-svg .dep.bad"), "conflict shown red");
    inForm(`.mg-svg .bar[data-id="${y}"]`).dispatchEvent(new MouseEvent("click", { bubbles: true }));
    eq(P.UI.selId, y, "bar click opens subtask record"); ok(inForm(".f-title h2").textContent.includes("Y"));
    P.toggleForm(false);
  });

  await test("export", "Excel export carries a Notes sheet; import still reads Tasks", async () => {
    fresh(); const a = T("A"); m(() => { O.opAddNote(a, "n1", "Ana"); }); await new Promise(r => setTimeout(r, 5)); m(() => { O.opAddNote(a, "n2"); });
    const wb = P.io.exportWorkbook();
    ok(wb.SheetNames.includes("Notes"), "Notes sheet");
    const rows = XL.utils.sheet_to_json(wb.Sheets.Notes, { header: 1 });
    eq(rows[0], ["Task ID", "WBS", "Task", "Created", "Edited", "Note"]);
    eq(rows.slice(1).map(r => r[5]), ["n1", "n2"], "oldest first"); ok(/^\d{4}-\d\d-\d\d \d\d:\d\d$/.test(rows[1][3]), "local timestamp");
    const bytes = XL.write(wb, { type: "array", bookType: "xlsx" });
    const { W } = await runImport("rt.xlsx", bytes, W => W.mode = "new");
    eq(W.sheetName, "Tasks"); eq(P.M.order.map(t => t.name), ["A"]);
  });
await test("form-review", "Gantt lines up with the outline again after closing the form", () => {
    fresh(); let first; for (let i = 0; i < 80; i++) { const id = T("T" + i); first ??= id; }
    P.switchView("plan"); P.openRecord(first);
    const gb = document.getElementById("gridBody"); gb.scrollTop = 900; gb.dispatchEvent(new Event("scroll"));
    P.toggleForm(false);
    eq(document.getElementById("ganttBody").scrollTop, gb.scrollTop, "gantt scrollTop synced");
  });

  await test("form-review", "a click on a form button lands even when it commits a pending edit", async () => {
    fresh(); const a = T("A"), b = T("B");
    P.openRecord(a);
    const nm = inForm("[data-f=name]"); nm.focus(); nm.value = "A2";
    const next = allInForm(".f-acts button")[1];
    next.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
    eq(task(a).name, "A2", "edit committed on pointerdown");
    ok(next.isConnected, "button still in the page");
    window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
    next.click();
    await new Promise(r => setTimeout(r, 10));
    eq(P.UI.selId, b, "Next worked"); ok(inForm(".f-title h2").textContent.includes("B"));
    P.toggleForm(false);
  });

  await test("form-review", "stale note edit state never attaches to a reused id", () => {
    fresh(); const a = T("A");
    m(() => O.opAddNote(a, "old"));
    P.openRecord(a); btnInForm("Edit").click(); ok(inForm(".n-edit"), "editing");
    P.undo(); // removes the note being edited
    m(() => O.opAddNote(a, "new")); // SQLite reuses the id
    ok(!inForm(".n-edit"), "new note not opened in edit mode"); eq(inForm(".n-body").textContent, "new");
    P.toggleForm(false);
  });

  await test("form-review", "typing the same duration or percent is not a change", () => {
    fresh(); const a = T("A", null, "2026-03-02", "2026-03-06");
    P.openRecord(a); const depth = P.db.undoDepth;
    const d = inForm("[data-f=duration]"); d.value = "5"; d.dispatchEvent(new Event("change", { bubbles: true }));
    const p = inForm("[data-f=percent]"); p.value = "0%"; p.dispatchEvent(new Event("change", { bubbles: true }));
    eq(P.db.undoDepth, depth, "no undo step");
    P.toggleForm(false);
  });

  await test("form-review", "subtask notes work on a deep tree (no bound-variable limit)", () => {
    fresh(); const root = T("Root"); let last;
    m(() => { for (let i = 0; i < 1200; i++) P.run("INSERT INTO task(project_id, parent_id, position, name) VALUES (?,?,?,?)", [P.M.projectId, root, i, "c" + i]); last = P.scalar("SELECT MAX(id) FROM task"); O.opAddNote(last, "deep"); });
    eq(P.notesFor(root, true).map(n => n.body), ["deep"]);
  });
  await test("form", "slide-over: clicking a Gantt bar switches the record; Esc closes", () => {
    fresh(); const a = T("A"), b = T("B");
    P.switchView("plan"); P.openRecord(a);
    const sw = document.getElementById("split").clientWidth; ok(Math.abs(parseFloat(fp().style.width) - Math.max(sw / 3, Math.min(420, sw - 160))) < 2, "panel is a third of the width");
    ok(fp().nextElementSibling === document.getElementById("gridPane"), "panel sits beside the outline, pushing it right");
    P.selectTask(b); ok(inForm(".f-title h2").textContent.includes("B"), "follows selection from the Gantt");
    ok(document.querySelector(`#gBars .bar[data-id="${b}"].sel`), "gantt shows the selection while the form is open");
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    ok(!fp().classList.contains("open"), "Esc closes");
  });
  await test("raci-ra", "Responsible = Accountable switch: mirrors A, clears R, shows A/R, exports, ends on picking an R", () => {
    fresh(); const par = T("Phase"), a = T("Build", par); let ana, ben;
    m(() => { ana = O.opAddParty("person", "Ana"); ben = O.opAddParty("person", "Ben"); O.opSetRole(par, ana, "A"); O.opSetRole(a, ben, "R"); });
    m(() => O.opSetRIsA(a, true));
    eq(P.scalar(`select count(*) from raci where task_id=${a} and role='R'`), 0, "separate R cleared");
    ok(!P.M.issues.some(i => i.task.id === a && /Responsible/.test(i.text)), "no 'No Responsible' warning (inherited A counts)");
    const wb = P.io.exportWorkbook(), rows = XL.utils.sheet_to_json(wb.Sheets.Tasks);
    eq(rows.find(r => r.Name === "Build" || r["Task Name"] === "Build" || Object.values(r).includes("Build"))?.Responsible, "Ana", "export writes the Accountable as Responsible");
    P.UI.raciBy = "person"; P.switchView("raci"); document.getElementById("raciOnlyUsed").checked = true; P.renderAll();
    ok([...document.querySelectorAll("#raciWrap td.cell")].some(td => td.textContent === "a/r"), "matrix shows inherited a/r");
    P.UI.raciBy = "team";
    P.switchView("plan");
    P.openRecord(a);
    const sw = inForm("input.sw"); ok(sw.checked, "switch on"); ok(inForm(".f-party:not([disabled])") && allInForm(".f-party")[1].disabled, "Responsible picker disabled");
    sw.checked = false; sw.dispatchEvent(new Event("change", { bubbles: true }));
    ok(!task(a).r_is_a, "switch off from the form");
    m(() => O.opSetRIsA(a, true)); m(() => O.opSetRole(a, ben, "R"));
    ok(!task(a).r_is_a, "choosing a Responsible turns the switch off");
    P.toggleForm(false);
  });

  await test("form", "fields are two columns in a sensible order", () => {
    fresh(); const a = T("A"); P.openRecord(a);
    fp().style.transition = "none"; void fp().offsetWidth; // jump to the end of the slide-in
    eq(getComputedStyle(inForm(".f-fields")).gridTemplateColumns.split(" ").length, 2, "two columns at a third of the width");
    eq(allInForm(".f-field > label").map(l => l.textContent), ["Name", "Type", "Status", "Start", "Finish", "Duration", "% complete", "Accountable", "Responsible", "Parent", "WBS code", "Description"]);
    P.toggleForm(false);
  });

  await test("migrate", "schema v2 file gains the Responsible = Accountable column", () => {
    fresh(); T("Keep");
    const d = new P.SQL.Database(P.db.exportBytes()); d.run("ALTER TABLE task DROP COLUMN r_is_a; PRAGMA user_version = 2;");
    const bytes = d.export(); d.close();
    P.db.installDb(bytes); P.M.projectId = null; P.refresh();
    eq(P.scalar("PRAGMA user_version"), 4); eq(P.M.order[0].r_is_a, 0);
    m(() => O.opSetRIsA(P.M.order[0].id, true)); eq(P.M.order[0].r_is_a, 1);
  });
  // ---------- Risks and mitigants ----------
  const R = P.risk;
  const rk = id => P.M.riskById.get(id), mt = id => P.M.mitById.get(id);

  await test("risks", "status rules: manual without tasks, follows tasks, Tested by hand, controls need Tested", () => {
    fresh(); const t1 = T("Do it"); let r, a, c;
    m(() => { r = O.opAddRisk({ name: "Vendor late" }); a = O.opAddMitigant(r, "Sign backup vendor"); c = O.opAddMitigant(r, "Weekly vendor review", null, { is_control: 1 }); });
    eq([mt(a).eff, mt(a).achieved], ["Not started", false]); ok(mt(a).gaps.length, "gap: no task and not started");
    eq(rk(r).status, "Mitigating"); ok(rk(r).gaps.some(g => /mitigants? ha(s|ve) gaps/.test(g)), "risk gap names its mitigants"); ok(rk(r).gaps.includes("No Accountable"));
    m(() => O.opUpdateMitigant(a, { status: "Implemented" })); eq([mt(a).eff, mt(a).achieved], ["Implemented", true], "manual status without tasks");
    m(() => O.opLinkTask(c, t1)); eq(mt(c).eff, "Planned", "linked task not done → Planned");
    m(() => O.opSetField(t1, "status", "Done")); eq([mt(c).eff, mt(c).achieved], ["Implemented", false], "control implemented but not achieved");
    ok(mt(c).gaps.includes("Control implemented but not tested"));
    m(() => O.opUpdateMitigant(c, { status: "Tested" })); eq([mt(c).eff, mt(c).achieved], ["Tested", true]);
    eq(rk(r).status, "Mitigated"); eq(rk(r).achievedCount, 2);
    m(() => O.opUpdateRisk(r, { response: "accept" })); eq(rk(r).status, "Accepted"); ok(rk(r).gaps.includes("Accepted without a reason"));
    m(() => O.opDelete(t1)); eq(mt(c).tasks.length, 0, "deleting the task removes the link");
  });

  await test("risks", "Responsible / Accountable on risks and mitigants, inheritance and the same-as switch", () => {
    fresh(); let r, mi, ana, ben;
    m(() => { ana = O.opAddParty("person", "Ana"); ben = O.opAddParty("person", "Ben"); r = O.opAddRisk({ name: "R" }); mi = O.opAddMitigant(r, "M"); O.opSetRecParties("risk", r, "A", [ana]); });
    eq(P.M.mitById.get(mi).parties.length, 0);
    const accM = () => { const x = mt(mi); const own = x.parties.filter(p => p.role === "A"); return own.length ? own : rk(r).parties.filter(p => p.role === "A"); };
    eq(accM().map(p => p.party_id), [ana], "mitigant inherits the risk's Accountable");
    m(() => { O.opSetRecParties("mitigant", mi, "R", [ben]); O.opSetRecParties("mitigant", mi, "A", [ben]); });
    eq(mt(mi).parties.map(p => [p.party_id, p.role]), [[ben, "A"]], "a party holds one role: R moved to A");
    m(() => O.opSetRecRIsA("mitigant", mi, true)); eq(mt(mi).r_is_a, 1);
    m(() => O.opSetRecParties("mitigant", mi, "R", [ana])); eq(mt(mi).r_is_a, 0, "picking a Responsible ends same-as");
  });

  await test("risks", "split a mitigation plan into mitigants", () => {
    eq(R.splitMitigationPlan("Start early. Freeze content two weeks out! Weekly review? E.g. Q3 is fine."), ["Start early.", "Freeze content two weeks out!", "Weekly review?", "E.g. Q3 is fine."]);
    eq(R.splitMitigationPlan("- First thing\n• Second thing\n3) Third thing\n\n"), ["First thing", "Second thing", "Third thing"]);
    eq(R.splitMitigationPlan("1. Hire a backup vendor; 2. Review weekly"), ["Hire a backup vendor;", "Review weekly"], "inline numbering");
    eq(R.splitMitigationPlan(""), []);
  });

  await test("risks", "＋ Task: creates a linked task under Risk mitigation or at a spot, carrying R/A", () => {
    fresh(); const a = T("A"), b = T("B"); let r, mi, ana, ben, id1, id2;
    m(() => { ana = O.opAddParty("person", "Ana"); ben = O.opAddParty("person", "Ben"); r = O.opAddRisk({ name: "R" }); mi = O.opAddMitigant(r, "Keep a 2-week buffer in the schedule for migration rework"); O.opSetRecParties("risk", r, "A", [ana]); O.opSetRecParties("mitigant", mi, "R", [ben]); });
    localStorage.removeItem("pm.mitParent." + P.M.projectId);
    m(() => { id1 = O.opTaskFromMitigant(mi); });
    const t = task(id1); eq(t.parent?.name, "Risk mitigation", "default parent created"); ok(t.name.startsWith("Implement: Keep a 2-week buffer"), t.name);
    eq(mt(mi).tasks.map(x => x.id), [id1], "linked");
    eq(P.M.raci.get(id1).map(x => [x.party_id, x.role]).sort(), [[ana, "A"], [ben, "R"]].sort(), "R/A copied (A inherited from risk)");
    m(() => { id2 = O.opTaskFromMitigant(mi, { targetId: b, where: "before" }); });
    eq(P.M.order.map(x => x.name).slice(0, 3), ["A", task(id2).name, "B"], "placed before B");
    eq(mt(mi).eff, "Planned");
  });

  await test("migrate", "schema v3 file gains risks; notes rebuilt with task notes kept", () => {
    fresh(); const a = T("Keep"); m(() => O.opAddNote(a, "old note"));
    const d = new P.SQL.Database(P.db.exportBytes());
    d.run(`DROP TABLE mitigant_party; DROP TABLE risk_party; DROP TABLE mitigant_task; DROP TABLE mitigant; DROP TABLE risk;
      CREATE TABLE note_old(id INTEGER PRIMARY KEY, task_id INTEGER NOT NULL REFERENCES task(id) ON DELETE CASCADE, body TEXT NOT NULL, author TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT);
      INSERT INTO note_old SELECT id, task_id, body, author, created_at, updated_at FROM note; DROP TABLE note; ALTER TABLE note_old RENAME TO note; PRAGMA user_version = 3;`);
    const bytes = d.export(); d.close();
    P.db.installDb(bytes); P.M.projectId = null; P.refresh();
    eq(P.scalar("PRAGMA user_version"), 4); eq(P.notesFor(P.M.order[0].id).map(n => n.body), ["old note"]);
    let r; m(() => { r = O.opAddRisk({ name: "After upgrade" }); O.opAddRecNote("risk", r, "risk note"); });
    eq(R.recNotes("risk", r).map(n => n.body), ["risk note"]);
    throws(() => P.run("INSERT INTO note(body, created_at) VALUES ('orphan', 'x')"), /CHECK/, "a note belongs to exactly one record");
  });

  await test("risks-ui", "grid: rows, Enter adds the next mitigant, status select, gaps filter, ＋ Task", () => {
    fresh(); const t1 = T("Build"); let r, mi;
    m(() => { r = O.opAddRisk({ name: "Data loss" }); mi = O.opAddMitigant(r, "Nightly backups"); O.opAddRisk({ name: "Calm", response: "accept", accept_reason: "Low impact" }); });
    P.switchView("risks");
    eq(document.querySelectorAll("#riskBody tr.rk-risk").length, 2); eq(document.querySelectorAll("#riskBody tr.rk-mit").length, 1);
    const ta = document.querySelector(`[data-keep="m${mi}:text"]`); ta.focus();
    ta.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    eq(rk(r).mitigants.map(x => x.text), ["Nightly backups", "New mitigant"], "Enter adds a mitigant after");
    const newId = rk(r).mitigants[1].id; ok(document.activeElement === document.querySelector(`[data-keep="m${newId}:text"]`), "focus moves to the new mitigant");
    const st = document.querySelector(`tr[data-mit="${mi}"] select.rk-st`); st.value = "Implemented"; st.dispatchEvent(new Event("change"));
    eq(mt(mi).eff, "Implemented");
    document.querySelector('#riskSeg button[data-f="gaps"]').click();
    eq([...document.querySelectorAll("#riskBody tr.rk-risk")].map(x => +x.dataset.risk), [r], "gaps filter shows only risks with gaps");
    document.querySelector('#riskSeg button[data-f="all"]').click();
    [...document.querySelectorAll(`tr[data-mit="${newId}"] button`)].find(b => b.textContent === "＋ Task").click();
    eq(mt(newId).tasks.length, 1, "＋ Task linked a new task");
    ok(document.querySelector(`#riskPlanList .rp-row[data-id="${mt(newId).tasks[0].id}"] .sh`), "plan pane shows the shield");
    P.switchView("plan");
  });

  await test("risks-ui", "drag a mitigant onto a task links it; between tasks creates one there; task onto mitigant links", async () => {
    fresh(); const a = T("Alpha"), b = T("Beta"); let r, mi, mi2;
    m(() => { r = O.opAddRisk({ name: "R" }); mi = O.opAddMitigant(r, "Mitigant one"); mi2 = O.opAddMitigant(r, "Mitigant two"); });
    P.switchView("risks");
    const center = el => { const q2 = el.getBoundingClientRect(); return { x: q2.left + q2.width / 2, y: q2.top + q2.height / 2, top: q2.top, h: q2.height }; };
    const drag = (fromEl, x, y) => {
      const s = center(fromEl);
      fromEl.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, clientX: s.x, clientY: s.y }));
      window.dispatchEvent(new PointerEvent("pointermove", { clientX: s.x + 20, clientY: s.y + 20 }));
      window.dispatchEvent(new PointerEvent("pointermove", { clientX: x, clientY: y }));
      window.dispatchEvent(new PointerEvent("pointerup", { clientX: x, clientY: y }));
    };
    const rowOf = id => document.querySelector(`#riskPlanList .rp-row[data-id="${id}"]`);
    const handle = id => document.querySelector(`tr[data-mit="${id}"] .rk-drag`);
    let c = center(rowOf(b)); drag(handle(mi), c.x, c.y);
    eq(mt(mi).tasks.map(t => t.id), [b], "dropped on Beta → linked");
    c = center(rowOf(b)); drag(handle(mi2), c.x, c.top + 2);
    eq(P.M.order.map(t => t.name)[1].startsWith("Implement: Mitigant two"), true, "dropped above Beta → new task there");
    c = center(document.querySelector(`tr[data-mit="${mi2}"]`)); drag(rowOf(a), c.x, c.y);
    ok(mt(mi2).tasks.some(t => t.id === a), "task dragged onto mitigant → linked");
    P.switchView("plan");
  });

  await test("risks-ui", "record panel: fields, notes on a risk, split dialog, mitigant tasks", () => {
    fresh(); const t1 = T("Build"); let r;
    m(() => { r = O.opAddRisk({ name: "Scope creep", plan: "Freeze scope at sign-off. Change board reviews every request." }); });
    R.openRiskRecord("risk", r);
    const fp2 = document.getElementById("riskFormPane"); ok(fp2.classList.contains("open"), "panel open");
    ok(fp2.querySelector(".f-title h2").textContent.includes("Scope creep"));
    [...fp2.querySelectorAll("button")].find(b => b.textContent.includes("Split into mitigants")).click();
    const mt2 = document.querySelector("#modal textarea"); eq(mt2.value.split("\n"), ["Freeze scope at sign-off.", "Change board reviews every request."]);
    [...document.querySelectorAll("#modal button")].find(b => b.textContent === "Add mitigants").click();
    eq(rk(r).mitigants.length, 2, "split created mitigants");
    const ta = fp2.querySelector(".n-compose"); ta.value = "Raised at steering"; ta.dispatchEvent(new Event("input"));
    [...fp2.querySelectorAll("button")].find(b => b.textContent === "Post").click();
    eq(R.recNotes("risk", r).map(n => n.body), ["Raised at steering"]);
    const mid = rk(r).mitigants[0].id; R.openRiskRecord("mitigant", mid);
    ok(fp2.querySelector(".f-kind").textContent === "Mitigant");
    const sel = [...fp2.querySelectorAll("select")].find(s => s.options[0]?.textContent === "＋ Link a task…"); sel.value = String(t1); sel.dispatchEvent(new Event("change"));
    eq(mt(mid).tasks.map(t => t.id), [t1], "linked from the record");
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    ok(!fp2.classList.contains("open"), "Esc closes");
    P.switchView("plan");
  });

  await test("risks", "closeout summary, rows and Excel export", () => {
    fresh(); const t1 = T("Done task"); let r, a2;
    m(() => { r = O.opAddRisk({ name: "R1" }); a2 = O.opAddMitigant(r, "Do X"); O.opLinkTask(a2, t1); O.opSetField(t1, "status", "Done"); O.opAddMitigant(r, "Control Y", null, { is_control: 1, status: "Implemented", testing: "Sample 5 cases" });
      O.opAddRisk({ name: "R2", response: "accept", accept_reason: "Cheap to absorb" }); });
    eq(R.closeoutSummary(), "1 of 2 mitigants achieved · 0 of 1 risks mitigated · 1 accepted");
    const rows = R.closeoutRows();
    eq(rows.map(x => [x.risk, x.mitigant, x.achieved]), [["R1", "Do X", "Yes"], ["R1", "Control Y", "No"], ["R2", "", "n/a"]]); eq(rows[2].reason, "Cheap to absorb");
    ok(rows[0].evidence.startsWith("1 Done task (Done"), rows[0].evidence);
    const wb = P.io.exportWorkbook(); eq(wb.SheetNames.filter(n => /risk|mitigant/i.test(n)), ["Risk register", "Mitigants", "Risk closeout"], "risk sheets in export");
  });

  // One plan with everything a risk can carry, for the round-trip tests below.
  const riskPlan = () => {
    fresh(); const a = T("Build"), b = T("Test"); let ids = {};
    m(() => {
      const ana = O.opAddParty("person", "Ana"), ben = O.opAddParty("person", "Ben"), eng = O.opAddParty("team", "Eng");
      const r1 = O.opAddRisk({ name: "Vendor late", description: "Parts ship from abroad", plan: "Backup vendor", probability: "H", impact: "M" });
      O.opSetRecParties("risk", r1, "A", [ana]); O.opSetRecRIsA("risk", r1, true);
      const m1 = O.opAddMitigant(r1, "Second supplier"); O.opLinkTask(m1, a); O.opLinkTask(m1, b); O.opSetRecParties("mitigant", m1, "R", [ben, eng]);
      const m2 = O.opAddMitigant(r1, "Weekly check", null, { is_control: 1, status: "Tested", testing: "Sampled 4 weeks", handed_to: "Ops" });
      O.opSetRecParties("mitigant", m2, "A", [ben]);
      const r2 = O.opAddRisk({ name: "Office move", response: "accept", accept_reason: "Low cost" });
      ids = { a, b, r1, r2, m1, m2 };
    });
    return ids;
  };
  const riskSnap = () => P.M.risks.map(r => [r.name, r.description, r.plan, r.response, r.accept_reason, r.probability, r.impact, r.r_is_a,
    r.parties.map(p => p.role + ":" + P.M.parties.get(p.party_id).name).sort().join(","),
    r.mitigants.map(x => [x.text, x.is_control, x.status, x.testing, x.handed_to, x.r_is_a, x.tasks.map(t => t.name).join(","), x.parties.map(p => p.role + ":" + P.M.parties.get(p.party_id).name).sort().join(",")])]);

  await test("roundtrip", "risks, mitigants, their people and task links survive export → import as a new project", async () => {
    riskPlan(); const before = riskSnap();
    const { rep } = await runImport("rk.xlsx", XL.write(P.io.exportWorkbook(), { type: "array", bookType: "xlsx" }), W => { W.mode = "new"; ok(W.risks && W.risks.risks.length === 2 && W.risks.mits.length === 2, "sheets read"); });
    eq(rep.risks, { added: 2, updated: 0, mitAdded: 2, mitUpdated: 0 });
    eq(riskSnap(), before, "identical after round trip");
    ok(P.M.risks.every(r => r.project_id === P.M.projectId) && P.M.risks[0].mitigants[0].tasks.every(t => t.project_id === P.M.projectId), "linked to the new project's tasks");
  });

  await test("import-update", "edit the risk sheets, re-import updates by ID without duplicating", async () => {
    const { a, b, r1, m1, m2 } = riskPlan();
    // Unchanged re-import: nothing added.
    let { rep } = await runImport("same.xlsx", XL.write(P.io.exportWorkbook(), { type: "array", bookType: "xlsx" }));
    eq(rep.risks, { added: 0, updated: 2, mitAdded: 0, mitUpdated: 2 }, "unchanged sheet only updates");
    eq(P.scalar("SELECT COUNT(*) FROM mitigant"), 2);
    const wb = P.io.exportWorkbook(), rs = wb.Sheets["Risk register"], ms = wb.Sheets.Mitigants;
    rs.B2.v = "Vendor very late"; rs.G2.v = "Low"; rs.H2.v = "Huge";            // rename; probability; bad impact is left alone
    ms.F2.v = String(b);                                                      // Second supplier now only implemented by Test
    ms.B3.v = 2 + r1;                                                         // risk ID that doesn't exist
    XL.utils.sheet_add_aoa(ms, [["", r1, "Escrow parts", "No", "Planned", "", "Ana", "", "", ""]], { origin: -1 });
    let preview;
    ({ rep } = await runImport("edit.xlsx", XL.write(wb, { type: "array", bookType: "xlsx" }), W => { eq(W.mode, "update"); preview = P.io.riskPreviewText(); ok(W.risks.warnings.some(w => /Huge/.test(w)), "bad impact warned"); }));
    ok(/2 risks and 2 mitigants match existing ones/.test(preview), preview);
    const r = P.M.riskById.get(r1);
    eq([r.name, r.probability, r.impact], ["Vendor very late", "L", "M"]);
    eq(P.M.mitById.get(m1).tasks.map(t => t.id), [b], "links replaced");
    eq(P.M.mitById.get(m2).risk_id, r1, "row with an unknown risk ID is skipped, mitigant untouched");
    ok(rep.warnings.some(w => /isn't in the Risk register/.test(w)), "warned: " + rep.warnings);
    eq(r.mitigants.map(x => x.text), ["Second supplier", "Weekly check", "Escrow parts"], "blank ID adds a mitigant");
    eq(r.mitigants[2].parties.map(p => P.M.parties.get(p.party_id).name), ["Ana"]);
  });

  await test("risks", "import a risk register: mapping, owners, LMH, split plans", () => {
    fresh(); let ana; m(() => { ana = O.opAddParty("person", "Ana Ruiz"); });
    const wb = XL.utils.book_new();
    XL.utils.book_append_sheet(wb, XL.utils.aoa_to_sheet([
      ["Risk register"], [],
      ["Risk Title", "Risk Owner", "Likelihood", "Impact", "Mitigation Plan", "Response"],
      ["Vendor late", "ana ruiz", "High", 2, "Backup vendor on standby. Weekly vendor call.", "Mitigate"],
      ["Office move", "New Person", "low", "Medium", "", "Accept"],
    ]), "Risks");
    R.loadRiskImport("register.xlsx", XL.write(wb, { type: "array", bookType: "xlsx" }));
    const items = R.riskImportItems();
    eq(items.map(x => [x.name, x.A, x.probability, x.impact, x.response]), [["Vendor late", "ana ruiz", "H", "L", "mitigate"], ["Office move", "New Person", "L", "M", "accept"]]);
    R.doRiskImport(items);
    eq(P.M.risks.map(x => [x.name, x.mitigants.length]), [["Vendor late", 2], ["Office move", 0]]);
    eq(P.M.risks[0].parties.map(p => p.party_id), [ana], "owner matched case-insensitively");
    ok([...P.M.parties.values()].some(p => p.name === "New Person"), "unknown owner added as a person");
    P.switchView("plan");
  });

  await test("risks", "task record Risks tab and outline shield", () => {
    fresh(); const t1 = T("Build"); let r, mi;
    m(() => { r = O.opAddRisk({ name: "R" }); mi = O.opAddMitigant(r, "M"); O.opLinkTask(mi, t1); });
    P.switchView("plan"); P.renderAll();
    ok(document.querySelector(`#gridRows .grow[data-id="${t1}"]`).textContent.includes("🛡1"), "shield in outline");
    P.openRecord(t1); document.querySelector('#formPane .rel-tab[data-tab="risks"]').click();
    eq(document.querySelector('#formPane .rel-tab[data-tab="risks"] .cnt').textContent, "1");
    ok(document.querySelector("#formPane .rel-body").textContent.includes("M"), "lists the mitigant");
    P.toggleForm(false);
  });
  await test("risks-review", "toLMH handles words, 1–3 and 1–5 scales, percentages", () => {
    const L = R.toLMH;
    eq(["Minor", "minor", "Moderate", "Major", "Very High", "low", "x"].map(v => L(v)), ["L", "L", "M", "H", "H", "L", ""]);
    eq([1, 2, 3].map(v => L(v, 3)), ["L", "M", "H"], "1–3 scale"); eq([1, 2, 3, 4, 5].map(v => L(v, 5)), ["L", "L", "M", "H", "H"], "1–5 scale");
    eq(["90%", "0.9", "0.2", "45%"].map(v => L(v)), ["H", "H", "L", "M"], "percentages and fractions");
  });

  await test("risks-review", "Backspace on an empty mitigant deletes it once, cleanly; not when it has content attached", () => {
    fresh(); let r, a, b;
    m(() => { r = O.opAddRisk({ name: "R" }); a = O.opAddMitigant(r, "Keep"); b = O.opAddMitigant(r, "Drop me"); O.opUpdateMitigant(a, { testing: "has notes" }); });
    P.switchView("risks");
    const errBefore = document.getElementById("toast").className;
    let ta = document.querySelector(`[data-keep="m${b}:text"]`); ta.focus(); ta.value = ""; ta.dispatchEvent(new Event("input"));
    ta.dispatchEvent(new KeyboardEvent("keydown", { key: "Backspace", bubbles: true }));
    eq(rk(r).mitigants.map(x => x.text), ["Keep"]); ok(!/err/.test(document.getElementById("toast").className) || /err/.test(errBefore), "no 'not found' error");
    eq(document.querySelectorAll("#riskBody table.rk").length, 1, "table rendered once");
    ta = document.querySelector(`[data-keep="m${a}:text"]`); ta.focus(); ta.value = ""; ta.dispatchEvent(new KeyboardEvent("keydown", { key: "Backspace", bubbles: true }));
    ok(P.M.mitById.has(a), "mitigant with testing notes is not quick-deleted");
    ta.value = "Keep"; P.switchView("plan");
  });

  await test("risks-review", "import: title rows above the header, a Risk ID column, 'Smith, John' as one owner", () => {
    fresh();
    const wb = XL.utils.book_new();
    XL.utils.book_append_sheet(wb, XL.utils.aoa_to_sheet([["Programme risk register", "Q3"], ["Risk ID", "Risk", "Owner", "Likelihood", "Impact", "Mitigation"], ["R-1", "Late vendor", "Smith, John", 3, 3, "Do A. Do B."]]), "Register");
    R.loadRiskImport("reg.xlsx", XL.write(wb, { type: "array", bookType: "xlsx" }));
    eq(P.risk.RI.headers[1], "Risk", "header row found below the title"); eq(P.risk.RI.map.name, 1, "Risk ID not used as the name");
    const items = R.riskImportItems(); eq(items.map(x => [x.name, x.probability, x.impact]), [["Late vendor", "H", "H"]], "1–3 scale detected");
    R.doRiskImport(items);
    eq([...P.M.parties.values()].map(p => p.name), ["Smith, John"]);
  });

  await test("risks-review", "opening another file clears the risk selection; status select disables task-driven options", () => {
    fresh(); const t1 = T("T"); let r, mi;
    m(() => { r = O.opAddRisk({ name: "R" }); mi = O.opAddMitigant(r, "M"); O.opLinkTask(mi, t1); });
    R.openRiskRecord("mitigant", mi);
    const opts = [...document.querySelector(`tr[data-mit="${mi}"] select.rk-st`).options].map(o => [o.value, o.disabled]);
    eq(opts, [["Not started", true], ["Planned", false], ["Implemented", true], ["Tested", false]]);
    P.db.installDb(P.db.exportBytes()); eq([P.UI.riskSel, P.UI.riskForm], [null, false]);
    P.refresh(); P.switchView("plan");
  });
  await test("raci-ra", "matrix cycle includes A/R; task names open the record", () => {
    fresh(); const a = T("Build"); let ana;
    m(() => { ana = O.opAddParty("person", "Ana"); });
    P.UI.raciBy = "person"; P.switchView("raci"); document.getElementById("raciOnlyUsed").checked = false; P.renderAll();
    const cell = () => document.querySelector(`#raciWrap td.cell[data-t="${a}"][data-p="${ana}"]`);
    const seen = []; for (let i = 0; i < 6; i++) { cell().click(); seen.push(cell().textContent); }
    eq(seen, ["R", "A", "A/R", "C", "I", ""]);
    cell().click(); cell().click(); cell().click(); eq([cell().textContent, task(a).r_is_a], ["A/R", 1]);
    cell().click(); eq([cell().textContent, task(a).r_is_a], ["C", 0], "leaving A/R turns the switch off");
    document.querySelector(`#raciWrap [data-open="${a}"]`).click();
    eq([P.UI.view, P.UI.selId, P.UI.form], ["raci", a, true], "task link opens its record on the RACI page");
    const fp3 = document.getElementById("formPane"); ok(fp3.classList.contains("open") && document.getElementById("raciSplit").contains(fp3), "panel slides out beside the matrix");
    P.toggleForm(false); P.switchView("plan"); ok(document.getElementById("split").contains(fp3) || !fp3.classList.contains("open"), "panel not left open on the RACI page");
    document.getElementById("raciOnlyUsed").checked = true;
  });
  await test("raci-team", "one team per person; team view rolls up members; click cycles the team; + hands the role to a member", () => {
    fresh(); const a = T("Build"); let ana, ben, eng, ops;
    m(() => { ana = O.opAddParty("person", "Ana Ruiz"); ben = O.opAddParty("person", "Ben Okafor"); eng = O.opAddParty("team", "Eng"); ops = O.opAddParty("team", "Ops"); O.opSetMembers(eng, [ana, ben]); });
    m(() => O.opSetMembers(ops, [ben])); eq([P.M.teamsOf.get(ben), P.M.members.get(eng)], [[ops], [ana]], "joining Ops moved Ben out of Eng");
    m(() => { O.opSetRole(a, ana, "R"); O.opSetRole(a, ben, "C"); });
    P.UI.raciBy = "team"; P.switchView("raci"); document.getElementById("raciOnlyUsed").checked = true; P.renderAll();
    const cell = tm => document.querySelector(`#raciWrap td.tcell[data-t="${a}"][data-team="${tm}"]`);
    eq([cell(eng).querySelector(".mr").textContent, cell(ops).querySelector(".mr").textContent], ["R·AR", "C·BO"], "members roll up under their team");
    cell(eng).click(); eq(P.M.raci.get(a).find(r => r.party_id === eng)?.role, "R", "click cycles the team's own role");
    cell(eng).click(); cell(eng).click(); eq([cell(eng).querySelector("b").textContent, task(a).r_is_a], ["A/R", 1]);
    cell(eng).querySelector(".plus").click();
    [...document.querySelectorAll("#pop .pick-btn")].find(b => b.textContent.startsWith("Ana Ruiz")).click();
    eq(P.M.raci.get(a).map(r => [P.M.parties.get(r.party_id).name, r.role]).sort(), [["Ana Ruiz", "A"], ["Ben Okafor", "C"]], "team's A moved to Ana (A/R switch kept)");
    eq(task(a).r_is_a, 1);
    P.switchView("plan");
  });

  // ---------- Trust boundary and save safety (DECISIONS #29, #62–#64) ----------
  const variant = fn => { const d = new P.SQL.Database(P.db.exportBytes()); fn(d); const b = d.export(); d.close(); return b; };
  await test("trust", "another app's SQLite file is refused and left unchanged", () => {
    fresh(); T("keep"); const r0 = P.db.rev;
    const d = new P.SQL.Database(); d.run("CREATE TABLE contacts(id INTEGER PRIMARY KEY, name TEXT); CREATE TABLE note(id INTEGER PRIMARY KEY, body TEXT, colour TEXT)");
    const bytes = d.export(); d.close();
    throws(() => P.db.installDb(bytes), /not an Offline PM plan/);
    eq([P.db.rev, P.M.order.map(t => t.name)], [r0, ["keep"]], "current plan untouched");
    throws(() => P.db.installDb(variant(x => x.run("DROP TABLE dep; CREATE TABLE dep(id TEXT PRIMARY KEY, pred_id, succ_id, type, lag)"))), /layout/, "unexpected table layout refused");
  });
  await test("trust", "values the UI trusts are repaired on open; foreign triggers and views dropped; nothing runs", async () => {
    fresh(); const a = T("A"), b = T("B"); let ana;
    m(() => { O.opAddDep(a, b, "FS", 0); ana = O.opAddParty("person", "Ana"); O.opSetRole(a, ana, "R"); });
    const pwn = "<img src=x onerror=window.__pmPwn=1>";
    const bytes = variant(d => {
      d.run("PRAGMA ignore_check_constraints = ON");
      d.run("UPDATE dep SET lag=?, type=?", [pwn, pwn]); d.run("UPDATE task SET percent=? WHERE id=?", [pwn, a]);
      d.run("UPDATE raci SET role=?", [pwn]); d.run("INSERT INTO note(task_id, body, created_at) VALUES (999, 'orphan', '2026-01-01')");
      d.run("CREATE TRIGGER evil AFTER UPDATE ON task BEGIN UPDATE task SET name='owned'; END; CREATE VIEW v AS SELECT 1");
    });
    delete window.__pmPwn;
    const note = P.db.installDb(bytes); P.M.projectId = null; P.refresh(); P.renderAll();
    ok(/Repaired \d+ invalid rows/.test(note), "repair reported: " + note);
    eq(P.q("SELECT typeof(lag) t, lag, type FROM dep"), [{ t: "integer", lag: 0, type: "FS" }], "lag and type repaired");
    eq([P.scalar("SELECT typeof(percent) FROM task WHERE id=" + a), P.scalar("SELECT COUNT(*) FROM raci"), P.scalar("SELECT COUNT(*) FROM note")], ["integer", 0, 0], "percent fixed, bad role and orphan note removed");
    eq(P.q("SELECT type, name FROM sqlite_master WHERE type IN ('trigger','view')"), [{ type: "trigger", name: "team_member_kinds" }], "only our trigger left");
    m(() => O.opSetField(b, "name", "B2")); eq(P.M.tasks.get(a).name, "A", "dropped trigger doesn't fire");
    await new Promise(r => setTimeout(r, 50)); ok(!window.__pmPwn && !document.querySelector("#gridRows img, #gDeps img"), "no injected markup rendered");
    ok(document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content.includes("connect-src 'none'"), "CSP present");
  });
  await test("trust", "undo never brings back an earlier file id", () => {
    fresh(); T("x"); P.run("UPDATE meta SET value='copy-id' WHERE key='file_id'"); // what Save a copy does
    P.undo(); eq(P.db.fileId, "copy-id");
  });
  await test("save-safety", "an aborted storage write rejects instead of hanging; read-only tab refuses changes", async () => {
    let err; try { await P.db.idb.tx("readwrite", s => { const r = s.put(1, "t-abort"); s.transaction.abort(); return r; }); } catch (e) { err = e; }
    ok(err, "aborted transaction rejected");
    fresh(); const n = P.M.order.length;
    P.db.setReadOnly("Test: read-only"); ok(!document.getElementById("roBanner").hidden, "banner shown");
    ok(!P.mutate("t", () => O.opAddTask({ name: "nope" })), "mutate refused"); P.refresh(); eq(P.M.order.length, n);
    P.db.endReadOnly(); ok(P.mutate("t", () => O.opAddTask({ name: "yes" })), "writes again");
  });
  await test("save-safety", "file vs browser copy: identity by file id; edits on both sides keep the loser as a backup", async () => {
    const handle = bytes => ({ name: "t.db", store: bytes,
      async getFile() { return new File([this.store], "t.db"); },
      async createWritable() { const h = this; let data; return { async write(b) { data = b; }, async close() { h.store = new Uint8Array(data); } }; } });
    const backups = async () => (await P.db.idb.get("backups")) || [];
    const newestBackup = async t0 => (await backups()).find(b => b.ts >= t0);
    const nameIn = bytes => { const d = new P.SQL.Database(bytes); const r = [d.exec("SELECT value FROM meta WHERE key='rev'")[0].values[0][0], d.exec("SELECT name FROM task ORDER BY id")[0]?.values.map(v => v[0])]; d.close(); return r; };
    const setRev = (d, n) => d.run("UPDATE meta SET value=? WHERE key='rev'", [String(n)]);
    try {
      // A: another plan (different file id) wins even with a lower rev; the browser copy is kept.
      fresh(); const a = T("mine"); await P.flushSaves(); let t0 = Date.now();
      let h = handle(variant(d => { d.run("UPDATE meta SET value='other-plan' WHERE key='file_id'"); d.run("UPDATE task SET name='theirs'"); setRev(d, 1); }));
      P.db.attach(h, null); await P.db.syncWithFile(); await P.flushSaves();
      eq(P.M.order.map(t => t.name), ["theirs"], "file loaded"); ok(await newestBackup(t0), "browser copy kept");
      // B: both sides edited since the last write; file is ahead → file wins, browser edits kept.
      fresh(); T("base"); await P.flushSaves(); let base = P.db.rev;
      h = handle(variant(d => { d.run("UPDATE task SET name='theirs'"); setRev(d, base + 2); }));
      T("my edit"); t0 = Date.now(); P.db.attach(h, base); await P.db.syncWithFile(); await P.flushSaves();
      eq(P.M.order.map(t => t.name), ["theirs"]); ok((await newestBackup(t0))?.reason.includes(`rev ${base + 1}`), "browser edits kept");
      // C: file unchanged since the last write → catch up, no backup.
      fresh(); T("base"); await P.flushSaves(); base = P.db.rev; h = handle(P.db.exportBytes());
      T("new"); t0 = Date.now(); P.db.attach(h, base); await P.db.syncWithFile(); await P.flushSaves();
      eq(nameIn(h.store), [String(base + 1), ["base", "new"]], "file caught up"); ok(!(await newestBackup(t0)), "no backup needed");
      // D: same rev on both sides but different edits → file wins (tie), browser copy kept. Old logic called this "agree".
      fresh(); T("base"); await P.flushSaves(); base = P.db.rev;
      h = handle(variant(d => { d.run("UPDATE task SET name='theirs'"); setRev(d, base + 1); }));
      T("mine"); t0 = Date.now(); P.db.attach(h, base); await P.db.syncWithFile(); await P.flushSaves();
      eq(P.M.order.map(t => t.name), ["theirs"]); ok(await newestBackup(t0), "tie keeps the browser copy");
      // E: file changed elsewhere but the browser is further ahead → browser wins, the file's version is kept.
      fresh(); T("base"); await P.flushSaves(); base = P.db.rev;
      h = handle(variant(d => { d.run("UPDATE task SET name='theirs'"); setRev(d, base + 1); }));
      T("m1"); T("m2"); t0 = Date.now(); P.db.attach(h, base); await P.db.syncWithFile(); await P.flushSaves();
      eq(nameIn(h.store)[1], ["base", "m1", "m2"], "browser copy written"); ok((await newestBackup(t0))?.file === "t.db", "file's version kept");
    } finally { P.db.attach(null); await P.db.idb.del("backups"); }
  });

  // ---------- High-tier fixes (DECISIONS #65–#68) ----------
  await test("violation", "a milestone falls at the end of its day", () => {
    fresh(); const uat = T("UAT", null, "2026-11-02", "2026-11-06"), go = T("Go-live", null, "2026-11-06", "2026-11-06", { kind: "milestone" }), thu = T("Early", null, "2026-11-05", "2026-11-05", { kind: "milestone" });
    const after = T("Hypercare", null, "2026-11-06", "2026-11-06"), mon = T("Retro", null, "2026-11-09", "2026-11-09");
    m(() => { O.opAddDep(uat, go); O.opAddDep(uat, thu); O.opAddDep(go, after); O.opAddDep(go, mon); });
    const v = (p, s) => P.M.deps.find(d => d.pred_id === p && d.succ_id === s).violated;
    eq([v(uat, go), v(uat, thu), v(go, after), v(go, mon)], [false, true, true, false], "same-day milestone ok; day before conflicts; successor waits for the next working day");
  });
  await test("deps", "cycles through a summary task and its subtasks are refused, including after indent", () => {
    fresh(); const p2 = T("P"), k2 = T("K", p2), c2 = T("C", p2), y2 = T("Y");
    m(() => O.opAddDep(c2, y2));
    ok(!P.mutate("t", () => O.opAddDep(y2, p2)), "Y→P refused when P contains C and C→Y");
    eq(P.M.deps.length, 1);
    fresh(); const p3 = T("P"), k3 = T("K", p3), c3 = T("C"), y3 = T("Y");
    m(() => { O.opAddDep(c3, y3); O.opAddDep(y3, p3); });
    ok(!P.mutate("t", () => O.opIndent(c3)), "indenting C under P refused"); eq(task(c3).parent_id, null);
    ok(!P.mutate("t", () => O.opAddDep(k3, y3, "SS")), "K (inside P, after Y) can't start before Y starts");
    const z3 = T("Z"); m(() => O.opAddDep(y3, z3)); eq(P.M.deps.length, 3, "unrelated links still allowed");
  });
  await test("risks", "a hand-set Tested only counts once the linked tasks are done", () => {
    fresh(); const t1 = T("Build control"); let r, c;
    m(() => { r = O.opAddRisk({ name: "Fraud" }); c = O.opAddMitigant(r, "Dual approval", null, { is_control: 1 }); O.opLinkTask(c, t1); O.opUpdateMitigant(c, { status: "Tested" }); });
    eq([mt(c).eff, mt(c).achieved, rk(r).status], ["Planned", false, "Mitigating"]);
    ok(mt(c).gaps.some(g => /Marked Tested, but task 1 isn't done/.test(g)), "gap names the open task");
    m(() => O.opSetField(t1, "status", "Done")); eq([mt(c).eff, mt(c).achieved, rk(r).status], ["Tested", true, "Mitigated"]);
  });
  await test("import-update", "duplicate and malformed IDs never overwrite the wrong task; ANSI CSV keeps accents", async () => {
    fresh(); const a = T("Alpha"), b = T("Beta");
    const wb = P.io.exportWorkbook(); const ws = wb.Sheets.Tasks;
    XL.utils.sheet_add_aoa(ws, [["", String(a), 1, "Alpha copy", "Task"], ["", `${b}b`, 1, "Beta-ish", "Task"]], { origin: -1 });
    const { rep } = await runImport("dup.xlsx", XL.write(wb, { type: "array", bookType: "xlsx" }), W => eq(W.mode, "update"));
    eq([rep.updated, rep.added], [2, 2], "first row with an ID updates it; the copy and '2b' are added");
    eq(P.M.order.map(t => t.name), ["Alpha", "Beta", "Alpha copy", "Beta-ish"]);
    const ansi = new Uint8Array([...new TextEncoder().encode("Name,Start\nJos"), 0xE9, ...new TextEncoder().encode(" Garc"), 0xED, ...new TextEncoder().encode("a,2026-03-02\n")]);
    const r2 = await runImport("ansi.csv", ansi, W => { eq([W.encoding, W.sameFile], ["windows-1252", false]); W.mode = "new"; });
    eq(P.M.order.map(t => t.name), ["José García"]);
  });
  await test("save-safety", "a failed disk write is retried", async () => {
    fresh(); let fails = 1, store = null;
    const h = { name: "r.db", async getFile() { return new File([store || new Uint8Array()], "r.db"); },
      async createWritable() { if (fails-- > 0) throw new DOMException("locked", "NoModificationAllowedError"); let d; return { async write(b) { d = b; }, async close() { store = new Uint8Array(d); } }; } };
    try {
      P.db.attach(h, null); T("x"); await P.flushSaves();
      ok(P.db.diskRev !== P.db.rev && !store, "first write failed");
      await new Promise(r => setTimeout(r, 2600)); await P.flushSaves();
      eq(P.db.diskRev, P.db.rev, "retried and caught up"); ok(store?.length, "file written");
    } finally { P.db.attach(null); }
  });

  // ---------- Medium tier, batch A: import/export and data (DECISIONS #5, #48, #69) ----------
  await test("dates", "impossible ISO dates are rejected", () => {
    eq([U.parseYMD("2026-02-30"), U.parseYMD("2026-13-01"), U.parseYMD("2028-02-29") != null], [null, null, true]);
    fresh(); const a = T("x"); ok(!P.mutate("t", () => O.opSetField(a, "start", "2026-02-30")), "edit refused"); eq(U.fmtYMD(task(a).S), "2026-03-02");
  });
  await test("rollup", "a task that loses its last subtask keeps what it showed as a summary", () => {
    fresh(); const p = T("P", null, "2026-03-02", "2026-03-02"), c = T("C", p, "2026-03-09", "2026-03-13");
    m(() => O.opSetField(c, "status", "Done"));
    m(() => O.opDelete(c));
    eq([U.fmtYMD(task(p).S), U.fmtYMD(task(p).F), task(p).P, task(p).ST], ["2026-03-09", "2026-03-13", 100, "Done"]);
  });
  await test("roundtrip", "'Responsible same as Accountable' survives export and import (own Accountable)", async () => {
    fresh(); const p = T("P"), a = T("Own"), c = T("Child", p); let ana, ben;
    m(() => { ana = O.opAddParty("person", "Ana"); ben = O.opAddParty("person", "Ben"); O.opSetRole(a, ana, "A"); O.opSetRIsA(a, true); O.opSetRole(p, ben, "A"); O.opSetRIsA(c, true); });
    const buf = XL.write(P.io.exportWorkbook(), { type: "array", bookType: "xlsx" });
    await runImport("rt2.xlsx", buf, W => W.mode = "new");
    const byName = n => P.M.order.find(t => t.name === n);
    eq([byName("Own").r_is_a, byName("Child").r_is_a], [1, 0], "switch back on where the task has its own A");
    eq(P.q("SELECT t.name, r.role FROM raci r JOIN task t ON t.id=r.task_id WHERE t.project_id=? AND r.role='R'", [P.M.projectId]), [{ name: "Child", role: "R" }], "inherited case kept as an R");
  });
  await test("import-update", "predecessor problems show before importing; such rows keep their links", async () => {
    fresh(); const a = T("A"), b = T("B"); m(() => O.opAddDep(a, b));
    const wb = P.io.exportWorkbook(); const ws = wb.Sheets.Tasks; ws["K3"].v = "9.9";
    let warned;
    await runImport("bad.xlsx", XL.write(wb, { type: "array", bookType: "xlsx" }), W => { warned = P.io.buildPlan().warnings.filter(w => /9\.9/.test(w)); });
    ok(warned.length && /existing links are kept/.test(warned[0]), "preview warns: " + warned);
    eq(P.M.deps.length, 1, "link kept");
  });
  await test("import", "step-3 choices beat the People sheet; one team per person; ANSI-safe names; prototype-named values", async () => {
    fresh(); const a = T("A"); let ana, eng;
    m(() => { ana = O.opAddParty("person", "Ana"); eng = O.opAddParty("team", "Eng"); O.opSetMembers(eng, [ana]); O.opSetRole(a, ana, "R"); });
    const buf = XL.write(P.io.exportWorkbook(), { type: "array", bookType: "xlsx" });
    m(() => O.opDeleteParty(ana));
    await runImport("ppl.xlsx", buf, W => { W.mode = "new"; W.peopleMap["ana"] = "ignore"; });
    eq(P.scalar("SELECT COUNT(*) FROM party WHERE name='Ana'"), 0, "ignored person not created from the People sheet");
    const csv = new TextEncoder().encode("Name,Status,Responsible\nOne,constructor,toString\n");
    const r = await runImport("proto.csv", csv, W => W.mode = "new");
    eq([P.M.order[0].ST, P.M.parties.size > 0], ["Not started", true], "odd values import instead of aborting");
  });
  await test("export", "CSV: one kind of line break, wider formula guard, notes unguarded on re-import", async () => {
    fresh(); const a = T("A");
    m(() => O.opSetField(a, "notes", "\t=1+1")); ok(P.io.csvText().includes("'\t=1+1"), "tab-led formula guarded");
    m(() => O.opSetField(a, "notes", "line1\rline2"));
    const csv = P.io.csvText(); ok(csv.includes("line1\nline2") && !csv.includes("\r"), "CR normalised");
    m(() => O.opSetField(a, "notes", "- bullet"));
    await runImport("n.csv", new TextEncoder().encode(P.io.csvText()), W => W.mode = "new");
    eq(P.M.order[0].notes, "- bullet", "guard stripped from notes");
  });
  await test("import", "a huge declared range reads quickly; column guesses prefer the main synonym", async () => {
    const wb = XL.utils.book_new(), ws = XL.utils.aoa_to_sheet([["Name", "Start"], ["Only", "2026-03-02"]]); ws["!ref"] = "A1:Z200000";
    XL.utils.book_append_sheet(wb, ws, "S");
    const bytes = XL.write(wb, { type: "array", bookType: "xlsx" });
    const t0 = performance.now(); await runImport("big.xlsx", bytes, W => W.mode = "new");
    ok(performance.now() - t0 < 3000, "took " + Math.round(performance.now() - t0) + "ms"); eq(P.M.order.map(t => t.name), ["Only"]);
    eq(P.io.autoMap(["Baseline Start", "Start", "Description", "Task Name", "Completed On"]), { 1: "start", 3: "name" }, "Start and Task Name win; Completed On isn't % complete");
  });

  // ---------- Medium tier, batch B: editing robustness ----------
  await test("grid", "a refused cell edit keeps the editor and what was typed", () => {
    fresh(); P.switchView("plan"); const a = T("A"); P.selectTask(a, { col: "start" });
    P.cmd.startEdit("start", "31/31/2026");
    const ed = () => document.querySelector("#gridCanvas .cell-editor");
    ed().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    ok(ed() && ed().value === "31/31/2026", "editor still open with the text"); eq(U.fmtYMD(task(a).S), "2026-03-02");
    ed().dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); ok(!ed(), "Escape closes it");
  });
  await test("undo", "one change at a time; undo stays right after a change made outside mutate", async () => {
    fresh();
    ok(!P.mutate("outer", () => { O.opAddTask({ name: "A" }); P.mutate("inner", () => O.opAddTask({ name: "B" })); }), "nested change refused");
    P.refresh(); eq(P.M.order.length, 0, "nothing half-committed");
    ok(!P.mutate("t", () => { O.opAddTask({ name: "C" }); P.db.exportBytes(); }), "copying mid-change refused"); P.refresh(); eq(P.M.order.length, 0);
    T("a"); await P.flushSaves(); P.run("UPDATE task SET name='raw'"); T("b"); P.undo(); P.refresh();
    eq(P.M.order.map(t => t.name), ["raw"], "snapshot taken after the outside change");
  });
  await test("wbs-ops", "Escape cancels a row drag", () => {
    fresh(); P.switchView("plan"); const a = T("A"), b = T("B"); P.renderAll();
    const cell = document.querySelector(`#gridRows .grow[data-id="${a}"] [data-col="wbs"]`), r = cell.getBoundingClientRect();
    const target = document.querySelector(`#gridRows .grow[data-id="${b}"]`).getBoundingClientRect();
    cell.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, clientX: r.left + 5, clientY: r.top + 5 }));
    window.dispatchEvent(new PointerEvent("pointermove", { clientX: r.left + 5, clientY: target.bottom - 2 }));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    window.dispatchEvent(new PointerEvent("pointerup", { clientX: r.left + 5, clientY: target.bottom - 2 }));
    eq(P.M.order.map(t => t.name), ["A", "B"], "order unchanged"); ok(document.getElementById("dragTip").hidden, "tip hidden");
  });

  // ---------- Medium tier, batch C: keyboard and accessibility ----------
  await test("a11y", "outline is a treegrid; Esc clears the selection so Tab can leave; Alt+Shift+→ indents", () => {
    fresh(); P.switchView("plan"); const a = T("A"), b = T("B"); P.selectTask(b); P.renderAll();
    const gb = document.getElementById("gridBody"), row = document.getElementById("gr-" + b);
    eq([gb.getAttribute("role"), row?.getAttribute("role"), row?.getAttribute("aria-level"), row?.getAttribute("aria-selected"), gb.getAttribute("aria-activedescendant")], ["treegrid", "row", "1", "true", "gr-" + b]);
    const key = (k, o = {}) => { const ev = new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...o }); gb.dispatchEvent(ev); return ev.defaultPrevented; };
    key("ArrowRight", { altKey: true, shiftKey: true }); eq(task(b).parent_id, a, "Alt+Shift+→ indents");
    key("Escape"); eq(P.UI.selId, null, "Esc cleared the selection");
    ok(!key("Tab"), "Tab not captured without a selection");
  });
  await test("trust", "html`` escapes values, nests results, and setHtml refuses plain strings", () => {
    const { html, setHtml } = U, div = document.createElement("div");
    setHtml(div, html`<b title="${'"x"'}">${"<i>a</i>"}</b>${[html`<u>1</u>`, "<2>"]}${null}${false}${0}`);
    eq(div.innerHTML, '<b title="&quot;x&quot;">&lt;i&gt;a&lt;/i&gt;</b><u>1</u>&lt;2&gt;0');
    throws(() => setHtml(div, "<b>raw</b>"), /html/, "plain string refused");
    throws(() => html`<a>` + html`</a>`, /Nest/, "joining with + refused");
  });
  await test("trust", "names made of markup show as text in every view", async () => {
    fresh(); const evil = '<img src=x onerror="window.__xss=1">'; window.__xss = 0;
    const a = T(evil + " task"), p = T(evil + " phase"), c = T("child", p); let ana, eng;
    m(() => { ana = O.opAddParty("person", evil); eng = O.opAddParty("team", evil + " team"); O.opSetMembers(eng, [ana]); O.opSetRole(a, ana, "R"); O.opSetRole(a, eng, "A"); O.opAddDep(a, c);
      const r = O.opAddRisk({ name: evil }); O.opLinkTask(O.opAddMitigant(r, evil), a); O.opAddNote(a, evil + " see https://example.com/x?a=1&b=2"); });
    const noImg = where => ok(!document.querySelector(where + " img"), "no <img> in " + where);
    P.switchView("plan"); P.openRecord(a); noImg("#gridRows"); noImg("#ganttSvg"); noImg("#formPane");
    ok(document.querySelector("#gridRows .nm").textContent.startsWith("<img"), "name shown as text");
    ok(document.querySelector('#formPane .n-body a[href="https://example.com/x?a=1&b=2"]'), "note link kept, & intact");
    P.openRecord(p); noImg("#formPane");
    P.switchView("raci"); noImg("#raciWrap"); const by = P.UI.raciBy; P.UI.raciBy = by === "team" ? "person" : "team"; P.renderAll(); noImg("#raciWrap"); P.UI.raciBy = by;
    P.switchView("risks"); noImg("#view-risks");
    await new Promise(r => setTimeout(r, 50)); eq(window.__xss, 0, "no handler ran");
    P.toggleForm(false); P.switchView("plan");
  });
  await test("redraw", "requests made together draw once, after the code that asked", async () => {
    fresh(); T("A"); T("B"); P.switchView("plan");
    let seen = 0; const rows = document.getElementById("gridRows"), mo = new MutationObserver(r => seen += r.length); mo.observe(rows, { childList: true });
    const draws = () => seen + mo.takeRecords().length; // delivered to the callback, or still pending
    P.UI.selId = P.M.order[1].id; P.redraw("gridRows"); P.redraw("gridRows", "ganttRows"); P.redraw("form");
    eq(draws(), 0, "nothing drawn while the asking code runs");
    ok(!rows.querySelector(".grow.sel"), "old rows still showing");
    await null;
    eq(draws(), 1, "drawn exactly once"); mo.disconnect();
    eq(rows.querySelector(".grow.sel")?.dataset.id, String(P.M.order[1].id), "with the new selection");
  });
  await test("focus", "record panel: a dropdown change keeps focus; a field saves again after an in-place refresh", async () => {
    fresh(); const a = T("A"); P.switchView("plan"); P.openRecord(a);
    const pane = document.getElementById("formPane"), f = k => pane.querySelector(`[data-f="${k}"]`);
    let st = f("status"); st.focus(); st.value = "In progress"; st.dispatchEvent(new Event("change", { bubbles: true }));
    eq(task(a).ST, "In progress"); ok(document.activeElement === f("status") && f("status") !== st, "focus on the rebuilt Status");
    let code = f("code"); code.focus(); code.value = "C-1"; code.dispatchEvent(new Event("change", { bubbles: true }));
    eq(task(a).code, "C-1");
    ok(document.activeElement === code, "text field kept (refreshed in place, not rebuilt)");
    code.value = "C-2"; code.dispatchEvent(new Event("input")); code.dispatchEvent(new Event("change", { bubbles: true }));
    eq(task(a).code, "C-2", "the same field saves again after more typing");
    const d = f("duration"); d.focus(); d.value = "0"; d.dispatchEvent(new Event("change", { bubbles: true }));
    ok(task(a).isMilestone && f("finish").disabled, "layout change rebuilds the form"); ok(document.activeElement === f("duration"), "focus kept through the rebuild");
    P.toggleForm(false);
  });
  await test("focus", "redraws wait while Tab moves focus; rebuilt rows keep focus on unmarked controls", async () => {
    fresh(); T("A"); P.switchView("plan");
    const rows = document.getElementById("gridRows"); let seen = 0; const mo = new MutationObserver(r => seen += r.length); mo.observe(rows, { childList: true });
    document.getElementById("gridBody").dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    P.redraw("gridRows"); await null;
    eq(seen + mo.takeRecords().length, 0, "not while Tab is moving focus");
    await new Promise(r => setTimeout(r, 10));
    eq(seen + mo.takeRecords().length, 1, "drawn once focus has landed"); mo.disconnect();
    let r; m(() => { r = O.opAddRisk({ name: "R" }); }); P.switchView("risks");
    const row = () => document.querySelector(`#riskBody [data-risk="${r}"]`), second = () => row().querySelectorAll("button.rk-party")[1];
    const old = second(); old.focus(); P.risk.renderRisks();
    ok(second() !== old && document.activeElement === second(), "same button in the rebuilt row");
    const box = document.createElement("div"); document.body.append(box);
    box.append(Object.assign(document.createElement("button"), { textContent: "—" })); box.firstChild.focus();
    const mk = U.markFocus(box); box.replaceChildren(...[1, 2].map(() => Object.assign(document.createElement("button"), { textContent: "—" })));
    ok(!U.refocus(box, mk), "two candidates: no guess"); box.remove();
    P.switchView("plan");
  });
  await test("a11y", "dialogs take focus, keep Tab inside, and give focus back when closed", () => {
    P.switchView("plan"); const gb = document.getElementById("gridBody"); gb.focus();
    document.querySelector('#fileMenu [data-act="help"]').click();
    const modal = document.getElementById("modal");
    ok(modal.contains(document.activeElement), "focus moved into the dialog"); eq(modal.getAttribute("aria-labelledby"), "modalTitle");
    const btns = [...modal.querySelectorAll("button")]; btns.at(-1).focus();
    const ev = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }); document.activeElement.dispatchEvent(ev);
    ok(ev.defaultPrevented && document.activeElement === btns[0], "Tab wraps to the first control");
    document.activeElement.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    eq(document.activeElement, gb, "focus back on the outline");
    eq(document.getElementById("toast").getAttribute("aria-live"), "polite", "messages are announced");
  });

  // ---------- Low tier, batch D ----------
  await test("deps", "re-linking a linked pair keeps its lag; weekend-only tasks get a note", () => {
    fresh(); const a = T("A"), b = T("B", null, "2026-03-09"), w = T("W", null, "2026-03-07", "2026-03-08");
    m(() => O.opAddDep(a, b, "FS", 3)); m(() => O.opAddDep(a, b, "SS", null));
    eq(P.q("SELECT type, lag FROM dep"), [{ type: "SS", lag: 3 }]);
    ok(P.M.issues.some(i => i.task.id === w && /weekend/.test(i.text)), "weekend note");
  });
  await test("risks", "linking a task clears a stale hand-set status; 'A. Smith' isn't a bullet; top level is remembered", () => {
    fresh(); const t1 = T("T"); let r, mi;
    m(() => { r = O.opAddRisk({ name: "R" }); mi = O.opAddMitigant(r, "M"); O.opUpdateMitigant(mi, { status: "Implemented" }); });
    m(() => O.opLinkTask(mi, t1)); m(() => O.opUnlinkTask(mi, t1));
    eq([mt(mi).eff, mt(mi).achieved], ["Not started", false], "old Implemented didn't come back");
    eq(R.splitMitigationPlan("A. Smith to review contracts\na) Check the SLA"), ["A. Smith to review contracts", "Check the SLA"]);
    m(() => O.opTaskFromMitigant(mi, { targetId: t1, where: "after" }));
    m(() => O.opTaskFromMitigant(mi)); eq(P.M.order.filter(t => t.depth === 0).length, 3, "second ＋ Task also at the top level, no 'Risk mitigation' summary");
  });
  await test("filter", "collapse state belongs to one plan file", () => {
    fresh(); const p = T("P"); T("c", p);
    P.cmd.toggleCollapse(p, true); ok(P.UI.collapsed.has(p));
    P.run("UPDATE meta SET value='another-file' WHERE key='file_id'"); P.renderAll(); P.refresh();
    m(() => {}); ok(!P.UI.collapsed.has(p), "another file id: fresh collapse state");
  });
  P.reset();
  } finally { shims.forEach(undo => undo()); }
  const failed = results.filter(r => !r.pass);
  return { total: results.length, passed: results.length - failed.length, failed };
};
