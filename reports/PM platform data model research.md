# Derive the outline, store only intent

The nine platforms agree on more than their marketing suggests. Every one with a public schema stores hierarchy as a **parent pointer plus a sibling position**. Each treats the "1.2.3.4" outline number as a **derived, read-only value**. Each rolls a parent's dates up as **earliest child start and latest child finish**, and the classic schedulers (MS Project, Smartsheet, ServiceNow, Wrike, TeamGantt, Asana) support all four dependency types, FS, SS, FF and SF, with FS as the default. The platforms differ in four places. The first is assignment: monday.com alone puts people and teams in one polymorphic field, ServiceNow and Jira split them into two fields, and Wrike refuses to assign groups at all. The second is that **no platform has a native RACI** or enforces "exactly one Accountable". The third is what happens when a predecessor moves: tools push successors, shift them by the same amount, or just draw a red line. The fourth is import. Every importer demands parent-before-child row order, and only a few (Jira, ClickUp, Wrike) map values or people. For the offline single-file tool, the recommendation is to keep the proof of concept's sql.js + File System Access + `mutate()` core unchanged and replace the flat schema with schema version 1. That schema has an adjacency-list `task` table with contiguous integer sibling positions, a derived WBS, a single `party` table for people and teams (single-table inheritance, so RACI rows get a real foreign key), a typed `dep` table with signed working-day lag, and saved import maps stored inside the `.db`. Scheduling defaults to TeamGantt-style "flag, don't move" with a one-click forward-pass fix. Built in six phases, this comes to roughly **40–50 developer-days**. The largest cost and risk is Gantt drag interaction, not the data model.

## Every platform derives outline numbers from a parent pointer

