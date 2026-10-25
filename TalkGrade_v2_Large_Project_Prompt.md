# MASTER PROMPT v2: TalkGrade Studio, the voice-first grading workspace for teaching teams

## 0. How to use this prompt

Give the AI coding assistant **three things**: this file, `TalkGrade_Build_Prompt.md` (the v1 spec) and `talkgrade.zip` (the working v1 repository, 25 passing tests). v1 is the **baseline**. This prompt **extends** it into a large product.

Non-negotiable baseline rules:

1. Do not break v1. The 25 existing tests must keep passing at every stage. The v1 sample flow (six students, three consistency flags: Chirag too lenient on Testing, Correctness drift, "test" penalty variance) must keep working unchanged.
2. Keep v1's `public/lib/*` modules and their public function signatures. Extend them only in backwards-compatible ways.
3. **Zero runtime dependencies** remains true. Node 22 built-ins only on the server (`node:http`, `node:fs`, `node:path`, `node:crypto`, `node:zlib`, `node:sqlite`, `node:test`, `node:assert`). Vanilla JS in the browser. No bundler, no CDN, no web fonts, no external requests. Playwright and axe-core may be used only as dev tools in verification, never imported by the product.
4. Never use `innerHTML` with data-derived text. All DOM from `createElement`/`textContent`.
5. Every new pure-logic module in `public/lib/` is UMD (browser global `TG_*` and Node `module.exports`) so it is unit-testable in Node. New UI code lives in `public/app/` as ES modules (`<script type="module">`) and reads the UMD globals.
6. Accessibility target: WCAG 2.2 AA, axe-core zero violations on every view, every state.
7. If something is ambiguous, pick the simplest behaviour that meets the acceptance criteria and record the decision in `docs/DECISIONS.md`.

---

## 1. The extended product idea

**TalkGrade Studio** is a workspace where a teaching team grades programming work by talking. A grader reads a submission and dictates thoughts with Wispr Flow (voice typing in any focused field). The product turns that speech into rubric scores, line-anchored comments and student-ready feedback, **audits the grader and the whole team for unfair or drifting marking**, and gives the instructor class-level insight into what students got wrong.

**Principles**
- *Voice in, accountability out.* Speech is the input. Consistency, calibration and evidence are the value.
- *Anyone can bring their own rubric.* Rubrics can be uploaded in the formats teachers already have (spreadsheet, Word, CSV, Markdown, plain text, PDF) without an account.
- *Works for a judge in 30 seconds.* No sign-in, bundled demo course, offline-capable. Team features are optional.
- *The grader stays in control.* Every AI/rule suggestion is reviewable and undoable; every change is in an audit trail.

**Users:** TAs, instructors, graders on a teaching team, plus students (read-only feedback link).

**Modes**
- **Guest/local mode (default):** everything runs in the browser, data in IndexedDB, rules engine offline, optional AI through the server. Works on static hosting.
- **Team mode (optional, `TEAM_MODE=1`):** accounts, shared courses, multiple graders, SQLite storage, student feedback links.

---

## 2. Feature catalogue (all required)

Each feature lists acceptance criteria (AC). Numbering is used by tests and docs.

**F1 Courses and assignments.** Course -> assignments -> submissions. Create/rename/archive/delete (with confirm). Each assignment has: title, due date (optional), rubric reference (snapshot, see F2), optional starter code (used by F9), submissions, settings overrides. AC: switch assignments without losing state; deleting an assignment deletes its submissions; all state survives reload.

**F2 Rubric Studio + Rubric Library.** A full editor (not just JSON): add/remove/reorder criteria (drag and keyboard), edit id (auto-slug), name, max, description, keywords (chip input), fact link (none / has tests / has comments / no nested loops), see live total and validation messages. Library lists saved rubrics (built-in templates + user rubrics) with search, duplicate, export, delete. Assigning a rubric to an assignment stores a **snapshot**; editing the library copy later never silently changes graded work (offer "update this assignment" with a confirmation that clears scores, same as v1). Built-in templates: Python function (20), Data structures (30), SQL queries (20), Lab report/code review (25), Web page (HTML/CSS) (20). AC: invalid rubrics cannot be saved; every error is shown next to the field.

**F3 Rubric upload and import (see section 5, the centerpiece).** Drag-and-drop, file picker, paste, or voice-described rubric, with a preview/fix step before saving. AC in section 5.

**F4 Submission intake.** Import single files, multiple files, a `.zip` (one file per student, or one folder per student with several files), a folder via drag (`webkitdirectory`), or JSON `[{name, code}]`. Multi-file submissions get a file tabs strip in the code viewer. Student display names editable; optional student id column. Limits: 500 submissions per assignment, 200 KB per file, 2 MB per submission, 50 MB per zip, zip-bomb guards (section 6.9). Binary files are skipped with a message. AC: a skipped-file report is shown after import.

**F5 Grading workspace (v1 core, upgraded).** Keep v1 behaviour (spoken notes, Ctrl+Enter scoring, editable scores, voice command box, editable feedback, tone). Add:
- **Line-anchored comments (F5a):** spoken or typed `line 12`, `lines 3 to 5`, `on line twelve`, `L12` inside notes are detected (section 6.1) and become comments attached to those lines. Clicking a gutter line number adds a manual comment. Comment markers show in the gutter (icon + count, not colour only); activating a marker opens a popover/side list. Each score's "Why" shows linked line chips that scroll and highlight the lines.
- **Evidence highlighting (F5b):** hovering/focusing a score row highlights the cited lines.
- **Multi-file viewer** with tab per file and per-file comments.
- **Keyboard navigation:** next/previous ungraded (`Alt+Down`/`Alt+Up`), next/previous student (`Alt+Right`/`Alt+Left`), focus notes (`N`), focus command box (`/`), open command palette (`Ctrl+K`), undo (`Ctrl+Z`), redo (`Ctrl+Shift+Z`).

**F6 Consistency checker (v1) with team-aware extensions.** Keep the six v1 checks and constants. Add: thresholds editable per assignment in Settings (tolerance, drift tolerance, min peers; bounded and validated); a **"why this was flagged"** disclosure per flag showing the numbers; a **flag history** (applied/dismissed with timestamps, in the audit trail); **bulk actions** ("apply all suggestions of this kind" with a confirmation listing what changes).

