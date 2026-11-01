# ServiceNow record form for project tasks (pm_project_task): notes for an offline clone

Researched 2026-11-01. Confidence tags: **[doc]** = stated in official ServiceNow docs (URL given); **[community]** = forum/third-party; **[obs]** = well-known UI behavior from hands-on use, not confirmed in a fetched doc during this pass (verify against a PDI if exact fidelity matters).

---

## 1. Form layout

### Classic UI16 form (Core UI)
- **Header bar** [obs]: a dark band across the top. Left side: back arrow `<`, then the table label ("Project Task") and the record **Number** (prefix `PRJTASK`, e.g. `PRJTASK0010042`). Right side: icon buttons (paperclip for attachments, a "more"/context menu, plus personalize/settings), then the UI action buttons (**Update**, **Delete**, and on a new record **Submit**). Right-clicking the header opens the context menu (Save, Insert, Insert and Stay, Copy URL, Configure, View). The same buttons repeat at the bottom of the form. The Short description is a field in the body, not the header title.
- **Body** [obs]: two-column label/value grid. Labels are right-aligned in the left part of each column. Full-width fields (Short description, Description, journals) span both columns. A required field shows a red asterisk, a read-only field shows grey text. Reference fields have a magnifier lookup and an (i) preview icon.
- **Sections** [obs]: the first section has no header. Other sections are either stacked with headers or shown as tabs. A user preference ("Tabbed forms") switches between the two.
- **Default pm_project_task form** [doc] https://www.servicenow.com/docs/r/4~5Anqt12idfVzJWPcxoHw/I7UGCc7_8kWxqlH4qTTBag
  - *Main (top) section:* Number, Short description, **Status** (G/Y/R, set automatically from how close the task is to its planned end date; default offset 3 working days), **Override status** (checkbox, stops the automatic status), **State** (Pending, Open, Work in Progress, Closed Complete, Closed Incomplete, Closed Skipped; rolls up from child tasks), Description, **Assigned to**, Assignment group, Additional assignee list, **Percent complete**. The Project/Top task and **Parent** references also sit in this area [obs].
  - *Details tab:* Milestone, Key milestone, Allow dates outside schedule (not allowed on parent tasks).
  - *Dates tab:* Planned start date, Planned end date, Planned duration, Planned effort (read-only once the task has children, rolls up), Constraint date (read-only, changed through the "Move" related link), Time constraint (Start ASAP / Start on specific date / Start no earlier than / Start no later than), Original start/end date, Actual start date (setting it moves State to WIP), Actual end date (setting it moves State to Closed Complete), Actual duration, Actual effort (from time cards).
  - *Notes tab:* Work notes / Additional comments journals plus the Activity formatter.
  - *Checklist tab:* checklist formatter.
- **Behaviour rules worth copying:**
  - Planned end = planned start + duration. If an actual start exists, the calculation uses that instead.
  - Changing % complete away from 0 sets State to WIP.
  - State = Closed Complete forces % complete to 100 and makes it read-only.
  - A parent's % complete is the duration-weighted rollup of its children (`percent_complete = sum(child% * dur) / sum(dur)`).
  - Field names are `duration`, `percent_complete`, `work_duration` (actual duration), `planned_effort`, `work_effort`.
  - Sources: [doc] https://www.servicenow.com/docs/r/7LhbZn3yz3Q58qhjZoU9iQ/XWmM5qhhzuNMHhUr3g1GJA ; [community] https://www.servicenow.com/community/spm-forum/percentage-completed/td-p/1048801

### Next Experience (Project Workspace)
- Project Workspace does not show a classic full form for tasks. On the **Planning page**, selecting a task's short description **opens its details in a side panel** for editing [doc] https://www.servicenow.com/docs/r/Urgv8z109EjxWLyYw1_~nA/OynOnhwsUo7UDavQxaXeZQ
- The project header holds:
  - Edit project details (opens a side panel), **Activity** (comments/conversation), Attachments
  - Refresh, Save (disabled by default because changes auto-save)
  - View buttons: Show all (grid + Gantt), Gantt only, Grid only
  - Baselines, Critical path toggle, **Add task**, and a Project actions menu (apply template, duplicate, import from MS Project, export...)
- Generic workspace record page anatomy, used when a task opens as a full record [obs]:
  - Header: record icon, number + short description, a few "highlighted values" (State, Assigned to, dates), action buttons at the right (Save, overflow `...`)
  - Body: a **Details** tab holding the form in 2 columns with collapsible sections, plus one tab per related list
  - Right **contextual side panel**: the activity stream / compose
