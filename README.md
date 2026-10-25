# TalkGrade

**Grade programming submissions by talking.** Dictate your thoughts on each submission with Wispr Flow. TalkGrade turns them into rubric scores and student-ready feedback, then checks your marking for inconsistencies, such as the student with no tests who still got full marks.

Built for the WeMakeDevs x Wispr Flow *No Hands* hackathon (Builders track).

## The problem

Grading 60+ submissions is slow and uneven. By submission 50 you are stricter or looser than you were at submission 5, and writing feedback for each student is the slowest part. TAs already think out loud while reading code. TalkGrade uses that spoken thinking as the input.

**Who it is for:** teaching assistants and instructors who grade code.

## Run it

Guest mode requires Node 18+. Team mode uses the built-in SQLite module and requires Node 22.13 or newer. No npm dependencies are required.

```sh
npm start            # http://localhost:3000
npm test             # Node's built-in test runner
```

### Courses and assignments

Use **New course** to create a course, then **New assignment** to add an assignment in it. The selectors switch between saved records. **Edit assignment** changes its title, due date, and consistency thresholds. Archived courses and assignments stay listed with an `(archived)` marker and can be restored with the same archive button. Deleting a course asks before deleting its assignments and submissions. Guest data is stored in IndexedDB and mirrored to localStorage for recovery.

### Rubrics and submissions

Use **Rubric library** to assign one of the built-in templates or a saved rubric, duplicate it, export it as JSON/CSV/Markdown, or remove a user rubric. **Edit rubric** opens the visual Rubric Studio; criteria can be reordered with the arrow buttons or by dragging, and changing an assigned rubric asks before clearing existing scores. **Import rubric** accepts JSON, CSV, TSV, Markdown, text, DOCX, and XLSX, and offers downloadable starter formats. PDF/image files can be extracted with the optional Gemini engine.

For submissions, **Import submissions** accepts individual files, JSON name/code data, and ZIP archives. **Import folder** uses the browser's folder picker and groups files under each student folder. Each submission can contain multiple files, shown as tabs in the code viewer; display names and optional student IDs can be edited. Files above 200 KB, submissions above 2 MB, unsafe archive paths, binary files, and excess submissions are skipped and listed in the import report.

Open the page, choose **Load sample**, then **Score all samples** and read the Consistency check panel.

Optional Gemini AI engine (otherwise the built-in offline rules are used). Add your key to the `GEMINI_API_KEY=` line in the root `.env` file, then start TalkGrade:

Team mode is opt-in: set `TEAM_MODE=1` in `.env` and run on Node 22.13+. It creates a local SQLite database. Open **Team mode** in TalkGrade to create an account/course, add existing accounts as graders or viewers, share or connect assignments, sync individual graders' scores, import scores for calibration, and create or revoke expiring student feedback links. Team accounts use email and password. See [docs/API.md](docs/API.md) for the endpoints.

```powershell
npm start
```

You can copy `.env.example` to `.env` as a starting point. TalkGrade reads `.env` on startup; shell and hosting environment variables take precedence. Optionally change `GEMINI_MODEL` to another model available to your Gemini API key. Keep `.env` private; it is excluded from Git. Never put the key in browser code or commit it.

The badge in the top bar shows which engine is active. If a Gemini API call fails during grading, TalkGrade falls back to the offline rules and tells you. Rubric extraction and digest polishing require Gemini and show an error if the service is unavailable.

Press **Ctrl+K** to find commands and students. The palette accepts commands such as `open Bhavna`, `go to insights`, `export csv`, and `export zip`. Optional browser speech recognition is off by default and can be enabled in the palette; it is separate from Wispr Flow.
## How to use it with Wispr Flow

Wispr Flow types wherever your cursor is, so there is no integration to configure.

1. Click **Your spoken notes**, hold your Flow hotkey and talk: "Correct output, but there are no tests, deduct 2. Nested loops, that's quadratic, minus 1."
2. Press **Ctrl+Enter** to score.
3. Click the **voice command** box and say "next student", "set testing to 2", "full marks on style" or "check consistency", then press Enter.
4. Say numbers the way you speak them: "minus two", "half a point off", "3 out of 5", "give it a 4".

## How it works

| Piece | What it does |
|---|---|
| `heuristic.js` | Offline rules: splits notes into clauses, matches them to rubric criteria by keyword, reads spoken numbers, drafts feedback. A criterion you did not mention gets full marks and is marked *assumed*, so the checker can still catch what you forgot. |
| `llm.js` | Optional Gemini engine. Your notes are the only basis for deductions. The model structures them and writes student-facing feedback. Output is validated and clamped. |
| `facts.js` | Measures objective facts from the code: has tests, comment ratio, nested loops. |
| `consistency.js` | The headline feature. Six checks, listed below. |
| `commands.js` | Parses spoken commands. |

