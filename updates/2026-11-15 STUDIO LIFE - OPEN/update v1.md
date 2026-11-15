# STUDIO LIFE — v1

**Goal:** agents that manage their own memory, follow their team's principles, talk across projects, and leave a
full record; users who bring agents in themselves and design new ones in a chat with Tinker.

## Phases
- [ ] **L1 Comms log** — one append-only record of all agent-to-agent communication (calls, approvals, answers,
  handoffs, reviews, splits, mail, desk notes); `GET /comms` (+ `?format=jsonl`); `comms_log` tool for agents.
- [ ] **L2 Willing forget** — `forget {where, doing, next}` tool: a desk note, then the SAME run restarts with a clean
  session and the note as its brief (dispatch never notices). The studio nudges (PostToolUse hook) when a run's
  context passes a threshold. Desk notes: `GET /projects/:id/desk-notes`; event `desk.note`; office: paper on the desk.
- [ ] **L3 Team principles** — `principles/<team-slug>/` in the project repo; captains keep it, members read it first
  and propose changes to the captain; solo specialists read all. `GET /projects/:id/principles[/…]`; office: binder.
- [ ] **L4 Bring someone in** — user adds a Cast agent to a project as a guest with a brief + `orchestratorMay`
  (default locked); they join the room and start on the brief; the director plans with them only if allowed.
- [ ] **L5 Mailbox + HQ** — `send_mail {to, subject, body, kind: mail|ticket|idea}` + `mail_directory`; per-agent
  `canMail` (default on); HQ = the project marked `hq` in settings; on office open the director triages new mail
  (contract `mail-triage`: board → a goal / discuss → a thread line / file).
- [ ] **L6 New agent with Tinker** — Cast "New agent": Manual or Design with Tinker (persistent chat, live preview,
  web research, "Add to Cast").
- [ ] **L7 Office + Cast UI** for L2–L6 (UX specs: `spec-ux-office.md`, `spec-ux-tinker.md`).
- [ ] **L8 Verify** — free runner in the real app, a short real-AI pass, adopt AI-Control-V2 as HQ, rebuild + install.

## Status
- 2026-11-15: roadmap; UX specs commissioned.