MS Project draws the clearest line. Its **Outline Number** is computed from position, "can't be edited", and updates automatically on move, indent or outdent. Its separate **WBS code** is user-defined and follows a per-level mask, and Project deliberately does **not** renumber it because outside documents may reference it. Renumbering is a manual command ([Microsoft Support](https://support.microsoft.com/en-us/project/create-wbs-codes-in-project-desktop)). ServiceNow uses the same split in database form. A read-only **WBS** string sits next to an integer **WBS Order**, which is the task's position among its siblings, and editing WBS Order moves the task ([ServiceNow Docs: Using WBS (Legacy)](https://www.servicenow.com/docs/r/t50FqY34BO_zQ~d4gxe26g/Q9xi4EZ~FX6cpQ3lN_iPJg)). monday.com's new multi-level boards expose `Item.parent_item` adjacency and a computed `is_leaf` ([monday API guide](https://developer.monday.com/api-reference/docs/multi-level-boards-api-guide)). Smartsheet has no native WBS numbering. Its hierarchy is just an indented row list with no documented level cap, and users build numbers with `PARENT`/`CHILDREN`/`ANCESTORS` formulas ([Smartsheet Help](https://help.smartsheet.com/articles/2476811-reference-children-parents-ancestors-hierarchy-functions)).

Depth limits separate collaboration tools from schedulers. **Asana allows 5 subtask levels** ([Asana Forum](https://forum.asana.com/t/update-subtasks-documention-which-incorrectly-references-subtask-limit/1028823)). **ClickUp defaults to 3 and allows up to 7** ([ClickUp Help](https://help.clickup.com/hc/en-us/articles/6304431740055-Nested-subtasks)). For monday, the help center says "4 levels of subitems" while the API guide says "five layers", and the two most likely count the parent differently. Jira Plans fixes Subtask < Story < Epic and allows custom levels only **above** Epic, on Premium ([Atlassian Support](https://support.atlassian.com/jira-software-cloud/docs/configure-custom-hierarchy-levels-in-advanced-roadmaps/)). TeamGantt nests groups and subgroups with no stated cap ([TeamGantt Support](https://support.teamgantt.com/article/17-subgroups)).

Rollup rules converge. The parent's start is the minimum child start and its finish is the maximum child finish. Its **duration is the working-day span, not a sum**. Work and cost are sums. **% complete is duration-weighted** in MS Project, Smartsheet and ServiceNow ([ServiceNow Community](https://www.servicenow.com/community/spm-forum/project-task-complete-how-is-it-really-calculated-and-can-it-be/td-p/974585); [Smartsheet Help](https://help.smartsheet.com/articles/765753-parent-rollup-functionality)). Rolled-up parent cells are read-only in Smartsheet, ServiceNow and monday ([ServiceNow Docs: rollup](https://www.servicenow.com/docs/r/cVzHwL~N5hQ70Ca9r7fiZg/Z5Fyk3hafR56oQ7JQQIuwg)). There are two exceptions worth noting. Wrike keeps parent and child dates "completely independent" and only aligns them through a manual Item/Branch Rollup action ([Wrike Help Community](https://help.wrike.com/hc/de/community/posts/360019406254-Difference-between-Item-and-Branch-rollup)). Smartsheet skips the % rollup when a child is a 0-duration milestone, because a milestone carries zero weight under duration weighting ([Smartsheet Help](https://help.smartsheet.com/articles/765753-parent-rollup-functionality)).

| Platform | Depth | Outline number | Parent rollup | Person/team assignment | Dependency types, lag |
|---|---|---|---|---|---|
| MS Project | no verified cap | Derived outline no. + stored WBS code | Auto; span duration; duration-weighted % | Resources (work/material/cost, generic); no teams | FS/SS/FF/SF; lag in units, %, elapsed |
| ServiceNow SPM | not documented | Read-only WBS + WBS Order | Auto, configurable per field | `assigned_to` + `assignment_group` | FS/FF confirmed, SS/SF conflicting; integer days |
| monday.com | ~5 total (sources disagree) | none found | Per-column SUM/MIN/MAX, timeline MIN_MAX | One field, `{id, kind: person/team}` | Dependency column; Flexible/Strict/None modes; types unverified |
| Smartsheet | no cap | formulas only | Auto when dependencies on | Contact columns, one per role | FS/SS/FF/SF; working-day or elapsed lag |
| Asana | 5 | none | not verified | One assignee + collaborators | 4 types, **no lag** |
| Wrike | not documented | none | Manual rollup | Individuals or job roles, **no groups** | 4 types with lead/lag |
| ClickUp | 3 default / 7 max | none | not verified | Multiple assignees + teams (separate arrays) | Waiting on / Blocking / Linked |
| Jira Plans | fixed + levels above Epic | none | n/a | One assignee + separate Team field | Issue links; types/lag via add-ons |
| TeamGantt | no stated cap | none | not verified | Multiple people with hours | 4 types; lag/lead |

The data-structure literature shows why everyone landed on adjacency lists. Materialized paths make subtree moves rewrite every descendant ([PostgreSQL list](https://www.postgresql.org/message-id/3FD62927.70904%40vulcanus.its.tudelft.nl)). Nested sets are "inefficient for modifying the tree structure" ([MongoDB Docs](https://mongodb.com/docs/manual/tutorial/model-tree-structures-with-nested-sets)). Figma's fractional indexing exists to make concurrent reorders cheap ([Figma blog](https://www.figma.com/blog/realtime-editing-of-ordered-sequences/)). A single-writer offline file has no concurrency, so plain integer positions are simpler and safer.

## Person-or-team fields split three ways, and nobody enforces RACI

monday.com's People column is the cleanest polymorphic model. The stored value is `personsAndTeams: [{id, kind}]` with `kind` set to `person` or `team`, writes **replace** the whole list, and a `max_people_allowed` setting caps the count ([monday API: People](https://developer.monday.com/api-reference/reference/people)). ClickUp reaches the same result with separate `assignees` and `group_assignees` arrays ([Make community](https://community.make.com/t/assign-groups-in-clickup-to-a-task/83312)). ServiceNow uses two reference fields on every task, `assigned_to` (user) and `assignment_group`, with a `sys_user_grmember` join table. Validation keeps the person inside the group and filters out inactive users with `active=true` ([ServiceNow Community](https://www.servicenow.com/community/developer-forum/restrict-quot-assigned-to-quot-changes-to-only-group-members/m-p/2486351)). ServiceNow's resource plans add a discriminator, **Resource type = Group / User / Role** ([ServiceNow Docs](https://www.servicenow.com/docs/r/t50FqY34BO_zQ~d4gxe26g/IvWsJKi880XSxHwzjI3gaA)). Jira's Assignee is a single user, and Team is a different single-value field ([Atlassian Community](https://community.atlassian.com/forums/Advanced-Planning-in-Jira/Team-vs-assignee/td-p/2026690)). Asana allows **one assignee plus collaborators** ([Asana Help](https://help.asana.com/s/article/understanding-tasks)). Wrike deliberately blocks group assignment and allows only individuals or job roles ([Wrike community](https://help.wrike.com/hc/en-us/community/posts/115000233605-User-Groups)). MS Project models people as Resources typed Work/Material/Cost. A "Generic" flag covers roles such as "carpenter", and generic resources cannot log in ([Microsoft Support](https://support.microsoft.com/office/add-resources-to-your-project-1a744960-d960-426a-b687-e42ba3f6c0cb); [MSDN](https://msdn.microsoft.com/en-us/ms486867(v=office.14))).

RACI is improvised everywhere. ServiceNow practitioners say there is "no out-of-the-box RACI" in SPM ([ServiceNow Community](https://www.servicenow.com/community/spm-forum/traceability-matrix-for-ppm-idea-until-project-closure/td-p/1039906)). Smartsheet's own guidance is one Contact List column per role ([Smartsheet Help](https://help.smartsheet.com/articles/518335)). monday ships a RACI template that amounts to several People columns. The governing rule comes from practice, not from software: "There should only be one 'A' for each activity, but no activity should be missing an 'A'", and an Accountable who does the work implies the R ([ProjectManagement.com](https://www.projectmanagement.com/wikis/234008/RACI)). The standard matrix puts tasks as rows, stakeholders as columns and a letter in each cell ([Wikipedia: RAM](https://en.wikipedia.org/wiki/Responsibility_assignment_matrix)). The board layout (R/A/C/I columns holding people) is the same data shown another way. One question is genuinely open. The guidance says the Accountable is a *person*, while monday and ServiceNow let a group own work. A small tool should allow a team as Accountable and show a soft warning, not block it.

## Four dependency types are standard; behavior on change is not

FS/SS/FF/SF with FS as the default is the norm in MS Project, Smartsheet, Wrike, Asana and TeamGantt ([MS Support: Predecessors](https://support.microsoft.com/en-us/project/predecessors-task-field); [Smartsheet](https://help.smartsheet.com/articles/765727-enabling-dependencies-using-predecessors); [TeamGantt](https://support.teamgantt.com/article/8-dependencies)). Lag is a signed duration, and negative lag means lead. Only MS Project adds percentage lag and elapsed lag (`2ed`) ([MS Support](https://support.microsoft.com/en-us/project/add-lead-or-lag-time-to-a-task)), and Smartsheet uses an `e` prefix for elapsed lag. ServiceNow encodes dependencies as `1.1fs+0`, with integer-day lag ([BU ServiceNow guide](https://bu.edu/tech/about/service/ppm/project-and-program-managers/how-to-use-project-scheduling-functionality)). The simpler tools drop features. **Asana has four types but no lag** ([Asana forum](https://forum.asana.com/t/dependencies-with-lags/1153817)). ClickUp offers only Waiting on / Blocking / Linked ([ClickUp Help](https://help.clickup.com/hc/en-us/articles/6309155073303-Dependency-Relationships)). Native Jira Plans links get typed, lagged dependencies only through Marketplace add-ons ([ALM Works](https://wiki.almworks.com/display/cloudgantt/Dependency+Lead-Lag+Time)). Integer working-day lag covers everything a communication tool needs.

The real design choice is what happens when a predecessor moves. monday.com exposes three board-level modes: Flexible (push only on conflict), Strict (keep the gap and move dependents by the same delta) and No action ([monday API: Dependency](https://developer.monday.com/api-reference/reference/dependency)). TeamGantt forces nothing. It draws invalid links in red and offers "Fix invalid dependencies" ([TeamGantt](https://support.teamgantt.com/article/8-dependencies)). ClickUp's reschedule considers only the edited blocker, and users complain it doesn't respect all blockers or pull dependents back ([ClickUp feedback](https://feedback.clickup.com/feature-requests/p/reschedule-dependencies-should-respect-all-blocking-tasks-not-just-the-one-being)). That complaint argues for a proper topological pass that takes the maximum over *all* incoming links. Critical path is offered in Smartsheet and Wrike, and Wrike also shows total and free float ([Wrike](https://wrike.com/features/gantt-chart-vaa)).

Drag-to-link UX is the same everywhere. Hovering a bar reveals end-point handles. You drag from one bar's end to another bar's start, and handle positions decide the type: end→start = FS, start→start = SS, end→end = FF. Double-clicking or clicking the line opens a type/lag/delete editor ([BU ServiceNow guide](https://bu.edu/tech/about/service/ppm/project-and-program-managers/how-to-use-project-scheduling-functionality); [TeamGantt](https://support.teamgantt.com/article/8-dependencies)). SVAR Gantt defaults drag-created links to `e2s` ([SVAR docs](https://docs.svar.dev/react/gantt/api/properties/links/)). TeamGantt adds a keyboard shortcut: Shift-select tasks, then Shift+D chains them. Smartsheet and ServiceNow both accept typed predecessor text (`3FS +2d`), which doubles as the accessible alternative to dragging.

Time grains were documented only for libraries. Per-product zoom menus were not verified. DHTMLX models zoom as named levels, each a stack of `{unit, step, format}` header rows (day; week over day; month over week; quarter over month; year), plus `zoomToFit()` ([DHTMLX zooming](https://docs.dhtmlx.com/gantt/guides/zooming/)). frappe-gantt offers Day/Week/Month/Year view modes with `snap_at` ([frappe/gantt](https://github.com/frappe/gantt)). Both store links as a separate array, `{id, source, target, type, lag}`, which is the shape adopted below ([DHTMLX link properties](https://docs.dhtmlx.com/gantt/guides/link-properties/)).

## Importers all demand parent-first order, and few map values

The MS Project Excel wizard is the reference design. It lets you start from scratch or a saved map, import as a new project or append, choose data types, map Excel columns to Project fields over a data preview, and **Save Map** ([Microsoft Support](https://support.microsoft.com/en-us/office/import-or-export-data-between-project-and-excel-cb3fb91a-ad05-4506-b0af-8aa8b2247119)). Hierarchy comes only from a mapped **Outline Level** integer. Pasting loses the outline, and predecessors refer to Project task IDs rather than spreadsheet rows, which users find fragile ([MPUG forum](https://mpug.com/forums/topic/mpp-2010-importing-excel-file-issue-with-predecessors-2)). The Project grammar `ID[FS|SS|FF|SF][±lag]` (a bare ID means FS+0) is the de facto standard ([MS Support](https://support.microsoft.com/en-us/project/predecessors-task-field)).

Jira's CSV importer is the most complete. It runs field mapping, then per-column **value mapping** (map to existing, import as blank, add new), auto-creates missing users from emails, saves a reusable configuration file, updates existing items when a key column matches, and builds hierarchy from ID + Parent columns, but "parent work items must appear before their subtasks" ([Atlassian](https://support.atlassian.com/jira-cloud-administration/docs/import-data-from-a-csv-file/)). Wrike associates "Assigned to" names with contacts and handles dependencies through Key + "Depends On" (`22SS, 32FS`). It caps imports at **5,000 tasks** and **only creates, never updates** ([Wrike Help](https://help.wrike.com/hc/en-us/articles/210324125-Importing-XLS-Files-to-Wrike)). Asana resolves parents by the *name* of a row above and is also create-only ([Asana Community](https://forum.asana.com/t/csv-import-dependent-tasks-to-a-project/39182)). monday imports subitems "as items" ([monday Support](https://support.monday.com/hc/en-us/articles/360000219209-Import-files-from-Excel)) and disambiguates people with `user:`/`team:` prefixes. Smartsheet reads only the first sheet, says "there currently is no way to automate Hierarchy" ([Smartsheet Community](https://community.smartsheet.com/discussion/81121/building-hierarchy-based-off-of-indentation/p1)), and its row-number predecessors shift by one after an Excel round trip ([Smartsheet Community](https://community.smartsheet.com/discussion/predecessors-shift-1-when-export-excel)). TeamGantt import was not covered by the research.

Dedicated import vendors converge on Upload → Match columns (auto-suggested) → Validate and fix in-grid. Flatfile claims its learned matcher predicts **over 90% of matches** ([Flatfile](https://support.flatfile.com/articles/7763163677-importing-data-with-flatfile-overview)), and Dromo argues for cell-level errors "the moment the file is uploaded" ([Dromo](https://dromo.io/blog/5-best-practices-to-streamline-your-csv-import-process)). No vendor documents a true dry run. A small tool can beat every incumbent on the same three points: a two-pass parent resolver that removes the row-order requirement, a preview that shows the rebuilt tree before committing, and an export that carries stable IDs, WBS **and** Outline Level, so its own files re-import losslessly. For dates, SheetJS returns serials unless you pass `cellDates:true`, must respect the 1900/1904 epoch flag, and reads CSV text dates as local time ([SheetJS docs](https://docs.sheetjs.com/docs/csf/features/dates)). Ambiguous `03/04/2026` values need an explicit DMY/MDY choice.

## Engineering: schema version 1 for the offline tool

The proof of concept already has the hard plumbing right. Every edit runs through `mutate()` as one transaction that bumps `meta.rev`. Saves are serialized, coalesced, written atomically through `createWritable()` and mirrored to IndexedDB, and on startup the app reconciles buffer and file by revision. Keep all of that. Two things change. The flat `tasks`/`deps(task_id, depends_on)` schema is replaced, and the whole-table `innerHTML` re-render gives way to a view layer that renders only visible rows, because a Gantt cannot be rebuilt from strings on every keystroke.

### Design choices, stated once

**Hierarchy** is `parent_id` plus a **contiguous 0-based integer `position`** among siblings. Fractional keys solve concurrent editing, which a single-writer file does not have. Contiguous integers make the WBS number simply `position + 1` at each level, which is computable in SQL with no window functions. A move rewrites at most two sibling lists inside one transaction, which is trivial at this scale. **WBS numbers are never stored.** An optional user-owned `code` column plays the role of MS Project's stable WBS code and is never auto-renumbered. **Summary status is derived**: a task is a summary if it has children. Its own stored dates are ignored while it has children and come back if it is outdented to a leaf. **Milestones** are tasks with `kind='milestone'` and duration 0, not a separate table, so they sit in the outline, take links and appear in RACI like any task. **Dates** are stored as `YYYY-MM-DD` text, the start date plus a working-day duration. Finish is derived. In memory, everything converts to integer working-day indices using **half-open intervals** (end = start + duration), so all four dependency formulas work without off-by-one fixes.

**People and teams use single-table inheritance in one `party` table** with a `kind` discriminator. RACI rows reference `party(id)` with a real foreign key, so "person or team" is one picker, one column and one join. The alternatives were weighed and rejected. monday-style `(party_kind, party_id)` loses referential integrity in SQLite. Two nullable foreign keys with an exactly-one CHECK keep integrity but double every query and picker. A supertable plus subtables adds a join for no benefit when people and teams differ by only an email column. The trade-off is that person-only columns are nullable for teams, and kind correctness on `team_member` needs triggers rather than plain foreign keys. That is acceptable for two columns and two triggers.

### DDL

```sql
-- Schema version lives in PRAGMA user_version (this script = 1).
-- Run PRAGMA foreign_keys = ON after every new SQL.Database(); sql.js leaves it off.

CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT NOT NULL);
-- rows: rev (existing PoC counter), format = 'offline-pm', created_at

CREATE TABLE project(
  id             INTEGER PRIMARY KEY,
  name           TEXT NOT NULL,
  start_date     TEXT NOT NULL,                       -- 'YYYY-MM-DD'
  work_week      TEXT NOT NULL DEFAULT '1111100',     -- Mon..Sun, 1 = working day
  schedule_mode  TEXT NOT NULL DEFAULT 'manual'
                 CHECK (schedule_mode IN ('manual','auto')),
  pct_weighting  TEXT NOT NULL DEFAULT 'duration'
                 CHECK (pct_weighting IN ('duration','equal')),
  notes          TEXT NOT NULL DEFAULT ''
);

CREATE TABLE holiday(
  project_id INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  day        TEXT NOT NULL,
  label      TEXT,
  PRIMARY KEY (project_id, day)
);

CREATE TABLE task(
  id            INTEGER PRIMARY KEY,
  project_id    INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  parent_id     INTEGER REFERENCES task(id) ON DELETE CASCADE,
  position      INTEGER NOT NULL,                     -- 0..n-1 among siblings, kept contiguous by the app
  kind          TEXT NOT NULL DEFAULT 'task' CHECK (kind IN ('task','milestone')),
  name          TEXT NOT NULL,
  start_date    TEXT,                                 -- ignored while the task has children
  duration_days INTEGER NOT NULL DEFAULT 1 CHECK (duration_days >= 0),
  pct_complete  INTEGER NOT NULL DEFAULT 0 CHECK (pct_complete BETWEEN 0 AND 100),
  status        TEXT NOT NULL DEFAULT 'todo'
                CHECK (status IN ('todo','doing','blocked','done')),
  code          TEXT,                                 -- optional stable user code; never auto-renumbered
  ext_id        TEXT,                                 -- ID from an imported file, for update-matching
  notes         TEXT NOT NULL DEFAULT '',
  collapsed     INTEGER NOT NULL DEFAULT 0,
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (kind <> 'milestone' OR duration_days = 0),
  CHECK (parent_id IS NULL OR parent_id <> id)
);
-- Not UNIQUE: shifting positions row by row would trip a unique index mid-statement.
-- Contiguity is checked by an integrity routine after each structural mutate().
CREATE INDEX task_tree ON task(project_id, parent_id, position);

CREATE TABLE party(                                   -- people AND teams
  id     INTEGER PRIMARY KEY,
  kind   TEXT NOT NULL CHECK (kind IN ('person','team')),
  name   TEXT NOT NULL,
  email  TEXT,                                        -- people only
  title  TEXT,                                        -- job title (person) / description (team)
  color  TEXT,
  active INTEGER NOT NULL DEFAULT 1,                  -- deactivate, never delete
  CHECK (kind = 'person' OR email IS NULL)
);
CREATE UNIQUE INDEX party_email ON party(lower(email)) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX party_name  ON party(kind, lower(name));

CREATE TABLE team_member(
  team_id   INTEGER NOT NULL REFERENCES party(id) ON DELETE CASCADE,
  person_id INTEGER NOT NULL REFERENCES party(id) ON DELETE CASCADE,
  is_lead   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (team_id, person_id)
);
CREATE TRIGGER team_member_kinds BEFORE INSERT ON team_member
WHEN (SELECT kind FROM party WHERE id = NEW.team_id)   IS NOT 'team'
  OR (SELECT kind FROM party WHERE id = NEW.person_id) IS NOT 'person'
BEGIN SELECT RAISE(ABORT, 'team_member must link a team to a person'); END;
CREATE TRIGGER party_kind_frozen BEFORE UPDATE OF kind ON party
WHEN NEW.kind <> OLD.kind
BEGIN SELECT RAISE(ABORT, 'a party cannot change between person and team'); END;

CREATE TABLE raci(
  task_id  INTEGER NOT NULL REFERENCES task(id)  ON DELETE CASCADE,
  party_id INTEGER NOT NULL REFERENCES party(id) ON DELETE RESTRICT,
  role     TEXT NOT NULL CHECK (role IN ('R','A','C','I')),
  PRIMARY KEY (task_id, party_id, role)               -- a party may hold A and R on one task
);
CREATE INDEX raci_party ON raci(party_id);

CREATE TABLE dep(
  id       INTEGER PRIMARY KEY,
  pred_id  INTEGER NOT NULL REFERENCES task(id) ON DELETE CASCADE,
  succ_id  INTEGER NOT NULL REFERENCES task(id) ON DELETE CASCADE,
  type     TEXT NOT NULL DEFAULT 'FS' CHECK (type IN ('FS','SS','FF','SF')),
  lag_days INTEGER NOT NULL DEFAULT 0,                -- signed working days; negative = lead
  CHECK (pred_id <> succ_id),
  UNIQUE (pred_id, succ_id)
);
CREATE INDEX dep_succ ON dep(succ_id);
CREATE TRIGGER dep_same_project BEFORE INSERT ON dep
WHEN (SELECT project_id FROM task WHERE id = NEW.pred_id)
  <> (SELECT project_id FROM task WHERE id = NEW.succ_id)
BEGIN SELECT RAISE(ABORT, 'links must stay inside one project'); END;

CREATE TABLE import_map(
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  header_sig TEXT NOT NULL,                           -- normalized, sorted headers joined by '|'
  spec       TEXT NOT NULL CHECK (json_valid(spec)),  -- columns, value maps, options (below)
  last_used  TEXT
);

-- Derived outline for export, debugging and SQL consumers; the UI computes the same thing in JS.
CREATE VIEW v_outline AS
WITH RECURSIVE t(id, project_id, depth, wbs, sort_path) AS (
  SELECT id, project_id, 1, CAST(position + 1 AS TEXT), printf('%05d', position)
    FROM task WHERE parent_id IS NULL
  UNION ALL
  SELECT c.id, c.project_id, t.depth + 1, t.wbs || '.' || (c.position + 1),
         t.sort_path || '.' || printf('%05d', c.position)
    FROM task c JOIN t ON c.parent_id = t.id
)
SELECT id, project_id, depth AS outline_level, wbs, sort_path FROM t;
```

An `import_map.spec` looks like `{"columns":{"Task Name":"name","WBS":"wbs","Owner":"raci.A","Depends On":"predecessors"},"values":{"status":{"In progress":"doing","Complete":"done"},"party":{"J. Smith":12,"Design":"team:new"}},"options":{"dateOrder":"DMY","hierarchy":"wbs","predRef":"id","mode":"update","matchOn":"ext_id"}}`. Maps live in the `.db`, not in localStorage, so they travel with the plan file. The JSON functions are built into SQLite from 3.38. Confirm that the bundled sql.js build includes them, or drop the CHECK.

### Versioning and migration

Use `PRAGMA user_version` as the schema version and keep `meta.rev` as the edit counter. On load, the app reads `user_version`. If it is **greater** than the app knows, it opens the file **read-only** with a "made by a newer version" banner, so an older HTML file never corrupts a newer plan. If it is lower, the app first stores the untouched bytes in IndexedDB under `premigrate-v{n}`, then runs each step of an ordered `MIGRATIONS` array inside one transaction, setting `user_version` as it goes (the pragma is transactional), and finally queues a normal save. Migration 0→1 recognizes PoC files by `user_version = 0` plus an existing `tasks` table. It creates one project starting at the earliest `due` date or today, copies tasks as top-level rows with position taken from `id` order, `name = title`, `start_date = due` and duration 1, maps `deps(task_id, depends_on)` to `dep(pred_id = depends_on, succ_id = task_id, 'FS', 0)` keeping IDs, and drops the old tables. Migrations are append-only and each is tested against a fixture `.db` from the previous version.

## Engineering: the algorithms in plain terms

**WBS numbering and visible rows.** Load all tasks for the project into a map and build child lists sorted by `position`. A depth-first walk from the roots assigns each node its parent's number plus "." plus `position+1`, and `outline_level` is the depth. Visible rows are the same walk, skipping descendants of collapsed nodes. This is O(n) on every structural change and needs no caching. Numbers renumber themselves after every move, as MS Project's Outline Number does, which is what a communication tool wants. Users who need numbers that stay fixed put them in `code`.

**Indent, outdent and move.** *Indent* row R: R must have a previous sibling P. R becomes P's last child, and R's old later siblings close the gap. A multi-row selection indents the top-most selected rows, in order, under the same P. *Outdent* R (parent P): R moves to P's parent at `P.position + 1`, opening a gap there. **R's later siblings under P become R's children**, appended after R's existing children. This is the outliner convention, and it keeps the visible row order unchanged, so nothing jumps on screen. *Move* (grid drag or Alt+↑/↓) computes a target (new parent, index). It rejects the move if the new parent is R or one of R's descendants (walk up the ancestors from the target), closes the gap in the old list and opens one in the new. *Delete* removes the subtree through the CASCADE foreign keys after a confirmation that shows the count. Every structural operation is one `mutate()`, ends with a contiguity check, and can be undone.

**Undo.** Because the database is small and `mutate()` is already the single choke point, undo can **snapshot `db.export()` before each mutation into a ring of about 50 entries** and restore by reloading the bytes. It needs no inverse operations and handles every edit type uniformly. The cost is memory: a 200 KB plan × 50 is 10 MB. Undo still bumps `rev` and saves normally.

**Summary rollups.** These run in a post-order walk on every render and are never stored. For a summary: start = minimum child start, finish = maximum child finish (both over dated children only), duration = working days in that span. % complete = Σ(childPct × childDuration) / Σ(childDuration). Milestones weigh zero, so if the total weight is zero, use the simple average of the children, and with `pct_weighting='equal'` always use the simple average. Status rolls up as: all children done → done; any child blocked → blocked; any doing or done → doing; otherwise todo. Rolled-up cells render read-only and in a distinct style.

**Cycle and structure checks for links.** Creating pred→succ is rejected when the two tasks are the same, the pair already exists, either task is a summary, either task is an ancestor of the other (summary dates derive from children, so such a link is an implicit cycle), or a depth-first search from succ along outgoing links reaches pred. The PoC already does this check with a recursive CTE, and keeping it in SQL is fine. If a linked task later becomes a summary by gaining a child, its links are kept but marked **inactive** in the warnings panel and ignored by the scheduler. This is simpler and more predictable than Smartsheet's rule that a parent link constrains all children. On import, Kahn's topological sort over all links reports any leftover nodes as a named cycle.

**Scheduling.** In working-day index space with half-open intervals [s, e), where e = s + duration, a link with lag L constrains the successor as follows: FS s′ ≥ e + L; SS s′ ≥ s + L; FF e′ ≥ e + L; SF e′ ≥ s + L. Convert each constraint to a minimum start for the successor and take the **maximum across all incoming links**, which fixes ClickUp's one-blocker flaw. In **manual mode** (the default) the app never moves anything. It marks any link whose successor starts earlier than its constraint as violated, draws it red and lists it, and a "Fix violations" button pushes only the violating successors forward in topological order, as TeamGantt does. In **auto mode** the same push-only forward pass runs after every edit, treating each task's own start as "start no earlier than", which is monday's Flexible mode. Successors are never pulled earlier automatically. Strict mode is out of scope.

**Critical path (optional toggle).** Run the forward pass to get earliest starts (ES) and earliest ends (EF). Set the project end to the maximum EF, then run the backward pass in reverse topological order. The latest finish (LF) is the minimum over successors of: FS `LS_s − L`; SS `LS_s − L + dur`; FF `LF_s − L`; SF `LF_s − L + dur`. LS = LF − dur. Slack = LS − the task's current start. Tasks with slack ≤ 0 and the links between them are critical. In manual mode with deliberate gaps, slack is measured against actual dates, so "critical" honestly means "any slip here moves the end date".

**RACI validation.** These are warnings shown as row badges and in a panel. They never block saving, because drafts are normal. The rules: (1) a leaf task with **no effective A** (its own, or inherited from the nearest ancestor that has one), so a phase owner covers the phase's tasks; (2) **more than one A** on a task; (3) the A is a **team**, a soft warning suggesting a named person; (4) no R and no A (if an A exists without an R, show "A is implied R" as information only); (5) one party holding **both C and I**; (6) an **inactive** party in any role; (7) a team and one of its own members holding the same role on the same task, flagged as redundant. "What is X involved in" is direct `raci` rows plus rows held by any team X belongs to. That is one UNION query, and it drives the per-person view.

## Engineering: screens and views

The **plan view** is the default screen: an outline grid on the left and a Gantt on the right, sharing row virtualization and vertical scroll. Grid columns are WBS (derived), Name (indented, with a collapse caret), Start, Finish, Duration, % complete, Status, Accountable, Responsible and **Predecessors**. The Predecessors cell is editable text in the MS Project grammar, referencing WBS numbers on screen (`1.2FS+2, 3SS`) and stored IDs underneath, so keyboard users and typists never need the mouse. Keys: Enter adds a sibling, Tab/Shift-Tab indent and outdent, Alt+↑/↓ move, Ctrl+Z/Y undo and redo, Delete removes. Summary rows show rolled-up values in a muted style.

The **Gantt** renders in SVG with only visible rows mounted, which is adequate to a few thousand tasks. Bar x-positions come from continuous day indices at every grain, so coarse zoom never distorts dates. It offers the following grains:

| Grain | Header rows | ~px/day | Drag snaps to |
|---|---|---|---|
| Day | Month / day | 40 | 1 day |
| Week | Month / ISO week | 12 | 1 day |
| Month | Year / month | 4 | 1 week |
| Quarter | Year / quarter | 1.5 | 1 week |
| Fit | auto-pick the finest grain that fits the project span | — | per chosen grain |

Weekend shading appears only at Day and Week. A today line, 3 px minimum bar width, progress fill, milestone diamonds and bracketed summary bars round it out. Hit regions follow library convention: the left and right 6 px of a bar resize, the body moves, and hovering shows link handles just outside each end. Dragging from a handle draws a rubber-band line, and the handle pair decides the type, with a drop on a bar body treated as that bar's start (FS). Links are elbow paths on a layer below the bars, each with an 8 px transparent hit stroke. A click selects a link and Delete removes it. A double-click opens a popover with type, lag and delete. Moving a summary bar shifts all its descendants by the same working-day delta. Violated links draw red. A Critical toggle and a print stylesheet (landscape, grid + Gantt, legend) complete the view, because printing or saving as PDF is how most plans actually reach team members.

The **RACI matrix** shows tasks as collapsible outline rows and parties as columns, teams first and then people, with filter chips. Each cell is a four-letter toggle, so one party can hold A+R. Inherited A shows in grey, and a warnings column sits at the right. The same data also feeds the grid's Accountable and Responsible columns, which form the board-style layout.

**People & teams** is a two-pane screen. People have name, email, title, color and an active flag, and teams have name, description and member chips with a lead marker. Deactivation greys a party out everywhere and removes it from pickers, following ServiceNow's pattern. Each person has a printable "My involvement" page that lists their tasks and role letters, including roles held through teams. This is the most direct communication payoff of the whole model.

The **import wizard** has four steps. *Upload*: drop an xlsx, xls or csv file, choose the sheet (never silently the first), choose the header row, and see the row count. A saved map whose `header_sig` matches is pre-applied, and files the app exported itself (detected by a `_meta` sheet) skip straight to preview in update mode. *Columns*: a table of source header, three sample values, a target dropdown that includes "Don't import" and the four RACI roles, and match status, auto-matched on normalized headers plus a synonym list (Task/Summary/Title → name; Outline Number → wbs; Depends On/Blocked by/DependsOn → predecessors; Owner/Assigned to → R or A, as the user chooses). *Values*: distinct status values map to the four statuses, and distinct people tokens (split on `;` or `,`, honoring `team:`/`user:` prefixes) resolve by email, then exact name, then case-insensitive name, then "create person", "create team" or "ignore". *Preview & validate*: the rebuilt tree is shown indented, with parsed dates and durations, resolved links, and per-row errors (unparseable date, ambiguous DMY/MDY, unknown predecessor reference, cycle, missing WBS parent, outline-level jump). Choices are "import valid rows" or "back", plus a downloadable error CSV. Hierarchy rebuild tries, in order, **Parent ID → WBS → Outline Level → parent name → leading-space indentation**, using two passes: create every row, then resolve parents and links. Import modes are New project, Replace project, or Update matched on `ext_id`/ID. The mapping can be saved under a name.

**Export** is a workbook with four sheets. *Tasks* has ID, WBS, Outline Level, Kind, Name, Start and Finish as real date cells, Duration (`5d`), % Complete, Status, Predecessors (ID grammar, e.g. `14FS+3, 9SS`), R, A, C and I (`;`-separated names, with `team:` prefixes for teams), Code and Notes. *People* has name, email, title and active. *Teams* has team and members. *_meta* holds the format name, schema version and export timestamp. CSV export is the Tasks sheet alone, which is self-sufficient. Carrying both WBS and Outline Level lets MS Project-style and WBS-style importers read the file, and stable IDs keep predecessor references and update-matching exact, avoiding Smartsheet's off-by-one.

## Engineering: phased plan, scope and risks

| Phase | Scope | Effort (dev-days) |
|---|---|---|
| 0. Foundation | Schema v1 DDL, migration runner and PoC 0→1 migration, read-only mode for newer files, snapshot undo, in-memory task model, working-day date library with holiday support, virtualized row renderer replacing `innerHTML` | 5–6 |
| 1. Outline | Tree grid, derived WBS, indent/outdent/move/delete, milestones, inline editing, rollups, keyboard map, Predecessors text cell (FS only to start) | 7–8 |
| 2. Gantt + dependencies | SVG Gantt at four grains + Fit, move/resize drag, drag-to-link with type from handles, link popover, four types + lag, cycle/structure checks, violation flags, Fix violations, auto mode | 11–13 |
| 3. People, teams, RACI | Party CRUD, membership, deactivation, RACI matrix, grid A/R columns, validation panel, inheritance, "My involvement" page | 6–7 |
| 4. Import/export | Four-step wizard, synonyms, value and people mapping, two-pass hierarchy rebuild, predecessor grammar parser, date handling, saved maps, error CSV, round-trip export + `_meta` detection, update mode | 8–10 |
| 5. Polish | Critical path toggle, print stylesheet, filters (by person, status, phase), multi-project switcher, round-trip regression fixtures, performance pass at 2,000 tasks | 4–6 |

The total is **41–50 developer-days**, about two to two and a half months for one engineer. Phases 0–2 alone already make a useful "outline + Gantt" communication tool. Phase 2 is the estimate most likely to overrun, because drag interactions, arrow routing and snapping at four grains are where Gantt projects historically sink time.

**Out of scope**, deliberately: multi-user editing, sync or merge (the model is **one editor, many viewers**: send the `.db` or a PDF); resource leveling, workload heat maps and hours on assignments; costs and budgets; effort-weighted % complete; baselines; constraint types beyond the implicit "start no earlier than"; strict-mode dependency shifting; elapsed or percentage lag; per-person calendars; nested teams; cross-project links; `.mpp`/MS Project XML import; notifications, permissions and comments; writing files in non-Chromium browsers (Firefox and Safari get open and export only); mobile layouts.

**Top risks**, in order. First, **Gantt interaction cost**: mitigate by building move, resize and link on one pointer-event state machine with a fixed snapping table, and by shipping FS-only drag-linking before the other three types. Second, **two people editing copies of the same `.db`** (for example through OneDrive), which silently forks the plan. Mitigate with a visible "last edited by / rev" stamp in `meta`, a warning when an opened file's rev is lower than the buffer's (the PoC's reconciliation already detects this), and the explicit single-editor convention. Third, **import date ambiguity** and messy spreadsheets: mitigate with `cellDates:true`, an epoch check, a forced DMY/MDY choice when ambiguous, and the preview step. Fourth, **Chrome/Edge lock-in** through the File System Access API, which is accepted but must be stated on first run. Fifth, **scope creep toward a scheduler**: the moment someone asks for leveling or strict mode, point to the out-of-scope list. Sixth, **whole-database export on every edit** as plans grow. It is fine below a few megabytes. Beyond that, debounce saves to about 500 ms (the PoC's coalescing already partly does this) before considering anything cleverer.

## Conclusion

The research inverts a natural assumption. The hard parts of a planning tool are not hierarchy or dependency modeling, where the industry has a settled, cheap answer: parent pointer, derived numbers, typed links with signed lag. The hard parts are the edges where the platforms visibly disagree or fail: who owns a task when a team is involved, what moves when a date slips, and whether a spreadsheet survives the trip in and out. A communication-first tool should take firm, visible positions on exactly those edges. RACI should warn rather than block, with inherited accountability. Dates should flag before they move. Exports should carry IDs, WBS and Outline Level together, and saved maps should live inside the plan file. Taking those positions lets a single offline HTML file do several things the incumbents' importers and assignment fields do not, without trying to be a scheduler.

Two judgment calls deserve revisiting after real use. One is whether a team should ever count as the Accountable without a warning. The other is whether manual "flag, don't move" scheduling holds up once plans exceed a few dozen linked tasks. Both are settings in this design, not schema changes, which is the real benefit of keeping derived values out of the database.