- Strategic Planning Workspace follows the same pattern: clicking a card opens a side panel, and "Full details" opens the record page with related-list tabs (Goal Relationships, Milestones, Dependencies) [doc] https://www.servicenow.com/docs/r/4~5Anqt12idfVzJWPcxoHw/MN1Mw7YyOALl_ReYiYpoOQ

**Clone recommendation:**
- Sticky header with `[Number] Short description` plus State/Status chips, and Save / Delete / ... buttons.
- A 2-column grid using the main / Dates / Details groups above.
- Section headers that collapse.
- Status G/Y/R computed from planned end, with an override checkbox.

---

## 2. Activity stream / work notes

- **Storage model** [community]:
  - Each journal post is one row in `sys_journal_field` (`element_id` = record sys_id, `element` = `work_notes` | `comments`, `value`, `sys_created_by`, `sys_created_on`).
  - Field changes come from audit/history (`sys_audit`, `sys_history_set`/`sys_history_line`).
  - The activity formatter merges both by timestamp.
  - https://www.servicenow.com/community/servicenow-ai-platform-forum/where-are-the-comments-work-notes-additional-comments-stored-in/m-p/1123143
- **Placement** [doc]: in Core UI, journal fields always sit stacked **directly above** the activity formatter, and no other field can go between them. The order of Work notes vs. Additional comments is set via "Configure available fields". https://www.servicenow.com/docs/r/zurich/platform-administration/c_ActivityFormatter.html
- **Compose (UI16)** [obs]:
  - One textarea with a checkbox that toggles the target journal ("Work notes" vs "Additional comments (Customer visible)"). The textarea background turns yellow for work notes.
  - A **Post** button to the right posts immediately with no full form save. Saving the form also posts any typed text.
  - A "Show all journal fields" toggle expands into separate textareas.
  - Workspace: compose sits at the top of the side panel with tabs or toggle for Work notes / Comments and a **Post** button [doc, CSM workspace pages] https://www.servicenow.com/docs/r/5M2H7PAkXUuakbtz~5Kfeg/IWS~x2cynrBT4UcbkXgOkQ
- **Entry appearance:**
  - Each entry shows activity type + timestamp at its top [doc].
  - Work notes are colour-coded through the property `glide.ui.activity_stream.style.work_notes` (default **gold**). Comments use `glide.ui.activity_stream.style.comments` (default transparent) [doc, same URL].
  - [obs] Layout: a circular avatar at the left (photo, or initials on a coloured circle); bold author display name (`glide.ui.activity.displayname` chooses full name vs user ID [doc]); at the right, "Work notes • 2026-10-31 14:22:05" in the user's date format; the body text below; a coloured left bar for work notes.
  - Timestamps: UI16 uses absolute times. Workspaces show short relative times for recent entries, with the absolute time available on hover. For a clone, show relative times and put the absolute time in `title`.
- **Field changes** [obs]: rendered as a "Field changes" card attributed to the user and time. It lists one line per field: `State  Work in Progress  was Open`. The new value is shown first and the old value is struck or greyed as "was ...". Changes from one save are grouped into one card.
- **Ordering:** newest first by default. Workspace components offer a sort toggle (newest/oldest) [doc, playbook/email interaction pages] https://www.servicenow.com/docs/r/zurich/government-industry/psds-playbook-using-activity-stream.html
- **Filters** [doc]:
  - A funnel icon opens a checklist of activity types and fields: work notes, comments, emails, attachments, and each audited field (field-change filter, all on by default).
  - An "Activities (N)" count updates with the filter.
  - Users see changes only for fields they can read.
  - Supports @mentions, attachment previews, and pasted images.
  - https://www.servicenow.com/docs/r/If4ZEK~2WHMkIrdZtEn~Ig/OHfY83oOuiAXL1NnuvJcwg
- **Edit/delete:** confirmed effectively immutable.
  - The UI has no edit or delete on journal entries.
  - The only route is an admin deleting or redacting rows in `sys_journal_field` **and** `sys_audit` **and** `sys_history_set` (KB0520375). Emails already sent cannot be recalled.
  - Normal practice is to **post a new correcting work note**.
  - [community] https://www.servicenow.com/community/developer-forum/how-to-delete-the-work-notes-comments-in-incident-record/m-p/2743252 ; redaction script: https://gist.github.com/jsmayo/d312160061be39988a18c7a517abd758
  - **Clone recommendation:** make entries append-only, allow an optional "strike/redact" flag that keeps a tombstone, or allow an edit window of a few minutes that records `edited_at`.

---

## 3. Related lists

- **Placement:**
  - UI16 shows related lists at the bottom of the form, either **tabbed** (one tab per list, label with a count such as "Project Tasks (3)") or stacked. A user preference controls this [obs].
  - Workspaces show them as tabs beside "Details" on the record page, with counts [obs].
