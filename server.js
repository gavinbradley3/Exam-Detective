/* ============================================================
   Exam Detective — minimal local server (Node built-ins only)

   Serves the static app AND provides the one API boundary the app
   needs: AI-assisted feedback. The Anthropic API key lives ONLY in
   the server environment — never in frontend code.

   Run:
     node server.js                         # app at http://localhost:8000, AI disabled
     ANTHROPIC_API_KEY=sk-... node server.js   # AI feedback enabled

   Optional env:
     PORT      (default 8000)
     AI_MODEL  (default claude-sonnet-4-6)

   Endpoints:
     GET  /api/ai-status    -> { configured: true|false }
     POST /api/ai-feedback  -> { feedback: {...} } | honest errors
       body: { packet: <evidence packet from js/ai-feedback.js> }

   Safety:
     - requests without a valid structured evidence packet are rejected (400)
     - no key -> 503 "not-configured" (the app shows this honestly)
     - upstream errors are summarized, never echoed raw
     - the AI is asked for structured JSON and is told not to invent
       wording; the server also strips revision suggestions when the
       packet says question text wasn't fully extracted
   ============================================================ */

"use strict";

var http = require("http");
var fs = require("fs");
var path = require("path");

var ROOT = __dirname;
var PORT = parseInt(process.env.PORT, 10) || 8000;
var API_KEY = process.env.ANTHROPIC_API_KEY || "";
var AI_MODEL = process.env.AI_MODEL || "claude-sonnet-4-6";

var MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".pdf": "application/pdf",
  ".csv": "text/csv",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
};

// ---------- evidence-packet validation (exported for tests) ----------

function validatePacket(packet) {
  if (!packet || typeof packet !== "object" || Array.isArray(packet)) {
    return { ok: false, error: "missing evidence packet" };
  }
  if (typeof packet.questionNumber !== "number" || packet.questionNumber < 1 || packet.questionNumber > 130) {
    return { ok: false, error: "questionNumber must be 1–130" };
  }
  if (typeof packet.flagType !== "string" || !packet.flagType) {
    return { ok: false, error: "flagType is required" };
  }
  if (["complete", "partial", "none"].indexOf(packet.extractionStatus) === -1) {
    return { ok: false, error: "extractionStatus must be complete, partial, or none" };
  }
  // honesty cross-checks: text fields may only appear when status allows them
  if (packet.extractionStatus === "none" && (packet.questionStem || packet.answerChoices)) {
    return { ok: false, error: "packet claims no extraction but includes question text" };
  }
  if (packet.questionStem !== null && packet.questionStem !== undefined && typeof packet.questionStem !== "string") {
    return { ok: false, error: "questionStem must be a string or null" };
  }
  if (packet.answerDistribution !== null && packet.answerDistribution !== undefined &&
      typeof packet.answerDistribution !== "object") {
    return { ok: false, error: "answerDistribution must be an object or null" };
  }
  // size guard: packets are small by design — reject anything bloated
  if (JSON.stringify(packet).length > 20000) {
    return { ok: false, error: "packet too large — send the evidence packet, not raw documents" };
  }
  return { ok: true };
}

// ---------- prompt construction (exported for tests) ----------

function buildPrompt(packet) {
  var system =
    "You are an assessment-review assistant for teachers. You receive a JSON evidence packet about ONE flagged exam question. " +
    "Respond with a single JSON object and nothing else, using exactly these fields: " +
    '{"issueSummary": string (one sentence), "likelyIssueType": string, "evidenceBasedExplanation": string, ' +
    '"teacherReviewActions": [string, ...], "suggestedRevision": null | string | {"stem": string, "options": {"A": string, ...}}, ' +
    '"confidence": "High"|"Medium"|"Low", "limitations": [string, ...]}. ' +
    "Strict rules: (1) Base every claim ONLY on the packet. (2) If questionStem is null, your feedback is data-only — say so in limitations and set suggestedRevision to null. " +
    "(3) Never invent question wording, answer-choice text, passage content, or student information. " +
    "(4) If linkedPassage is absent, do not mention passage evidence. " +
    "(5) Never state that the question or the answer key is definitely wrong — the strongest allowed claim is that the evidence suggests review. " +
    "(6) suggestedRevision is allowed only when extractionStatus is \"complete\"; otherwise null. " +
    "(7) If the evidence is insufficient for a judgment, say exactly what is missing in limitations instead of speculating. " +
    "(8) Keep language specific, cautious, and teacher-facing.";
  return {
    model: AI_MODEL,
    max_tokens: 1200,
    system: system,
    messages: [{ role: "user", content: "Evidence packet:\n" + JSON.stringify(packet, null, 2) }]
  };
}

