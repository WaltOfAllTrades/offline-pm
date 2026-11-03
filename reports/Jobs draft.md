# Jobs you do in Offline PM (draft)

A first guess at the work you come to the app to get done, drafted from what the app can do. It's meant to be edited:

- **Keep / Drop:** cross out the jobs you don't do.
- **How often:** daily, weekly, monthly or rarely. Frequency decides what we storyboard first.
- **Add:** anything you do that isn't here, especially work you do *outside* the app because the app is awkward for it.
- **Reword:** if a "When…" line doesn't sound like you, rewrite it. Your words are the point.

Each job reads *When [situation], I want to [action], so I can [outcome]*. Under it, **Today** is how the app handles it now, and **Friction** is what the review found. ★ marks jobs that move through records, which is where the Back / "new record opens" questions live.

---

### Planning

**1. Rough out a new plan.** Keep / Drop · How often: ____
When a project starts, I want to get phases and tasks down quickly, so I can see the shape of the work before worrying about details.
- Today: type in the outline (Insert, Enter, then indent with Alt+Shift+→), or import a spreadsheet.
- Friction: each new row starts as "New task" with today's date. You can't paste a list of names to make several tasks at once.

**2. ★ Break a phase down.** Keep / Drop · How often: ____
When I'm working on one phase, I want to add its subtasks and fill in each one, so I can turn a vague work package into real tasks.
- Today: ＋ Subtask in the outline, or ＋ New subtask in the record panel.
- Friction: from the panel, the subtask is created but doesn't open, and a message tells you to go and find it. Once you're inside the new task there's no way back to the phase except the breadcrumb.

**3. Bring in a plan someone else made.** Keep / Drop · How often: ____
When someone sends me a plan in Excel, I want to load it without retyping, so I can start from their work.
- Today: a four-step import wizard that maps columns, statuses and people.
- Friction: none found in this review; the wizard wasn't tested in depth.

**4. ★ Schedule the work.** Keep / Drop · How often: ____
When the tasks exist, I want to set dates and say what depends on what, so I can see whether the end date holds.
- Today: type dates in the outline, drag bars, type predecessors (`1.2FS+3d`), or drag between bars. Red arrows show conflicts, and nothing moves on its own.
- Friction: the link handles only show on hover. In the record panel, "Add predecessor" is a long dropdown with no search.

**5. ★ Decide who owns what.** Keep / Drop · How often: ____
When the plan is roughed out, I want to give each task an Accountable and a Responsible, so I can see that nothing is unowned.
- Today: the R/A cells in the outline, the RACI matrix (just rebuilt with a role picker and keyboard), and the record panel's People tab.
- Friction: being fixed. Still open: adding a new person mid-assignment uses a browser pop-up.

### Running the project

**6. ★ Do a status pass.** Keep / Drop · How often: ____
When it's time for my weekly check, I want to walk through what's due or in progress and update it, so I can trust the plan again.
- Today: no "what's due" view. You scroll the outline, filter by person, and edit % and status cell by cell or record by record.
- Friction: nothing gathers "this week's tasks". Moving record to record uses ▲/▼ in outline order, not "next task that needs me".

**7. ★ Write down what happened.** Keep / Drop · How often: ____
When a meeting or conversation changes something, I want to note it against the task it's about, so I can remember why things changed.
- Today: work notes in the record panel. Ctrl+Enter posts, and parent tasks show their subtasks' notes.
- Friction: the notes box is below the full Details form, so you scroll first. There's no quick "add note" from the outline.

**8. ★ Work out why something is late or stuck.** Keep / Drop · How often: ____
When a date slips or a task is blocked, I want to follow what it depends on and what depends on it, so I can find the real cause and who to talk to.
- Today: the Predecessors and Successors tabs, red arrows, the Issues view.
- Friction: every jump replaces the record you were on, with no Back. Following a chain three links deep loses where you started.

**9. Check the plan's health before I share it.** Keep / Drop · How often: ____
When I'm about to send the plan out, I want to see its problems in one place, so I can fix the embarrassing ones first.
- Today: the Issues view (warnings, RACI, dependencies, dates) and Gaps on the Risks page.
- Friction: clicking an issue jumps to the task in the outline but doesn't open its record or the issue.

### Risks

**10. ★ Turn a risk register into tracked work.** Keep / Drop · How often: ____
When I get a list of risks and mitigations, I want to split them into mitigants and tie each to tasks, so I can prove each risk is handled.
- Today: the Risks page, Split into mitigants, drag a mitigant onto the plan, ＋ Task.
- Friction: drag is the main way to link. A new task from ＋ Task opens a small pop-up rather than its record.

**11. Close out the risks.** Keep / Drop · How often: ____
When the project ends, I want a report of which risks were handled and how, so I can hand over cleanly.
- Today: the Closeout report, which you can print or export.

### Sharing

**12. Send the plan out and take updates back.** Keep / Drop · How often: ____
When others need to see or update the plan, I want to give them something they can open, and fold their changes back in, so I don't have to retype their edits.
- Today: the .db file, Excel export and update-mode import, PDF print.

**13. Keep the roster current.** Keep / Drop · How often: ____
When people join, leave or change teams, I want the list updated, so I can assign work to real people.
- Today: the People & teams page, edited in a modal.

---

## Questions for you
1. Which three jobs take most of your time in the app?
2. Is there anything you keep in another tool (a notebook, Excel, email) because the app doesn't fit it?
3. Do you mostly start from the outline, the Gantt, or a record?
4. When you jump to another task to check something, do you want to come back, or do you usually carry on from there?
