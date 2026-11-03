// ---------- DOM + general helpers ----------
const $ = id => document.getElementById(id);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
// The one way markup is built (DECISIONS #74). html`<b>${name}</b>` escapes every ${value} unless the value is itself
// an html`` result, or an array of them; null, undefined and false add nothing (use String(x) for "false" in an
// attribute). setHtml() and h(..., { html }) accept only html`` results, so a plain string can never become markup.
// Joining results with + or a plain `${}` would turn them back into a string, so that throws: nest them in html`` instead.
class SafeHtml { constructor(s) { this.s = s; } toString() { throw new TypeError("Nest html`…` results inside html`…`; don't join them with + or a plain template"); } }
const htmlPart = v => v instanceof SafeHtml ? v.s : Array.isArray(v) ? v.map(htmlPart).join("") : v == null || v === false ? "" : esc(v);
function html(strings, ...vals) { let s = strings[0]; for (let i = 0; i < vals.length; i++) s += htmlPart(vals[i]) + strings[i + 1]; return new SafeHtml(s); }
function setHtml(el, v) {
  if (!(v instanceof SafeHtml)) throw new TypeError("setHtml takes an html`…` result, not a string");
  el.innerHTML = v.s;
}

function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "html") setHtml(el, v);
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(kid));
  return el;
}

// Pointer-drag plumbing shared by every drag. It ends with drop(ev) on pointerup, or cancel(ev) on
// pointercancel, the window losing focus, or Escape, and always removes its listeners.
function trackDrag(target, { move, drop, cancel = () => { } }) {
  let done = false;
  const end = (ev, ok) => {
    if (done) return; done = true;
    target.removeEventListener("pointermove", move); target.removeEventListener("pointerup", onUp); target.removeEventListener("pointercancel", onCancel);
    window.removeEventListener("blur", onCancel); document.removeEventListener("keydown", onKey, true);
    (ok ? drop : cancel)(ev);
  };
  const onUp = ev => end(ev, true), onCancel = ev => end(ev, false);
  const onKey = ev => { if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); end(ev, false); } };
  target.addEventListener("pointermove", move); target.addEventListener("pointerup", onUp); target.addEventListener("pointercancel", onCancel);
  window.addEventListener("blur", onCancel); document.addEventListener("keydown", onKey, true);
}

// Rebuilding part of the page throws away the element that had focus (DECISIONS #76). markFocus(root) remembers it
// by its data-* attributes under its nearest marked ancestor; an unmarked control by its place among the same tags
// in that ancestor (a row's second person button); lacking both, by its text. It also keeps the caret and any typing
// not yet saved. refocus(root, mark) finds the one matching element in the new markup.
const dataSel = el => [...el.attributes].filter(a => a.name.startsWith("data-")).map(a => `[${a.name}="${CSS.escape(a.value)}"]`).join("");
function markFocus(root) {
  const el = document.activeElement;
  if (!el || el === root || !root.contains(el)) return null;
  let up = el.parentElement; while (up && up !== root && !dataSel(up)) up = up.parentElement;
  const upSel = up && up !== root ? dataSel(up) : "", tag = el.tagName.toLowerCase();
  const sel = dataSel(el) ? (upSel ? upSel + " " : "") + tag + dataSel(el) : null;
  const pos = !sel && upSel ? { upSel, i: [...up.querySelectorAll(tag)].indexOf(el), cls: el.className } : null;
  const typed = "_orig" in el && el.value !== el._orig ? el.value : null;
  return { sel, pos, tag, text: el.textContent.trim(), typed, caret: el.selectionStart != null ? [el.selectionStart, el.selectionEnd] : null };
}
function refocus(root, mark, { typed = true } = {}) {
  if (!mark) return false;
  let found = [];
  if (mark.sel) found = [...root.querySelectorAll(mark.sel)];
  else if (mark.pos) {
    const ups = root.querySelectorAll(mark.pos.upSel), c = ups.length === 1 ? ups[0].querySelectorAll(mark.tag)[mark.pos.i] : null;
    if (c && c.className === mark.pos.cls) found = [c];
  } else if (mark.text) found = [...root.querySelectorAll(mark.tag)].filter(x => x.textContent.trim() === mark.text);
  if (found.length !== 1) return false; // gone, or ambiguous: better nowhere than on the wrong button
  const el = found[0];
  if (typed && mark.typed != null && "value" in el) el.value = mark.typed;
  el.focus({ preventScroll: true });
  if (mark.caret) try { el.setSelectionRange(...mark.caret); } catch { }
  return document.activeElement === el;
}

