/* ============================================================
   Exam Detective — demo data
   A realistic Grade 8 ELA final exam analysis (5 sections,
   75 questions, 129 students). Content is adapted from the
   design-reference report and is DEMO DATA ONLY — not live
   exam results. See PRODUCT_DECISIONS.md.
   ============================================================ */

window.ED = window.ED || {};

(function () {
  "use strict";

  // ----- Class sections (aggregate data only — no student names) -----
  var sections = [
    { id: "8A", responses: 27, average: 66, median: 67, keyVariant: "Key copy 1", strongest: "Vocabulary in context", weakest: "Plot terms (climax, turning point)" },
    { id: "8B", responses: 25, average: 68, median: 69, keyVariant: "Key copy 1", strongest: "Tone and mood", weakest: "Plot terms (climax, turning point)" },
    { id: "8C", responses: 26, average: 71, median: 72, keyVariant: "Key copy 2", strongest: "Main idea", weakest: "Poetry interpretation" },
    { id: "8D", responses: 24, average: 67, median: 68, keyVariant: "Key copy 1", strongest: "Nonfiction detail", weakest: "Poetry interpretation (pacing — see Q14)" },
    { id: "8E", responses: 27, average: 70, median: 71, keyVariant: "Key copy 2", strongest: "Inference", weakest: "Plot terms (climax, turning point)" }
  ];

  // ----- Passage groups (how the exam is organized) -----
  var groups = [
    { roman: "I",    title: "The Strange Orchid",                          range: [1, 20] },
    { roman: "II",   title: "My Left Foot",                                range: [21, 30] },
    { roman: "III",  title: "“Time” by Lisa Sloman",             range: [31, 35] },
    { roman: "IV",   title: "Unicorn-like Blind Fish",                     range: [36, 45] },
    { roman: "V",    title: "The King",                                    range: [46, 55] },
    { roman: "VI",   title: "To Look At Any Thing",                        range: [56, 60] },
    { roman: "VII",  title: "The Power of Love to Transform and to Heal",  range: [61, 70] },
    { roman: "VIII", title: "Calvin and Hobbes (Spaceman Spiff)",          range: [71, 75] }
  ];
  // stable ids — group membership must survive JSON round-trips (saved analyses)
  groups.forEach(function (g, i) { g.id = i; });

  // Questions 1–20 are the two Orchid sets; every demo question falls
  // inside one of the groups above.
  function groupForQuestion(n) {
    for (var i = 0; i < groups.length; i++) {
      if (n >= groups[i].range[0] && n <= groups[i].range[1]) return groups[i];
    }
    return groups[0];
  }

  // ----- Per-section percent-missed for flagged / notable questions -----
  // Keys are question numbers; values are { sectionId: percentMissed }.
  var missedOverrides = {
    3:  { "8A": 78, "8B": 73, "8C": 85, "8D": 80, "8E": 93 },
    14: { "8A": 26, "8B": 31, "8C": 24, "8D": 71, "8E": 29 },
    29: { "8A": 63, "8B": 58, "8C": 67, "8D": 62, "8E": 65 },
    33: { "8A": 100, "8B": 100, "8C": 98, "8D": 100, "8E": 95 },
    36: { "8A": 100, "8B": 100, "8C": 100, "8D": 100, "8E": 100 },
    42: { "8A": 47, "8B": 39, "8C": 64, "8D": 55, "8E": 50 },
    52: { "8A": 89, "8B": 81, "8C": 86, "8D": 93, "8E": 83 },
    56: { "8A": 61, "8B": 65, "8C": 70, "8D": 88, "8E": 63 },
    66: { "8A": 100, "8B": 98, "8C": 95, "8D": 100, "8E": 97 },
    67: { "8A": 90, "8B": 85, "8C": 88, "8D": 93, "8E": 89 },
    69: { "8A": 60, "8B": 64, "8C": 59, "8D": 66, "8E": 61 },
    75: { "8A": 65, "8B": 48, "8C": 32, "8D": 58, "8E": 56 }
  };

  // Deterministic, believable percent-missed for unflagged questions.
  function baseMissed(q, sIdx) {
    var v = 14 + ((q * 37 + sIdx * 13) % 31) + ((q * 7) % 9); // ~14–53%
    return Math.min(v, 55);
  }

  function missedFor(q) {
    var out = {};
    sections.forEach(function (s, i) {
      out[s.id] = missedOverrides[q] ? missedOverrides[q][s.id] : baseMissed(q, i);
    });
    return out;
  }

  // Build the full 75-question grid (used by the heat map and snapshot).
  var allQuestions = [];
  for (var q = 1; q <= 75; q++) {
    var m = missedFor(q);
    var vals = sections.map(function (s) { return m[s.id]; });
    var combined = Math.round(vals.reduce(function (a, b) { return a + b; }, 0) / vals.length);
    allQuestions.push({
      number: q,
      group: groupForQuestion(q),
      missedBySection: m,
      minMissed: Math.min.apply(null, vals),
      maxMissed: Math.max.apply(null, vals),
      combinedMissed: combined
    });
  }

  // ----- Flagged questions (full review content) -----
  // flag values must match ED.analysis.FLAGS labels.
  var flagged = [
    {
      number: 3,
      flag: "Accept Multiple Answers",
      secondaryFlags: ["Revise for Next Year"],
      confidence: "High",
      classesAffected: ["8A", "8B", "8C", "8D", "8E"],
      keyedAnswer: "B", mostChosen: "A", badge: null,
      pattern: "Most students followed the line citation in the question to a different answer than the key.",
      question: "The most probable cause of Batten’s death, as suggested in lines 30–33, was —",
      options: [
        { letter: "A", text: "jungle leeches", state: "chose", pill: "MOST CHOSE" },
        { letter: "B", text: "the strange orchid", state: "correct", pill: "ANSWER KEY" },
        { letter: "C", text: "fainting then drowning in the swamp" },
        { letter: "D", text: "contracting malaria in the jungle" }
      ],
      problem: "The question points students at lines 30–33 — and those lines literally say <b>“every drop of blood had been drained out of him by jungle leeches.”</b> The keyed answer (the orchid) only works if you re-read the whole story: the orchid was crushed under Batten’s body, and the ending reveals it drains blood exactly the way the “leeches” supposedly did. It’s a strong irony question undermined by its own line citation. Students who obeyed the citation picked A — they did exactly what we teach them to do.",
      immediate: "<b class=\"act\">Accept both A and B as correct.</b> The cited lines fully support A; the whole-story inference supports B. Both readings are earned.",
      rewrite: {
        stem: "Considering the entire story, the most probable cause of Batten’s death was —",
        options: [
          { letter: "A", text: "jungle leeches" },
          { letter: "B", text: "the strange orchid", correct: true },
          { letter: "C", text: "fainting then drowning in the swamp" },
          { letter: "D", text: "contracting malaria in the jungle" }
        ],
        note: "Dropping the line reference forces the whole-story irony read, which is what the question was always trying to test."
      },
      advanced: "Answer share for A ranged 58–71% across sections. Item-total correlation on the keyed answer is weakly negative in three of five sections, consistent with stronger readers following the citation to A."
    },
    {
      number: 29,
      flag: "Accept Multiple Answers",
      secondaryFlags: ["Revise for Next Year"],
      confidence: "High",
      classesAffected: ["8A", "8B", "8C", "8D", "8E"],
      keyedAnswer: "C", mostChosen: "A", badge: null,
      pattern: "Two answer choices are both defensible readings of the turning point.",
      question: "The quotation that indicates the turning point for Christy is —",
      options: [
        { letter: "A", text: "“It works!” I managed to exclaim…", state: "chose", pill: "MOST CHOSE" },
        { letter: "B", text: "“There was no sweating or shaking this time…”" },
        { letter: "C", text: "“I had a feeling of pure joy while I painted…”", state: "correct", pill: "ANSWER KEY" },
        { letter: "D", text: "“…thinking it would give me less time to become unhappy”" }
      ],
      problem: "Two entirely defensible answers. <b>“It works!” is the moment Christy’s life changes</b> — the discovery the story explicitly frames as finding “a new way to communicate with the outside world.” The keyed answer (pure joy) describes the emotional payoff <i>after</i> the change. The answer pattern across sections suggests it was often the more careful readers who chose A.",
      immediate: "<b class=\"act\">Accept both A and C as correct.</b> This stops the question from penalizing the exact close reading we want.",
      rewrite: {
        stem: "Which quotation marks the moment Christy’s life begins to change?",
        options: [
          { letter: "A", text: "“It works!” I managed to exclaim…", correct: true },
          { letter: "B", text: "“There was no sweating or shaking this time…”" },
          { letter: "C", text: "“I had a feeling of pure joy while I painted…”" },
          { letter: "D", text: "“…thinking it would give me less time to become unhappy”" }
        ],
        note: "Naming which turning point we mean (the moment of change, not the emotional result) makes one answer cleanly correct."
      },
      advanced: "Item discrimination on the keyed answer is negative in three of five sections (worst: −0.63 in 8A, the lowest value on the exam). A negative value means students who did well overall tended to miss this item — a question-design signal, not a student signal."
    },
    {
      number: 33,
      flag: "Possible Key Error",
      secondaryFlags: ["Immediate Action"],
      confidence: "High",
      classesAffected: ["8A", "8B", "8C", "8D", "8E"],
      keyedAnswer: "B", mostChosen: "C", correctAnswer: "C",
      badge: "MARKING ERROR IN GRADEBOOK",
      pattern: "Nearly every student chose the same non-keyed answer, and two sections were scored with a different key.",
      question: "What is the main idea of the poem?",
      options: [
        { letter: "A", text: "Young people today are uninterested in political or social change" },
        { letter: "B", text: "Each generation naturally rebels against the previous one", state: "chose", pill: "KEYED ANSWER" },
        { letter: "C", text: "The older generation has forgotten the values they once fought for, and now silences the younger generation", state: "correct", pill: "CORRECT  ·  MOST CHOSE" },
        { letter: "D", text: "People should always listen to authority because they have more experience" }
      ],
      problem: "<b>The answer key appears to be wrong.</b> The poem’s argument is exactly option C: the elders paraded for “Flower Power,” now tell the young “Shush… You’re not old enough,” and have “forgotten who they once were, what they once fought for.” The poem is not about rebellion — it’s about elders forgetting their own values and silencing kids who share them. <b>86–95% of students chose C in every section. They were right.</b> Worse: 8C and 8E appear to have been scored with D as the key, the other three sections with B — both wrong, so essentially nobody got credit anywhere.",
      immediate: "<b class=\"act\">Change the key to C and rescore all five sections.</b> Roughly 115 of 129 students gain a mark. The question itself is fine — once the key is fixed, this becomes one of the easiest items on the exam, which matches how clearly the poem states its idea.",
      nextYearNote: "Keep the question exactly as written. Just correct the key document — and see the Takeaway about auditing how the key was built.",
      advanced: "Detected keyed answers differ across uploaded files: 8A/8B/8D show B, 8C/8E show D, and the uploaded answer-key document shows B. Answer share for C: 86–95% in every section."
    },
    {
      number: 36,
      flag: "Possible Key Error",
      secondaryFlags: ["Immediate Action"],
      confidence: "High",
      classesAffected: ["8A", "8B", "8D"],
      keyedAnswer: "D", mostChosen: "C", correctAnswer: "C",
      badge: "MARKING ERROR IN GRADEBOOK",
      pattern: "Zero students in any section chose the keyed answer.",
      question: "What is the overall tone of the article?",
      options: [
        { letter: "A", text: "sarcastic and dismissive" },
        { letter: "B", text: "serious and argumentative" },
        { letter: "C", text: "curious and slightly humorous", state: "correct", pill: "CORRECT  ·  MOST CHOSE" },
        { letter: "D", text: "angry and critical", state: "chose", pill: "KEYED ANSWER" }
      ],
      problem: "<b>Key error — and a clean one: zero of 129 students chose the keyed answer.</b> The article calls the fish “fish weirdos” and “freaky cousins” living in a pool “the size of a kitchen table.” That’s C, curious and slightly humorous, which 50–70% of every class picked. Nothing in the article is angry. <b>Marking note:</b> 8C and 8E were already scored with C and are fine; 8A, 8B, and 8D were scored with D and need the rescore.",
      immediate: "<b class=\"act\">Rescore 8A, 8B, and 8D with C in your gradebook.</b> 8C and 8E already have it right. Don’t accept B — “serious” is a defensible misread but “argumentative” isn’t, so the B-pickers earned the miss.",
      nextYearNote: "Keep the question as written with the corrected key. Once rescored, this is a normal, functional tone item (roughly 35% missed).",
      advanced: "Keyed answer D received 0% of responses in all five sections. Detected keys differ across files: 8A/8B/8D show D, 8C/8E show C. Once rescored with C, projected percent missed is ~30–40% per section."
    },
    {
      number: 42,
      flag: "Hard but Fair",
      secondaryFlags: ["Revise for Next Year"],
      confidence: "Medium",
      classesAffected: ["8C", "8D"],
      keyedAnswer: "B", mostChosen: "A", badge: null,
      pattern: "A look-alike wrong answer pulled about half of each class, but the key is defensible.",
      question: "Researchers intend to solve the mystery of the structure by —",
      options: [
        { letter: "A", text: "comparing fish which share similar characteristics", state: "chose", pill: "MOST CHOSE" },
        { letter: "B", text: "comparing environmental conditions of similar species", state: "correct", pill: "ANSWER KEY" },
        { letter: "C", text: "closely studying unicorn myths" },
        { letter: "D", text: "studying a sample of a rhinoceros horn" }
      ],
      problem: "The key is right — the article says comparing <b>environmental conditions</b> of the long-horned species could reveal the horn’s purpose. But distractor A differs from the key only in <i>what</i> gets compared, and it describes what the researchers already did earlier in the article to identify the species. Nearly half of every class took the bait. This question may not be separating understanding clearly — careful and careless readers land on each side at close to a coin flip.",
      immediate: "<b>No grading change.</b> B is cleanly supported by the text; A is genuinely wrong. Hard but fair this year.",
      rewrite: {
        stem: "Researchers intend to solve the mystery of the structure by —",
        options: [
          { letter: "A", text: "dissecting the horn of a preserved specimen" },
          { letter: "B", text: "comparing environmental conditions of similar species", correct: true },
          { letter: "C", text: "closely studying unicorn myths" },
          { letter: "D", text: "studying a sample of a rhinoceros horn" }
        ],
        note: "Swapping A for something concrete and wrong keeps the close-reading demand without the look-alike trap."
      },
      advanced: "Item discrimination sits near zero (or slightly negative) in four of five sections — the item barely separates students who did well overall from those who didn’t."
    },
    {
      number: 52,
      flag: "Accept Multiple Answers",
      secondaryFlags: ["Revise for Next Year"],
      confidence: "High",
      classesAffected: ["8A", "8B", "8C", "8D", "8E"],
      keyedAnswer: "B", mostChosen: "A", badge: null,
      pattern: "The real climax is not one of the options; two choices point at the same scene.",
      question: "The climax in this story is when —",
      options: [
        { letter: "A", text: "Charlie takes King to the woods", state: "chose", pill: "MOST CHOSE" },
        { letter: "B", text: "Charlie wraps King around his middle", state: "correct", pill: "ANSWER KEY" },
        { letter: "C", text: "Charlie puts King back in his cage" },
        { letter: "D", text: "Charlie and the narrator sit down to supper" }
      ],
      problem: "<b>The real climax isn’t one of the options.</b> The peak of the story is Charlie firing two shots into the ground to fake the execution — the moment he chooses to deceive his father. Both A (the woods trip containing that moment) and B (concealing the snake afterward) point at the same scene from two angles. 64–89% of every class picked A. When the “wrong” answer is the one stronger readers prefer, the item is broken, not the students.",
      immediate: "<b class=\"act\">Accept both A and B as correct.</b>",
      rewrite: {
        stem: "Which moment is the climax of the story?",
        options: [
          { letter: "A", text: "Charlie’s mother discovers the King in the bedroom" },
          { letter: "B", text: "Charlie fires the rifle into the ground and hides the King in his shirt", correct: true },
          { letter: "C", text: "Charlie puts King back in his cage" },
          { letter: "D", text: "Charlie and the narrator eat supper in silence" }
        ],
        note: "Naming the deception directly gives the question one defensible peak — and the mother’s discovery becomes a strong rising-action distractor."
      },
      advanced: "Item discrimination on the keyed answer is negative in four of five sections (−0.40 to −0.42)."
    },
    {
      number: 56,
      flag: "Drop From Scoring",
      secondaryFlags: ["Immediate Action", "Revise for Next Year"],
      confidence: "High",
      classesAffected: ["8A", "8B", "8C", "8D", "8E"],
      keyedAnswer: "B", mostChosen: "D", badge: "DROP FROM SCORING",
      pattern: "Votes scattered across two non-keyed answers; no option matches the poem’s actual idea.",
      question: "The purpose of the words “You must be the dark snakes of stems…” is —",
      options: [
        { letter: "A", text: "to provide setting" },
        { letter: "B", text: "to create a mood of fear and darkness", state: "chose", pill: "KEYED ANSWER" },
        { letter: "C", text: "to include wildlife in this scene" },
        { letter: "D", text: "to create action as contrast to the peaceful scene", state: "chose", pill: "MOST CHOSE" }
      ],
      problem: "<b>The keyed answer misreads the poem, and the real answer isn’t on the list.</b> The poem is about patient, immersive seeing — “enter in / To the small silences,” “touch the very peace.” The snake line is the poet’s instruction to <i>become</i> the stems. It doesn’t create fear; the poem’s mood is contemplative throughout. The answer pattern actively penalizes the students who understood the poem. Votes scattered across B and D because neither is right.",
      immediate: "<b class=\"act\">Remove this question from scoring entirely.</b> There is no defensible answer to give credit for.",
      rewrite: {
        stem: "The poet uses “You must be the dark snakes of stems” to show that the reader should —",
        options: [
          { letter: "A", text: "be afraid of what hides in the forest" },
          { letter: "B", text: "imagine becoming part of the thing they are observing", correct: true },
          { letter: "C", text: "watch for dangerous wildlife while in nature" },
          { letter: "D", text: "move quickly through the scene to see everything" }
        ],
        note: "Rebuilt from scratch so the correct option states the poem’s actual idea: identification with what you observe."
      },
      advanced: "Item discrimination on the keyed answer is negative in all five sections. Response shares: B 28–41%, D 33–47%, A/C remainder."
    },
    {
      number: 66,
      flag: "Possible Key Error",
      secondaryFlags: ["Immediate Action"],
      confidence: "High",
      classesAffected: ["8A", "8B", "8D"],
      keyedAnswer: "A", mostChosen: "B", correctAnswer: "B",
      badge: "MARKING ERROR IN GRADEBOOK",
      pattern: "The keyed answer is the antonym of the word being defined.",
      question: "What would best define the word “anguished”?",
      options: [
        { letter: "A", text: "calm and peaceful", state: "chose", pill: "KEYED ANSWER" },
        { letter: "B", text: "full of sorrow or severe emotional pain", state: "correct", pill: "CORRECT  ·  MOST CHOSE" },
        { letter: "C", text: "slightly annoyed or frustrated" },
        { letter: "D", text: "confused or uncertain" }
      ],
      problem: "<b>Key error — the key has the antonym.</b> “His cries were anguished, animal-like” as Luke kicks and screams; B is the definition, and 63–96% of every class picked it. Keying “calm and peaceful” for “anguished” suggests a row got shifted or mistyped when the key document was built. <b>Marking note:</b> 8C and 8E were already scored with B; 8A, 8B, and 8D were scored with A and need the rescore.",
      immediate: "<b class=\"act\">Rescore 8A, 8B, and 8D with B in your gradebook.</b> 8C and 8E already have it right.",
      nextYearNote: "Keep the question with the corrected key. With three suspected key errors on this exam (33, 36, 66), verify all 75 entries in the key document against the source before it goes back in the bank.",
      advanced: "Detected keys differ across files: 8A/8B/8D show A, 8C/8E show B. Keyed answer A received under 3% of responses in every section."
    },
    {
      number: 67,
      flag: "Accept Multiple Answers",
      secondaryFlags: ["Revise for Next Year"],
      confidence: "Medium",
      classesAffected: ["8A", "8B", "8C", "8D", "8E"],
      keyedAnswer: "C", mostChosen: "B", badge: null,
      pattern: "The cited line’s context supports the most-chosen answer; the dictionary supports the key.",
      question: "What would best define the word “pantomimed” (line 14)?",
      options: [
        { letter: "A", text: "whispered quietly" },
        { letter: "B", text: "pointed directly", state: "chose", pill: "MOST CHOSE" },
        { letter: "C", text: "acted out", state: "correct", pill: "ANSWER KEY" },
        { letter: "D", text: "stood perfectly still" }
      ],
      problem: "The distractor describes the literal action in the cited line. The text says Luke “pantomimed… He reached up and tried to touch it.” The dictionary answer is C, but the question cites the line — which invites context-clue strategy — and the context shows a kid reaching toward the moon. A Grade 8 student doing exactly what we teach (use the surrounding sentences) lands on B. <b>89% missed it</b> — the item punishes the context-clue skill on a question framed as context-based.",
      immediate: "<b class=\"act\">Accept both B and C as correct.</b> The context legitimately supports the “pointing” reading.",
      rewrite: {
        stem: "What would best define the word “pantomimed” (line 14)?",
        options: [
          { letter: "A", text: "whispered quietly" },
          { letter: "B", text: "shouted with excitement" },
          { letter: "C", text: "acted out with gestures", correct: true },
          { letter: "D", text: "stood perfectly still" }
        ],
        note: "Replacing “pointed directly” with an option not depicted in the scene means context clues now lead to the key instead of away from it."
      },
      advanced: "Item discrimination on the keyed answer is negative in two of five sections."
    },
    {
      number: 69,
      flag: "Hard but Fair",
      secondaryFlags: [],
      confidence: "High",
      classesAffected: ["8A", "8B", "8C", "8D", "8E"],
      keyedAnswer: "A", mostChosen: "C", badge: null,
      pattern: "Many students missed it, but the key is defensible and the choices are clean — likely a real skill gap.",
      question: "The phrase “the moon was a white stone in the sky” is an example of —",
      options: [
        { letter: "A", text: "metaphor", state: "correct", pill: "ANSWER KEY" },
        { letter: "B", text: "personification" },
        { letter: "C", text: "symbolism", state: "chose", pill: "MOST CHOSE" },
        { letter: "D", text: "alliteration" }
      ],
      problem: "About 62% missed this across all sections, but the question is clean: the phrase is a direct comparison without “like” or “as” — a textbook metaphor. Students who chose C are blurring metaphor with symbolism, which is a genuine skill gap, not a question flaw. The answer pattern looks reasonable for a hard item.",
      immediate: "<b>No grading change.</b> The key is defensible and the distractors are fair.",
      nextYearNote: "Keep the question. Plan a focused metaphor-versus-symbol review before next year’s exam — this is a teaching priority, not a test-bank fix.",
      advanced: "Item discrimination is positive in all five sections, which supports keeping the item as written."
    },
    {
      number: 75,
      flag: "Watch List",
      secondaryFlags: ["Revise for Next Year"],
      confidence: "Medium",
      classesAffected: ["8A", "8D"],
      keyedAnswer: "C", mostChosen: "D", badge: null,
      pattern: "Two answer choices describe two halves of the same contrast.",
      question: "The greatest contrast can be found in —",
      options: [
        { letter: "A", text: "alien monsters vs. friendly creatures" },
        { letter: "B", text: "flying a spaceship vs. crashing on a planet" },
        { letter: "C", text: "incredible adventures vs. everyday lunch", state: "correct", pill: "ANSWER KEY" },
        { letter: "D", text: "Calvin’s behaviour vs. his mom’s expectations", state: "chose", pill: "MOST CHOSE" }
      ],
      problem: "Options C and D are two halves of the same fantasy-versus-reality joke — Calvin’s Spiff adventure <i>is</i> the behaviour that collides with Mom’s ordinary-world expectations. Students who picked D made a fair point. The item still functions overall, but the C/D overlap is doing the damage.",
      immediate: "<b>Judgment call:</b> check the panels — if Mom’s expectations are visible in the comic (calling him in, scolding), <b class=\"act\">accept C and D</b>; if the ending is purely the lunch deflation, keep C only.",
      rewrite: {
        stem: "The humor comes mainly from the contrast between —",
        options: [
          { letter: "A", text: "Spiff’s dramatic space adventure and the very ordinary ending", correct: true },
          { letter: "B", text: "the alien monster’s strength and Spiff’s weakness" },
          { letter: "C", text: "the spaceship and the planet’s surface" },
          { letter: "D", text: "the first frame and the last frame" }
        ],
        note: "Testing the contrast itself, instead of offering it twice as separate options, removes the overlap."
      },
      advanced: "Item discrimination stays positive in every section, so the item still functions — the overlap is a design concern, not a scoring emergency."
    },
    {
      number: 14,
      flag: "Watch List",
      secondaryFlags: [],
      confidence: "Medium",
      classesAffected: ["8D"],
      keyedAnswer: "B", mostChosen: "B", badge: null,
      pattern: "One section missed this at more than double the rate of the others — a section-specific pattern, not a question flaw.",
      question: "In the second Orchid passage, the narrator’s attitude toward collecting is best described as —",
      options: [
        { letter: "A", text: "fearful and cautious" },
        { letter: "B", text: "obsessive and admiring", state: "correct", pill: "ANSWER KEY" },
        { letter: "C", text: "bored and dismissive" },
        { letter: "D", text: "angry and resentful" }
      ],
      problem: "Four sections missed this at 24–31%; 8D missed it at 71%. The question and key look fine — when one class diverges this much on an otherwise healthy item, the usual causes are pacing (the passage was covered late), a missed lesson, or a class-specific misunderstanding. This is a conversation for the 8D teacher, not a test-bank fix.",
      immediate: "<b>No grading change.</b> Worth a quick check with the 8D teacher on when this passage type was covered.",
      nextYearNote: "Keep the question. If 8D’s pacing was the cause, no change is needed at all.",
      advanced: "Percent missed by section: 8A 26%, 8B 31%, 8C 24%, 8D 71%, 8E 29%."
    }
  ];

  // Sort flagged review content by question number for the grouped sections.
  flagged.sort(function (a, b) { return a.number - b.number; });

  // ----- Key audit findings -----
  var keyAudit = {
    mismatchQuestions: [33, 36, 66],
    summary: "Possible answer-key mismatch detected. Sections 8C and 8E appear to have been scored using a different key than 8A, 8B, and 8D for Questions 33, 36, and 66. Class marks may not be comparable until rescoring is complete.",
    findings: [
      { q: 33, type: "Different keys across sections + both keys suspect", detail: "8A/8B/8D scored with B, 8C/8E with D. Student responses and the poem both support C. Rescore all five sections with C." },
      { q: 36, type: "Different keys across sections", detail: "8C/8E scored with C (correct). 8A/8B/8D scored with D — zero students chose D anywhere. Rescore 8A, 8B, 8D with C." },
      { q: 66, type: "Different keys across sections — antonym keyed", detail: "8C/8E scored with B (correct). 8A/8B/8D scored with A, the antonym of the word being defined. Rescore 8A, 8B, 8D with B." }
    ],
    rowShiftNote: "Three wrong letters in one document is the classic signature of a copy or row-shift error. Verify all 75 entries in the key document against the source before the exam goes back in the bank."
  };

  // ----- Takeaway items -----
  var takeaway = [
    { lead: "The Exam is Dependable:", text: "Reliability is solid in every section and five different classes produced the same pattern (class means 66–71%). The damage on this list traces back to three answer-key typos and a few look-alike answer pairs — not to the students misunderstanding the readings." },
    { lead: "Audit the Answer Key Document:", text: "Three of 75 keyed letters appear wrong (33, 36, 66), and two sections were scored with a different key than the other three on those questions — so marks aren’t comparable between classes until the rescores land. Verify the full key against the source before it goes back in the bank." },
    { lead: "Plot Terms are the Soft Spot:", text: "Climax (Q52) and turning point (Q29) both pulled careful readers to the unkeyed answer — an item-design problem — while metaphor vs. symbol (Q69, 62% missed on a clean question) is a genuine skill gap worth a focused review next year. Vocabulary-in-context held up everywhere except where a distractor described the cited scene (Q67)." },
    { lead: "Next Steps:", text: "Rescore 33 (all sections), 36 and 66 (8A, 8B, 8D only), apply the double-answer adjustments for 3, 29, 52, and 67, drop 56 from scoring, and save the rewrites for next year’s exam bank. Students in 8A, 8B, and 8D gain up to 3 marks from the key fixes alone, with up to 4 more from the accepted-answer adjustments." }
  ];

  // ----- The assembled demo analysis -----
  ED.demo = {
    analysis: {
      id: "demo-ela8-final-2026",
      examName: "Grade 8 ELA Final Exam",
      examTitle: "Grade 8 ELA Final: Questions We Need to Fix",
      examType: "Reading Comprehension Exam",
      subject: "ELA",
      grade: "8",
      dateCreated: "2026-06-08",
      reviewedLabel: "June 2026",
      totalQuestions: 75,
      totalResponses: 129,
      combinedAverage: 68,
      combinedMedian: 69,
      sections: sections,
      groups: groups,
      allQuestions: allQuestions,
      flagged: flagged,
      keyAudit: keyAudit,
      takeaway: takeaway,
      openingSummary: "When we look at the results combined across all five class datasets, these questions stood out because a large number of students missed them. If the same question breaks across multiple classes, the issue is usually the question design, the answer choices, or the key — not the students’ comprehension. Below is a plain-English breakdown of what went wrong and how to handle it.",
      departmentPattern: {
        widespread: [3, 29, 33, 36, 52, 56, 66, 67, 69],
        sectionSpecific: [14, 75],
        note: "Almost every flagged question broke the same way in all five classes, which points at question design and the key document rather than any one classroom. Two items (Q14, Q75) show section-specific patterns worth a quick, no-blame conversation at the next department meeting."
      }
    },
    // Dashboard summary numbers derived from the analysis
    dashboard: {
      analyses: 1,
      examsReviewed: 1,
      questionsFlagged: flagged.length,
      possibleKeyErrors: keyAudit.mismatchQuestions.length,
      classesCompared: sections.length,
      reportsGenerated: 3
    }
  };
})();
