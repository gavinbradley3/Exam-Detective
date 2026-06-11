# Build Notes

Last updated: 2026-06-11 (XLSX parsing + PDF answer-key extraction pass)

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
node scripts/smoke-test.js     # renders every page, demo + uploaded + empty states
node scripts/csv-test.js       # CSV parser + data-honesty tests (53 checks)
node scripts/xlsx-pdf-test.js  # XLSX + PDF-key parsing tests (40 checks)
```

Run all three after any change to `js/`. Binary fixtures are committed;
regenerate them with `node scripts/make-fixtures.js` only if their content
needs to change.

## What has been built

### Real (not simulated)
- **XLSX parsing** (`js/xlsx-parse.js`) — reads the ZIP container and sheet
  XML directly using the platform-native `DecompressionStream` (modern
  browsers + Node 18+; older browsers get an honest error). **No library
  added.** Every sheet in a workbook is checked; sheet names become section
  labels; non-result sheets are reported as skipped. Reuses the exact same
  shape detection as CSV (`ED.csv.parseRows`), so both formats behave
  identically.
- **PDF answer-key extraction** (`js/pdf-extract.js`) — for **text-based**
  PDFs only: inflates FlateDecode content streams and reads the standard
  text operators, then extracts "1. A / 2) B / Q3: C" patterns. Reports
  found/missing/conflicting entries and always demands review. **Scanned
  (image-only) PDFs are detected and refused** with an explicit "no OCR"
  message; custom-font-encoded PDFs are detected (low printable ratio) and
  refused rather than producing garbage. Result PDFs (not keys) remain
  unparsed and labeled as such.
- **Key file upload** (wizard Step 4) — CSV/XLSX (Question + Key columns)
  or text-based PDF; extraction fills the grid, never silently — a review
  notice lists entry count, missing questions (left blank, not guessed),
  and conflicts.
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

- **Result PDFs** — accepted with an explicit "not yet parsed" label; never
  analyzed. (PDF *answer keys* ARE parsed when the PDF is text-based.)
- **Scanned-PDF OCR** — not built; scans are detected and refused honestly.
- **PDF exam-question / reading-passage extraction** — not built.
- **XLSX fixtures are self-generated** (`scripts/make-fixtures.js` follows
  the ECMA-376/ZIP spec), so a real Excel- or Google-Sheets-exported .xlsx
  should be part of the first browser test.
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

Manual browser pass: upload `scripts/fixtures/student-rows.xlsx` through the
wizard, then upload `scripts/fixtures/answer-key.pdf` in Step 4 — confirm the
key fills with a review notice, and Results shows 1 section / 12 students /
Q5 key-error flag. Also test one REAL Excel- or Sheets-exported .xlsx (the
committed fixtures are self-generated). After that, the next build candidates
are exam-text ingestion or Supabase cloud saving (AUTH_AND_STORAGE_PLAN.md).