// { undo: true } adds an Undo button for the change just made. It only undoes while nothing else has changed since
// (every change bumps rev), so it can never take back a later edit. Long messages and Undo stay longer; hovering holds them.
let toastTimer;
function toast(msg, kind = "", { undo: canUndo = false } = {}) {
  const t = $("toast"), at = canUndo ? rev : null;
  const hide = () => { t.className = ""; t.onpointerenter = t.onpointerleave = null; };
  t.replaceChildren(msg); t.className = "show " + kind;
  if (canUndo) {
    t.append(" ", h("button", { class: "t-undo", onclick: () => { hide(); if (rev === at) undo(); else toast("Something else changed since. Use Undo (Ctrl+Z) to step back."); } }, "Undo"));
    t.classList.add("act");
  }
  const ms = Math.max(kind === "err" ? 4500 : 2600, msg.length * 55) + (canUndo ? 5000 : 0);
  clearTimeout(toastTimer); toastTimer = setTimeout(hide, ms);
  t.onpointerenter = () => clearTimeout(toastTimer);
  t.onpointerleave = () => { clearTimeout(toastTimer); toastTimer = setTimeout(hide, 2000); };
}

const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { } };

// ---------- Dates ----------
// Day numbers = days since 1970-01-01 (UTC). Working-day index counts Mon–Fri only.
const DAY = 864e5;
function parseYMD(s) {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const n = Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / DAY);
  return fmtYMD(n) === s ? n : null; // "2026-02-30" isn't a date (Date.UTC would roll it to March 2)
}
function fmtYMD(n) {
  if (n == null) return "";
  const d = new Date(n * DAY);
  return d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0") + "-" + String(d.getUTCDate()).padStart(2, "0");
}
function todayNum() { const d = new Date(); return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY); }
const dow = n => ((n % 7) + 7 + 4) % 7; // 0=Sun … 6=Sat (1970-01-01 was a Thursday)
const isWeekend = n => { const d = dow(n); return d === 0 || d === 6; };
// Index of the working day at or after day n.
function wdIndex(n) { const m = n + 3; const w = Math.floor(m / 7), r = m - w * 7; return w * 5 + Math.min(r, 5); }
// Day number of working-day index i.
function wdDay(i) { const w = Math.floor(i / 5), r = i - w * 5; return w * 7 + r - 3; }
const nextWorkday = n => wdDay(wdIndex(n));
// Half-open working-day span of a task: [s, e). A milestone falls at the end of its day (as MS Project's
// 5 pm finish), so a predecessor finishing that day doesn't conflict with it (DECISIONS #65).
function span(start, finish, milestone) {
  if (start == null) return null;
  if (milestone) { const m = wdIndex(start + 1); return { s: m, e: m }; }
  const s = wdIndex(start);
  const e = wdIndex((finish ?? start) + 1);
  return { s, e: Math.max(e, s) };
}
function workdays(start, finish) { if (start == null || finish == null) return null; return Math.max(0, wdIndex(finish + 1) - wdIndex(start)); }
// Finish date for a start and a working-day duration (>= 1).
function finishFor(start, dur) { const s = wdIndex(start); return wdDay(s + Math.max(1, dur) - 1); }

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function ymdParts(n) { const d = new Date(n * DAY); return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate() }; }
// "23 Oct", with the year only when it isn't this year: "23 Oct 27" (DECISIONS #94). year: always add it (print, which
// outlives the year it was made in). Typed and stored dates stay YYYY-MM-DD.
function fmtShort(n, year = false) {
  if (n == null) return "";
  const p = ymdParts(n);
  return `${p.d} ${MONTHS[p.m]}${year || p.y !== new Date().getFullYear() ? " " + String(p.y).slice(2) : ""}`;
}
const dayOf = (y, m, d) => Math.round(Date.UTC(y, m, d) / DAY);

