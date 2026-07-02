/* AI Deep Review tests — fully mocked, no live API needed.
   Run with:  node scripts/deep-review-test.js
   Covers: evidence-packet construction (incl. no student names and
   honest aggregate/visual limits), the strict JSON contract, the
   server-side deep-review boundary (prompt, validation, gates), the
   full run() orchestration with real progress labels, fallback when
   AI is unavailable, AI-enhanced card rendering (deterministic stats
   preserved), whole-report synthesis, and export inclusion. */

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
  "js/analysis-builder.js", "js/ai-feedback.js", "js/deep-review.js",
  "js/data-store.js", "js/report-blocks.js", "js/views/results.js"
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
// Q1: decisive key error (B wins big over keyed A) — complete text + passage
// Q2: scattered votes — partial text
// Q3: high miss, data-only (no text)
var csv = ["Student,Section,Q1,Q2,Q3"];
for (var i = 0; i < 20; i++) {
  var q1 = i < 2 ? "A" : (i < 16 ? "B" : "C");
  var q2 = ["A", "B", "C", "D"][i % 4];
  var q3 = i < 7 ? "A" : ["B", "C", "D"][i % 3];
  csv.push("S" + i + ",8A," + q1 + "," + q2 + "," + q3);
}
var parsed = ED.csv.parseResults(csv.join("\n"), {});
var evidence = {
  questions: {
    1: { stem: "The most probable cause of death, as suggested in lines 30–33, was —", options: { A: "the orchid", B: "jungle leeches", C: "drowning", D: "malaria" }, complete: true },
    2: { stem: "Why did Sam leave?", options: {}, complete: false }
  },
  sections: [{ title: "The Story", from: 1, to: 2, passage: { title: "The Story" } }],
  passages: [{ title: "The Story", file: "p.pdf", linked: true, from: 1, to: 2, how: "marker", excerpt: "Every drop of blood had been drained out of him by jungle leeches.", ranges: [] }],
  coverage: { withText: 2, complete: 1, incomplete: [2] }, warnings: []
};
var an = ED.builder.build({
  setup: { examName: "Deep Review Test", subject: "ELA", grade: "8" },
  sections: parsed.sections, key: ["A", "A", "A"],
  meta: { filesUploaded: 1, filesParsed: 1, unparsedFiles: [], analysisId: "an-deep" },
  examEvidence: evidence
});
function flagOf(n) { return an.flagged.filter(function (f) { return f.number === n; })[0]; }

// ---------- 1. evidence packets ----------
console.log("Evidence packets:");
var p1 = ED.deepReview.buildPacket(an, flagOf(1));
ok(p1.questionNumber === 1 && p1.examTitle === "Deep Review Test", "packet carries question number and exam title");
ok(p1.totalStudents === 20 && p1.sectionNames.length === 1 && p1.sectionNames[0] === "8A", "packet carries student count and section names");
ok(p1.extractionStatus === "complete" && /lines 30/.test(p1.questionStem), "complete extraction includes the real stem");
ok(p1.answerChoices && p1.answerChoices.B === "jungle leeches", "complete extraction includes real answer choices");
ok(p1.lineReferences.length === 1 && p1.lineReferences[0] === "30–33", "line references parsed from the stem");
ok(p1.uploadedKeyAnswer === "A" && p1.answerDistribution && p1.answerDistribution.B === 70, "key and distribution included");
ok(p1.strongestWrongAnswer && p1.strongestWrongAnswer.letter === "B" && p1.strongestWrongAnswer.beatsKey === true,
  "strongest wrong answer computed, beats-key noted");
ok(p1.minMissedPct >= 0 && p1.maxMissedPct >= p1.minMissedPct && typeof p1.combinedMissedPct === "number",
  "min/max/combined missed percentages included");
