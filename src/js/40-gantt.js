// ---------- Gantt (SVG, row-aligned with the grid, virtualized) ----------
const GRAIN_PX = { day: 28, week: 9, month: 3.2, quarter: 1.15 };
const GRAIN_PAD = { day: 7, week: 14, month: 45, quarter: 100 };
let SC = null; // current scale

function unitStart(n, unit) {
  const p = ymdParts(n);
  switch (unit) {
    case "day": return n;
    case "week": return n - ((dow(n) + 6) % 7);
    case "month": return dayOf(p.y, p.m, 1);
    case "quarter": return dayOf(p.y, Math.floor(p.m / 3) * 3, 1);
    case "year": return dayOf(p.y, 0, 1);
  }
}
function unitNext(n, unit) {
  const p = ymdParts(n);
  switch (unit) {
    case "day": return n + 1;
    case "week": return n + 7;
    case "month": return dayOf(p.y, p.m + 1, 1);
    case "quarter": return dayOf(p.y, p.m + 3, 1);
    case "year": return dayOf(p.y + 1, 0, 1);
  }
}
const TIERS = {
  day: [["month", n => { const p = ymdParts(n); return `${MONTHS[p.m]} ${p.y}`; }], ["day", n => `${"SMTWTFS"[dow(n)]} ${ymdParts(n).d}`]],
  week: [["month", n => { const p = ymdParts(n); return `${MONTHS[p.m]} ${p.y}`; }], ["week", n => { const p = ymdParts(n); return `${p.d} ${MONTHS[p.m]}`; }]],
  month: [["year", n => String(ymdParts(n).y)], ["month", n => MONTHS[ymdParts(n).m]]],
  quarter: [["year", n => String(ymdParts(n).y)], ["quarter", n => "Q" + (Math.floor(ymdParts(n).m / 3) + 1)]],
};
const headerGrainFor = px => px >= 18 ? "day" : px >= 5 ? "week" : px >= 1.8 ? "month" : "quarter";

function projectRange(tasks = M.order) {
  let lo = null, hi = null;
  for (const t of tasks) {
    if (t.S != null && (lo == null || t.S < lo)) lo = t.S;
    if (t.F != null && (hi == null || t.F > hi)) hi = t.F;
  }
  const today = todayNum();
  if (lo == null) { lo = today; hi = today + 30; }
  return { lo, hi };
}
// Build a scale. grain ∈ day|week|month|quarter|fit; width used for fit.
function buildScale(grain, width, tasks) {
  const { lo, hi } = projectRange(tasks);
  const today = todayNum();
  let px, hg;
  if (grain === "fit") {
    const days = Math.max(14, hi - lo + 1);
    px = clamp((width - 60) / (days * 1.08), 0.25, 60);
    hg = headerGrainFor(px);
  } else { px = GRAIN_PX[grain]; hg = grain; }
  const pad = grain === "fit" ? Math.ceil((hi - lo + 1) * 0.04) + 2 : GRAIN_PAD[grain];
  const big = TIERS[hg][0][0];
  let a = Math.min(lo, grain === "fit" ? lo : today) - pad, b = Math.max(hi, grain === "fit" ? hi : today) + pad;
  a = unitStart(a, TIERS[hg][1][0] === "day" ? "week" : TIERS[hg][1][0]);
  const botU = TIERS[hg][1][0];
  b = grain === "fit" ? unitNext(unitStart(b, botU), botU) : unitNext(unitStart(b, big), big);
  if (grain === "fit") px = Math.max(0.2, (width - 4) / (b - a)); // fill exactly after rounding to header units
  return { origin: a, end: b, px, hg, width: (b - a) * px };
}
const xOf = (sc, day) => (day - sc.origin) * sc.px;