- **List chrome (UI16)** [obs]: each list has a header with a hamburger/list menu, the list title, buttons (**New**, and **Edit...** for many-to-many lists), a search box, and a filter breadcrumb ("All > Parent = PRJTASK..."). Below that: a paged grid with clickable Number links, inline cell editing (double-click), checkboxes, and an "Actions on selected rows" dropdown.
- **Typical related lists on a project task** [obs/community; the official form doc does not enumerate them]. Verify the exact set on an instance via Configure > Related Lists.

| Related list | Table.field | Typical columns |
|---|---|---|
| Project Tasks (children) | `pm_project_task.parent` | Number, Short description, State, Assigned to, Planned start, Planned end, % complete |
| Predecessors / Successors (Planned Task Relationships) | `planned_task_rel_planned_task` (`parent` = predecessor, `child` = successor) | Predecessor, Successor, Sub type, Lag |
| Resource Plans / Resource Assignments | `resource_plan.task`, `resource_allocation` | Resource, Role/Group, Planned hours, Start, End, State |
| Time Cards | `time_card.task` | User, Week starts on, Total, State |
| Expense lines | `fm_expense_line.task` | Amount, Date, Type |
| Attachments, Approvers, Task SLAs | platform | |
| Issues / Decisions / Actions / Risks | via the RIDAC `parent`/`task` field | Number, Short description, State, Priority, Due date, Assigned to |

- **Planned Task Relationship form** [doc]: Predecessor task, Successor task, Type (fixed "Predecessor of::Successor of"), **Sub type** (dependency kind), **Lag** (days/hours/minutes/seconds, can be negative). The docs recommend deleting and recreating a relationship rather than repointing it. https://www.servicenow.com/docs/r/PvI2AdxOMyZ7yoXpFrGIfg/hFpLeQRjj5xPHxQXt5PcUg . Sub type values are FS/SS/FF/SF [obs]. Dependencies drive dates only when Time constraint = Start ASAP [community/BU guide] https://bu.edu/tech/about/service/ppm/project-and-program-managers/how-to-use-project-scheduling-functionality

---

## 4. RAID / RIDAC in SPM

Official forms [doc] https://www.servicenow.com/docs/r/4~5Anqt12idfVzJWPcxoHw/NZ7fS4IO3diiF8H8z~VP7w and https://www.servicenow.com/docs/r/PvI2AdxOMyZ7yoXpFrGIfg/xtUcj6O~t79eSoglVL~OUw

| Type | Table (verify) | Link to project | Type-specific fields |
|---|---|---|---|
| Risk | `risk` (SPM). **Not** an extension of `task` [community]. Not to be confused with GRC `sn_risk_risk` | **`task`** (reference, the project/demand) | Risk status (Pending, Achieved, Not Achieved, Avoid, Mitigate, Transfer, Accept), Probability (Absolute/High/Moderate/Low), Impact, Risk rank/Risk value (calculated P x I), Risk owner, Mitigation plan, Estimated/Actual cost, Inherent/Residual risk, "Elevated to enterprise risk" |
| Issue | `issue` (extends task) | **`parent`** | Priority, Impact, Estimated cost, Work notes |
| Decision | `dmn_decision` (extends task) [community: "PPM module ... stores all project related decisions"] | **`parent`** | Decision status (Pending/Approved/Rejected), Approval required, Priority, Impact. The creator is the default assignee |
| Action | `project_action` (extends task) [obs; not confirmed in docs] | **`parent`** | Approval (only the approval admin can change it), Priority, Impact. New actions start in state Open |
| Request change | `project_change_request` [obs; not confirmed] | **`parent`** | Category (Resource/Scope/Cost/Schedule), Title, Business justification, Approval |

- **Common fields on all five:** Number, State (Pending, Open, WIP, Closed Complete/Incomplete/Skipped; risks start Pending, others start Open), Assigned to, Due date, Short description, Description, **Show on project status report** (boolean).
- **Granularity:** RIDAC records hang off the **project (or demand)**, not individual project tasks, in the standard product. If the schema needs task-level RAID, add an optional `task_id` alongside `project_id`.
- **Conversion and links** [doc]:
  - Convert Risk to Issue / Decision / Action / Change, and Decision to Action or Change, via the "Convert to RIDAC" related link. Conversion copies the short description and description.
  - The "Associate RIDAC" related link creates many-to-many links between RIDAC records of the same project.
  - Sources: https://www.servicenow.com/docs/r/4~5Anqt12idfVzJWPcxoHw/JtHYNoVbTQJtDhVnwcWQbQ ; https://www.servicenow.com/community/spm-forum/risk-table-and-ridac/m-p/2814028
