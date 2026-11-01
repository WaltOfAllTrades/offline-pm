# Spreadsheet (XLSX/CSV) Import & Export in PM Platforms: Field Mapping, Hierarchy, Dependencies, People, Dates

Research date: 2026-10-31. Several vendor help centres (monday.com, ClickUp, Asana article bodies) returned 403/404 or empty pages to the fetch tool. Where that happened, findings come from search-result summaries of the official pages, or from community/third-party sources, and are flagged as such. Treat anything marked "(unverified)" as needing a check against the live product.

## Q1. Microsoft Project Import Wizard for Excel (map, Outline Level / WBS / Predecessors, saved maps)

### Takeaway
MS Project uses a step-by-step wizard: choose a new or saved map, import as a new project or into the open one, pick the data types (tasks/resources/assignments), then edit a per-type mapping table (Excel column → Project field) that has a data preview, and finally save the map for reuse. Hierarchy comes from a mapped **Outline Level** column (integer). Predecessors are mapped as text in Project's native `ID[Type][±Lag]` list syntax, which refers to Project task IDs (row order), not spreadsheet row numbers. Users report that predecessor import is fragile.

### Cited Findings
- The wizard starts at File > New > "New from Excel workbook". In the Open dialog the user switches the file type to Excel Workbook. Steps: (1) Next; (2) "Create a map from scratch, or choose a predefined map"; (3) import into a new project or the open project; (4) choose the type of information being imported (tasks/resources/assignments); (5) verify and adjust the mapped fields; final step: **Save Map**, then **Finish**. — [Microsoft Support: Import or export data between Project and Excel](https://support.microsoft.com/en-us/office/import-or-export-data-between-project-and-excel-cb3fb91a-ad05-4506-b0af-8aa8b2247119)
- The official page does not describe the mapping table, Append/Merge, or merge keys in detail (gap in the official doc). — [same](https://support.microsoft.com/en-us/office/import-or-export-data-between-project-and-excel-cb3fb91a-ad05-4506-b0af-8aa8b2247119)
- The Task Mapping screen shows a preview of the Excel data on top and the From (Excel column) → To (Project field) map below. Predecessors and Outline Level are both mappable target fields. In an "Outline Level" column, 1 is a top-level task and 2 is indented under the nearest level-1 task above it. (Third-party guide.) — [TheBricks guide](https://www.thebricks.com/resources/guide-how-to-import-excel-into-project)
- Users report that Project applied predecessors to tasks that had none (e.g. summary tasks). Their workaround was to import first and then paste the predecessors. An experienced user noted that Project's Predecessor field refers to Project task IDs and normally won't follow the spreadsheet row number. Pasting Excel content directly into Project does **not** keep the outline level; only the wizard's Outline Level mapping does. — [MPUG forum](https://mpug.com/forums/topic/mpp-2010-importing-excel-file-issue-with-predecessors-2)
- Appending tasks to an existing project can mis-map assignments. The reported fix is to import the Task, Resource and Assignment sheets together into a new project in one pass. — [Microsoft Q&A](https://learn.microsoft.com/en-us/answers/a/11877622)
- Predecessors field syntax: a list of predecessor task IDs, each optionally followed by a dependency type and lead/lag, e.g. `14FS+3d` (task 14, finish-to-start, 3-day lag). The types are FS, FF, SS and SF. A negative value is lead time and a positive value is lag. A bare ID means FS with zero lag. Multiple entries are separated by the list-separator character (usually a comma or semicolon, depending on locale). External predecessors include a file path before the ID. — [Microsoft Support: Predecessors (task field)](https://support.microsoft.com/en-us/project/predecessors-task-field)

### Inferences
- For a small app, use MS Project's grammar as the de facto standard: `ref[FS|SS|FF|SF][(+|-)N(unit)]`, comma- or semicolon-separated, with FS as the default type and a lag of 0d by default. Accept `,` and `;` as separators. Accept optional spaces (Smartsheet writes `2FS +2d`).
- "ID" in exported Project data means the row position. Your export should either write a stable ID column and make predecessors point to it, or write predecessors as WBS codes. Never point at the spreadsheet row number, because the header row shifts it by 1 (see the Smartsheet off-by-one below).
- Copy Project's "saved map" idea: store the mapping (source header → field) under a name and auto-apply it when a file's headers match.

### Gaps
- I couldn't fetch an official, detailed description of the Task Mapping grid controls ("Add All", "Clear All", "Insert Row", "Delete Row", the "Source worksheet name" dropdown, the "Merge key" for Append/Merge). I know these from training but did not verify them this session.
- Elapsed-duration notation (`ed`, `ew`) and the duration units (`m`, `h`, `d`, `w`, `mo`) are not verified this session. The **Unique ID Predecessors** field format was not verified either.

## Q2. monday.com Excel/CSV import

### Takeaway
monday imports one sheet into a board. The user picks the item-name column and matches each spreadsheet column to a new or existing board column, with a limited set of target types. Duplicates can be handled by choosing a match column (often email) with Skip or Update. Subitems are **not** natively imported: they arrive as normal items. People matching is supported but unreliable per third parties.

### Cited Findings
- The official article (via search summary; direct fetch was 403) says columns can be imported only as Number, Status, Email, Date or Text, yet elsewhere it lists People among the mappable types. This is an internal inconsistency. Third-party guides say People values often import as plain text. — [monday Support: Import files from Excel](https://support.monday.com/hc/en-us/articles/360000219209-Import-files-from-Excel); [SplitForge blog](https://splitforge.app/blog/monday-com-csv-import-errors-fix)
- People disambiguation: when a user and a team share a name, prefix the source values with `user:` or `team:`. — [monday Support](https://support.monday.com/hc/en-us/articles/360000219209-Import-files-from-Excel) (via search summary)
- Duplicate handling: the user selects a column that defines a match. **Skip** excludes a row whose value (e.g. email) already exists on the board, and **Update** overwrites the matching item with the imported data. — [monday Support](https://support.monday.com/hc/en-us/articles/360000219209-Import-files-from-Excel) (via search summary)
- Subitems: "subitems from Excel will be imported as items" and can then be converted manually. Third parties agree there is no native bulk subitem import. — [monday Support](https://support.monday.com/hc/en-us/articles/360000219209-Import-files-from-Excel); [getsign.io](https://getsign.io/how-tos/import-excel-data-into-monday-com/); [mondayinspector.eu (vendor claim for an extension)](https://mondayinspector.eu/import-subitems-monday.html)

### Inferences
- monday's update-or-skip keyed on a user-chosen column is a simple, understandable pattern for re-imports: "Match existing tasks by: [ID column ▾] → [Update / Skip / Create duplicate]".
- Prefixed disambiguation (`user:`/`team:`) suggests a cheap convention for an assignee cell holding several kinds of entity.

### Gaps
- The exact column-type auto-detection rules and accepted date formats could not be fetched (403). Upload limits were not verified.

## Q3. Smartsheet import (hierarchy, predecessors, contacts)

### Takeaway
The Smartsheet importer is shallow. It reads the first worksheet with headers in row 1, lets you pick the primary column, and imports flat rows. Excel grouping/indentation does **not** become hierarchy, contact columns arrive as text, and predecessors use row-number references (`2FS +2d`) that can shift by one on an Excel round trip.

### Cited Findings
- The import wizard reads only the first worksheet. Column titles must be in row 1. Mis-typed columns are fixed afterwards via Edit Column Properties. (Third-party guide.) — [TheBricks: Import Excel into Smartsheet](https://www.thebricks.com/resources/guide-how-to-import-excel-into-smartsheet)
- Hierarchy: a Smartsheet staff reply says "there currently is no way to automate Hierarchy, it is a fully manual process". Excel row groupings don't carry over. Indent/outdent is a manual row action. — [Smartsheet Community](https://community.smartsheet.com/discussion/81121/building-hierarchy-based-off-of-indentation/p1); [Smartsheet Help: Hierarchy](https://help.smartsheet.com/articles/504734-hierarchy-indenting-outdenting-rows)
- Contacts: names imported from Excel stay plain text even after the column type is changed to Contact List. Re-typing the values activates them. — [Smartsheet Community](https://community.smartsheet.com/discussion/74285/how-to-turn-on-contacts-when-imported-from-excel)
- Predecessors reference **row numbers**. After an export to Excel, row 1 becomes the header, so predecessor references are off by one. — [Smartsheet Community](https://community.smartsheet.com/discussion/predecessors-shift-1-when-export-excel)
- Dependency types are FS, FF and SS. Lag is in working days (e.g. `1d`). Once dependencies are enabled, Start, End, Duration, % Complete and Predecessors cannot hold formulas. — [Smartsheet Help: Activate dependencies](https://help.smartsheet.com/articles/765727-enabling-dependencies-using-predecessors)
- Predecessor cell text looks like `<row>FS+1d`, with the row number leftmost (community parsing posts). — [Smartsheet Community](https://community.smartsheet.com/discussion/26661/looking-to-turn-predecessors-cell-into-a-comma-delimited-list-without-ff-fs-x-d-etc)

### Inferences
- Smartsheet's weaknesses (lost hierarchy, text-only contacts, row-number predecessors) are the main traps your format should avoid. Include an explicit hierarchy column (WBS or Outline Level or Parent ID) and stable IDs in exports.

### Gaps
- No official Smartsheet page describing the Excel import dialog in detail could be fetched. Whether the MS Project (.mpp/.xml) import preserves hierarchy (believed yes) was not verified this session.

## Q4. ServiceNow SPM: importing project tasks (Import Sets, transform maps, WBS)

### Takeaway
The generic route is the Import Set pipeline: data source (file) → staging table → transform map (staging column → `pm_project_task` field) → run. Hierarchy is set through a Parent mapping, and parents must load before children. SPM also has native MS Project import and an "import from Excel template" feature on the project workspace, but I could not verify their details this session.

### Cited Findings
- Steps: System Import Sets > Administration > Data Sources (type File, upload) → Load Data (creates the staging import-set table) → Transform Maps (map staging fields to project task tables) → run the transform → verify. Example mappings: "Task Name" → Short description, "Start Date" → Planned start date, "Parent WBS" → Parent. — [ServiceNow Community: import WBS from Excel into SPM](https://www.servicenow.com/community/spm-forum/how-can-we-import-a-project-s-wbs-from-excel-into-spm/m-p/3413848)
- Tasks must be loaded with the WBS hierarchy in mind. Top-level tasks directly under the project load first (or records are ordered by WBS level), and the **Top Project** attribute is set on project tasks. — [ServiceNow Community: Bulk Import Project Tasks from Excel](https://www.servicenow.com/community/spm-forum/bulk-import-project-tasks-from-excel/m-p/1046672) (via search summary)
- Every import into a production table needs at least one transform map, which defines the relationship between the import set and the target table. — [ServiceNow Fluent Import Sets API docs](https://www.servicenow.com/docs/r/application-development/servicenow-sdk/fluent-import-sets-api.html)
- Community suggestion (unverified): apply a project template during import by calling the Project API `applyTemplate()` in a transform map's onBefore/onAfter script. — [ServiceNow Community](https://www.servicenow.com/community/developer-forum/import-projects-from-xls-into-servicenow-pm-project-how-can-we/m-p/2782089)

### Inferences
- Use ServiceNow's parent-before-child ordering rule as an import algorithm: sort rows by WBS depth, or do two passes (create all rows, then resolve parent refs). Two passes are more forgiving for a small app.

### Gaps
- The official SPM "Import project from Microsoft Project" and "Import from Excel" (template download) features: the required columns, their WBS/predecessor formats and their limits were not found in this session's sources (unverified).

## Q5. Asana, Wrike, ClickUp, Jira CSV importers (mapping, value mapping, unknown users, preview, errors, update-vs-create)

### Takeaway
All four follow the same pattern: upload → map columns → (optional) map values for enum fields → match users → import. Jira is the most complete: value mapping, saved config file, update by key, a parent ID column and a downloadable log. Wrike and Asana create only and never update. Dependencies are poorly supported everywhere except Wrike (Key + "Depends On" with `22SS, 32FS` syntax) and Jira (links).

### Cited Findings
**Jira (Cloud CSV importer)** — [Atlassian: Import data from a CSV file](https://support.atlassian.com/jira-cloud-administration/docs/import-data-from-a-csv-file/)
- Flow: System > External System Import > CSV → upload → space mappings → field mappings → field value mappings → Begin Import. Header punctuation can break the importer.
- There's an option to reuse an existing **configuration file**. Jira generates a config file at the end of an import for reuse. Encoding defaults to UTF-8, and a custom delimiter is set under Advanced.
- Field mapping: each CSV column maps to a Jira field. **Summary is required.** Duplicate header names are merged into one multi-value field. A "Map field value" checkbox per column enables value mapping.
- Value mapping: values for Priority, Resolution, Work Type and Status can be mapped to existing values. Unresolved values can be set to "Import as blank" or "No mapping". "Add new…" creates new Priority/Resolution values, but **new Statuses cannot be created**.
- Users: email addresses or Atlassian account IDs. Missing users are created as active accounts, with the name before "@" used as the full name. If external user management is on, the importer lists users that must be created first. If the licence limit is exceeded, the import stops and lists users it can't create. Watchers must already exist.
- Hierarchy: "Work item ID", "Work type" and "Parent" columns. Each row has a unique ID, and the child's Parent column holds the parent's ID. "The parent work items must appear before their subtasks or child work items in the file."
- Dates: the format is set in the wizard using **Java SimpleDateFormat** syntax and applies to created, modified, due and date custom fields.
- Update vs create: include a work-item **key** column, and "If a work item exists for a given key, it will be updated". The marker `<<!clear!>>` clears a value. Rows whose keys clash with an existing space get new keys.
- Errors: a detailed log can be downloaded during the import. No dry run is described.

**Wrike (Excel import)**
- Steps: folder/project → ⋯ → Import → Excel → choose file → Next → if the "Assigned to" column contains names, **associate Wrike users from your contact list** with those names → Next. — [Wrike Help: Importing XLS Files](https://help.wrike.com/hc/en-us/articles/210324125-Importing-XLS-Files-to-Wrike)
- Limits and behaviour: 5,000 tasks per import. No formulas allowed. Description formatting is lost. **Imports only create, never update.** Non-ASCII file names can prevent detection. — [same](https://help.wrike.com/hc/en-us/articles/210324125-Importing-XLS-Files-to-Wrike)
- Format (via search summary of Wrike's formatting guide/community; unverified detail): a "Parent task" column, where the parent must appear before the child and nested subtasks use a full path like `Parent task / Subtask 1 / Subtask 2`. Parent and child names must differ. A **Key** column holds a unique value per row, and a **Depends On** column references keys with type codes, comma-separated (`22SS, 32FS`). Lead/lag can be imported. Reusing a key for unrelated items causes a "cycle in dependencies" error. Using primary emails in "Assigned to" maps users. — [Wrike: Resolve Excel Import Errors](https://help.wrike.com/hc/en-us/articles/33474957856279-Resolve-Excel-Import-Errors); [Wrike Community: importing task dependencies](https://community.wrike.com/discussion/1286/importing-task-dependencies)
- A community report says dependency import triggered server errors, and renaming the column to "Predecessors" was ignored, so the header name is fixed. — [Wrike Community](https://help.wrike.com/hc/es/community/posts/25129693064983-Importing-Task-dependencies)

**ClickUp (Spreadsheets importer)** — direct fetch 403; from search summaries of [ClickUp Help: Use the Spreadsheets importer](https://help.clickup.com/hc/en-us/articles/6310834724247-Use-the-Spreadsheets-importer) and [Supported fields](https://help.clickup.com/hc/en-us/articles/6310876671255-Supported-fields-for-data-file-imports)
- Assignees accept names or emails, and emails map to existing users more reliably. Imported users can be mapped during the import. Emails of people outside the Workspace can't be mapped.
- Status, Priority and task-type values go through a value-mapping step: each unique value is matched to an existing status or created as a new one.
- Dependencies: a ClickUp feedback request says dependencies cannot be imported through the spreadsheet importer (may be outdated). — [ClickUp feedback](https://feedback.clickup.com/feature-requests/p/import-links-relationships-and-dependencies)

**Asana (CSV importer)**
- Columns are mapped to Asana fields by column name (task name, assignee, due date, section, dependencies). Unmatched columns can become custom fields (an older post says non-Premium users get them in the description). — [Asana: CSV importer launch post](https://asana.com/inside-asana/import-csv-asana-projects); [Asana: Advanced CSV import options](https://help.asana.com/s/article/advanced-csv-import-options?language=en_US) (body not fetchable)
- Assignees must be **emails**. Subtasks use a "Parent Task" column holding the exact name of a parent above them, and with duplicate names the closest matching row above wins (via search summary). CSV import "will not update any existing tasks", so dependencies cannot point to pre-existing tasks. Community users report unreliable dependency columns. — [Asana Community](https://forum.asana.com/t/csv-import-dependent-tasks-to-a-project/39182); [CSVBox blog](https://blog.csvbox.io/integrate-csv-import-with-asana-project-data-onboarding/)

### Inferences
- **Common minimum:** a required name/title field; a per-column target dropdown (including "Don't import"); a value-mapping step for enum fields (status, priority) with "map to existing / create new / leave blank"; a user-matching step (email first, then name); create-only by default, with update-by-ID as an opt-in.
- Parent references come in three styles: parent **ID** (Jira, robust), parent **name** (Asana/Wrike, fragile with duplicates; Wrike uses full paths), and **WBS/Outline Level** (MS Project). A small app should accept all three, preferring ID, then WBS, then Outline Level, then name.
- Every importer requires parent-before-child ordering. A two-pass resolver removes that requirement and is a cheap way to beat them.

### Gaps
- Preview/dry-run: none of the documented importers describes a true dry run (Jira has only a log). The Asana and ClickUp error-report formats are not verified.

## Q6. Common PM spreadsheet conventions (WBS, Outline Level, indentation, predecessors, durations, dates)

### Takeaway
There are three interchangeable hierarchy encodings: a WBS code (`1.2.3`, depth = number of segments), an Outline Level integer (parent = nearest preceding row with level − 1), and a Parent ID/name column. Indentation (cell indent or leading spaces) is the least reliable because it doesn't survive CSV or paste. Predecessors use the MS Project grammar. Excel dates are serial numbers whose interpretation depends on the 1900/1904 system and the time zone.

### Cited Findings
- Outline Level semantics: level 1 = top, level 2 = child of the level-1 row above. — [TheBricks](https://www.thebricks.com/resources/guide-how-to-import-excel-into-project)
- Pasting loses outline level, and Excel grouping/indent doesn't import into Smartsheet. — [MPUG](https://mpug.com/forums/topic/mpp-2010-importing-excel-file-issue-with-predecessors-2); [Smartsheet Community](https://community.smartsheet.com/discussion/81121/building-hierarchy-based-off-of-indentation/p1)
- Predecessor grammar: `ID[FS|FF|SS|SF][±lag]`, list separator `,` or `;`, default FS+0. — [Microsoft Support](https://support.microsoft.com/en-us/project/predecessors-task-field). Wrike uses `KeyType` with `, ` (`22SS, 32FS`) — [Wrike Community](https://community.wrike.com/discussion/1286/importing-task-dependencies). Smartsheet uses `rowFS +2d` with lag in working days — [Smartsheet Help](https://help.smartsheet.com/articles/765727-enabling-dependencies-using-predecessors). Workfront uses comma-separated predecessor IDs — [Adobe Workfront](https://experienceleague.adobe.com/docs/workfront/using/administration-and-setup/manage-wf/kick-starts/kick-starts-scenario-simple-project-task-import-prep.html)
- **SheetJS dates:**
  - By default, parsers produce number cells (serials). `XLSX.read(data, {cellDates:true})` produces `t:'d'` cells with JS Date `v`. On write, date cells are converted back to numbers with a date format.
  - The integer part of a serial is days since the epoch (e.g. 42785 = 19-Feb-17), and the fraction is the time of day (0.25 = 06:00).
  - Epochs: 1900 (default, with the Lotus leap-year bug) or 1904. Check `wb.Workbook.WBProps.date1904`.
  - Spreadsheet dates have no time zone. CSV text dates are read as local time. `sheet_to_json` and `json_to_sheet`/`aoa_to_sheet` accept `UTC:true` to use UTC interpretation.
  - `cellNF:true` emits number formats in `z`. `XLSX.SSF.is_date(fmt)` tests whether a format is a date. `.w` is the displayed text.
  - `JSON.stringify`'d Dates (ISO strings) are written as **text**, so convert them to Date first. Pre-1900 dates are unsupported, so write them as strings.
  - [SheetJS docs: Dates and Times](https://docs.sheetjs.com/docs/csf/features/dates)
- Jira requires the user to declare the date format (SimpleDateFormat). — [Atlassian](https://support.atlassian.com/jira-cloud-administration/docs/import-data-from-a-csv-file/)

### Inferences
- **Hierarchy algorithms:**
  - WBS: split on `.`; depth = segments; parent = the code with its last segment removed; sort with natural segment order. Validate that the parent exists, and flag duplicates and gaps.
  - Outline Level: keep a stack and pop until top.level < row.level; parent = top. Treat a jump of more than 1 level as an error, or clamp it to +1.
  - Leading-space indentation in the name: depth = spaces / indentUnit. Offer it only as a fallback.
- **Duration parsing** (convention from MS Project; not verified this session): a number followed by a unit: `m`/`min`, `h`/`hr`, `d`/`day(s)`, `w`/`wk`, `mo`. An `e` prefix (`ed`, `ew`) means elapsed calendar time. A bare number defaults to days. Allow a decimal point and an optional space.
- **Dates:** with SheetJS, read with `cellDates:true` and normalise to date-only strings (`YYYY-MM-DD`) at local midnight. For CSV and text cells, try ISO first, then a user-selected locale order (DMY vs MDY), and ask the user when it's ambiguous (e.g. `03/04/2026`). For export, write real Date cells with `z:'yyyy-mm-dd'` (or `cellDates`) so Excel treats them as dates.

### Gaps
- I found no authoritative cross-vendor standard for a WBS column. The conventions above are de facto, inferred from MS Project's behaviour. MS Project's duration-unit abbreviations are unverified this session.

## Q7. UX best practices for import mapping screens (Flatfile, OneSchema, Dromo, CSVBox)

### Takeaway
Dedicated import vendors converge on a 3–4 step flow: **Upload → Match columns (auto-suggested) → Map values / Review → Validate and fix in-grid → Submit**. Errors are shown inline at cell level and caught as early as possible, and users can remap or ignore columns. Mappings are learned or remembered from past imports.

### Cited Findings
- Flatfile's import flow has three stages: add data → match input headers to the output template → validate and correct. Mapping "confirms the alignment of columns from your incoming file with the fields in the destination schema". Flatfile says its model, which also learns from users' past selections, predicts over 90% of matches. The review step has bulk find-and-replace and fills empty values within a column. — [Flatfile Support: Importing data overview](https://support.flatfile.com/articles/7763163677-importing-data-with-flatfile-overview)
- Dromo advises catching errors "as early as possible – ideally the moment the file is uploaded". It puts field-level messages ("Invalid date format", "Expected a number") next to the offending value and lets users fix values in an in-browser grid. It also warns not to assume headers match fields exactly. — [Dromo: 5 best practices](https://dromo.io/blog/5-best-practices-to-streamline-your-csv-import-process); [Dromo: common import errors](https://dromo.io/blog/common-data-import-errors-and-how-to-fix-them)
- CSVBox lists auto-suggested column matches, and letting users remap, ignore columns or create new mappings. — [CSVBox blog](https://blog.csvbox.io/add-csv-import-feature-saas/)
- Vendor blogs are self-interested, and I found no OneSchema-specific UX documentation. — [CSVBox alternatives post](https://blog.csvbox.io/flatfile-alternatives-best-tools-for-csv-import/)

### Inferences (design recommendations for a small offline SheetJS PM app)
- **Step 1, Upload:** drag and drop .xlsx/.xls/.csv. Pick the sheet (unlike Smartsheet, don't silently take the first). Detect the header row (default row 1, user can change it). Show the row count.
- **Step 2, Map columns:** a table with Source header | 3 sample values | Target field ▾ (including "Don't import") | match status. Auto-match on normalised headers (lowercase, strip punctuation and spaces) plus a synonym list, for example:
  - name: Task, Task Name, Summary, Title
  - wbs: WBS, Outline Number
  - outlineLevel: Outline Level, Level
  - parent: Parent, Parent ID, Parent task
  - start: Start, Start Date, Planned start
  - finish: Finish, End, Due, Due Date
  - duration: Duration
  - predecessors: Predecessors, Depends On, Dependencies, Blocked by
  - assignee: Assignee, Assigned to, Resource Names, Owner
  - status: Status, State
  - percent: % Complete, Progress
  - id: ID, Key, Unique ID, Work item ID

  Mark required fields (Name only). Forbid two columns mapping to one scalar target, unless it's multi-value like Jira.
- **Step 3, Map values:** for status/priority/assignee, list the distinct source values and offer map-to-existing / create / blank (Jira and ClickUp model). Match assignees by email, then exact name, then case-insensitive name. Unknown people become new people records (offline, so nothing to invite) or stay blank (choice).
- **Step 4, Validate and preview:** a dry-run grid that shows the derived hierarchy (indent preview), parsed dates and durations, and resolved predecessors. Row-level errors include unparseable date, unknown predecessor ref, dependency cycle, WBS parent missing and outline-level jump. Offer "Import valid rows only" or "Fix", and a downloadable error CSV (original row + error column).
- **Import options:** New plan / Append / Update matched by ID column (monday- and Jira-style). Remember the mapping in localStorage, keyed by a hash of the sorted headers, and offer named saved maps (MS Project).
- **Export format** (round-trippable, matching the synonyms above): ID | WBS | Outline Level | Name | Start (date cell) | Finish (date cell) | Duration (`5d`) | Predecessors (IDs, MS Project grammar, e.g. `3FS+2d, 5SS`) | Assignees (emails or names, `;`-separated) | Status | % Complete | Notes. Include both WBS and Outline Level so Project-style and WBS-style importers both work, and include ID so predecessor refs and update-by-ID are stable.

### Gaps
- I found no quantitative UX research (completion rates, etc.) on import wizards. OneSchema's own docs were not reached.
