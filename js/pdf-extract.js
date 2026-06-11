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

  // ---------- locate stream objects ----------

  // Find every `<<dict>> stream ... endstream` in the raw bytes.
  function findStreams(raw) {
    var src = latin1.decode(raw);
    var streams = [];
    var idx = 0;
    while (true) {
      var s = src.indexOf("stream", idx);
      if (s === -1) break;
      // must be the keyword, not part of "endstream"
      if (src.slice(s - 3, s) === "end") { idx = s + 6; continue; }

      // walk back to the matching `<<` of the dictionary before `stream`
      var dictEnd = src.lastIndexOf(">>", s);
      var depth = 1, dStart = -1;
      for (var i = dictEnd - 1; i >= 0 && i > dictEnd - 4000; i--) {
        if (src[i] === ">" && src[i - 1] === ">") { depth++; i--; }
        else if (src[i] === "<" && src[i - 1] === "<") {
          depth--;
          if (depth === 0) { dStart = i - 1; break; }
          i--;
        }
      }
      var dict = dStart >= 0 ? src.slice(dStart, dictEnd + 2) : "";

      // stream data starts after the EOL following `stream`
      var dataStart = s + 6;
      if (src[dataStart] === "\r") dataStart++;
      if (src[dataStart] === "\n") dataStart++;
      var end = src.indexOf("endstream", dataStart);
      if (end === -1) break;
      var dataEnd = end;
      while (dataEnd > dataStart && (src[dataEnd - 1] === "\n" || src[dataEnd - 1] === "\r")) dataEnd--;

      streams.push({ dict: dict, data: raw.subarray(dataStart, dataEnd) });
      idx = end + 9;
    }
    return streams;
  }

  // ---------- text operators -> text ----------

  function decodePdfString(s) {
    // contents of a ( ) string, with backslash escapes and octal codes
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

  // Pull readable text from one decompressed content stream.
  function textFromContent(content) {
    var src = latin1.decode(content);
    if (!/\b(BT|Tj|TJ)\b/.test(src)) return null; // not a text stream

    var out = "";
    var re = /\(((?:[^()\\]|\\.)*)\)\s*(Tj|'|")|\[((?:[^\]\\]|\\.)*?)\]\s*TJ|(T\*|TD|Td|ET)/g;
    var m;
    while ((m = re.exec(src))) {
      if (m[2]) {                       // (string) Tj | ' | "
        out += decodePdfString(m[1]);
        out += " ";
      } else if (m[3] !== undefined) {  // [ ... ] TJ
        var inner = m[3];
        var sRe = /\(((?:[^()\\]|\\.)*)\)/g;
        var sm;
        while ((sm = sRe.exec(inner))) out += decodePdfString(sm[1]);
        out += " ";
      } else {                          // positioning -> line break
        out += "\n";
      }
    }
    return out;
  }

  function printableRatio(text) {
    if (!text.length) return 0;
    var good = 0;
    for (var i = 0; i < text.length; i++) {
      var c = text.charCodeAt(i);
      if ((c >= 32 && c < 127) || c === 10 || c === 13 || c === 9) good++;
    }
    return good / text.length;
  }

  // ---------- public: extract all text ----------

  var ERRORS = {
    "no-decompressor": "This browser can’t decompress PDF streams. Use a current version of Chrome, Edge, Firefox, or Safari.",
    "not-a-pdf": "This doesn’t look like a PDF file.",
    scanned: "This PDF appears to be a scan (images of pages, no real text). Exam Detective doesn’t do OCR yet, so it can’t read it — enter the key manually or paste it instead.",
    encoded: "This PDF stores its text with a custom font encoding we can’t decode yet. Rather than guess, we’ve left the key blank — copy the key out of the PDF and use the paste box instead.",
    empty: "We couldn’t find any readable text in this PDF. Enter the key manually or paste it instead."
  };

  // -> Promise<{ ok, text, kind: "text"|"scanned"|"encoded"|"empty", error }>
  function extractText(buffer) {
    var raw = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    var head = latin1.decode(raw.subarray(0, 8));
    if (head.indexOf("%PDF") !== 0) {
      return Promise.resolve({ ok: false, kind: "empty", error: ERRORS["not-a-pdf"] });
    }

    var streams = findStreams(raw);
    var imageStreams = 0;
    var texts = [];
    var chain = Promise.resolve();

    streams.forEach(function (st) {
      chain = chain.then(function () {
        if (/\/Subtype\s*\/Image|\/DCTDecode|\/JPXDecode|\/CCITTFaxDecode/.test(st.dict)) {
          imageStreams++;
          return;
        }
        if (/\/FontFile/.test(st.dict)) return; // embedded font programs
        var bytesP;
        if (/\/FlateDecode/.test(st.dict)) {
          bytesP = inflateZlib(st.data).catch(function (e) {
            if (e && e.message === "no-decompressor") throw e;
            return null; // corrupt single stream: skip it
          });
        } else if (/\/Filter/.test(st.dict)) {
          return; // other filters (LZW, ASCII85…) not supported — skip
        } else {
          bytesP = Promise.resolve(st.data);
        }
        return bytesP.then(function (bytes) {
          if (!bytes) return;
          var t = textFromContent(bytes);
          if (t !== null) texts.push(t);
        });
      });
    });

    return chain.then(function () {
      if (!texts.length) {
        if (imageStreams > 0) return { ok: false, kind: "scanned", error: ERRORS.scanned };
        return { ok: false, kind: "empty", error: ERRORS.empty };
      }
      var text = texts.join("\n");
      if (printableRatio(text) < 0.7) {
        return { ok: false, kind: "encoded", error: ERRORS.encoded };
      }
      return { ok: true, kind: "text", text: text };
    }).catch(function (e) {
      return { ok: false, kind: "empty", error: e && e.message === "no-decompressor" ? ERRORS["no-decompressor"] : ERRORS["not-a-pdf"] };
    });
  }

  // ---------- public: answer key from text ----------

  // Reads "1. A  2) B  Q3: C  4 D …" patterns. Reports coverage and
  // conflicts honestly — extraction always needs teacher review.
  function keyFromText(text) {
    var seen = {};       // q -> { letter -> count }
    var order = [];
    var re = /(?:\bQ\s*)?(\d{1,3})\s*[.):\-]*\s+([A-E])(?![a-zA-Z])/g;
    var m;
    while ((m = re.exec(text))) {
      var q = parseInt(m[1], 10);
      if (q < 1 || q > ED.csv.MAX_QUESTIONS) continue;
      seen[q] = seen[q] || {};
      seen[q][m[2]] = (seen[q][m[2]] || 0) + 1;
      order.push(q);
    }
    var qs = Object.keys(seen).map(Number);
    if (qs.length < 5) {
      return { ok: false, error: "We couldn’t find an answer-key pattern in this PDF’s text (looked for things like “1. A”, “2) B”, “Q3: C”). Paste the key into the paste box instead." };
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
      if (!res.ok) return res;
      var keyRes = keyFromText(res.text);
      keyRes.kind = "text";
      return keyRes;
    });
  }

  ED.pdf = {
    extractText: extractText,
    extractKey: extractKey,
    keyFromText: keyFromText
  };
})();
