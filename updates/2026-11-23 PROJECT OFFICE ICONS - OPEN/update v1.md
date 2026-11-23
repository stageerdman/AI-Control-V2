# Project Office Icons — v1

## Goal
Each project's office shows its own app icon. The user (or Pixel) can upload an image, pick the app's own
icon file from the project folder, or clear it back to the colour tile.

## What already worked on master (checked 2026-11-23)
- **Server, done.** Upload (PNG/JPEG/WebP/GIF/SVG; ICNS unwrapped to its largest PNG) — `PUT /projects/:id/image`.
  Link a file inside the project folder — `PUT /projects/:id/image/source {path}` (outside refused, copy kept in
  the data dir, refreshed when the file changes). Clear — `DELETE /projects/:id/image`. `project.imageUrl` and
  `project.imageSource` (`<relative path>` | `'upload'` | null). Tests: `server/test/office/office-icon.test.ts`.
- **Pixel's `office_icon` tool, done** (`server/src/office/icon-tool.ts`): set, read, clear.
- **Shown in the app, mostly done.** The framed portrait in the office (theme.ts `portraitInner`), the Projects
  cards and list (`LogoTile`), the mail sheet. **Not yet:** the Pager rows, the Ports board, the Blueprint list.
- **Change it in the app, half done.** Clicking the portrait opens "Picture and name" (`PortraitSheet.tsx`):
  upload a picture and reset to the tile worked. **Missing:** picking the app's own icon file.
- Landed on master while this step ran (1c3e2a1): an upload the browser can't name (an `.icns` as octet-stream)
  is read by its bytes; the app API's `linkImage` and `Project.imageSource`. This step builds on it.
- An unfinished side branch (`studio/show-the-project-icon-on-the-office-and-0e5968d0`, commit 7b414c3) held the
  icon finder and the missing views; it was never merged.

## What this step adds
1. **Finder** (`server/src/office/icon-finder.ts`): a bounded, read-only walk of the project folder (skips
   dependency, build and hidden folders); ranks `.icns` and `.appiconset` first, then app icons, favicons, logos;
   up to 8. `GET /projects/:id/image/candidates` → `{paths}`; `GET /projects/:id/image/preview?path=` → the file
   as it would show (same in-folder checks as a link; nothing saved).
2. **The sheet** gains one row, "From the app": thumbnails of the found files. One click uses one (a link, so it
   follows the file); the one in use is marked. No row when nothing is found; a file that can't be shown drops out.
   Upload and "Reset to the tile" stay as they were.
3. **Every tile shows it:** Pager rows, Ports board and Blueprint list now use the picture too.

## Design notes (Jony)
- The user's goal is "make the office look like my app". The fastest path is no upload at all: the studio finds the
  app's icon and offers it as a single click. Upload stays for anything else.
- Deleted: a separate "choose a file path" field (the found list covers it; Pixel's tool covers odd paths), a
  confirm step (the change is instant and reversible with "Reset to the tile").
- Accessibility: each thumbnail is a 48 px button named "Use <path>", `aria-pressed` on the one in use, visible
  focus ring; results are read out through the sheet's status line.

## Status
- [x] Checked master and wrote this down.
- [x] Finder + candidates/preview routes; server tests (office-icon.test.ts, 10 pass).
- [x] "From the app" row in the sheet; tests (`app/src/features/office/portrait-sheet.test.tsx`: pick, marked,
  reset, empty folder, broken file).
- [x] Pager, Ports, Blueprint show the picture.
- [x] Live check on a scratch server (fake runner): found `src-tauri/icons/icon.png` and `public/favicon.svg`,
  previews served, a path outside the folder refused (422), linked → `imageUrl` on `/projects`, cleared → null.
- [x] App suite 741 pass, typecheck clean, web build ok. Server suite 1166 pass; one load flake in
  `test/crew/worktrees-flow.test.ts` ("a conflict goes back to the builder…") that passes on its own — not touched
  by this work.
- [ ] Merged into master (the studio merges the branch once the item is accepted).
