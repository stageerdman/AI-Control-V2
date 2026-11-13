# PROGRESS — U3 Cast ✅ (FakeRunner only)

Spec = prototype `concepts/disney-v3/src/js/cast.js`, `teams.js`, `css/cast.css` + `user-feedback-v5.md`, `v6.md`,
the team-prompt rules, `spec-reports.md` §4 (Files reports). Code: `app/src/features/cast/` (commits `4c60a43`,
`3233fd9` server `at` for undo, then F1a below). Shots: `shots/u3-*.png` vs `concepts/disney-v3/shots/v5a-*.png`,
`tm-*.png`, `t7-*.png`.

## Built
- **Agents** (`#cast`, `#cast/agent/:id|new|new-orchestrator`): lineup (crew rows first, balanced rows, inward
  facing, hover spotlight, search + "Recruit “x”"), hero zoom with camera push, in-game look arrows + dice (saved),
  ‹ › / `[ ]` stepping, Esc back with focus return. Panel: name (a new recruit is created on its first valid name),
  role, brain, teams, "Used in N projects · each project runs its own copy — no shared memory.", Saved ✓ pip.
- **Roles**: pick-or-type combobox (matches + `Create “x”`, Enter = highlighted / exact / create, empty + Enter
  clears). **Edit roles**: rename (shows on every agent at once — server stores by id), delete + Undo, usage count,
  and the **Files reports** switch per role.
- **System crew**: setter + creator never deletable (server's reason shown), orchestrators down to one
  ("At least one orchestrator must exist…"), **+ Another orchestrator** → `#cast/agent/new-orchestrator`.
- **Teams** (`#cast/teams`, `#cast/teams/:id|new`): roll call, squad zoom (faint giant emblem like v5a), add-member
  strip, member panel (job on this team, make captain, remove + Undo back at the old place with the job), emblem
  picker (18), blurb, colour, **What this team does**, **How this team codes**, **Files reports** switch, crew list,
  max 7 with 6th/7th in a back row ("Crew full · 7/7"), new-team draft (born on its first member, who becomes
  captain), delete + Undo.
- Auto-save everywhere (optimistic cache + per-record queue, debounced typing, calm error toast + resync).

## F1a (this pass)
- Committed the pending CSS fix (squad emblem stays at .08 opacity, matching v5a-squad).
- Tests: `model.test.ts` (rules: order, labels, used-in, look wrap + hat decal, least-used hue, role normalise /
  options / Enter choice, lineup rows, facing, 7-max formation back row, add/remove/captain/candidates, new-team
  defaults) + `components.test.tsx` (RoleCombo create/pick/clear/Esc, Edit roles switches/rename/taken/delete,
  TeamPanel Files reports + both prompts). App: 180 tests (27 new); typecheck + biome clean.
- Headless Chrome against a fresh fake-runner server (temp `AI_STUDIO_HOME`/sandbox/control, :4383, Vite :1443
  proxy) — 4 flows, every check PASS, verified against the API and after reloads:
  - agents: hover, camera push, hat/colour arrows saved + persist after reload, dice, brain, `]` step, Esc + focus.
  - roles: create “Sound Design” + assign, pick “front” → Frontend, Design → Files reports on (saved), rename,
    delete + Undo; new agent from ghost (exactly one created, full name, focus kept), brain, delete + Undo.
  - crew: used-in line, + Another orchestrator creates a 3rd, delete down to one → reason + no delete, creator
    reason; rename Frontend → Interface shows on the open agent and on both agents in the lineup; reporter
    switches correct after reload (Research seed on), The Expedition's team switch on after reload.
  - teams: strip add, job, make captain (armband, front & centre), remove captain → passes on, Undo back at index
    with job, 18 emblems + save, both prompts, colour, Files reports on, fill to 7 → back row, delete + Undo, new
    team draft stays a draft until its first member → captain + hash.
- Shots (new or refreshed): `u3-roles`, `u3-role-create`, `u3-team-reports`, `u3-squad-7`, `u3-orchestrator`,
  `u3-new-orchestrator`, `u3-last-orchestrator`, `u3-setter`, `u3-new-agent`, `u3-delete-undo`, `u3-hero-arrows`,
  `u3-lineup-hover`, `u3-teams-hover`, `u3-strip`, `u3-member-captain`, `u3-emblem-picker`, `u3-new-team`.
  Compared with v5a-roles / v5a-orchestrator / v5a-setter / v5a-squad / v5a-squad-picker / t7-squad: same layout;
  additions are the spec'd reporter column/section.

## Notes / gaps
- Deleting an orchestrator that runs projects is allowed by the server (projects move to the remaining one —
  Pixel went 7 → 9); the UI just shows the server's `canDelete`.
- The `Create “x”` option echoes the raw typed text; the created name is normalised (spaces collapsed).
- Test harness: headless Chrome was SIGTERM'd mid-run by something outside this task (parallel builders' cleanup);
  running a renamed copy of the cached `chrome-headless-shell` avoided it.
- No server changes in F1a.
