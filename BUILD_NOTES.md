# Build Notes

Last updated: 2026-06-12 (multimodal ingestion: CID/CMap PDF decoding, document classification, SmartMarks adapter, booklet parsers, visual-evidence flags, upload audit)

## Ingestion pipeline (js/pdf-extract.js + js/ingest.js)

- The PDF core now decodes real-world generator output: sequential object
  scanning (never reads inside stream bodies), PDF 1.5 object streams,
  per-font ToUnicode CMaps (1- and 2-byte CIDs, hex + literal strings),
  glyph-run line assembly, per-PAGE text with embedded-image detection.
  Verified against four real teacher uploads (SmartMarks item analysis,
  compact multi-column key, questions booklet, readings booklet) in
  scripts/fixtures/real/ — committed at the owner's explicit request as
  regression fixtures (private repo; contains real exam material).
- Every file is CLASSIFIED by content signatures (student_results /
  answer_key / questions_booklet / readings_booklet / unknown_or_failed)
  then parsed by the matching ADAPTER; wrong-slot uploads are cross-routed
  with specific messages. New formats = new adapters, not rewrites.
- SmartMarks adapter: question blocks (Average score, Discrimination,
  Marks=1.0 → correct answer) zipped with ▼▼-anchored distribution groups
  per page; validates continuity, single correct answer, avg-vs-share,
  ~100% sums; counts estimated from percentages are labeled estimates.
- Questions-booklet adapter: range-driven anchoring (cover examples can't
  hijack numbering), a./b./c./d. options, section→reading mappings, and
  VISUAL-DEPENDENCY detection (comic/image/graph/chart/diagram/map…).
- Readings-booklet adapter: roman-numeral selections with title/author/
  genre/question range/page range/line-numbering; image pages flagged.
- NO OCR AND NO VISION MODEL: image/comic pages and visual-dependent
  questions are honestly flagged ("review by eye"), never interpreted.
  Page images are NOT rendered/stored (no PDF rasterizer dependency).
- Results page gains an Upload & Readability Audit (file, detected type,
  pages, images, extracted, used-or-not) plus key provenance; AI evidence
  packets carry a visualEvidence flag.

## Data-integrity model (read this before touching state code)

- Wizard state lives under `examdetective.wizard` and carries an
  `analysisId`. **Bare `#/new-analysis`** (the nav/dashboard buttons) shows a
  start-fresh-or-continue choice whenever ANY previous state or open results
  exist; "Start fresh" (`ED.wizard.startFresh()`) wipes the wizard (files,
  parsed sections, exam text, passages, key, extraction notices, demo flag),
  closes the active results, and issues a new analysisId. A dashed
  "Start over" link in the wizard step bar reaches the same choice.
- localStorage audit: `examdetective.wizard` + `examdetective.active` are
  per-analysis (cleared by fresh start); `examdetective.saved` changes only
  via explicit Save/Reopen/Delete/Import; `examdetective.settings` and
  `examdetective.profile` are deliberate cross-analysis user preferences.
  Saved analyses load ONLY via the Saved page's Reopen button.
- A question with zero recorded responses is **excluded from scoring**
  (`dataQuality.noResponses`), never shown as "100% missed", gets no flags
  or answer-choice analysis, is left out of student-average denominators,
  and is called out on the Review step and in the opening summary.

## How to run it

No installation, no build step.

**Easiest:** double-click `index.html` — everything works except the
"Download HTML" button and AI feedback.

**Best:** `node server.js` then http://localhost:8000 — everything works;
add `ANTHROPIC_API_KEY=...` to enable AI-assisted feedback (AI_SETUP.md).
`python3 -m http.server 8000` also serves the app (no AI endpoint).

**Tests:**

