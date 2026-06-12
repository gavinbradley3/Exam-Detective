/* AI-assisted feedback tests — fully mocked, no live API needed.
   Run with:  node scripts/ai-test.js
   Covers: evidence-packet construction (text / partial / data-only),
   the structured-response contract, gated rendering (no revisions
   without full text), every transport failure state, and server-side
   packet validation / prompt construction / response parsing. */

"use strict";

global.window = global;
global.localStorage = {
  _s: {},
  getItem: function (k) { return Object.prototype.hasOwnProperty.call(this._s, k) ? this._s[k] : null; },
  setItem: function (k, v) { this._s[k] = String(v); },
  removeItem: function (k) { delete this._s[k]; }
};
global.location = { hash: "#/" };
global.document = { getElementById: function () { return null; }, addEventListener: function () {} };

var path = require("path");
var root = path.join(__dirname, "..");
[
  "js/data/demo-data.js", "js/analysis.js", "js/csv-parse.js", "js/exam-parse.js",
  "js/analysis-builder.js", "js/ai-feedback.js", "js/data-store.js", "js/report-blocks.js"
].forEach(function (f) { require(path.join(root, f)); });

var server = require(path.join(root, "server.js"));
var ED = global.ED;
var failures = [];
var passed = 0;
function ok(cond, name) {
  if (cond) { passed++; console.log("  ok  " + name); }
  else failures.push(name);
}

// ---- build a real uploaded analysis with mixed evidence ----
var csv = ["Student,Section,Q1,Q2,Q3"];
for (var i = 0; i < 20; i++) {
  // Q1: 14 B vs key A (key error); Q2: scattered; Q3: 13 misses (hard)
  var q1 = i < 2 ? "A" : (i < 16 ? "B" : "C");
  var q2 = ["A", "B", "C", "D"][i % 4];
  var q3 = i < 7 ? "A" : ["B", "C", "D"][i % 3];
  csv.push("S" + i + ",8A," + q1 + "," + q2 + "," + q3);
}
var parsed = ED.csv.parseResults(csv.join("\n"), {});
var evidence = {
  questions: {
    1: { stem: "What color was the door?", options: { A: "Red", B: "Blue", C: "Green", D: "Yellow" }, complete: true },
    2: { stem: "Why did Sam leave?", options: {}, complete: false }
  },
  sections: [{ title: "The Story", from: 1, to: 2, passage: { title: "The Story" } }],
  passages: [{ title: "The Story", file: "p.pdf", linked: true, from: 1, to: 2, how: "marker", excerpt: "It was a cold morning when Sam first saw the blue door.", ranges: [] }],
  coverage: { withText: 2, complete: 1, incomplete: [2] }, warnings: []
};
var an = ED.builder.build({
  setup: { examName: "AI Test", subject: "ELA", grade: "8" },
  sections: parsed.sections, key: ["A", "A", "A"],
  meta: { filesUploaded: 1, filesParsed: 1, unparsedFiles: [], analysisId: "an-ai" },
  examEvidence: evidence
});
function flagOf(n) { return an.flagged.filter(function (f) { return f.number === n; })[0]; }

// ---------- 1. evidence packets ----------
console.log("Evidence packets:");
var p1 = ED.ai.buildPacket(an, flagOf(1));
ok(p1.questionNumber === 1 && p1.analysisId === "an-ai", "packet carries question number and analysis id");
ok(p1.extractionStatus === "complete" && p1.questionStem === "What color was the door?", "complete extraction includes the real stem");
ok(p1.answerChoices && p1.answerChoices.B === "Blue", "complete extraction includes real answer choices");
ok(p1.answerDistribution && p1.answerDistribution.B === 70, "distribution percentages included (B=70)");
ok(p1.linkedPassage && /cold morning/.test(p1.linkedPassage.excerpt), "linked passage excerpt is the real uploaded text");
ok(p1.keyedAnswer === "A" && p1.mostChosenAnswer === "B", "keyed and most-chosen answers included");
ok(JSON.stringify(p1).indexOf("S1,") === -1 && JSON.stringify(p1).indexOf("Student") === -1, "no student rows or names in the packet");

var p2 = ED.ai.buildPacket(an, flagOf(2));
ok(p2.extractionStatus === "partial" && p2.answerChoices === null, "partial extraction: stem only, no invented choices");
var p3 = ED.ai.buildPacket(an, flagOf(3));
ok(p3.extractionStatus === "none" && p3.questionStem === null && p3.linkedPassage === null, "data-only packet has no text and no passage");
ok(ED.ai.buildPacket(ED.data.demoAnalysis(), { number: 3 }) === null, "no packets for demo data");

// ---------- 2. response contract ----------
console.log("Response contract:");
var goodFb = {
  issueSummary: "Most students chose B over the keyed A.",
  likelyIssueType: "Possible key error",
  evidenceBasedExplanation: "70% chose B while the key drew 10%, a decisive pattern.",
  teacherReviewActions: ["Re-read the question against the key", "Check B against the passage"],
  suggestedRevision: { stem: "Considering the whole story, what color was the door?", options: { A: "Red", B: "Blue" } },
  confidence: "Medium",
  limitations: ["The AI did not see the full exam document."]
};
ok(ED.ai.validateResponse(goodFb).ok === true, "valid structured response accepted");
ok(ED.ai.validateResponse({}).ok === false, "empty object rejected");
ok(ED.ai.validateResponse(Object.assign({}, goodFb, { confidence: "Certain" })).ok === false, "invalid confidence rejected");
ok(ED.ai.validateResponse(Object.assign({}, goodFb, { teacherReviewActions: [] })).ok === false, "empty actions rejected");
ok(ED.ai.validateResponse("just text").ok === false, "non-object rejected");

