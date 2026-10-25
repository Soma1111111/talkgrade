# TalkGrade demo video script (~3 minutes)

**Setup before recording (do not show on camera):**
- Open https://talkgrade.vercel.app and run **Load sample** once so submissions are preloaded.
- Have Wispr Flow running with your hotkey ready, and the TalkGrade tab focused.
- Open the app fresh (reload) so the demo starts clean but with samples loaded.
- Optional: keep the Gemini engine badge visible (top bar) — it proves AI mode is on.
- Do one dry run of each step first so nothing surprises you on tape.

---

## 1. Hook — the problem (0:00–0:20)

**Say:** "Grading sixty programming submissions is slow and uneven. By submission fifty you're stricter than you were at submission five, and writing feedback for every student is the slowest part. But TAs already think out loud while reading code. TalkGrade turns that spoken thinking into scores and feedback."

**Show:** TalkGrade homepage with the sample class loaded. Slowly scroll the student list so viewers see real submissions with code tabs.

---

## 2. The core flow — dictate with Wispr Flow (0:20–1:00)

**Say:** "Here's the whole trick. I open a submission, hold my Wispr Flow hotkey, and just talk."

**Do:**
1. Click a sample student (e.g. **Bhavna**).
2. Click into **Your spoken notes** box.
3. Hold the Flow hotkey and say: *"Correct output, but there are no tests, deduct two. Nested loops, that's quadratic, minus one. Style is clean, full marks."*
4. Press **Ctrl+Enter**.

**Say:** "Ctrl-Enter scores it. Every clause became a rubric criterion: deductions where I mentioned problems, full marks where I stayed silent — and silent criteria are marked *assumed*, so the checker still knows I didn't actually look at them."

**Show:** Point at the scores that appeared, the drafted feedback text, and one *assumed* badge.

---

## 3. Voice commands (1:00–1:20)

**Say:** "I don't even need the keyboard to move around."

**Do:**
1. Click the **voice command** box.
2. Say: *"next student"* — press Enter. (The app jumps to the next submission.)
3. Say: *"set testing to 2"* — press Enter. (That criterion updates instantly.)

**Say:** "Numbers work the way you speak them — 'minus two', 'half a point off', 'three out of five'."

---

## 4. Consistency check — the killer feature (1:20–1:50)

**Say:** "Now the part no other grading tool does. After a whole batch, TalkGrade re-reads my marking and finds where I drifted."

**Do:**
1. Click **Score all samples** (top of list). Wait a few seconds while the batch runs.
2. Scroll to the **Consistency check** panel.

**Say:** "It flags things like the student with no tests who still got full testing marks, or two near-identical solutions graded differently. Each flag links straight to the submission, so I can fix it in one click — before students complain."

**Show:** Read one real flag out loud, click through to that student.

---

## 5. Feedback + insights (1:50–2:20)

**Say:** "Feedback is already drafted per student, written the way I'd say it, not robot-speak."

**Do:**
1. Open **Class insights** (nav or Ctrl+K → "go to insights").
2. Show the aggregate charts: where the class struggled, common issues.

**Say:** "And the class-level digest tells me what to review in the next lecture — generated from all my notes across every submission."

---

## 6. Import/export + rubrics (2:20–2:40)

**Say:** "It fits a real course: import submissions from files, folders, or ZIPs..."

**Do:** Hover/click **Import submissions** (don't complete a real import — just show the dialog), then **Rubric library**.

**Say:** "...assign a rubric from the library or import one from JSON, CSV, even a DOCX or XLSX file. Scores export as CSV, and feedback exports ready to send."

**Do:** Click **Export CSV** to show it works.

---

## 7. Close (2:40–3:00)

**Say:** "TalkGrade: dictate your grading with Wispr Flow, get rubric scores and student-ready feedback instantly, and catch your own inconsistencies before students do. No install, runs in the browser, with an offline rules engine or Gemini AI. Try it at talkgrade.vercel.app."

**Show:** The homepage again, then the URL. End.

---

## Cut / trim checklist for editing
- Batch scoring wait (speed up 4x or cut).
- Any miscue in voice commands — retry immediately, keep talking; edit later.
- Keep the *assumed* badge moment and one consistency flag — those are the "wow" beats.
