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

## 2b. Real-exam flow (scripts/fixtures/real/)

- [ ] Step 2 → `8C_2026.pdf` → "✓ Parsed — 26 students, 75 questions (PDF · SmartMarks item analysis)".
- [ ] Step 3 → `questions_booklet.pdf` (75 questions, 11 sections) + `readings_booklet.pdf` (11 selections, image pages flagged).
- [ ] Step 4 → `answer_key_grade8.pdf` → 75 entries.
- [ ] Step 5 shows the Q33 key mismatch warning (key says B, report says D).
- [ ] Run → Results: 26 students, Q33 Possible Key Error, Q70–75 visual-evidence chips, Upload & Readability Audit table, key provenance line.
- [ ] Wrong-slot test: upload the key PDF in Step 2 → routed to Step 4 with a specific message.

## 3. Real files (the fixtures are self-generated — these matter most)

- [ ] A real Excel or Google-Sheets exported .xlsx of class results.
- [ ] A real word-processor exam PDF → expect full, partial (labeled), or an
      honest refusal; verify nothing invented.
- [ ] A real answer-key PDF.

## 4. AI Deep Review (Run Analysis pipeline)

- [ ] WITHOUT a key (`node server.js`): Step 6 shows the "AI Deep Review"
      checkbox (checked by default) with the privacy/cost text. Run Analysis
      → progress log shows real steps (reading files, flag rules) then
      "AI Deep Review unavailable — no API key configured…" → results open
      with the "AI Deep Review unavailable" banner; every card is the
      deterministic version; nothing hangs.
- [ ] With `ANTHROPIC_API_KEY` set: Run Analysis → progress log shows
      "Building evidence packets…", then "Reviewing Q<N> with AI…" once per
      flagged question (bar advances with each), then "Writing the final
      teacher report…" → results show the green "AI Deep Review applied"
      banner, purple "AI DEEP REVIEW" chips on flagged cards, a firm
      recommended action (rescore / accept both / remove / no change /
      human review) instead of "check the key", and the
      "AI Deep Review — Department Synthesis" section before the Key Audit.
- [ ] Deterministic stats unchanged with AI on: MIN/MAX/COMBINED numbers,
      answer options with ANSWER KEY / MOST CHOSE pills, Key Audit, Upload
      & Readability Audit, Takeaway all match a deterministic-only run.
- [ ] Untick the checkbox → Run Analysis → no AI calls; log says Deep
      Review is turned off; no banner claims AI was used.
- [ ] Visual-dependent flagged question (comic/graph page): its verdict is
      "Human review required (visual)" and no rewrite is shown.
- [ ] Rewrites appear ONLY on cards whose full question text was extracted.
- [ ] Kill the server mid-run: remaining questions fall back; the banner
      lists which ones; the report still renders.

## 4b. Per-card AI feedback (older layer)

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

## 5b. Cloud sync (needs js/config.js + supabase-setup.sql run once)

- [ ] WITHOUT js/config.js: Sign in page shows the Google button disabled
      with "Not configured"; Saved page's cloud card says not configured.
      (The js/config.js 404 in the console is expected.)
- [ ] With config, signed out: real "Sign in with Google" button on both
      pages -> Google consent -> lands back on Saved, signed in, with your
      email in the nav and in the cloud card.
- [ ] Save current analysis to account -> appears in the account list;
      Reopen from the list restores the exact analysis; Rename and Delete
      work; Refresh list reflects changes.
- [ ] "Copy N local analyses to account" uploads them once — clicking it
      again uploads nothing (no duplicates), local list untouched.
- [ ] Sign in on a second browser/device: the account list shows the same
      analyses; a second Google account sees NONE of them (row-level
      security check — this one matters).
- [ ] Sign out: account list gone, local saves + everything else unchanged.
- [ ] Cancel the Google consent screen: back on the login page with an
      honest "Sign-in problem" notice, app fully usable.

## 6. Exports

- [ ] Results "Export data (CSV)": filename like
      `exam-detective_fixture-test_grade8_ela_<date>_uploaded_data.csv`;
      Source row inside says uploaded; question rows match the screen.
- [ ] Demo results export: `_DEMO_` in filename and DEMO DATA inside.
- [ ] Reports → Teacher Review → Download HTML opens standalone with styling;
      includes Deep Review verdicts + synthesis when the run used AI (and
      the per-card AI block only if you fetched feedback first).
- [ ] Print / Save as PDF: cards don't split; interactive buttons hidden;
      source banner still visible.

## 7. Mobile width (narrow window)

- [ ] Nav scrolls horizontally; wizard steps collapse to numbers; cards,
      key grid, and heat map remain usable.
