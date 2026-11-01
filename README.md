# Offline PM

A project-planning tool that is **one HTML file** and needs no network. Open `offline-pm.html` in **Chrome or Edge**.

## Using it
- **First run** shows a sample plan ("Website relaunch"). Use the project menu (top left) to add your own projects, or delete the sample one.
- **Save to a file:** File → *New plan file…* (or *Save a copy as…*) picks a `.db` file. After that, every change is written to it automatically. The pill at the top shows the save status; click it for the save log.
  - Until you pick a file, work is kept only in this browser.
  - After a page refresh Chrome may ask you to click **Reconnect**.
  - Only one tab can edit at a time. Others open read-only, with a button to take over.
  - If the app ever has to replace work that exists nowhere else (for example, the file and the browser both changed), it keeps a copy: File → *Recover replaced copies…*.
  - Only Offline PM plans can be opened. Any other SQLite file is refused and left unchanged.
- **Share with your team:** send the `.db` file (they open it with File → *Open plan file…*), an Excel export, or a PDF (File → *Print / save as PDF*).
- **Import:** File → *Import from Excel / CSV…* runs a four-step wizard: choose the file and sheet, map columns, map statuses and people, then preview. It rebuilds the outline from WBS numbers (1.2.3), outline levels, a parent column or name indentation.
  - An exported workbook can be edited in Excel and re-imported in **Update** mode. Rows are matched by the ID column.
- **Record form:** click ↗ next to a task name (or 📄 Record, Ctrl+I, or double-click a Gantt bar). A panel slides in over the outline with the task's fields, a mini Gantt of its subtasks (for parents), dated work notes you can edit, and tabs of related records (subtasks, links, RACI, issues, and RAID coming soon). The Gantt stays visible: click a bar to switch records. Esc closes it.
- **Keyboard:** see File → *Help & shortcuts*. The main ones: Insert, Tab/Shift+Tab, Enter, Delete, Ctrl+Z.

## Files
| Path | What it is |
|---|---|
| `offline-pm.html` | **The app**, built from `src/` |
| `src/index.html`, `src/styles.css`, `src/js/*.js` | Source. The JS files are concatenated in name order into one scope |
| `src/build.ps1` | Build script. It inlines the CSS, the JS, SQLite WASM and SheetJS from `libs/`, and writes the Content-Security-Policy with a hash of each inline script |
| `libs/` | sql.js 1.10.3 (SQLite 3.45.2) and SheetJS 0.18.5 |
| `tests/tests.js` | Automated test suite, run inside the app page |
| `STORIES.md` | User stories and acceptance criteria |
| `DECISIONS.md` | Questions that came up and the decision taken for each |
| `reports/`, `research_notes/` | The platform research behind the design |
| `poc/` | The earlier live-save proof of concept |

## Build
```powershell
powershell -ExecutionPolicy Bypass -File src\build.ps1
```

## Test
Serve the folder locally (the tests wipe the page's data, so never run them against real work in your `file://` copy):
```powershell
python -m http.server 8766 --bind 127.0.0.1
```
Open `http://127.0.0.1:8766/offline-pm.html`, then run this in the DevTools console:
```js
await new Promise(r => { const s = document.createElement('script'); s.src = '/tests/tests.js?' + Date.now(); s.onload = r; document.head.append(s); });
await runPmTests();   // → { total, passed, failed: [...] }
```