ok(p1.sectionBySection && typeof p1.sectionBySection["8A"] === "number", "section-by-section performance included");
ok(p1.linkedPassage && /jungle leeches/.test(p1.linkedPassage.excerpt), "linked passage excerpt is the real uploaded text");
ok(JSON.stringify(p1).indexOf('"S1"') === -1 && JSON.stringify(p1).indexOf("S1,") === -1 &&
   !/"S\d+"/.test(JSON.stringify(p1)), "no student rows or names in the packet");
ok(p1.aggregateOnly === false && p1.perStudentDataUnavailable === false, "per-student rows present -> not marked aggregate-only");

var p2 = ED.deepReview.buildPacket(an, flagOf(2));
ok(p2.extractionStatus === "partial" && p2.answerChoices === null, "partial extraction: stem only, no invented choices");
var p3 = ED.deepReview.buildPacket(an, flagOf(3));
ok(p3.extractionStatus === "none" && p3.questionStem === null && p3.linkedPassage === null, "data-only packet has no text and no passage");
ok(ED.deepReview.buildPacket(ED.data.demoAnalysis(), { number: 3 }) === null, "no packets for demo data");

// visual-dependency flag flows into the packet
var fVis = Object.assign({}, flagOf(1), { visualDependency: true, visualType: "comic" });
var pVis = ED.deepReview.buildPacket(an, fVis);
ok(pVis.visualEvidence && pVis.visualEvidence.required && pVis.visualEvidence.type === "comic",
  "visual-dependent question carries the visual-evidence flag");

// ---------- 2. strict JSON contract ----------
console.log("Strict JSON contract:");
var goodReview = {
  questionNumber: 1,
  issueType: "flawed_line_reference",
  severity: "high",
  recommendedActionType: "accept_multiple_answers",
  confidence: "high",
  teacherSummary: "Accept both A and B: the cited lines support B while the whole story supports A.",
  problemExplanation: "The stem points students at lines 30–33, which literally name jungle leeches; the keyed answer requires a whole-story inference.",
  evidenceFromResults: "70% chose B while the keyed A drew 10%.",
  evidenceFromQuestion: "The stem cites lines 30–33 directly.",
  evidenceFromPassage: "The excerpt says blood was drained by jungle leeches.",
  immediateAction: "Give credit for both A and B when rescoring.",
  nextYearFix: "Drop the line citation so the whole-story inference is the only path.",
  rewrittenQuestion: "Considering the entire story, the most probable cause of death was —",
  rewrittenChoices: { A: "the orchid", B: "jungle leeches", C: "drowning", D: "malaria" },
  limitations: ["Based on aggregate response data."],
  doNotOverclaim: ["No per-student data was available."]
};
ok(ED.deepReview.validateReview(goodReview).ok === true, "valid structured review accepted");
ok(ED.deepReview.validateReview({}).ok === false, "empty object rejected");
ok(ED.deepReview.validateReview(Object.assign({}, goodReview, { issueType: "vibes" })).ok === false, "unknown issueType rejected");
ok(ED.deepReview.validateReview(Object.assign({}, goodReview, { recommendedActionType: "panic" })).ok === false, "unknown actionType rejected");
ok(ED.deepReview.validateReview(Object.assign({}, goodReview, { severity: "catastrophic" })).ok === false, "bad severity rejected");
ok(ED.deepReview.validateReview(Object.assign({}, goodReview, { teacherSummary: "" })).ok === false, "empty teacherSummary rejected");
ok(ED.deepReview.validateReview("prose").ok === false, "loose prose rejected");
ED.deepReview.ACTION_TYPES.forEach(function (t) {
  ok(ED.deepReview.validateReview(Object.assign({}, goodReview, { recommendedActionType: t, rewrittenQuestion: null, rewrittenChoices: null })).ok === true,
    "actionType accepted: " + t);
});

// ---------- 3. server boundary ----------
console.log("Server deep-review boundary:");
ok(server.validatePacket(p1).ok === true, "server accepts a deep evidence packet");
ok(server.validateDeepResponse(goodReview).ok === true, "server accepts a contract-valid review");
ok(server.validateDeepResponse({ teacherSummary: "x" }).ok === false, "server rejects incomplete reviews");
ok(server.validateDeepResponse(Object.assign({}, goodReview, { issueType: "made_up" })).ok === false, "server rejects unknown issueType");

