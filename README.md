<div align="center">

# 🎙️ TalkGrade

**Grade programming submissions by talking.**

Dictate your thoughts on each submission with Wispr Flow — TalkGrade turns
them into rubric scores and student-ready feedback, then checks your marking
for inconsistencies, like the student with no tests who still got full marks.

[![Live app](https://img.shields.io/badge/%F0%9F%9A%80-live_app-000?style=flat-square&logo=vercel)](https://talkgrade.vercel.app)
[![Node](https://img.shields.io/badge/node-%3E%3D18-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)
[![Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen?style=flat-square)](https://www.npmjs.com)
[![Tests](https://img.shields.io/badge/tests-74%20passing-brightgreen?style=flat-square)](#tests)

*Built for the WeMakeDevs × Wispr Flow **No Hands** hackathon — Builders track.*

</div>

---

## 💡 The problem

Grading 60+ submissions is slow and uneven. By submission 50 you are stricter
or looser than you were at submission 5, and writing feedback for each student
is the slowest part.

But TAs already think out loud while reading code.
**TalkGrade uses that spoken thinking as the input.**

> **Who it's for:** teaching assistants and instructors who grade code.

## ⚡ Quickstart

```sh
git clone https://github.com/Soma1111111/talkgrade
cd talkgrade
npm start          # → http://localhost:3000
```

Then click **Load sample** → **Score all samples** → read the **Consistency check** panel.

Or just open the **[live app](https://talkgrade.vercel.app)** — no install, no sign-up.

## ✨ Features

| | Feature | What it does |
|---|---|---|
| 🎙️ | **Dictated grading** | Hold your Wispr Flow hotkey, talk naturally ("no tests, deduct two; nested loops, minus one"), press **Ctrl+Enter** — done. |
| 🗣️ | **Voice commands** | "next student", "set testing to 2", "full marks on style", "check consistency". Numbers work the way you speak them: *minus two, half a point off, 3 out of 5*. |
| 🚨 | **Consistency checker** | Six drift detectors that flag leniency, harshness, unequal penalties, un-deducted problems, and drifting standards across your batch — each with a one-click fix. |
| 📝 | **Student-ready feedback** | Feedback drafted from your own words, not robot-speak. Export as CSV or a feedback bundle. |
| 📊 | **Class insights** | Class-level digest of where students struggled and what to review in the next lecture. |
| 🧠 | **Dual engine** | Built-in offline rules engine by default; optional Gemini AI engine — with automatic fallback if the AI call fails. |
| 📚 | **Rubric Studio** | Visual rubric editor with drag-to-reorder; import from JSON, CSV, TSV, Markdown, DOCX, XLSX — even extract from PDF/images (Gemini). |
| 📥 | **Flexible imports** | Individual files, JSON name/code data, ZIP archives, or whole folders via the browser picker — grouped per student. |
| 👥 | **Team mode** *(opt-in)* | SQLite-backed multi-grader accounts: shared assignments, score sync, calibration imports, expiring student feedback links. |
| ⌨️ | **Command palette** | **Ctrl+K** for `open Bhavna`, `go to insights`, `export csv`, `export zip`. |

## 🚨 The consistency checks

The headline feature. After a batch, TalkGrade re-reads your own marking and flags:

1. **Possibly too lenient** — a submission has a measurable flaw (no tests) but scored well above others with the same flaw
2. **Possibly too harsh** — the reverse
3. **Same issue, different penalty** — "tests" cost 2 points for one student, 0.5 for another
4. **Problem noted, no deduction** — your notes raise an issue but the criterion kept full marks
5. **Praise, low score** — positive notes with a half-marks-or-less score
6. **Standard drifted** — a criterion's average moved a lot between your first and last graded submissions

Each flag offers one-click suggestions and a Dismiss button.

## 🏗️ How it works

| Piece | What it does |
|---|---|
| `public/lib/heuristic.js` | Offline rules: splits notes into clauses, matches them to rubric criteria by keyword, reads spoken numbers, drafts feedback. Unmentioned criteria get full marks and are marked *assumed*, so the checker can still catch what you forgot. |
| `src/llm.js` | Optional Gemini engine. Your notes are the only basis for deductions; the model structures them and writes student-facing feedback. Output is validated and clamped. |
| `public/lib/facts.js` | Measures objective facts from the code: has tests, comment ratio, nested loops. |
| `public/lib/consistency.js` | The six consistency checks. |
| `public/lib/commands.js` | Parses spoken commands. |
| `server.js` | Zero-dependency Node HTTP server: static files + `/api/analyze`, `/api/translate`, `/api/rubric/extract`, `/api/insights/polish`, `/api/health`. |

**Wispr Flow needs no integration** — it types wherever your cursor is. Click
**Your spoken notes**, hold your Flow hotkey, talk, press **Ctrl+Enter**.

## ⚙️ Configuration

Copy `.env.example` to `.env` as a starting point. Shell and hosting
environment variables take precedence. **Keep `.env` private** — it is
git-excluded; never put the key in browser code or commit it.

| Variable | Default | Purpose |
|---|---|---|
| `GEMINI_API_KEY` | *(empty)* | Enables the Gemini AI engine. Without it, the offline rules engine runs. |
| `GEMINI_MODEL` | `gemini-3.8-flash` | Any model available to your key. |
| `PORT` | `3000` | Server port. |
| `TEAM_MODE` | `0` | Set `1` on Node 22.13+ to enable multi-grader accounts with a local SQLite database. |
| `TEAM_DB` | `server/talkgrade-team.sqlite` | Custom SQLite path for team mode. |
| `COOKIE_SECURE` | auto | Force Secure session cookies behind a TLS proxy. |

The badge in the top bar shows which engine is active. If a Gemini call fails
during grading, TalkGrade falls back to the offline rules and tells you.

## 🚀 Deploy

| Host | How |
|---|---|
| **Vercel** *(current)* | Already configured via `vercel.json` + `api/index.js`. Set `GEMINI_API_KEY` in the project env. Team mode is auto-disabled (serverless has no writable disk). |
| **Render / Railway / Fly** | Deploy the repo, start with `npm start` (`railway.json` included). Set `GEMINI_API_KEY` in the host env. Team mode works here — these hosts have persistent disks. |
| **Static (GitHub Pages, Netlify)** | Upload `public/`. The app detects there is no API and runs the offline engine in the browser — everything except the AI engine works. |

Rate limit on the API: 120 requests / 10 minutes / IP.

## 🔒 Privacy & security

- **Privacy by default:** student names are replaced with S1, S2, … before
  anything is sent to Gemini and restored in the response. Code can be omitted
  entirely; emails and labelled IDs can be redacted.
- With Gemini enabled, rubric and notes go to Google Gemini; submission code
  only when its setting is on. See **Settings → Data flow** in the app.
- Guest data lives in IndexedDB (mirrored to localStorage for recovery).
  **Clear all** removes grading data; **Wipe all data** removes all app state.
- Strict CSP (`script-src 'self'`, no inline script/style), all user text
  rendered via `textContent`, CSV formula-injection neutralised, request bodies
  capped, `/api/analyze` rate-limited. Student code is treated as untrusted
  data in the AI prompt.

## 📁 Project structure

```
talkgrade/
├── server.js              zero-dependency HTTP server + JSON API
├── api/index.js           Vercel serverless entry point
├── vercel.json            Vercel routing config
├── src/                   server-side engine code (Gemini + routing)
├── public/
│   ├── index.html         single-page UI
│   ├── app.js             UI state, rendering, commands, import/export
│   ├── data/sample.js     sample rubric + six submissions
│   └── lib/               pure logic shared by browser and Node
└── tests/                 74 tests on Node's built-in runner
```

## ✅ Tests

```sh
npm test
```

74 tests across rubric validation, fact detection, the consistency checker,
spoken-command parsing, CSV export, and the server routes (CSP, validation,
Gemini path with mocked fetch).

## ⚠️ Honest limitations

- The offline engine is keyword/rule based — natural phrasing like "no tests,
  minus 2" works well; unusual wording needs the AI engine or a rubric with
  more keywords. Always read the scores before exporting.
- Fact detection (tests, comments, nested loops) is tuned for Python and brace
  languages.
- The tag-variance check only compares deductions where exactly one issue tag
  matched for a criterion.
- Voice is Wispr Flow typing into the page; the app never captures audio.

---

<div align="center">

**[🎙️ Try TalkGrade live](https://talkgrade.vercel.app)** · **[Report an issue](https://github.com/Soma1111111/talkgrade/issues)**

*Grade by talking. Catch your drift.*

</div>
