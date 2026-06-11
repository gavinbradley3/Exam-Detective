# Exam Detective

**Find the questions that need fixing.**

Exam Detective is a teacher-facing exam analysis tool. Upload exam results from
multiple class sections and it helps you spot possible answer-key errors, weak
questions, and class-wide patterns — then produces clean teacher/admin review
reports — before an exam is reused.

It is **not** a gradebook or a student tracker. It reviews questions, not students.

## Run it

No installation or build step needed.

- **Quick look:** open `index.html` in your browser.
- **Full experience** (enables the HTML report download):

  ```
  python3 -m http.server 8000
  ```

  then visit http://localhost:8000

The app ships with a realistic demo (five Grade 8 ELA sections, 75 questions,
three suspected key errors). Click **View Demo** on the landing page, or go
through **New Analysis → Load the demo files** to try the whole workflow.

## Test it

```
node scripts/smoke-test.js
```

Renders every page and validates the demo data. Run it after changing anything
in `js/`.

## Where things live

| Path | What it is |
|---|---|
| `index.html` | The single page; navigation shell |
| `css/main.css` | App styles (nav, cards, wizard, tables) |
| `css/report.css` | Results page & report styles (the editorial report look) |
| `js/data/demo-data.js` | Demo exam dataset — the data shape real parsing must produce |
| `js/analysis.js` | Flag definitions, priority order, validation warning copy |
| `js/report-blocks.js` | Shared report renderers (question cards, takeaway, …) |
| `js/views/` | One file per page |
| `js/app.js` | Hash router + event wiring |
| `BUILD_NOTES.md` | What's built, what's verified, what's next |
| `PRODUCT_DECISIONS.md` | Why things are the way they are |
| `DESIGN_REFERENCE_NOTES.md` | The design contract for the Results page & reports |

## Status

The full UI and workflow run on demo data. Real file parsing (PDF/CSV/XLSX) and
AI-assisted question judgment are the next features — see `BUILD_NOTES.md`.

## Responsible use

Exam Detective is designed for aggregate exam-result analysis. Avoid uploading
student names or personal information unless your school or district allows it.
Uploaded files may contain internal assessment materials, answer keys, and class
performance data — delete analyses when they are no longer needed. Suggestions
are advisory; always review them before changing marks.
