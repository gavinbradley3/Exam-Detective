# Build Notes

Last updated: 2026-06-11 (data-honesty + CSV parsing release)

## How to run it

No installation, no build step.

**Easiest:** double-click `index.html` — everything works except the
"Download HTML" report button (browsers block fetching files from disk;
use Print → Save as PDF instead).

**Best:** serve it locally so everything works:

```
cd Exam-Detective
python3 -m http.server 8000
```

then open http://localhost:8000.

**Tests:**

```
node scripts/smoke-test.js   # renders every page, demo + uploaded + empty states
node scripts/csv-test.js     # CSV parser + data-honesty tests (53 checks)
```

Run both after any change to `js/`.

## What has been built

### Real (not simulated)
- **CSV parsing** (`js/csv-parse.js`) — two layouts: one row per student
  (Q1, Q2 … columns with answer letters or correct/incorrect marks) and one
  row per question (Question + % Correct / counts, optional Key, Responses,
  A–D distribution columns). Handles quoted fields, BOM, messy rows;
  rejects unusable files with plain-English errors naming the needed columns.
  Sample CSV downloadable from wizard Step 2. Test fixtures in `scripts/fixtures/`.
- **Analysis from uploads** (`js/analysis-builder.js`) — every number and
  sentence computed from parsed data. Transparent flag rules: Possible Key
  Error (≥50% chose one non-keyed answer while the key drew ≤25%, or the
  file's own key disagrees with the entered key), Watch List (≥60% combined
  missed, or a ≥30-point section gap). It does NOT judge wording/fairness —
  the output says explicitly that the exam text wasn't read.
- **Data-source honesty** (`js/data-store.js`) — one ACTIVE dataset at a
  time, demo or uploaded, never mixed. Every results page, report, dashboard,
  comparison, and export carries a "Demo Data" or "Uploaded Data" banner with
  file/student/section counts. If uploads exist but none parsed (PDF/XLSX
  only), the run is blocked with an honest message — no fake results page.
- **Manual answer key to 130 questions** — count field, paste-to-fill
  (extracts letters from "A B C D…" or "1. A 2. B…"), grid grouped in rows
  of ten. Demo key (75) loads only in demo mode.
- **Settings start blank** — no pre-chosen subject/grade/format; a "still to
  decide" status box; defaults the teacher sets seed the wizard. Wizard
  Step 1 validates required fields (exam name, subject, grade) with friendly
  messages and blocks continuing.
- **Saved analyses** (`js/views/saved.js`) — save/reopen/delete in browser
  localStorage (clearly labeled local, not cloud), plus JSON backup
  export/import.
- **Sign-in page** (`js/views/login.js`) — local profile works now; the
  Google button is visibly disabled and labeled "not connected".
  See AUTH_AND_STORAGE_PLAN.md for the real path.
- **Exports** — Results-page "Export data (CSV)" exports the active dataset
  with its source stated inside the file (DEMO files are marked in content
  and filename). Department list CSV likewise. HTML report download and
  Print → PDF kept working for demo and uploaded data.

### Demo (clearly labeled wherever it appears)
- The five-section Grade 8 ELA sample exam, loadable from wizard Step 2,
  always wrapped in "Demo mode" / "Demo Data" banners.

## What was verified

- Both test suites pass: smoke (all views: empty, demo, uploaded states)
  and csv-test (53 checks: parsing, one-class-in-one-class-out, student
  totals from CSV, 130-question key incl. Q130 edit/save, blank settings,
  step-1 validation, export source markers, local save/reopen/backup).
- All files serve HTTP 200 from a local static server.
- No secrets committed (no keys exist — the app is static; verified by search).

## Not yet connected / known issues

- **PDF and XLSX parsing** — accepted with an explicit "not yet parsed"
  label; never analyzed. CSV is the only real path (deliberate: CSV first).
- **Exam-text analysis** — Step 3 files are recorded by name only. Uploaded
  data therefore gets no rewrites/"hard-but-fair" judgments, and the UI says so.
- **Google login / cloud storage** — not wired (static site, no provider
  keys). Local profile + local saves work now. Roadmap and exact setup:
  AUTH_AND_STORAGE_PLAN.md.
- **DOCX export** — still planned, shown as a dashed "DOCX — planned" tag,
  not a button.
- "Download HTML" needs a local server (falls back to a friendly message
  pointing at Print → PDF).
- Aggregate CSVs (one row per question): median shown as "—" and average
  marked estimated — honest limits of that format.
- Visual checks in a real browser are still pending (this environment has
  no browser): wizard click-through, key grid at 130, heat map, mobile
  widths, print output.

## Next safest step

Manual browser pass: upload `scripts/fixtures/sample-class-letters.csv`
through the wizard (with key A B C D A B C D A B), confirm Results shows
1 section / 12 students / Q5 key-error flag, then print it. After that,
the next build feature is XLSX parsing (SheetJS) or real exam-text ingestion.
