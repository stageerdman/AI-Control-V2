/* REPRO — agents remember other projects' work (updates/2026-11-25 PROJECT ISOLATION - OPEN).
   The user tapped an agent in project B and it told them about a feature request from project A.
   Each test states what MUST hold; each root cause below is fixed, so they are plain `it`s now. */
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

  /* Root cause 1: the recap picked the agent's newest chat in ANY project. */
  it('tapping the agent in Atlas recaps nothing from Aurora', async () => {
    h = studio();
    await workInAurora();
    const r = await h.call('GET', `/projects/atlas/agents/${AGENT}/recap`);
    expect(r.status).toBe(200);
    expect(r.body.chat).toBeNull();
    expect(JSON.stringify(r.body)).not.toContain('voice search');
    expect(h.recapAsked).toHaveLength(0); // no model call spent on another project's chat
  });

  it('tapping the agent in Aurora still recaps its Aurora work', async () => {
    h = studio();
    const runId = await workInAurora();
    const r = await h.call('GET', `/projects/aurora/agents/${AGENT}/recap`);
    expect(r.status).toBe(200);
    expect(r.body.chat?.runId).toBe(runId);
  });

  /* Root cause 2: the chat history listed every project's chats, and "Open chat" / "Start it" wrote into them. */
  it("the Atlas office's chat history lists no Aurora chat, and cannot open one", async () => {
    h = studio();
    const runId = await workInAurora();
    const list = await h.call('GET', `/projects/atlas/agents/${AGENT}/chats`);
    expect(list.status).toBe(200);
    expect(list.body).toEqual([]);
    expect((await h.call('GET', `/projects/atlas/chats/${runId}/messages`)).status).toBe(404);
    expect((await h.call('POST', `/projects/atlas/chats/${runId}/messages`, { text: 'hi' })).status).toBe(
      404,
    );
    expect((await h.call('POST', `/projects/atlas/chats/${runId}/start`, { seq: 1 })).status).toBe(404);
    const own = await h.call('GET', `/projects/aurora/agents/${AGENT}/chats`);
    expect((own.body as { runId: string }[]).map((c) => c.runId)).toContain(runId);
  });

  /* Root cause 3: my_runs and cancel_run filtered by agent only. */
  it('my_runs in Atlas shows nothing running in Aurora, and cancel_run cannot reach it', async () => {
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
    const [myRuns, cancelRun] = runningTools(running, {
      projectId: 'atlas',
      agentId: AGENT,
      runId: 'r-atlas',
    });
    expect(await myRuns?.run({})).not.toContain('voice search');
    await expect(cancelRun?.run({ id: there.id }) ?? Promise.resolve()).rejects.toThrow();
    expect(stopped).toBe(false);
  });

  /* Root cause 4: Claude Code's own auto memory is keyed by folder, a hidden memory the studio cannot scope. */
  it("every run starts with Claude Code's auto memory off", () => {
    expect(runEnv({ HOME: '/home/u' }, {}).CLAUDE_CODE_DISABLE_AUTO_MEMORY).toBe('1');
  });
});
