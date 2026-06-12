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
- **Full experience** (HTML report download + optional AI feedback):

  ```
  node server.js
  ```

  then visit http://localhost:8000. (`python3 -m http.server 8000` also
  works, minus the AI endpoint.) To enable AI-assisted feedback:
  `ANTHROPIC_API_KEY=sk-... node server.js` — the key stays on the server,
  never in frontend code. Details: `AI_SETUP.md`.

The app ships with a realistic demo (five Grade 8 ELA sections, 75 questions,
three suspected key errors). Click **View Demo** on the landing page, or go
through **New Analysis → Load the demo files** to try the whole workflow.

**Use your own data:** export class results as **CSV or XLSX** from your
assessment tool and upload them in New Analysis (a sample CSV showing the
accepted layouts is downloadable in the upload step). Both are parsed for
real — in XLSX workbooks each sheet becomes a class section. Answer keys can
be uploaded as CSV/XLSX or **text-based PDF** (scanned PDFs are refused
honestly — no OCR yet). Result PDFs are accepted but clearly marked "not yet
parsed". Every results page and export is labeled **Demo Data** or
**Uploaded Data** — the two never mix.

## Test it

```
node scripts/csv-test.js       # parsing, data honesty, state integrity, categories
node scripts/xlsx-pdf-test.js  # XLSX/PDF parsing + exam-text evidence
node scripts/smoke-test.js     # every page in empty/demo/uploaded states
node scripts/ai-test.js        # AI feedback layer + server boundary (mocked)
```

Run all four after changing anything in `js/` or `server.js`.

## Where things live

| Path | What it is |
|---|---|
| `index.html` | The single page; navigation shell |
| `css/main.css` | App styles (nav, cards, wizard, tables) |
| `css/report.css` | Results page & report styles (the editorial report look) |
| `js/data/demo-data.js` | Demo exam dataset — clearly labeled wherever it appears |
| `js/csv-parse.js` | Real CSV parsing (student-rows & aggregate layouts) |
| `js/xlsx-parse.js` | Real XLSX parsing (ZIP + sheet XML, no libraries) |
| `js/pdf-extract.js` | PDF text & answer-key extraction (text-based PDFs; scans refused) |
| `js/analysis-builder.js` | Builds honest, rule-based analysis from uploaded data |
| `js/data-store.js` | Active dataset (demo vs uploaded), local saves, JSON backup |
| `js/analysis.js` | Flag definitions, priority order, helpers |
| `js/report-blocks.js` | Shared report renderers (question cards, takeaway, …) |
| `js/views/` | One file per page |
| `js/ai-feedback.js` | Optional AI layer: evidence packets, strict contract, gated rendering |
| `js/cloud.js` | Honest cloud-sync status (Supabase not wired yet) |
| `server.js` | Static hosting + the AI API boundary (key via env only) |
| `js/app.js` | Hash router + event wiring |
| `MANUAL_TEST_CHECKLIST.md` | Browser test script for releases |
| `AI_SETUP.md` | AI feedback setup, privacy, cost, failure behavior |
| `scripts/` | Test suites + CSV fixtures |
| `BUILD_NOTES.md` | What's built, what's verified, what's next |
| `PRODUCT_DECISIONS.md` | Why things are the way they are |
| `DESIGN_REFERENCE_NOTES.md` | The design contract for the Results page & reports |
| `AUTH_AND_STORAGE_PLAN.md` | The real path to Google login + cloud saving |

## Status

CSV and XLSX uploads are parsed and analyzed for real (one class in = one
class out — never demo numbers), and answer keys can be extracted from
CSV/XLSX/text-based-PDF files with mandatory review. Result-PDF parsing, OCR,
exam-text analysis, and real Google login are not built yet, and the UI says
so wherever it matters — see `BUILD_NOTES.md` for the honest list.

## Responsible use

Exam Detective is designed for aggregate exam-result analysis. Avoid uploading
student names or personal information unless your school or district allows it.
Uploaded files may contain internal assessment materials, answer keys, and class
performance data — delete analyses when they are no longer needed. Suggestions
are advisory; always review them before changing marks.
