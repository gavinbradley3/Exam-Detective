/* Landing page view */

window.ED = window.ED || {};
ED.views = ED.views || {};

ED.views.landing = function () {
  "use strict";
  var flags = ED.analysis.FLAGS;

  var findCards = [
    { label: "Possible Key Error", text: "When most students across several classes agree on an answer the key calls wrong, the key — not the students — is the suspect." },
    { label: "Accept Multiple Answers", text: "Some questions genuinely support two readings. Exam Detective spots them so students aren’t penalized for careful reading." },
    { label: "Drop From Scoring", text: "When no answer choice is defensible, the fairest fix is to remove the question from scoring — and rebuild it for next year." },
    { label: "Hard but Fair", text: "Not every hard question is broken. The app tells you when a tough item is working as intended, so you don’t fix what isn’t broken." }
  ];

  return (
    '<div class="hero">' +
      '<div class="container">' +
        '<div class="eyebrow">Exam Detective · Teacher-Facing Exam Analysis</div>' +
        '<h1>Find the questions that need fixing.</h1>' +
        '<p class="sub">Upload exam results from multiple classes. Exam Detective helps teachers spot possible key errors, weak questions, and class-wide patterns before an exam is reused.</p>' +
        '<div class="btn-row">' +
          '<a class="btn btn-primary btn-lg" href="#/new-analysis">Start New Analysis</a>' +
          '<a class="btn btn-outline btn-lg" href="#/results">View Demo</a>' +
        '</div>' +
      '</div>' +
    '</div>' +

    '<div class="landing-section">' +
      '<div class="container">' +
        '<h2>How it works</h2>' +
        '<p class="section-lede">From class result files to a clean review report in five steps. No spreadsheets, no statistics degree.</p>' +
        '<div class="steps-grid">' +
          [
            ["Upload class results", "Add the result report from each class section — PDF, CSV, or XLSX exports from your assessment tool."],
            ["Add the exam &amp; key", "Optionally upload the exam questions, reading booklet, and answer key so flagged questions come with full context."],
            ["Review what we found", "Before anything is analyzed, you confirm the classes, question counts, and detected keys — and fix anything we misread."],
            ["See what needs fixing", "Each flagged question gets a plain-English explanation, an action for this week, and a fix for next year’s test bank."],
            ["Share a clean report", "Export a polished teacher review or admin summary your department can act on."]
          ].map(function (s, i) {
            return '<div class="step-card"><span class="step-num" aria-hidden="true">' + (i + 1) + '</span><h3>' + s[0] + '</h3><p>' + s[1] + '</p></div>';
          }).join("") +
        '</div>' +
      '</div>' +
    '</div>' +

    '<div class="landing-section alt">' +
      '<div class="container">' +
        '<h2>What Exam Detective finds</h2>' +
        '<p class="section-lede">Every flagged question gets one clear label and a recommendation in plain English — never a raw statistic you have to interpret.</p>' +
        '<div class="cards-grid">' +
          findCards.map(function (c) {
            return '<div class="card">' + ED.blocks.flagBadge(c.label) + '<p class="mt-8">' + c.text + '</p></div>';
          }).join("") +
        '</div>' +
      '</div>' +
    '</div>' +

    '<div class="landing-section">' +
      '<div class="container">' +
        '<h2>Compare across your department</h2>' +
        '<p class="section-lede">When five classes write the same exam, patterns appear. Exam Detective separates <b>widespread issues</b> (probably the question or the key) from <b>section-specific ones</b> (probably pacing or a missed lesson) — with neutral wording that supports a productive department conversation, never a teacher ranking.</p>' +
        '<a class="btn btn-outline" href="#/comparison">See the demo comparison</a>' +
      '</div>' +
    '</div>' +

    '<div class="landing-section alt">' +
      '<div class="container">' +
        '<h2>Responsible use</h2>' +
        '<p class="section-lede">Exam Detective is designed for aggregate exam-result analysis. Avoid uploading student names or personal information unless your school or district allows it. Uploaded files may contain internal assessment materials, answer keys, and class performance data — delete analyses when they are no longer needed. All suggestions are advisory: review them before changing any marks.</p>' +
      '</div>' +
    '</div>' +

    '<div class="landing-section">' +
      '<div class="container narrow faq">' +
        '<h2>Frequently asked questions</h2>' +
        '<div class="mt-16">' +
        [
          ["Do I need student-level data?", "No. Exam Detective is built for the aggregate class reports most assessment tools export — response counts, averages, and question-by-question percentages. It never asks for student names."],
          ["Will it change my gradebook?", "No. Exam Detective only recommends. Rescoring decisions always stay with you and your department."],
          ["What if a question was just hard?", "Hard isn’t the same as broken. If the key is defensible and the answer pattern looks reasonable, the question is labeled “Hard but Fair” and no grading change is suggested."],
          ["What file types work?", "PDF, CSV, and XLSX class result reports, plus the exam questions, reading booklet, and answer key in common formats. (In this demo build, parsing is simulated with realistic sample data.)"],
          ["Is this a gradebook or student tracker?", "Neither. It reviews questions, not students. The output is a list of exam questions to fix, rescore, drop, or keep — and a clean report to share."]
        ].map(function (f) {
          return '<details><summary>' + f[0] + '</summary><div>' + f[1] + '</div></details>';
        }).join("") +
        '</div>' +
      '</div>' +
    '</div>'
  );
};
