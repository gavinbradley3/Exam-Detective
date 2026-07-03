/* ============================================================
   Exam Detective — PDF text & answer-key extraction (real, honest)

   Scope (deliberately narrow, stated in the UI):
   - TEXT-BASED PDFs only. Content streams are inflated with the
     platform-native DecompressionStream (FlateDecode) and text is
     read from the standard text operators (Tj / TJ / ' / ").
   - Works when the PDF uses standard font encodings (most exports
     from word processors and assessment tools that don't subset
     with custom CMaps).
   - SCANNED / image-only PDFs are detected and rejected with an
     honest message — there is NO OCR in this build.
   - PDFs whose fonts use custom encodings produce unreadable bytes;
     we detect that (low printable-character ratio) and refuse to
     guess rather than deliver garbage.

   Used for ANSWER KEY extraction (wizard Step 4). Full exam-question
   and passage parsing are not built — see BUILD_NOTES.md.
   ============================================================ */

window.ED = window.ED || {};

(function () {
  "use strict";

  var latin1 = new TextDecoder("latin1");

  function inflateZlib(bytes) {
    if (typeof DecompressionStream === "undefined") {
      return Promise.reject(new Error("no-decompressor"));
    }
    var ds = new DecompressionStream("deflate"); // PDF FlateDecode = zlib wrapper
    var stream = new Blob([bytes]).stream().pipeThrough(ds);
    return new Response(stream).arrayBuffer().then(function (ab) {
      return new Uint8Array(ab);
    });
  }

  // ---------- document model: objects, fonts, CMaps, pages ----------
  // Real-world PDFs (Google Docs, Word, SMART editors) embed subset fonts
  // with 2-byte CID encodings and hex strings. Reading them requires the
  // per-font ToUnicode CMaps — without this, extraction yields nothing.
  // This model also surfaces per-page text and embedded-image detection
  // for the readability audit and visual-evidence flags.

  function buildObjects(raw, src) {
    // Sequential walk that always jumps over stream bodies — compressed
    // stream bytes can contain "N 0 obj"-lookalikes that would otherwise
    // derail the scan past real objects (fonts, pages).
    var objs = {};
    var pos = 0;
    var re = /(\d+)\s+0\s+obj\b/g;
    while (true) {
      re.lastIndex = pos;
      var m = re.exec(src);
      if (!m) break;
      var num = +m[1];
      var start = re.lastIndex;
      var sIdx = src.indexOf("stream", start);
      var eIdx = src.indexOf("endobj", start);
      if (eIdx === -1) break;
      if (sIdx !== -1 && sIdx < eIdx) {
        var dict = src.slice(start, sIdx);
        var ds = sIdx + 6;
        if (src[ds] === "\r") ds++;
        if (src[ds] === "\n") ds++;
        var de = src.indexOf("endstream", ds);
        if (de === -1) break;
        var dataEnd = de;
        while (dataEnd > ds && (src[dataEnd - 1] === "\n" || src[dataEnd - 1] === "\r")) dataEnd--;
        objs[num] = { dict: dict, stream: raw.subarray(ds, dataEnd) };
        var e2 = src.indexOf("endobj", de);
        pos = e2 === -1 ? de + 9 : e2 + 6;
      } else {
        objs[num] = { dict: src.slice(start, eIdx), stream: null };
        pos = eIdx + 6;
      }
    }
    return objs;
  }

  function getStream(objs, num) {
    var o = objs[num];
    if (!o || !o.stream) return Promise.resolve(null);
    if (/\/FlateDecode/.test(o.dict)) {
      return inflateZlib(o.stream).catch(function (e) {
        if (e && e.message === "no-decompressor") throw e;
        return null;
      });
    }
    if (/\/Filter/.test(o.dict)) return Promise.resolve(null); // unsupported filter
    return Promise.resolve(o.stream);
  }

  // PDF 1.5 object streams hold non-stream objects (incl. font dicts).
  function expandObjectStreams(objs) {
    var chain = Promise.resolve();
    Object.keys(objs).forEach(function (numStr) {
      var o = objs[numStr];
      if (!/\/Type\s*\/ObjStm\b/.test(o.dict)) return;
      chain = chain.then(function () {
        return getStream(objs, +numStr).then(function (data) {
          if (!data) return;
          var txt = latin1.decode(data);
          var firstM = o.dict.match(/\/First\s+(\d+)/);
          var nM = o.dict.match(/\/N\s+(\d+)/);
          if (!firstM || !nM) return;
          var first = +firstM[1], n = +nM[1];
          var pairs = txt.slice(0, first).trim().split(/\s+/).map(Number);
          for (var i = 0; i < n; i++) {
            var num = pairs[2 * i], off = pairs[2 * i + 1];
            if (isNaN(num) || isNaN(off)) continue;
            var endOff = (i + 1 < n && !isNaN(pairs[2 * i + 3])) ? first + pairs[2 * i + 3] : txt.length;
            if (!objs[num]) objs[num] = { dict: txt.slice(first + off, endOff), stream: null };
          }
        });
      });
    });
    return chain.then(function () { return objs; });
  }

  function hexToStr(h) {
    var s = "";
    for (var i = 0; i + 4 <= h.length; i += 4) s += String.fromCharCode(parseInt(h.substr(i, 4), 16));
    if (h.length % 4 === 2) s += String.fromCharCode(parseInt(h.substr(h.length - 2, 2), 16));
    return s;
  }

  // hex string -> one char per BYTE (CMap pairing happens in mapBytes)
  function hexToByteStr(h) {
    var s = "";
    for (var i = 0; i + 2 <= h.length; i += 2) s += String.fromCharCode(parseInt(h.substr(i, 2), 16));
    return s;
  }

  function parseCMap(txt) {
    var map = {};
    var width = 2;
    var cs = txt.match(/begincodespacerange\s*<([0-9A-Fa-f]+)>/);
    if (cs) width = Math.max(1, Math.round(cs[1].length / 2));
    var m, p;
    var bc = /beginbfchar([\s\S]*?)endbfchar/g;
    while ((m = bc.exec(txt))) {
      var pairRe = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g;
      while ((p = pairRe.exec(m[1]))) map[parseInt(p[1], 16)] = hexToStr(p[2]);
    }
    var br = /beginbfrange([\s\S]*?)endbfrange/g;
    while ((m = br.exec(txt))) {
      var rRe = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(?:<([0-9A-Fa-f]+)>|\[((?:\s*<[0-9A-Fa-f]+>)+)\s*\])/g;
      while ((p = rRe.exec(m[1]))) {
        var lo = parseInt(p[1], 16), hi = parseInt(p[2], 16);
        if (hi - lo > 65535) continue;
        if (p[3]) {
          var dst = hexToStr(p[3]);
          for (var c = lo; c <= hi; c++) {
            var last = dst.charCodeAt(dst.length - 1) + (c - lo);
            map[c] = dst.slice(0, -1) + String.fromCharCode(last);
          }
        } else if (p[4]) {
          var items = p[4].match(/<([0-9A-Fa-f]+)>/g) || [];
          for (var k = 0; k < items.length && lo + k <= hi; k++) {
            map[lo + k] = hexToStr(items[k].replace(/[<>]/g, ""));
          }
        }
      }
    }
    return { map: map, width: width };
  }

  // -> Promise<doc model: { objs, fontByName, cmapByObj, xobjImageNames, pages }>
  function buildDocModel(raw) {
    var src = latin1.decode(raw);
    var objs = buildObjects(raw, src);
    return expandObjectStreams(objs).then(function () {
      // font CMaps
      var cmapByObj = {};
      var chain = Promise.resolve();
      Object.keys(objs).forEach(function (numStr) {
        var tu = objs[numStr].dict.match(/\/ToUnicode\s+(\d+)\s+0\s+R/);
        if (!tu) return;
        chain = chain.then(function () {
          return getStream(objs, +tu[1]).then(function (data) {
            if (data) cmapByObj[numStr] = parseCMap(latin1.decode(data));
          });
        });
      });
      return chain.then(function () {
        // resource-name -> font object (document-wide; generated PDFs use
        // stable names; conflicts fall back to "no cmap" + honesty gate)
        var fontByName = {};
        var imageObjs = {};
        Object.keys(objs).forEach(function (numStr) {
          if (/\/Subtype\s*\/Image\b/.test(objs[numStr].dict)) imageObjs[numStr] = true;
        });
        var xobjImageNames = {};
        Object.keys(objs).forEach(function (numStr) {
          var d = objs[numStr].dict;
          var fm = /\/Font\s*<<([\s\S]*?)>>/g, fdict;
          while ((fdict = fm.exec(d))) {
            var pr = /\/([A-Za-z0-9.#+\-]+)\s+(\d+)\s+0\s+R/g, pp;
            while ((pp = pr.exec(fdict[1]))) fontByName[pp[1]] = pp[2];
          }
          var fr = d.match(/\/Font\s+(\d+)\s+0\s+R/);
          if (fr && objs[fr[1]]) {
            var pr2 = /\/([A-Za-z0-9.#+\-]+)\s+(\d+)\s+0\s+R/g, pp2;
            while ((pp2 = pr2.exec(objs[fr[1]].dict))) fontByName[pp2[1]] = pp2[2];
          }
          var xm = /\/XObject\s*<<([\s\S]*?)>>/g, xdict;
          while ((xdict = xm.exec(d))) {
            var xr = /\/([A-Za-z0-9.#+\-]+)\s+(\d+)\s+0\s+R/g, xp;
            while ((xp = xr.exec(xdict[1]))) {
              if (imageObjs[xp[2]]) xobjImageNames[xp[1]] = true;
            }
          }
        });
        // pages in document order
        var pages = [];
        Object.keys(objs).map(Number).sort(function (a, b) { return a - b; }).forEach(function (num) {
          var d = objs[num].dict;
          if (!/\/Type\s*\/Page\b/.test(d) || /\/Type\s*\/Pages\b/.test(d)) return;
          var contents = [];
          var c1 = d.match(/\/Contents\s+(\d+)\s+0\s+R/);
          if (c1) contents.push(+c1[1]);
          var c2 = d.match(/\/Contents\s*\[([^\]]*)\]/);
          if (c2) {
            var cr = /(\d+)\s+0\s+R/g, cp;
            while ((cp = cr.exec(c2[1]))) contents.push(+cp[1]);
          }
          if (contents.length) pages.push({ contents: contents });
        });
        return {
          objs: objs, fontByName: fontByName, cmapByObj: cmapByObj,
          xobjImageNames: xobjImageNames, pages: pages,
          imageCount: Object.keys(imageObjs).length
        };
      });
    });
  }

  // ---------- text operators -> text (CID-aware) ----------

  function decodePdfString(s) {
    // contents of a ( ) string, with backslash escapes and octal codes;
    // returns one char per BYTE (mapped through the font CMap by callers)
    var out = "";
    for (var i = 0; i < s.length; i++) {
      var c = s[i];
      if (c !== "\\") { out += c; continue; }
      var n = s[++i];
      if (n === "n") out += "\n";
      else if (n === "r") out += "\r";
      else if (n === "t") out += "\t";
      else if (n === "b" || n === "f") out += "";
      else if (n >= "0" && n <= "7") {
        var oct = n;
        while (oct.length < 3 && s[i + 1] >= "0" && s[i + 1] <= "7") oct += s[++i];
        out += String.fromCharCode(parseInt(oct, 8));
      } else out += n; // \\, \(, \), line continuation
    }
    return out;
  }

  function mapBytes(byteStr, cmap, stats) {
    if (!cmap) { stats.plain += byteStr.length; return byteStr; }
    var out = "";
    var w = cmap.width;
    for (var i = 0; i + w <= byteStr.length; i += w) {
      var code = 0;
      for (var k = 0; k < w; k++) code = (code << 8) | byteStr.charCodeAt(i + k);
      var ch = cmap.map[code];
      if (ch !== undefined) { out += ch; stats.mapped++; }
      else stats.unmapped++;
    }
    return out;
  }

  // Pull readable text from one decompressed content stream.
  function textFromContent(content, model, pageInfo) {
    var src = latin1.decode(content);
    if (!/\b(BT|Tj|TJ)\b/.test(src)) {
      if (pageInfo && /\bDo\b/.test(src)) pageInfo.hasImage = true;
      return null;
    }
    var out = "";
    var cmap = null;
    var stats = { mapped: 0, unmapped: 0, plain: 0 };
    var re = /\/([A-Za-z0-9.#+\-]+)\s+[\d.]+\s+Tf|\(((?:[^()\\]|\\.)*)\)\s*(Tj|'|")|<([0-9A-Fa-f\s]*)>\s*(Tj|'|")|\[((?:[^\]\\]|\\.|\([^)]*\))*?)\]\s*TJ|\/([A-Za-z0-9.#+\-]+)\s+Do\b|(-?[\d.]+)\s+(-?[\d.]+)\s+(?:Td|TD)\b|(T\*|ET)/g;
    var m;
    while ((m = re.exec(src))) {
      if (m[1] !== undefined) {                 // /F1 12 Tf — font switch
        var objNum = model ? model.fontByName[m[1]] : null;
        cmap = objNum && model.cmapByObj[objNum] ? model.cmapByObj[objNum] : null;
      } else if (m[2] !== undefined) {          // (string) Tj | ' | "
        out += mapBytes(decodePdfString(m[2]), cmap, stats);
      } else if (m[4] !== undefined) {          // <hex> Tj
        out += mapBytes(hexToByteStr(m[4].replace(/\s+/g, "")), cmap, stats);
      } else if (m[6] !== undefined) {          // [ ... ] TJ
        var inner = m[6];
        var sRe = /\(((?:[^()\\]|\\.)*)\)|<([0-9A-Fa-f\s]*)>|(-?[\d.]+)/g, sm;
        while ((sm = sRe.exec(inner))) {
          if (sm[1] !== undefined) out += mapBytes(decodePdfString(sm[1]), cmap, stats);
          else if (sm[2] !== undefined) out += mapBytes(hexToByteStr(sm[2].replace(/\s+/g, "")), cmap, stats);
          else if (parseFloat(sm[3]) < -150) out += " "; // big kern gap = word space
        }
      } else if (m[7] !== undefined) {          // /Im1 Do — XObject draw
        if (pageInfo && model && model.xobjImageNames[m[7]]) pageInfo.hasImage = true;
      } else if (m[8] !== undefined) {          // tx ty Td/TD
        if (Math.abs(parseFloat(m[9])) > 0.5) out += "\n"; // real line move
      } else {                                  // T* | ET — line/block end
        out += "\n";
      }
    }
    if (pageInfo) {
      pageInfo.mapped = (pageInfo.mapped || 0) + stats.mapped;
      pageInfo.unmapped = (pageInfo.unmapped || 0) + stats.unmapped;
    }
    return out;
  }

  function printableRatio(text) {
    // judged over actual content — whitespace doesn't count as evidence
    var visible = 0, good = 0;
    for (var i = 0; i < text.length; i++) {
      var c = text.charCodeAt(i);
      if (c === 32 || c === 10 || c === 13 || c === 9) continue;
      visible++;
      if ((c >= 33 && c < 127) || (c >= 0x00C0 && c <= 0x024F) ||
          (c >= 0x2010 && c <= 0x2027) || c === 0x2122 || c === 0x00A9) good++;
    }
    return { visible: visible, ratio: visible ? good / visible : 0 };
  }

  var ERRORS = {
    "no-decompressor": "This browser can’t decompress PDF streams. Use a current version of Chrome, Edge, Firefox, or Safari.",
    "not-a-pdf": "This doesn’t look like a valid PDF file — it may be corrupted or mislabeled. Try re-exporting it.",
    scanned: "This PDF appears to be a scan (images of pages, no machine-readable text). Exam Detective doesn’t do OCR yet, so it can’t read it.",
    encoded: "This PDF stores its text with a custom font encoding we can’t decode yet. Rather than guess at garbled text, nothing was read from it.",
    empty: "We couldn’t find any readable text in this PDF."
  };

  // -> Promise<{ ok, text, kind, pages:[{page,text,hasImage,mapped,unmapped}],
  //              imageCount, visualPages:[n], unmappedShare, error }>
  function extractText(buffer) {
    var raw = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    var head = latin1.decode(raw.subarray(0, 1024));
    if (head.indexOf("%PDF") === -1) {
      return Promise.resolve({ ok: false, kind: "empty", error: ERRORS["not-a-pdf"] });
    }
    return buildDocModel(raw).then(function (model) {
      var pageResults = [];
      var chain = Promise.resolve();
      if (model.pages.length) {
        model.pages.forEach(function (pg, idx) {
          chain = chain.then(function () {
            var info = { page: idx + 1, text: "", hasImage: false, mapped: 0, unmapped: 0 };
            var inner = Promise.resolve();
            pg.contents.forEach(function (cnum) {
              inner = inner.then(function () {
                return getStream(model.objs, cnum).then(function (bytes) {
                  if (!bytes) return;
                  var t = textFromContent(bytes, model, info);
                  if (t !== null) info.text += t;
                });
              });
            });
            return inner.then(function () { pageResults.push(info); });
          });
        });
      } else {
        // no page tree found — treat each plausible stream as a page
        Object.keys(model.objs).forEach(function (numStr) {
          var o = model.objs[numStr];
          if (!o.stream) return;
          if (/\/Subtype\s*\/Image|\/FontFile|\/Type\s*\/ObjStm|CMap/.test(o.dict)) return;
          chain = chain.then(function () {
            return getStream(model.objs, +numStr).then(function (bytes) {
              if (!bytes) return;
              var info = { page: pageResults.length + 1, text: "", hasImage: false, mapped: 0, unmapped: 0 };
              var t = textFromContent(bytes, model, info);
              if (t !== null) { info.text = t; pageResults.push(info); }
            });
          });
        });
      }
      return chain.then(function () {
        var text = pageResults.map(function (p) { return p.text; }).join("\n");
        var pr = printableRatio(text);
        var totalMapped = 0, totalUnmapped = 0;
        pageResults.forEach(function (p) { totalMapped += p.mapped; totalUnmapped += p.unmapped; });
        if (pr.visible < 40) {
          if (model.imageCount > 0) return { ok: false, kind: "scanned", error: ERRORS.scanned, pages: pageResults, imageCount: model.imageCount };
          return { ok: false, kind: "empty", error: ERRORS.empty, pages: pageResults, imageCount: 0 };
        }
        if (pr.ratio < 0.7) {
          return { ok: false, kind: "encoded", error: ERRORS.encoded, pages: pageResults, imageCount: model.imageCount };
        }
        var visualPages = pageResults.filter(function (p) { return p.hasImage; }).map(function (p) { return p.page; });
        return {
          ok: true, kind: "text", text: text,
          pages: pageResults, imageCount: model.imageCount, visualPages: visualPages,
          unmappedShare: (totalMapped + totalUnmapped) ? totalUnmapped / (totalMapped + totalUnmapped) : 0
        };
      });
    }).catch(function (e) {
      return { ok: false, kind: "empty", error: e && e.message === "no-decompressor" ? ERRORS["no-decompressor"] : ERRORS["not-a-pdf"] };
    });
  }

  // ---------- public: answer key from text ----------

  // Reads "1. A  2) B  Q3: C  4 D  5. b" patterns — numbered lists,
  // table cells (each on its own line: "1" / "B"), compact multi-column
  // rows ("1 B  26 C  51 D"), and keys split across pages. Lowercase
  // letters are accepted and normalized. Reports coverage and conflicts
  // honestly — extraction always needs teacher review.
  function keyFromText(text) {
    var seen = {};       // q -> { letter -> count }
    var re = /(?:\bQ\s*)?(\d{1,3})\s*[.):\-]*\s+([A-Ea-e])(?![a-zA-Z0-9])/g;
    var m;
    while ((m = re.exec(text))) {
      var q = parseInt(m[1], 10);
      if (q < 1 || q > ED.csv.MAX_QUESTIONS) continue;
      var L = m[2].toUpperCase();
      seen[q] = seen[q] || {};
      seen[q][L] = (seen[q][L] || 0) + 1;
    }
    var qs = Object.keys(seen).map(Number);
    if (qs.length < 3) {
      return { ok: false, error: "The answer key PDF was uploaded, but no question→answer pairs could be extracted (looked for patterns like “1. A”, “2) B”, “Q3: C”, or table cells of number/letter)." };
    }

    var maxQ = Math.max.apply(null, qs);
    var key = [];
    var conflicts = [];
    var missing = [];
    for (var q2 = 1; q2 <= maxQ; q2++) {
      if (!seen[q2]) { key.push(""); missing.push(q2); continue; }
      var letters = Object.keys(seen[q2]);
      if (letters.length > 1) {
        // pick the most frequent, but flag it
        letters.sort(function (a, b) { return seen[q2][b] - seen[q2][a]; });
        conflicts.push({ q: q2, letters: letters });
      }
      key.push(letters[0]);
    }
    return {
      ok: true,
      key: key,
      found: qs.length,
      maxQ: maxQ,
      missing: missing,
      conflicts: conflicts
    };
  }

  // -> Promise<{ ok, key, found, maxQ, missing, conflicts, kind, error }>
  function extractKey(buffer) {
    return extractText(buffer).then(function (res) {
      if (!res.ok) {
        if (res.kind === "scanned") res.error = "The answer key appears to be scanned or image-only. " + ERRORS.scanned + " Upload a text-based PDF, CSV, or XLSX answer key — or paste the key instead.";
        else if (res.kind === "encoded" || res.kind === "empty") res.error += " Copy the key out of the document and use the paste box instead.";
        return res;
      }
      // classify FIRST: a results report or booklet contains stray
      // number-letter pairs that could masquerade as a key
      if (window.ED && ED.ingest) {
        var cls = ED.ingest.classify(res.text);
        if (cls.type === "student_results") return { ok: false, error: "This PDF is a class RESULTS report (item analysis), not an answer key. Upload it in Step 2 — and upload the key document here instead." };
        if (cls.type === "questions_booklet") return { ok: false, error: "This PDF is the QUESTIONS BOOKLET, not an answer key. Upload it in Step 3 — and upload the key document here instead." };
        if (cls.type === "readings_booklet") return { ok: false, error: "This PDF is the READINGS BOOKLET, not an answer key. Upload it in Step 3 — and upload the key document here instead." };
      }
      var keyRes = keyFromText(res.text);
      if (!keyRes.ok) {
        // wrong-document detection: say what this PDF actually looks like
        var sniff = sniffType(res.text);
        if (sniff === "results") keyRes.error = "This PDF looks like a class RESULTS report (rows of question percentages), not an answer key. Upload it in Step 2 — and upload the key document here instead.";
        else if (sniff === "exam") keyRes.error = "This PDF looks like the EXAM QUESTIONS (numbered stems with A–D choices), not an answer key. Upload it in Step 3 — and upload the key document here instead.";
        return keyRes;
      }
      keyRes.kind = "text";
      return keyRes;
    });
  }

  // ---------- document-type sniffing (cross-routing wrong uploads) ----------

  // Lightweight, regex-only classification of extracted PDF text:
  // "results" (question + percent rows), "exam" (stems + option lines),
  // "key" (number→letter pairs), or "unknown" (likely a passage/other).
  function sniffType(text) {
    var lines = String(text || "").split(/\n/).map(function (l) { return l.replace(/\s+/g, " ").trim(); }).filter(Boolean);
    var resultRows = 0, optionLines = 0, stems = 0;
    lines.forEach(function (l) {
      if (/^(?:q(?:uestion)?\s*)?\d{1,3}\b.*?\d{1,3}(?:\.\d+)?\s*%/i.test(l)) resultRows++;
      if (/^[A-E][.)]\s+\S/.test(l)) optionLines++;
      var sm = l.match(/^\d{1,3}[.)]\s+(.{4,})/);
      if (sm && !/^[A-Ea-e]\b/.test(sm[1])) stems++;
    });
    var keyPairs = (String(text).match(/(?:\bQ\s*)?\d{1,3}\s*[.):\-]*\s+[A-Ea-e](?![a-zA-Z0-9])/g) || []).length;
    if (resultRows >= 4) return "results";
    if (stems >= 2 && optionLines >= 4) return "exam";
    if (keyPairs >= 3) return "key";
    return "unknown";
  }

  // ---------- public: class results from an item-analysis PDF ----------

  // Real parsing of text-based item-analysis reports: rows that pair a
  // question number with a percent (e.g. "12   84%   B"), or table cells
  // split across lines ("12" / "84%"). Produces the same aggregate
  // section shape the CSV/XLSX parsers produce. Nothing is guessed:
  // distributions aren't invented, and unreadable layouts get a
  // specific refusal.
  function resultsFromText(text, opts) {
    opts = opts || {};
    var lines = String(text || "").split(/\n/).map(function (l) { return l.replace(/\s+/g, " ").trim(); }).filter(Boolean);
    var warnings = [];

    var missedHeader = /(%\s*(missed|incorrect|wrong))|((missed|incorrect|wrong)\s*%)/i.test(text);
    var correctHeader = /(%\s*correct)|(correct\s*%)/i.test(text);
    var treatAsMissed = missedHeader && !correctHeader;

    var responses = 0;
    var rm = String(text).match(/(?:students|responses)\s*[:=]?\s*(\d{1,4})\b/i) ||  // "Students: 26"
             String(text).match(/(\d{1,4})\s+(?:students|responses)\b/i) ||           // "26 students"
             String(text).match(/\b[Nn]\s*=\s*(\d{1,4})\b/);                          // "N = 26"
    if (rm) responses = parseInt(rm[1], 10);

    var questions = {};
    var duplicates = [];
    var anyKeyed = false;
    function addRow(q, pct, keyed) {
      if (!q || q < 1 || q > 130 || isNaN(pct) || pct < 0 || pct > 100) return;
      if (questions[q]) { if (duplicates.indexOf(q) === -1) duplicates.push(q); return; }
      if (keyed) anyKeyed = true;
      questions[q] = {
        distribution: null, correctCount: 0, incorrectCount: 0, blankCount: 0,
        missedPct: treatAsMissed ? Math.round(pct) : 100 - Math.round(pct),
        keyedFromFile: keyed || null
      };
    }

    // pass 1: same-line rows — "12 ... 84% ... B"
    lines.forEach(function (l) {
      var m = l.match(/^(?:q(?:uestion)?\s*)?(\d{1,3})\b(.*)$/i);
      if (!m) return;
      var pm = m[2].match(/(\d{1,3}(?:\.\d+)?)\s*%/);
      if (!pm) return;
      var km = m[2].match(/%\s*(?:.*?\s)?([A-E])(?![a-zA-Z0-9])\s*$/); // keyed letter after the percent
      addRow(parseInt(m[1], 10), parseFloat(pm[1]), km ? km[1] : null);
    });
    // pass 2: table cells on separate lines — "12" then "84%"
    for (var i = 0; i < lines.length - 1; i++) {
      var qm = lines[i].match(/^(\d{1,3})$/);
      if (!qm) continue;
      var nm = lines[i + 1].match(/^(\d{1,3}(?:\.\d+)?)\s*%$/);
      if (nm) addRow(parseInt(qm[1], 10), parseFloat(nm[1]), null);
    }

    var qs = Object.keys(questions).map(Number);
    if (qs.length < 4) {
      var sniff = sniffType(text);
      if (sniff === "key") {
        return { ok: false, error: "This PDF looks like an ANSWER KEY (question→answer pairs, no result percentages), not a results report. Upload it in Step 4 — Answer Key — and upload the class results report here instead." };
      }
      if (sniff === "exam") {
        return { ok: false, error: "This PDF looks like the EXAM QUESTIONS, not a results report. Upload it in Step 3 — and upload the class results report here instead." };
      }
      return { ok: false, error: "No question-results table could be read from this PDF. Exam Detective reads text-based item-analysis layouts with rows like “12 … 84%” (question number + percent correct/missed). If this report uses charts, images, or an unusual table layout, export it as CSV or XLSX from your assessment tool instead." };
    }

    var maxQ = Math.max.apply(null, qs);
    var missing = [];
    for (var q3 = 1; q3 <= maxQ; q3++) if (!questions[q3]) missing.push(q3);

    warnings.push("Percentages in this PDF were read as percent " + (treatAsMissed ? "MISSED" : "CORRECT") +
      (treatAsMissed ? " (the report mentions missed/incorrect)" : "") + " — spot-check one question on this Review step before running.");
    warnings.push("Answer-choice distributions aren’t extracted from PDF reports — key checks use " +
      (anyKeyed ? "the keyed answers found in the report and " : "") + "the key from Step 4.");
    if (duplicates.length) warnings.push("Question" + (duplicates.length === 1 ? "" : "s") + " " + duplicates.join(", ") + " appeared more than once in the PDF — the first row was kept.");
    if (missing.length) warnings.push("No result row was found for question" + (missing.length === 1 ? "" : "s") + " " + missing.slice(0, 12).join(", ") + (missing.length > 12 ? "…" : "") + ".");
    if (!responses) warnings.push("The PDF doesn’t state a student count we could read — this section will show 0 students unless the report includes “Students: N” or “N = …”.");

    var known = qs.map(function (q) { return 100 - questions[q].missedPct; });
    var avg = Math.round(known.reduce(function (a, b) { return a + b; }, 0) / known.length);
    warnings.push("This is an aggregate report (one row per question), so the class average (" + avg + "%) is estimated from question results and the median can’t be computed exactly.");

    return {
      ok: true,
      format: "PDF · item summary",
      warnings: warnings,
      sections: [{
        id: opts.defaultSection || "Class 1",
        responses: responses,
        questionCount: maxQ,
        mode: "aggregate",
        questions: questions,
        studentScores: null,
        estimatedAverage: avg,
        warnings: []
      }]
    };
  }

  // -> Promise<{ ok, sections, warnings, format, error, kind }>
  function extractResults(buffer, opts) {
    return extractText(buffer).then(function (res) {
      if (!res.ok) {
        if (res.kind === "scanned") res.error = ERRORS.scanned + " Export the report as CSV or XLSX from your assessment tool, or upload a text-based PDF.";
        return res;
      }
      // adapter dispatch: SmartMarks/Assessment-Analysis block reports first
      if (window.ED && ED.ingest) {
        var cls = ED.ingest.classify(res.text, opts && opts.fileName);
        if (cls.type === "student_results") {
          var sm = ED.ingest.parseSmartMarks(res, opts);
          sm.pagesRead = res.pages.length; sm.imagesDetected = res.imageCount; sm.visualPages = res.visualPages;
          if (sm.ok || /parser bug/.test(sm.error || "")) return sm;
        }
        if (cls.type === "questions_booklet") {
          return { ok: false, error: "This PDF is the QUESTIONS BOOKLET, not a results report. Upload it in Step 3 — and upload the class results report here instead." };
        }
        if (cls.type === "readings_booklet") {
          return { ok: false, error: "This PDF is the READINGS BOOKLET, not a results report. Upload it in Step 3 — and upload the class results report here instead." };
        }
        if (cls.type === "answer_key") {
          return { ok: false, error: "This PDF looks like an ANSWER KEY (question→answer pairs, no result percentages), not a results report. Upload it in Step 4 — Answer Key — and upload the class results report here instead." };
        }
      }
      var generic = resultsFromText(res.text, opts);
      generic.pagesRead = res.pages.length; generic.imagesDetected = res.imageCount; generic.visualPages = res.visualPages;
      return generic;
    });
  }

  ED.pdf = {
    extractText: extractText,
    extractKey: extractKey,
    keyFromText: keyFromText,
    sniffType: sniffType,
    resultsFromText: resultsFromText,
    extractResults: extractResults
  };
})();
