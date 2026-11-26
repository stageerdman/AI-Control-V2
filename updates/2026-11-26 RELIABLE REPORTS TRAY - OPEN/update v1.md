# Reliable Reports Tray — v1

Feature: f-reliable-reports-tray.

## Goal
A filed report always shows in its project's Reports tray, and the tray's unread count always
matches what the studio counts as unread.

## What we found (26 Nov 2026)
- Elon's report "How AI Studio works: big picture and full technical details" is stored right:
  project `ai-studio` (HQ), not archived, unread. The live server's `GET /projects/ai-studio/reports`
  lists it first and counts it unread. The `report.filed` event (id 131525) is in HQ's log.
- So the server is fine. The app was showing a stale cached list.
- Root cause: on entering an office the app marks every cached office read stale
  (`invalidate('office:<pid>:')`) and resumes the event stream from *now* (`lastEventId`), so events
  from while the user was away are never replayed. The reports list is cached under
  `reports:<pid>`, outside that prefix, so it was never refreshed: a report filed while the user was
  in another project or screen stayed missing (and uncounted on the tray) until the app restarted.

## Phases
1. **Refresh the tray on entry** — the office marks its reports list stale on entry, like every
   other office read. Test: a list cached before leaving is re-read on return and shows the new
   report. ✅
2. **Ship** — app tests + server tests green, pushed, Mac app rebuilt so the user sees the report. ✅

## Status
Done.
