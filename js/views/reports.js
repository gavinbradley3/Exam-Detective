/* Reports view — report picker plus three rendered reports.
   The Teacher Review Report is the closest match to the uploaded
   HTML design reference (see DESIGN_REFERENCE_NOTES.md). */

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
      desc: "Focused on next year’s exam: what to keep, what to revise (with suggested rewrites), what to remove, and the answer-key corrections."
    }
  };

  function toolbar(reportId) {
    return (
      '<div class="report-toolbar no-print">' +
        '<a class="back-link" href="#/reports" style="margin:0;">&larr; All reports</a>' +
        '<span style="flex-grow:1;"></span>' +
        '<button class="btn btn-outline btn-sm" data-action="print">Print / Save as PDF</button>' +
        '<button class="btn btn-primary btn-sm" data-action="export-html" data-report="' + reportId + '">Download HTML</button>' +
        '<span class="small muted">DOCX export: planned</span>' +
      '</div>'
    );
  }

  // ----- Report bodies -----

  function teacherReviewBody(an) {
    var B = ED.blocks;
    return (
      B.reportHeader(an) +
      B.keyWarning(an) +
      B.legend() +
      '<div class="rhead">Question-by-Question Review</div>' +
      '<p class="rhead-sub">Grouped by reading passage, in exam order.</p>' +
      B.groupedSections(an) +
      B.keyAuditSection(an) +
      B.takeawayPanel(an) +
      B.footerCap(an, "Teacher Review Report")
    );
  }

  function adminSummaryBody(an) {
    var B = ED.blocks;
    var esc = ED.analysis.esc;
    return (
      B.reportHeader(an, { eyebrow: "Department / Admin Summary", title: esc(an.examName) + ":<br>Exam Health &amp; Required Actions" }) +
      B.keyWarning(an) +
      B.snapshot(an) +
      '<div class="rhead">Overall Exam Health</div>' +
      '<p class="rhead-sub">The exam is fundamentally sound: class averages sit in a healthy 66–71% band and five sections produced consistent patterns. The issues below trace back to the answer-key document and a small number of question-design flaws — not to instruction. ' + (an.totalQuestions - an.flagged.length) + ' of ' + an.totalQuestions + ' questions performed normally and need no action.</p>' +
      B.priorityTable(an, false) +
      B.keyAuditSection(an) +
      B.departmentPatternSection(an) +
      '<div class="rhead">Recommended Next Steps</div>' +
      '<p class="rhead-sub">1. Rescore the three key-error questions (Q33 all sections; Q36 and Q66 in 8A/8B/8D only) before marks are finalized.<br>' +
      '2. Apply the accept-both-answers adjustments for Q3, Q29, Q52, and Q67, and drop Q56 from scoring.<br>' +
      '3. Verify all 75 entries of the answer-key document against the source before the exam is reused.<br>' +
      '4. Adopt the suggested rewrites in the Question Bank Revision Report for next year.</p>' +
      B.takeawayPanel(an) +
      B.footerCap(an, "Department / Admin Summary")
    );
  }

  function questionBankBody(an) {
    var B = ED.blocks;
    var esc = ED.analysis.esc;

    var revise = an.flagged.filter(function (f) { return f.rewrite; });
    var remove = an.flagged.filter(function (f) { return f.flag === "Drop From Scoring"; });
    var keyFixes = an.keyAudit.findings;
    var flaggedNums = an.flagged.map(function (f) { return f.number; });
    var keepCount = an.totalQuestions - revise.length - 0; // removals also get rewrites

    var html =
      B.reportHeader(an, { eyebrow: "Question Bank Revision Report", title: "Next Year’s " + esc(an.examName) + ":<br>Keep, Revise, Remove" });

    html += '<div class="rhead">Summary</div>' +
      '<p class="rhead-sub"><b>Keep as written:</b> ' + keepCount + ' of ' + an.totalQuestions + ' questions (including the three key-error items once the key document is corrected).<br>' +
      '<b>Revise before reuse:</b> ' + revise.length + ' questions — suggested rewrites below.<br>' +
      '<b>Remove / rebuild:</b> Q' + remove.map(function (f) { return f.number; }).join(", Q") + ' (rebuilt version included below).<br>' +
      '<b>Answer-key corrections:</b> ' + keyFixes.length + ' entries.</p>';

    html += '<div class="rhead">Answer-Key Corrections</div>' +
      '<div class="ptable-wrap"><table class="ptable">' +
      '<thead><tr><th scope="col">Question</th><th scope="col">Key Currently Says</th><th scope="col">Correct To</th><th scope="col">Why</th></tr></thead><tbody>' +
      [
        [33, "B (and D in two section files)", "C", "Student responses and the poem both support C."],
        [36, "D (in three section files)", "C", "Zero of 129 students chose D; the article’s tone is clearly C."],
        [66, "A (in three section files)", "B", "A is the antonym of the word being defined."]
      ].map(function (r) {
        return '<tr><td class="qn">Q' + r[0] + '</td><td>' + r[1] + '</td><td><b>' + r[2] + '</b></td><td>' + r[3] + '</td></tr>';
      }).join("") +
      '</tbody></table></div>' +
      '<p class="rhead-sub" style="margin-top:10px;">' + esc(an.keyAudit.rowShiftNote) + '</p>';

    html += '<div class="rhead">Suggested Rewrites</div>' +
      '<p class="rhead-sub">Each rewrite keeps the skill the original question was testing and removes the flaw that broke it.</p>';
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

    html += '<div class="rhead">Questions To Keep As Written</div>' +
      '<p class="rhead-sub">Every question not listed above performed normally (' +
      (an.totalQuestions - flaggedNums.length) + ' items), plus Q33, Q36, and Q66 once the key document is corrected, and Q69 — hard but fair, with a teaching review (metaphor vs. symbol) recommended instead of a question change.</p>';

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
    var an = ED.demo.analysis;

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
          '<p class="lede">Three report types, all built from your most recent analysis. Open one, then print it, save it as a PDF, or download it as a standalone HTML file to share.</p>' +
        '</div>' +
        Object.keys(REPORTS).map(function (id) {
          var r = REPORTS[id];
          return '<div class="card">' +
            '<h2>' + r.title + '</h2>' +
            '<p>' + r.desc + '</p>' +
            '<div class="btn-row mt-16">' +
              '<a class="btn btn-primary" href="#/reports/' + id + '">Open report</a>' +
            '</div>' +
          '</div>';
        }).join("") +
        '<p class="small muted mt-16">Export formats: PDF (via Print → Save as PDF) and standalone HTML are available now. DOCX export is planned — see BUILD_NOTES.md.</p>' +
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

    fetch("css/report.css")
      .then(function (r) { if (!r.ok) throw new Error("css"); return r.text(); })
      .then(function (css) {
        var doc = "<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n<meta charset=\"UTF-8\">\n" +
          "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n" +
          "<title>" + REPORTS[reportId].title + " — Exam Detective</title>\n" +
          '<link rel="preconnect" href="https://fonts.googleapis.com">\n' +
          '<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800;900&family=PT+Serif:ital,wght@0,400;0,700;1,400;1,700&display=swap" rel="stylesheet">\n' +
          "<style>\nbody{margin:0;background:#fff;}\n" + css + "\n</style>\n</head>\n<body>\n" +
          '<article class="report">' + body.innerHTML + "</article>\n</body>\n</html>";
        var blob = new Blob([doc], { type: "text/html" });
        var a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "exam-detective-" + reportId + ".html";
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
