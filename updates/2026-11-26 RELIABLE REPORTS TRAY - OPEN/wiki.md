# Reliable Reports Tray — wiki

- **An office resumes its stream from now.** Whatever changed while the user was away never arrives as
  an event, so every cached read an office shows must be marked stale on entry. Keys outside
  `office:<pid>:` (like `reports:<pid>`) are easy to miss: `refreshOfficeReads(pid)` in
  `app/src/features/office/api.ts` is the one place that lists them. A new office read under its own
  key prefix goes there.
- **Check the server before the app.** `GET /projects/<pid>/reports` on the live server (port 4319)
  answers "is the row right?" in one call; if the server lists it, the bug is a stale app cache.
- The tray list and the tray's unread count come from the same query (`reportsKey(pid)`), so they can
  only disagree with the *server* (stale cache), never with each other.
