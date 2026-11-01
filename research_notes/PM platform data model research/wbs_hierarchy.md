# Deeply Nested WBS: Hierarchy, Outline Numbering and Summary Rollups Across PM Platforms

Research date: 2026-10-31. About 20 tool calls. Several vendor pages returned 403 or 404, so some facts come from search-result summaries of official pages and are marked as such. Anything I could not source is under Gaps.

## Microsoft Project: outline numbers, WBS codes, masks, indent/outdent, rollups, renumbering

### Takeaway
MS Project keeps two separate identifiers. The **Outline Number** is derived from position, recomputed on every move, indent or outdent, and cannot be edited. The **WBS code** is stored and editable, can follow a per-level mask, and is NOT renumbered automatically. Summary rows take start = min(child start) and finish = max(child finish). Duration is the working time across that span, not a sum. Work and cost are sums. % Complete is weighted by duration.

### Cited Findings
- Basic outline numbers are assigned automatically from each task's position in the list. They contain only numbers and can't be edited (first task 1, its subtasks 1.1, 1.2, 1.3). They update automatically when a task is moved up or down, or indented or outdented. — [Microsoft Support: Create WBS codes in Project desktop](https://support.microsoft.com/en-us/project/create-wbs-codes-in-project-desktop)
- WBS codes are customizable outline numbers. Mask dialog (Project > WBS > Define Code): an optional **Project Code Prefix**, then for each indent level a **Sequence** (numbers; uppercase letters; lowercase letters; or unordered characters/symbols), a **Length** (fixed or "Any") and a **Separator** (period by default; can be another character or none; the separator cannot appear inside a code). Each level can have its own settings. — [Microsoft Support](https://support.microsoft.com/en-us/project/create-wbs-codes-in-project-desktop)
- Options: "Generate WBS code for new task". If unchecked, new tasks get no code. "Verify uniqueness of new WBS codes". If unchecked, duplicate codes are allowed. — [Microsoft Support](https://support.microsoft.com/en-us/project/create-wbs-codes-in-project-desktop)
- Project does **not** renumber WBS codes automatically when tasks are moved or deleted. Microsoft's reason is that the codes may be referenced in outside documents or systems. Renumbering is a manual command (Project > WBS > Renumber) for Selected tasks or the Entire project. When renumbering a selection, the first selected task is not renumbered. — [Microsoft Support](https://support.microsoft.com/en-us/project/create-wbs-codes-in-project-desktop)
- If a WBS code is cleared, the field falls back to showing the outline number. WBS codes are unique per task by default. — search summary of [Microsoft Support: WBS fields](https://support.microsoft.com/en-us/project/wbs-fields) (page not fetched directly)
- Some third-party guides say codes move automatically when tasks are relocated. This conflicts with Microsoft's documentation. — [Simon Sez IT Part 2](https://www.simonsezit.com/article/using-project-2010-work-breakdown-structure-wbs-codes-part-2/); contradicted by [Microsoft Support](https://support.microsoft.com/en-us/project/create-wbs-codes-in-project-desktop)
- Summary task finish = the latest finish among its subtasks. Summary start = the earliest subtask start. — [Microsoft Project blog archive: Back to basics, understanding summary tasks and subtasks](https://learn.microsoft.com/en-us/archive/blogs/project/back-to-basics-understanding-summary-tasks-and-subtasks)
- Summary duration = the working time between the earliest subtask start and the latest subtask finish. Non-working days are excluded, and the value is not a sum of child durations. — search summary citing [Dummies: summary tasks](https://www.dummies.com/article/technology/software/microsoft-products/project/create-summary-tasks-subtasks-project-2016-223206/) and [Microsoft Q&A](https://learn.microsoft.com/en-us/answers/a/10766229)
- Summary cost and work are totals of their subtasks. Actual and remaining cost, including fixed cost, roll up. Work still rolls up when subtasks are manually scheduled. — [ProjectPlan365 FAQ](https://www.projectplan365.com/?p=15061); [MPUG](https://mpug.com/display-the-project-summary-task)
- Task % Complete = Actual Duration / Duration × 100. A summary's % Complete is duration-weighted: total completed detail-task duration divided by total detail-task duration. — search summary of [Microsoft Support: Percent Complete fields](https://support.microsoft.com/en-US/project/percent-complete-fields) and [MPUG forum](https://www.mpug.com/forums/topic/how-complete-is-calculated-for-nested-summary-tasks)
- A *manually scheduled* summary task does not auto-summarize dates or %. Switching it to auto-scheduled restores the rollup. — [MPUG forum](https://www.mpug.com/forums/topic/how-complete-is-calculated-for-nested-summary-tasks)
- % Work Complete is a separate field. When resources report % work complete, the summarized values are weighted by work (effort), which gives an effort-weighted alternative to duration-weighted % Complete. — [MPUG forum / TechRepublic summary](https://www.techrepublic.com/article/understanding-projects-percent-complete-vs-percent-work-complet)

### Inferences
- Design lesson: keep a **derived outline number** that is always correct (computed from tree position) separate from an optional **stored user code** that stays stable. This is MS Project's model, and it avoids breaking external references.
- MS Project offers three % complete flavors: duration-weighted (% Complete), work-weighted (% Work Complete), and Physical % Complete, which is manual. A small app likely needs only one, plus a choice of weighting.
- Indent in MS Project makes the task a child of the nearest preceding task at the same or a higher level, and that task becomes a summary. This is standard outliner behavior, but I did not fetch the doc page that states it.

### Gaps
- Maximum outline level in MS Project. I could not find an official number. Some sources circulate figures, but none were verified.
- The exact rules for Indent/Outdent with a multi-row selection, and whether outdent re-parents later siblings as children ("outdent pulls following siblings under"). Not verified from Microsoft docs.

## ServiceNow SPM/PPM (pm_project / pm_project_task): hierarchy, WBS, rollups

### Takeaway
ServiceNow stores the hierarchy as an adjacency list (each task has a parent; the project is the top-level task). It keeps a read-only **WBS** string (1, 1.1, 1.2...) and a sibling-position integer **WBS Order**. Parent planned/actual dates, duration, effort, cost and state roll up automatically and are read-only on parents. % complete rolls up weighted by planned duration, not effort.

### Cited Findings
- WBS (legacy related list/Planning Console) columns: **WBS**, the task's position in the hierarchy, read-only, with first task 1 and subtasks 1.1, 1.2. **WBS Order**, the task's position relative to its parent (first subtask 1, next 2). Editing WBS Order moves tasks once the list refreshes. **Number** is the task ID. The legacy WBS UI is "being prepared for future deprecation", is hidden, and can no longer be installed. ServiceNow recommends Project Workspace instead (Australia release docs). — [ServiceNow Docs: Using WBS (Legacy)](https://www.servicenow.com/docs/r/t50FqY34BO_zQ~d4gxe26g/Q9xi4EZ~FX6cpQ3lN_iPJg)
- The WBS number is maintained separately from the task name and isn't editable by default. — search summary of [ServiceNow Community: applying a change to WBS](https://www.servicenow.com/community/spm-forum/how-can-one-apply-a-change-to-wbs-to-their-project-tasks/td-p/1033546)
- The **top_task** field holds the reference to the main project (the root) for every task. This comes from a community answer, not official docs. — search summary of [ServiceNow Community](https://www.servicenow.com/community/spm-forum/cost-plan-is-not-rolling-up-to-the-parent-program-from-child/m-p/3560585)
- Rollups (Zurich docs, "Parent-child rollup task calculations"):
  - Planned Start / Planned End are derived from child dates and read-only on parents. Planned Start is still editable on the project record, the top-level task.
  - Planned Duration is read-only on parents and rolls up from children. The docs say "summed". Note that this may not be a literal sum; see Inferences.
  - Planned effort is summed from children.
  - Actual Start / Actual End are derived from children and read-only on parents.
  - Actual duration and actual effort are summed, but only when all children are Closed Complete. Actual effort can include time-card rollups (property `com.snc.time_card.update.effort`; the docs also spell it `com.snc.timecard.update.effort`).
  - Estimated cost rolls up to the parent and the project. Actual cost needs the Costing add-on plus `com.snc.project.rollup.cost=true`, `glide.cost_mgmt.process_task_top_task=false` and `glide.cost_mgmt.calc_actual_cost=true`.
  - State: parent state is read-only and driven by children. Only Work in Progress and Closed roll up; Pending/Open do not. Roll-down: closing the project sets all tasks to Closed Complete, and reopening sets children to Open or WIP depending on their start dates.
  — [ServiceNow Docs: Parent-child rollup task calculations (Zurich)](https://www.servicenow.com/docs/r/cVzHwL~N5hQ70Ca9r7fiZg/Z5Fyk3hafR56oQ7JQQIuwg)
- Which planned fields roll up is configurable in the "Planned task rollup" table (a checkbox per field). — search summary of [ServiceNow Docs: Configure rollup for planned task fields](https://www.servicenow.com/docs/r/UrSRFFKWBbfQBgoRlt~ltw/0OBzuy1YMAhsbaMgWh50bg)
- Conflict: docs say `glide.cost_mgmt.process_task_top_task` must be false for cost rollup. A community thread reports that ServiceNow support said it must be true for project-level expense rollup. — [ServiceNow Community thread](https://www.servicenow.com/community/spm-forum/cost-plan-is-not-rolling-up-to-the-parent-program-from-child/m-p/3560585)
- % complete: a child task's value is entered manually. A parent's value = Σ(child % × child planned duration) / Σ(child planned duration) (Yokohama docs, per search summary). Planned and actual effort are NOT used: a 10-day task at 100% plus a 10-day task at 0% gives a parent at 50%. — [ServiceNow Community: Project task % complete, how is it calculated](https://www.servicenow.com/community/spm-forum/project-task-complete-how-is-it-really-calculated-and-can-it-be/td-p/974585)

### Inferences
- ServiceNow's model maps to: `parent` (adjacency), `top_task` (denormalized root pointer for fast "all tasks in project" queries), `wbs_order` (sibling ordinal integer), and `wbs` (a materialized display string recomputed by the system). This is a useful hybrid for a small app: adjacency + sibling order as the source of truth, and the outline string as a cached or derived value.
- "Planned Duration summed" in the docs probably means it is recomputed from the derived start/end on the schedule calendar, like MS Project. With parallel children, a literal sum would exceed the span. Unverified.

### Gaps
- An exact dictionary of `pm_project_task` field names (`parent`, `top_task`, `wbs`, `wbs_order`, `rollup`, `percent_complete`, `work_effort`, etc.). I could not fetch a table schema. My recollection is that a boolean `rollup` field flags tasks that have children, but this is unverified.
- Maximum hierarchy depth in Project Workspace. No source found.
- How Project Workspace (vs the legacy Planning Console) renumbers WBS on drag/indent. No doc found.

## monday.com: subitems, multi-level boards, rollup columns

### Takeaway
Historically monday.com had items plus one level of subitems, stored on a separate hidden subitems board with its own columns. Multi-level boards (API surfaced 2025-10, default in API 2026-04, Q2 2026) let items nest several levels on one board with one shared column structure. Rollup ("calculated") columns summarize children: numbers SUM/MIN/MAX, date MAX/MIN, timeline MIN_MAX, status COUNT_KEYS (a battery). Sources disagree on the depth limit ("4 levels of subitems" vs "five layers").

### Cited Findings
- Help center: multi-level boards support up to **4 levels of subitems**. One level-0 parent can have up to **750 subitems across all levels**. Available on all plans for regular boards, and for Project boards on Enterprise. — search summary of [monday.com Support: Multiple levels of subitems](https://support.monday.com/hc/en-us/articles/29810815287570-Multiple-levels-of-subitems-on-monday-com) (direct fetch returned 403)
- API guide: "Multi-level boards support up to **five layers of subitems**. Classic boards support one level." On multi-level boards, parents and all subitems share one board ID and one column structure. Classic boards store subitems on a separate hidden subitems board with its own ID and columns. — [monday.com API: Multi-level boards API guide](https://developer.monday.com/api-reference/docs/multi-level-boards-api-guide) (page last updated 2026-09-06)
- Data model fields: `Board.hierarchy_type` (`multi_level` | `classic`). `Item.parent_item` points to the parent, so the tree is rebuilt by following these links (an adjacency list). `subitems` returns ALL descendants at every depth as a flat list. `is_leaf` is true for items with no children (static value) and false for parents (calculated value). — [monday.com API guide](https://developer.monday.com/api-reference/docs/multi-level-boards-api-guide)
- Rollup (calculated) columns: `numbers` SUM (default)/MIN/MAX/NONE. `date` MAX (default)/MIN/NONE. `timeline` MIN_MAX (default)/NONE. `status` COUNT_KEYS (default)/NONE, which returns a `BatteryValue` of `{key,count}`. Parent cells are computed; writing to a parent's calculated cell returns success but leaves the value unchanged. — [monday.com API guide](https://developer.monday.com/api-reference/docs/multi-level-boards-api-guide)
- Subtree operations: `move_item_to_group`, `move_item_to_board`, `archive_item`, `delete_item` and `duplicate_item` act on the target item and all its children. — [monday.com API guide](https://developer.monday.com/api-reference/docs/multi-level-boards-api-guide)
- Timeline: API 2025-10 added `hierarchy_type`, and `boards` returned only classic boards by default. API 2026-04 (RC Q1 2026, current default Q2 2026) returns both kinds by default. Multi-level started with Project boards in the Portfolio solution. — [monday.com API guide](https://developer.monday.com/api-reference/docs/multi-level-boards-api-guide)
- Before multi-level boards, only one level of subitems was allowed (community confirmation). — [monday Community: only one level allowed](https://community.monday.com/t/can-more-than-one-level-of-subitems-be-created-it-appears-that-only-one-level-is-allowed/57675)
- Workarounds for depth: the third-party "Unlimited Subitems" app (Adaptavist) offers unlimited levels. — [Adaptavist](https://adaptavist.com/products/other-apps/unlimited-subitems-for-monday.com). Older API limits: 100 subitems per item via API creation (community post, may be stale). — [monday developer community](https://developer-community.monday.com/api-apps-framework-4/is-there-a-limit-to-create-subitems-per-item-899). Excel import fails for any parent with more than 99 nested rows. — [monday Community](https://community.monday.com/t/excel-imports-into-sub-item-board/123407)

### Inferences
- The "4 levels of subitems" vs "five layers" difference is most likely a counting difference: either 4 subitem levels below the item (5 total levels), or the API counting the parent as a layer. Treat the maximum as **5 total levels** (item + 4 subitem levels), but flag it.
- monday's choice that rollup is a per-column setting with a function, where parents are read-only and computed, is a clean model for a small app: each numeric/date field has a rollup function (SUM/MIN/MAX/NONE).
- The "connected boards + mirror columns" workaround for deeper hierarchy is widely used, but this research did not source it specifically.

### Gaps
- No source fetched for the user-facing "fake hierarchy" pattern of connected boards plus mirror columns.
- Whether multi-level is GA on all board types as of late 2026. The API guide says it "starts with Project boards… timeline may change".

## Smartsheet: indent hierarchy, parent rollups, WBS numbering

### Takeaway
Smartsheet's hierarchy is purely row-based. Indenting a row makes the row above it the parent, and there is no documented cap on levels. When dependencies are enabled, parent rows auto-calculate: Start = earliest child start, End = latest child end, Duration = working days between them (not a sum), % Complete = duration-weighted. Those parent cells become non-editable. WBS numbers are not native and are usually built with formulas.

### Cited Findings
- Indenting has no fixed level limit; rows can nest to multiple levels. The row above automatically becomes the parent. The Indent button may be unavailable on a blank row because hierarchy needs content in both the parent and the child. — search summary of [Smartsheet Help: Hierarchy, indent or outdent rows](https://help.smartsheet.com/articles/504734-hierarchy-indenting-outdenting-rows)
- Parent rollup (with dependencies enabled): parent Start = earliest child Start, parent End = latest child End. Parent duration = working days between the parent Start and End, not the sum of child durations. Parent % Complete = weighted by each child's duration. Rollup doesn't compute % complete when children contain milestones (duration 0). — search summary of [Smartsheet Help: Parent rollup functionality](https://help.smartsheet.com/articles/765753-parent-rollup-functionality)
- With dependencies on, parent Start, End, Duration and % Complete cannot be edited, and formulas aren't allowed in those columns. The workaround is extra helper columns. — search summary of [Smartsheet Community](https://community.smartsheet.com/discussion/comment/425199)
- Hierarchy functions (CHILDREN, PARENT, ANCESTORS) are used in formulas to traverse the tree, for example to build WBS-style numbering or custom rollups. — [Smartsheet Help: Reference children, parents and ancestors with hierarchy functions](https://help.smartsheet.com/articles/2476811-reference-children-parents-ancestors-hierarchy-functions)

### Inferences
- Smartsheet's row model is effectively an **ordered flat list + indent level**, with parent implied by position. This is the simplest possible model for a small grid app: store `order` and `level` and derive parent from "nearest previous row with a lower level". It requires a constraint that level can increase by at most 1 from the previous row.
- WBS numbering via formulas (e.g., `COUNT(ANCESTORS())` for level plus sibling counts) is a community pattern. I did not fetch a specific formula source.

### Gaps
- No official Smartsheet doc on native WBS/outline numbering. The AutoNumber system column gives a flat sequential ID, not a hierarchical one (from memory, not verified here).
- The Smartsheet API's representation of hierarchy (`parentId`, `siblingId`, `toTop`/`toBottom` row location specifiers, from memory) was not verified in this session.

## Asana, Wrike, ClickUp, Jira Plans, TeamGantt: depth and rollups in brief

### Takeaway
Depth limits vary widely: Asana allows 5 subtask levels, ClickUp 3 by default and 7 maximum, Jira is fixed at Subtask < Story/Task < Epic plus custom levels above Epic (Premium), and Wrike and TeamGantt have no documented limits found. Automatic date rollup is NOT universal. Wrike, for example, keeps parent and child dates independent by default and offers a manual "Item/Branch Rollup" action.

### Cited Findings
- **Asana:** "You can create subtasks within subtasks, but you can only have a maximum of 5 levels of subtasks" (help doc quoted in forum). The number of subtasks per level is in practice unlimited. — [Asana Forum, Feb 2025](https://forum.asana.com/t/update-subtasks-documention-which-incorrectly-references-subtask-limit/1028823)
- **ClickUp:** the Nested Subtasks ClickApp allows up to 7 levels; the default is 3. A ClickUp "learn" article claims unlimited depth, which conflicts with the help center. — [ClickUp Help: Nested subtasks](https://help.clickup.com/hc/en-us/articles/6304431740055-Nested-subtasks); contradicted by [ClickUp Learn](https://clickup.com/learn/topic/task-management/concepts/subtasks/)
- **Jira Plans (formerly Advanced Roadmaps):** custom hierarchy levels are available only on Premium/Enterprise and only in company-managed projects. Each plan level maps to a Jira work type. Custom levels go **above Epic**; nothing can be inserted between Story/Task and Subtask. Reordering levels by drag changes only the plan display. — [Atlassian Support: Configure custom hierarchy levels](https://support.atlassian.com/jira-software-cloud/docs/configure-custom-hierarchy-levels-in-advanced-roadmaps/); [Atlassian Community](https://community.atlassian.com/forums/Jira-questions/Hierarchy-posibilites-in-Jira/qaq-p/2669411)
- Jira: the maximum number of levels above Epic is disputed ("up to five" vs "as many as you like"); not confirmed in Atlassian's docs. — [Atlassian Community article](https://community.atlassian.com/forums/App-Central-articles/Jira-Hierarchy-Levels-Structure-amp-Best-Practices/ba-p/3264323)
- **Wrike:** start/end dates of all items are "completely independent" by default, so a parent and its subtasks can have different dates. Gantt "Item Rollup" / "Branch Rollup" (right-click; branch rolls up from the bottom) aligns a parent with the earliest start and latest end of its *visible* children. It is not continuous: the parent doesn't update when a child changes until rollup is run again. It was originally introduced via Wrike Labs. — [Wrike Help Community: subtask dates roll up](https://help.wrike.com/hc/de/community/posts/208622525--Duplicate-post-Subtask-dates-and-duration-roll-up-to-parent-tasks); [Wrike Labs rollup announcement](https://help.wrike.com/hc/ja/community/posts/360016558314--New-To-Wrike-Roll-up-Dates-on-Gantt-Chart-Is-Now-in-Wrike-Labs); [Item vs Branch rollup](https://help.wrike.com/hc/de/community/posts/360019406254-Difference-between-Item-and-Branch-rollup)
- Wrike: time entries on subtasks do not roll up to the parent task (feature request status "Backburner"). — [Wrike Help Community](https://help.wrike.com/hc/it/community/posts/360038494054--Status-Backburner-Feature-Request-Time-entry-in-sub-tasks-needs-to-roll-up-to-Parent-Task)
- **TeamGantt:** a project has groups and subgroups ("Convert to SubGroup"; nesting via the Parent option in the Edit window; "Outdent" turns a subgroup back into a group). No depth limit is stated. — [TeamGantt Support: Subgroups](https://support.teamgantt.com/article/17-subgroups)
- For comparison, GanttPRO documents a WBS "with up to 16 levels". This is a different product; don't apply it to TeamGantt. — [GanttPRO Help: Types of tasks and levels](https://help.ganttpro.com/hc/en-us/articles/16403302087314-Types-of-tasks-and-levels)

### Inferences
- Common practical limits cluster at 5–7 levels for collaboration tools (Asana 5, monday ~5, ClickUp 7). Scheduling tools (MS Project, Smartsheet) allow effectively unlimited depth. A small app could reasonably cap depth at about 8–10 for UI sanity, or leave it uncapped with a soft warning.

### Gaps
- Wrike maximum subtask depth: not found.
- TeamGantt depth limit and whether group dates and % complete auto-roll up: not documented in sources found. From memory, groups display the span of their tasks; unverified.
- Asana and ClickUp parent rollup behavior: ClickUp has optional rollups for time estimates/tracked time, and Asana does not auto-roll subtask dates into the parent. Both are from memory and were not verified in this session.

## Common data-model patterns: adjacency, materialized path, sort order, derived outline numbers, indent/outdent, % complete weighting

### Takeaway
Every platform with a public schema (ServiceNow, monday) uses an **adjacency list (parent pointer) + sibling ordering**, and exposes the outline number as derived or read-only. For a small offline app, the strongest pattern is `parent_id` + `sort_key` (integer or fractional index) as the source of truth, with outline numbers derived by DFS at render time. Indent, outdent and drag then become simple re-parent and re-key operations.

### Cited Findings
- Adjacency list: each row references its immediate parent. Materialized path (path enumeration): each node stores its root-to-node path. — [Medium: From trees to tables](https://medium.com/@rishabhdevmanu/from-trees-to-tables-storing-hierarchical-data-in-relational-databases-a5e5e6e1bd64)
- Materialized path "does inserts fast, but updates and deletions are slow". Moving a subtree rewrites every descendant's path. — [PostgreSQL mailing list](https://www.postgresql.org/message-id/3FD62927.70904%40vulcanus.its.tudelft.nl)
- Nested sets give fast subtree reads but are "inefficient for modifying the tree structure", so they are recommended only for static trees. — [MongoDB Docs: Model tree structures with nested sets](https://mongodb.com/docs/manual/tutorial/model-tree-structures-with-nested-sets)
- Figma uses **fractional indexing** for child order: each child has a sortable key between its neighbors, so a move rewrites only the moved item. Figma chose it over OT for simplicity. — [Figma blog: Realtime editing of ordered sequences](https://www.figma.com/blog/realtime-editing-of-ordered-sequences/)
- String-based fractional keys (e.g., `generateKeyBetween(null,null)` → "a0") avoid float precision exhaustion. Naive schemes grow key length, can collide, and need periodic rebalancing. — [rocicorp/fractional-indexing](https://github.com/rocicorp/fractional-indexing/); [fractional_indexer (Ruby)](https://github.com/kazu-2020/fractional_indexer); [Zenn article](https://zenn.dev/matazou/articles/b1ac05d9c0015b)
- ServiceNow precedent: a stored integer `WBS Order` per sibling plus a read-only `WBS` string. — [ServiceNow Docs](https://www.servicenow.com/docs/r/t50FqY34BO_zQ~d4gxe26g/Q9xi4EZ~FX6cpQ3lN_iPJg). monday precedent: `parent_item` adjacency plus a computed `is_leaf`. — [monday API guide](https://developer.monday.com/api-reference/docs/multi-level-boards-api-guide)
- Precedent for deriving vs storing: MS Project derives the Outline Number (auto-updates on move/indent) and stores the WBS code (manual renumber). — [Microsoft Support](https://support.microsoft.com/en-us/project/create-wbs-codes-in-project-desktop)
- % complete weighting precedents: duration-weighted is used by MS Project % Complete ([MS Support](https://support.microsoft.com/en-US/project/percent-complete-fields)), Smartsheet ([Smartsheet Help](https://help.smartsheet.com/articles/765753-parent-rollup-functionality)) and ServiceNow ([ServiceNow Community](https://www.servicenow.com/community/spm-forum/project-task-complete-how-is-it-really-calculated-and-can-it-be/td-p/974585)). Work/effort-weighted is MS Project % Work Complete ([TechRepublic](https://www.techrepublic.com/article/understanding-projects-percent-complete-vs-percent-work-complet)). A simple average is also an option, which practitioners criticize as unrepresentative ([MPUG forum](https://www.mpug.com/forums/topic/how-complete-is-calculated-for-nested-summary-tasks)). monday rolls status up as counts (battery), not a weighted percentage ([monday API guide](https://developer.monday.com/api-reference/docs/multi-level-boards-api-guide)).
- Edge case: Smartsheet skips the % complete rollup when a child is a 0-duration milestone ([Smartsheet Help](https://help.smartsheet.com/articles/765753-parent-rollup-functionality)), because duration weighting gives a milestone weight 0.

### Inferences (proposed minimal model, synthesized from the cited patterns)
- Table `task(id, project_id, parent_id NULL, sort_key TEXT|REAL, name, start, finish, duration_days, effort_hours, cost, pct_complete, is_milestone, manual_code NULL)`. "Summary" = has children, which is derived and not stored (like monday's `is_leaf`).
- **Outline number**: DFS from the roots ordered by `sort_key`. A node's number = parent number + "." + 1-based sibling index. Derive it on every render or tree change; it costs O(n) and is trivial for an offline app. Store a separate optional `manual_code` only if users need stable external codes (the MS Project lesson).
- **Indent** (row R): new parent = R's immediately previous sibling P. R becomes P's last child (sort_key after P's current last child). It is disallowed if R has no previous sibling. R's subtree moves with it automatically because the children still point to R.
- **Outdent** (row R with parent P): R's new parent = P.parent and its sort_key goes immediately after P. MS Project and outliner convention: R's following siblings under P become R's children, so the visual row order is preserved. A simpler variant moves R after P and leaves the following siblings under P, which changes visual order. Pick one and be consistent.
- **Drag-to-reorder**: compute the drop target as (new parent, previous sibling, next sibling) and assign a sort_key between those neighbors. Reject drops into one's own subtree (cycle check: walk up from the target to the root).
- **Rollup** (recompute bottom-up for the changed node's ancestors only): start = min(child start); finish = max(child finish); duration = working days(start, finish), NOT a sum; effort and cost = sums; pct = Σ(pct_i × w_i)/Σw_i with w = duration (default) or effort (option). Exclude or handle 0-weight milestones, and fall back to a simple average if Σw = 0. Parent fields are read-only while the task has children.
- Near-universal rules: parent start = min child start and parent finish = max child finish (MS Project, Smartsheet, ServiceNow, monday timeline MIN_MAX, Wrike manual rollup); parent duration = span, not sum (MS Project, Smartsheet); effort/work/cost = sum (MS Project, ServiceNow, monday numbers default SUM); parent rolled-up fields read-only (Smartsheet, ServiceNow, monday). Platform-specific rules: % complete weighting (duration in MSP/Smartsheet/ServiceNow, work in MSP % Work Complete, counts in monday); whether rollup is automatic (Wrike is manual and only counts visible items); actuals only after all children close (ServiceNow); state rollup (ServiceNow); manually scheduled summaries that break rollup (MS Project).

### Gaps
- No source compared drag-and-drop implementations in specific PM products (e.g., whether Asana or ClickUp use fractional keys vs integer positions). Not publicly documented in the sources found.
- No authoritative source on the cost of computing outline numbers at scale. The O(n) DFS claim is my own reasoning.