function headerSvg(sc) {
  const [[topU, topF], [botU, botF]] = TIERS[sc.hg];
  const s = [];
  for (let n = unitStart(sc.origin, topU); n < sc.end; n = unitNext(n, topU)) {
    const x = Math.max(0, xOf(sc, n)), x2 = xOf(sc, unitNext(n, topU));
    s.push(html`<line class="g-hdr-line" x1="${x2}" y1="0" x2="${x2}" y2="22"/>`);
    if (x2 - x > 30) s.push(html`<text class="g-hdr-top" x="${x + 6}" y="15">${topF(n)}</text>`);
  }
  for (let n = unitStart(sc.origin, botU); n < sc.end; n = unitNext(n, botU)) {
    const x = xOf(sc, n), w = xOf(sc, unitNext(n, botU)) - x;
    s.push(html`<line class="g-hdr-line" x1="${x}" y1="22" x2="${x}" y2="44"/>`);
    const label = botF(n);
    if (w > label.length * 6.2 + 4) s.push(html`<text class="g-hdr-bot" x="${x + w / 2}" y="37" text-anchor="middle">${label}</text>`);
    else if (w > 12 && botU === "day") s.push(html`<text class="g-hdr-bot" x="${x + w / 2}" y="37" text-anchor="middle">${ymdParts(n).d}</text>`);
  }
  s.push(html`<line class="g-hdr-line" x1="0" y1="22" x2="${sc.width}" y2="22"/>`);
  return html`${s}`;
}
function backgroundSvg(sc, height, x0 = 0, x1 = sc.width) {
  const botU = TIERS[sc.hg][1][0];
  const weekends = [], lines = [];
  if (sc.px >= 5) { // weekend shading when days are visible
    const d0 = Math.max(sc.origin, Math.floor(sc.origin + x0 / sc.px) - 1), d1 = Math.min(sc.end, Math.ceil(sc.origin + x1 / sc.px) + 1);
    for (let n = d0; n < d1; n++) if (dow(n) === 6) weekends.push(html`<rect class="g-weekend" x="${xOf(sc, n)}" y="0" width="${sc.px * 2}" height="${height}"/>`);
  }
  for (let n = unitStart(sc.origin, botU); n < sc.end; n = unitNext(n, botU)) {
    const x = xOf(sc, n); if (x < x0 - 200 || x > x1 + 200) continue;
    lines.push(html`<line x1="${x}" y1="0" x2="${x}" y2="${height}"/>`);
  }
  const t = todayNum(), tx = xOf(sc, t) + sc.px / 2;
  return html`${weekends}<g class="g-grid">${lines}</g>${t >= sc.origin && t < sc.end ? html`<line class="g-today" x1="${tx}" y1="0" x2="${tx}" y2="${height}"/>` : ""}`;
}

