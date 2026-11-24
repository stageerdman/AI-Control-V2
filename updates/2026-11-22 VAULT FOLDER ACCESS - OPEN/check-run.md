# Live grant + check run: Presentation Builders

**Blocked (2026-11-24):** waits until the server branch (`studio/roadmap-server-folder-grants-in-the-vaul-7f40162b`)
and the Vault UI branch (`studio/vault-ui-add-a-folder-pick-global-or-thi-d8cd95a6`) are on master, the studio
has rebuilt, and `GET /accesses` returns `folderMode` and `localTo`. No live change has been made yet.

## Steps

1. `node "updates/2026-11-22 VAULT FOLDER ACCESS - OPEN/live-grant.mjs"` — adds `/Users/stage/dev` and
   `/Users/stage/Downloads` to Presentation Builders only, read only, switched on. It refuses an old studio and
   keeps a grant that already exists. Expect Presentation Builders to list both as `read on`, Pensieve neither.
2. Check run, an agent on **Presentation Builders** (fresh session, so it starts with the new folders):
   - lists and reads a file in `/Users/stage/dev` and in `/Users/stage/Downloads` → works;
   - `Write` tool, `touch`, `mkdir`, `echo > file` in each folder → all denied;
   - `Read` and `cat` of a `.env` inside `/Users/stage/dev` → refused.
3. Check run, an agent on **another project** (e.g. Pensieve): `ls` and `Read` in both folders → refused, and its
   Vault doesn't list them.
4. Fill in the Status section of `update v3.md` with what each step showed; set the feature's pct and line.
