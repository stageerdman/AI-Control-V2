# LIVE ACCESS — v1

**Goal:** an access shared from the Safe with a project reaches agents already working there right away — or
they get a clear notice to restart, with their chat and work kept.

## Phases
1. **Research** ✅ — how a running session gets its accesses: env built once at start (`runtime/env.ts` via
   `projectAccess.envFor`) + the "Access you have" prompt section. Spike (`spike-env-file.mts`, real CLI) shows a
   running process can't get new env vars, but a `.env` written mid-run is readable by its next command.
2. **Live path** ✅ — on grant (`projectAccess.setGrants` → `app.ts` notify → `runtime.accessShared`), each live
   non-big-picture run in the project gets the granted values written into its working folder's `.env`
   (`projectAccess.syncDir`, the same managed block as sync) and a note after its next step (`access-notice.ts`).
   The new value joins the run's scrub list (chat, events, stream log).
3. **Restart path** ✅ — when the `.env` can't be written, the note says "Restart your session to use it" via
   `forget`. A fresh session (forget or limit carry-on) now rebuilds its env and system prompt from current grants.
4. **Tests** ✅ — `server/test/runtime/live-access.test.ts`: live, restart (forget → env + prompt have it, same
   run, same chat), no notice on revoke, notice wording. Full suite green.

## Status
Done. Next, if wanted: tell working agents about a revoke, and about a value added later to an access they
already have.
