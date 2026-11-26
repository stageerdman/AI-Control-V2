# Copy Full Report — v1

Feature: f-copy-full-report.

## Goal
One click on an open report puts the whole report on the clipboard as Markdown (title, question,
summary, body, sources), with a brief "Copied" confirmation. Works in the Mac app.

## Phases
1. **Report → Markdown** — a pure `reportMarkdown(report)` in `features/reports/model.ts`.
   Test: title, question, summary, full body and sources all land in order. ⏳
2. **Copy button** — a shared `copyText()` (`ui/clipboard.ts`: the Clipboard API, falling back to
   a hidden textarea + `execCommand('copy')` for webviews that refuse it) and a "Copy" button in the
   report's footer that toasts "Copied" (or an honest error). Test: clicking Copy writes the full
   Markdown and shows "Copied". ⏳
3. **Ship** — app + server tests green, pushed; the Mac app rebuilds when this lands on master. ⏳

## Status
Started.
