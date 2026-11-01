# RAID relationships: practice, tools, and a model for the planner

Sources: `research_notes/RAID relationships/standards_ontologies.md` and `tools_data_models.md` (2026-11-01). Tags carried over from the notes: **[SRC]/[C]** means the claim was stated in the cited source. **[C-comm]** means it comes from a community post. **[REC]/[R]** means it was recalled and not re-checked. **[INF]** means it is the notes' own inference. Recalled and inferred claims are flagged where they matter.

## 1. Bottom line

No standard defines a typed relationship graph for RAID. PMBOK, PRINCE2 and ISO 21502 define registers and process flows. Only OSLC and the W3C DPV publish formal link properties [INF, standards notes §5]. In practice the same few relationships keep recurring:
- RAID items **affect** tasks, many-to-many.
- Issues and dependencies **block** tasks.
- Actions **address** risks and issues.
- Decisions **decide** change requests, issues and risk acceptance.
- One item **turns into** another: assumption → risk → issue → change request.
- Every item has one accountable **owner**.

Tools store these links in one of three ways: a foreign key to the project, an explicit many-to-many link to tasks, or a generic typed link table. Linking at task level is the weakest part of most tools. For this planner I recommend:
- one `raid_item` table with a `type` column;
- a `raid_task` link table with three kinds (affects / blocks / delivered by);
- a `raid_link` table with four kinds (became / addresses / decides / related);
- reuse of the existing `note` table.

Converting an item should create a new item plus a `became` link. It should not change the type in place.

## 2. The relationship map

Cardinality is shown as from:to. "Common" means how often the relationship shows up across the standards and tools in the notes.