**F7 Calibration and inter-grader agreement.** Two or more graders score the same submissions (the calibration set). Report per criterion and per grader pair: n, bias (mean A-B, signed), mean absolute difference, exact agreement %, within-0.5-point agreement %, quadratic-weighted kappa with a plain-language label. List disagreements sorted by size with a **Resolve** action (pick A, pick B, enter a value; recorded in the audit trail). **Works without accounts:** a grader exports "my gradings" as JSON and a colleague imports it as a named grader (section 6.4). In team mode the graders are real users. AC: algorithms match section 6.4 on the provided fixtures.

**F8 Class insights ("what did students get wrong?").** Aggregates deduction tags across the graded batch (section 6.5): per-criterion loss rates, top recurring issues with counts and percentages, average points lost per issue, and a one-click **Misconception digest** (Markdown) for the next lecture. With an API key, an optional "Polish with AI" rewrite; the offline version is complete on its own.

**F9 Similarity check.** Detect copied or near-duplicate submissions (section 6.2): language-agnostic token fingerprints with winnowing, containment and Jaccard scores, instructor starter code excluded, side-by-side view highlighting matched line ranges, configurable threshold, "mark as reviewed/not a concern" per pair. Clear wording: *"similar code needs a human look, it is not proof of copying."*

**F10 Grader dashboard.** For the current grader: score histogram per criterion and total (SVG charts with an accessible data table alternative), grading-order trend with a 5-point moving average, time per submission (median, slowest, active time only; section 6.6), **fatigue signals** (late-session scores shifting, notes getting shorter), and progress. All computed locally.

**F11 Feedback quality check.** Rule-based score 0-100 with itemised, fixable findings before export (section 6.7). Export screen blocks nothing but warns, and offers "fix all easy ones" (removes arithmetic words, trims shouting).

**F12 Audit trail, undo and redo.** Append-only event log per submission (notes edited, analysed, score edited, suggestion applied, flag dismissed, rubric changed, comment added/removed, grader resolved a disagreement). Undo/redo for score edits and comment add/remove (50-step stack per submission, memory only). The Activity drawer lists events with time, actor, and before -> after. AC: events never store full code (only ids/lengths).

**F13 Export and sharing.**
- Per-student feedback files (`.md` and `.txt`) bundled as a **`.zip`** built by the product's own zip writer (section 6.9).
- Gradebook CSV with selectable columns (student id, name, per-criterion, total, percent, feedback) and presets: *Generic*, and *Identifier / Full name / Grade / Maximum grade / Feedback comments* (label it "Moodle-style, check against your LMS before uploading").
- Full backup/restore (`.json`) of a course, and rubric export (JSON, CSV, Markdown).
- A printable per-student report view (`@media print` stylesheet, one student per page).
- Formula-injection-safe CSV (v1 rule) everywhere.

**F14 Feedback translation (AI engine only).** Translate feedback into Hindi, Hinglish, Bengali, Tamil, Telugu, Marathi or Kannada, preserving scores and code identifiers. Offline: the control is visibly disabled with an explanation. Show the original beside the translation and require the grader to confirm before it replaces the draft.

**F15 Command palette and extended voice commands.** `Ctrl+K` palette (single text input, Wispr-friendly) with fuzzy search over commands and students ("open Bhavna", "go to insights", "export csv"). Extend `commands.js` (backwards compatible) with: `comment on line N: text`, `undo`, `redo`, `open <student>`, `go to <view>`, `export csv`, `export zip`, `show similarity`, `next ungraded`. Optional **hands-free dictation fallback** using the browser Web Speech API when available and the user enables it (feature-detected, off by default, clearly labelled as browser speech recognition, not Wispr Flow).

**F16 Privacy controls.** Settings: *Anonymise before sending to AI* (default ON: replace student names with S1, S2... in prompts and restore after), *Send code to AI* (default ON; if OFF only the notes are sent), *Strip emails/ids from code before sending*. A visible **Data flow** panel states exactly what leaves the device for each engine. **Wipe all data** button.

**F17 Team mode (optional).** Accounts (email + password), roles (owner, grader, viewer) per course, shared assignments, per-grader scores keyed by grader id (feeds F7), activity attribution, and **student feedback links**: a random 128-bit token URL `/s/<token>` shows only that student's score and feedback, revocable and expiring. Guests never need it.

**F18 Onboarding and demo.** First run offers the bundled demo course (v1 six-student batch inside a course/assignment, plus a second demo assignment for rubric-import practice), a 5-step interactive tour that is skippable and keyboard accessible, and sample rubric files downloadable from the import dialog.

---

## 3. Architecture and repository layout

```
talkgrade/
├── server.js                       entry (kept; delegates to server/)
├── package.json                    scripts: start, test, test:unit, test:e2e (documented, optional)
├── docs/                           ARCHITECTURE.md, DECISIONS.md, RUBRIC_FORMATS.md, DATA_FLOW.md, API.md
├── server/
│   ├── app.js                      createServer({env,fetchImpl,db})  (v1 behaviour preserved)
│   ├── router.js                   tiny router, JSON helpers, body limits, error mapping
│   ├── security.js                 headers/CSP, rate limiter, CSRF, cookie helpers
│   ├── routes/ analyze.js translate.js digest.js rubric-extract.js health.js auth.js courses.js grades.js student-links.js
│   ├── services/ engine.js llm.js anonymise.js
│   └── team/ db.js (node:sqlite) migrations.js auth.js permissions.js
├── src/                            (v1 engine.js, llm.js kept as thin re-exports for compatibility)
├── public/
│   ├── index.html                  app shell (single page, hash routing)
│   ├── student.html                student feedback page (team mode)
│   ├── styles/ tokens.css base.css components.css views.css print.css
│   ├── app/                        ES modules
│   │   ├── main.js router.js store.js events.js a11y.js icons.js
│   │   ├── storage/ index.js indexeddb.js server-store.js contract.js
│   │   ├── components/ button dialog drawer tabs chip-input table toast tooltip popover command-palette code-viewer score-table flag-card chart-bars chart-line empty-state progress
│   │   └── views/ home course assignment rubric-studio rubric-import grade insights similarity calibration dashboard activity settings export onboarding
│   ├── lib/                        UMD pure logic
│   │   ├── (v1) rubric facts heuristic consistency commands export
│   │   ├── rubric-import.js  rubric-text.js  rubric-spoken.js  keywords.js  rubric-export.js
│   │   ├── zip.js  xml-lite.js  csv.js
│   │   ├── linerefs.js  similarity.js  tokenizer.js  calibration.js  insights.js
│   │   ├── feedback-quality.js  dashboard-stats.js  audit.js  undo.js
│   │   └── anonymise.js  settings.js  ids.js
│   └── data/ sample.js templates.js (built-in rubric templates) demo-course.js
└── tests/
    ├── unit/ *.test.js             one file per lib module
    ├── contract/ store.contract.test.js   same suite run against IndexedDB-fake and SQLite stores
    ├── server/ *.test.js
    ├── fixtures/rubrics/ ...       (section 10)
    └── e2e/ run-e2e.mjs            optional Playwright script, skipped when Playwright is absent
```

