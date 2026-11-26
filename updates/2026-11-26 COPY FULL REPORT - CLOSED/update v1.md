# Copy Full Report — v1

Feature: f-copy-full-report.

## Goal
One click on an open report puts the whole report on the clipboard as Markdown (title, question,
summary, body, sources), with a brief "Copied" confirmation. Works in the Mac app.

## Phases
1. **Report → Markdown** — a pure `reportMarkdown(report)` in `features/reports/model.ts`.
   Test: title, question, summary, full body and sources all land in order; missing parts are
   skipped. ✅
2. **Copy button** — a shared `copyText()` (`ui/clipboard.ts`: the Clipboard API, falling back to
   a hidden textarea + `execCommand('copy')` for webviews that refuse it) and a "Copy" button first
   in the report's footer that toasts "Copied" (or "Couldn't copy: …"). Test: clicking Copy writes
   the full Markdown and shows "Copied". ✅
3. **Ship** — app tests 876 green. Server tests: 1313 pass. One fails,
   `runs.test.ts › env isolation`, because the agent shell has variables a normal run doesn't.
   The server wasn't changed. Pushed. The Mac app rebuilds when this lands on master (the backend
   runs `install:mac` after every merge). ✅

## Status
Done. Folder closed.
