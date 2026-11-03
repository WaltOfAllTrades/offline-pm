# Requirements: interaction plan (Jobs 1, 2, 4, 10)

**Status:** ready to build. **Source:** `reports/Plan.md` (the owner's decisions) and `reports/Jobs draft.md`. **Branch:** `ui-review`.

This document is meant to be built in one pass. Each requirement has an ID, the behaviour the owner sees, acceptance criteria (**AC**) that the tests check, and implementation notes (**Build**) naming the existing functions to change or copy. Where the plan left a detail open, this document makes the call and lists it under §6 *Decisions made here*. Build those as written, and record them in `DECISIONS.md`.

---

## 0. The owner, in one paragraph

The app's only user works on a **wide screen**, uses the **mouse for nearly everything**, and switches to the **keyboard inside tables** (the outline, the RACI matrix, the People table). Plans arrive as **Excel tables, copied one column at a time**: names and free text, never dates. So:

- Every action needs something visible to click. A shortcut can be added on top, never on its own.
- Fast typing, arrows and paste matter inside tables.
- Laptop layouts are not a target.

---

## 1. House rules the build must follow

These are the patterns the code already uses. New code reads like the code around it: same comment density, naming and idioms.

| Area | Rule | Where it lives |
|---|---|---|
| Files | `src/js/*.js` are concatenated in name order into **one scope**. Put code beside its peers (outline → `30-grid.js`, Gantt → `40-gantt.js`, record panel → `45-form.js`, Risks → `46-risks.js`, pickers / People / Help → `50-views.js`, wiring and keys → `90-main.js`, helpers → `00-util.js`). Don't add files and don't add libraries. | `README.md` |
| Data changes | **Every** change goes through `mutate(desc, fn)`: one transaction, one undo step, one save. Ops are plain functions named `opXxx` that run SQL and **throw `Error` with a sentence the owner can read**; `mutate` shows it as a red toast and rolls back. Ops never touch the DOM. | `10-db.js:281`, ops in `20-model.js`, `22-risk.js` |
| Messages after a change | To report what a change did *and* offer Undo, push sentences onto `opNotes` **inside** the op or the `mutate` callback; `mutate` then shows them with an Undo button. Don't call `toast()` after a `mutate` that pushed notes, or one will hide the other. For a plain message use `toast(msg, "", { undo: true })` after a successful `mutate` (see `cmdDelete`). | `10-db.js:305`, `00-util.js` `toast` |
| Drawing | Never call `render*` directly. Say what's stale with `redraw("rows" \| "gridRows" \| "ganttRows" \| "gantt" \| "form" \| "formForce" \| "risks" \| "planList" \| "all" …)`. Call `drawNow()` only when the next line reads the new DOM. | `90-main.js:28` (DECISIONS #75) |
| Markup | Build elements with `h(tag, attrs, ...kids)` and listeners in `attrs` (`onclick`, …). Build markup strings only with the `html` tag and `setHtml`. **No inline `on…=` attributes in strings**: the build's CSP blocks them. | `00-util.js:11–33` (DECISIONS #74) |
| Focus | A redraw must not lose focus. Give inputs and their row containers `data-*` attributes so `markFocus`/`refocus` can find them again. Use `data-keep` plus a one-shot `UI.xxxFocus` key where the code already does (Risks: `focusRisk`). | `00-util.js:54` (DECISIONS #76) |
| Popovers | Small choosers use `openPop(x, y, el, onClose)` / `closePop(commit)`. Escape closes the popover (global handler). Lists of choices use `.pick` / `.pick-btn` (see `chooseMitigant`). Modals (`openModal`) are for multi-field dialogs only. | `50-views.js:5`, `46-risks.js:270` |
| Drags | Use `trackDrag(target, { move, drop, cancel })`, the 3 px move threshold, `showTip`/`hideTip`, and Escape to cancel. | `00-util.js:35`, `40-gantt.js:227` |
| Per-browser settings | Use `lsGet`/`lsSet` with a `pm.` key. Per-plan state is keyed by file id and project, like `collapsedKey()`. | `30-grid.js:27` |
| No confirm boxes | Destructive actions happen at once and offer Undo (DECISIONS #79). | `cmdDelete` |
| Tests | Every AC below becomes a test in `tests/tests.js`, using its helpers (`fresh`, `T`, `m`, `eq`, `ok`, `throws`, `test(tag, name, fn)`). Drive the UI through `window.PM` (add any new command to `PM.cmd`, any new op to `PM.op`). | `tests/tests.js`, `90-main.js` `window.PM` |
| Docs | Add section **K. Interaction plan** to `STORIES.md` (one bullet per requirement, tag `[ui-plan]`). Append DECISIONS rows from **#80** (check the last number first: another session may have added rows). Update `README.md` "Using it" and **Help & shortcuts** (`showHelp` in `50-views.js`). Update the toolbar `title`s in `src/index.html` where a button's behaviour changes. | |
| Build and test | `powershell -ExecutionPolicy Bypass -File src\build.ps1`, then run the suite on `http://127.0.0.1:8766/offline-pm.html` (README → Test). All existing tests must still pass; update the ones whose behaviour this document changes on purpose (listed per requirement). | |

---

## 2. Build order

Each step stands on the one before it. Run the tests after each.

1. **R1** New tasks start with no dates
2. **R2** Back history and the ← Back button
3. **R3** New records open straight away
4. **R4** Select a block of rows
5. **R5** Indent, outdent and delete a block
6. **R6** Shared pieces: clipboard parsing and the paste chooser
7. **R7** Pasting into the outline (Name, Description, other columns, R/A, WBS)
8. **R8** The Description column
9. **R9** Draw a bar for an undated task
10. **R10** Searchable task picker
11. **R11** Risks: paste, ＋ Task opens the record, many-to-many everywhere
12. **R12** People and teams as tables with paste
13. Docs, Help text, DECISIONS, STORIES

---

## 3. Requirements

### R1. New tasks start with no dates (Job 1)

A task the owner creates has no start or finish until they give it one. The Gantt shows no bar for it, and the Issues view lists it as "No dates set" (info), which already exists.

**AC**
- R1.1 ＋ Task, ＋ Subtask, ＋ New subtask (record panel), Insert / Ctrl+Insert, ◆ Milestone, every paste mode that adds rows, and ＋ Task / drag-create from a mitigant all create tasks with `start` and `finish` = `NULL`.
- R1.2 A summary whose subtasks are all undated shows empty Start, Finish and Dur. cells and no Gantt bar, without errors.
- R1.3 Typing a Start date on an undated task gives it a 1-working-day span. Typing a Duration uses the next workday as start. Both are today's `opSetField` behaviour; keep it.
- R1.4 Import and the sample plan are unchanged: they pass their own dates.

**Build**
- `20-model.js` `opAddTask`: today `start ?? nextWorkday(todayNum())`. Change it so **`start === null` means undated**, and `undefined` keeps the old default (tests and import rely on it):
  `let s = start === undefined ? nextWorkday(todayNum()) : start; let f = s == null ? null : kind === "milestone" ? s : (finish ?? s);` Store real `NULL`, not `fmtYMD(null)`: `fmtYMD` returns `""` for null (`00-util.js:110`), and an empty string in `start` is not the same as no date. Write `s == null ? null : fmtYMD(s)` (and the same for `f`).
- `30-grid.js` `newTaskDefaults(ref)`: return `{ start: null, finish: null }`. Keep the function, since callers spread it. Update its comment and DECISIONS #3, which is superseded by the new row (§6 D1).
- `22-risk.js` `opTaskFromMitigant`: pass `start: null, finish: null` in both branches (today, the `place` branch copies the target's start).
- Check that these handle `S == null` without throwing: `miniGanttSection`, `printPlan`, `exportWorkbook`/`csvText` (blank cells), `projectRange()` (an all-undated plan must still give a range, e.g. today ± a few weeks), and `depViolated` (already returns false).

**Tests to change:** any test that relies on a new task from `cmdAdd` having today's date. Search for `cmdAdd(` and `todayNum` in `tests.js`.

---

### R2. Back history and the ← Back button (Jobs 2, 10)

The record panels (the task record in Plan/RACI, the risk/mitigant record on Risks) remember the records you visited. A **← Back** button returns to the previous one, like a browser.

**What the owner sees**
- At the left of the record header, before the breadcrumb, a button **← 1.2 Design** names where it goes (WBS + name for a task; "Risk: …" / "Mitigant: …" for risk records, shortened to about 32 characters). The tooltip reads `Back to … (Alt+←, or your mouse's Back button)`.
- No history means no button. Nothing is drawn, rather than a disabled button.
- With a record panel open, the **mouse's Back button** (button 4) does the same, and so does **Alt+←** when focus is inside the panel. Alt+← in the outline keeps its current job: collapse.
- Back lands on that record, in its own page (Plan for tasks, Risks for risk records), with the **same related tab** that was showing, and briefly flashes the row of the record you just left if it's listed there (the new subtask under its phase, for example).
- The breadcrumb is unchanged. It goes *up* to where a record lives. Back goes to where you *came from*.

**AC**
- R2.1 Open task A's record, then click subtask B in its Subtasks tab: Back returns to A. The Subtasks tab is showing and B's row has the `flash` class.
- R2.2 A → B → C via predecessor links, Back, Back: you're on A.
- R2.3 Open mitigant M's record on Risks, click ＋ Task (R11.3): the Plan page shows the new task's record, and Back returns to the Risks page with M's record open.
- R2.4 Keyboard ↑/↓/PageUp/PageDown/Home/End in the outline while the panel is open **replace** the current history entry instead of adding one. Stepping through 10 rows and pressing Back doesn't walk back through all 10.
- R2.5 Visiting the same record twice in a row adds one entry, not two.
- R2.6 Entries for records that no longer exist (deleted, undone away) or that belong to another project are skipped when going back. If nothing valid is left, the button disappears.
- R2.7 Closing the panel (✕ or Esc) keeps the history, and reopening the panel shows the button again. Opening another plan file or switching project clears it (`hooks.onReplace`, `switchProject`).
- R2.8 History is capped at 50 entries; the oldest drop off.
- R2.9 The mouse's Back button never navigates the browser away from the app while a record panel is open (`preventDefault` on its `pointerup`/`mouseup`).

**Build**
- State in `45-form.js`, next to the other `UI` fields:
  `UI.hist = []` (entries `{ kind: "task" | "risk" | "mitigant", id, projectId, tab }`), `UI.histCur = null` (the entry for the record now showing), `UI.histMode = null` (`"back"` or `"replace"`, one-shot).
- **One central recorder**, `noteVisit(entry)`, called at the end of `renderForm()` when a task record is shown and at the end of `renderRiskForm()` when a risk record is shown. If `entry` has the same kind and id as `UI.histCur`, it only refreshes `tab`. Otherwise:
  - `histMode === "back"`: don't push.
  - `histMode === "replace"`: replace `histCur` without pushing.
  - else: push `histCur` (if any) onto `UI.hist`, then trim to 50.
  
  Then set `histCur = entry` and clear `histMode`. Recording at render time catches every path (openRecord, selectTask from a click or Gantt bar, ▲/▼, breadcrumb, related-row clicks, openRiskRecord) without touching each one.
- `30-grid.js` `moveSel()` sets `UI.histMode = "replace"` before `selectTask` when `UI.form` is true.
- `goBack()` (in `45-form.js`): pop entries until one is valid (`M.tasks.has(id)` for tasks; `recOf({kind,id})` for risk records; same `projectId`). Set `UI.histMode = "back"` and `UI.formTab = entry.tab` (task) and remember `UI.flashRel = <id of the record being left>`. Then call `openRecord(id)` or `openRiskRecord(kind, id)`, so the view switches as those functions already do.
- `formHeader(t)` and the risk header in `renderRiskForm()` prepend `backButton()`: `h("button", { class: "f-back", "data-back": "", title, onclick: goBack }, "← ", label)`, only when a valid entry exists. Use a `data-` attribute so `markFocus` can restore focus to it after the redraw.
- Flash: relChildren / relDeps / mitTaskList rows get `data-id` (task id). After the render, if `UI.flashRel` matches a row, add `.flash` (reuse the `@keyframes flash` in `styles.css:361`; add `.rel-list tr.flash{animation:flash 1.4s ease}`) and clear `UI.flashRel`.
- Mouse Back: in `initToolbar()` (`90-main.js`) add a capture-phase `pointerup` listener (also `mouseup`; Chrome cancels the navigation when either is cancelled): `if (e.button === 3 && recordPanelOpen()) { e.preventDefault(); goBack(); }`, plus `auxclick` with `button === 3` → `preventDefault()`. `recordPanelOpen()` = `(UI.form && formViews.has(UI.view)) || (UI.view === "risks" && UI.riskForm)`.
- Alt+←: in the global keydown in `initToolbar()`, `if (e.altKey && e.key === "ArrowLeft" && (formPane or riskFormPane contains e.target)) { e.preventDefault(); goBack(); }`. Put this before the `typing` early return, so it works while a panel field has focus. Alt+← in a text field otherwise does nothing useful.
- CSS: `.f-back` styled like the header's icon buttons but with text; one line, `max-width:240px`, ellipsis.

---

### R3. New records open straight away (Job 2)

**AC**
- R3.1 Record panel › Subtasks tab › **＋ New subtask** creates the subtask (undated, R1), opens its record at once, and puts the cursor in **Name** with "New task" selected, so typing replaces it. The toast "Subtask added. Click it to open its record…" is removed.
- R3.2 Back from the new subtask returns to the parent with the Subtasks tab showing and the new row flashing (R2.1).
- R3.3 With the record panel **open**, toolbar ＋ Task, ＋ Subtask, ◆ Milestone and Insert / Ctrl+Insert also open the new record with Name selected. With the panel **closed** they behave as today: select the row and start the inline Name editor. That keeps the keyboard table flow.
- R3.4 The new record is recorded in history, so Back goes to the record that was open before.

**Build**
- `45-form.js`: add one-shot `UI.formFocus` (a `data-f` value). At the end of `renderForm()`, after `refocus`, if `UI.formFocus` is set: find `pane.querySelector(`[data-f="${UI.formFocus}"]`)`, focus it, `select()` it, then clear the flag. The Name field already has `data-f="name"` (`formFields`' `inp()` helper, `45-form.js:147`).
- `relChildren` add button: `let id; if (mutate("Added subtask", () => { id = opAddTask({ parentId: t.id, name: "New task", ...newTaskDefaults() }); })) { UI.formFocus = "name"; openRecord(id); }`.
- `cmdAdd`: after `selectTask(id, …)`, `if (UI.form) { UI.formFocus = "name"; openRecord(id); } else startEdit("name");`.

---

### R4. Select a block of rows (Job 1)

**What the owner sees:** **Shift+click** a second row and every visible row between it and the selected one is highlighted. **Shift+↑/↓** extends the block from the keyboard. A small count beside the toolbar's structure buttons reads "5 rows". A plain click, an arrow key without Shift, or Esc goes back to one row.

**AC**
- R4.1 With row 2 selected, Shift+click row 6: rows 2–6 have `.sel` and `aria-selected="true"`; row 6 is the active row (`UI.selId`, the `cur` cell, and the record panel shows it).
- R4.2 Shift+↓ ×3 from row 2 selects 2–5. Shift+↑ then shrinks it to 2–4.
- R4.3 A plain click on any row, ↑/↓ without Shift, or Esc leaves only one row selected.
- R4.4 Collapsing a summary, filtering, or a change that hides the anchor row ends the block (back to the active row).
- R4.5 The Gantt shows the row highlight (`g-rowsel`) for every row in the block. Shift+click on an empty Gantt row area extends the block too.
- R4.6 Dragging the WBS cell (row move) with a block selected moves only the dragged row and ends the block. Block drag is out of scope.

**Build** (`30-grid.js`)
- `UI.anchorId = null` beside `selId`. `selBlock()` returns the tasks from `UI.rows` between the anchor's and the active row's indexes, inclusive, or `[selTask()]` when there's no anchor, the anchor equals `selId`, or the anchor isn't in `UI.rows`.
- `blockTops(list)`: the tasks in the block none of whose ancestors are in it (`isAncestor`). The structure commands act on these.
- `selectTask(id, { scroll, col, extend })`: `extend` sets `UI.anchorId ??= UI.selId` and keeps it; without `extend`, `UI.anchorId = null`.
- The `gridBody` `pointerdown` handler: when `e.shiftKey` and a row is hit, call `selectTask(id, { scroll: false, extend: true })` and return early (no edit, no row drag). Keep `e.preventDefault()` so the browser doesn't select text.
- `gridKey`: `ArrowDown`/`ArrowUp` with `e.shiftKey` (and no Alt) → `moveSel(±1, { extend: true })`. Leave `Alt+Shift+arrows` as they are; they're matched first.
- `renderGridRows()`: `sel` becomes `blockIds.has(t.id)` (compute a `Set` once per render). Only the active row gets `cur`. `renderGanttRows()`: draw one `g-rowsel` rect per visible block row.
- `computeRows()` end: if `UI.anchorId` isn't in `UI.rows`, set it to `null`.
- Toolbar: add `<span id="selCount" class="hint" hidden></span>` after the ⇤ ⇥ ↑ ↓ 🗑 group in `src/index.html`. Update it in `renderGridRows()`: hidden for one row, otherwise `${n} rows`.

---

### R5. Indent, outdent and delete a block (Job 1)

**AC**
- R5.1 Toolbar ⇥ (or Alt+Shift+→) with a block selected indents every **top row** of the block one level, in order, each with its subtree, in **one undo step**. Siblings A, B, C, D with B–C selected → B and C become A's last children, in that order.
- R5.2 Indent is refused (red toast, nothing changes) when the first top row has nothing above it at its level. Reuse `opIndent`'s message.
- R5.3 Toolbar ⇤ (or Alt+Shift+←) outdents every top row one level, in order, in one undo step, following DECISIONS #27: later unselected siblings become children of the last outdented row, so the visual order never changes. Refused if any top row is already at the top level ("“X” is already at the top level").
- R5.4 After indent or outdent the same block stays selected, so clicking ⇥ twice indents twice.
- R5.5 🗑 / Delete with a block deletes every top row (with subtrees) in one undo step. The toast reads `Deleted 5 tasks with 3 subtasks and 2 work notes` and offers Undo (reuse `cmdDelete`'s wording). Selection moves to the first visible row after the block.
- R5.6 ↑ / ↓ (move up/down) with a block: toast "Move up and down work on one row at a time. Select one row." Nothing changes.
- R5.7 With one row selected, everything behaves exactly as today.

**Build** (`30-grid.js`)
- `cmdStructure(op)`: `const tops = blockTops(selBlock());`. If there's more than one top and op is `up`/`down` → the toast above. If there's one → today's code path, unchanged. Otherwise `mutate(`${labels[op]} ${tops.length} tasks`, () => { for (const x of tops) (op === "indent" ? opIndent : opOutdent)(x.id); })`.
  - Before an indent, un-collapse the previous sibling of the **first** top (as today) so the moved rows stay visible.
  - Then `redraw("rows")` and keep `UI.anchorId`/`UI.selId` (same ids).
  - Sequential `opIndent` gives the right result: once B is under A, C's previous sibling is A, so C goes under A after B. Sequential `opOutdent` in order follows #27.
  - For the outdent refusal, check `taskRow(x.id).parent_id == null` for every top **before** the loop and throw `“${name}” is already at the top level`.
- `cmdDelete()`: for a block, `mutate(`Deleted ${tops.length} tasks`, () => tops.forEach(x => opDelete(x.id)))`. Count subtasks and notes across tops the same way the single case does.

---

### R6. Shared pieces: reading the clipboard and the paste chooser (Jobs 1, 10, 13)

**R6a. `parseClipColumn(text)` in `00-util.js`** turns what Excel puts on the clipboard into `{ lines: string[], cols: number }`.
- Normalise `\r\n` and `\r` to `\n`. Drop **one** trailing empty line (Excel always adds one).
- Honour Excel's quoting: a cell that contains a newline, tab or quote arrives as `"…"` with `""` for a quote. Parse cell by cell (tab separates cells, newline separates rows). Inside quotes, newlines and tabs are part of the cell.
- When rows have more than one cell, keep the **first** cell of each row and report `cols` = the largest cell count, so the chooser can warn.
- Trim each line's surrounding whitespace, but keep blank lines as `""`: they matter for alignment.
- **AC R6a:** `"a\nb\n"` → `["a","b"]`. `"a\r\n\r\nb\r\n"` → `["a","","b"]`. `"\"x\ny\"\tz\nw\t1\n"` → lines `["x\ny","w"]`, `cols` 2. A single line without a newline → one line.

**R6b. `openPasteChooser(rect, { title, lines, cols, options, key })` in `50-views.js`**, the popover that asks what a paste should do.
- Layout, top to bottom:
  - `h4` with the title, e.g. `Paste 30 lines into Task name`.
  - A preview list: the first 5 lines (blank lines shown as *(blank)*), then `…and 25 more`.
  - If `cols > 1`: a `.msg warn` saying `You copied ${cols} columns. Only the first is used. Copy one column at a time.`
  - Then one `.pick-btn` per option: `1  Fill down`, followed by a one-line `.sub` explaining it ("Overwrite names from row 1.2 down; adds 22 new tasks past the end").
- Options are `{ id, label, sub, run }`. Clicking one closes the popover and calls `run()`.
- **Keyboard:** `1`–`9` pick, ↑/↓ move the highlight, Enter picks the highlighted one, Esc cancels (the global Escape already closes `#pop`). The popover's container takes focus so these keys reach it. Stop propagation so the grid doesn't also see them.
- **Remembered choice:** the option last chosen for this `key` (e.g. `paste.name`) is highlighted first, stored with `lsSet("pm.pasteChoice", {...})`. If an option is missing (an add mode on a non-Name column), highlight the first.
- A single option still shows the chooser. The preview is how the owner checks they copied the right column.
- **AC R6b:** pressing `2` runs option 2. Enter runs the remembered one. Esc runs nothing and changes nothing. The preview shows at most 5 lines.

**R6c. Where a paste is caught**
- Outline: a `paste` listener on `#gridBody` (it has `tabindex=0`, so Ctrl+V while the grid has focus fires there). If the inline cell editor is open and the pasted text has **one** line, let the browser paste into the editor as usual. With **more than one** line, `preventDefault()`, `cancelEdit()`, and open the chooser for that cell.
- Other tables: a `paste` listener on the specific inputs (R11, R12). Same rule: one line pastes normally, more than one opens the chooser.
- No right-click menu (see §6 D4). For the mouse, a toolbar button **📋 Paste** in the outline toolbar (after ◆ Milestone) reads the clipboard with `navigator.clipboard.readText()` and opens the same chooser for the selected cell. If the read is refused or unavailable: toast `The browser didn't allow reading the clipboard. Click a cell and press Ctrl+V instead.`

---

### R7. Pasting into the outline (Job 1)

The chooser's options depend on the **column of the selected cell** (`UI.col`) and the **selected row**. Every option runs in **one `mutate`** (one undo step) and reports what it did through `opNotes`, so the message has Undo. After any paste, **the affected rows are left selected as a block** (anchor = first, active = last), so ⇥ can nest them straight away.

If a filter is active when a paste starts, clear it first, with the same code and toast as `cmdAdd` ("Filter cleared so you can see the new tasks").

| Column | Options |
|---|---|
| **Task name** | 1 **Fill down** · 2 **Add as subtasks of “[row]”** · 3 **Add below “[row]”** |
| **Description** (R8) | 1 Fill down |
| **R**, **A** | 1 Fill down (match names) |
| **WBS** | 1 **Nest these rows by WBS** |
| Start, Finish, Dur., %, Status, Predecessors | 1 Fill down |

**R7.1 Name: Fill down.** Line *i* goes into visible row (selected row index + *i*) of `UI.rows`.
- A blank line leaves that row's name as it is, but still uses up the row, so later lines stay aligned.
- When the lines run past the last visible row, the rest become **new tasks**, added in order as siblings after the last visible row (`parentId` = its parent, `afterId` = the previous new one), undated (R1). Blank lines past the end create nothing.
- Note: `Pasted 30 names: 8 renamed, 22 new tasks.`
- **AC:** 3 tasks, select row 2, paste `x, y, z, w` → names `[1, x, y]` plus new `z, w` after row 3. Undo restores the 3 original rows in one step.

**R7.2 Name: Add as subtasks of “[row]”.** Each non-blank line becomes a new last child of the selected row, in order, undated, and the row is expanded.
- If the row was a leaf with RACI roles or predecessors, keep `cmdAdd`'s note "“X” is now a summary task; its dates roll up from subtasks" (push it onto `opNotes`).
- Note: `Added 8 subtasks under 1.2 Design.`
- **AC:** the parent now has its old children plus the new ones at the end. The new rows are selected as a block.

**R7.3 Name: Add below “[row]”.** Each non-blank line becomes a new sibling directly after the selected row (after its whole subtree), in order, undated. Note: `Added 8 tasks below 1.2 Design.`

**R7.4 Description: Fill down.** Like R7.1 but writes `task.notes` through `opSetField(id, "notes", line)`. Blank lines clear it. It never adds rows; lines past the end are counted: `5 lines didn't fit below the last row.`

**R7.5 R / A: Fill down.** Each line is split on `,`, `;` or `/` into names. Each name is matched **case-insensitively and trimmed** against active people, then active teams, by `name`.
- Matched names replace that role on the row with `opSetRoleParties(taskId, role, ids)`. A blank line clears the role.
- Names that don't match leave the rest of that row's matches in place and are reported once each: `Not on the roster: Pat Lee (3 rows), QA Team (1 row). Add them on the People page, then paste again.`
- No rows are added.
- **AC:** with people "Ana" and "Ben", pasting `ana\nBen, Zed\n` into R from row 1: row 1 R = Ana, row 2 R = Ben, and the note mentions Zed.

**R7.6 WBS: Nest these rows by WBS.** This is how a WBS column becomes hierarchy. The **numbers are thrown away**; the app numbers rows itself.
- The *N* lines apply to the *N* visible rows starting at the selected row. Lines past the last visible row are counted as not fitting.
- Line → level: segments of `^\d+(\.\d+)*\.?$` (so `1.2.3` → 3). A line that isn't a WBS number (blank or text) takes the previous row's level and is reported: `2 lines weren't WBS numbers, so those rows were kept at the level above them.`
- Levels are **relative to the first line**: `rel = segs − segs(first)`, so the first row stays at its current level, under its current parent *P*.
- **Skipped levels drop to the lowest open level:** `eff[i] = clamp(rel[i], 0, eff[i−1] + 1)`. So `1` then `1.1.1` gives the second row level 1, meaning `1.1`, and numbering carries on. This was the owner's rule.
- Row *i*'s new parent is the nearest earlier row *j* (in this range) with `eff[j] = eff[i] − 1`. When `eff[i] = 0` the parent is *P*, and the row is placed right after the previous level-0 row of this range. Rows keep their visual order. A row's existing subtree moves with it.
- **AC (the owner's example):** under task 3.2, paste names `a, b, c` with **Add as subtasks** → 3.2.1 a, 3.2.2 b, 3.2.3 c. Then select `a` and paste `1, 1.1, 2` into WBS → `a` = 3.2.1, `b` = 3.2.1.1, `c` = 3.2.2.
- **AC:** `1, 1.1.1, 1.2` → levels 0, 1, 1 (both under the first row).
- **Build:** a new op `opNestByWbs(ids, levels)` in `20-model.js`, beside `opMoveTo`. It uses `insertAt`, then `renumber` of every old parent's siblings, `keepRollupIfChildless` for parents that lost all children, then `dropHierarchyLinks(); checkDateCycles();`, exactly the tail of `opMoveTo`. The level maths lives in a pure helper `wbsLevels(lines)` → `{ levels, bad }` so it can be unit-tested.

**R7.7 Start, Finish, Dur., %, Status, Predecessors: Fill down.** Each line goes through **the same op as typing into the cell** (`opSetField(id, col, line)`, or `opSetPredText` for Predecessors).
- A row the op refuses (a summary's rolled-up value, an unreadable date, a predecessor loop) is skipped. Wrap each row's op in `try/catch` inside the one `mutate`.
- Skipped rows are reported, listing at most 3 and then "and N more": `Skipped 3 rows: 1.2 (Summary tasks roll up…), 2.4 (Couldn't read that date)…`.
- A blank line clears Start (undated) or Predecessors. For the other columns a blank line is skipped silently.
- No rows are added.

**Build (outline paste)**
- In `30-grid.js`: `gridPaste(e)` (the listener) → `parseClipColumn` → `pasteOptions(t, colKey, lines)` → `openPasteChooser(cellRect, …)`. Each option's `run` calls `cmdPaste(mode, colKey, lines)`, which does the mutate, sets the block selection and calls `redraw("rows")`.
- The cell rect comes from `$("gridCanvas").querySelector(`.grow[data-id="${t.id}"] [data-col="${col}"]`)` after `revealTask(t.id); drawNow();` (the `startEdit` pattern).
- No row selected: toast `Click the cell where the pasted list should start.`
- Expose `cmdPaste` on `PM.cmd`, so tests can run every mode without the clipboard.

---

### R8. The Description column (Job 1)

A **Description** column at the right end of the outline shows the first line of the task's description (`task.notes`, the "What this task covers…" field in the record).

**AC**
- R8.1 `COLS` gains `{ key: "notes", label: "Description", w: 220, edit: "record" }` as the **last** column. Its cell shows the text up to the first newline, cut off with an ellipsis by CSS, with the full text as the `title`.
- R8.2 It's not edited inline (descriptions run to several lines). Double-click, Enter/F2 or typing a character on it opens the record and puts the cursor in the Description field (`data-f="notes"`), using `UI.formFocus` from R3. The typed character is not inserted.
- R8.3 Pasting into it works as R7.4.
- R8.4 Tab moves into and out of it like any other cell. Past it, Tab leaves the grid (today's rule, since it's now the last column).

**Build:** `cellHtml` case `"notes"`; in `startEdit`, `if (c.edit === "record") { UI.formFocus = "notes"; openRecord(t.id); return; }` before the editor is built; `gridKey`'s "printable key starts editing" branch treats `"record"` like `"select"` (calls `startEdit` without the key). The `.gc.c-notes` CSS needs `overflow:hidden; text-overflow:ellipsis; white-space:nowrap`, like `.nm`.

---

### R9. Draw a bar for an undated task (Job 4)

Moving whole bars and dragging either edge stay exactly as they are. The one new gesture: **drag across an undated task's empty Gantt row** to draw its first bar.

**AC**
- R9.1 On the row of an undated, non-summary task, pointer-down then drag right from day *a* to day *b* previews a bar from *a* to *b* with the usual tooltip (`Mar 2, 26 → Mar 6, 26 · 5d`). Releasing saves start = *a*, finish = *b* in one undo step (`Scheduled “X” 2026-03-02 → 2026-03-06`).
- R9.2 Dragging left gives the same bar (start = the smaller day). Days snap like **resize** (calendar days, DECISIONS #4).
- R9.3 For an undated **milestone**, the drag places it on the day where the pointer is released.
- R9.4 A click without a 3 px drag only selects the row (today's behaviour). Escape during the drag cancels and draws nothing.
- R9.5 When the **selected** row is undated and not a summary, a faint hint `Drag across this row to set dates` is drawn at the left of the visible Gantt area, in the row, and the pointer is a crosshair over that row.
- R9.6 Summary rows and dated rows never start a draw.

**Build** (`40-gantt.js`)
- In `initGantt`'s `pointerdown`, the no-bar branch: `const t = UI.rows[row]; if (t && !t.isSummary && t.S == null) { selectTask(t.id, { scroll: false }); return beginBarDraw(e, t); }`.
- `beginBarDraw(e, t)` copies `beginBarDrag`'s shape: pointer capture, the 3 px threshold, `trackDrag`, the `showTip` text and `cancel` → `redraw("ganttRows")`.
  - Day under the pointer: `dayAt(SC, x)`, the inverse of `xOf` (add it beside `xOf` in `40-gantt.js:63`, where `xOf = (sc, day) => (day - sc.origin) * sc.px`, so `dayAt = (sc, x) => Math.floor(x / sc.px) + sc.origin`).
  - Preview: insert `barSvg(SC, t, y, { S, F })` into `#gBars`. **Change `barSvg`'s first line** to `if ((opts.S ?? t.S) == null) return "";` so a preview can draw a task that has no dates yet.
  - Save with `opSetField(t.id, "dates", { start: S, finish: F })`. `"dates"` already handles milestones.
- R9.5 hint: in `renderGanttRows`, if `sel` is undated and not a summary and visible, append to `#gSel` a `<text class="g-hint" x="${body.scrollLeft + 8}" y="${row*ROW + ROW/2 + 4}">…</text>` and a transparent `<rect class="g-draw">` over the row with `cursor:crosshair` (CSS). `#gSel` is redrawn on scroll, so the hint follows.

---

### R10. A searchable task picker (Jobs 4, 10)

The long `<select>` dropdowns for choosing a task become a button that opens a popover you can search.

**AC**
- R10.1 `openTaskPicker(rect, { title, exclude: Set, onPick(id) })` lists the project's tasks in outline order, indented by depth, as `WBS name`. Typing filters by name (case-insensitive substring) or WBS (equal or prefix, as `matchesFilter` does). ↑/↓ move the highlight, Enter or a click picks, Esc closes. The list shows at most 300 rows, with "Type to narrow down" beyond that.
- R10.2 It replaces these selects:
  - **＋ Link a task…** in the mitigant record (`mitTaskList`)
  - **＋ Add predecessor… / ＋ Add successor…** in the task record (`relDeps`)
  
  Each becomes a button with the same label. Exclusions stay as today (already linked; for links, also self, ancestors and descendants).
- R10.3 Picking runs the same op as today (`linkMit` / `opAddDep(…, "FS", null)`).

**Build:** `50-views.js`, next to `openPartyPickerFor`, using the same structure (search box, `.pick` list, `openPop(rect.left, rect.bottom + 4, box)`). Each row is a `.pick-btn` with `data-id`. Keep a highlighted index and set `aria-selected` on the highlighted button.

---

### R11. Risks: paste, ＋ Task opens the record, many-to-many (Job 10)

**R11.1 Paste in the Risks grid.**
- **Risk name** input (`.rk-name`), more than one line: chooser with
  1. **Fill down risk names**: overwrite in the displayed order from this risk; past the last risk, add new risks.
  2. **Add as new risks below this one**
  
  Blank lines are skipped (and in fill down still use up a row). Uses `opUpdateRisk` / `opAddRisk({ name, afterId })`.
- **Mitigant** textarea (`.rk-text`), more than one line: chooser with
  1. **Add as mitigants of this risk** (after this one)
  2. **Fill down this risk's mitigants**: overwrite this and the following mitigants of the same risk; add past the end.
  3. **Keep it as text in this mitigant**: insert the text at the cursor with `setRangeText`, then `autoGrow`.
  
  Uses `opAddMitigant(riskId, text, afterId)` / `opUpdateMitigant`.
- One `mutate` per paste, a note with Undo, then `focusRisk` to the last affected input.
- A single line pastes normally. The record's **Mitigation plan** textarea keeps normal paste (it has ✂ Split).
- **AC:** pasting 3 lines into a mitigant with option 1 adds 3 mitigants after it, in order, in one undo step.

**R11.2 Many-to-many everywhere.** One mitigant can have several tasks and one task several mitigants. The database already allows this (`mitigant_task`, `INSERT OR IGNORE`).
- **AC:** link task T to mitigants M1 and M2 and link M1 to T and U: the grid chips, the mitigant record's "Implemented by" list, and T's **Risks** tab all show every link. Unlinking one leaves the others.
- New: T's record **Risks** tab gets **＋ Link a mitigant…**, a searchable popover like R10 listing `Risk › mitigant` and excluding ones already linked, which calls `linkMit(mitId, t.id)`. This adds a link path from the plan side that doesn't need the drag.

**R11.3 ＋ Task opens the new task's record.**
- The **＋ Task** button on a mitigant row (grid) and in the mitigant record ("Implemented by") creates the task as today (`opTaskFromMitigant`, undated per R1). Then it switches to the Plan page and opens the new task's record with Name selected (`UI.formFocus = "name"; openRecord(id)`).
- **Back** returns to the Risks page with that mitigant's record open (R2.3). When ＋ Task was clicked from the grid with no risk record open, push `{ kind: "mitigant", id }` onto history first, so Back has somewhere to go.
- Dragging a mitigant **between** tasks in the plan pane keeps today's behaviour (the task is created there, flashed, and a small naming pop-up opens). The owner is usually linking several in a row, and jumping pages each time would get in the way.
- **Build:** `quickTask(m, place, { open = !place } = {})`. When `open` is true, skip `flashPlanRow`/`taskPopover` and do the above.

---

### R12. People and teams as tables, with paste (Job 1, roster)

The People page's two cards keep their headers and ＋ buttons, but their contents become **tables you edit in place**, like the Risks grid.

**People table:** Name · Email · Title · Team · Active · Tasks · (Involvement, Edit…)
- Name, Email and Title are inputs committed on change/blur with `bindText` (from `46-risks.js`; it's in the same scope).
- Team is a `<select>` of teams plus "— no team —" (`opSetPersonTeam`). Active is a checkbox (`opUpdateParty(id, { active })`). Tasks is the count from `assignmentCounts()`.
- **Edit…** opens today's `editParty` modal (which also deletes).
- Inactive rows are dimmed (`.inactive`).

**Teams table:** Name · Members (read-only, comma-separated) · Active · Tasks · (Involvement, Edit…). Members are still chosen in the Edit… modal.

**AC**
- R12.1 Editing a name, email or title in place saves on blur or Enter (one undo step per field). Enter moves to the same column in the next row; Shift+Enter moves to the row above.
- R12.2 **＋ Person** / **＋ Team** add a row named "New person" / "New team" and put the cursor in its Name with the text selected. No modal.
- R12.3 Multi-line paste into **Name**:
  1. **Fill down names**: overwrite in the displayed order from this row; add new people past the end.
  2. **Add as new people**: append all.
  
  Names already on the roster (case-insensitive) are skipped by option 2 and reported: `Already on the roster: Ana, Ben.` Blank lines are skipped.
- R12.4 Multi-line paste into **Email** or **Title**: fill down only. Stops at the last row and reports lines that didn't fit.
- R12.5 Multi-line paste into **Team** (the select has focus): fill down. Each line is matched case-insensitively to a team name. A team that doesn't exist is **created** and reported (`Created teams: QA, Ops.`). A blank line means no team. One team per person still holds (DECISIONS #60).
- R12.6 Multi-line paste into the Teams table's Name: Fill down / Add as new teams, as R12.3.
- R12.7 Fill down uses the order of rows **as displayed when the paste started** (captured from the DOM rows' `data-party`). After the change the table re-sorts by name, as today.
- R12.8 Focus survives redraws. Every input carries `data-f` and its row carries `data-party`, so `markFocus`/`refocus` (already run for the People view in `drawNow`) put the cursor back.

**Build:** rewrite `renderPeople()` in `50-views.js`, keeping `assignmentCounts`, `showInvolvement` and `editParty`. Rows are `h("tr", { "data-party": p.id, class: p.active ? "" : "inactive" }, …)` inside `table.ptable`. `initToolbar`'s `addPersonBtn`/`addTeamBtn` change to `mutate("Added person", () => { id = opAddParty("person", "New person"); })` and then focus via a one-shot `UI.peopleFocus = `${id}:name``, the `focusRisk` pattern. People paste goes through `parseClipColumn` and `openPasteChooser`, with `opAddParty`, `opUpdateParty`, `opSetPersonTeam` and `opAddParty("team", …)` inside one `mutate`. `drawNow` only redraws People on `all`; that's fine, since every mutate triggers `all`.

---

## 4. Tests to add (`tests/tests.js`)

Use the existing tag style (`"ui-plan"` for all of these) and put them before the final `P.reset()`.

| Test | Checks |
|---|---|
| new tasks undated | `cmdAdd`, `cmdAdd(…, true)`, a ＋ New subtask click, `opTaskFromMitigant` (both forms) → `start`/`finish` null. A summary of undated children renders (`P.renderAll()` doesn't throw). |
| back history | R2.1, R2.2, R2.4 (moveSel replaces), R2.5, R2.6 (delete the previous record, then Back skips it), R2.7 (switch project clears it) |
| back across pages | R2.3 with `PM.risk.openRiskRecord` → ＋ Task → `goBack()` → view is `risks`, `UI.riskSel` is the mitigant |
| new record opens | R3.1: after ＋ New subtask, `UI.selId` is the new id, the form is open, and `document.activeElement` is the Name field with its text selected |
| block select | R4.1–R4.4 via `selectTask(id, { extend: true })` and `gridKey` events with `shiftKey` |
| block indent / outdent / delete | R5.1–R5.6, including one undo step (`P.db.undoDepth` grows by 1) |
| parseClipColumn | the R6a cases |
| wbsLevels | `["1","1.1","2"]` → `[0,1,0]`; `["1","1.1.1","1.2"]` → `[0,1,1]`; `["2","x","2.1"]` → `[0,0,1]` with one bad line |
| paste modes | R7.1 (fill + add past the end), R7.2, R7.3, R7.4, R7.5 (matches + unknown names in the note), R7.6 (the owner's 3.2 example), R7.7 (a bad date row is skipped, the others are applied), each one undo step |
| paste chooser | `openPasteChooser` with 3 options: key `2` runs option 2; Esc runs none; the preview has at most 5 items |
| Description column | R8.1 cell text is the first line; R8.2 Enter opens the record with focus in `[data-f="notes"]` |
| draw a bar | Dispatch pointer events on `#ganttSvg` over an undated row (`beginBarDraw` path) → dates saved; a click without moving saves nothing; Escape cancels |
| task picker | R10.1 filter by name and by WBS prefix; Enter picks the highlighted row |
| risks paste and m2m | R11.1 option 1 on a mitigant; R11.2 links in both directions shown in `M.mitByTask` and `m.tasks` |
| people table | R12.2 add focuses Name; R12.3 both options and the duplicate report; R12.5 creates a missing team |

---

## 5. Out of scope

- Right-click menus (§6 D4).
- Dragging a block of rows. Moving a block up or down.
- Pasting several columns at once (the chooser warns and uses the first column).
- Risk descriptions and mitigation plans as paste targets. They aren't grid columns; the risk import covers whole registers.
- From Job 2's "later" list: ＋ Another subtask, typing names straight into the Subtasks tab, the recent-records list on Back.
- From Job 4's parked list: link in sequence, always-visible link handles, a one-click Fix for conflicts.
- Review items 6 (RAID "soon" tab), 8 (date formats), 9 (native `prompt()` in the party picker), 10 and 11.

---

## 6. Decisions made here

Add each one to `DECISIONS.md` (from #80), in the table's usual voice: *Question · Decision taken · Why / how to change*.

| # | Question | Decision | Why |
|---|---|---|---|
| D1 | What dates does a new task get? | None. Tasks you create are undated until you set dates; import and the sample keep their own. Supersedes #3. | Plans arrive as names from Excel. A date of "today" on every row was noise and set off false Issues. |
| D2 | What does Back remember? | Every record shown in a record panel, recorded when the panel draws. Keyboard stepping in the outline replaces the current entry. Capped at 50; cleared on another file or project. | One place catches every way a record opens, and Back stays useful after arrowing through the outline. |
| D3 | Does Back work across pages? | Yes, between the task record (Plan) and risk records (Risks). | ＋ Task from a mitigant jumps to the plan, and the owner needs the way home. |
| D4 | Right-click menus? | Not in this round. Block indent uses the toolbar ⇤ ⇥, and mouse paste uses a 📋 Paste toolbar button. | The app has no context-menu system yet, and the toolbar already holds these actions in plain sight. |
| D5 | Which rows does Fill down use? | The **visible** rows from the selected one, in outline order. Collapsed subtrees are skipped, and a filter is cleared first. | What you see is what gets filled; hidden rows never change silently. |
| D6 | How does a pasted WBS column become hierarchy? | "Nest these rows by WBS" on the # column: levels are relative to the first line, a skipped level drops to the lowest open one, the numbers are discarded, and order is kept. | The owner wanted the WBS for hierarchy only, with gaps falling to the lowest value. |
| D7 | Where do free-text descriptions go? | A **Description** column at the end of the outline, showing the first line of `task.notes`. Editing opens the record; paste fills it down. | Descriptions run to several lines, so an inline one-line editor would damage them. |
| D8 | What happens to unknown names pasted into R or A? | Known names are set and unknown ones are listed. People are never created from a task paste. | A typo shouldn't add a person to the roster. |
| D9 | Can pasting a Team create one? | Yes, on the People table only, and it's reported. | Rosters arrive with team names. Creating them is the expected result there, unlike a task's R/A cell. |
| D10 | What does ＋ Task on a mitigant do? | It opens the new task's record on the Plan page, with Back to the mitigant. Drag-create between tasks keeps the small pop-up. | One click to a filled-in record, without breaking the drag-linking rhythm. |
| D11 | After a paste, what's selected? | The affected rows, as a block. | The next step is usually to indent them. |
