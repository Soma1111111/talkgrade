# Architecture

TalkGrade serves a dependency-free browser app from `server.js`. Browser state is hydrated from IndexedDB (`talkgrade-studio`) and normalized into course, assignment, submission, rubric, and event stores. Existing `talkgrade-state-v1` localStorage data is used to seed IndexedDB on first startup; localStorage remains a recovery mirror. If IndexedDB is unavailable, the app displays a status notice and continues with the browser storage fallback.

Pure logic is exposed as UMD globals under `public/lib/`. The page enters through `public/app/main.js` and `router.js`, which provide hash routes for the grading and analysis views while retaining the current single-page UI and UMD logic modules.

Guest mode is the default. Optional Gemini requests for grading, rubric extraction, insight polishing, and feedback translation go through the local server using `GEMINI_API_KEY`. Set `TEAM_MODE=1` on Node 22.13+ to enable the SQLite-backed accounts, course roles, assignments, submissions, per-grader grading, audit events, and expiring student feedback links. The Team mode page supports account access, course membership, sharing assignments, synchronizing grader scores, calibration imports, and feedback-link management. Student feedback links are served at `/s/:token`.
