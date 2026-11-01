# Offline PM: user stories

Scope: a single offline HTML file (Chrome/Edge) for **building a plan and sharing it with team members**. It is not a production scheduler. Dependencies **never change dates**; they only flag conflicts.

Each story lists its acceptance criteria. A tag in brackets after a criterion names the test in `tests/tests.js` that covers it.

## A. File, saving and safety
- **A1 Single file.** `offline-pm.html` runs with no network. SQLite (WASM) and SheetJS are inlined. [smoke]
- **A2 Live save.** Every change is one transaction with a revision number. It is written to the browser crash buffer and, when a file is connected, to the `.db` file. [persist]
- **A3 Survive refresh.** After a reload, the last revision is restored from the crash buffer. "Reconnect" writes any missing revisions to the file. [persist]
- **A4 New / Open / Save copy.** You can create a new empty plan file, open an existing `.db`, or save a copy. Opening a file warns first if the buffer holds work that isn't on disk.
- **A5 Undo/redo.** Ctrl+Z and Ctrl+Y step back and forth through changes, up to 40 steps. [undo]
- **A6 Upgrade old files.** A proof-of-concept file (flat `tasks`/`deps` tables) is upgraded automatically to schema v1 when opened. [migrate]
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
- **D2 Three ways to create one:** type in the Predecessors cell (`1.2FS+3d, 4`), use the details panel, or drag between bars on the Gantt. [pred-parse]
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
- **F3 RACI matrix.** Tasks are rows and people/teams are columns. Clicking a cell cycles blank → R → A → C → I → blank.
- **F4 RACI warnings** (warnings only, never blocking): no Accountable (unless inherited from a parent), more than one Accountable, a team as Accountable, a leaf task with no Responsible, an inactive person assigned, an empty team assigned. [raci-rules]
- **F5 Involvement page.** For each person, a printable list of tasks grouped by role, including tasks assigned through their teams.

## G. Import / export
- **G1 Import wizard.** Upload an .xlsx or .csv file, choose the sheet and header row, map columns (auto-matched, with sample values), map status values and people, preview the tree and errors, then import. [import]
- **G2 Hierarchy rebuild.** Works from a WBS column (1.2.3), an Outline Level column, a Parent ID column, leading-space indentation, or a flat list. The WBS method doesn't depend on row order. [import-wbs]
- **G3 Value parsing.** Handles Excel dates (including the 1904 date system), text dates with an MDY/DMY choice, durations (`5d`, `2w`), percentages (`50%`, `0.5`) and predecessors (`3FS+2d`). [import-parse]
- **G4 Import modes.** Create a new project, add to the current project, or update the current project by matching the ID column. [import-update]
- **G5 Saved mappings.** A mapping is saved inside the .db, keyed by the file's header row, and reused automatically.
- **G6 Export.** Export .xlsx (Tasks, People, Teams and _meta sheets) or a .csv of tasks. An exported workbook re-imports with nothing lost. [roundtrip]

## H. Communication
- **H1 Print / PDF.** Prints the outline and Gantt for the current filter and collapse state.
- **H2 Issues view.** Lists all warnings; clicking one jumps to its task. [issues]
