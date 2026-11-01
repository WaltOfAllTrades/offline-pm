# How PM Platforms Model RACI, People, Teams and Resources

Research date: 2026-10-31. Sources are official docs where possible. Community and forum posts are labelled as such. Anything not confirmed is listed under Gaps.

## monday.com: People column (users AND teams), RACI boards, guests

### Takeaway
The monday People column is natively polymorphic: its value is an array of `{id, kind}` entries where `kind` is `"person"` or `"team"` (the API intro also mentions `"agent"`). This is the cleanest real-world example of a "person-or-team" field. Users build RACI by adding several People columns to a board, one per role. `max_people_allowed` caps the count, which is how you could enforce a single Accountable.

### Cited Findings
- Raw People column value is JSON: `{"changed_at":"2026-03-21T09:03:56.017Z","personsAndTeams":[{"id":48202303,"kind":"person"},{"id":331,"kind":"person"}]}`. `kind` ∈ {`person`, `team`}. The page intro also lists `agent`, but the field table lists only person/team, so the docs disagree with each other — [monday API: People](https://developer.monday.com/api-reference/reference/people)
- Read fields: `persons_and_teams` (array of `PeopleEntity {id, kind}`), `text` (comma-separated names, `""` if empty), `value` (raw JSON), plus `updated_at`, `id`, `type`, `column` — [monday API: People](https://developer.monday.com/api-reference/reference/people)
- Writes replace the whole list ("Updating a people column **replaces** all currently assigned people"), so clients must read, modify, then resend. `change_simple_column_value` takes comma-separated user IDs, and `change_multiple_column_values` takes the JSON object — [monday API: People](https://developer.monday.com/api-reference/reference/people)
- Column setting `max_people_allowed` limits assignees per item (`"0"` = unlimited). It only appears when explicitly configured — [monday API: People](https://developer.monday.com/api-reference/reference/people)
- Filter syntax: `any_of`/`not_any_of` take `"person-{userId}"`, `"assigned_to_me"`, or `"person-0"` for blank. `is_empty`/`is_not_empty` are also supported — [monday API: People](https://developer.monday.com/api-reference/reference/people)
- Help Center (via search snippet; the page itself returned 403): you can assign whole teams *and sub-teams* to items with the People column. Hovering an icon shows details of the person or team. Column settings control how many people can be assigned per item. Only account members or guests can be assigned — [monday Support: The People Column](https://support.monday.com/hc/en-us/articles/360002281539-The-People-Column)
- monday offers a "RACI matrix" template, but its public page does not describe column structure ("Assign team members to each action item…") — [monday RACI matrix template](https://monday.com/templates/raci-matrix)
- Third-party review: monday's RACI template is available on the free plan, and guest users require Standard plan or higher — [startups.co.uk RACI templates](https://startups.co.uk/project-management-software/best-raci-chart-templates/)
- Community thread on building RACI in monday — [monday community: creating a RACI](https://community.monday.com/t/monday-for-creating-a-raci/6093)

### Inferences
- monday stores team references, not expanded members. The team ID sits in the cell, so the effective people set is resolved at read time. A small app can copy this: `assignee = {kind: 'person'|'team', id}`.
- A RACI board in monday is just four People columns (R, A, C, I) on items. Setting the "A" column's `max_people_allowed = 1` gives a single Accountable, but a team can still occupy that one slot. monday does not stop a team being Accountable.

### Gaps
- Could not confirm the exact columns of monday's own RACI template (the page gives no detail; the template has to be opened in-app).
- Behaviour of deactivated users in People cells is not covered by the sources fetched. The support page was blocked (403).
- The `agent` kind (AI agents as assignees) is mentioned in the API intro but not in the field table. Treat it as unverified or new.

## ServiceNow SPM/PPM: resource model, assigned_to vs assignment_group, stakeholders/RACI

### Takeaway
ServiceNow keeps "person" and "group" in two separate reference fields on every task (`assigned_to` → `sys_user`, `assignment_group` → `sys_user_group`), with membership in `sys_user_grmember`. Resource Plans add a discriminator `Resource type` = Group | User | Role. Out of the box, SPM has a stakeholder register but **no RACI field**. Practitioners build RACI as a customization.

### Cited Findings
- Base `task` table has two assignment fields: Assigned to [`assigned_to`] and Assignment Group [`assignment_group`]. Groups live in `sys_user_group`. `sys_user_grmember` is the join table, one row per user–group relationship (community and reference material, consistent pattern) — [ServiceNow community: restrict assigned_to to group members](https://www.servicenow.com/community/developer-forum/restrict-quot-assigned-to-quot-changes-to-only-group-members/m-p/2486351); [Steampipe sys_user_grmember table](https://hub.steampipe.io/plugins/turbot/servicenow/tables/servicenow_sys_user_grmember)
- A common pattern restricts `assigned_to` to members of the selected `assignment_group` via a scripted reference qualifier over `sys_user_grmember`, filters inactive users with `user.active=true`, and clears `assigned_to` when the group changes — [ServiceNow community thread](https://www.servicenow.com/community/servicenow-ai-platform-forum/how-can-i-filter-a-reference-field-referencing-sys-user-to-only/m-p/3193109); [ServiceNow community: record producer](https://www.servicenow.com/community/developer-forum/assignment-group-and-assigned-to-on-record-producer/m-p/1736261)
- Resource Plan form (Australia release doc, updated 12 Mar 2026) fields:
  - **Resource type** (Group / User / Role)
  - **Group**
  - **User** (shown when type = User)
  - **Role** (shown when type = Role; the Group list is filtered to groups that contain the role)
  - **Members preference** (All members [default] / Specific members / Any member; Group or Role only)
  - **Skills**
  - **Request type** (Hours / FTE), **FTE**, **Planned hours**
  - **Task**, **Start/End date**
  - **Allocation dissemination** (Even / Front load)
  - **State** (starts at Planning)
  - **Rate override**, **Resource rate**

  [ServiceNow Docs: Resource Plan form](https://www.servicenow.com/docs/r/t50FqY34BO_zQ~d4gxe26g/IvWsJKi880XSxHwzjI3gaA)
- Community: the user field on the resource plan is `user_resource` (queried as `rpl_user_resource` in a database view) — [ServiceNow community: database view](https://www.servicenow.com/community/developer-forum/add-additional-table-data-to-database-view-for-group-weekly/m-p/3260487)
- Groups used as resources must carry the `pps_resource` role, which is added automatically when a resource manager creates a group from the resource view — [ServiceNow Docs: User resources and group resources](https://www.servicenow.com/docs/r/MrftC6mNgCta3UqwXSW7Kg/f08QotEP7X1sT7rOdALH~A)
- Stakeholder registry: users are added so demand/project management can auto-populate stakeholder lists. Register form has Number and User. The demand stakeholder form has Stakeholder, Demand, Level of Interest — [ServiceNow Docs: Populate the stakeholder registry](https://www.servicenow.com/docs/r/4Pll~Vzr5Rr79UNYLnUdJw/lgMrnFPrO9XY4HR6UsimbA); [ServiceNow Docs: Stakeholder register form](https://www.servicenow.com/docs/r/4~5Anqt12idfVzJWPcxoHw/5aLcEaiSVLEH6BCS9z16NQ); [ServiceNow Docs: Create stakeholder form](https://www.servicenow.com/docs/r/4~5Anqt12idfVzJWPcxoHw/Xtw7B5f_n6ce1xaZiwKyFA)
- Community: linking a stakeholder to a project creates a row in `pm_m2m_project_stakeholder`. Attributes (function, level of interest) default from the register and can be overridden per project without changing the register. Copying a project copies its stakeholders — [ServiceNow community: stakeholders populating](https://www.servicenow.com/community/spm-forum/stakeholders-from-one-project-populating-in-another-project/m-p/993831)
- Practitioner: there is "no out-of-the-box RACI" in SPM. Their org derived it, with Portfolio Manager as Accountable and PM as Responsible for projects, and demand-approval-stage owners for demands — [ServiceNow community: traceability matrix for PPM](https://www.servicenow.com/community/spm-forum/traceability-matrix-for-ppm-idea-until-project-closure/td-p/1039906)
- A business rule on `dmn_demand` writes stakeholder register entries (community) — [ServiceNow community: Manage Stakeholders List](https://www.servicenow.com/community/spm-forum/manage-stakeholders-list/m-p/1047865)

### Inferences
- ServiceNow's design is "two-field": a group owns the queue and an optional individual within it does the work. The constraint `assigned_to ∈ members(assignment_group)` is the main validation. This works well for "team Accountable, person Responsible" style data.
- The pattern "register default, then per-project override" (a template row copied into a project-specific join row) is a useful idea for a small app's project membership table.

### Gaps
- Could not confirm in official docs the column list of `pm_m2m_project_stakeholder` or whether a "function"/"influence" field exists. Field names should be verified in `sys_dictionary`.
- Exact field name for group on `resource_plan` (likely `group_resource`) is unconfirmed.
- No sign of a native RACI matrix view in SPM as of the 2026 docs found.

## Microsoft Project / Project for the web / Planner

### Takeaway
Desktop Project uses a classic three-table model: Resources (type Work / Material / Cost, plus a Generic flag for roles like "Carpenter"), Tasks, and Assignments (task × resource with Units, Work and Cost). Planner allows multiple assignees, documented as up to 11. No Microsoft product has native RACI. It is done with custom fields or text columns.

### Cited Findings
- Resource types: Work resources have units as a % of time and cost by time. Material resources have units as a consumption rate and a Material Label (tons, boxes). Cost resources (airfare, lodging) have no units — [Microsoft Support: Learn more about resource units](https://support.microsoft.com/en-us/project/learn-more-about-resource-units); [Microsoft Support: Add resources to your project](https://support.microsoft.com/office/add-resources-to-your-project-1a744960-d960-426a-b687-e42ba3f6c0cb)
- Generic resources represent a role ("carpenter") rather than a named person — [Microsoft Support: Add resources to your project](https://support.microsoft.com/office/add-resources-to-your-project-1a744960-d960-426a-b687-e42ba3f6c0cb)
- Project Server API enum includes `GenericWorkResource` (value 20) plus generic material/cost variants. Generic resources can be assigned to tasks but cannot log on to Project Web App — [MSDN Resource.Type Enumeration](https://msdn.microsoft.com/en-us/ms486867(v=office.14))
- Assignments carry a Resource Type field — [Microsoft Support: Resource Type (assignment field)](https://support.microsoft.com/en-US/project/resource-type-assignment-field)
- Planner: a task can be assigned to up to 11 people, all of whom see it in "Assigned to me" — [Microsoft Support: Assign people to tasks](https://support.microsoft.com/en-us/planner/assign-people-to-tasks); [Office 365 IT Pros: Planner limits](https://office365itpros.com/2022/03/11/planner-limits/). A Tech Community reply claims 20, which conflicts with this — [Tech Community thread](https://techcommunity.microsoft.com/discussions/planner/number-of-assignation-on-a-task/4035560)

### Inferences
- The Project model maps directly to a small app: `resource(id, name, type, is_generic, max_units)`, `assignment(task_id, resource_id, units, work)`. A "team" can be modelled MS-style as a generic resource with `max_units > 100%` (for example, 300% = 3 people). In that case the team is a capacity pool, not a membership list.
- A RACI letter could be added as a column on the assignment row (Project users do this with custom text fields).

### Gaps
- Did not find an official Microsoft doc describing a RACI workflow in Project. The claim that RACI is "usually custom fields" is common practice but was not confirmed by a source in this research.
- Did not verify the current Planner Premium (formerly Project for the web) assignee limit or whether it supports group assignment. The sources found cover basic Planner only.

## Smartsheet, Asana, Wrike, ClickUp, Jira, TeamGantt

### Takeaway
The tools fall into three camps:
- **Single owner:** Asana (one assignee plus collaborators) and Jira (one user assignee plus a separate single-value Team field).
- **Multi-person:** Smartsheet (multi-contact columns), Planner (up to 11), ClickUp (multiple assignees plus teams), TeamGantt (multiple people with hours).
- **Groups not assignable:** Wrike, deliberately. It assigns individuals or job roles.

Smartsheet's own guidance for role-based assignment is one Contact List column per role, which is the RACI pattern.

### Cited Findings
- **Smartsheet:**
  - Contact List columns can allow multiple contacts per cell ("Limit to one contact per cell" toggle). The help center recommends inserting multiple Contact List columns "when people have different roles related to each task" — [Smartsheet Help: Assigning people to a task](https://help.smartsheet.com/articles/518335)
  - Each contact must have an email address. A preferred contact list can be set per column — [Smartsheet Help: Assigning people to a task](https://help.smartsheet.com/articles/518335)
  - Multi-contact cells cannot easily be combined with formulas (community) — [Smartsheet community: multiple contacts](https://community.smartsheet.com/discussion/comment/285387/)
  - Community RACI-automation threads exist — [Smartsheet community: Project Plan RACI formula automation](https://community.smartsheet.com/en/discussion/92984/project-plan-raci-formula-automation)
- **Asana:**
  - "Every task can only have one assignee, but it can have many collaborators." The assignee is responsible for completing the task. Collaborators get notifications but the task doesn't appear in their My Tasks — [Asana Help: Understanding tasks](https://help.asana.com/s/article/understanding-tasks); [Asana Help: Assign tasks to teammates](https://help.asana.com/s/article/assign-tasks-to-teammates)
  - "Assign copies" duplicates a task per person as a workaround — [Asana: assign copies of a task](https://asana.com/fr/inside-asana/assign-copies-of-a-task.md)
  - Users have asked for multiple assignees for years without it shipping — [Asana forum: Assign multiple assignees](https://forum.asana.com/t/assign-multiple-assignees-on-one-task/1176)
- **Wrike:**
  - You cannot assign directly to a user group, only to individuals or to Job Roles (higher plans). Automation can expand a group into individual assignees (max 25). Wrike's stated reason is that work tends to get done with fewer assignees (community/staff posts) — [Wrike community: Assign User Groups](https://help.wrike.com/hc/en-us/community/posts/115000233605-User-Groups); [Wrike community: assign task to groups with automations](https://community.wrike.com/discussion/796/assign-task-to-groups-with-automations)
  - Wrike "generic/general assignees" feature marked Launched — [Wrike community post](https://help.wrike.com/hc/es/community/posts/115000153925-Ability-to-Assign-Tasks-to-Generic-or-General-Assignees?page=3)
- **ClickUp** (third-party guides and feedback posts, not official docs):
  - Multiple assignees per task. Teams (user groups) can be added to the Assignee field.
  - API task responses include `group_assignees` separately from `assignees`. Creating a task with team assignees was historically unsupported in the API (create, then PUT).
  - Automations don't fully support teams.

  [ClickUp feedback: API call for assigning Teams](https://feedback.clickup.com/public-api/p/api-call-for-assigning-teams); [Make community: Assign groups in ClickUp](https://community.make.com/t/assign-groups-in-clickup-to-a-task/83312); [ClickUp feedback: automation assign to team](https://feedback.clickup.com/feature-requests/p/allow-automation-to-assign-a-task-to-a-team)
- **Jira:**
  - Assignee is a single-user picker. Team (Atlassian Teams) is a separate field of a different type and holds one value. Teams cannot be chosen in Assignee. Many teams fill both fields (community) — [Atlassian Community: Team vs assignee](https://community.atlassian.com/forums/Advanced-Planning-in-Jira/Team-vs-assignee/td-p/2026690); [Atlassian Community: How do I assign a team](https://community.atlassian.com/forums/Advanced-Planning-in-Jira/How-do-I-assign-a-team-to-an-issue/td-p/2982866)
  - Atlassian's Teamwork Graph has an explicit relationship type "atlassian-team-assigned-jira-work-item" — [Atlassian Developer: Teamwork Graph relationship](https://developer.atlassian.com/platform/teamwork-graph/api-reference/relationship-types/atlassian-team-assigned-jira-work-item/)
- **TeamGantt:**
  - When assigning people to a task you enter Avg Hours/Day or Total Hours, and the other field is calculated — [TeamGantt Support: Hourly Estimation](https://support.teamgantt.com/article/79-hourly-estimation)
  - The workload view is a heat map per person per day (tasks or hours), and days over 8 hours are highlighted red. Workload can also be grouped by label — [TeamGantt Support: View workload within a project](https://support.teamgantt.com/article/16-team-availability)

### Inferences
- Two dominant shapes:
  - A: one `owner` field plus a many-to-many `watchers/collaborators` (Asana, Jira).
  - B: a multi-valued assignee list, sometimes polymorphic (monday persons+teams, ClickUp `assignees` + `group_assignees`).
- ClickUp keeps person and group assignees in *separate arrays*, while monday uses *one array with a kind tag*. Both work. A single table `assignment(task_id, party_type, party_id, role)` covers both.
- TeamGantt shows workload needs an amount on the assignment row (hours/day or total hours), not just a link.

### Gaps
- ClickUp's official Help Center article on assigning teams was not fetched. Details (50-user limit, plan gating) come from third-party guides and are unverified.
- Wrike Job Roles as assignees (behaviour, data shape) not verified in official docs.
- No native RACI matrix view found in Asana, Wrike, ClickUp, Jira or TeamGantt from these sources. RACI there appears to be custom fields or templates (unverified).

## Common RACI rules and validation

### Takeaway
Standard guidance is exactly one Accountable per activity (never zero, never more than one), and one or more Responsible. The Accountable may also be the Responsible (implied R). PMBOK frames RACI as one kind of Responsibility Assignment Matrix (RAM) linking activities/work packages to team members. None of the platforms reviewed enforce RACI rules natively. Enforcement comes from user configuration (for example, monday `max_people_allowed`).

### Cited Findings
- "There should only be one 'A' for each activity, but no activity should be missing an 'A'." A = the person who signs off on the work — [ProjectManagement.com wiki: RACI](https://www.projectmanagement.com/wikis/234008/RACI)
- The Accountable role often also does the work. An activity may then show an A with no separate R (R is implied) — [ProjectManagement.com wiki: RACI](https://www.projectmanagement.com/wikis/234008/RACI)
- PMBOK Guide (4th ed., section 9.1, via exam-prep blog) defines RACI as a RAM showing connections between work packages/activities and team members. It "ensures that there is only one person accountable for any one task". Other RAM variants exist ("lead", "resource") — [ProjectManagement.com: PMP Exam Tip – RAM](https://www.projectmanagement.com/blog-post/2685/PMP-Exam-Tip--The-Responsibility-Assignment-Matrix--RAM-)
- Matrix layout: tasks/deliverables as rows, stakeholders as columns, a RACI letter in each cell. Some orgs use RASCI (S = Support) — [CIO: The RACI matrix](https://www.cio.com/article/287088/project-management-how-to-designa-successful-raci-project-plan.html); [Wikipedia: Responsibility assignment matrix](https://en.wikipedia.org/wiki/Responsibility_assignment_matrix)
- Consulted = two-way input before or during the work. Informed = one-way updates after — [LaunchNotes: Consulted vs Informed](https://launchnotes.com/blog/raci-consulted-vs-informed-key-differences-explained)
- Alternative layout: RACI roles as column headers, with people placed in cells where task and role intersect. This is what multi-People-column boards in monday and Smartsheet produce — [scoopanalytics: RACI model template](https://www.scoopanalytics.com/blog/raci-model-template-clarify-team-responsibilities); [Smartsheet Help](https://help.smartsheet.com/articles/518335)

### Inferences
- Two equivalent UI layouts come from the same data:
  - (1) Tasks × People grid with a letter in each cell (classic matrix view).
  - (2) Tasks × {R, A, C, I} columns with people or teams in each cell (monday/Smartsheet board view).
  
  Both are projections of `assignment(task, party, role)`.
- Suggested validations for a small app:
  - Exactly one A per task (warning rather than hard error, to allow drafts).
  - At least one R, or treat A as implied R.
  - A party should not hold both C and I on the same task.
  - Warn when A is a team: the guidance says "one person", but tools like monday and ServiceNow (`assignment_group`) allow group ownership.

### Gaps
- No authoritative source found for whether a *team* may be Accountable. The guidance consistently says "person", while tools allow teams. This is a design choice to flag.
- Exact current PMBOK (7th/8th ed.) wording on RAM/RACI not verified. The sources cite the 4th edition.

## Data model patterns (polymorphic party, membership, assignment-with-role, deactivation, workload)

### Takeaway
A consistent minimal model comes out of the platforms:
- `person` and `team` tables
- `team_member(team_id, person_id)` (ServiceNow `sys_user_grmember`)
- one `assignment(task_id, party_kind, party_id, role, units/hours)` table, polymorphic like monday `{id, kind}`

Use an `active` flag on people rather than deletion (ServiceNow filters `user.active=true`). Workload views are aggregations over assignment rows with an effort amount (TeamGantt, MS Project).

### Cited Findings
- Polymorphic party reference `{id, kind: person|team}` in one array — [monday API: People](https://developer.monday.com/api-reference/reference/people)
- Separate person and group arrays (`assignees` vs `group_assignees`) — [Make community: ClickUp groups](https://community.make.com/t/assign-groups-in-clickup-to-a-task/83312)
- Separate person and group fields (`assigned_to`, `assignment_group`) with a membership join table `sys_user_grmember` — [Steampipe: sys_user_grmember](https://hub.steampipe.io/plugins/turbot/servicenow/tables/servicenow_sys_user_grmember); [ServiceNow community](https://www.servicenow.com/community/developer-forum/restrict-quot-assigned-to-quot-changes-to-only-group-members/m-p/2486351)
- Discriminator-based resource request (`Resource type` = User / Group / Role) with "Members preference" (all / specific / any member) for groups — [ServiceNow Docs: Resource Plan form](https://www.servicenow.com/docs/r/t50FqY34BO_zQ~d4gxe26g/IvWsJKi880XSxHwzjI3gaA)
- Inactive users kept and filtered via `active` flag (`user.active=true` in qualifiers) — [ServiceNow community](https://www.servicenow.com/community/servicenow-ai-platform-forum/how-can-i-filter-a-reference-field-referencing-sys-user-to-only/m-p/3193109)
- Assignment carries effort: MS Project assignment Units (% of time) — [Microsoft Support: resource units](https://support.microsoft.com/en-us/project/learn-more-about-resource-units). TeamGantt hours/day or total hours, rolled up into a per-person per-day heat map with an 8-hour overload threshold — [TeamGantt Support](https://support.teamgantt.com/article/16-team-availability)
- Role/generic placeholders (MS Project generic resources; Wrike job roles; ServiceNow Role resource type) let work be planned before a named person is known — [MSDN Resource.Type](https://msdn.microsoft.com/en-us/ms486867(v=office.14)); [Wrike community](https://help.wrike.com/hc/en-us/community/posts/115000233605-User-Groups); [ServiceNow Docs](https://www.servicenow.com/docs/r/t50FqY34BO_zQ~d4gxe26g/IvWsJKi880XSxHwzjI3gaA)

### Inferences
- Suggested minimal schema for an offline app, synthesised from the above (not taken from any one vendor):
  - `person(id, name, email?, active bool, created_at)`
  - `team(id, name, active bool)`
  - `team_member(team_id, person_id)` (optionally `role_in_team`)
  - `assignment(id, task_id, party_kind CHECK IN ('person','team'), party_id, raci CHECK IN ('R','A','C','I'), hours_per_day? or units?)`, with UNIQUE(task_id, party_kind, party_id, raci)
  - Optional `role/generic` party kind for placeholders, as in MS Project, Wrike and ServiceNow.
- Store team references unexpanded, as monday does. Expand to members only for workload and notification views. When a team is assigned with hours, decide whether hours are split across members or treated as pooled capacity: MS Project treats a generic resource as a pool, while ClickUp's group assignment makes each member an assignee.
- Deactivation: keep the row and set `active=false`. Show inactive parties greyed out on historical tasks, and exclude them from pickers (the ServiceNow pattern).
- An alternative to a polymorphic FK is a single `party` supertable (`party(id, kind)`, with `person` and `team` sharing its ID). This gives real FK integrity in SQLite.

### Gaps
- How monday, ClickUp and Smartsheet render tasks for a deactivated user was not documented in the fetched sources.
- How team-assigned hours split into per-member workload in ClickUp or monday Workload views is not verified.