### Consistency checks

1. **Possibly too lenient:** a submission has a measurable flaw (no tests) but scored well above other submissions with the same flaw.
2. **Possibly too harsh:** the reverse.
3. **Same issue, different penalty:** "tests" cost 2 points for one student and 0.5 for another.
4. **Problem noted, no deduction:** your notes raise an issue but the criterion kept full marks.
5. **Praise, low score:** positive notes with a half-marks-or-less score.
6. **Standard drifted:** a criterion's average moved a lot between your first and last graded submissions.

Each flag offers one-click suggestions and a Dismiss button. Thresholds are constants at the top of `public/lib/consistency.js`.

## Project structure

```
talkgrade/
├── server.js                 HTTP server: static files + /api/analyze + /api/health
├── package.json
├── .env.example
├── src/
│   ├── engine.js             picks Gemini or offline rules, validates requests
│   └── llm.js                Gemini generateContent API call, prompt, JSON parsing
├── public/
│   ├── index.html            single-page UI
│   ├── styles.css
│   ├── app.js                UI state, rendering, commands, import/export
│   ├── data/sample.js        sample rubric + six submissions + sample dictation
│   └── lib/                  pure logic shared by browser and Node
│       ├── rubric.js         validation, score clamping, normalising AI output
│       ├── facts.js          tests / comments / nested-loop detection
│       ├── heuristic.js      offline notes -> scores + feedback
│       ├── consistency.js    the inconsistency checker
│       ├── commands.js       spoken command parser
│       └── export.js         CSV (formula-injection safe) and feedback bundle
└── tests/
    ├── lib.test.js           rubric, facts, commands, export
    ├── engine.test.js        heuristic and consistency, incl. the sample batch
    └── server.test.js        routes, validation, CSP, Gemini path with mocked fetch
```

## Privacy and security

- Grading privacy controls are enabled by default: student names are replaced with S1, S2, etc. before Gemini and restored in the response; code can be omitted, and emails plus explicitly labelled student/user IDs can be redacted.
- With Gemini enabled, rubric and notes are sent to Google Gemini. Submission code is sent only when its setting is on; PDF/image rubric documents and aggregate insight-polish data are separate AI features described in Settings > Data flow.
- Guest data is stored in IndexedDB, with the previous localStorage state migrated on startup and mirrored as a local recovery copy. **Clear all** removes the course grading data; **Wipe all data** removes the saved app state.
- Strict CSP (`script-src 'self'`, no inline script or style), all user text rendered with `textContent`, CSV cells starting with `= + - @` are neutralised, request bodies are capped, and `/api/analyze` is rate-limited.
- Student code is treated as untrusted data in the AI prompt.

## Limitations (be honest in your demo)

- The offline engine is keyword and rule based. It handles natural phrasing like "no tests, minus 2" well, but unusual wording needs the AI engine or a rubric with more keywords. Always read the scores before exporting.
- The tag-variance check only compares deductions where exactly one issue tag was matched for a criterion.
- Fact detection (tests, comments, nested loops) is a heuristic on source text and is tuned for Python and brace languages.
- Voice is Wispr Flow typing into the page. The app does not capture audio itself.

## Deploy so judges can try it without signing in

- **Static hosting (GitHub Pages, Netlify):** upload the `public/` folder. The app detects there is no API and uses the offline rules in the browser, so everything except the AI engine works.
- **Node hosting (Render, Railway, Fly):** deploy the repo with `npm start`. Set `GEMINI_API_KEY` in the host environment to enable Gemini; check your Google AI plan and usage limits; the rate limit is 120 requests per 10 minutes per IP.

## Suggested 2-minute demo

1. (0:00) The problem, one sentence. Load the sample.
2. (0:15) Dictate notes on one submission with Flow, press Ctrl+Enter, show the scores and the drafted feedback.
3. (0:45) Say "next student", then **Score all samples**.
4. (1:00) **Check consistency**: Chirag has no tests but 5/5. Click the suggested fix.
5. (1:30) Export the CSV. Show the Wispr usage card.

## Submission text (edit to match your experience)

> **Problem:** Grading code submissions is slow and my standards drift across a big batch.
> **For:** TAs and instructors who grade programming assignments.
> **How I used Wispr:** I dictated the spec, prompts, commit messages and this README, and the product itself is designed around dictated grading notes.
