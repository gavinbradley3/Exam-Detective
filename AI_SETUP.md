# AI Deep Review & AI-Assisted Feedback — Setup & How It Works

## AI Deep Review (the main analysis pipeline)

When you click **Run Analysis** with the "AI Deep Review" box checked
(Step 6), the app:

1. runs the deterministic analysis exactly as before — parsing, scoring,
   flagging. `js/analysis-builder.js` is still the only thing that decides
   which questions get flagged, and it works identically with AI off;
2. builds a clean **evidence packet** for each flagged question — exam
   title, section names, student count, question stem, answer choices,
   uploaded-key answer, key-conflict info, response distribution,
   combined/min/max/section-by-section miss rates, strongest wrong answer
   (and whether it beats the key), linked passage title + excerpt, line
   references, visual-dependency flags, parser limitations, and whether the
   data is aggregate-only. **Never student names, never raw files**;
3. sends each packet through `POST /api/deep-review` (server-side — the API
   key never reaches the browser), with live progress in the wizard
   ("Reviewing Q33 with AI…");
4. requires a strict JSON verdict per question: `issueType`, `severity`,
   `recommendedActionType` (`rescore_with_different_answer`,
   `accept_multiple_answers`, `remove_from_scoring`,
   `no_grading_change_revise_next_year`, `no_action_needed`,
   `human_review_required_visual`, `insufficient_data`), `confidence`,
   `teacherSummary`, `problemExplanation`, evidence fields, immediate
   action, next-year fix, optional rewrite, `limitations`,
   `doNotOverclaim`;
5. renders those verdicts in the question cards **in place of** the generic
   rule text — the deterministic stat blocks, answer options, key audit,
   upload audit, and takeaway are unchanged — plus a whole-report
   "AI Deep Review — Department Synthesis" section.

The AI **is allowed to make firm calls** ("Rescore with C — the keyed
answer is not supported by the poem") when the packet supports them.
Honesty gates are enforced on the server *and* the client:

- rewrites are stripped unless the **full** question text was extracted;
- visual-dependent items (comics, graphs, image pages) are forced to
  `human_review_required_visual` — the app never pretends to interpret an
  image it can't read (no OCR/vision in this build);
- aggregate-only uploads get an explicit "no per-student discrimination
  statistics" guard appended to `doNotOverclaim`.

Any malformed or failed response makes **that question** fall back to its
deterministic card — nothing is invented. With no API key configured, the
whole run falls back to the deterministic report and the report banner says
so plainly.

## Per-card AI feedback (older optional layer)

Flagged cards that did **not** get a Deep Review verdict still offer the
original "AI-assisted feedback (optional)" button (`/api/ai-feedback`).
That layer is deliberately more cautious: it is told it may never claim a
question or key is definitely wrong, and it shows a privacy/cost
confirmation before every send. Everything else about packets, strict JSON,
and gated revisions matches the description above.

## Setup

1. You need an Anthropic API key (console.anthropic.com). **It stays on the
   server** — it is never put in frontend code or committed to the repo.
2. Run the app through the bundled server:

   ```
   ANTHROPIC_API_KEY=sk-ant-... node server.js
   ```

   Optional: `PORT=8000`, `AI_MODEL=claude-sonnet-4-6` (default).
3. Open http://localhost:8000, run a new analysis on uploaded files, and
   leave "AI Deep Review" checked in Step 6. The checkbox text is the
   privacy/cost notice — untick it to run deterministic-only.

Without the key, the run completes deterministically and the results page
shows an "AI Deep Review unavailable" banner — everything else works
normally (including `python3 -m http.server`, which simply has no `/api/`).

## Privacy & cost

- Sent per flagged question: that question's numbers + extracted wording +
  (if linked) a capped passage excerpt — a few KB. Nothing else from your
  uploads.
- No student names or identifiers are included in packets (tested).
- Each request bills your Anthropic account like any API call. A Deep
  Review run sends one request per flagged question. The Step 6 checkbox
  states this before anything is sent.
- If the uploaded result file contains only aggregate data, the packets say
  so, and the AI is barred from citing per-student statistics.
- Don't enable AI on material you're not allowed to share with a cloud
  service — same judgment as any third-party tool in your district.

## Failure behavior

| Situation | What you see |
|---|---|
| No API key on server | run completes deterministically; banner says AI Deep Review is unavailable and why |
| Server not running / static hosting | same honest fallback (service unreachable) |
| Rate limited (429) | that question falls back to its deterministic card |
| Model returns non-JSON | same — the response is discarded, never paraphrased |
| Model returns wrong structure | same — strict-contract validation discards it |
| Some questions fail, some succeed | verdicts render where they exist; the banner lists which questions fell back |

The deterministic report is never altered by any of these.

## Testing

- `node scripts/deep-review-test.js` — packets (incl. no-student-names and
  visual/aggregate honesty), the strict JSON contract, the server boundary
  (prompt, validation, gates), run() orchestration with real progress
  labels, fallback behavior, AI-enhanced card rendering with deterministic
  stats preserved, synthesis, and export round-trips. Fully mocked — no
  live API needed.
- `node scripts/ai-test.js` — the older per-card layer: packet
  construction, response contract, gated rendering, all error states, and
  the server's packet validation/prompt/parse functions.
