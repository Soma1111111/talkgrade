# API

# API

The dependency-free server exposes:

- `GET /api/health` — reports whether Gemini or offline grading is configured.
- `POST /api/analyze` — validates rubric and notes, applies the requested AI privacy controls, then uses Gemini or the local rules engine.
- `POST /api/translate` — `{ text, language, tone, privacy }`; translates feedback with Gemini into `hi`, `hinglish`, `bn`, `ta`, `te`, `mr`, or `kn`. Input is limited to 8,000 characters. Returns `{ text, engine: "gemini" }`; returns 501 when no key is configured and 400 for invalid input. Known names and configured identifiers are protected before sending. Scores and code identifiers are placeholder-protected and verified before returning.
- `POST /api/rubric/extract` — extracts rubric data from PDF/image uploads with Gemini; returns 501 when no key is configured.
- `POST /api/insights/polish` — rewrites class-level aggregate insights with Gemini; returns 501 when no key is configured.

All endpoints accept JSON where applicable, use bounded request bodies, return generic server errors, and include security headers. Set `TEAM_MODE=1` (Node 22.13+) to enable the SQLite-backed team routes; they return an authentication error until a grader signs in. Guest mode returns 404 for team APIs.

With team mode enabled:

- `POST /api/auth/register`, `/api/auth/login`, `/api/auth/logout`; `GET /api/auth/me`.
- `GET` and `POST /api/courses`; `PATCH` and `DELETE /api/courses/:id` (owner only).
- `GET` and `POST /api/courses/:id/members`; course owners can add or update existing accounts as graders/viewers and remove non-owner members.
- `GET` and `POST /api/courses/:id/assignments`.
- `GET` and `POST /api/assignments/:id/submissions`.
- `PUT /api/submissions/:id/grading` stores the signed-in grader's own grading.
- `GET /api/audit` and `GET /api/audit?submission=:id`.
- `GET /api/student-links?submissionId=:id`, `POST /api/student-links`, `DELETE /api/student-links/:id`, and public `GET /api/student/:token`. Student links render at `/s/:token` and expire or can be revoked.

Mutating authenticated requests require `x-tg-csrf: 1`. Team data is stored in `TEAM_DB` or `server/talkgrade-team.sqlite` by default. The team workflow is available from the **Team mode** link in the grading app when `TEAM_MODE=1`.
