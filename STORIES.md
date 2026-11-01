# Offline PM: user stories

Scope: a single offline HTML file (Chrome/Edge) for **building a plan and sharing it with team members**. It is not a production scheduler. Dependencies **never change dates**; they only flag conflicts.

Each story lists its acceptance criteria. A tag in brackets after a criterion names the test in `tests/tests.js` that covers it.

## A. File, saving and safety
- **A1 Single file.** `offline-pm.html` runs with no network. SQLite (WASM) and SheetJS are inlined. [smoke]
- **A2 Live save.** Every change is one transaction with a revision number. It is written to the browser crash buffer and, when a file is connected, to the `.db` file. [persist]
- **A3 Survive refresh.** After a reload, the last revision is restored from the crash buffer. "Reconnect" writes any missing revisions to the file. [persist]
- **A4 New / Open / Save copy.** You can create a new empty plan file, open an existing `.db`, or save a copy. Opening a file warns first if the buffer holds work that isn't on disk.
- **A5 Undo/redo.** Ctrl+Z and Ctrl+Y step back and forth through changes, up to 40 steps. [undo]
- **A6 Upgrade old files.** A proof-of-concept file (flat `tasks`/`deps` tables) is upgraded automatically to the current schema when opened, and a v1 file gains the work-notes table without losing data. [migrate]
- **A7 Save status.** A status pill shows Saved / Saving / Not on disk / Reconnect needed. A save log is available.

## B. Projects
- **B1** One `.db` file can hold several projects. You can switch, create, rename and delete them. People and teams are shared across all projects in the file. [projects]

## C. WBS outline
- **C1 Hierarchy** of any depth. The WBS number (1.2.3.4) is calculated from position, never stored. [wbs]
- **C2 Edit structure.** Add a task (sibling below), add a subtask, indent (Tab), outdent (Shift+Tab), move up/down (Alt+Shift+↑/↓), drag a row to reorder or to nest it under another, and delete a task with its subtree. [wbs-ops]
- **C3 Inline editing** in spreadsheet style: name, start, finish, duration, % complete, status, predecessors, responsible, accountable.
- **C4 Summary rollups.** A summary task's start is its earliest child start and its finish is its latest child finish. % complete is weighted by duration. Status is derived from the children. These summary fields are read-only. [rollup]
- **C5 Milestones.** A milestone is a zero-duration task, drawn as a diamond. [milestone]
- **C6 Collapse and expand.** Collapse or expand individual rows, all rows, or down to level N. Collapse state is remembered per project.
- **C7 Filter.** Filter by text or by person. A person filter includes tasks assigned to that person's teams. Matching tasks keep their parent tasks visible. [filter]
- **C8 Working-day durations.** Durations count Monday–Friday only. Editing a duration recalculates the finish date. [dates]

## D. Dependencies (they don't move dates)
- **D1 Types and lag.** Finish-to-start (FS), start-to-start (SS), finish-to-finish (FF) and start-to-finish (SF), with a lag or lead in working days. [deps]
- **D2 Three ways to create one:** type in the Predecessors cell (`1.2FS+3d, 4`), use the record form's Predecessors/Successors tabs, or drag between bars on the Gantt. [pred-parse]
- **D3 Validity checks.** Circular dependencies, links to self and links between a parent and its own child are rejected. [deps]
- **D4 Conflicts are flagged, never fixed.** A link whose dates conflict shows as a red arrow and appears under Issues. [violation]

## E. Gantt
- **E1 Time grains.** Day, Week, Month and Quarter views with two-tier headers, plus Fit-to-screen and Today. The Gantt stays row-aligned with the outline.
- **E2 Bars.** Task bars show % complete, summary tasks show as brackets, milestones as diamonds. Each bar has a name label and colour shows status. A today line and weekend shading (day view) are drawn.
- **E3 Drag to change dates.** Drag a bar to move it and drag its edges to resize. A tooltip shows the dates while you drag. Summary bars can't be dragged.
- **E4 Drag to link.** Drag from a bar's start or end handle onto another bar's start or end to create a link. Which ends you use sets the type. Clicking an arrow lets you edit its type and lag or delete it.