Routing: hash routes `#/`, `#/c/:course`, `#/c/:course/a/:assignment`, `.../grade/:student`, `.../insights`, `.../similarity`, `.../calibration`, `.../dashboard`, `.../activity`, `#/rubrics`, `#/rubrics/import`, `#/settings`. Focus moves to the view's `h1` on navigation, and the title region announces the new view.

State: a small observable store (`subscribe`, `select`, `dispatch`) with immutable updates, persisted through the `Store` interface (section 4.3). No global mutable singletons outside it.

---

## 4. Data model

### 4.1 Types

```
Course      { id, name, createdAt, archived }
Assignment  { id, courseId, title, dueAt|null, rubric: Rubric (snapshot), rubricSourceId|null,
              starterCode: string, settings: Settings, createdAt }
Submission  { id, assignmentId, name, studentId|"", files: [{path, text}], notes, comments: Comment[],
              gradings: { [graderId]: Grading }, similarityReviewed: string[], createdAt }
Grading     { scores: {[criterionId]: Score}, feedback, engine, translatedFeedback?: {lang,text},
              openedAt, scoredAt, activeMs, notesWords }
Score       { score, reason, sentiment, tags[], inferred, manual?, lines?: [[from,to]] }
Comment     { id, file, from, to, text, source: "spoken"|"manual", graderId }
Settings    { tone, consistency:{tolerance,driftTolerance,minPeers}, similarity:{threshold,minFingerprints},
              privacy:{anonymise:true, sendCode:true, stripIdentifiers:true}, ai:{enabled} }
AuditEvent  { id, ts, graderId, submissionId|null, type, summary, before?, after? }   // never full code
RubricLib   { id, title, criteria[], source: "builtin"|"user"|"import", createdAt }
```
The v1 `students[]` shape maps to `Submission` with one file and `gradings.me`. Provide a migration that converts v1 `localStorage` state (`talkgrade-state-v1`) into a "My course / Imported assignment" on first run, then keeps the old key untouched as a backup.

### 4.2 IDs
`ids.js`: `newId(prefix)` = prefix + 12 random base36 chars from `crypto.getRandomValues`. Slug helper for criterion ids (`"Edge Cases!" -> "edge-cases"`, unique-suffixed).

### 4.3 Storage interface (`Store`)
Async methods: `getAll(kind)`, `get(kind,id)`, `put(kind,obj)`, `putMany(kind,objs)`, `delete(kind,id)`, `query(kind,{index,value})`, `transaction(fn)`, `exportAll()`, `importAll(dump,{merge})`, `wipe()`, plus `onChange(cb)`. Two implementations: `IndexedDBStore` (default; object stores per kind with indexes on `courseId`, `assignmentId`) and `ServerStore` (team mode, HTTP). A shared **contract test suite** runs against both (IndexedDB runs against an in-memory fake implementing the same API in tests). If IndexedDB is unavailable, fall back to a memory store and show a persistent banner "Changes will not be saved".

### 4.4 SQLite schema (team mode, `node:sqlite` `DatabaseSync`, migrations table, WAL mode, foreign keys ON)

`users(id, email UNIQUE, name, pass_hash, created_at)`, `sessions(id, user_id, token_hash, expires_at, created_at)`, `courses(id, name, owner_id, created_at, archived)`, `memberships(course_id, user_id, role CHECK in ('owner','grader','viewer'), PRIMARY KEY(course_id,user_id))`, `assignments(id, course_id, title, due_at, rubric_json, starter_code, settings_json, created_at)`, `submissions(id, assignment_id, name, student_id, files_json, created_at)`, `gradings(submission_id, grader_id, scores_json, feedback, engine, updated_at, PRIMARY KEY(submission_id,grader_id))`, `comments(id, submission_id, grader_id, file, line_from, line_to, text, source, created_at)`, `audit(id, ts, user_id, submission_id, type, summary, before_json, after_json)`, `student_links(token_hash PRIMARY KEY, submission_id, grader_id, expires_at, revoked)`, `rubric_library(id, owner_id, title, rubric_json, created_at)`. Index every foreign key. Passwords: `crypto.scrypt` with per-user 16-byte salt, N=2^15 (store params in the hash string), constant-time compare. Session cookie: 256-bit random token, store only its SHA-256 hash, `HttpOnly; SameSite=Lax; Path=/; Max-Age=30 days` (+`Secure` when the request is HTTPS or `COOKIE_SECURE=1`). Mutations require header `x-tg-csrf: 1` and `content-type: application/json`.

---

## 5. Rubric upload and import (centerpiece, specify and build with extra care)

### 5.1 UX
A dialog/view `#/rubrics/import` reachable from Rubric Library, Assignment setup and the welcome screen. **No account required.**
1. **Source step:** a large drop zone (also click-to-browse and `Ctrl+V` paste of files or text), a textarea "Paste or describe your rubric", a **"Describe it by voice"** hint (click the box and dictate with Wispr Flow), and links to **download templates** (CSV, JSON, Markdown, Excel-style CSV).
2. **Reading step:** shows file name, size, detected format and a progress/status message.
3. **Preview and fix step (never skip it):** an editable table of detected criteria (name, points, description, keywords as chips, suggested fact link), a **confidence indicator per row** (high / check this) with text, and a list of **warnings** (e.g. "Row 4: could not find points, defaulted to 5", "Two rows named Testing, merged", "Total is 47, expected 50"). Controls: **scale total to** (e.g. 20/50/100 with rounding to 0.5 and remainder fixed on the largest criterion), add/remove/reorder row, **auto-generate keywords** (button), accept/reject suggested facts, rubric title field.
4. **Save step:** save to Library and/or assign to the current assignment; announce the result; offer "Export what I just saved".
All steps are keyboard operable, status changes are announced through the live region, and an error never discards the user's input (the source text stays editable).