var prompt = server.buildDeepPrompt(p1);
ok(/firm call/i.test(prompt.system) && /Accept both A and B/.test(prompt.system), "prompt allows and demands firm, specific judgments");
ok(/never invent/i.test(prompt.system), "prompt forbids inventing wording/passages/students");
ok(/human_review_required_visual/.test(prompt.system) && /discrimination/i.test(prompt.system),
  "prompt covers visual honesty and aggregate-only overclaim rules");
ok(prompt.messages[0].content.indexOf("jungle leeches") !== -1, "prompt carries the packet evidence");

var gated = server.enforceDeepGates(Object.assign({}, goodReview), p2);
ok(gated.rewrittenQuestion === null && gated.rewrittenChoices === null, "server strips rewrites when extraction wasn't complete");
var gatedVis = server.enforceDeepGates(Object.assign({}, goodReview), pVis);
ok(gatedVis.recommendedActionType === "human_review_required_visual" && gatedVis.rewrittenQuestion === null,
  "server forces human-review verdict on visual-dependent items");
var pAgg = Object.assign({}, p1, { perStudentDataUnavailable: true, aggregateOnly: true });
var gatedAgg = server.enforceDeepGates(Object.assign({}, goodReview, { doNotOverclaim: [] }), pAgg);
ok(gatedAgg.doNotOverclaim.some(function (d) { return /aggregate/i.test(d); }),
  "aggregate-only packets gain a no-discrimination-stats overclaim guard");

// ---------- 4. orchestration: run(), progress, fallback ----------
console.log("Orchestration (mocked transport):");
var seq = Promise.resolve();

// 4a. not configured -> honest fallback, deterministic untouched
seq = seq.then(function () {
  ED.deepReview.statusProbe = function () { return Promise.resolve({ configured: false }); };
  var steps = [];
  return ED.deepReview.run(an, { onStep: function (l) { steps.push(l); } }).then(function (res) {
    ok(res.aiUsed === false && res.reason === "not-configured", "no key -> aiUsed false with not-configured reason");
    ok(steps.length === 1 && /unavailable/i.test(steps[0]) && /deterministic/i.test(steps[0]),
      "fallback announces itself honestly in the progress log");
    ok(Object.keys(res.reviews).length === 0 && res.synthesis === null, "no reviews and no synthesis without AI");
  });
});

// 4b. configured, all reviews succeed -> real per-question progress
seq = seq.then(function () {
  ED.deepReview.statusProbe = function () { return Promise.resolve({ configured: true, model: "test-model" }); };
  ED.deepReview.transport = function (packet) {
    var r = Object.assign({}, goodReview, { questionNumber: packet.questionNumber });
    return Promise.resolve({ status: 200, body: JSON.stringify({ review: r }) });
  };
  var steps = [];
  return ED.deepReview.run(an, { onStep: function (l) { steps.push(l); } }).then(function (res) {
    ok(res.aiUsed === true && res.reason === null, "configured + healthy -> aiUsed true, no failure reason");
    var flaggedCount = an.flagged.filter(function (f) { return !f.noData; }).length;
    ok(Object.keys(res.reviews).length === flaggedCount, "every flagged question got a review");
    an.flagged.filter(function (f) { return !f.noData; }).forEach(function (f) {
      ok(steps.some(function (l) { return l === "Reviewing Q" + f.number + " with AI…"; }), "progress log names Q" + f.number);
    });
    ok(steps.some(function (l) { return /evidence packets/i.test(l); }), "progress log includes packet-building step");
    ok(steps.some(function (l) { return /final teacher report/i.test(l); }), "progress log includes report-writing step");
    ok(steps.some(function (l) { return /Finalizing exports/i.test(l); }), "progress log includes export step");
    ok(res.reviews[1].extractionStatus === "complete" && res.reviews[3].extractionStatus === "none",
      "each stored review remembers what the AI actually saw");
    ok(res.synthesis && res.synthesis.reviewedCount === flaggedCount, "synthesis produced over the reviews");
    // stash for rendering tests below
    an.deepReview = res.reviews;
    an.deepReviewSynthesis = res.synthesis;
    an.deepReviewStatus = { aiUsed: true, reason: null, failures: [], model: res.model };
  });
});