// ---------- AI Deep Review: prompt + strict contract (exported for tests) ----------

var DEEP_ISSUE_TYPES = [
  "key_error", "key_conflict_between_files", "ambiguous_multiple_defensible_answers",
  "flawed_line_reference", "missing_correct_answer", "distractor_too_plausible",
  "context_clue_trap", "visual_dependency", "section_specific_gap", "hard_but_fair",
  "insufficient_data"
];
var DEEP_ACTION_TYPES = [
  "rescore_with_different_answer", "accept_multiple_answers", "remove_from_scoring",
  "no_grading_change_revise_next_year", "no_action_needed",
  "human_review_required_visual", "insufficient_data"
];

function buildDeepPrompt(packet) {
  var system =
    "You are an expert assessment reviewer helping a teacher decide what to do about ONE flagged exam question. " +
    "You receive a JSON evidence packet: the question wording (if it was extracted), the answer choices, the answer key, " +
    "the response distribution, per-section miss rates, the strongest wrong answer, and any linked passage excerpt. " +
    "Respond with a SINGLE JSON object and nothing else, using exactly these fields: " +
    '{"questionNumber": number, "issueType": one of ' + JSON.stringify(DEEP_ISSUE_TYPES) + ', ' +
    '"severity": "high"|"medium"|"low", "recommendedActionType": one of ' + JSON.stringify(DEEP_ACTION_TYPES) + ', ' +
    '"confidence": "high"|"medium"|"low", "teacherSummary": string (ONE firm sentence stating the decision), ' +
    '"problemExplanation": string, "evidenceFromResults": string, "evidenceFromQuestion": string, "evidenceFromPassage": string, ' +
    '"immediateAction": string, "nextYearFix": string, "rewrittenQuestion": null|string, "rewrittenChoices": null|{"A":string,...}, ' +
    '"limitations": [string], "doNotOverclaim": [string]}. ' +
    "You ARE allowed and expected to make a firm call when the evidence supports it — e.g. that the answer key is wrong and the item " +
    "should be rescored, that two answers are defensible and both should be accepted, or that the item should be removed from scoring. " +
    "Be specific and teacher-facing (\"Accept both A and B because the cited lines support A while the whole-story inference supports B\"), " +
    "not vague (\"check the key\", \"this may be confusing\"). " +
    "Strict rules: " +
    "(1) Base every claim ONLY on the packet — never invent question wording, answer-choice text, passage content, or student information. " +
    "(2) If questionStem is null, you did not see the wording: set recommendedActionType to \"insufficient_data\" unless a key conflict is recorded, keep rewrites null, and say so in limitations. " +
    "(3) Set rewrittenQuestion/rewrittenChoices ONLY when extractionStatus is \"complete\"; otherwise null. " +
    "(4) If visualEvidence.required is true, the item depends on an image/comic/graph the app CANNOT read: set recommendedActionType to \"human_review_required_visual\", do not claim to interpret the visual, and keep rewrites null. " +
    "(5) If perStudentDataUnavailable or aggregateOnly is true, do NOT cite per-student discrimination or ability-based statistics — list that constraint in doNotOverclaim. " +
    "(6) If linkedPassage is absent, leave evidenceFromPassage as an empty string and do not mention passage evidence. " +
    "(7) Use only the allowed issueType and recommendedActionType values, lowercase.";
  return {
    model: AI_MODEL,
    max_tokens: 1500,
    system: system,
    messages: [{ role: "user", content: "Evidence packet:\n" + JSON.stringify(packet, null, 2) }]
  };
}