### 5.2 Supported formats and detection (`rubric-import.js`)
API: `parseRubricSource({ name, mime, text?, bytes?, inflate? })` -> `Promise<{ ok, format, rubric: RubricDraft, warnings: Warning[], needsAI: boolean, message }>`. `RubricDraft` is a v1 rubric whose criteria additionally carry `confidence: "high"|"check"` and `suggestedFact`. The result is always passed through `validateRubric` before saving; the draft may be invalid while editing in the preview.

Detection order (extension first, then content sniffing): `.xlsx`, `.docx` (ZIP with `xl/workbook.xml` / `word/document.xml`), `.pdf` (`%PDF-` magic) and images (png/jpg/webp magic) -> binary path; `.json` or text starting with `{`/`[` -> JSON; `.csv`/`.tsv`, or text whose first 5 lines have a consistent delimiter count -> delimited; text with pipe-table lines (`| a | b |` plus a `---` separator row) -> Markdown table; otherwise -> loose text list. Decode text as UTF-8, strip a BOM, normalise `\r\n`.

**JSON.** Accept the native v1 shape and tolerant variants: root array of criteria; root `{ title|name, criteria|rubric|items|rows }`; criterion keys matched case-insensitively with synonyms: name = `name|criterion|criteria|title|category|item|label`; max = `max|points|pts|marks|score|maxScore|weight|value`; description = `description|desc|details|expectations|descriptor|text`; keywords = `keywords|tags|terms`; fact = `fact`. Levels arrays (`levels|ratings|performance`) with `points` take the largest points as max and join level descriptions into the description. Numeric strings are coerced; a `weight` that sums to 1 or 100 is flagged "weights, scaled to total" and rescaled to a default total of 20 (user can change in preview).

**CSV/TSV.** RFC-4180 parser in `csv.js` (quotes, escaped quotes, embedded newlines, CRLF, BOM); delimiter auto-detect among `, ; \t |` by consistency across the first 10 rows (semicolon exports from European Excel must work). Header row detection: a row whose cells match header synonyms (criterion/name/category/item, points/max/marks/weight/score, description/details/expectations/descriptor, keywords). **Header-less** files: first column text, first numeric column points. **Grid rubrics** (Canvas/Blackboard style: one row per criterion and columns for performance levels like `Excellent (5)`, `Good (3)`, `Poor (0)`, optionally a trailing total/points column): detect level columns from headers containing a parenthesised or trailing number or from a numeric last column; max = largest level points (or the points column); description = level texts joined as `Excellent: ...; Good: ...`. Skip fully empty rows and total rows (`Total`, `Sum`, `Grand total`, `Maximum`), but record the stated total to cross-check.

**Markdown/plain-text rubrics** (`rubric-text.js`). Pipe tables are parsed like CSV. Otherwise each non-empty line (including list bullets `-`, `*`, `1.`, `1)`, headings `#`) is tested against these patterns, first match wins:
1. `Name (5 pts|points|marks|pt|m)[:\-–—] description`
2. `Name - 5 points: description` / `Name: 5 marks` / `Name = 5`
3. `[5] Name ...` / `5 pts Name ...` / `5 marks - Name`
4. `Name ... 5` where `5` is the final standalone number on the line (confidence "check")
Number words (`five`, `half`, `2.5`, `ten`) are accepted. Indented continuation lines (more indent than the item, or following an item without a new number) are appended to the previous description. Lines such as `Total: 20`, `Total marks`, titles and instructions are not criteria: a title is the first heading or first non-criterion line; `Total` lines feed the cross-check. Description text beginning with `Keywords:` or `Tags:` populates keywords.

**Spoken/free-text descriptions** (`rubric-spoken.js`). For text that has no per-line structure (a dictated paragraph), `parseSpokenRubric(text)` splits on `,` `;` `.` and the word `and`, then in each segment extracts a number (digits or words, `half`) and the remaining words as the name, understanding `X is worth N`, `N points for X`, `X N`, `X (N)`, `N marks on X`. Example: "Correctness is worth five points, efficiency four, readability four, comments two and testing five" -> 5 criteria, total 20. All such rows get confidence "check".

**DOCX.** Use `zip.js` to read `word/document.xml` (and nothing else is trusted). `xml-lite.js` is a small tolerant tokenizer (no DTD, no entities beyond the five XML ones plus numeric references, never fetches anything). Extract paragraphs (`w:p`) with runs (`w:t`, `w:tab` -> tab, `w:br` -> newline) and tables (`w:tbl` -> rows -> cells -> text). Tables become delimited rows (feed the CSV/grid logic); paragraphs feed the text logic. If both exist prefer the table that yields the most criteria.

**XLSX.** Read `xl/workbook.xml` (sheet names, take the first visible sheet or the sheet named like `rubric`), `xl/_rels/workbook.xml.rels`, `xl/sharedStrings.xml` and the sheet XML. Support shared strings, inline strings, numbers, booleans, cell references to place values in the correct column (`A1`-style), skipped empty cells, merged cells ignored (value stays in its top-left cell). Ignore formulas but use cached `<v>` values. Result rows feed the delimited logic. Warn when a workbook has several sheets and say which was used.

**PDF and images (AI-assisted only).** Client sends the file to `POST /api/rubric/extract` (section 7). If the server has no API key, return `needsAI: true` with the message "PDF and image rubrics need the AI engine. Paste the rubric text instead, or upload it as Word, Excel, CSV, Markdown or text." Never attempt to scrape PDFs with regex. With a key, send the document/image block to the model with a strict JSON-only extraction prompt, then run `normalizeRubricDraft` and `validateRubric`; mark every row confidence "check".

**Everything else** (unknown binary): message "I could not read that file type. Supported: JSON, CSV, TSV, Markdown, text, Word, Excel, and PDF or images with the AI engine."