- **Suggested mirror schema:**
  - `raid_item {id, type: risk|issue|decision|action|change, number, project_id, task_id?, state, priority, impact, probability?, risk_status?, decision_status?, category?, owner, assigned_to, due_date, short_description, description, mitigation_plan?, est_cost, actual_cost, show_on_status_report}`
  - `raid_link {from_id, to_id, kind: converted_from|associated}`
  - Journal entries for RAID items reuse the same journal table.

---

## 5. Mini-Gantt / child timelines inside a record

- **ServiceNow:**
  - The classic **Planning console** (deprecated, "Legacy") opens from a project and shows a WBS task list on the left and a Gantt on the right, with banner icons [doc] https://www.servicenow.com/docs/r/4~5Anqt12idfVzJWPcxoHw/gW_cPPq9eZH~xOWmFjHaVg
  - **Project Workspace Planning page:**
    - Data grid plus timeline with a draggable divider. Parent rows get an expand icon that reveals children.
    - Row context menu: edit, add above/below, delete, add dependency, indent. Drag to reorder. Multi-cell bulk edit.
    - Draw dependencies on the timeline, or select one to edit it in the side panel.
    - Zoom levels: year, quarter, month, week, day.
    - Settings side panel tabs: Columns / General (dependency lines, critical path, bar labels, summary task) / Advanced (auto-save, date format, Manual vs Automatic calculation).
    - Sources: [doc] https://www.servicenow.com/docs/r/Urgv8z109EjxWLyYw1_~nA/5qC5zkZuI7M3Ng6KtUr8pQ
  - No per-task embedded mini-Gantt was found. A task's children appear in the "Project Tasks" related list as a flat grid.
- **Jira:**
  - The issue view has a "Child issues" panel: a list with status lozenges and a progress bar (done/total).
  - Timeline: parent rows get a progress bar column, by issue count or estimate. Children without a parent are not shown.
  - Sources: https://confluence.atlassian.com/jirasoftwarecloud/manage-epics-on-the-roadmap-976172306.html , https://confluence.atlassian.com/jirasoftwareserver0821/monitor-estimates-and-issues-from-your-timeline-1114801947.html
- **Smartsheet:** row hierarchy (indent) in the Gantt view. Parent bars are summary bars. Row-level comments open in a right-hand **Conversations panel** (Row / Sheet / Unread tabs, resolvable threads). https://help.smartsheet.com/articles/2480086-Conversations
- **MS Project** [obs]: the "Details" split view puts a Gantt above and a Task Form or Task Details Form below, with grids for Predecessors (ID, Name, Type, Lag) and Resources (Name, Units, Work). Summary tasks show a bracket summary bar over their children.
- **monday.com** [obs]: the item card has Updates (comment feed, newest first, editable), Files, and Activity Log (field-change history) tabs. Subitems appear as a nested table, and the timeline column renders a mini bar per row.
- **Clone recommendation:** inside the task record, add a "Children" tab that combines a compact grid (name, dates, %, state) with a mini timeline. Scale the timeline to the parent's planned start to end. Draw each child bar with a % fill, and draw a "today" line. Clicking a bar opens that child record.

---

## 6. Workspace navigation: list/tree to record

- **Classic UI16** [obs]: the left application navigator opens a list in the content frame, and clicking a number replaces it with the form. Breadcrumb and back arrow return to the list. The pattern is single pane.
- **Workspaces (Next Experience)** [obs]:
  - A left icon rail: Home, Lists, and app pages.
  - The **Lists** page is a split view: a list/category tree on the left and a grid on the right.
  - Opening a record opens it in a **new workspace tab** (a tab strip under the header, so several records stay open at once). Some apps open a **side panel** preview instead.
  - The Project Workspace planning grid uses a side panel for the task. The "Full details"-style link opens the full record page [doc] https://www.servicenow.com/docs/r/4~5Anqt12idfVzJWPcxoHw/MN1Mw7YyOALl_ReYiYpoOQ
  - In Project Workspace the project opens to a **Planning** tab, with **Details** as a separate record-page tab. Users have asked how to make Details the default [community] https://www.servicenow.com/community/spm-forum/project-workspace/m-p/3593512
- **Clone recommendation:**
  - Left WBS tree or grid, and a right detail pane that holds the record form (resizable splitter).
  - Selecting a row loads the record. Double-click or an "open full" action expands the record to full width, optionally as a tab.
  - Keep the URL hash `#task/PRJTASK0010042` for deep links.
  - Unsaved-change guard when switching records.
  - Activity stream in a collapsible right column (workspace style) or below the form (UI16 style).