// 4c. per-question failure -> that card falls back, others keep verdicts
seq = seq.then(function () {
  ED.deepReview.transport = function (packet) {
    if (packet.questionNumber === 2) return Promise.resolve({ status: 200, body: "not json" });
    var r = Object.assign({}, goodReview, { questionNumber: packet.questionNumber });
    return Promise.resolve({ status: 200, body: JSON.stringify({ review: r }) });
  };
  return ED.deepReview.run(an, { onStep: function () {} }).then(function (res) {
    ok(res.aiUsed === true && res.reason === "partial" && res.failures.length === 1 && res.failures[0] === 2,
      "malformed AI output on one question -> partial, that question listed as fallen back");
    ok(res.reviews[1] && !res.reviews[2], "healthy questions keep their verdicts; the failed one is absent");
  });
});

// 4d. total network failure mid-run -> unavailable states, no reviews
seq = seq.then(function () {
  ED.deepReview.transport = function () { return Promise.reject(new Error("down")); };
  return ED.deepReview.run(an, { onStep: function () {} }).then(function (res) {
    ok(res.aiUsed === true && Object.keys(res.reviews).length === 0 && res.failures.length === 3,
      "network failure per question -> all questions fall back, none invented");
  });
});

// ---------- 5. AI-enhanced rendering ----------
seq = seq.then(function () {
  console.log("AI-enhanced rendering:");
  var card = ED.blocks.questionCard(an, flagOf(1));
  ok(card.indexOf("AI Deep Review") !== -1, "card carries the AI Deep Review marker");
  ok(card.indexOf("Accept multiple answers") !== -1, "card shows the firm recommended action");
  ok(card.indexOf("Accept both A and B") !== -1, "card shows the specific teacher summary");
  ok(card.indexOf("Give credit for both A and B") !== -1, "card shows the immediate action");
  ok(card.indexOf("Drop the line citation") !== -1 || card.indexOf("Considering the entire story") !== -1,
    "card shows the next-year fix / rewrite");
  ok(card.indexOf("Possible key error") === -1 && card.indexOf("usual suspect") === -1,
    "generic rule prose is replaced, not stacked");
  // deterministic stats preserved exactly
  var st = ED.analysis.statsFor(an, 1);
  ok(card.indexOf("MIN MISSED") !== -1 && card.indexOf(st.minMissed + "%") !== -1 &&
     card.indexOf("~" + st.combinedMissed + "%") !== -1, "deterministic stat block unchanged");
  ok(card.indexOf("jungle leeches") !== -1 && card.indexOf("ANSWER KEY") !== -1, "options + key markers still render");
  ok(card.indexOf("ai-slot-1") === -1, "older per-question AI button suppressed when a verdict exists");
  // rewrite gating: the data-only question must not render a rewrite
  var card3 = ED.blocks.questionCard(an, flagOf(3));
  ok(card3.indexOf("Considering the entire story") === -1, "no rewrite rendered when the AI never saw the wording");
  // XSS safety
  var evil = Object.assign({}, goodReview, { teacherSummary: "<script>alert(1)</script>" });
  var parts = ED.deepReview.renderReviewParts(evil, "complete");
  ok(parts.problem.indexOf("<script>") === -1, "AI output escaped before rendering");

  // banner states
  var bannerOn = ED.deepReview.renderBanner(an);
  ok(/AI Deep Review applied/.test(bannerOn) && /test-model/.test(bannerOn), "applied banner names the model");
  var anOff = Object.assign({}, an, { deepReviewStatus: { aiUsed: false, reason: "not-configured" } });
  var bannerOff = ED.deepReview.renderBanner(anOff);
  ok(/unavailable/.test(bannerOff) && /API key/.test(bannerOff), "unavailable banner says why, honestly");
  ok(ED.deepReview.renderBanner({}) === "", "no banner when Deep Review never ran");

  // full results view keeps the audit sections alongside the AI layer
  ED.data.setActiveUploaded(an);
  var page = ED.views.results();
  ok(page.indexOf("Key Audit Summary") !== -1 && page.indexOf("Department Synthesis") !== -1,
    "results page shows deterministic audit AND the AI synthesis");
  ok(page.indexOf('title="AI Deep Review verdict"') !== -1,
    "priority action list shows the AI verdict as the recommended action");
});

