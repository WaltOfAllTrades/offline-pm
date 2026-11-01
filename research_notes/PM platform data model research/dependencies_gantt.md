# Task Dependencies and Gantt Charts in PM Platforms (implementation notes)

Research date: 2026-10-31. About 17 tool calls. Some official help pages blocked fetching (monday.com returned 403; one MS Project article returned 404; the Asana article body was truncated), so some findings come from search-result summaries of official pages and are marked as such. Items labeled "[unverified]" or placed under Inferences are general domain knowledge with no source fetched in this session.

## Q1. Dependency types, lag/lead, and units by platform

### Takeaway
Classic PM tools (MS Project, Smartsheet, Wrike, TeamGantt, Asana, ServiceNow, DHTMLX, SVAR) support all four types (FS/SS/FF/SF), with FS as the default. Lag is a signed duration, where negative lag means lead. MS Project and Smartsheet also offer elapsed-time lag, and MS Project offers percentage lag. Simpler work-management tools (ClickUp, monday.com) model dependencies mostly as FS-style "blocking / waiting on" links. Asana has four types but no native lag.

### Cited Findings
**Microsoft Project**
- Four predecessor types: FS (default), SS, FF, SF. — [MS Support: Predecessors field](https://support.microsoft.com/en-us/project/predecessors-task-field)
- Lag is a positive value and lead is a negative one. Lag can be a percentage of the predecessor's duration (e.g. `20%`, `-10%`) or elapsed time that ignores nonworking days (e.g. `2ed`, `-2ew`). — [MS Support: Add lead or lag time](https://support.microsoft.com/en-us/project/add-lead-or-lag-time-to-a-task) (via search summary)
- The VBA/object model exposes a `TaskDependency` object (with From/To/Type/Lag properties). — [learn.microsoft.com TaskDependency](https://learn.microsoft.com/en-us/office/vba/api/project.taskdependency)

**Smartsheet**
- FS (default), FF, SS, SF. — [Smartsheet: Enabling dependencies](https://help.smartsheet.com/articles/765727-enabling-dependencies-using-predecessors)
- Lag syntax goes in the Predecessors column, e.g. `1d` on FS means one working day after the predecessor finishes. Negative values (`-1d`) are lead. Units are `w`, `d` (working days, fractional allowed, e.g. 3.5d), `h`, `m`, `s`, `ms`, and combinations (`4h 30m`). An `e` prefix (e.g. `e3d`, `e5h`) means elapsed time, which counts non-working time. — [Smartsheet](https://help.smartsheet.com/articles/765727-enabling-dependencies-using-predecessors)
- A row can have multiple predecessors, entered as comma-separated row numbers. — [Smartsheet](https://help.smartsheet.com/articles/765727-enabling-dependencies-using-predecessors)

**ServiceNow SPM/PPM Planning Console**
- Dependency column format: `<WBS#><type><lag>`, e.g. `1.1fs+0`. Lag is in days and can be a positive or negative integer. — [Boston University ServiceNow PPM guide](https://bu.edu/tech/about/service/ppm/project-and-program-managers/how-to-use-project-scheduling-functionality)
- Sources disagree on which types are supported. The BU guide mentions FS and FF plus lag. Another source (Georgia Tech planning-console PDF or ServiceNow docs, per the search summary) lists SS and SF as well. — [BU](https://bu.edu/tech/about/service/ppm/project-and-program-managers/how-to-use-project-scheduling-functionality); [GA Tech SPRJ104 PDF](https://oit.gatech.edu/sites/default/files/documents/ITBM/sprj104_-_creating_a_wbs_using_the_planning_console.pdf); [ServiceNow docs: Modify a project task dependency](https://docs.servicenow.com/bundle/utah-it-business-management/page/product/project-management/task/t_ModifyProjectTaskDependencies.html)
- Dependencies are stored in the Planned Task Relationship table (`planned_task_rel_planned_task`). — [ServiceNow docs](https://docs.servicenow.com/bundle/utah-it-business-management/page/product/project-management/task/t_ModifyProjectTaskDependencies.html) (via search summary; the table's system name is [unverified])

**Wrike**
- Four types: FS, SS, FF, SF. Lead/lag is set together with the dependency type, and per a user report it was historically only editable in Gantt view. — [Wrike community: Leads and Lags](https://help.wrike.com/hc/en-us/community/posts/115000170609?page=5); [Wrike blog](https://www.wrike.com/blog/project-management-software-with-dependencies/)

**Asana**
- Four types: FS (default at creation), FF, SS, SF. The type can be changed after creation. — [Asana: dependency types](https://help.asana.com/s/article/dependency-types) (via search summary; direct fetch truncated)
- No native lag field. Forum answers say there is currently no setting for dependency lag. Third-party tools (Flowsana, Instagantt) add it. — [Asana forum: Dependencies with lags](https://forum.asana.com/t/dependencies-with-lags/1153817)
- Dependency type is not exposed in the public API. — [Asana forum: API request](https://forum.asana.com/t/dependency-type-fs-ff-ss-sf-should-be-provided-by-the-api/1081087)

**ClickUp**
- Relationship types are "Waiting on", "Blocking" (reciprocal pair, effectively FS), and "Linked" (no scheduling constraint). — [ClickUp: Dependency relationships](https://help.clickup.com/hc/en-us/articles/6309155073303-Dependency-Relationships)

**monday.com**
- A Dependency column links items. The API exposes a `dependency_mode`, which only has an effect when the board has a Date or Timeline column. — [monday API: Dependency](https://developer.monday.com/api-reference/reference/dependency)
- I could not confirm whether monday supports SS/FF/SF or lag. The help page returned 403. The third-party article title "Tips and Types Explained" suggests types exist. — [Simon Sez IT](https://www.simonsezit.com/article/monday-com-dependencies/) [unverified]

**TeamGantt**
- Four types: FS, SS, FF, SF. Lag/lead is set via the blue dot on the bar, then "Set": positive = lag, negative = lead. — [TeamGantt support: Dependencies](https://support.teamgantt.com/article/8-dependencies)

**Jira Plans (Advanced Roadmaps)**
- Native Plans dependencies are issue links shown on the timeline. The search gave no official confirmation of FS/SS/FF/SF or lag in native Plans. Dependency logic needs Premium/Enterprise and cannot cross plan scope. Marketplace add-ons (ALM Works Structure.Gantt, Ganttry, FastGantt) add the four types and lead/lag (e.g. `1d 3h 30m`, negative = lead). — [ALM Works: Lead-Lag](https://wiki.almworks.com/display/cloudgantt/Dependency+Lead-Lag+Time); [Ganttry](https://marketplace.atlassian.com/apps/1675319861/ganttry-critical-path-dependencies-gantt-chart-for-jira); [FastGantt](https://marketplace.atlassian.com/apps/2892017812/fastgantt-gantt-charts-timelines-for-jira)

### Inferences
- A minimal model looks like this: `Link { id, sourceId, targetId, type: 'FS'|'SS'|'FF'|'SF', lagDays: number (signed, working days) }`. Optional extensions are `lagUnit: 'wd'|'ed'|'%'` and `lagPercent`. Start with signed working-day lag, which covers ServiceNow, TeamGantt, Wrike and the DHTMLX-style libraries.
- The constraint formulas for a successor S and predecessor P with lag L are:
  - FS: S.start ≥ P.finish + L
  - SS: S.start ≥ P.start + L
  - FF: S.finish ≥ P.finish + L
  - SF: S.finish ≥ P.start + L
  These are standard definitions and match the Smartsheet and TeamGantt descriptions.
- SF is rarely used. Shipping FS plus SS/FF and hiding SF behind an advanced option is reasonable.

### Gaps
- monday.com dependency types and lag: the official page was blocked (403).
- Native Jira Plans link-type support was not confirmed.
- Whether ServiceNow's planning console supports SS/SF in current releases: sources conflict.

## Q2. Scheduling behavior on change (auto vs manual, strict/flexible, calendars, constraints)

### Takeaway
Tools split into three behaviors: (a) push dependents forward to keep the relationship valid, (b) shift dependents by the same delta to keep the gap, and (c) do nothing and only flag violations (for example with red lines). monday.com exposes all three as board-level modes. Calendars of working days are the norm, and elapsed lag is an opt-in.

### Cited Findings
- **monday.com dependency modes** (official help summarized via search):
  - Flexible: ensures no overlap between the dates of dependent items. Dependents move only if a conflict occurs.
  - Strict: when an item's date changes, its dependents change in exactly the same way (the gap is kept, and successors also pull back when the predecessor moves earlier).
  - No action: dates don't shift automatically.
  - A community reply contradicts this, claiming Strict allows overlaps but keeps the distance. Treat that as user opinion. — [monday help](https://support.monday.com/hc/en-us/articles/360007402599); [monday API](https://developer.monday.com/api-reference/reference/dependency); [community thread](https://community.monday.com/t/dependencies-disable-new-behavior-strict-flexible/47696)
- **Smartsheet**: changing a predecessor's start or end immediately moves dependent dates. Any two of Start/End/Duration compute the third. Manually typing a date on a dependent row overrides the link and removes the predecessor value from that row. End dates skip non-working days and holidays. A task can be manually started on a non-working day, and that day then counts toward duration. — [Smartsheet](https://help.smartsheet.com/articles/765727-enabling-dependencies-using-predecessors)
- **Asana** timeline auto-shift options include "Maintain buffer" (lag shifting, which keeps the time between dependent tasks). Asana does not preserve lag if a predecessor runs late. — [Asana: managing tasks and dependencies with timeline](https://help.asana.com/s/article/managing-tasks-and-dependencies-with-timeline); [Asana forum](https://forum.asana.com/t/dependencies-with-lags/1153817). Asana also has "Auto-shifting dates for dependent tasks" with options to consume buffer or ignore. Those option names are [unverified] because the article body could not be fetched.
- **ClickUp** Reschedule Dependencies: when a blocking task's dates change, ClickUp shifts the start and due dates of waiting tasks. The blocking task needs a due date and the blocked task needs a start date. In Gantt, dragging a task reschedules the downstream chain, but only visible tasks are rescheduled. Users report that rescheduling considers only the edited blocker, not all blockers, and that moving a task earlier does not pull dependents back. — [ClickUp: Reschedule dependencies](https://help.clickup.com/hc/en-us/articles/6304547785367-Reschedule-Dependencies); [ClickUp feedback: respect all blockers](https://feedback.clickup.com/feature-requests/p/reschedule-dependencies-should-respect-all-blocking-tasks-not-just-the-one-being); [ClickUp feedback: earlier date](https://feedback.clickup.com/feature-requests/p/reschedule-dependencies-when-moving-the-task-to-an-earlier-date)
- **Wrike**: rescheduling a task automatically reschedules all dependent active tasks. Completed, cancelled or deferred tasks are not moved. — [Wrike blog/help summary](https://www.wrike.com/blog/project-management-software-with-dependencies/)
- **TeamGantt** does not force moves. Invalid dependencies (the successor starts before the predecessor ends) draw red. The user fixes them by dragging, or with the "Fix invalid dependencies" menu item. — [TeamGantt support](https://support.teamgantt.com/article/8-dependencies)
- **ServiceNow** cross-project external dependencies are "soft" (notify only) or "hard" (move tasks and notify). — [BU ServiceNow guide](https://bu.edu/tech/about/service/ppm/project-and-program-managers/how-to-use-project-scheduling-functionality)
- **MS Project**: auto-scheduled tasks recompute from predecessors. The project summary task adjusts automatically. Elapsed lag (`ed`, `ew`) ignores nonworking time. — [MS Support lead/lag](https://support.microsoft.com/en-us/project/add-lead-or-lag-time-to-a-task)
- **frappe-gantt** has a single boolean, `move_dependencies` (default true), that controls whether dragging a task moves its dependents. — [frappe/gantt README](https://github.com/frappe/gantt)
- **DHTMLX** auto-scheduling is a plugin: `gantt.plugins({ auto_scheduling: true })`. Work calendars plus `correct_work_time` govern working-day behavior. — [DHTMLX time scale guide](https://docs.dhtmlx.com/gantt/guides/configuring-time-scale/)

### Inferences
- A good small-app design offers a per-project `scheduleMode: 'strict' | 'flexible' | 'none'`, modeled on monday.com:
  - flexible = push successors forward only when violated, never pull back.
  - strict = apply the same delta to all transitive successors.
  - none = only flag violations with red arrows, as TeamGantt does.
- Constraint types [unverified, MS Project domain knowledge, not fetched this session]: ASAP (default), ALAP, Start No Earlier Than, Start No Later Than, Finish No Earlier Than, Finish No Later Than, Must Start On, Must Finish On. For a small app, model ASAP plus an optional "SNET" date. Manually-dragged tasks in flexible mode effectively act as SNET.
- Working-day math needs `addWorkingDays(date, n)` and `workingDaysBetween(a, b)` over a calendar of weekend days plus a holiday list. Store dates as day indices (integers) to avoid time-zone issues.
- Cascading propagation: do a topological sort of the link graph from the changed task, then for each successor compute `max(constraint over all its incoming links)`. This fixes the ClickUp complaint that only one blocker is respected.

### Gaps
- Exact MS Project constraint-type behavior and its manual vs auto-scheduled task mode were not fetched.
- Asana auto-shift option names need verification.

## Q3. Circular dependencies, cross-project links, summary-task links

### Takeaway
Documentation on cycle prevention was thin. Tools generally reject or warn on cycles (standard practice), and a small app should reject a link if the target can already reach the source. Cross-project links exist in ServiceNow (soft/hard), monday.com (via connected boards, unverified), and Jira Plans (limited to plan scope). Summary-task links: Smartsheet allows a predecessor on a parent row and applies it to all children. MS Project allows them, but that is unverified here.

### Cited Findings
- Smartsheet: a predecessor on a parent row applies to all its children and restricts editing their dates directly. Parent Start/End/Duration/% Complete roll up from children and are read-only. — [Smartsheet](https://help.smartsheet.com/articles/765727-enabling-dependencies-using-predecessors)
- ServiceNow: right-click a WBS task and choose "Add External Dependency" (soft or hard) for cross-project links. — [BU guide](https://bu.edu/tech/about/service/ppm/project-and-program-managers/how-to-use-project-scheduling-functionality)
- Jira Plans: dependency logic cannot cross outside plan scope. — [ones.com summary](https://ones.com/blog/?p=1072552) (secondary source)

### Inferences
- Cycle check on link create: run a DFS/BFS from the target over successor edges. If it reaches the source, reject the link with a toast such as "Would create a circular dependency". This is O(V+E) and trivial for small projects. Also reject self-links and duplicate (source, target) pairs.
- Summary tasks: the simplest rule is to disallow links on summary tasks. If you allow them, treat a link to a summary as a link to its earliest-starting child (for SS/FS-in) or constrain all children, as Smartsheet does. MS Project allowing summary links is [unverified] here, as is Asana's lack of milestone/section links.
- Summary bars should be derived (min child start, max child finish) and read-only.

### Gaps
- I found no official documentation on cycle-error UX for any platform.
- MS Project's summary-task linking rules (it allows them, but with known caveats) were not fetched.

## Q4. Critical path: which tools show it and the algorithm

### Takeaway
MS Project, Smartsheet, Wrike (including total and free float), Ganttry for Jira, DHTMLX (PRO) and Bryntum show a critical path. Asana, ClickUp and monday.com provide it partially or not at all (not verified). The algorithm is a standard forward and backward pass over a topologically sorted DAG.

### Cited Findings
- Smartsheet can highlight the critical path in Gantt view. — [Smartsheet](https://help.smartsheet.com/articles/765727-enabling-dependencies-using-predecessors)
- Wrike highlights the critical path, can filter to only critical tasks, and shows total and free float as columns in the Gantt. — [Wrike Gantt feature page](https://wrike.com/features/gantt-chart-vaa) (via search summary)
- Ganttry (a Jira add-on) shows the critical path. — [Ganttry](https://marketplace.atlassian.com/apps/1675319861/ganttry-critical-path-dependencies-gantt-chart-for-jira)

### Inferences (standard CPM; textbook algorithm, no source fetched this session)
1. Topologically sort tasks with Kahn's algorithm. A failure means a cycle.
2. Forward pass. For each task in topological order:
   - ES = max over incoming links of: FS `pred.EF + lag`; SS `pred.ES + lag`; FF `pred.EF + lag - dur`; SF `pred.ES + lag - dur`.
   - Default ES is the project start (or the task's SNET constraint if later).
   - EF = ES + dur.
3. Project finish = max EF.
4. Backward pass. In reverse order, LF = min over outgoing links to successor s of: FS `s.LS - lag`; SS `s.LS - lag + dur`; FF `s.LF - lag`; SF `s.LF - lag + dur`. Default LF is the project finish. Then LS = LF - dur.
5. Total float = LS - ES. Critical means total float ≤ 0. Free float = min over successors of (successor's constrained earliest date - this task's EF), or the slack before the first successor is affected.
6. Do all math in working-day indices. Map to calendar dates only for rendering. Milestones have dur = 0.
- Rendering: color critical bars and critical links (both ends critical and the link is driving, meaning zero slack on that link) in red/orange.

### Gaps
- Whether Asana, monday.com or ClickUp currently show a critical path in late 2026 was not verified (ClickUp has historically offered it in Gantt; [unverified]).

## Q5. Drag-and-drop dependency UX, editing, arrow routing, bar interactions

### Takeaway
The universal pattern is to hover a bar, which reveals small circular handles at its start and end, then drag from a handle to a handle on another bar. The source handle (start/end) and target handle (start/end) determine the type: end→start = FS (the default), start→start = SS, end→end = FF, start→end = SF. Editing is done by double-clicking or clicking the arrow, which opens a popover or dialog with type, lag and delete.

### Cited Findings
- TeamGantt: drag from the dot at the end of a task to the start of the dependent task. To bulk-link, Shift-select tasks and press Shift+D to chain them in sequence (a keyboard alternative). To change type or lag, click the blue dot at the end of the bar (or use the task edit window). To delete, use the (x) in Task Details or hover the line and click its blue dot. Red lines mark invalid dependencies. — [TeamGantt support](https://support.teamgantt.com/article/8-dependencies)
- ServiceNow Planning Console: drag a white end-circle to another task to create a dependency. Double-click the dependency line on the Gantt, change type or lag, then click Update. Dependencies can also be typed in the Dependency grid column (`1.1fs+0`). — [BU guide](https://bu.edu/tech/about/service/ppm/project-and-program-managers/how-to-use-project-scheduling-functionality); [ServiceNow docs](https://docs.servicenow.com/bundle/utah-it-business-management/page/product/project-management/task/t_ModifyProjectTaskDependencies.html)
- ClickUp: drag from one bar's end to the next bar's start, then choose Blocking or Waiting on (third-party tutorial). — [Guideflow tutorial](https://www.guideflow.com/tutorial/how-to-create-a-dependency-in-a-gantt-view-in-clickup)
- SVAR Gantt: a link created by dragging defaults to `e2s` (end-to-start). Mirror docs say the type follows the connectors used. — [SVAR links API](https://docs.svar.dev/react/gantt/api/properties/links/); [mintlify mirror](https://mintlify.wiki/svar-widgets/gantt/configuration/tasks-and-links)
- frappe-gantt supports dragging bars to move them, edge-resizing, and dragging progress (`readonly_progress`, `readonly_dates`, `readonly` flags), with snapping via `snap_at` (default `1d`). — [frappe/gantt](https://github.com/frappe/gantt)
- Smartsheet and ServiceNow also allow entering dependencies textually (a Predecessors column with `3FS +2d`-style syntax), which works as a keyboard alternative. — [Smartsheet](https://help.smartsheet.com/articles/765727-enabling-dependencies-using-predecessors); [BU](https://bu.edu/tech/about/service/ppm/project-and-program-managers/how-to-use-project-scheduling-functionality)

### Inferences (design guidance; general Gantt-library conventions, partly [unverified])
- Handles: show 8–10px circles just outside the bar's left and right edges on hover. While dragging, draw a straight or elbow "rubber band" line from the handle to the cursor. Highlight a valid drop handle when hovering a target bar. Dropping on a bar body (not a handle) defaults to that bar's start (FS).
- Hit regions on the bar: left 6px = resize start, right 6px = resize end, body = move, and a small triangle at the progress boundary = progress drag (frappe/DHTMLX style). Snap to the zoom grain's unit (day at day/week zoom, week at month zoom).
- Arrow routing (the common "elbow" style used by MS Project/DHTMLX/frappe):
  - FS: exit the predecessor's right edge horizontally about 10px, then go vertical to the successor row's mid-line, then horizontal into the successor's left edge with an arrowhead.
  - If the successor starts before the predecessor's end plus the gap: exit right, drop to half a row height between rows, go back left past the successor start minus 10px, drop to the successor row, then enter the left edge (an S-shaped 5-segment path).
  - SS: both legs exit or enter on the left.
  - FF: both on the right.
  - SF: exit left, enter right.
  - Draw links on an SVG layer beneath bars. Give each `<path>` a wider transparent stroke (8px) as its hit area.
- Edit and delete: click an arrow to select it (thicker or highlighted), and Delete/Backspace removes it. Double-click opens a popover with a type dropdown, a lag number input, and a Delete button.
- Keyboard: for an accessible alternative, provide a "Predecessors" text cell (`3FS+2`, `5SS`) and TeamGantt-style "link selected tasks in sequence".

### Gaps
- Official MS Project drag-linking docs (dragging from the middle of one bar onto another creates FS; double-click the link line opens the Task Dependency dialog) could not be fetched; the link page returned 404. [unverified]
- monday.com Gantt drag-to-connect UX was not fetched.

## Q6. Gantt timescales, zoom grains, and rendering

### Takeaway
Libraries model zoom as named "levels". Each level is a stack of 1–3 header rows (for example month over day, or year over quarter) plus a column width. Common grains are hour, day, week, month, quarter and year, plus "zoom to fit".

### Cited Findings
- DHTMLX `gantt.config.scales` is an array of `{unit, step, format}` rows, where format is a strftime-like string or a function. Units are minute, hour, day, week, month, quarter and year, and custom units can be added via `gantt.date.<unit>_start` / `add_<unit>`. Several scale objects produce stacked header rows that share `scale_height` equally. — [DHTMLX time scale](https://docs.dhtmlx.com/gantt/guides/configuring-time-scale/)
- DHTMLX zoom extension `gantt.ext.zoom.init({levels:[...]})` defines these example levels:
  - day: one row "%d %M", min_column_width 80.
  - week: week row (custom label) over a day row, min width 50.
  - month: "%F, %Y" over "Week #%W", min width 120.
  - quarter: "%M" month over a custom quarter row, min width 90.
  - year: "%Y", min width 30.
  - Methods: `setLevel(name)`, `zoomToFit()`, `resetZoom()`, `getLevels()`, `getCurrentLevel()`. A mouse-wheel zoom sample exists.
  — [DHTMLX zooming](https://docs.dhtmlx.com/gantt/guides/zooming/)
- frappe-gantt `view_mode` options are Day, Week, Month and Year (default Day). Hour-level views are mentioned as a feature. Custom `view_modes` entries take `{name, padding, step, lower_text, upper_text, upper_text_frequency, thick_line, column_width, snap_at, date_format}`. Defaults are `column_width` 45, `upper_header_height` 45 and `lower_header_height` 30. — [frappe/gantt](https://github.com/frappe/gantt)
- SVAR Gantt scales are also `{unit, step, format}` objects (e.g. month row plus day row). — [SVAR (mintlify mirror)](https://mintlify.wiki/svar-widgets/gantt/configuration/tasks-and-links)

### Inferences (rendering guidance; [unverified] against specific tools)
- Suggested level table for a small app:

  | Level | Top row | Bottom row | px per day |
  |---|---|---|---|
  | Day | Month | Day | ~40 |
  | Week | Month | Week ("W12" or start date) | ~12 |
  | Month | Year | Month | ~4 |
  | Quarter | Year | Quarter | ~1.5 |
  | Year | Year | none | ~0.5 |
  | Fit | auto: choose the smallest level where the project span fits the viewport width | | |

- Render bars from continuous `x = (dayIndex - originDay) * pxPerDay` at every grain, rather than snapping bars to header cells. This keeps coarse grains accurate. Enforce a minimum bar width of about 3px so short tasks stay visible.
- Weekend shading only at day and week zoom. A today line is a vertical 1–2px line in an accent color.
- Milestones: duration 0, drawn as a diamond (a square rotated 45°) centered on the date, with links attaching to the diamond's left and right points.
- Summary bars: a thin dark bar spanning the children, with downward "bracket" notches at both ends. They are derived and not draggable (or dragging moves all children).
- Baselines: a thin grey bar drawn under each task bar from saved baseline start/finish.
- Progress: a darker fill covering `progress%` of the bar width.

### Gaps
- Per-tool zoom options for MS Project, monday, Smartsheet, Asana, Wrike, ClickUp, TeamGantt and Jira were not fetched. From general knowledge, most offer day/week/month/quarter/year (Smartsheet and monday also offer "fit" or auto zoom), and MS Project's timescale dialog supports up to 3 tiers (top/middle/bottom), but these are [unverified].

## Q7. Open-source and commercial Gantt libraries: link formats

### Takeaway
Most libraries store links as a separate array, `{id, source, target, type, lag}`. The type encoding varies: DHTMLX uses "0".."3", SVAR uses "e2s"/"s2s"/"e2e"/"s2e". frappe-gantt has FS-only dependencies stored on the task.

### Cited Findings
- DHTMLX Gantt (GPL Standard edition) links have required `id`, `source`, `target`, `type` and optional `lag`, `readonly`, `editable`, plus custom properties. Type codes are `"0"` FS, `"1"` SS, `"2"` FF, `"3"` SF, and these are remappable via `gantt.config.links.*`. — [DHTMLX link properties](https://docs.dhtmlx.com/gantt/guides/link-properties/)
- SVAR Gantt (React/Svelte/Vue) links have type `"s2s" | "s2e" | "e2s" | "e2e"`. The drag-created default is e2s. Positive lag means a delay. — [SVAR links API](https://docs.svar.dev/react/gantt/api/properties/links/)
- frappe-gantt tasks are `{id, name, start, end, progress, ...}` with date strings. The README does not document dependency types beyond FS. Dependencies are a comma-separated `dependencies` string of task ids [field name unverified; the README fetch didn't show it]. `move_dependencies` toggles cascade. — [frappe/gantt](https://github.com/frappe/gantt)

### Inferences
- A recommended app schema, mirroring DHTMLX/SVAR:
  ```
  Task { id, name, start: 'YYYY-MM-DD', duration (working days) | end, progress 0..1, parentId?, type: 'task'|'milestone'|'summary', baselineStart?, baselineEnd? }
  Link { id, source, target, type: 'FS'|'SS'|'FF'|'SF', lag: int }
  ```
- Bryntum Gantt (commercial) and jsGanttImproved: their formats were not fetched. As [unverified] background, jsGanttImproved encodes dependencies in a `pDepend` string like `"2FS,3SS+2"`, and Bryntum uses a `dependencies` store with `fromTask`/`toTask`/`type` (0–3)/`lag`/`lagUnit`.

### Gaps
- Bryntum, jsGanttImproved and the DHTMLX critical-path/auto-scheduling APIs (PRO features) were not verified this session.
- frappe-gantt's exact dependency field was not verified (the README summary omitted it).