// Milestones are drawn at the end of their day, where the link checks place them (DECISIONS #65).
const msX = (sc, day) => xOf(sc, day + 1);
// Anchor point of a task end, side "S" or "F".
function anchor(sc, t, side, y) {
  if (t.isMilestone) { const cx = msX(sc, t.S); return { x: side === "S" ? cx - 7 : cx + 7, y }; }
  return { x: xOf(sc, side === "S" ? t.S : t.F + 1), y };
}
function barSvg(sc, t, y, opts = {}) {
  if (t.S == null) return "";
  const S = opts.S ?? t.S, F = opts.F ?? t.F;
  const sel = t.id === UI.selId ? " sel" : "";
  const cy = y + ROW / 2;
  const label = opts.noLabel ? "" : t.name;
  const handles = (a, b) => opts.print ? "" : html`<circle class="hnd" data-side="S" cx="${a}" cy="${cy}" r="4.5"/><circle class="hnd" data-side="F" cx="${b}" cy="${cy}" r="4.5"/>`;
  if (t.isMilestone) {
    const cx = msX(sc, S);
    return html`<g class="bar ms${sel}" data-id="${t.id}"><path d="M${cx} ${cy - 8}L${cx + 8} ${cy}L${cx} ${cy + 8}L${cx - 8} ${cy}Z"/>${handles(cx - 13, cx + 13)}<text class="lbl" x="${cx + 21}" y="${cy + 4}">${label}</text></g>`;
  }
  const x1 = xOf(sc, S), x2 = Math.max(xOf(sc, F + 1), x1 + 2), w = x2 - x1;
  if (t.isSummary) {
    return html`<g class="bar summary${sel}" data-id="${t.id}"><path d="M${x1} ${cy - 6}H${x2}V${cy + 5}L${x2 - 5} ${cy}H${x1 + 5}L${x1} ${cy + 5}Z"/>${handles(x1 - 8, x2 + 8)}<text class="lbl" x="${x2 + (opts.print ? 6 : 17)}" y="${cy + 4}">${label}</text></g>`;
  }
  const pw = w * (t.P || 0) / 100;
  // Short bars get resize edges just outside the bar and link handles pushed further out, so all stay grabbable.
  const small = w < 14, eo = small ? 5 : 2, ho = small ? 13 : 8;
  const edges = opts.print ? "" : html`<rect class="edge" data-edge="S" x="${x1 - eo}" y="${cy - 8}" width="6" height="16"/><rect class="edge" data-edge="F" x="${x2 - 6 + eo}" y="${cy - 8}" width="6" height="16"/>`;
  const prog = pw > 0 ? html`<rect class="p" x="${x1}" y="${cy - 8}" width="${pw}" height="16" rx="4"/>` : "";
  return html`<g class="bar ${stClass(t.ST)}${sel}" data-id="${t.id}"><rect class="b" x="${x1}" y="${cy - 8}" width="${w}" height="16"/>${prog}${edges}${handles(x1 - ho, x2 + ho)}<text class="lbl" x="${x2 + (opts.print ? 6 : ho + 9)}" y="${cy + 4}">${label}</text></g>`;
}
function depPath(sc, d, rowOf, pfx = "") {
  const p = M.tasks.get(d.pred_id), s = M.tasks.get(d.succ_id);
  if (!p || !s || p.S == null || s.S == null) return "";
  const rp = rowOf(p), rs = rowOf(s); if (rp == null || rs == null) return "";
  const fromSide = d.type[0] === "F" ? "F" : "S", toSide = d.type[1] === "S" ? "S" : "F";
  const a = anchor(sc, p, fromSide, rp * ROW + ROW / 2), b = anchor(sc, s, toSide, rs * ROW + ROW / 2);
  const d1 = fromSide === "F" ? 1 : -1, d2 = toSide === "S" ? 1 : -1; // d2: direction arrow travels when entering
  const p1x = a.x + d1 * 10, p2x = b.x - d2 * 10;
  let path;
  if (d1 > 0 && d2 > 0 && p1x <= p2x) path = `M${a.x} ${a.y}H${p1x}V${b.y}H${b.x}`;
  else if (d1 < 0 && d2 < 0 && p1x >= p2x) path = `M${a.x} ${a.y}H${p2x}V${b.y}H${b.x}`;
  else if (d1 !== d2 && ((d1 > 0 && p1x >= b.x + 10) || (d1 < 0 && p1x <= b.x - 10))) path = `M${a.x} ${a.y}H${p1x}V${b.y}H${b.x}`;
  else {
    const ym = b.y > a.y ? a.y + ROW / 2 : a.y - ROW / 2;
    path = `M${a.x} ${a.y}H${p1x}V${ym}H${p2x}V${b.y}H${b.x}`;
  }
  const cls = `dep${d.violated ? " bad" : ""}${UI.selDep === d.id ? " sel" : ""}`;
  return html`<g class="${cls}" data-dep="${d.id}"><path class="ln" d="${path}" marker-end="url(#${pfx}${d.violated ? "arrBad" : "arr"})"/><path class="hit" d="${path}"/><title>${p.wbs} → ${s.wbs}: ${DEP_NAMES[d.type] ?? d.type}${d.lag ? `, lag ${d.lag}d` : ""}${d.violated ? " (dates conflict)" : ""}</title></g>`;
}
const defs = (p = "") => html`<defs><marker id="${p}arr" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L8 4L0 8Z" style="fill:var(--link)"/></marker><marker id="${p}arrBad" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L8 4L0 8Z" style="fill:var(--link-bad)"/></marker></defs>`;
const DEFS = defs();

