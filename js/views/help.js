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
      body: "<p><b>Class result reports</b> (required): the per-class export from your assessment tool — PDF, CSV, or XLSX. These contain the question-by-question results.</p><p class=\"mt-8\"><b>Exam questions and reading booklet</b> (optional but recommended): these let the review explain <i>why</i> a question broke, not just that it broke.</p><p class=\"mt-8\"><b>Answer key</b> (recommended): the app compares your key against the keys detected inside the result files — that comparison is how key errors get caught.</p>"
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