function validateDeepResponse(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return { ok: false, error: "not an object" };
  var need = ["teacherSummary", "problemExplanation", "immediateAction"];
  for (var i = 0; i < need.length; i++) {
    if (typeof obj[need[i]] !== "string" || !obj[need[i]].trim()) return { ok: false, error: "missing " + need[i] };
  }
  if (DEEP_ISSUE_TYPES.indexOf(obj.issueType) === -1) return { ok: false, error: "bad issueType" };
  if (DEEP_ACTION_TYPES.indexOf(obj.recommendedActionType) === -1) return { ok: false, error: "bad recommendedActionType" };
  if (["high", "medium", "low"].indexOf(String(obj.severity || "").toLowerCase()) === -1) return { ok: false, error: "bad severity" };
  if (["high", "medium", "low"].indexOf(String(obj.confidence || "").toLowerCase()) === -1) return { ok: false, error: "bad confidence" };
  return { ok: true };
}

// Server-side enforcement of the honesty gates, mirroring the client.
function enforceDeepGates(review, packet) {
  if (packet.extractionStatus !== "complete") { review.rewrittenQuestion = null; review.rewrittenChoices = null; }
  if (packet.visualEvidence && packet.visualEvidence.required) {
    review.recommendedActionType = "human_review_required_visual";
    review.rewrittenQuestion = null;
    review.rewrittenChoices = null;
    review.doNotOverclaim = Array.isArray(review.doNotOverclaim) ? review.doNotOverclaim : [];
    review.doNotOverclaim.push("This item depends on a visual the app cannot read; the verdict is a routing decision, not an interpretation of the image.");
  }
  if (packet.perStudentDataUnavailable) {
    review.doNotOverclaim = Array.isArray(review.doNotOverclaim) ? review.doNotOverclaim : [];
    review.doNotOverclaim.push("Only aggregate data was available — no per-student discrimination or ability-based statistics were used.");
  }
  return review;
}

// ---------- AI response parsing (exported for tests) ----------

function parseAIText(text) {
  if (!text || !String(text).trim()) return { ok: false, error: "empty" };
  var t = String(text).trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    var obj = JSON.parse(t);
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return { ok: false, error: "not an object" };
    return { ok: true, feedback: obj };
  } catch (e) {
    return { ok: false, error: "invalid JSON" };
  }
}

// Server-side enforcement: no revision without full extracted text.
function enforceGates(feedback, packet) {
  if (packet.extractionStatus !== "complete") feedback.suggestedRevision = null;
  return feedback;
}

// ---------- request handling ----------

function sendJSON(res, status, obj) {
  var body = JSON.stringify(obj);
  res.writeHead(status, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) });
  res.end(body);
}

function handleAIFeedback(req, res) {
  if (!API_KEY) {
    return sendJSON(res, 503, { error: "not-configured", message: "Set ANTHROPIC_API_KEY in the server environment to enable AI feedback. See AI_SETUP.md." });
  }
  var chunks = [];
  var size = 0;
  req.on("data", function (c) {
    size += c.length;
    if (size > 64 * 1024) { req.destroy(); return; }
    chunks.push(c);
  });
  req.on("end", function () {
    var body;
    try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
    catch (e) { return sendJSON(res, 400, { error: "bad-request", message: "Body must be JSON: { packet: {...} }" }); }
    var v = validatePacket(body && body.packet);
    if (!v.ok) return sendJSON(res, 400, { error: "bad-packet", message: v.error });

    fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify(buildPrompt(body.packet))
    }).then(function (r) {
      if (r.status === 429) return sendJSON(res, 429, { error: "rate-limited", message: "AI service rate limit reached." });
      if (!r.ok) return sendJSON(res, 502, { error: "upstream", message: "AI service error (status " + r.status + ")." });
      return r.json().then(function (data) {
        var text = data && data.content && data.content[0] && data.content[0].text;
        var parsed = parseAIText(text);
        if (!parsed.ok) return sendJSON(res, 200, { feedback: null, error: "malformed", message: "AI returned non-JSON output." });
        sendJSON(res, 200, { feedback: enforceGates(parsed.feedback, body.packet) });
      });
    }).catch(function () {
      sendJSON(res, 502, { error: "upstream", message: "Couldn’t reach the AI service." });
    });
  });
}

