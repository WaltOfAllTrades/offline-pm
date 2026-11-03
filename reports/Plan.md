# Interaction plan

The build spec is `Requirements - interaction plan.md`.

Decisions from walking through the jobs one by one (see `Jobs draft.md`). Each job lists what was decided, then what has to be built.

---

## How you work (applies to every job)
- **Mouse first.** Every action needs something visible to click: a button, a menu item, or a drag. A keyboard shortcut can be added on top, but never on its own.
- **Keyboard inside tables.** In the outline, the RACI matrix and the People table, typing, arrows, Tab, Enter and paste all need to be fast.
- **Wide screen.** Narrow or laptop layouts are low priority.

---

## Job 1. Rough out a new plan

**Input:** Excel tables, copied and pasted one column at a time. Names and free text only; dates aren't brought in. The same applies to people and teams.

### Decided
- **Paste fills down, like Excel.** Select a cell and press Ctrl+V. One line goes into each row, starting at that cell.
- **Only the Name column adds rows.** Pasting into any other column stops at the last row, and the toast says how many lines didn't fit.
- **Blank lines:** skipped in Name. In other columns they clear the cell, so the rows stay lined up with Excel.
- **Paste overwrites.** There's no confirm box; the toast offers Undo.
- **New tasks get no date.** A pasted plan starts unscheduled.
- **The WBS column gives hierarchy only.** Pasting `1, 1.1, 1.2, 2…` into the # column nests the rows. The numbers themselves are thrown away, and the app numbers the tasks its own way.
- **Indenting several rows at once is important.** Paste the names flat, select a block of rows, then press Alt+Shift+→ or ← to move the whole block.
- **Names pasted into R or A** are matched to the roster. Unknown names are listed in the toast, not created quietly.
- **People page:** becomes a table (Name · Email · Title · Team) that takes the same column paste. Pasting into Team matches team names; a team that doesn't exist is created and the toast says so.