// Duration text "5d", "2w", "3 days", "4" → working days (null if unparseable).
function parseDuration(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Math.round(v);
  const m = /^\s*(-?\d+(?:\.\d+)?)\s*(d|day|days|w|wk|wks|week|weeks|ed|edays)?\s*$/i.exec(String(v));
  if (!m) return null;
  const n = parseFloat(m[1]); const u = (m[2] || "d").toLowerCase();
  const d = u.startsWith("w") ? n * 5 : n;
  return d > 0 ? Math.max(1, Math.round(d)) : Math.round(d); // part-days count as 1 day, not a milestone
}
// Split a people cell. Semicolons/newlines win when present so "Smith, John" survives.
function splitNames(v, semicolonOnly) {
  const s = String(v ?? "");
  return s.split(semicolonOnly || /[;\n]/.test(s) ? /[;\n]+/ : /,+/).map(x => x.trim()).filter(Boolean);
}
// What Excel puts on the clipboard → { lines, cols }: one line per row, from the first column only (cols says how many
// there were, so a paste can warn). Cells holding a newline, tab or quote arrive quoted, with "" for a quote. Excel ends
// with one newline, which is dropped; blank lines stay, as "", so pasted rows stay lined up with the sheet.
function parseClipColumn(text) {
  const s = String(text ?? "").replace(/\r\n?/g, "\n"), rows = [[]];
  let cell = "", quoted = false, start = true;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) { if (c !== '"') cell += c; else if (s[i + 1] === '"') { cell += '"'; i++; } else quoted = false; continue; }
    if (c === '"' && start) { quoted = true; start = false; continue; }
    start = false;
    if (c === "\t") { rows.at(-1).push(cell); cell = ""; start = true; }
    else if (c === "\n") { rows.at(-1).push(cell); rows.push([]); cell = ""; start = true; }
    else cell += c;
  }
  rows.at(-1).push(cell);
  if (rows.length > 1 && rows.at(-1).length === 1 && rows.at(-1)[0] === "") rows.pop();
  return { lines: rows.map(r => r[0].trim()), cols: Math.max(...rows.map(r => r.length)) };
}
// Percent "50%", 0.5, "50" → 0..100
function parsePercent(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number") return clamp(Math.round(v > 0 && v < 1 ? v * 100 : v), 0, 100);
  const s = String(v).trim(); const m = /^(-?\d+(?:\.\d+)?)\s*%?$/.exec(s);
  if (!m) return null;
  let n = parseFloat(m[1]);
  if (!s.includes("%") && n > 0 && n < 1) n *= 100;
  return clamp(Math.round(n), 0, 100);
}
// Text date → day number. order: "MDY" | "DMY". Accepts ISO, slashes/dots/dashes, "Jan 5 2026", "5 Jan 2026".
function parseDateText(v, order = "MDY") {
  if (v == null) return null;
  const s = String(v).trim(); if (!s) return null;
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T ].*)?$/.exec(s);
  if (m) return validDay(+m[1], +m[2] - 1, +m[3]);
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})(?:\s.*)?$/.exec(s);
  if (m) {
    let a = +m[1], b = +m[2], y = +m[3]; if (y < 100) y += 2000;
    const [mo, d] = order === "DMY" ? [b, a] : [a, b];
    return validDay(y, mo - 1, d);
  }
  m = /^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})$/.exec(s);
  if (m) { const mo = MONTHS.findIndex(x => m[1].toLowerCase().startsWith(x.toLowerCase())); if (mo >= 0) return validDay(+m[3], mo, +m[2]); }
  m = /^(\d{1,2})\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})$/.exec(s);
  if (m) { const mo = MONTHS.findIndex(x => m[2].toLowerCase().startsWith(x.toLowerCase())); if (mo >= 0) return validDay(+m[3], mo, +m[1]); }
  return null;
}
function validDay(y, mo, d) {
  if (mo < 0 || mo > 11 || d < 1 || d > 31) return null;
  const n = dayOf(y, mo, d); const p = ymdParts(n);
  return p.m === mo && p.d === d ? n : null;
}
// Excel serial → day number (1900 or 1904 system).
function excelSerialToDay(v, date1904) {
  const n = Math.floor(v + 1e-6);
  // 1900 system: serial 25569 = 1970-01-01 (accounts for Lotus leap-year bug for dates after Feb 1900).
  return date1904 ? n - 24107 : n - 25569;
}
