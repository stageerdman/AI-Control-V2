# Safe grant check — results (2026-11-17)

**Verdict: fixed.** I added a Cloudflare access, granted it in a project's Safe, then reloaded. There was no error, it showed "Granted" with the toast, it was still granted after the reload, and the server had it saved.

## How it was run
- The server from this branch (commit 668acf1) ran on :3569 in a throwaway sandbox (`AI_STUDIO_HOME`, `AI_STUDIO_SANDBOX`,
  `AI_CONTROL_HOME` all under `node_modules/`, so nothing touched the real studio or the real `.env`).
- The app ran from vite on **http://localhost:1420**, the real app origin, with `VITE_API_URL=http://127.0.0.1:3569`.
- A headless Chromium ran with **normal web security** (no `--disable-web-security`, unlike `reload-check/drive.mjs`).
  This matters: the bug was the browser's CORS preflight, so a browser with web security off would have hidden it.
- Script: `drive.mjs` here (`npm i --no-save playwright-core` in this folder first).

## Fixed code: all pass
| Step | Result |
|---|---|
| Add "Cloudflare" in Access (fake test value) | saved, no error (POST /accesses 201) |
| Reload Access | still in the cabinet |
| Open Aurora's Safe | "Not granted" |
| Flip the switch | preflight 204 → PUT /projects/aurora/access/a-cloudflare **200**; toast "🔑 Cloudflare granted to Aurora Storefront"; row "Granted" |
| Reload, reopen the Safe | still "Granted"; server says granted 1 of 1 |
| Failed requests | none |

## Control: old method list (no PUT): reproduces the bug
For one run I took PUT back out of the method list in `server/src/http/cors.ts`, then put it back. The browser said: *"Method PUT is not allowed by
Access-Control-Allow-Methods in preflight response"*. Nothing was saved. The toast now says "The studio server is running but refused
PUT …" instead of the old misleading "Can't reach the studio server". That proves the check catches the real bug.

## Not part of the bug, noted
- The 409s in the console come from the sandbox missing the project folders (`mail/open` etc.), and they're harmless here.
- The live event stream (`/events`) is cut off on every reload (ERR_ABORTED), which is expected.
- The app has no Cloudflare template, so "Cloudflare" was typed in as a custom access.
- Users only get the fix once the branch is merged **and the studio server is restarted**. The server running now on 4319 still has the old code.