### 5.3 Post-processing pipeline (`finalizeDraft`)
1. Trim and collapse whitespace; cap name 80 chars, description 300, keywords 30, criteria 12 (if more than 12, keep the first 12 and warn "N rows ignored", offering "merge extras into Other").
2. Merge duplicate names (case-insensitive) by summing points and warning.
3. Points: coerce to number, round to nearest 0.5, clamp to (0,100]; missing -> default `round(total/rowsWithoutPoints)` or 5 with warning and confidence "check".
4. IDs: slug from name, unique-suffixed (`testing`, `testing-2`).
5. **Keywords** (`keywords.js`, offline): if a row has none, derive from name+description: lowercase, split on non-letters, remove stopwords (a list of at least 150 English words) and generic words (`quality`, `overall`, `good`, `use`, `code`), keep words of length >= 4, reduce to stems by stripping `ing|ed|es|s|ation|ment|ly` while keeping length >= 4, de-duplicate, keep up to 8 ordered by frequency then position. Add curated synonyms for common CS criteria: *test* (test, assert, coverage, edge case), *efficiency* (efficien, complex, slow, quadratic, nested, performance, o(n), runtime), *readability* (readab, naming, variable name, style, format, messy, clean, tidy, indent), *documentation/comments* (comment, docstring, document, readme), *correctness* (correct, bug, wrong, output, crash, fail, exception, error), *design/structure* (modular, function, class, structure, design, decompos), *error handling* (error, exception, validate, validation, invalid, input check). Names are matched case-insensitively by stem.
6. **Suggested facts:** name/description matching test/testing/coverage -> `hasTests`; comment/documentation/docstring -> `hasComments`; efficiency/performance/complexity -> `noNestedLoops`. Suggested, never applied without the user accepting in the preview.
7. **Cross-checks:** if a stated total exists and differs from the sum, warn with both numbers; if the sum is not a "nice" total (not 10/20/25/30/40/50/100) show an informational note and the rescale control.
8. Title: from the file's first heading/title cell, else the file name without extension.

### 5.4 Rubric export (`rubric-export.js`)
`toJSON`, `toCSV` (header `Criterion,Points,Description,Keywords,Fact`), `toMarkdown` (title, a pipe table, total line), each safe for formula injection and **round-trip tested**: `parse(export(r))` must equal `r` (ignoring confidence fields) for every format.

### 5.5 Safety limits for uploads
Files up to 2 MB (rubric) and 10 MB total uncompressed from archives; at most 200 zip entries; reject entries with `..` paths or absolute paths; reject zips whose declared uncompressed size or compression ratio (>100:1) is suspicious; stop inflating at the byte budget; XML capped at 5 MB, nesting depth 100; no external entity or network use; reading runs in a try/catch that returns a friendly error, never throws to the UI. Do not execute, evaluate or render any content from an uploaded file; all text is displayed through `textContent`. Large reads yield to the event loop (`await` per chunk) so the UI stays responsive.

---

## 6. Algorithms (implement exactly, unit-test with fixtures)

### 6.1 Line references (`linerefs.js`)
`extractLineRefs(text)` -> `[{ from, to, start, end }]` (character offsets) from patterns, case-insensitive, with number words up to 999 supported via a converter: `line N`, `lines N to|through|-|and M`, `on line N`, `at line N`, `L12`, `ln 12`, `line number N`. `splitNotesIntoComments(notes)` assigns each clause (v1 `splitClauses`) that contains a line ref to a comment with `text` = the clause without the reference phrase, trimmed and capitalised. A clause with several refs creates one comment per ref. Refs beyond the file's line count are kept but marked "out of range" in the UI. Sentiment of the comment text reuses `sentimentOf`. The scoring engine may attach `lines` to the matching `Score` when the winning reason clause has a ref.

### 6.2 Similarity (`tokenizer.js`, `similarity.js`)
Tokenizer (language-agnostic): remove line and block comments (`#`, `//`, `/* */`, Python triple-quoted strings used as docstrings at statement level), replace string literals with `STR`, numbers with `NUM`, identifiers not in a built-in keyword set (Python, JS/TS, Java, C/C++, Go, Rust, Ruby keywords, about 250 words) with `ID`, drop whitespace; keep punctuation/operators as tokens; remember each token's source line.
Fingerprints: k-grams with `k = 5`, hash each with 32-bit FNV-1a, **winnowing** with window `w = 4` (choose the minimum hash in each window, rightmost on ties), store `(hash, firstLine)`.
Starter code: fingerprints present in the assignment's starter code are discarded from every submission before comparison.
Pairs: build an inverted index hash -> submissions, count shared fingerprints per pair. Scores: `containment = shared / min(|A|,|B|)`, `jaccard = shared / |A ∪ B|`. Flag pairs with `containment >= threshold (default 0.6)` and both sides having `>= minFingerprints (default 20)`. Matched line ranges: union of lines of shared fingerprints, merged when gaps are <= 2 lines. Output sorted by containment desc; at most 100 pairs displayed with "show more". Complexity target: 300 submissions of 200 lines under 2 s in Node. Multi-file submissions are concatenated in path order with a file marker token.
UI: pair list with percentages (as text, not only bars), a side-by-side viewer with highlighted ranges that are linked by index, keyboard step through matches, "Reviewed - not a concern" toggle stored in `similarityReviewed`.

### 6.3 Consistency (v1, retained)
Unchanged algorithms and constants as v1 (`TOLERANCE .25`, `DRIFT_TOLERANCE .3`, `MIN_PEERS 2`), now parameterised through `Settings.consistency` with validation (`0.05..0.5`, `0.1..0.6`, `1..5`). Add `explain(flag)` returning the raw numbers used (mean of peers, n, thresholds) for the disclosure.

### 6.4 Calibration (`calibration.js`)
Input: `submissions[]` each with `gradings[graderId].scores`, a rubric, and chosen graders. A submission is in the calibration set when at least two selected graders scored it.
For each criterion and each ordered-unique grader pair (A,B) over the shared submissions (n >= 3 to report, otherwise "not enough data"):
- `bias = mean(a - b)` (signed; positive means A scores higher).
- `mad = mean(|a - b|)`.
- `exact = share of pairs with |a-b| < 1e-9`.
- `within = share with |a-b| <= 0.5`.
- `qwk`: map each score to a bin `b = round(score / max * K)` with `K = min(10, ceil(max))`; build the (K+1)x(K+1) observed matrix O, expected matrix E from the marginals (`E_ij = rowSum_i * colSum_j / n`), weights `w_ij = (i-j)^2 / K^2`; `kappa = 1 - sum(w*O) / sum(w*E)`; if `sum(w*E) == 0` return `null`.
Labels (Landis-Koch): `< 0 poor`, `0-0.2 slight`, `0.21-0.4 fair`, `0.41-0.6 moderate`, `0.61-0.8 substantial`, `0.81-1 almost perfect`.
Also: per-grader **strictness** = mean of (grader total% - mean total% of the other graders) on shared submissions. Disagreements: all (submission, criterion) with `|a-b| >= tolerance * max` sorted by size. `resolve({submissionId, criterionId, finalScore, by})` writes the final into a `consensus` grading entry (graderId `"consensus"`) and an audit event. Plain-language summary strings are generated for each result ("Asha scores Testing 0.8 points higher than Ravi on average").

