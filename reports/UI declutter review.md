# UI declutter review

Reviewed on 2026-11-02 in the browser at 1600×900 with the sample plan, and in `src/index.html`, `src/styles.css` and `src/js/*.js`. The aim: less on screen, quieter indicators, shorter words. Nothing that the owner (mouse-first, keyboard in tables) reaches for often may disappear.

Ranked by impact: how much of the screen it affects, how often, and how much noise it removes. **Built** marks the top 20% (items 1–4), plus the two requested extras (A, B).

## Requested extras

| | Change | Where |
|---|---|---|
| **A. Built** | **Hide warning icons.** File → *Hide warning icons* (a tick shows when on). It hides the ⚠ markers in the outline, the Risks table and the RACI Warnings column, and is remembered per browser. The Issues tab, its count and the Risks gap count stay, so nothing is lost. | `index.html` File menu, `90-main.js`, `styles.css` (`body.no-warn`) |
| **B. Built** | **Shorter dates.** "Oct 23, 26" becomes **"23 Oct"**; the year shows only when it isn't this year ("23 Oct 27"). This applies to the outline, Gantt drag tips, record panel, Risks and print. Typed and stored dates are unchanged. | `00-util.js` `fmtShort` |

## Findings

| # | Where | What's wrong | Fix | File |
|---|---|---|---|---|
| **1. Built** | Plan outline, Status column (every row) | Every row has a filled pill, including "Not started", the most common state. That makes a solid band of colour down the grid, louder than the task names, and summary rows repeat it. | Show a small coloured **dot plus plain text** instead of a filled pill. Summary rows (rolled up) are muted. The Risks plan pane already uses the dot. | `styles.css` `.st`, `30-grid.js` |
| **2. Built** | Outline name cell, toolbar, Risks plan pane | Indicators are colour emoji (💬 speech bubble, 🛡 shield, 📋 📄 🗑 in the toolbar, 👥 on team chips). They draw the eye more than the data does and clash with the flat, muted UI. | Draw these emoji in **monochrome** at reduced opacity (`filter: grayscale(1)`), brightening on hover or when selected. The glyphs and tooltips are unchanged, so nothing has to be relearned. | `styles.css` |
| **3. Built** | Risks table | Every row carries an uppercase **RISK** or **MIT.** badge, though bold text and indentation already show the hierarchy. The **Achieved** column shows a ✗ on every unfinished mitigant, and "0 of 3" on the risk repeats the "Mitigating · 0/3" badge beside it. A permanent toolbar hint repeats the ⠿ tooltip. | Drop the badges. Show **✓ only when achieved** (blank otherwise), and leave the risk row's Achieved cell blank, since the badge has the count. Move the drag hint into the ⠿ tooltip only. | `46-risks.js`, `index.html` |
| **4. Built** | RACI matrix | A wide **Warnings** column is always drawn, empty on most plans. Team headers say "**1 people**". The toolbar hint is a sentence long and gets clipped ("Clic…") at 1600 px. | Draw the Warnings column only when a row has a warning. Write "1 person". Shorten the hint to `Click a cell for a role · keys R A C I, Del`, with the long version in its tooltip. | `50-views.js` |
| 5 | Plan toolbar | 22 controls in one row: four add buttons, five icon buttons, the Expand select, the filter, Everyone, Record, five grain buttons and Today. ↑/↓ duplicate dragging the WBS cell and Alt+Shift+↑/↓. | Collapse Day/Week/Month/Quarter/Fit into one select or a smaller segment; move ↑/↓ into a ⋯ overflow; drop the "📄 Record" label to an icon. | `index.html` |
| 6 | Issues page | Each row has an uppercase **WARNING** or **INFO** badge, and the text is wordy: "Dependency conflict: 1.2 Finish → Start → 2.1: dates don't satisfy the link". | Use a ⚠ or ⓘ glyph instead of the badge. Write "Starts before 1.2 finishes" (one sentence per link type). | `50-views.js`, `20-model.js` |
| 7 | Header save pill | "Not saved to a file" sits in orange all the time while work is only in the browser, so it becomes wallpaper. | Show "Browser only" in muted text and keep orange for real trouble (save failed, reconnect needed). Needs care: it's a safety indicator. | `50-views.js` |
| 8 | People page | Every row has **Involvement** and **Edit…** buttons, eight repeated buttons on the sample. | Show them on row hover or focus only (keyboard focus keeps them reachable). | `50-views.js`, `styles.css` |
| 9 | Risks table | Every mitigant has a **＋ Task** button, even when tasks are already linked. | Show it on row hover or focus, or only when the mitigant has no task. | `46-risks.js` |
| 10 | Record panel header | The breadcrumb, a **TASK** kind badge, the WBS and the name stack four lines before the first field. | Drop the kind badge for tasks (milestones keep ◆), and put the breadcrumb on the same line as the Back button. | `45-form.js` |
| 11 | Outline Predecessors | "2.1SS+2d" runs the WBS and the type together. | Render "2.1 SS+2d" (display only; parsing already accepts both). | `20-model.js` `fmtPred` |
| 12 | Outline Duration and % | Milestones show "0d", and summary rows show rolled-up "%" in the same weight as editable cells. | Show "◆" (or blank) for a milestone's duration; muted text for rolled-up cells. | `30-grid.js` |
| 13 | Top tabs | "RACI matrix" and "People & teams" are longer than needed. | "RACI", "People". | `index.html` |
| 14 | Risks P · I cell | Two tiny selects with "P" and "I" letters, cramped and hard to hit. | One "M/H" chip that opens a small 3×3 picker. | `46-risks.js` |
| 15 | Header brand | "Offline PM" takes header width but does nothing. | Drop it, or make it the File menu button. | `index.html` |
| 16 | Plan toolbar | "Expand…" is a select used as a menu, so it shows a dropdown arrow and a placeholder. | A small "Levels ▾" menu button, like File. | `index.html` |
| 17 | Undo/redo | ↶ ↷ are thin and low-contrast, and their disabled state is hard to tell apart. | Heavier glyphs and a clear disabled opacity. | `styles.css` |
| 18 | Outline % column | "0%" on every not-started row repeats what Status already says. | Leave % blank while a leaf task is Not started at 0%. | `30-grid.js` `cellHtml` |
| 19 | Empty states | "No issues. Nice plan!" and other jokey texts. | Plain wording: "No issues." | `50-views.js` |
| 20 | Gantt | Summary bars use a white bracket that is brighter than the task bars. | A muted colour for summary bars. | `styles.css` |

