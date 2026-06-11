# Build Notes

Last updated: 2026-06-11

## How to run it

No installation, no build step.

**Easiest:** double-click `index.html` — it opens in your browser and everything
works except the "Download HTML" report button (browsers block file reading from
disk; use Print → Save as PDF instead, which always works).

**Best:** serve it locally so everything works, including HTML download:

```
cd Exam-Detective
python3 -m http.server 8000
```

then open http://localhost:8000 in your browser.
(Any static file server works — GitHub Pages will host it as-is too.)

**Test:** `node scripts/smoke-test.js` renders every page and checks the demo
data. Run it after any change to the `js/` folder.

## What has been built

- **Landing page** — hero, how it works, what it finds, department comparison,
  responsible use, FAQ.
- **Dashboard** — summary cards, recent analysis, top flagged questions.
- **New Analysis wizard** (7 steps) — setup, class result uploads with section
  labels, exam/booklet uploads, answer key upload + editable 75-entry key grid,
  mandatory Review Detected Data step with plain-English warnings, simulated
  analysis run with progress, then Results.
- **Results page** — the centerpiece. Editorial report layout mirroring the
  uploaded reference: teacher review header, opening summary, key/scoring
  warning, exam health snapshot, priority action list, passage-grouped question
  cards (stat block, options with labels, The Problem, Immediate Action for This
  Week, Fix for Next Year's Test Bank, suggested rewrites, collapsed Advanced
  Details), key audit summary, department pattern summary, The Takeaway.
- **Department Comparison** — overview cards, class table, 5×75 heat map with
  legend + click-for-details (accessible labels, not color-only), widespread vs
  section-specific lists, exportable department review list (CSV).
- **Reports** — Teacher Review Report (closest match to the reference),
  Department/Admin Summary, Question Bank Revision Report. Export: Print → PDF
  and standalone HTML download.
- **Help** — plain-language guide including what every label means.
- **Settings** — defaults, delete wizard data, full local reset, responsible use.
- **Demo data** — 5 Grade 8 ELA sections, 129 students, 75 questions, with key
  error, accept-multiple, drop-from-scoring, hard-but-fair, watch-list, and
  section-specific examples.
- **Smoke test** — `scripts/smoke-test.js` (Node) renders every view and
  validates the demo data shape.

## What was verified

- `node scripts/smoke-test.js` passes (19 view renders + data checks).
- All files serve with HTTP 200 from a local static server.
- Results page sections match the design reference flow (see
  DESIGN_REFERENCE_NOTES.md).

## Not yet connected / known issues

- **Real file parsing is simulated.** Uploads are listed and labeled, but the
  "detected data" always comes from the demo dataset. Real PDF/CSV/XLSX parsing
  is the next major feature; it should produce the same data shape as
  `js/data/demo-data.js` and the warning format in `js/analysis.js`
  (`DEMO_WARNINGS`).
- **AI-assisted question judgment is not connected.** Explanation text comes
  from the demo data.
- **DOCX export is planned, not built.** PDF (via print) and HTML work now.
- **"Download HTML" needs a local server** (see How to run it above). Without
  one it shows a friendly fallback message pointing at Print → Save as PDF.
- Only one analysis (the demo) exists at a time — multi-analysis storage is a
  later feature.
- Not yet checked in a real browser on this machine (no browser in the build
  environment). The smoke test covers rendering; click through the wizard,
  heat map, exports, and printing in your browser as the first manual test.

## Next safest step

Open the site in a browser and click through: landing → New Analysis → Load the
demo files → step through to Run Analysis → Results → Reports → print one.
Anything that looks off is cheap to fix now. After that, the next build feature
is real CSV parsing (CSV first — it's the simplest format) in a new
`js/parsing.js`, feeding the same data shape as the demo file.