## F. People, teams, RACI
- **F1 People** have a name, email, title and an active flag. **Teams** have a name and members. Deleting either asks for confirmation. [people]
- **F2 RACI.** Any task can have R, A, C or I set for any person **or** team, one letter per party per task. [raci]
- **F3 RACI matrix.** Tasks are rows and people/teams are columns. Clicking a cell cycles blank → R → A → A/R → C → I → blank (A/R turns on "Responsible same as Accountable"). Clicking a task name opens its record. [raci-ra]
- **F4 RACI warnings** (warnings only, never blocking): no Accountable (unless inherited from a parent), more than one Accountable, a team as Accountable, a leaf task with no Responsible, an inactive person assigned, an empty team assigned. [raci-rules]
- **F5 Involvement page.** For each person, a printable list of tasks grouped by role, including tasks assigned through their teams.

## G. Import / export
- **G1 Import wizard.** Upload an .xlsx or .csv file, choose the sheet and header row, map columns (auto-matched, with sample values), map status values and people, preview the tree and errors, then import. [import]
- **G2 Hierarchy rebuild.** Works from a WBS column (1.2.3), an Outline Level column, a Parent ID column, leading-space indentation, or a flat list. The WBS method doesn't depend on row order. [import-wbs]
- **G3 Value parsing.** Handles Excel dates (including the 1904 date system), text dates with an MDY/DMY choice, durations (`5d`, `2w`), percentages (`50%`, `0.5`) and predecessors (`3FS+2d`). [import-parse]
- **G4 Import modes.** Create a new project, add to the current project, or update the current project by matching the ID column. [import-update]
- **G5 Saved mappings.** A mapping is saved inside the .db, keyed by the file's header row, and reused automatically.
- **G6 Export.** Export .xlsx (Tasks, People, Notes and _meta sheets; the Notes sheet is for reading and import ignores it) or a .csv of tasks. An exported workbook re-imports with nothing lost. [roundtrip] [export]

## H. Communication
- **H1 Print / PDF.** Prints the outline and Gantt for the current filter and collapse state.
- **H2 Issues view.** Lists all warnings; clicking one jumps to its task. [issues]

## I. Record form (branch `notes`)
- **I1 Open a record.** Every task, milestone and summary task has a record form. Open it with the ↗ next to a task name, the 📄 Record button, Ctrl+I, or a double-click on a Gantt bar. It **slides in from the left, a third of the window wide, and pushes the outline right**; the Gantt stays put, so the outline's right-hand columns slide under it: clicking a visible row or a bar switches the form to that task, and any pending field edit is saved first. ✕, Esc or Ctrl+I closes it. [form]
- **I2 Header.** Shows the record type (Task / Milestone / Summary task), WBS number and name, a breadcrumb of parent tasks (each one clickable), and ▲/▼ for the previous and next record in outline order. [form]
- **I3 Fields.** Two columns, labels above: Name; Type/Status; Start/Finish; Duration/% complete; Accountable/Responsible; Parent/WBS code; Description. Accountable shows as inherited when it comes from a parent. A **Same as Accountable** switch makes Responsible follow the Accountable (shown as A/R in the matrix). [form] [raci-ra] It uses the same edit rules as the outline. Rolled-up fields are read-only on summary tasks. [form]
- **I4 Mini Gantt for parents.** A summary task's record shows a small Gantt of its subtasks, scaled to fit, with % complete fill, status colours, milestones, a today line, the parent's date range shaded, and links between the subtasks (conflicts in red). It shows direct subtasks by default; an "All levels" toggle shows the whole subtree, up to 80 rows. Clicking a subtask's bar or label opens its record. [form] [mini-gantt]
- **I5 Work notes.** A journal made only of notes, newest first. Each note shows a small blank person avatar, the yellow work-note bar, the date and time (absolute, plus relative such as "3 h ago"), and "(edited)" after a change. Notes carry no name. Post with the Post button or Ctrl+Enter. [notes] [form]
  - Notes can be edited inline (Ctrl+Enter saves, Esc cancels) and deleted, with confirmation and undo.
  - An unposted draft is kept for each record while you move between records.
  - Note text is shown exactly as written, and http(s) links are clickable.