Items 5–20 are proposed, not built. Items 5 and 7 have the most impact after the built ones, but they change where things are (5) or a safety signal (7), so they need the owner's say.

## Adversarial review

A separate reviewer read the code changes and tried to break them. What it found, and what was done:

| Finding | Outcome |
|---|---|
| Dates with a year ("28 Sep 27") are tight in a 76 px column, and the inline date editor shrank to 116 px, too narrow for the browser's date picker. | **Fixed:** columns 80 px, date editor 136 px. Checked with a 2027 date. |
| The muted status text on summary rows (opacity .75) failed contrast in the light theme. | **Fixed:** opacity removed. |
| Greying whole toolbar buttons also greyed their focus ring. | **Fixed:** only the emoji (`.ico`) is greyed. |
| An Accepted risk with mitigants lost its "n of m". | **Fixed:** kept for Accepted risks. |
| RACI spacer rows had one column too many when the Warnings column is hidden. | **Fixed:** the real column count is passed in. |
| Tests could leave `pm.hideWarn` and the RACI view setting behind. | **Fixed:** try/finally restores both. |
| Printed pages after page 1 had no year. | **Fixed:** print always shows the year. |
| The risk and mitigant records still show ✗ while the grid shows blank. | **Kept:** the record is the detail view, where "✗ Not yet" is the explanation; the grid is the overview. |
| Without badges, a long wrapped risk name could look like a mitigant. | **Kept:** risk rows also have a shaded background and a top border. |
| Risk gaps aren't in Issues, so with icons hidden only the Risks tab count shows them. | **Kept:** the Risks tab count and the Gaps filter stay; the switch's job is to hide the marks. |
