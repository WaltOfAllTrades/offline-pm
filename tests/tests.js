// Offline PM test suite. Load into the running app page (served from localhost) and call runPmTests().
// It wipes the in-page database, so never run it against a page holding real work.
window.runPmTests = async function () {
  const P = window.PM, results = [];
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

  await test("filter", "person filter includes their teams and keeps parents", () => {
    fresh();
    const p = T("P"), a = T("a", p), b = T("b"); let x, t;
    m(() => { x = O.opAddParty("person", "X"); t = O.opAddParty("team", "T"); O.opSetMembers(t, [x]); O.opSetRole(a, t, "R"); });
    const pf = document.getElementById("personFilter");
    pf.value = "p:" + x; pf.dispatchEvent(new Event("change"));
    eq(P.UI.rows.map(r => r.name), ["P", "a"], "team task + ancestor");
    pf.value = ""; pf.dispatchEvent(new Event("change"));
    const sb = document.getElementById("searchBox");
    sb.value = "b"; sb.dispatchEvent(new Event("input")); eq(P.UI.rows.map(r => r.name), ["b"], "text filter");
    sb.value = ""; sb.dispatchEvent(new Event("input")); eq(P.UI.rows.length, 3);
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
    eq(P.scalar("PRAGMA user_version"), 2); eq(P.db.rev, 7, "rev kept");
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
    eq(P.scalar("PRAGMA user_version"), 2); ok(P.scalar("select count(*) from sqlite_master where name='note'"), "note table created");
    eq(P.M.order.map(t => t.name), ["Keep me"]);
    m(() => O.opAddNote(P.M.order[0].id, "works after upgrade")); eq(P.notesFor(P.M.order[0].id).length, 1);
  });

  await test("form", "opens in place of the Gantt, shows fields, closes back", () => {
    fresh(); const a = T("Parent"), c1 = T("Child 1", a, "2026-03-02", "2026-03-04"), c2 = T("Child 2", a, "2026-03-05", "2026-03-10"); T("Grandchild", c2, "2026-03-05", "2026-03-06");
    P.switchView("plan"); P.openRecord(c1);
    ok(!fp().hidden && document.getElementById("ganttPane").hidden, "form shown, gantt hidden");
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
    ok(fp().hidden && !document.getElementById("ganttPane").hidden, "Ctrl+I closes");
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
    const who = inForm("select[data-keep=author]"); who.value = ""; who.dispatchEvent(new Event("change"));
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
    eq(rows[0], ["Task ID", "WBS", "Task", "Author", "Created", "Edited", "Note"]);
    eq(rows.slice(1).map(r => r[6]), ["n1", "n2"], "oldest first"); ok(/^\d{4}-\d\d-\d\d \d\d:\d\d$/.test(rows[1][4]), "local timestamp");
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
  P.reset();
  const failed = results.filter(r => !r.pass);
  return { total: results.length, passed: results.length - failed.length, failed };
};
