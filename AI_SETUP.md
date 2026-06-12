# AI-Assisted Feedback — Setup & How It Works

## What it is (and isn't)

For each **already-flagged** question, you can optionally ask an AI model to
comment. The AI:

- never decides which questions get flagged — the deterministic rules in
  `js/analysis-builder.js` do that, and they work identically with AI off;
- sees only a small **evidence packet** for one question: the response
  numbers plus whatever wording was genuinely extracted from *this*
  analysis's uploads (no student names, no raw files);
- must answer in a strict JSON structure; anything malformed is shown as an
  honest error, never paraphrased;
- may suggest a revision **only when the full question text was extracted**
  — enforced in the browser *and* on the server;
- is told it may never claim a question or key is definitely wrong.

## Setup

1. You need an Anthropic API key (console.anthropic.com). **It stays on the
   server** — it is never put in frontend code or committed to the repo.
2. Run the app through the bundled server:

   ```
   ANTHROPIC_API_KEY=sk-ant-... node server.js
   ```

   Optional: `PORT=8000`, `AI_MODEL=claude-sonnet-4-6` (default).
3. Open http://localhost:8000. On the Results page of an **uploaded**
   analysis, each flagged card shows "AI-assisted feedback (optional)".
   Clicking it shows a privacy/cost notice first; nothing is sent until you
   confirm.

Without the key, the button explains honestly that AI isn't configured —
everything else works normally (including `python3 -m http.server`, which
simply has no `/api/`, so the button reports the service as unreachable).

## Privacy & cost

- Sent per request: one question's numbers + extracted wording + (if linked)
  a capped passage excerpt — a few KB. Nothing else from your uploads.
- No student names or identifiers are included in packets.
- Each request bills your Anthropic account like any API call. The UI warns
  before every send.
- Don't enable AI on material you're not allowed to share with a cloud
  service — same judgment as any third-party tool in your district.

## Failure behavior

| Situation | What you see |
|---|---|
| No API key on server | "not configured" notice + this file referenced |
| Server not running / static hosting | "couldn't reach the AI service" |
| Rate limited (429) | honest retry-later message |
| Model returns non-JSON | "showing nothing rather than guessing" |
| Model returns wrong structure | same — the response is discarded |
| Empty response | honest empty-response message |

The deterministic report is never altered by any of these.

## Testing

`node scripts/ai-test.js` covers packet construction, the response contract,
gated rendering, all error states (mocked transport — no live API needed),
and the server's packet validation/prompt/parse functions.
