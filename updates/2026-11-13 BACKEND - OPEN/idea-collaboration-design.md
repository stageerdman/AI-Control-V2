# Idea — orchestrators design the collaboration (user, 2026-11-13, verbatim)

> Hey, I'm thinking that orchestrators should also design how the communication works and who does talk to whom. For example, it can design that that orchestrator will always only talk with the let's say team leaders, for example, or that designers or architects should give their work to the user tester so that they get this his opinion or to some quality manager so that they control or check whether the call whether the quality of the code is good enough or modularized enough. Also, some agents, for example, should create and have their own tools for code quality. And maybe they can access some folders that are shared for these kind of agents, and when they are added to the team, they will create their own folder when where they will create their own tools for that or something like this. So that they know the big picture of what they are building and what they want to go through so they they so that they control that we are on track with that and we keep it simple. Yeah, that that just came out to me as an idea of the communication because I imagine sometimes, for example, some team uh would need to let another AI just dump test the app to see if it can uh find some bug or crash it or something. Or you know, maybe security tests. We don't have that right now, we don't need that right now, but maybe there'll be also like one person needs always to try to give it to a security breaker or to some hacker that will test whether the security is okay or something, you know.

## How it maps onto the backend (proposal — not scheduled yet)
1. **Communication plan** (designed by the orchestrator, part of the project plan): a small graph —
   who reports to whom (e.g. orchestrator ↔ captains only), and **handoff/review gates**
   (designer → user tester; any change → quality manager). Dispatch enforces it: a checklist item
   flows *build → review(s) → done*; handoffs are events (the office's paper/envelope passing).
2. **Agent toolkits**: agents with a toolsmith trait (quality manager, crash tester, later security
   breaker) own a persistent toolkit folder (shared across projects, e.g. `~/.ai-studio/toolkits/<agent>/`)
   plus a per-project working folder; on joining a project they read the big picture (plan, goals,
   CLAUDE.md) and build/refine checks that keep the work on track and simple. Ties into B7 health.
3. **Adversarial reviewers** as optional review stages: crash/monkey tester now-ish, security breaker
   later.

Candidate phase: **B8 — Collaboration design** (after B7, before or alongside the real UI).
