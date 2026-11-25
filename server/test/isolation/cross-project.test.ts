/* REPRO — agents remember other projects' work (updates/2026-11-25 PROJECT ISOLATION - OPEN).
   The user tapped an agent in project B and it told them about a feature request from project A.

   Each test below states what MUST hold and is marked `it.fails`: it passes while the bug is there, so the
   suite stays green. The phase that fixes a root cause flips its test to a plain `it` (and, for the recap and
   chat list, points it at the project-scoped route the app will call). */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { contractOf } from '../../src/crew/structured.ts';
import { createRunning } from '../../src/running/registry.ts';
import { runningTools } from '../../src/running/tools.ts';
import { runEnv } from '../../src/runtime/env.ts';
import { fakeRunner } from '../../src/runtime/fake.ts';
import { testApp } from '../helpers.ts';

/* a-query sits on both Aurora and Atlas (seed): the same Cast agent, two projects */
const AGENT = 'a-query';
const FEATURE_A = 'Review the feature request: voice search for Aurora checkout';

function studio() {
  const recapAsked: string[] = [];
  const runner = fakeRunner((spec) => {
    if (contractOf(spec.task)?.name === 'agent-recap') {
      recapAsked.push(spec.task);
      return [{ result: '{"recap":"I reviewed the voice search request."}' }];
    }
    return [{ text: 'Reading the request.' }, { result: 'Reviewed: voice search is ready to build.' }];
  });
  const h = testApp({ seed: true, longPollMs: 50, runner });
  for (const p of ['aurora', 'atlas']) {
    mkdirSync(join(h.config.sandbox, p));
    h.store.projects.update(p, { folder: p });
  }
  return { ...h, recapAsked };
}

describe('an agent in project B never sees project A', () => {
  let h: ReturnType<typeof studio>;
  afterEach(() => h?.close());

  /* the work happens in Aurora (project A) */
  async function workInAurora() {
    const r = await h.call('POST', '/projects/aurora/runs', { agentId: AGENT, task: FEATURE_A });
    expect(r.status).toBe(201);
    await h.runtime.settled(r.body.id as string);
    return r.body.id as string;
  }

  /* Root cause 1 — routes/recap.ts:16 + db/chats.ts:119: the recap picks the agent's newest chat in ANY
     project. The Atlas office taps the agent (OfficePage.tsx clickActor → RecapSheet → GET /agents/:id/recap). */
  it.fails('tapping the agent in Atlas recaps nothing from Aurora', async () => {
    h = studio();
    await workInAurora();
    const r = await h.call('GET', `/agents/${AGENT}/recap`); // what the Atlas office calls today
    expect(r.status).toBe(200);
    expect(r.body.chat?.projectId ?? 'atlas').toBe('atlas');
    expect(JSON.stringify(r.body)).not.toContain('voice search');
    expect(h.recapAsked).toHaveLength(0); // no model call spent on another project's chat
  });

  /* Root cause 2 — routes/chats.ts:59 + db/chats.ts:104: the chat history in the Atlas office lists every
     project's chats; "Open chat" then keeps writing into Aurora's chat (and "Start it" puts a goal on
     Aurora's board) from Atlas. */
  it.fails("the Atlas office's chat history lists no Aurora chat", async () => {
    h = studio();
    await workInAurora();
    const r = await h.call('GET', `/agents/${AGENT}/chats`); // what the Atlas office calls today
    expect(r.status).toBe(200);
    expect((r.body as { projectId: string }[]).map((c) => c.projectId)).not.toContain('aurora');
  });

  /* Root cause 3 — running/tools.ts:14 + registry.ts:89: my_runs (and cancel_run) filter by agent only, so a
     session in Atlas lists — and can stop — the agent's session in Aurora, task line included. */
  it.fails('my_runs in Atlas shows nothing running in Aurora, and cancel_run cannot reach it', async () => {
    const running = createRunning({ procs: () => [] });
    let stopped = false;
    const there = running.add({
      kind: 'session',
      projectId: 'aurora',
      agentId: AGENT,
      label: FEATURE_A,
      cancel: () => {
        stopped = true;
      },
    });
    running.add({
      kind: 'session',
      projectId: 'atlas',
      agentId: AGENT,
      label: 'Chat',
      runId: 'r-atlas',
      cancel: () => {},
    });
    const caller = { projectId: 'atlas', agentId: AGENT, runId: 'r-atlas' };
    const [myRuns, cancelRun] = runningTools(running, caller, (id) => id);
    const listed = await myRuns?.run({});
    expect(listed).not.toContain('voice search');
    await expect(cancelRun?.run({ id: there.id }) ?? Promise.resolve()).rejects.toThrow();
    expect(stopped).toBe(false);
  });

  /* Root cause 4 — runtime/env.ts:31: Claude Code's own auto memory (~/.claude/projects/<folder>/memory/
     MEMORY.md) stays on for every run. It is keyed by folder, not by (project, agent): every crew call (recap,
     chat reply, room calls without a folder) shares the one scratch folder (crew/structured.ts:126), and it is a
     second, hidden memory the studio neither scopes nor shows — and it costs context on every session. */
  it.fails("every run starts with Claude Code's auto memory off", () => {
    expect(runEnv({ HOME: '/home/u' }, {}).CLAUDE_CODE_DISABLE_AUTO_MEMORY).toBe('1');
  });
});
