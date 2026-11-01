# RAID items in real PM tools: data models and links

Researched 2026-11-01. Legend: **[C]** = confirmed in vendor docs/API reference (URL given); **[C-comm]** = from a community/forum post, not vendor docs; **[R]** = recalled from my own knowledge, not re-verified, so treat as a hypothesis.

---

## 1. ServiceNow SPM/PPM ("RIDAC")

**Entities.** ServiceNow calls the set RIDAC: Risk, Issue, Decision, Action, Request Change. All belong to a project or demand.
- Table names [R + C-comm]: `risk`, `issue`, `project_action`, `dmn_decision`, `project_change_request`.
  - A community post says `dmn_decision` holds project decisions in PPM. https://www.servicenow.com/community/developer-forum/what-is-dmn-decision-table-and-use-of-it/m-p/2664416
  - Another says `risk` (SPM) is a different table from `sn_risk_risk` (IRM/GRC). https://www.servicenow.com/community/grc-forum/two-different-risks-tables-in-servicenow/m-p/3608022
  - The official docs don't name these tables. Check `sys_db_object` on an instance.

**Fields [C]** (RIDAC form fields, Australia release): https://www.servicenow.com/docs/r/4~5Anqt12idfVzJWPcxoHw/NZ7fS4IO3diiF8H8z~VP7w
- **Risk:**
  - Number, State, Risk status
  - Probability (Absolute/High/Moderate/Low), Impact (High/Medium/Low)
  - Risk rank: calculated, colour set by Risk Value Lookup. Risk value.
  - Estimated cost, Actual cost
  - Risk owner, Assigned to, Due date
  - Mitigation plan
  - Show on project status report
  - **Task**: reference to the owning project or demand
  - Assessment summary: Inherent risk, Residual risk, *Elevated to enterprise risk*, Enterprise inherent/residual risk. This links project risk to IRM.
  - No trigger field and no response-strategy field.
- **Issue:** State, Priority, Impact, Estimated cost, Due date, Assigned to, **Parent** (the project), Work notes.
- **Decision:** as Issue, plus Decision status and Approval required.
- **Action:** as Issue, plus Approval.
- **Request Change:** as Action, plus Category and Business Justification.
- Risk form page: https://www.servicenow.com/docs/r/Urgv8z109EjxWLyYw1_~nA/BGO02_lxZ8fHV_CbjuE4nA

**Links to tasks.**
- Each RIDAC record has one reference field (`task` or `parent`) that points to the **project/demand, not to a project task or WBS item** [C].
- The docs don't mention an OOB link from a RIDAC record to a `pm_project_task`.
- The project form shows each RIDAC type as a related list. Workspace has a single "RIDAC" page per project [C].
- I'm not aware of any RIDAC related list on project tasks [R].

**RIDAC-to-RIDAC links [C].**
- **Convert:** use the "Convert to RIDAC" related link, or the icon in Project Workspace.
  - Conversion only goes forward in the sequence. A Risk can become Issue/Decision/Action/Request Change. An Issue can't become a Risk, and a Decision can't become an Issue.
  - One record can convert into many, e.g. several issues from one risk.
  - Only Short description, Requester and Assigned to carry over. Work notes, probability and similar fields don't, so **history is not copied**.
  - Optional "Close <parent>" checkbox closes the source record.
  - "View RIDAC" on the project lists converted records, which implies the source-target pair is stored somewhere. The docs don't name the table.
  - Requires role `it_project_manager`.
  - https://www.servicenow.com/docs/r/s8BPDWDEVTaN0SLuos4GTg/nBPXFwwGwvize3LzX5~qpg
  - https://www.servicenow.com/docs/r/MrftC6mNgCta3UqwXSW7Kg/em7EJMSYV4ndK7ulTUT5lA
- **Associate:** use the "Associate RIDAC" related link or row menu.
  - Links existing records, many-to-many. Example: one issue linked to several risks, decisions, actions or change requests.
  - The link is untyped: there's no relationship label.
  - A community post says both records must belong to the same demand or project [C-comm].
  - The m2m table name is not in the docs. https://www.servicenow.com/docs/r/MrftC6mNgCta3UqwXSW7Kg/YXLdUf5eoQ1mzpsvmFvVXQ
