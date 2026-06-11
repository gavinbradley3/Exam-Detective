# Product Decisions

Last updated: 2026-06-11 (data-honesty + CSV parsing release)

## One active dataset; demo and uploads never mix

The first build silently showed demo numbers ("5 sections / 129 students")
after a real upload — misleading, and the kind of thing that kills trust with
teachers. Now exactly one dataset is ACTIVE at a time (demo or uploaded),
every surface carries a Demo Data / Uploaded Data banner with real counts,
loading the demo clears uploads (and vice versa), and if no uploaded file
could be parsed the run is blocked with an honest explanation instead of a
fake results page. Honesty beats impressiveness, every time.

## Uploaded data gets computed analysis, not invented prose

For uploaded CSVs, flags come from transparent thresholds (documented in
`js/analysis-builder.js`) and all explanation text is assembled from the
computed numbers. Judgments that require reading the exam (rewrites,
"hard but fair", passage support) are not made — the results say plainly
that the exam text wasn't analyzed. Demo data keeps its rich narrative
because it represents what the product will do once text analysis exists.

## CSV first, then XLSX and PDF keys — without adding dependencies

CSV came first; XLSX results and PDF answer-key extraction are now also
real. Both use the platform-native `DecompressionStream` (all modern
browsers, Node 18+) instead of a vendored library — XLSX is read as
ZIP + sheet XML, PDF keys as FlateDecode streams + text operators. This
keeps the no-build, no-dependency constraint intact; very old browsers get
an honest "can't unpack this here" error instead of a polyfill. Limits are
stated in the UI: PDF key extraction is text-based-PDF only, scanned PDFs
are refused (no OCR), custom-encoded PDFs are refused rather than guessed,
and extracted keys always require review. Result PDFs remain unparsed and
labeled. Rationale unchanged: one real path beats three fake ones.

## Settings (and the wizard) start blank

No pre-chosen subject/grade/format — placeholder text only, plus a
"still to decide" status box. Required decisions are enforced where they
matter: wizard Step 1 blocks continuing without exam name/subject/grade,
with human error messages. Defaults a teacher explicitly saves in Settings
do seed the wizard (their decision, labeled as such).

## Login: local profile now, no fake Google button

The app is static, so real Google login is impossible without provider
setup. The Sign-in page offers a working local profile (browser storage,
labeled as such) and shows the Google button disabled with an explanation
pointing at AUTH_AND_STORAGE_PLAN.md (recommended: Supabase Auth + Google
OAuth). A clickable button that pretends to work was explicitly rejected.

## Exports carry their source inside the file

CSV/HTML exports state "DEMO DATA" or "Uploaded data (n files)" in the file
content and in the filename, so a shared file can't quietly launder demo
numbers into a department meeting.

## Stack: plain HTML/CSS/JS, no framework, no build step

The brief asked for a single-page HTML/CSS/JS exam review website (the broader
spec mentioned Next.js as an option for new codebases). Plain HTML/CSS/JS won
because the owner is not a coding expert: the site runs by opening one file or
running one command, every file is readable as-is, and there is no toolchain to
break. It is still a real single-page app — one `index.html`, hash-based
navigation, views as plain functions, state in `localStorage`. If the project
later needs real parsing/AI backends, the views and data shapes port to a
framework cleanly because rendering, data, and logic are already separated.

## The Results page is a document, not a dashboard

The uploaded consolidated review report is the design contract
(DESIGN_REFERENCE_NOTES.md). The Results page deliberately reads like an
upgraded, interactive version of that document — serif question text, editorial
column, stat blocks, fix boxes, dark takeaway panel — with the web-native
additions (snapshot, priority table, key audit, collapsed details) styled to
match. Generic analytics-dashboard styling was explicitly rejected.

## Plain-English flags instead of raw metrics

Teachers see one of eight labels (Possible Key Error, Drop From Scoring, Accept
Multiple Answers, Immediate Action, Revise for Next Year, Hard but Fair, Watch
List, No Action Needed) plus a "pattern noticed" sentence. Item discrimination
and similar statistics never appear as columns or headings; when used as
evidence they live inside collapsed "Advanced Details" (which are also excluded
from printed reports). Rationale: most teachers don't interpret item statistics,
and a wrong-but-confident-looking number is worse than a clear sentence.

## "Possible Key Error" requires converging signals

A question is never labeled a key error just because many students missed it.
The label requires signals like: keys disagree across class files, the uploaded
key disagrees with detected keys, the keyed answer drew near-zero responses, or
the popular answer is better supported by the text. "Hard but Fair" exists
precisely so difficulty alone is never treated as breakage.

## Aggregate data only — careful claims

The app expects class-level reports, not student-level data. Wording avoids
claims that need student-level proof ("strong students missed this") in the
app's own UI copy, preferring "the answer pattern looks unusual" / "most
students chose a different answer than the key." Demo explanation text may cite
discrimination patterns because the demo presumes item-performance data was in
the uploaded reports.

## Neutral, no-blame comparison language

Department Comparison explicitly frames itself as "patterns, not rankings."
Section-specific divergence is described as pacing/missed-lesson/class-pattern
possibilities and "a conversation, not a verdict." This wording is a product
requirement, not a style preference — the tool dies in a department if it feels
like teacher surveillance.

## Privacy / responsible use posture

Present but not scary: a standing notice in the footer, on the landing page,
Help, and Settings; delete buttons in Settings; a note that suggestions are
advisory and mark changes need human review. In the demo build nothing leaves
the browser, and the notice says so. `.gitignore` excludes uploaded exam
material patterns so real files don't get committed by accident.

## Mandatory "Review Detected Data" step

Analysis cannot be run before the user sees what the app detected (sections,
counts, keys, warnings). Bad parsing creates bad analysis; the review step is
the firewall. Warnings are written as full sentences with a next action, never
"Parsing failed."

## Demo content reuses the reference report's exam

The reference report's questions, stats, and recommendations were adapted as the
demo dataset (allowed by the brief: "exact old report content unless used as
demo data"). It's believable, it exercises every flag type, and it lets the
Results page be compared 1:1 against the reference. Browser-print artifacts and
file paths from the reference were not copied.

## Export strategy

PDF = browser Print → Save as PDF (works everywhere, zero dependencies, print
CSS keeps cards intact). HTML = standalone downloaded file with styles embedded.
DOCX = deferred — doing it well client-side needs a library; marked as planned
in the UI rather than shipped half-working.
