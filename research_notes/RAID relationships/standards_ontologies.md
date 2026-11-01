# RAID items and their relationships: standards and ontologies

Researched 2026-11-01. **Legend:** [SRC] = stated in the cited source (fetched, or quoted by a secondary source that cites the standard). [REC] = recalled from the standard's text but not re-fetched this session, so check against the book. [INF] = my inference or synthesis. PMBOK, PRINCE2 and ISO texts are paywalled. Most citations below are therefore secondary sources (study guides, forums). The OSLC, IFC, PROV and DPV texts were read from the primary specs.

---

## 1. PMI: PMBOK 6th/7th edition and the Practice Standard for Project Risk Management

### Artifacts (logs and registers)
- [SRC] PMBOK 7 lists these logs and registers: assumption log, backlog, change log, issue log, lessons learned register, risk-adjusted backlog, risk register, stakeholder register. A Wiley PM templates book also adds a **decision log**. The backlog is "used primarily for Agile projects", and the change log "primarily for predictive projects". https://www.oreilly.com/library/view/a-project-managers/9781119864509/c04.xhtml
- [REC] PMBOK 6 has no formal "decision log" artifact. Decisions are recorded in the change log (for change control decisions), in the issue log (resolution), in meeting minutes, and in the risk register (chosen responses). [INF] So "Decision" as a RAID letter is a practitioner convention, not a PMBOK 6 artifact.
- [SRC] Issue log: "a project document used to document and monitor elements under discussion or in dispute between project stakeholders". In agile it is also called an *impediment log*. https://www.projectmanagement.com/discussion-topic/52843/-Issues--and--Issue-Log---a-decisive-component-of-Risk-Mgmt---Comm--Plan--Conflict-Mgmt---or-PMBOK-s-entirety-
- [REC] Assumption log: records all assumptions and constraints throughout the project life cycle. Change log: a full list of submitted changes and their status (output of Perform Integrated Change Control, 4.6).
- [SRC] The assumption log "should be used to augment your risk register", never replace it. "An assumption that is not validated may become a risk. A risk that occurs may be considered an issue." (Wiley templates book, same O'Reilly URL.)

### Risk register contents and response linkage
- [REC] PMBOK 6, 11.5 Plan Risk Responses: the process "inserts resources and activities into the budget, schedule and project management plan as needed". Its outputs are **change requests**, PM plan updates (schedule, cost and scope baselines), and project document updates (assumption log, risk register, project schedule, team assignments, risk report).
- [REC] Fields added to the risk register after response planning: agreed strategies, specific actions to implement the chosen strategy, **trigger conditions**, symptoms and warning signs, budget and schedule activities required, contingency plans and their triggers, fallback plans, **residual risks**, **secondary risks**, contingency reserves, and the risk owner and assigned responsibilities.
- [REC] 11.6 Implement Risk Responses produces change requests and updates to the issue log, lessons register, team assignments and risk register. 11.7 Monitor Risks produces work performance information, change requests, and updates to the assumption log, issue log, lessons register and risk register.
- [SRC] Secondary risks are "risks that arise as a direct result of implementing a risk response". Residual risks are "those risks that are expected to remain after the planned responses ... as well as those that have been deliberately accepted". https://pmstudycircle.com/residual-risks-vs-secondary-risks/
- [SRC] Trigger condition: "an event or a situation that indicates that a risk is about to occur". The risk owner implements the response plan and monitors the risk and its secondary risks. https://www.dummies.com/article/plan-risk-response-outputs-you-should-know-for-the-pmp-certification-exam-160356
- [SRC] Practitioner distinction between roles. The *risk owner* is "accountable for the overall response and residual exposure". The *action owner* is responsible for completing a specific mitigation activity. https://www.gravitee.io/corpus/gen-2372/project-risk-management/project-risk-registers-owners-and-mitigation-plans.html
- [SRC] Contingency plans are made in advance for accepted risks. A fallback plan is used when the contingency fails. A *workaround* is an unplanned response to a risk that occurred and was not planned for, or was passively accepted. https://www.projectmanagement.com/discussion-topic/90844/what-is-the-difference-between-workaround-plan--contigency-plan---fallback-plan---
- [REC] PMBOK 6 glossary: a workaround is a response to a threat that has occurred, for which no prior response was planned or the response was not effective. [INF] This is the PMBOK mechanism for risk → issue: a realised threat leaves the risk register, gets an issue log entry, and is resolved by a workaround (action) or a change request.

### Implied PMI relationship model [INF]
`Assumption --(invalidated → raises)--> Risk --(trigger fires / occurs)--> Issue --(resolved by)--> Action/Workaround | Change Request --(approved in ICC → recorded in)--> Change Log --(updates)--> baselines/WBS/schedule activities`. A risk response becomes a set of schedule activities (work packages) plus reserve. Secondary and residual risks are child risks of the response or the original risk.

---

## 2. PRINCE2 (2017 / v6, and PRINCE2 7, 2023)

- [SRC] v6 issue types: **request for change** (a proposal to change a baseline), **off-specification** (something that should be provided but is not, or is forecast not to be: a product not meeting its Product Description), and **problem/concern**. https://open-exam-prep.com/study-guides/prince2-7-foundation/practices-risk-change-progress/issue-practice
- [SRC] PRINCE2 7 lists five issue types: problem/concern, **external event**, **business opportunity**, request for change, off-specification. RFCs and off-specs are "baseline-impacting" and go to change control. The others "may or may not become changes". Test: does it change something already agreed (stage plan, Product Description, project plan, business case)? https://open-exam-prep.com/study-guides/prince2-practitioner/practices-issues/issues-basics
- [SRC] Daily Log: informal and owned by the Project Manager. Items are closed informally or "promoted to the Issue Register or Risk Register". An Issue Report holds "the description, impact assessment and recommendations for a request for change, off-specification or a problem/concern", and is created only for issues handled formally. https://open-exam-prep.com/study-guides/prince2-7-foundation/practices-risk-change-progress/management-reports-records
- [SRC] PRINCE2 7 groups the daily log, issue register, lessons log, product register, quality register and risk register into one **Project Log**. https://open-exam-prep.com/study-guides/prince2-practitioner/tailoring-products-exam-technique/management-products-logs
- [SRC] Roles: the **risk owner** is accountable for managing the risk. The **risk actionee** carries out the agreed response "on the owner's behalf" and may be the same person. Risk register fields include cause, event, effect, owner, response, status and **proximity**. https://www.prince2.com/uk/blog/the-risk-register-what-to-include-and-what-to-avoid and https://open-exam-prep.com/study-guides/prince2-practitioner/practices-quality-risk/risk-approach
- [REC] The **Change Authority** (or Project Board) decides on RFCs (approve, reject, defer, request more information) and on off-specs (grant a **concession**, i.e. accept without correction). If a decision would breach stage or project tolerance, the PM raises an **Exception Report**, which leads to an Exception Plan.
- [REC] Approved changes are implemented through new or revised **Work Packages**, which reference Product Descriptions. A work package lists its products, tolerances, and links to the Issue and Risk Registers, and Team Managers raise issues and risks against it. Off-specs always refer to a specific **product**. Lessons go to the Lessons Log.
- [INF] PRINCE2 relationships: `Daily Log entry --promoted to--> Issue | Risk`. `Issue(RFC/off-spec) --assessed in--> Issue Report --decided by--> Change Authority (decision) --implemented via--> Work Package --produces--> Product`. `Off-spec --concerns--> Product`. `Issue|Risk --forecast tolerance breach--> Exception Report`. Risk responses with actionees become work package activities. PRINCE2 has no "Decision log" or "Assumption log". Decisions sit in the Issue Register, the Daily Log, and Project Board records. Assumptions are in the Business Case and PID.

---

## 3. ISO standards

- [SRC] ISO 31000:2018 defines risk as the "effect of uncertainty on objectives". Note 1 says an effect "is a deviation from the expected. It can be positive, negative or both, and can address, create or result in opportunities and threats". The standard was confirmed in 2023 without revision. https://www.era.europa.eu/era-railway-terminology-collection/risk/term_2/sms_safety_culture_human_and_organisational_factor ; https://ecampusontario.pressbooks.pub/riskmgmtsupplychain/chapter/3-2-iso-310002018/
- [REC] ISO 31000 6.5 says risk treatment "can also introduce new risks that need to be managed" (the ISO equivalent of a secondary risk). Treatment plans should state the people accountable, the actions, resources, timeline, monitoring and reporting. ISO Guide 73 defines risk owner as the "person or entity with the accountability and authority to manage a risk", and defines residual risk as the "risk remaining after risk treatment". The treatment options are avoid, remove the source, change likelihood, change consequences, share, or retain.
- [SRC] ISO 21502:2020 has separate practice clauses: 7.8 risk management (identify, assess, treat, control), **7.9 issues management** (identify, resolve), and **7.10 change control** (framework, identify and assess change requests, plan implementation, implement and close). I found no "decision log" or "assumption log" clause. https://iteh.es/catalog/standards/iso/f3deaa3a-e424-42fe-aa82-99fad5c395f5/iso-21502-2020 ; https://blog.ansi.org/ansi/iso-21502-2020-project-management-guidance/
- [INF] ISO 21500/21502 treats risk, issue and change as three linked control processes with registers, and leaves the data model to the organisation. It does not define relationship types.
- [SRC] Practice note from a university PMO: "If an issue is deemed a risk or a change, the issue should be closed ... and the Risk or Change log updated". https://www.aits.uillinois.edu/services/professional_services/pmo/project_management_toolkit/executing__monitoring__and_controlling

---

## 4. Formal ontologies and vocabularies

### OSLC Change Management 3.0 (OASIS CS01, 2018): the most concrete link vocabulary found
https://docs.oasis-open.org/oslc-domains/cm/v3.0/cs01/part2-change-mgt-vocab/cm-v3.0-cs01-part2-change-mgt-vocab.html
- [SRC] Classes: `oslc_cm:ChangeRequest` (superclass), with subclasses `Defect`, `Enhancement`, `Task` ("trackable activity for assigned work ... within a set time"), `ReviewTask`, and `ChangeNotice`. There is **no Risk class**.
- [SRC] Link properties, all **zero-or-many**: `affectedByDefect` (→Defect), `affectsPlanItem` (→ plan item such as a release or sprint), `affectsRequirement`, `implementsRequirement`, `tracksRequirement`, `tracksChangeSet`, `parent` (→ChangeRequest; only parent is defined, there is no child property), `relatedChangeRequest` ("loose link with no specific meaning"). Archaic, for QM: `affectsTestResult`, `blocksTestExecutionRecord`, `testedByTestCase`. Also `authorizer` (→foaf:Agent).
- [SRC] Lifecycle: `state` (0..1, server-defined enumeration) plus orthogonal booleans `approved`, `reviewed`, `inProgress`, `fixed`, `verified`, `closed`, and `closeDate`. Rule: if `inProgress` is true then `fixed` and `closed` must be false.
- [SRC] OSLC RM 2.1 inverse-style links: `affectedBy` ("requirement affected by a defect"), `implementedBy`, `trackedBy` ("object tracks or governs the evolution of the subject, such as a requirement tracked by a change request"), `validatedBy`, `satisfiedBy`/`satisfies`, `decomposedBy`/`decomposes`, `constrainedBy`/`constrains`, `elaboratedBy`, `specifiedBy`, `uses`. https://docs.oasis-open-projects.org/oslc-op/rm/v2.1/os/requirements-management-vocab.html
- [INF] OSLC naming conventions are a good template: directional verbs (`affects*`, `implements*`, `tracks*`, `blocks*`), many-to-many by default, a weak `related*` link, a single `parent` link for hierarchy, and lifecycle as orthogonal booleans plus a state enumeration.

### IFC (buildingSMART IFC4.3)
- [SRC] `IfcActionRequest` (a subtype of IfcControl) is "the act or instance of asking for something" (RFI, bid, performance of work). Status values: Hold, NoAction, Schedule, Urgent. It uses `IfcRelAssociatesApproval` for approvals (hierarchical sub-approvals) and is nested into follow-up requests "in order of issue". https://raw.githubusercontent.com/buildingSMART/IFC4.3.x-development/master/docs/schemas/shared/IfcSharedMgmtElements/Entities/IfcActionRequest.md
- [SRC] `IfcRelAssignsToControl` is an objectified relationship linking a control (IfcControl subtype) to other objects (non-controls). https://raw.githubusercontent.com/buildingSMART/IFC4.3.x-development/master/docs/schemas/core/IfcKernel/Entities/IfcRelAssignsToControl.md
- [REC] Other IfcControl subtypes: IfcWorkSchedule/IfcWorkPlan (control IfcTask through IfcRelAssignsToControl), IfcWorkCalendar, IfcCostSchedule, IfcPermit, IfcProjectOrder (change order, work order), and IfcPerformanceHistory. IfcTask nests through IfcRelNests and sequences through `IfcRelSequence` (FS/SS/FF/SF with lag), which is the formal dependency model. IFC has no risk or issue entity. Practitioners use IfcActionRequest and IfcProjectOrder(CHANGEORDER), or property sets.
- [INF] IFC pattern worth borrowing: links are *objectified relationships* (reified, so they can carry attributes) and are 1:N (one relating control → many related objects).

### W3C DPV (Data Privacy Vocabulary) RISK extension: the best OWL risk-relationship model found
https://w3c-cg.github.io/dpv/2.3/risk
- [SRC] `dpv:hasRisk` (context → risk), `dpv:hasConsequence`, `dpv:hasImpact`/`hasImpactOn`, `dpv:isMitigatedByMeasure`, `dpv:hasResidualRisk`/`isResidualRiskOf`, `dpv:hasLikelihood`/`hasSeverity`/`hasRiskLevel`, `risk:hasRiskSource`, `risk:mitigates`, `risk:hasControl`, and **`risk:refersToRisk` (an incident refers to a previously identified risk)**. The last is the formal analogue of an issue materialised from a risk.
- [SRC] Incident status values: Suspected, Ongoing, Halted, Mitigated, Terminated, Concluded, NearMiss, Unknown. Investigation status values: NotStarted, Preliminary, Ongoing, Completed.

### W3C PROV-O (derivation / supersession) https://www.w3.org/TR/prov-o/
- [SRC] `prov:wasDerivedFrom` (an entity "transformed into", "updated into", or "built from" another), `prov:wasRevisionOf` (a subproperty, for a new version), `prov:wasInvalidatedBy` (an activity ended usability), `prov:wasGeneratedBy`, `prov:wasAttributedTo`, `prov:alternateOf`, `prov:specializationOf`.
- [INF] Mapping: issue `prov:wasDerivedFrom` risk; a new risk record `prov:wasRevisionOf` an old one; a closed risk `prov:wasInvalidatedBy` the decision activity; an action `prov:wasGeneratedBy` the decision.

### Dublin Core Terms https://www.dublincore.org/specifications/dublin-core/dcmi-terms/
- [REC] `dcterms:replaces` / `isReplacedBy` (supersedes), `dcterms:relation` (generic related-to), `isVersionOf`/`hasVersion`, `requires`/`isRequiredBy` (a usable dependency link), `references`, and `hasPart`/`isPartOf`.

### Project-management ontologies (academic)
- [SRC] **PROMONT** (Abels, Ahlemann, Hahn, Hausmann, Strickmann, OTM Workshops 2006, LNCS 4277 pp. 813–823, doi:10.1007/11915034_105) is a reference ontology for exchanging project data between PM tools, covering planning concepts. I could not confirm risk or issue classes from the abstracts. https://sitm.ris.uni-due.de/research/publications/publication-list/promont-a-project-management-ontology-as-a-reference-for-virtual-project-organizations-10035
- [SRC] **TOVE** (Fox & Grüninger, University of Toronto) covers activity, state, causality, time, resources and constraints, grounded in situation calculus. It does not cover RAID. https://eil.mie.utoronto.ca/projects/tove-project/
- [SRC] Risk-specific OWL ontologies include OntoPRIME / mPRIME (OWL-DL), SRMONTO (software risk), a feedforward project risk ontology (HES-SO), and a PPP construction risk ontology (*Construction Innovation*, 2023: risk, consequence, management-measure classes). None that I could access publishes a risk→task "affects" property. https://hesso.tind.io/record/3537 ; https://www.emerald.com/insight/content/doi/10.1108/CI-02-2022-0029/full/html
- [INF] schema.org has no Risk or Issue types. `schema:Action` (with `object`, `result`, `agent`, `actionStatus`: Potential/Active/Completed/Failed) can model actions, but nothing else in RAID. I found no maintained, widely adopted OWL "RAID" ontology. Tool schemas (Jira link types: blocks / is blocked by, relates to, duplicates, clones; MS Project/Primavera dependencies) are the de facto standard.

---

## 5. Synthesized relationship catalogue [INF unless marked]

| From → To | Name (inverse) | Grounding | Cardinality |
|---|---|---|---|
| Assumption → Risk | `ifFalseRaises` / `raisesRisk` (`arisesFromAssumption`) | Wiley/PMI text "assumption not validated may become a risk" [SRC] | M:N |
| Dependency → Risk | `createsRisk` | PMBOK lists external dependencies as risk sources [REC] | M:N |
| Risk → Issue | `materialisedAs` (`realisesRisk`) | PMI "risk that occurs ... issue" [SRC]; DPV `risk:refersToRisk` [SRC] | 1:N typical (one risk can occur several times); an issue usually comes from 0..1 risk |
| Risk → Risk | `hasSecondaryRisk`, `hasResidualRisk` (`isResidualRiskOf`) | PMBOK [SRC]; DPV [SRC]; ISO 31000 [REC] | 1:N |
| Risk → Action/Task | `mitigatedBy` / `respondedToBy` (`mitigates`) | PMBOK 11.5 inserts activities [REC]; DPV `isMitigatedByMeasure` [SRC]; PRINCE2 actionee [SRC] | M:N |
| Risk → Trigger | `hasTrigger` (often an attribute, not an entity) | PMBOK [SRC] | 1:N |
| Issue → Action / Workaround | `resolvedBy` (`resolves`) | PMBOK workaround [REC]; ISO 21502 7.9 [SRC] | 1:N |
| Issue → Change Request | `escalatedTo` / `raisedAs` | PRINCE2 RFC and off-spec are issue types [SRC]; PMBOK change requests from 11.6/11.7 [REC] | 1:N |
| Issue → Exception | `triggersException` | PRINCE2 tolerance breach [REC] | N:1 |
| Decision → Change Request | `decides` (approve/reject/defer/concession) (`decidedBy`) | PRINCE2 Change Authority [REC]; OSLC `approved` + `authorizer` [SRC] | 1:N |
| Decision → Action | `mandates` / `generates` | PROV `wasGeneratedBy` [SRC pattern] | 1:N |
| Decision → Risk | `accepts` / `closes` | residual risk "deliberately accepted" [SRC] | M:N |
| Change Request → Work item / baseline | `implementedAs` / `affectsPlanItem` / `implementsRequirement` | OSLC CM [SRC]; PRINCE2 Work Package [REC] | M:N, 0..* each side |
| Action → Task / Work Package | `implementedAs` (`implements`) | inference; OSLC `implementedBy` analogue [SRC] | 1:N |
| Any RAID item → Task/WBS/Milestone/Deliverable | `affects` / `impacts` (`affectedBy`) | OSLC `affects*`, `affectedBy` [SRC] | **M:N** (one risk threatens many tasks; one task carries many risks) |
| Issue / Dependency → Task | `blocks` (`blockedBy`) | OSLC `blocksTestExecutionRecord` [SRC]; Jira | M:N |
| Off-spec issue → Product/Deliverable | `concerns` | PRINCE2 [SRC] | N:1 (exactly one product) |
| Task → Task | `dependsOn` (FS/SS/FF/SF + lag) | IFC `IfcRelSequence` [REC] | M:N |
| Item ↔ Item | `relatedTo` (symmetric, weak) | OSLC `relatedChangeRequest` [SRC]; DC `relation` [REC] | M:N |
| Item → Item | `duplicateOf` | Jira; none in the standards | N:1 |
| Item → Item | `supersedes` (`supersededBy`) | DC `replaces`/`isReplacedBy` [REC]; PROV `wasRevisionOf` [SRC] | 1:1 typical |
| Item → Item | `parent` / `child` | OSLC `parent` [SRC] | N:1 tree |
| Daily-log entry → Issue/Risk | `promotedTo` | PRINCE2 [SRC] | 1:0..1 |

### Lifecycle states [INF, built from the sources]
- **Risk:** Identified → Assessed/Analysed → Response Planned → (Active/Monitored) → {Occurred → issue created | Closed (expired, proximity passed) | Accepted (residual)}. PRINCE2 also scores *proximity*.
- **Issue:** Raised (Daily Log) → Logged (Register) → Assessed (Issue Report) → Decision pending → {Resolved / Closed | Escalated (exception) | Converted to risk or change, which closes the issue (UIllinois [SRC])}.
- **Change request:** Submitted → Assessed → {Approved | Rejected | Deferred} → In progress → Implemented → Verified → Closed (OSLC booleans [SRC]). PRINCE2 off-spec can end as a *concession*.
- **Assumption:** Open/Unvalidated → {Validated (closed) | Invalidated, which raises a risk or issue}.
- **Decision:** Proposed → Made/Approved → (Superseded | Reversed). Immutable once made; a new decision supersedes it.
- **Action:** Open → In progress → Done / Cancelled, with owner and due date. In PMI/PRINCE2 the *owner* (accountable) is distinct from the *actionee* (responsible) [SRC].

### Modelling takeaways [INF]
1. No standard defines a typed relationship graph for RAID. PMBOK, PRINCE2 and ISO define *registers and process flows*. OSLC and DPV are the only primary specs with formal link properties.
2. The usual default for item ↔ work-item links is many-to-many with typed, directional verbs and a stored inverse. Reify links (as IFC does) if they need attributes such as impact magnitude.
3. "Conversion" (risk→issue, daily log→register, issue→CR) is best modelled as a new item plus a derivation link (`materialisedAs`, `promotedTo`, PROV `wasDerivedFrom`), not as a type mutation. The old item is then closed with a reason.
4. Keep owner (accountable) and actionee (responsible) as separate roles on risks and actions.