### 6.5 Insights (`insights.js`)
For graded submissions (using the chosen grader or consensus): per criterion `lostRate = share of students with score < max`, `avgLoss`, `avgScorePct`. Issues: group non-inferred scores by `(criterionId, tag)` where the student lost points; `count`, `pct = count / gradedCount`, `avgLoss`, `studentIds`. Rank by `count * avgLoss` desc. Digest (`buildDigest`) Markdown: title, N graded, class average, a "What most students lost points on" ranked list (top 5, each with `pct`, count, avg loss, short example reason text with names removed), "What went well" (criteria with the highest average pct), and a "Suggested focus for the next session" paragraph template. Never include student names or code in the digest (assert in a test). The AI polish endpoint receives only the aggregate numbers and reason strings with names stripped.

### 6.6 Dashboard stats (`dashboard-stats.js`)
Histograms: 10 equal bins over `[0, max]`. Trend: totals in grading order (order by `scoredAt`), moving average window 5. Time: `activeMs` accumulates while the grading view is visible and focused, in intervals; any interval longer than 180 s of no input events is capped at 180 s. Median and slowest by `activeMs`. Fatigue signals (need >= 9 graded): total-% of last third minus first third `>= 8` points either direction; mean notes words of last third `< 0.6x` first third. Messages are neutral and factual.

