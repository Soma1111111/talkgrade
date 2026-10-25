# Rubric formats currently supported

The rubric importer accepts native JSON criterion arrays/objects, CSV, TSV, pipe-delimited Markdown tables, plain text/spoken descriptions, DOCX tables/paragraphs, and XLSX worksheets (the rubric-named sheet is preferred). The preview is editable JSON and is passed through the rubric validator before replacing the active rubric. Duplicate names are merged; missing points default; generated keywords and suggested fact links are shown in the preview.

Example plain text:

```text
# Python assignment
Correctness (5 points): output follows the specification
Testing - 3 points: include edge cases
Readability: 2 marks
```

PDF and PNG/JPEG/WebP images can be sent to the configured Gemini endpoint for extraction. Without `GEMINI_API_KEY`, the importer asks the user to paste the readable rubric text. AI-extracted criteria are marked for review before saving. Spreadsheet formulas are not evaluated; cached values are read from XLSX files. DOCX/XLSX parsing is best-effort for ordinary rubric tables and worksheets.
