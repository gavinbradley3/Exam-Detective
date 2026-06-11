# Design Reference Notes

Source: uploaded file `ELA_8_Final_Exam_Review_2026.html`
("ELA 8 Final Exam — Final Question Review")

This file is the **design contract** for the Results page (`js/views/results.js`),
the report renderers (`js/report-blocks.js`, `js/views/reports.js`), and the
report styles (`css/report.css`). Update this file if the design direction changes.

---

## Layout structure

- Single centered column, **max-width 760px**, generous padding (48px top, 36px sides).
- White background for the report body (the app shell around it can use warm off-white).
- Clear vertical rhythm: cover header → intro paragraph → legend/notice box →
  repeated passage sections → dark takeaway panel → small centered footer caption.
- Every flagged question is a bordered, rounded **card** (1px light border,
  14px radius, ~24px internal padding, 26px gap between cards).
- `break-inside: avoid` on cards and the takeaway so printing never splits them.

## Typography

- Two-font system:
  - **Archivo** (sans): all headings, labels, stats, badges, and explanation prose.
  - **PT Serif**: body default and question/option text (gives the "document" feel).
- H1: Archivo 900, 42px, tight line-height (1.08), slight negative letter-spacing.
- Small **uppercase eyebrow labels** everywhere: 9–11px, 800 weight,
  wide letter-spacing (0.14em–0.32em). This is the report's signature detail.
- Explanation prose is small (13px) but generous line-height (1.62).
- Question stems: serif, bold, 17px.

## Color choices (reproduced as CSS variables in `css/report.css`)

- Deep teal family for structure/positive: `#0d5546`, `#123f36`, `#0f3a31`.
- Ink/near-black text: `#15201c`; secondary body `#3a4641`.
- Maroon/red for problems: `#a8402f` / `#b13a2c` with pale pink fills
  `#fbeeec` and borders `#e8c7c1`.
- Pale green fill `#e9f3ed` / border `#c4dccd` for correct answers and fix boxes.
- Cream `#f6f1e7` for the stat chips.
- Light gray-greens for rules and card borders (`#e4e7e4`, `#dfe3df`).
- Color is always paired with a text label (MOST CHOSE / ANSWER KEY) — never color-only.

## Heading hierarchy

1. Eyebrow (uppercase tiny label) → H1 (huge) → meta row (exam type · sections ·
   students · review date) separated by a thin rule.
2. Passage sections: roman-numeral chip (26px dark-teal square) + *italic serif*
   passage title + right-aligned "N questions requiring action" count.
3. Inside cards: small uppercase "label lines" with a colored dot —
   `THE PROBLEM` (red) and `THE IMMEDIATE ACTION & NEXT-YEAR FIX` (teal).
4. Takeaway: uppercase eyebrow with a horizontal rule flowing out of it,
   then Archivo 900 28px heading.

## Stat block design (top of each question card)

- Left: a bordered box with tiny `QUESTION` label over a huge bold number.
- Right: a row of cream chips, each with a tiny uppercase label over a big bold value:
  `MIN MISSED` / `MAX MISSED` (maroon values) and `COMBINED` (dark value).
- Separated from the body by a bottom rule.

## Question section structure (the repeating unit)

1. Stat block row (question number + min/max/combined missed).
2. Question stem (serif bold) + optional red pill **badge**
   (e.g. `MARKING ERROR IN GRADEBOOK`, `DROP FROM SCORING`).
3. Answer options A–D as full-width rows: square letter chip + text + optional pill:
   - "most chose" rows: pink fill, red chip, outlined red pill (`MOST CHOSE` / `KEYED ANSWER`)
   - correct rows: green fill, teal chip, solid teal pill (`ANSWER KEY` / `CORRECT · MOST CHOSE`)
4. `THE PROBLEM` label line + explanation prose (bold key phrases inline).
5. `THE IMMEDIATE ACTION & NEXT-YEAR FIX` label line + **fix box**:
   green panel with a 4px dark-teal left border, containing
   `IMMEDIATE FIX FOR THIS WEEK` text (action verbs bolded in red) and
   `FIX FOR NEXT YEAR'S TEST BANK` with a rewritten question — rewrite options are a
   simple list with the winner bolded and a teal checkmark.

## Report flow

Cover header → plain-English intro (why these questions were flagged) →
legend + **key-mismatch warning near the top** → passage-grouped question cards
(ordered by exam question number) → dark-teal **THE TAKEAWAY** panel with
numbered items (white-bordered number squares, bold lead-in phrases) →
one-line centered footer caption.

## Teacher-facing wording style

- Plain, direct, slightly conversational ("Kids who obeyed the citation picked A —
  they did exactly what we teach them to do.").
- Verdicts are bolded and decisive: "The answer key is wrong.",
  "Accept both A and B as correct.", "Remove this question from scoring entirely."
- Technical stats (discrimination values, alpha) appear only inside prose as
  supporting evidence, never as table columns. In our app they go further:
  collapsed under "Advanced Details".
- Never blames teachers or students; blames question design or the key document.

## What to mirror

- Two-font editorial system, 760px column, uppercase micro-labels.
- Stat block, option-row highlighting with labeled pills, fix box, takeaway panel.
- Passage grouping with roman numerals and "N questions requiring action" counts.
- Key-mismatch warning placed before the question sections.
- Decisive bolded recommendations and numbered takeaways.
- Print-safe layout (cards never split across pages).

## What NOT to copy

- No browser print headers/footers, local file paths, or timestamps.
- No `-webkit-print-color-adjust` hacks beyond what printing actually needs.
- The original report's specific exam content is reused **only as demo data**,
  clearly labeled as demo.
- The original is static; ours adds: priority action table, exam health snapshot,
  key audit summary, department pattern summary, and collapsed Advanced Details —
  all styled to match the reference, inserted at natural points in the flow.
