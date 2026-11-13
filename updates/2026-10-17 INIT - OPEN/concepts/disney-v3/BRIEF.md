# Disney v3 — refinement brief

Source: `user-feedback-v3.md` (verbatim). Base: `../disney-v2/` (BRIEF, SYNTHESIS,
specs, prototype). v3 keeps everything in v2 that isn't named below
(Projects, Access, Blueprint, data, Disney soul, palette, a11y, masked secrets,
project-held access, one-press voice). Deliverable stays a **local single-file
HTML** (no external resources, never an Artifact).

## A. Cast → Agents (tidy roster + "hero select")
1. **Tidy roster.** Show only **character + name + role**. No loglines/prompts on
   the roster; details live behind a click.
2. **No white card boxes.** Characters stand directly on the scene (the dark
   twilight stage), like a game character-select lineup — not cards on a panel.
3. **Characters, not blobs.** Agents should read as **game characters**: more
   personality and silhouette than the v2 gumdrop. Their **look reflects their
   role** (gear/outfit/prop/aura changes with role; changing role visibly changes
   them).
4. **Hero zoom.** Clicking an agent **zooms into them** like a game hero screen;
   **details on the right** (name, role, look, system prompt, stats). Edit there.

## B. Cast → Teams (groups + hero zoom + captain + emblems)
1. **Team = a group of its characters**, standing together, with the team
   **emblem, name, and a short description**. Teams are **stacked one under
   another** with generous space.
2. **Hover highlight** per team (stage light / glow).
3. **Click → zoom into the team** like a game squad screen; **details on the
   right**. In there: click a member to **adjust their role/team instructions**,
   **add/remove members**, **choose the captain**.
4. **Custom emblems, not emoji.** Each team gets an original SVG emblem —
   crest/insignia style that **evokes** Star Trek / Star Wars / Disney adventure
   films (starship chevrons, rebel-style starbirds, castle crests, compass roses,
   lantern sigils…). **Original designs only — homage, never copies of real
   logos/trademarks.**

## C. Project workspace → "The Office" (the hard part — try hard)
Replace the chat-first workspace with a **living, playful office scene** (one
theme now: an office; themes later). Layout: **office scene left/center, chat
side panel right.**
1. **Characters in the office** at desks/spots: you can tell at a glance who is
   **working** (typing, scribbling, carrying paperwork), who is **chilling/
   sleeping** (zzz, feet up, coffee), who is **talking to whom** (agents
   communicating — speech bubbles, walking to each other, passing papers),
   which **team** each belongs to.
2. **Click a working agent** → they tell you a short summary of what they're
   doing now + **tokens they've spent in this project**. **Click a sleeping
   agent** → they just chill (a playful idle response; nothing required).
3. **Click the main guy (Director/orchestrator)** → chat with him in the side
   panel (this is the main chat; one-press voice lives here).
4. **Click any agent → chat with that agent** in the side panel; the agent
   **turns to look at you** (faces the viewer) while you chat.
5. **Needs-input = "!" above the agent's head.** Click → chat with them to answer.
   (Replaces/augments the v2 hand-raise → green room flow.)
6. **Whiteboard** in the office. Click → **zooms in**: current progress + the
   **checklist** of what's being worked on now, **team token total**, and **who
   did how much work** (contribution comparison).
7. **Clipped paperwork on the whiteboard.** Click → the **feature dossier**: all
   features **shipped** and **planned**. Click a feature → its **description and
   vision**, **editable** (remove lines, write new ones).
8. Animations: sleeping, working on different tasks, communicating — grounded in
   what real AI agents do (reading files, writing code, running tests, waiting on
   input, handing off to another agent, reviewing).

The v2 workspace's other essentials stay reachable but calm: GitHub/private
chips, test URL, project access grants, checkup ratings (can live on the
whiteboard or a wall poster), overall progress.