- The same Convert and Associate features exist for demands [C].

---

## 2. Jira (Cloud/DC), Jira Plans (Advanced Roadmaps), Jira Align

**Jira core.**
- There's no RAID entity. Risks, decisions etc. are custom **issue types** in a project, with custom fields and workflow statuses [C-comm/R].
- **Generic link table [C]:**
  - A link is `issueLink {type{name, inward, outward}, inwardIssue, outwardIssue}`. It is stored once and shown from both ends.
  - Default types: **Blocks** (blocks / is blocked by), **Cloners** (clones / is cloned by), **Duplicate** (duplicates / is duplicated by), **Relates** (relates to).
  - Admins can add custom types, e.g. "causes / is caused by". JSM ships *Problem/Incident* (causes / is caused by).
  - Many-to-many with no cardinality limits. The "Link Issues" permission is required.
  - https://support.atlassian.com/jira-cloud-administration/docs/configure-issue-linking/
  - https://confluence.atlassian.com/adminjiraserver/configuring-issue-linking-938847862.html
- Remote links (Confluence pages, URLs) are a separate entity [R].
- The issue view shows a "Linked issues" panel grouped by link phrase. Parent/child uses the separate `parent` field (Epic → Story → Subtask), not issue links [R].
- **Conversion:** "Move" or change issue type keeps the same key, history and comments [R]. So a Risk issue becoming an Issue/Bug keeps its history if both types are in one project. "Clone + link" is the alternative.

**Jira Plans (Advanced Roadmaps) [C].**
- Dependencies are just issue links. The default dependency link type is **Blocks**, and the admin can choose which link types count as dependencies, instance-wide.
- https://confluence.atlassian.com/jirasoftwareserver/configure-your-advanced-roadmaps-plan-settings-1044784158.html
- Atlassian's PI-planning guidance:
  - Make Risk an issue type on a "risk board" with ROAM columns (statuses Resolved/Owned/Accepted/Mitigated).
  - Link each risk to its feature with **"relates to"**.
  - https://success.atlassian.com/solution-paths/quarterly-planning-guidance-with-jira-cloud/conduct-a-pi-planning-event/how-to-manage-roam-risks-with-advanced-roadmaps

**Jira Align.**
- Risk is a first-class object. Resolution Method uses **ROAM**, and Owner plus Resolution Method are mandatory, depending on state [C-comm]. https://community.atlassian.com/forums/Jira-Align-questions/Why-do-Risks-in-Jira-Align-require-Owner-and-Resolution-Method/qaq-p/1718865
- **Relationship** + **Relationship Item** columns tie a risk to one object, e.g. an Epic [C-comm].
- Fields [R]: Consequence, Occurrence (probability), Impact, Criticality, Mitigation/Contingency, Target resolution date, Program/PI. Filter requests for impact, occurrence and critical path confirm some of these names [C]: https://jira.atlassian.com/browse/JIRAALIGN-5099
- **Cardinality:** a single Relationship field means **one risk links to one work object**. That's an FK on the risk, not m2m [R].
- Jira Align has a separate **Dependency** object between teams/programs, with requesting and depended-on parties [R].
- There's a Risk ROAM report at program level [C]: https://jira.atlassian.com/browse/JIRAALIGN-7529

---

## 3. Azure DevOps (Boards)

**Entities [R].**
- The **CMMI** process ships Risk, Issue, Change Request, Review and Requirement work item types (WITs).
- The Agile process has Issue. Scrum has Impediment.
- CMMI Risk fields [R]: Severity, Probability, Priority, Mitigation Plan, Contingency Plan, Mitigation Triggers, Assigned To, State (Proposed/Active/Resolved/Closed).
- Decisions and assumptions aren't OOB. They're custom WITs.

**Links: a generic typed link table [C].** https://learn.microsoft.com/en-us/azure/devops/boards/queries/link-type-reference

