# Manual Browser-Test Checklist

Run before calling any release good. Start the app with
`node server.js` (or `ANTHROPIC_API_KEY=... node server.js` to test AI),
open http://localhost:8000. Fixtures live in `scripts/fixtures/`.

## 1. Clean new analysis (stale-data regression)

- [ ] Do anything in the wizard (type an exam name, upload a file), then click
      **New Analysis** in the nav → the "Start fresh, or continue?" screen
      appears and names your leftovers.
- [ ] Click **Start a fresh analysis** → Step 1 fields blank; Step 2 "No result
      files yet"; Step 3 "No exam files yet"; Step 4 no key; Results says
      "no analysis has been run".
- [ ] Saved analyses (if any) are still on the Saved page.

## 2. Fixture flow (the canonical end-to-end)

- [ ] Step 1: name "Fixture Test", subject ELA, grade 8 (blank fields block
      Continue with friendly errors).
- [ ] Step 2: upload `student-rows.xlsx` → "✓ Parsed — 12 students, 10 questions".
- [ ] Step 3: upload `exam-questions.pdf`, `passage.pdf`, `passage-unmatched.pdf`
      → 5 questions (1 partial); "The Story" classified passage; try the
      Treat-as override; upload `scanned.pdf` → honest no-OCR refusal.
- [ ] Step 4: upload `answer-key.pdf` → grid fills A B C D A B C D A B with a
      review notice. Try `answer-key-partial.pdf` → Q6/Q7 reported missing,
      left blank.
- [ ] Step 5: "Uploaded Data" banner; "Exam text detected" shows "The Story"
      linked to Q1–5 and "A Different Tale" unmatched; a warning notes exam
      text covers 5 of 10 questions.
- [ ] Run → Results: 12 students / 1 section / 10 questions. **Q5**: Possible
      key error card with severity chip, "Partial text — needs review",
      its real stem quoted, % correct stat, limitations list. **Q9**: Watch
      List, "Data only", "no question text uploaded". No demo numbers (129/
      Strange Orchid) anywhere.

## 3. Real files (the fixtures are self-generated — these matter most)

- [ ] A real Excel or Google-Sheets exported .xlsx of class results.
- [ ] A real word-processor exam PDF → expect full, partial (labeled), or an
      honest refusal; verify nothing invented.
- [ ] A real answer-key PDF.

## 4. AI feedback

- [ ] WITHOUT a key (`node server.js`): click "AI-assisted feedback" on a
      flagged card → privacy/cost notice → Send → honest "not configured".
- [ ] With `ANTHROPIC_API_KEY` set: same flow → structured feedback appears,
      advisory-framed; no revision text on partial/data-only questions.
- [ ] Via `python3 -m http.server` instead: button reports service unreachable;
      deterministic report unaffected.

## 5. Save / load

- [ ] Results → "Save analysis" → appears on Saved page with metadata.
- [ ] Rename, Duplicate (edit the copy — original untouched), Archive
      (moves to the Archived filter), search box filters.
- [ ] Reopen a save → exactly that analysis; then New Analysis → Start fresh
      → clean slate again, saves intact.
- [ ] Export backup (JSON) and re-import it.

## 6. Exports

- [ ] Results "Export data (CSV)": filename like
      `exam-detective_fixture-test_grade8_ela_<date>_uploaded_data.csv`;
      Source row inside says uploaded; question rows match the screen.
- [ ] Demo results export: `_DEMO_` in filename and DEMO DATA inside.
- [ ] Reports → Teacher Review → Download HTML opens standalone with styling;
      includes the AI block only if you fetched feedback first.
- [ ] Print / Save as PDF: cards don't split; interactive buttons hidden;
      source banner still visible.

## 7. Mobile width (narrow window)

- [ ] Nav scrolls horizontally; wizard steps collapse to numbers; cards,
      key grid, and heat map remain usable.