### To build
1. **Selecting several rows in the outline.** Today only one row can be selected.
   - With the mouse: Shift+click a second row. (Dragging the WBS cell already moves a row, so it can't also select.)
   - With the keyboard: Shift+↑/↓.
   - A plain click or Esc goes back to one row.
2. **Indent and outdent for a block.** Every selected row moves one level and takes its subtasks with it.
   - The toolbar's ⇥/⇤ buttons work on the whole block, and so does Alt+Shift+→/←. No right-click menu this round (Requirements D4).
   - Indent fails, as it does today, if the first row has nothing above it at its level.
   - Outdent needs a rule for the block, because today outdenting one row makes the rows below it its children (DECISIONS #27).
3. **Column paste in the outline:** Name (adds rows), the free-text columns, R/A (matched to people), and # (WBS to hierarchy).
4. **People and teams as a table** that takes column paste.
5. **New tasks start with no dates.** This applies everywhere, not only to paste. Check how the Gantt, rollups and the Issues view treat tasks with no dates.

- **Pasting under an item in the middle of a plan:** the pasted rows become that item's subtasks and follow its hierarchy. A pasted WBS is read relative to the item: pasting `1, 1.1, 2` under 3.2 gives 3.2.1, 3.2.1.1, 3.2.2. The new rows go after the item's existing subtasks.
- **A WBS that skips a level** (`1` → `1.1.1`, same lead number) drops to the lowest open level (`1.1`) and numbering carries on from there.

- **A paste asks what to do.** Ctrl+V with more than one line opens a small chooser next to the cell. It shows the line count and the first few lines, so you can see you copied the right thing.
  - **Fill down:** overwrite this column from here, like Excel. In Name, it adds rows past the end.
  - **Add as subtasks of "[item]":** new rows after the item's existing subtasks.
  - **Add below:** new rows at the same level, straight after the item.
  - Choose with the keyboard (1, 2, 3 or the arrow keys, then Enter) or with a click. Esc cancels. The last choice is highlighted next time.
  - Only the choices that make sense are offered. The add options appear only in Name and #, since other columns can't create rows.
  - One line pasted while typing in a cell goes into that cell as text, with no chooser.
  - Ctrl+V is the main way in, since you're coming straight from Ctrl+C in Excel. A 📋 Paste toolbar button opens the same chooser for the mouse; the first time, the browser asks permission to read the clipboard (Requirements D4).

### Open
- Which free-text columns besides the name: description, notes, others? (Nothing more for now; revisit when building.)

---

## Job 2. ★ Break a phase down

**Today:** the phase's record › Subtasks tab › ＋ New subtask creates a row called "New task", dated from the last sibling. The toast says to go and find it. You're still on the phase's record. When you open the subtask, the only way back is the breadcrumb or ▲/▼, which step through the outline's order.

### Decided
- **＋ New subtask opens the new record straight away**, with no second click. The subtask exists the moment it's made. Its name is selected, so typing replaces "New task".
- **A Back button** on the record (**← 1.2 Design**, naming where it goes) returns to the record you were on before. The mouse's side Back button does the same.
- **Back is history, like a browser.** Every record you open in the panel is remembered, wherever you opened it from: a subtask row, a predecessor, the breadcrumb, the outline, the Gantt.
- **The breadcrumb stays** as the way to go *up* to where a record lives. Back is the way to go to where you *came from*.

### To build
1. ＋ New subtask (record panel and outline) opens the new record with the name selected.
2. A Back history and a ← button in the record header. The mouse's Back button (and Alt+←) work while the panel is open.
3. Going Back to the phase shows its Subtasks tab, with the new row highlighted.

### Later, if wanted
- An "＋ Another subtask" button on a new record.
- Typing names straight into the Subtasks tab.
- Right-click Back to see a list of recent records.

---

## Job 4. ★ Schedule the work

**Today:** type dates in the outline or drag bars on the Gantt. Links are made by typing `1.2FS+3d` in the Predecessors cell, by dragging from one bar's handle to another (the handles only show on hover), or with the record's "＋ Add predecessor…" dropdown, which has no search. Links never move dates (DECISIONS #1). A broken link shows as a red arrow and an issue.

**What's new because of Job 1:** pasted tasks have no dates, so every date is set here, in the app.

### Decided
- **On the Gantt, move whole bars and drag their edges.** This works today, for both the start and the finish edge, and stays the main way to set dates.
- **Consequence of Job 1:** an undated task has no bar to drag, so it needs a way to get its first one. Simplest: drag across its empty row on the Gantt to draw the bar. That's the only new piece.

### Parked (not chosen for now)
- Link a block in sequence; link handles always visible on the selected bar; a searchable predecessor picker; a one-click Fix for conflicts.

---

## Job 10. ★ Turn a risk register into tracked work

**Today:**
- **Risks** come in from an Excel file (risk import) or are typed into the Risks grid.
- **Mitigants:** a risk's mitigation plan is pasted into its record, then **✂ Split into mitigants** makes one mitigant per line.
- **Linking to tasks:**
  - Drag a mitigant's ⠿ onto a task in the plan pane on the right. Dropping it between two tasks creates a new task there.
  - **＋ Task** creates a task and opens a small naming pop-up. The task's record doesn't open.
  - The mitigant's record has "＋ Link a task…", a long dropdown with no search.
- **Gaps:** the Gaps badge counts risks that aren't handled yet.

### Decided
- **Mitigants and tasks are many-to-many.** One mitigant can be carried out by several tasks, and one task can carry out several mitigants. The database already supports this (the `mitigant_task` table); the build only has to make sure every linking path allows it.
- **Column paste in the Risks grid**, with the same chooser as Job 1.
- **＋ Task opens the new task's record** (Job 2), and **← Back** returns to the mitigant on the Risks page. Back works across pages.
- **Drag stays the main way to link.**
- **The "Link a task" dropdown gets search.** This matters more with many-to-many, since you link existing tasks often.
- **Where new tasks go:** where you drop them (as today). ＋ Task uses the current default.