| Link (fwd/rev) | Ref name | Topology | Rules |
|---|---|---|---|
| Child/Parent | System.LinkTypes.Hierarchy | Tree | **only one Parent**, no cycles, same project |
| Related | System.LinkTypes.Related | Network | non-directional, cross-project |
| Successor/Predecessor | System.LinkTypes.Dependency | Dependency | directional, cycles rejected |
| Duplicate/Duplicate Of | System.LinkTypes.Duplicate | Tree | |
| **Affects/Affected by** (CMMI only) | Microsoft.VSTS.Common.Affects | Dependency | "track change requests linked to requirements"; a CR Affects **only one** requirement, a requirement can be Affected by many |
| Tested By/Tests | Microsoft.VSTS.Common.TestedBy | Dependency | test cases ↔ backlog items |
| Produces For/Consumes From, Remote Related | System.LinkTypes.Remote.* | Dependency/Network | across orgs |

- Link-type attributes: `acyclic`, `directional`, `singleTarget`, `topology`, `remote` [C].
- Custom link types are on-prem only, via `witadmin` [C].
- The *Related Link Count* field counts work links [C].
- **Surfaced on the task:**
  - The Links tab, grouped by link type.
  - The "Related Work" control on the form.
  - The Development control for commits and PRs [R].
- **Conversion:** "Change type" keeps the same ID, history and links [R]. So a Risk becoming an Issue keeps full history.

---

## 4. Microsoft Project Server / Project Online (PWA + SharePoint project site)

**Entities.**
- **Risks** and **Issues** are SharePoint lists on each project site, as are Deliverables and Documents [C].
- Reporting syncs on project publish. Only OOB list fields reach the reporting DB, not custom columns [C, MPUG forum]. https://mpug.com/forums/topic/reporting-on-risks-issues-and-deliverables
- Project Online retires **2026-09-30**. Project Server Subscription Edition continues [C, multiple sources]: https://www.velosio.com/blog/microsoft-project-online-retirement-what-to-do-before-september-30-2026/

**Risk fields [C]** (ProjectData OData `Risk` entity). https://learn.microsoft.com/en-us/previous-versions/office/project-odata/jj163019(v=office.15)
- Title, Status, Category, Owner, AssignedToResource, DueDate, Description
- **Probability** (%), **Impact**, **Exposure** (= P × I), Cost, CostExposure (= Cost × P)
- **MitigationPlan**, **ContingencyPlan**, **TriggerDescription**, **TriggerTask** (trigger condition)
- Issue entity [R]: Priority, Category, Status, Owner, DueDate, Discussion, Resolution.

**Navigation properties: true M:N [C].**
- `Risk.Tasks` ↔ `Task.Risks` (Risk_Tasks_Task_Risks)
- `Risk.RelatedIssues` ↔ `Issue.RelatedRisks`
- `Risk.SubRisks`, a self-hierarchy. Issues have an analogous SubIssues [R].
- The 2007 RDB stored these in `MSP_WssRisk`, `MSP_WssIssue` and a generic **`MSP_WssListItemAssociation`** (item ↔ item + relationship-type id) [C]. https://msdn2.microsoft.com/en-us/bb428826(v=office.12)
- Linking UI: "Add Related Item" from a risk, issue, document or deliverable picks project-site Tasks, or the reverse direction from a task [C]. It writes to the "Related Items" field of the list item [R]. https://support.microsoft.com/en-US/project/link-risks-issues-files-or-deliverables-to-tasks
- **Surfaced on the task:** related items show on the project-site task item. PWA Schedule views had Issues/Risks indicator columns [R].
- **Conversion:** none OOB. You create a new item and relate it [R].

---

## 5. Planner (Premium) / Project for the web

- There's no native risk, issue or decision entity [R].
- Premium adds dependencies (FS/SS/FF/SF, task-to-task), portfolios, baselines and goals. Risks were only modelled via Dataverse customisations or a Power Apps "Project accelerator" sample. https://github.com/microsoft/Project-Accelerator [R]
- Vendor blogs note that risks and issues stay plan-local with no portfolio roll-up [C-comm; vendor bias]: https://www.proggio.com/blog/project-online-2026-eol-alternatives/
- Implication: there's no reference design here beyond task dependencies.