- **I6 Subtask notes on parents.** A summary task's stream includes its subtasks' notes by default, each labelled with a link to its subtask. A toggle switches to the parent's own notes only. [form]
- **I7 Notes are data.** They are stored in the .db, included in undo/redo and live saving, deleted along with their task, counted (💬) in the outline, and exported to Excel. [notes] [export]
- **I8 Related records.** Tabs at the bottom of the form, each with a count. [related]
  - **Subtasks** has a ＋ New subtask button.
  - **Predecessors** and **Successors** let you add, change the type or lag of, or remove links.
  - **People (RACI)** lets you add, change or remove people and teams.
  - **Plan issues** lists the plan warnings for this task.
  - **RAID** is a placeholder for the upcoming risks, actions, issues and decisions.
  - The last tab you used is remembered.
  - New record types are added to the tab list in one place (`RELATED_TABS`).

## J. Risks (branch `notes`)
- **J1 Risk register.** A **Risks** tab lists risks (by name; ids stay hidden) with their mitigants indented underneath, in one table with inline editing. Enter adds the next mitigant, Backspace on an empty mitigant deletes it, and ＋ Risk adds a risk. [risks-ui]
- **J2 Risk.** Name, description, the mitigation plan as received, a response (**Mitigate** or **Accept** with a reason), probability and impact (Low/Medium/High), and Accountable/Responsible with a Same-as switch. Status is derived: **Accepted**, **Mitigating** (until every mitigant is achieved) or **Mitigated**. [risks]
- **J3 Mitigant.** Text, Accountable/Responsible (Accountable inherited from the risk when empty; Same-as switch), a **Control** checkbox, status **Not started → Planned → Implemented → Tested**, a multi-line **Testing** field, and "handed to" (who runs it after the project). [risks]
  - With linked tasks, the status is Planned until every task is Done, then Implemented.
  - Tested is always set by hand, and so is any status on a mitigant with no linked tasks.
  - A mitigant is **achieved** at Implemented, or at Tested if it's a control. [risks]
- **J4 Implements.** The only relationship: a mitigant is implemented by tasks (many-to-many). The task record has a **Risks** tab, and the outline shows 🛡 on those tasks. Deleting a task removes its links. [risks]
- **J5 Drag and drop.** The Risks page has a plan pane listing the WBS. [risks-ui]
  - Drag a mitigant's ⠿ onto a task to link them, or between two tasks to create a task at that spot that implements it.
  - Drag a risk to choose which mitigant (or a new one) to use.
  - Drag a task from the plan pane onto a mitigant to link them.
- **J6 ＋ Task.** Creates "Implement: <mitigant>" under a top-level "Risk mitigation" summary task (or the parent last used), linked to the mitigant and carrying its Accountable/Responsible. [risks] [risks-ui]
- **J7 Split.** Paste a mitigation plan into the risk and press **Split into mitigants**. It proposes one mitigant per line, bullet, numbered item or sentence (without breaking at "e.g."), which you can edit before adding. [risks] [risks-ui]
- **J8 Record panel.** The same slide-out panel as tasks, for a risk or a mitigant: fields, the mitigant list or linked tasks, and work notes. Esc closes it. [risks-ui]
- **J9 Gaps.** Risks and mitigants are flagged ⚠ when:
  - a risk has no mitigants, or is accepted without a reason;
  - a mitigant has no task and hasn't started;
  - a control is implemented but not tested;
  - a linked task is overdue.

  A **Gaps** filter and a count on the tab show them. [risks-ui]
- **J10 Closeout.** A report listing each risk and mitigant with its status, **Achieved ✓/✗**, evidence (linked tasks with status and finish date), testing notes and handover. A summary line reads like "x of y mitigants achieved · a of b risks fully mitigated · c accepted". It can be printed or exported to Excel, and Excel export of the plan includes a Risks sheet. [risks]
- **J11 Import.** **Import risks…** reads a risk register from Excel/CSV: it finds the header row, auto-maps columns (risk, owner, likelihood, impact, mitigation plan, response), matches owner names to people (or adds them), converts Low/Medium/High or 1–5 values, and optionally splits each plan into mitigants. [risks]

