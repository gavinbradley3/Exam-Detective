/* Reports view — report picker plus three rendered reports, built
   from the ACTIVE dataset (demo or uploaded) and labeled with the
   data source. The Teacher Review Report is the closest match to
   the uploaded HTML design reference (DESIGN_REFERENCE_NOTES.md). */

window.ED = window.ED || {};
ED.views = ED.views || {};
ED.actions = ED.actions || {};

(function () {
  "use strict";

  var REPORTS = {
    "teacher-review": {
      title: "Teacher Review Report",
      desc: "The full question-by-question review: what broke, what to do this week, and the fix for next year’s test bank. Built to match the consolidated review document your department already knows."
    },
    "admin-summary": {
      title: "Department / Admin Summary",
      desc: "A shorter, cleaner overview for administrators: exam health, the questions requiring action, key concerns, and recommended next steps."
    },
    "question-bank": {
      title: "Question Bank Revision Report",
      desc: "Focused on next year’s exam: what to keep, what to revise (with suggested rewrites where available), what to remove, and the answer-key corrections."
    }
  };

  function toolbar(reportId) {
    return (
      '<div class="report-toolbar no-print">' +
        '<a class="back-link" href="#/reports" style="margin:0;">&larr; All reports</a>' +
        '<span style="flex-grow:1;"></span>' +
        '<button class="btn btn-outline btn-sm" data-action="print">Print / Save as PDF</button>' +
        '<button class="btn btn-primary btn-sm" data-action="export-html" data-report="' + reportId + '">Download HTML</button>' +
        '<span class="planned-tag" title="DOCX export is planned but not built yet">DOCX — planned</span>' +
      '</div>'
    );
  }

  // ----- Report bodies -----

  function teacherReviewBody(an) {
    var B = ED.blocks;
    return (
      B.reportHeader(an) +
      (ED.deepReview ? ED.deepReview.renderBanner(an) : "") +
      B.keyWarning(an) +
      B.legend() +
      '<div class="rhead">Question-by-Question Review</div>' +
      '<p class="rhead-sub">' + (an.source === "uploaded" ? "In exam order, from your uploaded results." : "Grouped by reading passage, in exam order.") + '</p>' +
      B.groupedSections(an) +
      (ED.deepReview && an.deepReviewSynthesis ? ED.deepReview.renderSynthesis(an.deepReviewSynthesis) : "") +
      B.keyAuditSection(an) +
      B.takeawayPanel(an) +
      B.footerCap(an, "Teacher Review Report")
    );
  }

  function adminSummaryBody(an) {
    var B = ED.blocks;
    var esc = ED.analysis.esc;

    var avgs = an.sections.map(function (s) { return s.average; });
    var avgBand = avgs.length > 1 ? Math.min.apply(null, avgs) + "–" + Math.max.apply(null, avgs) + "%" : (avgs[0] || 0) + "%";
    var normal = an.totalQuestions - an.flagged.length;
    var byFlag = {};
    an.flagged.forEach(function (f) { (byFlag[f.flag] = byFlag[f.flag] || []).push(f.number); });
    var qlist = function (nums) { return nums.map(function (n) { return "Q" + n; }).join(", "); };

    var steps = [];
    if (byFlag["Possible Key Error"]) steps.push("Verify the key for " + qlist(byFlag["Possible Key Error"]) + " against the exam text, and rescore if the key is wrong — key fixes change marks for every student.");
    if (byFlag["Drop From Scoring"]) steps.push("Remove " + qlist(byFlag["Drop From Scoring"]) + " from scoring.");
    if (byFlag["Accept Multiple Answers"]) steps.push("Apply the accept-both-answers adjustments for " + qlist(byFlag["Accept Multiple Answers"]) + ".");
    if (byFlag["Watch List"]) steps.push("Review the watch-list items (" + qlist(byFlag["Watch List"]) + ") against the exam text before deciding anything.");
    if (byFlag["Revise for Next Year"] || an.flagged.some(function (f) { return f.rewrite; })) steps.push("Adopt the revision notes in the Question Bank Revision Report before the exam is reused.");
    if (!steps.length) steps.push("No grading actions are indicated by this dataset. File the analysis with the exam for next year’s review.");

    var health = an.flagged.length
      ? "Class averages sit at " + avgBand + " across " + an.sections.length + " section" + (an.sections.length === 1 ? "" : "s") + ". " +
        normal + " of " + an.totalQuestions + " questions performed within normal ranges and need no action; the items below are the exceptions."
      : "Class averages sit at " + avgBand + ". All " + an.totalQuestions + " questions performed within normal ranges — no actions required.";

    return (
      B.reportHeader(an, { eyebrow: "Department / Admin Summary", title: esc(an.examName) + ":<br>Exam Health &amp; Required Actions" }) +
      B.keyWarning(an) +
      B.snapshot(an) +
      '<div class="rhead">Overall Exam Health</div>' +
      '<p class="rhead-sub">' + health + '</p>' +
      B.priorityTable(an, false) +
      B.keyAuditSection(an) +
      B.departmentPatternSection(an) +
      '<div class="rhead">Recommended Next Steps</div>' +
      '<p class="rhead-sub">' + steps.map(function (s, i) { return (i + 1) + ". " + s; }).join("<br>") + '</p>' +
      B.takeawayPanel(an) +
      B.footerCap(an, "Department / Admin Summary")
    );
  }

  function questionBankBody(an) {
    var B = ED.blocks;
    var esc = ED.analysis.esc;

    var revise = an.flagged.filter(function (f) { return f.rewrite; });
    var remove = an.flagged.filter(function (f) { return f.flag === "Drop From Scoring"; });
    var keyErrors = an.flagged.filter(function (f) { return f.flag === "Possible Key Error"; });
    var keepCount = an.totalQuestions - revise.length;

    var html =
      B.reportHeader(an, { eyebrow: "Question Bank Revision Report", title: "Next Year’s " + esc(an.examName) + ":<br>Keep, Revise, Remove" });

    html += '<div class="rhead">Summary</div>' +
      '<p class="rhead-sub"><b>Keep as written:</b> ' + keepCount + ' of ' + an.totalQuestions + ' questions' +
      (keyErrors.length ? ' (including key-concern items once the key document is verified)' : '') + '.<br>' +
      '<b>Revise before reuse:</b> ' + (revise.length ? revise.length + ' question' + (revise.length === 1 ? '' : 's') + ' — suggested rewrites below.' : 'none with rewrites available.') + '<br>' +
      (remove.length ? '<b>Remove / rebuild:</b> Q' + remove.map(function (f) { return f.number; }).join(", Q") + '.<br>' : '') +
      '<b>Answer-key checks:</b> ' + (keyErrors.length ? keyErrors.length + ' entries to verify.' : 'none flagged.') + '</p>';

    if (keyErrors.length) {
      html += '<div class="rhead">Answer-Key Corrections</div>' +
        '<div class="ptable-wrap"><table class="ptable">' +
        '<thead><tr><th scope="col">Question</th><th scope="col">Key Currently Says</th><th scope="col">' + (an.source === "demo" ? "Correct To" : "Check Against") + '</th><th scope="col">Why</th></tr></thead><tbody>' +
        keyErrors.map(function (f) {
          var to = f.correctAnswer
            ? "<b>" + f.correctAnswer + "</b>"
            : "<b>" + f.mostChosen + "</b> (verify against the exam text first)";
          return '<tr><td class="qn">Q' + f.number + '</td><td>' + esc(f.keyedAnswer) + '</td><td>' + to + '</td><td>' + esc(f.pattern) + '</td></tr>';
        }).join("") +
        '</tbody></table></div>' +
        '<p class="rhead-sub" style="margin-top:10px;">' + esc(an.keyAudit.rowShiftNote) + '</p>';
    }

    html += '<div class="rhead">Suggested Rewrites</div>';
    if (revise.length) {
      html += '<p class="rhead-sub">Each rewrite keeps the skill the original question was testing and removes the flaw that broke it.</p>';
      revise.forEach(function (f) {
        html +=
          '<div class="qcard">' +
            '<div class="qcard-top">' +
              '<div class="qnum-box"><span class="lbl">QUESTION</span><span class="num">' + f.number + '</span></div>' +
              '<div class="qflagline">' + B.flagBadge(f.flag) + '</div>' +
            '</div>' +
            '<p class="prose"><b>Original:</b> ' + f.question + '</p>' +
            '<div class="fixbox" style="margin-top:14px;">' +
              '<div class="fixlbl">Revised Version</div>' +
              '<div class="rq">' + f.rewrite.stem + '</div>' +
              '<ul class="ropts">' +
              f.rewrite.options.map(function (o) {
                return '<li class="ropt' + (o.correct ? " win" : "") + '"><span class="rchip" aria-hidden="true">' + o.letter + '</span>' + o.text +
                  (o.correct ? '<span class="check" aria-label="correct answer">&#10003;</span>' : '') + '</li>';
              }).join("") +
              '</ul>' +
              (f.rewrite.note ? '<p class="immediate rnote">' + f.rewrite.note + '</p>' : '') +
            '</div>' +
          '</div>';
      });
    } else {
      html += '<p class="rhead-sub">' + (an.source === "uploaded"
        ? "Rewrites require reading the exam questions, which this build doesn’t do yet. Use the flag list above to decide which items to rework by hand."
        : "No rewrites are suggested for this dataset.") + '</p>';
    }

    html += '<div class="rhead">Questions To Keep As Written</div>' +
      '<p class="rhead-sub">Every question not listed above performed within normal ranges (' +
      (an.totalQuestions - an.flagged.length) + ' items)' +
      (keyErrors.length ? ', plus the key-concern questions once the key document is verified' : '') + '.</p>';

    html += B.footerCap(an, "Question Bank Revision Report");
    return html;
  }

  var BODIES = {
    "teacher-review": teacherReviewBody,
    "admin-summary": adminSummaryBody,
    "question-bank": questionBankBody
  };

  // ----- Views -----

  ED.views.reports = function (reportId) {
    var an = ED.data.activeAnalysis();

    if (!an) {
      return (
        '<div class="page"><div class="container narrow">' +
          '<div class="page-head"><div class="eyebrow">Reports</div><h1>No analysis yet</h1></div>' +
          '<div class="card" style="text-align:center;padding:44px 28px;">' +
            '<p><b>Reports are built from an analysis — and none has been run.</b></p>' +
            '<div class="btn-row mt-24" style="justify-content:center;">' +
              '<a class="btn btn-primary" href="#/new-analysis">Start New Analysis</a>' +
              '<a class="btn btn-outline" href="#/results/demo">Open the demo</a>' +
            '</div>' +
          '</div>' +
        '</div></div>'
      );
    }

    if (reportId && BODIES[reportId]) {
      return (
        '<div class="page"><div class="container">' +
          toolbar(reportId) +
          '<article class="report" id="report-body" aria-label="' + REPORTS[reportId].title + '">' +
            BODIES[reportId](an) +
          '</article>' +
        '</div></div>'
      );
    }

    return (
      '<div class="page"><div class="container narrow">' +
        '<div class="page-head">' +
          '<div class="eyebrow">Reports</div>' +
          '<h1>Generate a report</h1>' +
          '<p class="lede">Three report types, built from the active analysis. Open one, then print it, save it as a PDF, or download it as a standalone HTML file to share.</p>' +
        '</div>' +
        ED.blocks.sourceBanner(an) +
        Object.keys(REPORTS).map(function (id) {
          var r = REPORTS[id];
          return '<div class="card report-pick">' +
            '<div><h2>' + r.title + '</h2><p>' + r.desc + '</p></div>' +
            '<a class="btn btn-primary" href="#/reports/' + id + '">Open report</a>' +
          '</div>';
        }).join("") +
        '<p class="small muted mt-16">Export formats: PDF (via Print → Save as PDF) and standalone HTML work now. DOCX export is planned, not built.</p>' +
      '</div></div>'
    );
  };

  // ----- Actions -----

  ED.actions["print"] = function () { window.print(); };

  // Download the current report as a standalone HTML file.
  // Needs the page to be served over http(s) so the stylesheet can be
  // fetched; when opened directly from disk we fall back to print-to-PDF.
  ED.actions["export-html"] = function (el) {
    var body = document.getElementById("report-body");
    if (!body) return;
    var reportId = el.getAttribute("data-report") || "report";
    var an = ED.data.activeAnalysis();

    fetch("css/report.css")
      .then(function (r) { if (!r.ok) throw new Error("css"); return r.text(); })
      .then(function (css) {
        var doc = "<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n<meta charset=\"UTF-8\">\n" +
          "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n" +
          "<title>" + REPORTS[reportId].title + (an && an.source === "demo" ? " (DEMO DATA)" : "") + " — Exam Detective</title>\n" +
          '<link rel="preconnect" href="https://fonts.googleapis.com">\n' +
          '<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800;900&family=PT+Serif:ital,wght@0,400;0,700;1,400;1,700&display=swap" rel="stylesheet">\n' +
          "<style>\nbody{margin:0;background:#fff;}\n" + css + "\n</style>\n</head>\n<body>\n" +
          '<article class="report">' + body.innerHTML + "</article>\n</body>\n</html>";
        var blob = new Blob([doc], { type: "text/html" });
        var a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = an ? ED.analysis.exportName(an, reportId, "html") : "exam-detective-" + reportId + ".html";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
      })
      .catch(function () {
        alert("HTML download needs the app to run from a local server (see README.md). For now, use Print → Save as PDF, which works everywhere.");
      });
  };
})();
