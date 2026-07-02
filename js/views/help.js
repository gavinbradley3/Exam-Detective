/* Help page — written for rookie teachers, plain language. */

window.ED = window.ED || {};
ED.views = ED.views || {};

ED.views.help = function () {
  "use strict";

  var sections = [
    {
      id: "start", title: "How to start a new analysis",
      body: "<p>Click <b>New Analysis</b> in the top menu. The wizard walks you through it: name the exam, upload one result file per class, optionally add the exam and answer key, review what was detected, and run the analysis. Nothing is analyzed until you’ve confirmed what the app found in your files.</p><p class=\"mt-8\">Want to see it work first? On Step 2, click <b>Load the demo files</b>.</p>"
    },
    {
      id: "files", title: "What files to upload",
      body: "<p><b>Class result reports</b> (required): the per-class export from your assessment tool. <b>CSV, XLSX, and text-based PDF files are analyzed for real</b> — in XLSX workbooks every sheet is checked and sheet names become section labels, and PDFs need a question-by-question item-analysis table (scanned or chart-only PDFs get a specific refusal). There’s a sample CSV in the upload step showing the layouts we read.</p><p class=\"mt-8\"><b>Answer key</b>: upload a key file (CSV/XLSX with Question + Key columns, or a <b>text-based</b> PDF like “1. A&nbsp;&nbsp;2. B”), paste it, or enter it by hand — up to 130 questions. Extracted keys always ask for review, and scanned PDFs are refused honestly (there’s no OCR yet). The app compares your key against your uploaded results — that comparison is how key errors get caught.</p><p class=\"mt-8\"><b>Exam questions and reading passages</b> (optional, recommended): text-based PDFs and .txt files are <b>parsed for real</b> — question wording and answer choices are extracted and quoted verbatim next to flagged questions, and passages are linked to questions when an explicit “Questions X–Y” marker matches (never by guessing; unmatched passages are labeled “needs review”). Scanned PDFs are refused honestly, partial extractions are labeled partial, and missing wording is never invented.</p>"
    },
    {
      id: "data-source", title: "Demo data vs. your data",
      body: "<p>Every results page, report, and export is labeled with where its numbers came from: <b>Demo Data</b> (the built-in sample exam) or <b>Uploaded Data</b> (your parsed CSVs, with the file and student counts shown). The two never mix. If none of your files could be parsed, the app blocks the results page and tells you why instead of showing fake numbers.</p>"
    },
    {
      id: "saving", title: "Saving your work",
      body: "<p>“Save analysis” on the Results page stores the analysis in <b>this browser’s local storage</b> — on this device, not in the cloud. Reopen saves from the Saved page, and export a JSON backup there if the work matters (clearing browser data deletes local saves). Real sign-in with cloud storage is planned; the Sign in page explains honestly what works today.</p>"
    },
    {
      id: "ai", title: "AI Deep Review & AI feedback",
      body: "<p><b>AI Deep Review</b> runs as part of Run Analysis (Step 6 checkbox, on by default). After the deterministic analysis, each flagged question\u2019s evidence packet \u2014 wording, choices, aggregate percentages, linked passage excerpt, <b>never student names</b> \u2014 is sent through the secure server route for a specific verdict: rescore, accept multiple answers, remove from scoring, revise next year, or human review for visual items. Verdicts replace the generic rule text on the cards; every deterministic number stays. With no API key, the run falls back to the deterministic report and the report banner says so.</p><p>On uploaded results, flagged cards without a Deep Review verdict still offer per-question AI feedback. The AI <b>never decides what gets flagged</b> — the transparent data rules do that — and it only sees that one question’s numbers plus whatever wording was genuinely extracted from your uploads. Nothing is sent until you confirm a privacy/cost notice, suggestions are advisory, and rewrite suggestions only appear when the full question text was extracted. It requires the app to run through <code>server.js</code> with an API key configured (see AI_SETUP.md); without that, the button says so honestly and everything else works normally.</p>"
    },
    {
      id: "labels", title: "What the labels mean",
      body: "<ul style='padding-left:18px;'>" + ED.analysis.FLAGS.map(function (f) {
        return "<li style='margin-bottom:10px;'>" + ED.blocks.flagBadge(f.label) + "<br><span class='small'>" + f.meaning + "</span></li>";
      }).join("") + "</ul>"
    },
    {
      id: "results", title: "How to read the results",
      body: "<p>Start at the top of the Results page. The <b>Key / Scoring Warning</b> (if there is one) is the most urgent thing on the page. The <b>Priority Action List</b> shows every flagged question, most urgent first. Each question card then gives you three things in order: <b>The Problem</b> (what went wrong), <b>Immediate Action for This Week</b> (what to do about current marks), and <b>Fix for Next Year’s Test Bank</b> (how to repair the question before reuse).</p><p class=\"mt-8\">Anything technical lives under <b>Advanced Details</b>, collapsed at the bottom of a card. You never need to open it to act on a recommendation.</p>"
    },
    {
      id: "key-error", title: "What “Possible Key Error” means",
      body: "<p>It means several signals point at the key document itself — for example: most students across <i>every</i> class chose the same “wrong” answer, the key inside one class file disagrees with another, or the keyed answer isn’t supported by the reading.</p><p class=\"mt-8\">A question is never called a key error just because many students missed it. Hard questions are normal; keys that disagree with each other are not.</p>"
    },
    {
      id: "hard-fair", title: "What “Hard but Fair” means",
      body: "<p>Lots of students missed it, but the question is fine: the keyed answer is defensible, the choices are reasonable, and the answer pattern looks like a hard skill rather than a broken item. <b>No grading change is recommended.</b> Sometimes the right response is a teaching review next year, not a test fix.</p>"
    },
    {
      id: "before-marks", title: "What to do before changing marks",
      body: "<p>Exam Detective recommends; it never changes anything. Before you rescore:</p><ol style='padding-left:20px;'><li>Read the flagged question and the passage yourself.</li><li>Check the suggested answer against the text — do you agree?</li><li>Talk to the other teachers who gave the exam, especially when sections were scored with different keys.</li><li>Follow your school’s process for mark changes.</li></ol>"
    },
    {
      id: "responsible", title: "Responsible use",
      body: "<p>Exam Detective is designed for aggregate exam-result analysis. Avoid uploading student names or personal information unless your school or district allows it. Uploaded files may contain internal assessment materials, answer keys, and class performance data — delete analyses when they are no longer needed (Settings → Delete). And only upload materials you’re allowed to analyze.</p>"
    }
  ];

  return (
    '<div class="page"><div class="container narrow">' +
      '<div class="page-head">' +
        '<div class="eyebrow">Help</div>' +
        '<h1>How to use Exam Detective</h1>' +
        '<p class="lede">Everything here is written for a first-time user. If a page in the app ever confuses you, this is the place to look.</p>' +
      '</div>' +
      '<nav class="help-toc" aria-label="Help topics">' +
        sections.map(function (s) { return '<a href="#help-' + s.id + '">' + s.title + '</a>'; }).join("") +
      '</nav>' +
      sections.map(function (s) {
        return '<div class="card" id="help-' + s.id + '"><h2>' + s.title + '</h2>' + s.body + '</div>';
      }).join("") +
    '</div></div>'
  );
};