// ---------- Live rendering ----------
function renderGantt() {
  const body = $("ganttBody");
  const centerDay = SC ? SC.origin + (body.scrollLeft + body.clientWidth / 2) / SC.px : null;
  const prev = SC;
  SC = buildScale(UI.grain, body.clientWidth || 800);
  const H = Math.max(UI.rows.length * ROW, body.clientHeight - 2);
  const svg = $("ganttSvg");
  svg.setAttribute("width", SC.width); svg.setAttribute("height", H);
  setHtml(svg, html`${DEFS}<g id="gBg"></g><g id="gSel"></g><g id="gDeps"></g><g id="gBars"></g><path id="ghost" class="ghost-link" d=""/>`);
  const hs = $("ganttHeadSvg"); hs.setAttribute("width", SC.width + 40); hs.setAttribute("height", 44); setHtml(hs, headerSvg(SC));
  $("ganttHead").scrollLeft = body.scrollLeft;
  if (prev && centerDay != null && (prev.px !== SC.px || prev.origin !== SC.origin)) body.scrollLeft = xOf(SC, centerDay) - body.clientWidth / 2;
  renderGanttRows();
}
function renderGanttRows() {
  if (!SC) return;
  const body = $("ganttBody");
  const H = Math.max(UI.rows.length * ROW, body.clientHeight - 2);
  const first = Math.max(0, Math.floor(body.scrollTop / ROW) - 6);
  const last = Math.min(UI.rows.length, Math.ceil((body.scrollTop + body.clientHeight) / ROW) + 6);
  setHtml($("gBg"), backgroundSvg(SC, H, body.scrollLeft, body.scrollLeft + body.clientWidth));
  const sel = selTask();
  setHtml($("gSel"), sel && UI.rows[sel.row] === sel ? html`<rect class="g-rowsel" x="0" y="${sel.row * ROW}" width="${SC.width}" height="${ROW}"/>` : html``);
  const bars = [];
  for (let i = first; i < last; i++) bars.push(barSvg(SC, UI.rows[i], i * ROW));
  setHtml($("gBars"), html`${bars}`);
  const rowOf = t => UI.rows[t.row] === t ? t.row : null;
  const deps = [];
  for (const d of M.deps) {
    const p = M.tasks.get(d.pred_id), s = M.tasks.get(d.succ_id);
    const rp = p && rowOf(p), rs = s && rowOf(s);
    if (rp == null || rs == null || Math.max(rp, rs) < first || Math.min(rp, rs) > last) continue;
    deps.push(depPath(SC, d, rowOf));
  }
  setHtml($("gDeps"), html`${deps}`);
}
function scrollGanttTo(day, frac = 0.3) { const b = $("ganttBody"); b.scrollLeft = Math.max(0, xOf(SC, day) - b.clientWidth * frac); }
function setGrain(g) {
  UI.grain = g; lsSet("pm.grain", g);
  $$("#grainSeg button").forEach(b => b.classList.toggle("on", b.dataset.grain === g));
  renderGantt();
  if (g === "fit") $("ganttBody").scrollLeft = 0;
}