### 6.7 Feedback quality (`feedback-quality.js`)
Start 100; each finding `{id, severity, message, penalty, fix?}`:
`short` (< 25 words, -25), `no-next-step` (no sentence matching `try|consider|add|use|next time|you could|should|improve|work on|focus on|practice`, -20), `harsh-words` (words from a list of at least 25 harsh/insulting words, -15 each up to -45, offers a neutral replacement), `all-negative` (no positive sentence, -10), `shouting` (three or more ALL-CAPS words of length >= 4, -10, fix = sentence case), `exclamations` (more than 3 `!`, -5), `arithmetic` (`minus|deduct|points off`, -10, fix removes), `placeholder` (`TODO|TBD|???|{name}`, -20), `other-student` (contains another submission's name from the batch, -30, privacy, no auto-fix), `no-score` (no `Score:` line, -5, fix appends). Score floor 0. Labels: >= 80 "Good", 60-79 "Okay", < 60 "Needs work". The label is always paired with text. `applyEasyFixes(text)` applies fixes for the fixable kinds only.

### 6.8 Audit and undo (`audit.js`, `undo.js`)
`audit.record(event)` returns a new log (immutable, capped at 5000 events with oldest dropped and a warning). `undo` keeps `{past[], future[]}` of inverse operations `{apply, revert, label}` per submission; a new action clears `future`. Undo/redo announce "Undid: <label>".

### 6.9 ZIP read/write (`zip.js`)
Reader: parse the End of Central Directory (scan the last 66 KB), the central directory, local headers; support methods 0 (stored) and 8 (deflate) only; `inflate` is **injected** (`node:zlib.inflateRawSync` on the server/tests; `DecompressionStream("deflate-raw")` in the browser), so the module stays pure. Enforce the limits of 5.5. Return `[{path, size, getBytes()}]`; reject ZIP64, encrypted, and multi-disk archives with a clear message. Writer: store-only (method 0) ZIP with CRC-32 (table-based), DOS time/date, UTF-8 names (general purpose bit 11), correct central directory and EOCD; filenames sanitised (`/\:*?"<>|` replaced, deduped with `-2`). Round-trip tested and verified with the system `unzip -t` in a test when available.

---

## 7. Server API (v1 routes unchanged, plus)

All JSON, errors `{error}` with 4xx/5xx and no stack traces. Mutations need `content-type: application/json` and (when authenticated) `x-tg-csrf: 1`. Rate limit buckets per IP: analyze/translate/digest/rubric-extract share 120 per 10 min; auth 20 per 10 min.

- `GET /api/health` -> `{ ok, engine, teamMode, version }`.
- `POST /api/analyze` (v1) now also accepts `{ privacy: { anonymise, sendCode, stripIdentifiers }, files?: [{path,text}] }`; the server applies `anonymise.js` (names -> S1.., emails/ids stripped) before building the prompt and restores names in the response.
- `POST /api/translate` `{ text, language, tone }` -> `{ text, engine }`; 501 `{error:"AI engine not configured"}` without a key. Allowed languages whitelist (section 2 F14); instructions: preserve numbers, scores, code, identifiers and line numbers.
- `POST /api/digest/polish` `{ markdown }` -> `{ markdown }`; the server rejects input containing anything resembling an email or a name list (basic check) and caps size at 8 KB.
- `POST /api/rubric/extract` multipart or base64 JSON `{ name, mime, dataBase64 }` (cap 8 MB) -> `{ rubric, warnings }` via the model with a JSON-only prompt (PDF as a document block, images as image blocks); 501 without a key; output validated by `normalizeRubricDraft`.
- Team mode only (`TEAM_MODE=1`, else 404): `POST /api/auth/register|login|logout`, `GET /api/auth/me`; `GET/POST/PATCH/DELETE /api/courses[/:id]`, nested `/assignments`, `/submissions`, `PUT /api/submissions/:id/grading` (the caller's own grading only), `GET /api/audit?submission=`, `POST /api/student-links` (`{submissionId, graderId, ttlDays}` -> `{url}`), `DELETE /api/student-links/:id`, `GET /api/student/:token` (public, rate-limited, returns only that student's score, criteria breakdown, feedback and line comments).
Permissions enforced centrally in `permissions.js`; every route test covers a forbidden case. Token comparisons use hashes and `timingSafeEqual`.

---

## 8. UI and design system

### 8.1 Layout
App shell: left **rail** (icon + label, collapsible to icons with tooltips): Home, Courses, Rubrics, Grade, Insights, Similarity, Calibration, Dashboard, Activity, Settings. Top **context bar**: breadcrumb (course > assignment), assignment switcher, engine pill, privacy pill ("Data stays on this device" / "AI on, names anonymised"), command palette button (`Ctrl+K`), theme toggle. Main area changes per view. Below 960 px the rail becomes a bottom tab bar (5 primary items, "More" menu). Skip link first in tab order. Region landmarks: `header`, `nav`, `main`, `aside`.

Key views
- **Home:** continue where you left off, demo course card, "Import a rubric" and "Import submissions" primary actions, onboarding tour trigger.
- **Assignment:** header (title, due date, rubric chip with edit/replace), progress ring with text, a **submissions table** (name, id, graded state, total%, flags count, similarity badge, last activity; sortable by header buttons with `aria-sort`; filter chips: all / ungraded / flagged / low feedback quality; search; keyboard row navigation; bulk select), import actions, settings.
- **Grade:** three resizable areas (submissions rail collapsible; code viewer with file tabs, gutter, comment markers and a comments list; right pane with notes, command box, score table, feedback, quality meter, translation). Splitters are keyboard operable (arrow keys) with `role="separator"` and values announced.
- **Rubric Studio** and **Rubric Import** (section 5.1).
- **Insights:** headline cards, loss-rate bar chart (SVG + table toggle), recurring issues table, digest editor with copy/download.
- **Similarity:** threshold slider (`input type=range` with number readout), pair list, side-by-side viewer.
- **Calibration:** grader chooser, agreement matrix as a table with colour-independent cues (value + label text), disagreements list with Resolve dialog, strictness bars with text values.
- **Dashboard:** histograms, trend line chart with moving average, time stats, fatigue notices, all with `<table>` equivalents.
- **Activity:** filterable audit list (by type, student), export as CSV.
- **Settings:** tone, thresholds (with reset to defaults), privacy switches, data flow panel, backup/restore, wipe data, hands-free dictation toggle, theme.

### 8.2 Visual design (attractive, calm, editorial)
Direction: "teacher's desk": warm paper surfaces, deep green primary, one warm accent for problems, generous whitespace, soft layered cards, crisp type. No gradients that harm contrast; subtle shadows only on raised surfaces.
Tokens (CSS custom properties; light is default, dark via `prefers-color-scheme` **and** a manual toggle `[data-theme]`; both themes verified):

| token | light | dark |
|---|---|---|
| `--bg` | `#f6f6f1` | `#121a16` |
| `--surface` | `#ffffff` | `#1a251f` |
| `--surface-2` | `#f0f3ef` | `#223029` |
| `--ink` | `#17261f` | `#e8f0eb` |
| `--muted` | `#4a5a52` | `#a9b8b0` |
| `--line` | `#cfd6cf` | `#34463c` |
| `--brand` | `#1d5a43` | `#5bc29a` |
| `--on-brand` | `#ffffff` | `#0b1511` |
| `--accent` | `#a4481f` | `#f0a27c` |
| `--high` | `#8f1d1d` | `#ff9b9b` |
| `--medium` | `#7a4b00` | `#f2c46d` |
| `--focus` | `#0b57d0` | `#8ab4ff` |
| `--code-bg` | `#1b2420` | `#0d1310` |

Type: system UI stack for text; `ui-serif, "Iowan Old Style", Georgia, serif` for display headings (page titles, empty states); system monospace for code. Scale (rem): 0.8, 0.875, 1, 1.125, 1.25, 1.5, 2, 2.75. Spacing scale 4/8/12/16/24/32/48 px. Radii 8/12/16. Elevation: three levels. Minimum text contrast 4.5:1, UI component boundaries 3:1, verified in both themes by a script that computes contrast for every token pair used.
Components to build (each with documented states): buttons (primary, secondary, ghost, danger, icon-only with `aria-label`), segmented control, tabs (roving tabindex), chip input, badge, table with sortable headers, dialog (`<dialog>`, focus trap, Esc, returns focus), drawer, popover/tooltip (focus and hover, Esc closes), toast stack with live region, command palette (combobox pattern), empty states with illustration made from inline SVG shapes (no external images), skeleton loaders, progress ring and bar (with text), charts (SVG; bars labelled, lines with markers, axes with text, a toggle to view as table), code viewer (line numbers, selectable, comment markers).
Icons: a hand-drawn inline-SVG sprite in `icons.js` (about 30 simple geometric icons: home, book, rubric, pencil, mic, check, alert, flag, users, chart, clock, upload, download, search, settings, undo, redo, link, trash, copy, globe, shield, sun, moon, chevron, close, plus, drag, play, info). Decorative icons have `aria-hidden`; meaningful ones have text.
Motion: 120-200 ms ease for hover/open; score count-up and a small "pop" when totals appear; all disabled under `prefers-reduced-motion`. No auto-playing animation longer than 400 ms.
Print stylesheet: hides chrome, one student per page with score table, line comments and feedback.

### 8.3 Accessibility details
Every control has an accessible name; dialogs label themselves; live-region announcements for every state change (scoring done, comment added, import finished, flag applied, undo/redo); focus is never lost on re-render (re-render by diffing or restoring focus to the equivalent element); error messages linked with `aria-describedby`; status never conveyed by colour alone; drag-and-drop reordering has a keyboard alternative ("Move up/down" buttons); charts have table equivalents; targets are at least 32x32 px (24 px minimum with spacing); text resizes to 200 % without loss; `lang` set; page titles update per view.

---

## 9. Security and privacy

- v1 headers/CSP retained; add `Permissions-Policy: microphone=(self), camera=(), geolocation=()` (microphone only used by the optional Web Speech fallback). CSP stays `script-src 'self'` with no inline code or styles (the app uses classes and CSSOM). `student.html` has the same policy.
- Upload handling per 5.5; archive path traversal blocked; file names displayed via `textContent`; downloads generated with `Blob` and sanitised names.
- Team mode: scrypt passwords, hashed session tokens, CSRF header, brute-force rate limit, account enumeration-safe error messages, secure cookie flags, per-route permission checks, student tokens 128-bit random and stored hashed, SQLite statements parameterised only (no string concatenation).
- AI calls: anonymise names, optional code stripping, size caps, untrusted-data framing in prompts (v1), timeouts, no logging of request bodies. The Data flow panel and README list exactly what is sent.
- Logs never contain code, notes or names. Errors map to generic messages.

---

## 10. Testing (Node built-in runner; `npm test` runs everything that needs no browser)

Unit tests per lib module. Required cases include:

- **rubric-import (the most heavily tested):** fixtures in `tests/fixtures/rubrics/`: `native.json`, `variant-keys.json` (keys like `Criterion`/`Marks`), `weights.json` (weights summing to 1), `levels.json`, `simple.csv`, `semicolon-bom.csv`, `tab.tsv`, `headerless.csv`, `quoted-multiline.csv`, `canvas-grid.csv`, `table.md`, `list.md`, `numbered.txt`, `inline-points.txt`, `spoken.txt`, `with-total-mismatch.csv`, `too-many-rows.csv`, `duplicate-names.csv`, `empty.txt`, `garbage.bin`. `.docx` and `.xlsx` fixtures are **generated inside the tests** with the product's zip writer plus hand-written XML so no binary files are committed. Each fixture asserts the criteria names, points, total, warnings and confidences. Also: PDF/PNG magic returns `needsAI`; oversized input rejected; zip bomb (high ratio, too many entries, `../` path) rejected; text with HTML/script tags stays inert text; export -> import round trip for JSON, CSV and Markdown; keyword generation (stopwords removed, stems, synonyms for testing/efficiency/readability, max 8); suggested facts; scale-to-total (rounding to 0.5 with the remainder on the largest row, total exactly equal).
- **zip:** stored and deflated entries, UTF-8 names, CRC verification, EOCD with comment, rejection of ZIP64/encrypted, writer output readable by the reader and (when `unzip` exists) by `unzip -t`.
- **csv:** quotes, embedded newlines, CRLF, BOM, delimiters.
- **linerefs:** all patterns, number words, ranges, out-of-range flags, clause splitting.
- **similarity/tokenizer:** identical files (containment 1), renamed identifiers (still high), reordered functions (high), unrelated code (near 0), starter code exclusion, tiny files ignored, performance bound.
- **calibration:** hand-computed fixtures for bias, MAD, exact, within, QWK (including a perfect-agreement case = 1, a degenerate case = null, a negative case), strictness, disagreement ordering, resolve.
- **insights, dashboard-stats, feedback-quality, audit/undo, anonymise (round trip), settings validation, ids.**
- **consistency/v1:** all 25 original tests unchanged and green.
- **store contract:** one suite run against the fake IndexedDB and SQLite stores: CRUD, query by index, transactions, export/import (merge and replace), wipe, v1 migration.
- **server:** v1 tests plus: new routes' validation and 501 behaviours, anonymisation on the AI path with a mocked fetch, rubric-extract with a mock, translate whitelist, rate limits, security headers on every route, team mode (register/login/logout, CSRF rejection, permission matrix, grading isolation per grader, student link lifecycle: create, read, expire, revoke), path traversal.

`tests/e2e/run-e2e.mjs` (optional, skipped with a clear message when Playwright is not installed) drives the real UI in headless Chromium: first-run demo course; import every rubric fixture through the dropzone (including generated docx/xlsx) and assert the preview; edit a row and save to the library; assign to an assignment; grade with spoken notes containing `line 4`; verify comments and gutter markers; run Score all; verify the three v1 flags; apply a suggestion; undo/redo; run similarity on a planted duplicate; calibration with an imported second grader file; insights digest has no names; export zip and CSV; translation control disabled offline; command palette; keyboard-only path through grading; theme toggle; 390 px width without horizontal scroll; zero console errors and CSP violations. It also runs **axe-core on every view in both themes** and fails on any violation.

---

## 11. Implementation order and gates

Work in these stages. After each stage run `npm test`; do not start the next until green and the stage's gate is met.

1. **Foundations:** `ids.js`, `csv.js`, `xml-lite.js`, `zip.js`, `settings.js`, `audit.js`, `undo.js` + tests. *Gate:* zip round trip, v1 tests green.
2. **Rubric import engine:** `rubric-text.js`, `rubric-spoken.js`, `keywords.js`, `rubric-import.js`, `rubric-export.js` + all fixtures. *Gate:* every fixture and round-trip test passes.
3. **Analysis modules:** `linerefs.js`, `tokenizer.js`, `similarity.js`, `calibration.js`, `insights.js`, `dashboard-stats.js`, `feedback-quality.js`, `anonymise.js`, extended `commands.js` + tests. *Gate:* hand-computed fixtures match.
4. **Storage:** `Store` contract, IndexedDB store, memory/fake store, v1 migration. *Gate:* contract suite green.
5. **Server:** refactor to `server/` keeping v1 behaviour, new routes, security, then team mode (SQLite, auth, permissions, student links). *Gate:* server tests green; v1 server tests untouched.
6. **App shell and design system:** tokens, components, router, store, a11y helpers, icons, command palette, theming. *Gate:* a component gallery page (`#/_gallery`, dev only) passes axe in both themes.
7. **Views:** Home/Assignment/Rubric Studio/Rubric Import first (the demo-critical path), then Grade (with line comments), Insights, Similarity, Calibration, Dashboard, Activity, Settings, Export, Onboarding, student page. *Gate:* each view passes axe and has an e2e step.
8. **Hardening and docs:** keyboard-only audit, 200 % zoom check, print view, performance check with 500 generated submissions (list renders smoothly, import under 5 s), `docs/` written, README updated (including a rubric format guide with examples of every supported shape and a "bring your own rubric" quick start).
9. **Final verification (mandatory):** run the full e2e script, axe on all views and both themes, `npm test`; fix everything found; repeat until clean. Print the final file tree, test counts and any known limitations.

---

## 12. Definition of done

- Every feature F1-F18 is present, works in guest mode with no sign-in, and is reachable by keyboard and voice-typed commands.
- A user with **no account** can upload a rubric as JSON, CSV, TSV, Markdown, plain text, Word or Excel, or paste/dictate one, review and fix it in the preview, save it to the library and assign it. PDF/images work with the AI engine and fail gracefully without it.
- The v1 sample still yields exactly its three flags and the original 25 tests pass.
- All algorithms in section 6 match their fixtures; no module has untested branches that handle user input.
- Axe reports zero violations on every view in light and dark; contrast checks pass; 390 px has no horizontal scroll; print view works.
- No runtime dependency, no network request except to the app's own server (and Anthropic through the server when configured); CSP has no violations.
- README, `docs/`, and the Data flow panel are accurate and honest about limitations (rule-based offline engine, heuristic facts, AI-only PDF/image rubric reading, similarity is a lead not proof).
- Final message lists the file tree, test totals and any limitation knowingly left.