| From → To | Meaning | Inverse wording | Card. | How common | Sources |
|---|---|---|---|---|---|
| Risk/Issue/Assumption/Decision/CR → task or milestone | affects: threatens or touches this work | affected by | M:N | Present in every model, but tools often link only to the project | OSLC `affects*` [SRC]; Project Server `Risk.Tasks`↔`Task.Risks` [C]; Clarity, key tasks only [C]; ServiceNow, project only [C]; Jira Align, one object [R] |
| Issue/Dependency → task | blocks: the task can't start or finish | blocked by | M:N | Very common in tools | Jira Blocks [C]; OSLC `blocks*` [SRC] |
| Action / approved CR / risk response → task | delivered by: the work is done as plan tasks | delivers | 1:N | Standard in theory, rarely an explicit link in tools | PMBOK 11.5 "inserts resources and activities" [REC]; PRINCE2 work packages [REC]; OSLC `implementedBy` [SRC] |
| Assumption → Risk or Issue | became: invalidated, so it raises a risk | arose from | 1:N | Standards only | "An assumption that is not validated may become a risk" (PMI templates, https://www.oreilly.com/library/view/a-project-managers/9781119864509/c04.xhtml) [SRC] |
| Risk → Issue | became: the risk occurred | realises | 1:N; an issue has 0..1 source risk | The most common conversion | Same O'Reilly source [SRC]; DPV `risk:refersToRisk` (https://w3c-cg.github.io/dpv/2.3/risk) [SRC]; ServiceNow Convert, 1→N (https://www.servicenow.com/docs/r/s8BPDWDEVTaN0SLuos4GTg/nBPXFwwGwvize3LzX5~qpg) [C]; Clarity "Create Issue" [C]; Project Server `RelatedIssues` [C] |
| Issue → Change request | became / escalated to | raised from | 1:N | Common | PRINCE2 RFC is an issue type (https://open-exam-prep.com/study-guides/prince2-practitioner/practices-issues/issues-basics) [SRC]; ServiceNow, Clarity [C] |
| Issue → Risk | reclassified | — | 1:1 | Rare and contested | UIllinois PMO: close the issue, update the risk log (https://www.aits.uillinois.edu/services/professional_services/pmo/project_management_toolkit/executing__monitoring__and_controlling) [SRC]; ServiceNow forbids backward conversion [C] |
| Action → Risk | mitigates | mitigated by | M:N | Common | DPV `isMitigatedByMeasure` [SRC]; PRINCE2 actionee [SRC]; ServiceNow Associate (untyped) [C] |
| Action → Issue | resolves (workaround) | resolved by | N:1 | Common | PMBOK workaround [REC]; ISO 21502 §7.9 (https://blog.ansi.org/ansi/iso-21502-2020-project-management-guidance/) [SRC] |
| Decision → CR/Issue | decides (approve/reject/defer/concession) | decided by | 1:N | Standard, mostly implicit | PRINCE2 Change Authority [REC]; OSLC `approved` + `authorizer` (https://docs.oasis-open.org/oslc-domains/cm/v3.0/cs01/part2-change-mgt-vocab/cm-v3.0-cs01-part2-change-mgt-vocab.html) [SRC] |
| Decision → Risk | accepts or closes | accepted by | M:N | Occasional | Residual risks "deliberately accepted" (https://pmstudycircle.com/residual-risks-vs-secondary-risks/) [SRC] |
| Decision → Action | mandates | mandated by | 1:N | Implied | PROV `wasGeneratedBy` pattern [SRC pattern, INF mapping] |
| Decision → Decision | supersedes | superseded by | 1:1 | Common in decision logs | PROV `wasRevisionOf` (https://www.w3.org/TR/prov-o/) [SRC]; DC `replaces` [REC]; Confluence decision apps (https://marketplace.atlassian.com/apps/1962325789) [C] |
| Risk → Risk | secondary or residual risk | arises from | 1:N | Standards; one tool | PMBOK [SRC]; ISO 31000 §6.5 [REC]; Project Server `SubRisks` [C] |
| Dependency → Risk | creates risk | caused by | M:N | Standards only | PMBOK risk sources [REC] |
| Any ↔ Any | related (weak, symmetric) | related | M:N | The most common link in tools | OSLC `relatedChangeRequest` [SRC]; Jira Relates (https://support.atlassian.com/jira-cloud-administration/docs/configure-issue-linking/) [C]; ADO Related (https://learn.microsoft.com/en-us/azure/devops/boards/queries/link-type-reference) [C]; ServiceNow Associate (https://www.servicenow.com/docs/r/MrftC6mNgCta3UqwXSW7Kg/YXLdUf5eoQ1mzpsvmFvVXQ) [C] |
| Item → Item | duplicate of | duplicated by | N:1 | Issue trackers only | Jira, ADO [C] |
| RAID → party | owner (accountable) | owns | N:1 | Universal | PRINCE2 risk owner (https://www.prince2.com/uk/blog/the-risk-register-what-to-include-and-what-to-avoid) [SRC]; ISO Guide 73 [REC]; ServiceNow "Risk owner" [C]; Project Server `Owner` [C] |
| RAID → party | actionee / assigned to (responsible) | assigned | N:1 | Common, often the same person as the owner | PRINCE2 actionee [SRC]; https://www.gravitee.io/corpus/gen-2372/project-risk-management/project-risk-registers-owners-and-mitigation-plans.html [SRC]; ServiceNow "Assigned to", Project Server `AssignedToResource` [C] |
| RAID → project | belongs to | — | N:1 | Universal | ServiceNow `task`/`parent` field [C] |

## 3. Lifecycles per type

These state sets come from the notes' synthesis [INF], built from the sources cited.
- **Risk:** identified → assessed → response planned → monitored. It ends as occurred (an issue is created), closed (expired or proximity passed), or accepted. ROAM (resolved/owned/accepted/mitigated) is the agile variant (https://success.atlassian.com/solution-paths/quarterly-planning-guidance-with-jira-cloud/conduct-a-pi-planning-event/how-to-manage-roam-risks-with-advanced-roadmaps) [C].
- **Assumption:** open → validated, or invalidated (which raises a risk or issue).
- **Issue:** raised → assessed → decision pending. It ends as resolved, escalated, or converted to a risk or change. Conversion closes the issue [SRC, UIllinois].
- **Action:** open → in progress → done or cancelled.
- **Decision:** proposed → decided → superseded or reversed. It doesn't change once made; a new decision supersedes it.
- **Change request:** submitted → assessed → approved, rejected or deferred → implemented → closed. OSLC models this as a state plus booleans [SRC].
- **Dependency:** no standard lifecycle. Open → met or broken is a reasonable minimum [INF].

## 4. How tools store links, and how conversion works

**Storage.** There are three patterns [tools notes, synthesis]:
1. **A foreign key on the item.** ServiceNow's RIDAC records point only to the project or demand, not to WBS tasks [C]. Jira Align's single Relationship field ties a risk to one object [R].
2. **An explicit many-to-many link.** Project Server exposes `Risk.Tasks`↔`Task.Risks` and `Risk.RelatedIssues`↔`Issue.RelatedRisks` (https://learn.microsoft.com/en-us/previous-versions/office/project-odata/jj163019(v=office.15)) [C]. Its 2007 database used a generic `MSP_WssListItemAssociation` table with a relationship-type id [C]. Clarity associates risks and issues with key tasks only [C].
3. **A generic typed link table.** Jira's `issueLink` has inward/outward phrases, is stored once and is shown from both ends [C]. ADO link types carry `topology`, `directional`, `singleTarget` and `acyclic` attributes [C]. ServiceNow's Associate is many-to-many but untyped [C].

Task-level linking is the weakest point in most tools. Jira and ADO avoid the problem only because risks and tasks are the same kind of entity.

**Conversion** comes in two styles:
- **Tools with separate tables create a new record.** ServiceNow copies only three fields, converts forward only, supports one source to many targets, and can optionally close the source. History is not copied [C]. Clarity has "Create Issue / Change Request" from a risk, and the docs don't say whether it keeps a back-link [C].
- **Tools with one entity type change the type in place** and keep the ID and history. This applies to Jira, ADO and Wrike [R, unverified].

**What works best here.** Use a typed link table with a small vocabulary and inverse phrases (the Jira/ADO style). Use an explicit many-to-many link to tasks (the Project Server style). Convert by creating a new item plus a derivation link, which is the standards notes' takeaway 3 [INF]. Keeping the old risk visible as "occurred → I-004" tells the team more than a risk that silently turned into an issue. The weak point of ServiceNow's approach is lost history, and the link plus notes fixes that.

## 5. Recommended model for this app

```sql
CREATE TABLE raid_item (
  id          INTEGER PRIMARY KEY,
  project_id  INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  type        TEXT NOT NULL CHECK (type IN
                ('risk','assumption','issue','action','decision','dependency','change')),
  seq         INTEGER NOT NULL,          -- per project+type; shown as R-001, A-001, I-001, AC-001, D-001, DP-001, CR-001
  title       TEXT NOT NULL,
  description TEXT,
  state       TEXT NOT NULL DEFAULT 'open',
  owner_id    INTEGER REFERENCES party(id) ON DELETE SET NULL,
  due         TEXT,                      -- ISO date; review date for risks/assumptions
  probability INTEGER CHECK (probability BETWEEN 1 AND 5),  -- risks only
  impact      INTEGER CHECK (impact BETWEEN 1 AND 5),       -- risks, issues
  response    TEXT,     -- risk: mitigation/contingency/trigger; issue: resolution; decision: outcome + rationale
  closed_at   TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (project_id, type, seq)
);

CREATE TABLE raid_task (
  raid_id INTEGER NOT NULL REFERENCES raid_item(id) ON DELETE CASCADE,
  task_id INTEGER NOT NULL REFERENCES task(id) ON DELETE CASCADE,
  kind    TEXT NOT NULL DEFAULT 'affects'
          CHECK (kind IN ('affects','blocks','delivered_by')),
  PRIMARY KEY (raid_id, task_id, kind)
);
CREATE INDEX raid_task_by_task ON raid_task(task_id);

CREATE TABLE raid_link (
  from_id    INTEGER NOT NULL REFERENCES raid_item(id) ON DELETE CASCADE,
  to_id      INTEGER NOT NULL REFERENCES raid_item(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL CHECK (kind IN ('became','addresses','decides','related')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (from_id, to_id, kind),
  CHECK (from_id <> to_id)
);
CREATE INDEX raid_link_to ON raid_link(to_id);
```

**Allocating numbers.** Use `seq = COALESCE(MAX(seq),0)+1` for the project and type, in the same transaction as the insert. Never reuse a number. The display key is computed as prefix + `printf('%03d', seq)`.

**States, enforced in app code** (a CHECK across type and state pairs would be unwieldy):
- risk: open / accepted / occurred / closed
- assumption: open / validated / invalid
- issue: open / resolved
- action: open / done / cancelled
- decision: proposed / decided / superseded
- dependency: open / met / broken
- change: proposed / approved / rejected / done

Every other state counts as closed and sets `closed_at`. The risk score is computed on read as `probability*impact`.

**Link vocabulary** (direction from → to, with allowed pairs checked in code):
- **became** / "came from": assumption→risk or issue, risk→issue, issue→change or risk, decision→decision (shown as "superseded by"). This one link kind covers derivation, materialisation and supersession, as PROV `wasDerivedFrom` and `wasRevisionOf` do.
- **addresses** / "addressed by": action or change → risk or issue. This covers mitigates and resolves.
- **decides** / "decided by": decision → change, issue, risk or action.
- **related**: symmetric. Store it with `from_id < to_id` and query both columns.

**Task link kinds:**
- **affects** / "affected by": any type.
- **blocks** / "blocked by": issue or dependency.
- **delivered_by** / "delivers": action or change. The task is the work that carries the item out, following PMBOK 11.5 [REC].

Milestones are covered if they are rows in `task`.

**Dependencies.** Task-to-task logic stays in `dep`. A RAID `dependency` is only for things outside the plan, such as a vendor, another team or an approval, linked to tasks with `blocks`. Tools treat dependencies almost entirely as task-to-task links. Jira Align is the exception [R].

**Owner and actionee.** Keep one `owner_id`. When the actionee differs from the owner, create an action item with its own owner and link it with `addresses` to the risk. That keeps PRINCE2's owner/actionee split [SRC] without adding a second column.

**Notes.** Reuse `note`. Add `raid_id INTEGER REFERENCES raid_item(id) ON DELETE CASCADE` with `CHECK ((task_id IS NULL) <> (raid_id IS NULL))`. If `task_id` is NOT NULL today, rebuild the table using SQLite's create-copy-rename procedure. A separate `raid_note` table would duplicate the note UI.

**Conversion rule.** "Convert" does these steps in one transaction:
1. Create a new item of the target type with the next number.
2. Copy title, description and owner.
3. Copy the `affects` and `blocks` task links.
4. Insert `became` (old → new).
5. Set the old item to its terminal state (risk→occurred, assumption→invalid, issue→resolved, decision→superseded) and stamp `closed_at`.
6. Add a system note on both items, e.g. "Converted to I-004" and "Came from R-002".

One source can become several targets. The type is edited directly only while an item has no links and no notes, which covers fixing a misfiled entry.

**The task record's RAID tab:**
- Shows items linked through `raid_task` for this task, grouped as **Blocked by**, **Affected by** and **Delivers**.
- Each row shows key, type badge, title, state, owner, due date and P×I score for risks.
- Open items come first, and closed ones are collapsed.
- A toggle, "include subtasks", walks `parent_id` with a recursive CTE. It is useful on summary tasks.
- Buttons: "Link existing…" (with a kind picker) and "New risk / issue / action…", which pre-links to the task.
- Clicking a row opens the item, where its `raid_link` neighbours appear under inverse phrases ("Addressed by AC-003", "Came from A-001").
- A project-level register view, filtered by type and state, is needed alongside the tab.

**Leave out of v1:**
- Separate trigger, contingency, fallback and response-strategy fields. Fold them into `response`. Only Project Server, ADO CMMI and Clarity have these fields [C/R].
- Secondary/residual-risk and sub-risk hierarchy. Use `became` or `related`.
- A second actionee column.
- Cost and exposure money fields, and proximity.
- `duplicate_of`. Close one item and add `related`.
- Attributes on links, such as impact per task.
- Links across projects.
- Daily-log promotion, exception reports, approval workflow, and an audit or history table. Notes cover history.

## 6. Open questions to confirm

1. Should `dependency` be a RAID type at all, limited to external dependencies, or should dependencies live only in `dep`?
2. Are the prefixes right (R/A/I/AC/D/DP/CR, numbered per type), or would you prefer one sequence per project?
3. Should probability and impact use a 1–5 scale or a 3-point H/M/L scale?
4. Is one owner per item enough, or do you also want decision makers and the counterparty of a dependency recorded as parties?

_Note: milestones are already rows in `task` (`kind = 'milestone'`), so `raid_task` covers them with no extra work._
