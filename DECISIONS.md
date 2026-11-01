# Questions and assumptions log

Questions that came up while building. For each I took my best guess and moved on. Change any of them and I'll adjust.

| # | Question | Decision taken | Why / how to change |
|---|---|---|---|
| 1 | Should dependencies move dates? | **No.** Links only flag conflicts (red arrow + Issues). There is no auto-scheduling. | You asked for this explicitly. A "Fix" button could be added later. |
| 2 | What are dates stored as? | `start` and `finish` as inclusive `YYYY-MM-DD` text. Duration is derived as Mon–Fri working days. | It's what people type into spreadsheets, and it avoids timezone bugs. There are no holiday calendars yet. |
| 3 | What duration does a new task get? | It starts on the selected task's start (or today, moved to the next weekday) and lasts 1 working day. | Matches MS Project's default of 1 day. |
| 4 | Do dragged bars snap to working days? | **Moving** a bar keeps its working-day duration and snaps the start to the next weekday (as MS Project does). **Resizing** snaps to calendar days, so you can put an edge exactly where you drop it. | A 4-day task stays 4 days when moved. |
| 5 | Can a summary task have its own dates? | No. They always roll up from the children. A task that loses all its children keeps its last stored dates. | Same as Smartsheet and ServiceNow. |
| 6 | How is summary % complete calculated? | Weighted by working-day duration across leaf tasks. Milestones carry no weight. If every weight is 0, it's a plain average. | Same as MS Project, Smartsheet and ServiceNow. |
| 7 | How is summary status derived? | All Done → Done; else any Blocked → Blocked; else any started → In progress; else Not started. | Simple and explainable. |
| 8 | Which status values exist? | Not started, In progress, Blocked, Done. Setting Done sets 100%; setting 100% sets Done; going from Done back to below 100% sets In progress. | Easy to read when sharing a plan. |
| 9 | How do predecessors refer to other tasks? | By **WBS number** in the Predecessors cell (`1.2FS+3d`). The links themselves are stored by task id, so moving tasks doesn't break them. | The ID column is hidden, and WBS is what people talk about. |
| 10 | Are links to or from summary tasks allowed? | Allowed (as in MS Project). Not allowed between a parent and its own child. | |
| 11 | Can a team be Accountable? | Allowed, with an *info*-level note. | The guidance says "a person", but monday and ServiceNow let a group own work. |
| 12 | How do RACI roles inherit? | A task with no A inherits the nearest parent's A for warnings and display, shown as "(inherited)". Nothing is copied. | Avoids flooding the plan with warnings on small subtasks. |
| 13 | Can one party have two roles on a task? | No. One letter per party per task. | Standard RACI matrix cell. |
| 14 | Are people/teams per project? | They're shared across every project in the file. | One team, many projects. |
| 15 | Can teams contain other teams? | No. Teams contain people only. | Kept out of scope by the report. |
| 16 | Multi-row selection? | One row at a time for indent/outdent/move/delete. | Keeps keyboard handling simple. Could be added later. |
| 17 | Import "update" mode: what does it change? | Rows whose ID matches a task in the current project update the mapped fields only. Unmatched rows are added. Hierarchy changes in the file are **ignored** for existing tasks. | Moving existing tasks from a spreadsheet is error-prone. |
| 18 | How are unknown names handled on import? | The value-mapping step offers: create person, create team, map to an existing person/team, or ignore. The default is "create person". A `team:` prefix forces a team. | Same as Jira and monday. |
| 19 | How are ambiguous text dates (03/04/2026) read? | You choose MDY or DMY in the wizard. It defaults to MDY unless a first part is greater than 12. | Your locale is likely US. |
| 20 | Can old browsers like Firefox or Safari be used? | They can open and export only. Saving needs Chrome or Edge. | File System Access API. |
| 21 | Where's the collapse state kept? | In localStorage per project. It isn't saved in the .db. | Each viewer chooses their own. |
| 22 | Is there a workday calendar? | Mon–Fri. No holidays. | Out of scope for v1. |
| 23 | What happens to `PRAGMA foreign_keys` after a save? | sql.js `export()` closes and reopens the database, which resets pragmas, so the app turns `PRAGMA foreign_keys=ON` back on after every export. | A technical gotcha, noted here so it doesn't get lost. |
| 24 | How does undo work? | Before each change the whole database is snapshotted, up to 40 steps. Undo restores the snapshot under a **new** revision number, so saving and recovery stay consistent. | Simplest correct approach at this data size. |
| 25 | How many tasks can it handle? | Rows are virtualized, so it should stay smooth up to a few thousand tasks. | |
| 27 | What does outdent do to the tasks below? | Later siblings become children of the outdented task, so the visible row order never jumps. | Same as MS Project and Smartsheet, where the outline is a positional list. |
| 28 | What if a move or indent puts a linked task under its own predecessor? | The link between parent and child is removed automatically, with a short message. | Those links aren't allowed (#10), and they'd show as a conflict that can never be fixed. |
| 29 | What about two people editing copies of the same .db, or two tabs? | Not supported: one editor, many viewers. A warning appears if the app is open in two tabs. When the browser buffer and the file disagree, the higher revision number wins. The two versions are **not** merged. | Merging is out of scope (see the report). The save log records what happened. |
| 30 | Do pickers save when you click away? | Yes. Clicking outside the people picker saves your ticks. Esc cancels. | Losing ticks silently felt worse than saving them. |
| 31 | When does import default to "Update current project"? | Only when the workbook was exported from **this same .db file** (matched by a random file id saved in the file) **and** the same project. Otherwise it defaults to "Create a new project". | Task ids restart at 1 in every file, so matching ids across files could overwrite the wrong tasks. |
| 32 | Is CSV export protected against Excel formula injection? | Yes. Text starting with `=` `+` `-` `@` gets a leading apostrophe, which re-import removes. | Standard protection, since task names can come from anyone. |
| 33 | How are `0.5` / `1` read in a % column? | If every number in the column is between 0 and 1, the column is read as fractions (so 1 = 100%). Text like `50%` is always read as written. | Excel's General format stores 100% as 1. |
| 34 | How does import decide something is a milestone? | If a Type column is mapped, it alone decides. Otherwise a duration of exactly 0 does. Part-day durations (`0.25d`) count as 1 day. | Stops weekend-only tasks, and MS Project's quarter-day tasks, from turning into milestones. |
| 35 | How are names separated in RACI cells? | Export uses `; `. Import splits on `;` or newlines when the cell contains them, otherwise on commas. Re-importing our own export splits on `;` only. | Lets names like "Smith, John" survive a round trip. |
| 36 | What does update-mode import change for dates? | Only the date fields the sheet provides. Start only keeps the task's working-day duration; Duration only keeps its start. Status and % go through the normal edit rules. | Never wipe dates the sheet didn't mention. |
| 37 | What happens to links when update-mode import runs? | It replaces only links between tasks that are both in the sheet. Links from rows the sheet doesn't include survive. | Teammates often delete rows that don't concern them before sending a sheet back. |
| 26 | Which ID is exported? | The internal task id goes into the export ID column, so re-importing in update mode matches rows exactly. | Makes "send the spreadsheet out, get updates back" work. |
