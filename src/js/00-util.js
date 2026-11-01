// ---------- DOM + general helpers ----------
const $ = id => document.getElementById(id);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "html") el.innerHTML = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(kid));
  return el;
}

let toastTimer;
function toast(msg, kind = "") {
  const t = $("toast"); t.textContent = msg; t.className = "show " + kind;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.className = "", kind === "err" ? 4500 : 2600);
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
  return Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / DAY);
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
// Half-open working-day span of a task: [s, e). Milestones have e === s.
function span(start, finish, milestone) {
  if (start == null) return null;
  const s = wdIndex(start);
  if (milestone) return { s, e: s };
  const e = wdIndex((finish ?? start) + 1);
  return { s, e: Math.max(e, s) };
}
function workdays(start, finish) { if (start == null || finish == null) return null; return Math.max(0, wdIndex(finish + 1) - wdIndex(start)); }
// Finish date for a start and a working-day duration (>= 1).
function finishFor(start, dur) { const s = wdIndex(start); return wdDay(s + Math.max(1, dur) - 1); }

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function ymdParts(n) { const d = new Date(n * DAY); return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate() }; }
function fmtShort(n) { if (n == null) return ""; const p = ymdParts(n); return `${MONTHS[p.m]} ${p.d}, ${String(p.y).slice(2)}`; }
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
