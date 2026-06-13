# Backlog & Implementation Plan

Last updated: 2026-06-12. Status legend: ✅ done · 🔶 partial · ⬜ not started

## Current pass (phases)

1. ✅ **Results report quality + evidence integrity** — issue categories
   (deterministic rules), severity, % correct, blank-response rate,
   distribution with extracted choice text, per-card limitations ("what the
   app can't confidently say"), missing-data cards that never get
   answer-choice suggestions.
2. ✅ **Controlled AI-assisted feedback** — evidence packets built from
   current-analysis data only; structured-JSON contract; gated rendering
   (no revision suggestions without sufficient question text); explicit UI
   states (not configured / unavailable / malformed / rate-limited / empty);
   privacy+cost notice; deterministic reports unaffected by AI failure.
   Tests fully mocked.
3. ✅ **Backend boundary for AI** — `server.js` (Node built-ins only):
   static hosting + `/api/ai-feedback`; `ANTHROPIC_API_KEY` via env, never
   in frontend; packet validation; safe errors; honest 503 when
   unconfigured.
4. 🔶 **Supabase auth + cloud saving** — local saved-analysis management
   (rename, duplicate, archive, search/filter) is done; cloud layer is an
   honest "not configured" state + config detection + setup docs
   (AUTH_AND_STORAGE_PLAN.md). Real Supabase wiring needs the owner's
   credentials — blocked, by design not faked.
5. ✅ **Export improvements** — metadata filenames (exam/grade/subject/date/
   source), AI feedback included in HTML/print report only when it exists,
   DOCX still honestly "planned".
6. 🔶 **Complex-PDF hardening** — inline answer choices ("1. Stem A. x B. y"),
   multiple options per line, page-header/footer stripping, split options.
   Multi-column PDFs remain unreliable (no positional data used) — refused
   or partial, clearly labeled.
7. ✅ **Docs + manual browser-test checklist** — MANUAL_TEST_CHECKLIST.md.

## Multimodal ingestion pass (2026-06-12) ✅
Real CID/CMap PDF decoding, classification + adapter architecture,
SmartMarks/key/questions/readings adapters validated against the four real
teacher uploads, visual-evidence flags, upload audit. NOT built: OCR,
vision-model interpretation, page-image rendering/storage (needs a
rasterizer dependency — flagged honestly in the UI instead).

## Remaining after this pass

- Real Supabase project wiring + Google OAuth (needs owner credentials;
  exact steps in AUTH_AND_STORAGE_PLAN.md).
- DOCX export (needs a docx library decision — deliberately deferred).
- OCR for scanned PDFs (explicitly out of scope until intentionally built).
- Positional (coordinate-aware) PDF parsing for true multi-column layouts.
- Result-PDF parsing (results come from CSV/XLSX only).
- Multi-analysis concurrent storage beyond saved-analysis records.

## Test commands

```
node scripts/csv-test.js       # CSV parsing + data-honesty + state integrity
node scripts/xlsx-pdf-test.js  # XLSX/PDF parsing + evidence integration
node scripts/smoke-test.js     # every view in empty/demo/uploaded states
node scripts/ai-test.js        # evidence packets, AI contract, server validation (mocked)
```