---

## 6. Planview / Clarity PPM

**Entities [C].**
- "RIC" = Risks, Issues, Change Requests, as sub-objects of Project.
- Risk probability drives *exposure*. Score colour is set by lookup. https://knowledge.broadcom.com/external/article?articleId=27099
- DB [R]: one table `RIM_RISKS_AND_ISSUES` holds all three, discriminated by type. Supporting tables include `RIM_RISK_FACTORS`.
- Fields [R]: Owner, Status, Priority, Category, Probability, Impact, Response Strategy (Accept/Avoid/Mitigate/Transfer), Target resolution date, Mitigation/Contingency (Action Items), Impact Date, Assumptions.

**Links to tasks [C].**
- Risks and issues can be associated **only with key tasks**.
- The task shows read-only "Task Associated Risks" and "Task Associated Issues" pages.
- Cardinality isn't stated. In practice it's M:N via an association table [R].
- https://ftpdocs.broadcom.com/cadocs/0/CA%20Clarity%20PPM%2012%201%200-ENU/Bookshelf_Files/HTML/ProjectManagement/420231.html

**RIC-to-RIC [C].**
- "Create Issue / Create Change Request" from a Risk exists in Classic UX. Modern UX added it in **16.2.1**, enabled per blueprint (right-click a RIC).
- The docs don't say whether a back-link or history is kept. https://knowledge.broadcom.com/external/article/192078/clarity-ppm-modern-ux-can-you-create-an.html
- Classic RIC also had Associations tabs linking risks ↔ issues ↔ CRs [R].
- Planview AdaptiveWork models these as "Case types" (Risk, Issue, Change Request). Risk rating = Impact × %Probability, calculated and read-only [C]. https://success.planview.com/Planview_AdaptiveWork/Working_in_AdaptiveWork/Cases/Case_Types
- AdaptiveWork has generic "Related Links / Dependencies" [R].

---

## 7. Smartsheet

- RAID is a template, not an entity. One sheet with a "RAID category" column, or separate sheets.
- Template columns: category, description, impact, priority, owner, status, mitigation, due date [C]. https://www.smartsheet.com/content/raid-templates
- Community pain points [C-comm]: type-specific columns (likelihood/severity apply only to risks) force "N/A" automation. Choosing one wide sheet vs many sheets is a trade-off. https://community.smartsheet.com/discussion/comment/310875
- Linking to plan rows [R]:
  - **Cell links** (one-way value copy).
  - Cross-sheet formulas (INDEX/MATCH on row ID).
  - Hyperlinks to a row.
  - The Predecessors column works **within one sheet only**.
  - There's no first-class row-to-row relationship across sheets.
  - Control Center/Dynamic View help with roll-up.

---

## 8. monday.com

- There's no official RAID template. A community thread complains it's missing [C-comm]. https://community.monday.com/t/monday-com-does-not-have-a-raid-log-template-risks-issues-actions-depdencies/112771
- **Connect Boards column** (API type `board_relation`) [C]:
  - An item-to-item M:N link across boards. It can link to multiple boards and is optionally two-way.
  - The **Mirror column** (`mirror`) displays fields of the linked items, e.g. a risk's status on the task.
  - A mirror needs a connect column first. The item name can't be mirrored.
  - The number of connect columns per board is plan-limited.
  - https://support.monday.com/hc/en-us/articles/360001733859
  - https://developer.monday.com/api-reference/reference/mirror
- **Dependency column** (`dependency`): task-to-task on the **same board** [R].
- Typical RAID build: a Risks board with a connect column to Project tasks, plus mirror columns both ways. Links are untyped. Link semantics come from which column you use, e.g. "Mitigated by" vs "Impacts tasks" as separate connect columns [R].
- No conversion. Automations can "create item in board X and connect" [R].

---

## 9. Asana

