# UI interaction review

Branch `ui-review`, from `main` at 7f32ea3. Method: read every UI source file (`src/index.html`, `styles.css`, `00-util`, `30-grid`, `40-gantt`, `45-form`, `46-risks`, `50-views`, `90-main`) against `STORIES.md` and `DECISIONS.md`, then used the built app in a browser at 1440×860 and 1024×700 with the sample plan. Findings marked **reproduced** were seen in the running app; the rest come from the code.

## Part 1: The intended interactions

### Overall shape
One page with five views (Plan, Risks, RACI matrix, People & teams, Issues) under a top bar that holds the project menu, undo/redo, the save pill and the File menu. Every change is one `mutate()`: an undo step, a revision and a live save. Feedback goes through a single toast line, `confirm()`/`prompt()` for some decisions, and an app modal for the rest.

### Plan view: outline + Gantt
- **Selection:** one row at a time (DECISIONS #16). Clicking a cell selects its row and column; arrows, PgUp/PgDn and Ctrl+Home/End move around.
- **Editing:** double-click, Enter/F2, or just start typing. Party cells (R/A) open a picker on a second single click. In the editor, Enter saves and moves down, Tab saves and moves right, Esc cancels. A refused value keeps the editor open (#71).
- **Structure:** Insert / Ctrl+Insert add a task or subtask. **Tab / Shift+Tab indent and outdent** whenever no editor is open (#72). Alt+Shift+arrows move or indent, Delete deletes (it asks first only when there are subtasks or notes), and dragging the WBS cell moves a row before, after or under another.
- **Filtering:** text and person filters keep matching tasks' parents visible. Adding a task clears the filter, with a toast.
- **Gantt:** drag a bar to move it, drag its edges to resize, and drag a hover-only ○ handle onto another bar to link them. Click an arrow to edit the link. A double-click (the app's own 450 ms detection) opens the record. Escape or leaving the window cancels a drag.
- **Record panel:** opens with ↗ (hover-only), 📄 Record, Ctrl+I or a double-click on a bar. It slides in on the left and pushes the outline under the Gantt (#38). Inside: a header with breadcrumb and ▲/▼, a two-column Details form, a mini Gantt (summary tasks), work notes, and related-record tabs. Fields save on change or blur, and Ctrl+Enter posts a note.

### Risks view
A risk/mitigant table edited inline: Enter adds the next mitigant, and Backspace on an empty one deletes it. To link, drag a row's ⠿ onto the Plan pane on the right: dropping on a task links it, dropping between tasks creates one. A Plan-pane task can also be dragged onto a mitigant. ＋ Task and "＋ Link a task…" (in the mitigant record) are the ways to link without dragging. Other parts: a Gaps filter, the closeout report, and import.

### RACI matrix
Tasks by teams (default) or by people. **Clicking a cell cycles the role through — R A A/R C I** (#61). In team view, **+** gives the team's role to one of its members. Clicking a task name opens the record panel beside the matrix.

### People & teams, Issues
People and teams are cards with Edit and Involvement buttons, edited in modals. Issues is a filtered list; clicking a row jumps to its task in the Plan.

### What already works well
Focus is put back after redraws and dialogs (#76). A refused edit keeps what you typed. Escape cancels every drag. One scheduler handles all redraws. The markup builder is XSS-safe. Copy is specific ("Filter cleared so you can see the new task"). The outline is announced as a treegrid. Reduced-motion is respected. These are uncommon for a single-file tool, and the suggestions below build on them.

## Part 2: Improvements, most impactful first

### 1. A stray Tab rebuilds the outline and silently deletes links (**reproduced**)
Tab means "next cell" inside the editor but "indent" outside it, and Enter saves *and leaves the editor*. Spreadsheet habit (type, Enter, Tab to the next column) therefore indents the next task. On the sample plan, renaming 2.1 Wireframes, then Enter, then Tab put 2.2 Visual design under Wireframes. That turned Wireframes into a summary task (its own dates were replaced by rolled-up ones), and the app removed a dependency link. The only notice was a 2.6-second toast: "Removed 1 link between a summary task and its own subtask." Nothing marks that the outline changed.
- **Fix (pick one):** (a) In the outline, Tab moves to the next cell as in Excel, and indenting stays on Alt+Shift+→/← and the toolbar. This also removes the WCAG 2.1.2 workaround in #72. (b) If MS Project's Tab-to-indent must stay, make Enter save *without* moving the selection, and show any structural change that removed links as a toast with **Undo** (see 2).
- Files: `30-grid.js:310` (gridKey Tab), `30-grid.js:191` (Enter moves down).

### 2. Undo exists but is never offered at the moment of loss
Undo is full-fidelity (40 steps, 64 MB), but you only reach it through the ↶ icon or Ctrl+Z. Deletes, drag-moves, link removals, RACI changes and mitigant deletes all end in a plain text toast or nothing at all. Native `confirm()` dialogs then say "(Undo is available.)", asking you to trust something the screen doesn't show.
- **Fix:** give `toast()` an optional action (an "Undo" button, kept for about 8 seconds and paused while hovered) and use it after every destructive or automatic change. You could then drop the `confirm()` before deleting a task, risk or mitigant: delete right away and offer Undo, which is faster and safer.
- Files: `00-util.js:81` (toast), `30-grid.js:256`, `46-risks.js:161,165`, `45-form.js:287`.

### 3. Menus, tabs and many rows can't be used from the keyboard (**reproduced** for Escape)
- With the File menu open, **Escape leaves the menu open and closes the record panel behind it** instead. The menus have no `aria-expanded`, no `role="menu"`/`menuitem`, and no arrow-key movement. `90-main.js:124` handles pop, modal and log panel, but not `.menu`.
- The top view switcher is `role="tablist"`, but its buttons have no `role="tab"` or `aria-selected`. The record panel's related tabs have the same gap and no arrow keys.
- These are click-only `div`/`td` elements with no tabindex or key handler: Issues rows, RACI cells, mini-Gantt labels and bars, Plan-pane rows on the Risks page, and Subtasks-tab rows. A keyboard or screen-reader user can't set a RACI role or jump from an issue to its task.
- **Fix:** add one small `menu()` helper (Escape closes it and returns focus to the button, arrows move, `aria-expanded` is kept up to date). Make the tabs real tabs. Make list rows buttons or links. Give the RACI matrix the outline's roving-focus pattern (see 4).

### 4. Setting a RACI role means clicking in a loop
To get from empty to **I** takes five clicks, and each click is a separate undo step and a saved revision. Overshoot one and you go round again. You can't see the cycle order without reading the hint, which sits at the far right of the toolbar, away from the table. The member chips (`R·CP`) use initials that are hard to tell apart in a team of any size.
- **Fix:** a click opens a small popover with — R A A/R C I, and keyboard users get arrow keys between cells plus the letters R/A/C/I and Delete. Keep click-to-cycle for power users on Alt+click if wanted. Show the member's name in the chip's tooltip and in the popover.
- Files: `50-views.js:407-425`.

### 5. Important actions only show on hover
↗ Open record, the Gantt's ○ link handles and the RACI **+** have `opacity:0` until you hover (`styles.css:137-139, 341-342, 412`). First-time users won't find drag-to-link, nothing works on touch or pen, and keyboard users never see them. On the Risks page, clicking a Plan-pane task does nothing: it is drag-only, and there is no hint until you drag.
- **Fix:** show these at low contrast all the time on the selected row or bar (the outline already does this for ↗), add a "Link from…" command in the bar's context or record panel, and make a click on a Plan-pane task select or preview it.

### 6. Record panel flows stop short
- **＋ New subtask** creates "New task", then a toast says "Click it to open its record and rename it". Open the new record with its Name selected instead, as ＋ Task in the outline does (`45-form.js:333`).
- **＋ Add predecessor / successor** and **＋ Link a task** are plain `<select>`s listing every task. At a few hundred tasks they can't be scanned or searched. Reuse the searchable party-picker pattern as a task picker (`45-form.js:357`, `46-risks.js:376`).
- The **RAID "soon"** tab sits next to the working **Risks** tab and shows a placeholder for things that partly exist now. Remove it or rename it to what is still coming (`45-form.js:312`).
- Work notes are below Details and the mini Gantt. On a 700 px-high screen you scroll past about a dozen fields to read or post a note. Consider jump links in the header (Details · Notes · Related) or remembering the scroll position per section.

### 7. Three panes are too cramped on a laptop (**reproduced**)
At 1024×700 with the record open: panel 420 px, outline 263 px (WBS plus a cut-off name), Gantt 336 px, and the toolbar wraps onto a second row. Even at 1440 px the Accountable column sits under the Gantt with nothing to show it's there. This was your explicit choice (#38, #50), so this is a trade-off rather than a defect. Options that keep the idea:
- Below about 1280 px, let the panel cover the Gantt instead of pushing the outline, or hide the outline's date columns while the panel is open.
- Let you hide and resize outline columns (and remember them), so people choose which columns sit next to the Gantt.
- Fade the right-hand edge of the outline to show that columns continue under the Gantt.

### 8. Dates appear in four formats
The outline shows `Oct 30, 26`, the record form's native picker `10/30/2026`, the cell editor `2026-10-30`, and import asks for MDY or DMY. A two-digit year next to day numbers is easy to misread, and teams outside the US will meet MDY in the form.
- **Fix:** one display format with a four-digit year (`30 Oct 2026` reads the same everywhere), used in the outline, tooltips, mini Gantt and print. Accept typed dates in any form through `parseDateText`.

### 9. Native `prompt()` / `confirm()` dialogs mixed with app modals
Creating, renaming or deleting a project, naming a person or team from the picker, and most deletes use the browser's dialogs: unstyled, light-themed in a dark UI, and blocking. Everything else uses `openModal`, which already has a focus trap and returns focus.
- **Fix:** a small `askText(title, initial)` / `askConfirm(text, danger)` built on `openModal`, combined with item 2 so most confirms simply go away (`50-views.js:494, 547-549`, `00-util.js:269`).

### 10. Click rules differ from place to place
Text cells need a double-click, but party cells open on a second single click. Gantt bars use their own 450 ms double-click. Risk-table cells edit on a single click. Each is defensible, but together they are hard to learn. Pick one rule: a single click on an already-selected cell edits it, everywhere. Put it in Help & shortcuts.

### 11. Smaller polish
- Relative times on notes ("3 min ago") never update while the panel stays open (`45-form.js:229`). Refresh them with the existing 15-second save-pill tick.
- Toasts stay 2.6 seconds whatever their length. Scale the time with the text, and keep it on screen while hovered.
- `pm.collapsed.<fileId>.<project>` keys build up in localStorage with no cleanup: one per plan ever opened, as seen in the test browser.
- The Issues view's "No issues. Nice plan!" is fine. Its rows would be quicker to use if clicking one also opened the record on the Plan issues tab.

## Suggested order of work
1 and 2 together (one change to Tab and Enter, plus an undo toast) remove the only reproduced data-loss path. 3 and 4 are one accessibility pass. 5, 6 and 9 are small, separate polish PRs. 7 and 8 need your call, because they touch decisions you made on purpose.
