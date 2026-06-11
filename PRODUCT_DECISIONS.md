# Product Decisions

Last updated: 2026-06-11

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