// ---------- Gantt interactions ----------
function svgPoint(e) { const r = $("ganttSvg").getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
function initGantt() {
  const body = $("ganttBody"), svg = $("ganttSvg");
  body.addEventListener("scroll", () => {
    $("ganttHead").scrollLeft = body.scrollLeft;
    if ($("gridBody").scrollTop !== body.scrollTop) $("gridBody").scrollTop = body.scrollTop;
    renderGanttRows();
  });
  svg.addEventListener("pointerdown", e => {
    if (e.button !== 0) return;
    closePop();
    const depEl = e.target.closest(".dep");
    if (depEl) { const id = +depEl.dataset.dep; UI.selDep = id; renderGanttRows(); openDepEditor(id, e.clientX, e.clientY); return; }
    UI.selDep = null;
    const barEl = e.target.closest(".bar");
    if (!barEl) {
      const row = Math.floor(svgPoint(e).y / ROW);
      if (UI.rows[row]) selectTask(UI.rows[row].id, { scroll: false });
      else renderGanttRows();
      return;
    }
    // Commit any open edit first and work from the result, or the drag would write the old dates back.
    const id = +barEl.dataset.id;
    if (UI.editing) commitEdit(0, 0, true);
    const ae = document.activeElement; if (ae?._commit && $("formPane").contains(ae)) ae._commit();
    const t = M.tasks.get(id); if (!t) return;
    if (e.target.classList.contains("hnd")) return beginLink(e, t, e.target.dataset.side);
    const mode = e.target.dataset.edge ? "resize" + e.target.dataset.edge : "move";
    beginBarDrag(e, t, mode, barEl);
  });
}

function beginBarDrag(e, t, mode, barEl) {
  const svg = $("ganttSvg"), start = svgPoint(e);
  const wasSel = UI.selId === t.id;
  if (!wasSel) { UI.selId = t.id; renderGridRows(); }
  if (t.isSummary || t.S == null) { selectTask(t.id, { scroll: true }); barClicked(t); return; }
  svg.setPointerCapture(e.pointerId);
  let days = 0, moved = false, S = t.S, F = t.F;
  const y = t.row * ROW;
  const preview = () => {
    const el = $("gBars").querySelector(`.bar[data-id="${t.id}"]`);
    if (!el) return;
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g"); setHtml(g, html`${barSvg(SC, t, y, { S, F })}`);
    el.replaceWith(...g.childNodes);
  };
  const move = ev => {
    const p = svgPoint(ev); const dx = p.x - start.x;
    if (!moved && Math.abs(dx) < 3) return;
    moved = true;
    days = Math.round(dx / SC.px);
    if (mode === "move") { // keep working-day duration, start on a workday in the drag direction (DECISIONS #4)
      let n = t.S + days;
      if (isWeekend(n)) n = days < 0 ? n - (dow(n) === 6 ? 1 : 2) : nextWorkday(n);
      S = n;
      F = t.isMilestone ? S : finishFor(S, Math.max(1, t.dur || 1));
    }
    else if (mode === "resizeS") { S = Math.min(t.S + days, t.F); F = t.F; }
    else { S = t.S; F = Math.max(t.F + days, t.S); }
    preview();
    showTip(ev, t.isMilestone ? fmtShort(S) : `${fmtShort(S)} → ${fmtShort(F)}  ·  ${workdays(S, F)}d`);
  };
  trackDrag(svg, {
    move,
    drop: () => {
      hideTip();
      if (moved && (S !== t.S || F !== t.F)) mutate(`${mode === "move" ? "Moved" : "Resized"} “${t.name}” to ${fmtYMD(S)}${t.isMilestone ? "" : " → " + fmtYMD(F)}`, () => opSetField(t.id, "dates", { start: S, finish: F }));
      else { selectTask(t.id, { scroll: false }); barClicked(t); }
    },
    cancel: () => { hideTip(); renderGanttRows(); }, // Escape puts the bar back
  });
}
// Our own double-click detection: bars are re-rendered between clicks, so native dblclick can't find them.
let lastBarClick = null;
function barClicked(t) {
  const now = performance.now();
  if (lastBarClick && lastBarClick.id === t.id && now - lastBarClick.t < 450) { lastBarClick = null; openRecord(t.id); }
  else lastBarClick = { id: t.id, t: now };
}

function beginLink(e, from, side) {
  const svg = $("ganttSvg"), ghost = () => $("ghost"); // looked up each time: a re-render replaces it
  svg.setPointerCapture(e.pointerId);
  $("ganttPane").classList.add("linking");
  const a = anchor(SC, from, side, from.row * ROW + ROW / 2);
  let target = null, tside = null;
  const move = ev => {
    const p = svgPoint(ev);
    ghost()?.setAttribute("d", `M${a.x} ${a.y}L${p.x} ${p.y}`);
    $$("#gBars .bar.target").forEach(b => b.classList.remove("target"));
    target = null;
    const el = document.elementFromPoint(ev.clientX, ev.clientY)?.closest(".bar");
    if (el && +el.dataset.id !== from.id) {
      const t = M.tasks.get(+el.dataset.id);
      const bx1 = xOf(SC, t.S), bx2 = t.isMilestone ? bx1 + SC.px : xOf(SC, t.F + 1);
      tside = p.x < (t.isMilestone ? msX(SC, t.S) : (bx1 + bx2) / 2) ? "S" : "F";
      target = t; el.classList.add("target");
      const type = (side === "F" ? "F" : "S") + tside;
      showTip(ev, `${DEP_NAMES[type]}: ${from.wbs} → ${t.wbs} ${t.name}`);
    } else showTip(ev, side === "F" ? "Drag to a task: from this task's finish" : "Drag to a task: from this task's start");
  };
  const stop = () => { $("ganttPane").classList.remove("linking"); ghost()?.setAttribute("d", ""); hideTip(); };
  trackDrag(svg, {
    move,
    drop: () => {
      stop();
      if (target) {
        const type = (side === "F" ? "F" : "S") + tside;
        mutate(`Linked ${from.wbs} → ${target.wbs} (${type})`, () => opAddDep(from.id, target.id, type, null));
      } else renderGanttRows();
    },
    cancel: () => { stop(); renderGanttRows(); },
  });
}