```
node scripts/csv-test.js       # parsing, data honesty, state integrity, categories (118)
node scripts/xlsx-pdf-test.js  # XLSX/PDF parsing + exam-text evidence (109)
node scripts/smoke-test.js     # every page in empty/demo/uploaded states
node scripts/ai-test.js        # AI feedback layer + server boundary, fully mocked (41)
node scripts/real-pdf-test.js  # the four REAL teacher PDFs end-to-end (64)
```

Run all four after any change to `js/` or `server.js`. Binary fixtures are
committed; regenerate with `node scripts/make-fixtures.js` only if their
content needs to change. Browser releases: MANUAL_TEST_CHECKLIST.md.

## What has been built

### Real (not simulated)
- **Exam-question & passage parsing** (`js/exam-parse.js`, wizard Step 3) —
  text-based PDFs and .txt files are parsed for real: question stems and
  answer choices extracted ("1. …" + "A. …" patterns), section markers like
  "The Story (Questions 1–5)" detected, passage titles and word counts read.
  Files are auto-classified exam-vs-passage with a manual override. Honest
  limits everywhere: scanned PDFs refused (no OCR), custom encodings refused,
  partial extractions labeled partial, missing wording never invented.
- **Passage↔question linking — explicit evidence only.** A passage is linked
  to a question range only when a "Questions X–Y" marker matches its title
  (or appears inside the passage itself). Anything else is labeled
  "Unmatched — needs review". No guessed links.
- **Evidence in results** (`js/analysis-builder.js`) — flagged questions on
  uploaded data now show their real extracted wording, answer-choice text
  with vote shares, and an evidence-availability chip: Data only / Key
  conflict in files / Question text available / Question + passage available
  / Partial text — needs review. The "what to check" prose quotes the keyed
  and most-chosen answers verbatim. Flag rules themselves stay data-driven —
  the app quotes evidence, it doesn't rule on it. Results group by the
  exam's own section markers when present.
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
  refused rather than producing garbage. Key formats: numbered lists,
  table cells on separate lines, compact multi-column rows, lowercase
  letters, keys split across pages. Wrong-document uploads are detected
  and cross-routed.
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

- **Result PDFs are parsed** (text-based item-analysis tables: question +
  percent rows, "Students: N", optional Key column → aggregate sections).
  Chart/image layouts, scans, and custom encodings get specific refusals.
  Wrong-document uploads are cross-routed ("this looks like an answer key —
  Step 4"). Analysis never runs without an answer key (typed, pasted,
  extracted, or embedded in the result files) — no guessing, no reuse
  across analyses — and every uploaded-data report states which key was
  used (file, entry count, gaps/conflicts, count match).
- **Scanned-PDF OCR** — not built; scans are detected and refused honestly.
- **Exam-question extraction depends on conventional layouts** ("1." stems,
  "A." choices, single-column). Real-world exam PDFs with tables, two-column
  layouts, or images may extract partially — partial results are labeled,
  but expect variation. Bug reports with a sample PDF are the way to harden it.
- **No content judgment** — the app quotes extracted wording as evidence but
  still doesn't judge whether an answer is defensible (that would need real
  AI integration; nothing is faked meanwhile).
- **Fixtures are self-generated** (`scripts/make-fixtures.js` follows the
  ECMA-376/ZIP and PDF specs), so a real Excel-exported .xlsx and a real
  word-processor exam PDF should be part of the first browser test.
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

Manual browser pass of the full evidence flow: Step 2 →
`scripts/fixtures/student-rows.xlsx`; Step 3 →
`scripts/fixtures/exam-questions.pdf` + `passage.pdf` +
`passage-unmatched.pdf` (expect: 5 questions extracted with Q5 partial,
"The Story" linked to Q1–5, "A Different Tale" unmatched); Step 4 →
`answer-key.pdf`; run. Results should quote real question wording on the
flagged cards with evidence chips. Then repeat with a REAL word-processor
exam PDF and a real Excel .xlsx — the committed fixtures are self-generated.
After that, the next build candidates are Supabase cloud saving
(AUTH_AND_STORAGE_PLAN.md) or saved-analyses management (search/duplicate).