// ---------- 3. gated rendering ----------
console.log("Gated rendering:");
var htmlComplete = ED.ai.renderFeedback(goodFb, "complete");
ok(htmlComplete.indexOf("Suggested revision") !== -1 && htmlComplete.indexOf("Considering the whole story") !== -1,
  "revision renders when full question text existed");
var htmlPartial = ED.ai.renderFeedback(goodFb, "partial");
ok(htmlPartial.indexOf("Considering the whole story") === -1 && htmlPartial.indexOf("hidden") !== -1,
  "revision hidden (with explanation) when extraction was partial");
var htmlNone = ED.ai.renderFeedback(goodFb, "none");
ok(htmlNone.indexOf("data only") !== -1 || htmlNone.indexOf("never saw the question wording") !== -1,
  "data-only feedback says the AI never saw the wording");
var xss = Object.assign({}, goodFb, { issueSummary: "<script>alert(1)</script>" });
ok(ED.ai.renderFeedback(xss, "none").indexOf("<script>") === -1, "AI output is escaped before rendering");
ok(htmlComplete.indexOf("ADVISORY") !== -1 && htmlComplete.indexOf("can be wrong") !== -1, "advisory framing always present");

// ---------- 4. transport states (mocked) ----------
console.log("Transport states (mocked):");
function withTransport(status, body, fn) {
  var orig = ED.ai.transport;
  ED.ai.transport = function () { return Promise.resolve({ status: status, body: body }); };
  return ED.ai.request(p1).then(function (res) { ED.ai.transport = orig; return fn(res); });
}
var seq = Promise.resolve();
seq = seq.then(function () {
  return withTransport(503, "{}", function (r) { ok(r.state === "not-configured" && /AI_SETUP/.test(r.message), "503 -> honest not-configured state"); });
});
seq = seq.then(function () {
  return withTransport(429, "{}", function (r) { ok(r.state === "rate-limited", "429 -> rate-limited state"); });
});
seq = seq.then(function () {
  return withTransport(200, "this is not json", function (r) { ok(r.state === "malformed", "non-JSON body -> malformed state"); });
});
seq = seq.then(function () {
  return withTransport(200, JSON.stringify({ feedback: null }), function (r) { ok(r.state === "empty", "empty feedback -> empty state"); });
});
seq = seq.then(function () {
  return withTransport(200, JSON.stringify({ feedback: { issueSummary: "x" } }), function (r) {
    ok(r.state === "malformed", "wrong structure -> malformed state (discarded, not guessed)");
  });
});
seq = seq.then(function () {
  return withTransport(200, JSON.stringify({ feedback: goodFb }), function (r) {
    ok(r.state === "ok" && r.feedback.issueSummary === goodFb.issueSummary, "valid response -> ok state");
  });
});
seq = seq.then(function () {
  var orig = ED.ai.transport;
  ED.ai.transport = function () { return Promise.reject(new Error("down")); };
  return ED.ai.request(p1).then(function (r) {
    ED.ai.transport = orig;
    ok(r.state === "unavailable", "network failure -> unavailable state");
  });
});

// ---------- 5. server boundary ----------
seq = seq.then(function () {
  console.log("Server boundary:");
  ok(server.validatePacket(p1).ok === true, "server accepts a real evidence packet");
  ok(server.validatePacket(null).ok === false, "server rejects missing packet");
  ok(server.validatePacket({ foo: "bar" }).ok === false, "server rejects junk");
  ok(server.validatePacket(Object.assign({}, p3, { questionStem: "INVENTED" })).ok === false,
    "server rejects packets claiming no extraction but carrying text");
  var big = Object.assign({}, p1, { questionStem: new Array(30000).join("x") });
  ok(server.validatePacket(big).ok === false, "server rejects oversized packets (no raw documents)");

  var prompt = server.buildPrompt(p1);
  ok(/never invent/i.test(prompt.system) && /definitely wrong/i.test(prompt.system), "prompt forbids invention and absolute verdicts");
  ok(prompt.messages[0].content.indexOf("What color was the door?") !== -1, "prompt carries only the packet");

  ok(server.parseAIText('```json\n{"a":1}\n```').ok === true, "fenced JSON parsed");
  ok(server.parseAIText("garbage").ok === false, "garbage rejected");
  ok(server.parseAIText("").ok === false, "empty rejected");
  var gated = server.enforceGates(Object.assign({}, goodFb), p2);
  ok(gated.suggestedRevision === null, "server strips revisions when extraction wasn't complete");

  // stored feedback renders in cards; interactive slot only when asked
  an.aiFeedback = { 1: { feedback: goodFb, extractionStatus: "complete" } };
  var card = ED.blocks.questionCard(an, flagOf(1));
  ok(card.indexOf("AI-ASSISTED FEEDBACK") !== -1, "stored AI feedback renders inside the card");
  var card3 = ED.blocks.questionCard(an, flagOf(3), { aiInteractive: true });
  ok(card3.indexOf("ai-slot-3") !== -1, "interactive AI slot renders when enabled");
  var card3static = ED.blocks.questionCard(an, flagOf(3));
  ok(card3static.indexOf("ai-slot-3") === -1, "no interactive slot in static/report rendering");
  delete an.aiFeedback;
});

seq.then(function () {
  if (failures.length) {
    console.error("\nFAILURES:");
    failures.forEach(function (f) { console.error("  ✗ " + f); });
    process.exit(1);
  }
  console.log("\nAll " + passed + " AI-feedback tests passed.");
}).catch(function (e) { console.error("Test run crashed:", e); process.exit(1); });
