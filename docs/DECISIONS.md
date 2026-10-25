# Implementation decisions

- The v2 prompt is much larger than the existing single-page v1 application. This pass keeps the current v1 shell and builds the rubric text/CSV/JSON import path and shared pure logic in place before replacing the application shell.
- Rubric preview is editable JSON in this first iteration so users can correct every detected field without introducing a runtime dependency. It is validated with the unchanged v1 rubric validator before saving.
- PDF and image rubric imports use the configured Gemini API for extraction; without `GEMINI_API_KEY`, the app asks for pasted text or API configuration instead of implying local OCR.
- Imported rubrics replace the active rubric snapshot and clear existing scores only after confirmation, matching v1's rubric-change behavior.
- Guest data is hydrated from IndexedDB stores and mirrored to the existing localStorage key for migration and recovery. Archived records remain selectable with an `(archived)` label so the user can restore them without a separate archive screen. Deleting a course cascades to its assignments after confirmation.
- Assignment due dates use the browser's date input and are stored as `YYYY-MM-DD`; assignment-level consistency values are validated at save and passed to the existing checker.
- Team accounts, shared storage, SQLite, and hosted student links remain optional and are not silently enabled in guest mode.