function handleDeepReview(req, res) {
  if (!API_KEY) {
    return sendJSON(res, 503, { error: "not-configured", message: "Set ANTHROPIC_API_KEY in the server environment to enable AI Deep Review. See AI_SETUP.md." });
  }
  var chunks = [];
  var size = 0;
  req.on("data", function (c) {
    size += c.length;
    if (size > 64 * 1024) { req.destroy(); return; }
    chunks.push(c);
  });
  req.on("end", function () {
    var body;
    try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
    catch (e) { return sendJSON(res, 400, { error: "bad-request", message: "Body must be JSON: { packet: {...} }" }); }
    var v = validatePacket(body && body.packet);
    if (!v.ok) return sendJSON(res, 400, { error: "bad-packet", message: v.error });

    fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify(buildDeepPrompt(body.packet))
    }).then(function (r) {
      if (r.status === 429) return sendJSON(res, 429, { error: "rate-limited", message: "AI service rate limit reached." });
      if (!r.ok) return sendJSON(res, 502, { error: "upstream", message: "AI service error (status " + r.status + ")." });
      return r.json().then(function (data) {
        var text = data && data.content && data.content[0] && data.content[0].text;
        var parsed = parseAIText(text);
        if (!parsed.ok) return sendJSON(res, 200, { review: null, error: "malformed", message: "AI returned non-JSON output." });
        var vr = validateDeepResponse(parsed.feedback);
        if (!vr.ok) return sendJSON(res, 200, { review: null, error: "malformed", message: "AI response did not match the contract (" + vr.error + ")." });
        sendJSON(res, 200, { review: enforceDeepGates(parsed.feedback, body.packet) });
      });
    }).catch(function () {
      sendJSON(res, 502, { error: "upstream", message: "Couldn’t reach the AI service." });
    });
  });
}

function serveStatic(req, res) {
  var urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  if (urlPath === "/") urlPath = "/index.html";
  var filePath = path.normalize(path.join(ROOT, urlPath));
  if (filePath.indexOf(ROOT) !== 0) { res.writeHead(403); return res.end("Forbidden"); }
  fs.readFile(filePath, function (err, data) {
    if (err) { res.writeHead(404); return res.end("Not found"); }
    res.writeHead(200, { "Content-Type": MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream" });
    res.end(data);
  });
}

function createServer() {
  return http.createServer(function (req, res) {
    if (req.url === "/api/ai-status" && req.method === "GET") {
      return sendJSON(res, 200, { configured: !!API_KEY, model: API_KEY ? AI_MODEL : null });
    }
    if (req.url === "/api/ai-feedback" && req.method === "POST") {
      return handleAIFeedback(req, res);
    }
    if (req.url === "/api/deep-review" && req.method === "POST") {
      return handleDeepReview(req, res);
    }
    if ((req.url || "").indexOf("/api/") === 0) {
      return sendJSON(res, 404, { error: "not-found" });
    }
    if (req.method !== "GET") { res.writeHead(405); return res.end(); }
    serveStatic(req, res);
  });
}

module.exports = {
  validatePacket: validatePacket, buildPrompt: buildPrompt, parseAIText: parseAIText, enforceGates: enforceGates,
  buildDeepPrompt: buildDeepPrompt, validateDeepResponse: validateDeepResponse, enforceDeepGates: enforceDeepGates,
  createServer: createServer
};

if (require.main === module) {
  createServer().listen(PORT, function () {
    console.log("Exam Detective at http://localhost:" + PORT);
    console.log("AI Deep Review + AI feedback: " + (API_KEY ? "ENABLED (" + AI_MODEL + ")" : "disabled — set ANTHROPIC_API_KEY to enable (see AI_SETUP.md)"));
  });
}
