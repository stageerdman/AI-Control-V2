/* READY TO TEST: every agent's run on every project carries the "always ready to test" rule, next to the
   GitHub working principles, whatever its toolset — and the orchestrator hears it too. */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { orchestratorChatPrompt } from '../../src/office/threads.ts';
import { composePrompt } from '../../src/runtime/compose.ts';
import { fakeRunner } from '../../src/runtime/fake.ts';
import { GITHUB_PRINCIPLES_SECTION } from '../../src/runtime/github-principles.ts';
import { READY_TO_TEST_SECTION } from '../../src/runtime/ready-to-test.ts';
import type { RunSpec } from '../../src/runtime/runner.ts';
import { testApp } from '../helpers.ts';

const agent = { name: 'Ada', role: 'Backend', prompt: 'You build services.' };
const project = { name: 'P' };

describe('always ready to test', () => {
  it('names each part of the rule', () => {
    for (const part of [
      'Set up a build or a running website early',
      'Start button always opens the newest app or site',
      'Never ask the user to run commands, install things or set anything up',
      'After a change, make sure Start still works',
    ])
      expect(READY_TO_TEST_SECTION).toContain(part);
  });

  it('sits right after the GitHub principles for every toolset', () => {
    const variants = [
      composePrompt({ agent, project }),
      composePrompt({ agent, project, shell: ['git', 'ls'], settingsPrefix: false }),
      composePrompt({ agent, project, shell: ['ls', 'cat'], edit: 'none' }),
      composePrompt({ agent, project, shell: [] }),
    ];
    for (const p of variants) expect(p).toContain(`${GITHUB_PRINCIPLES_SECTION}\n\n${READY_TO_TEST_SECTION}`);
  });

  it('reaches the orchestrator', () => {
    const p = orchestratorChatPrompt({ name: 'Pixel', role: 'Orchestrator', prompt: 'You lead.' }, 'P');
    expect(p).toContain(READY_TO_TEST_SECTION);
  });
});

describe('every agent run on a project', () => {
  let h: ReturnType<typeof testApp>;
  afterEach(() => h.close());

  it('carries the rule in its system prompt', async () => {
    const seen: RunSpec[] = [];
    h = testApp({
      seed: true,
      runner: fakeRunner((s) => {
        seen.push(s);
        return [{ result: 'ok' }];
      }),
    });
    mkdirSync(join(h.config.sandbox, 'aurora'));
    h.store.projects.update('aurora', { folder: 'aurora' });
    const agents = h.store.agents.list();
    expect(agents.length).toBeGreaterThan(1);
    for (const a of agents) {
      const r = await h.call('POST', '/projects/aurora/runs', { agentId: a.id, task: 'build' });
      expect(r.status).toBe(201);
      await h.runtime.settled(r.body.id);
    }
    expect(seen).toHaveLength(agents.length);
    for (const s of seen) expect(s.systemPrompt).toContain(READY_TO_TEST_SECTION);
  });
});