// ---------- 6. synthesis ----------
seq = seq.then(function () {
  console.log("Whole-report synthesis:");
  var reviews = {
    3: Object.assign({}, goodReview, { recommendedActionType: "accept_multiple_answers", issueType: "flawed_line_reference", teacherSummary: "Accept both A and B." }),
    33: Object.assign({}, goodReview, { recommendedActionType: "rescore_with_different_answer", issueType: "key_error", teacherSummary: "Rescore with C; the key is wrong." }),
    42: Object.assign({}, goodReview, { recommendedActionType: "no_grading_change_revise_next_year", issueType: "distractor_too_plausible", teacherSummary: "Key is right; distractor A is too close." }),
    56: Object.assign({}, goodReview, { recommendedActionType: "remove_from_scoring", issueType: "missing_correct_answer", teacherSummary: "Remove from scoring." }),
    59: Object.assign({}, goodReview, { recommendedActionType: "no_action_needed", issueType: "hard_but_fair", teacherSummary: "Hard but fair." }),
    75: Object.assign({}, goodReview, { recommendedActionType: "human_review_required_visual", issueType: "visual_dependency", teacherSummary: "Depends on a comic the app can't read." })
  };
  var synth = ED.deepReview.synthesize(an, reviews);
  ok(synth.reviewedCount === 6, "synthesis counts all reviews");
  ok(synth.immediateScoringAction.length === 3 &&
     synth.immediateScoringAction.map(function (r) { return r.q; }).join(",") === "3,33,56",
    "immediate-scoring bucket = rescore + accept-both + remove");
  ok(synth.reviseNextYear.length === 1 && synth.reviseNextYear[0].q === 42, "revise-next-year bucket correct");
  ok(synth.hardButFair.length === 1 && synth.hardButFair[0].q === 59, "hard-but-fair bucket correct");
  ok(synth.visualReview.length === 1 && synth.visualReview[0].q === 75, "visual-review bucket correct");
  ok(synth.keyAudit.length === 1 && synth.keyAudit[0].q === 33, "key audit lists the key error");
  ok(/Q3, Q33, Q56/.test(synth.executiveSummary), "executive summary names the immediate-action questions");
  ok(/verify every entry/i.test(synth.departmentTakeaway), "department takeaway escalates when the key is implicated");
  var html = ED.deepReview.renderSynthesis(synth);
  ok(html.indexOf("Department Synthesis") !== -1 && html.indexOf("Rescore with C") !== -1,
    "synthesis block renders the buckets with their summaries");
});

// ---------- 7. exports ----------
seq = seq.then(function () {
  console.log("Exports:");
  var rows = ED.exportData.rows(an);
  var flat = JSON.stringify(rows);
  ok(/Q1/.test(flat) && /Combined % Missed/.test(flat), "CSV data export still works with Deep Review attached");
  // saved-analysis round trip keeps verdicts (localStorage JSON)
  ED.data.setActiveUploaded(an);
  var back = ED.data.activeAnalysis();
  ok(back.deepReview && back.deepReview[1] && /Accept both/.test(back.deepReview[1].teacherSummary),
    "verdicts survive the storage round trip (so saves/exports include them)");
  var cardAfter = ED.blocks.questionCard(back, back.flagged.filter(function (f) { return f.number === 1; })[0]);
  ok(cardAfter.indexOf("Accept both A and B") !== -1, "re-rendered card still shows the AI verdict after round trip");
});