- RAID is a project template. Sections are planning-phase vs post-kickoff. Custom fields include RAID category, impact, status and mitigation [C]. https://asana.com/templates/raid-log.md · Risk register template: https://asana.com/templates/risk-register
- Task types are task, milestone and approval only [R]. A RAID item is a task.
- Task links [C]:
  - **Dependencies** (blocking / blocked by) are M:N. One task can depend on many and vice versa. They notify on completion or reschedule. https://help.asana.com/s/article/task-dependencies
  - **Multi-homing:** one task lives in several projects, so a risk task can sit in the RAID project and the delivery project at once [C].
- No typed relation beyond dependencies, subtasks and @-mentions. Asana does let you convert a task to a project, milestone or approval [R].

---

## 10. Wrike

- **Custom Item Types** (Business+ plans) are used for Risk, with fields for probability, impact, category and response. A table view acts as the risk register, with a calculated severity field [C-comm]. https://help.wrike.com/hc/en-us/community/posts/10596571670551
- Custom item types are configurable work items with their own fields, layout, automation and blueprints. They can be cross-tagged into multiple folders/projects [C]. https://wrike.com/blog/faq-custom-item-types
- Links [R]:
  - Dependencies (FS/SS/FF/SF) between any items, including custom types.
  - Subitems.
  - Cross-tagging (one item in many locations).
  - No generic typed "related" link.
  - "Change item type" converts in place and keeps history.

---

## 11. Confluence decision logs

- **Decisions blueprint** [C]:
  - One page per decision, with a Page Properties table: Status (Not started / In process / Decided), Stakeholders, Owner, Due date, Outcome, Background.
  - The first use creates an **index page = Decision Log**: a Page Properties Report filtered by label.
  - No decided-date field is built in. Add a row yourself.
  - https://confluence.atlassian.com/doc/decisions-blueprint-339739406.html
- Inline "/decision" items exist inside pages [R]. Links to Jira are via the Jira issue macro/smart links, which creates a remote link on the issue [R].
- Marketplace apps add statuses (proposed / accepted / superseded / deprecated), status history, and "link decision to Jira issues" [C]. https://marketplace.atlassian.com/apps/1962325789

---

## Cross-tool patterns (synthesis)

1. **Three link-storage patterns:**
   - (a) **FK on the RAID item** to its container (ServiceNow `task`/`parent` → project) or to a single work object (Jira Align Relationship).
   - (b) **Explicit M:N** risk ↔ task and risk ↔ issue (Project Server ProjectData navigation props; Clarity task associations).
   - (c) **Generic typed link table** (Jira issueLink, ADO WorkItemLinks with topology/cardinality attributes; ServiceNow's associate m2m, which is untyped).
2. **Task-level linkage is the weakest spot:**
   - ServiceNow links RIDAC to the project, not WBS tasks.
   - Clarity allows key tasks only.
   - Project Server is the cleanest risk ↔ task M:N.
   - Jira and ADO get it "for free" because risks and tasks are the same entity class.
3. **Conversion semantics:**
   - Separate-table tools (ServiceNow, Clarity) **create a new record** and copy a few fields: ServiceNow copies 3 fields, is forward-only, can close the parent, and supports 1→N.
   - Same-entity tools (Jira, ADO, Wrike) **change type in place**, keeping ID and history.
4. **Typed link semantics worth borrowing:**
   - ADO's `singleTarget`, `acyclic` and `topology` attributes.
   - Affects (CR → one requirement).
   - Jira's inward/outward phrase pairs.
   - JSM's causes / is caused by.
5. **Dependencies** are almost always task-to-task links (Blocks, Predecessor) rather than RAID records. Jira Align is the exception, with a Dependency object.
6. **Common risk fields:**
   - Probability + Impact → computed Exposure/Rank.
   - Owner, Status, Due date, Mitigation.
   - Contingency and Trigger appear only in Project Server, ADO CMMI and Clarity.
   - Response strategy (Accept/Avoid/Mitigate/Transfer) is explicit only in Clarity [R]. ServiceNow lacks it. Jira Align uses ROAM instead.