// ---------- 8. Run Analysis integration (the real wizard action) ----------
seq = seq.then(function () {
  console.log("Run Analysis integration (real wizard-run action, stubbed DOM):");
  require(path.join(root, "js/views/wizard.js"));
  ED.app = { rerender: function () {} };

  // stub just enough DOM for the progress UI
  var logLines = [];
  var barEl = { firstElementChild: { style: {} }, setAttribute: function () {} };
  var els = {
    "run-btn": { disabled: false },
    "progress-wrap": { hidden: true },
    "progress-bar": barEl,
    "progress-log": { appendChild: function (li) { logLines.push(li.textContent); } }
  };
  global.document.getElementById = function (id) { return els[id] || null; };
  global.document.createElement = function () { return { textContent: "" }; };

  // wizard state: one parsed result file + key — the run gate passes
  ED.wizard.setState({
    analysisId: "wiz-run",
    setup: { examName: "Wizard Run Test", subject: "ELA", grade: "8" },
    resultFiles: [{ name: "8A.csv", status: "parsed", sections: parsed.sections }],
    examFiles: [],
    key: ["A", "A", "A"], keyCount: 3,
    deepReview: true
  });

  ED.deepReview.statusProbe = function () { return Promise.resolve({ configured: true, model: "test-model" }); };
  ED.deepReview.transport = function (packet) {
    var r = Object.assign({}, goodReview, { questionNumber: packet.questionNumber });
    return Promise.resolve({ status: 200, body: JSON.stringify({ review: r }) });
  };

  ED.actions["wizard-run"]();
  // the pipeline is async; poll until the final progress line lands
  return new Promise(function (resolve) {
    (function wait(tries) {
      if (logLines.some(function (l) { return /^Done/.test(l); }) || tries > 100) return resolve();
      setTimeout(function () { wait(tries + 1); }, 10);
    })(0);
  }).then(function () {
    ok(els["progress-wrap"].hidden === false && els["run-btn"].disabled === true,
      "run shows the progress area and disables the button");
    ok(logLines.some(function (l) { return /Reading uploaded files/.test(l); }) &&
       logLines.some(function (l) { return /Detecting file types/.test(l); }),
      "progress log covers reading + detecting steps");
    ok(logLines.some(function (l) { return /^Reviewing Q\d+ with AI…$/.test(l); }),
      "progress log shows real per-question AI steps");
    ok(logLines.some(function (l) { return /Done — AI verdicts attached to \d+ of \d+/.test(l); }),
      "final line reports how many verdicts were attached");
    var active = ED.data.activeAnalysis();
    ok(active && active.deepReview && active.deepReviewSynthesis && active.deepReviewStatus.aiUsed === true,
      "active analysis carries reviews, synthesis, and status after the run");

    // same run with deep review toggled OFF -> no AI, honest wording
    logLines.length = 0;
    var s = ED.wizard.getState(); s.deepReview = false; ED.wizard.setState(s);
    ED.deepReview.transport = function () { throw new Error("must not be called"); };
    ED.actions["wizard-run"]();
    ok(logLines.some(function (l) { return /turned off/.test(l); }) &&
       !logLines.some(function (l) { return /Reviewing Q/.test(l); }),
      "toggle off -> deterministic-only run, no AI calls");
    var det = ED.data.activeAnalysis();
    ok(det && !det.deepReview && !det.deepReviewSynthesis, "deterministic run carries no AI fields");
  });
});

seq.then(function () {
  if (failures.length) {
    console.error("\nFAILURES:");
    failures.forEach(function (f) { console.error("  ✗ " + f); });
    process.exit(1);
  }
  console.log("\nAll " + passed + " Deep Review tests passed.");
}).catch(function (e) { console.error("Test run crashed:", e); process.exit(1); });
