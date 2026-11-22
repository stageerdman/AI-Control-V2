/* AGENTS PUSH: every agent's run on every project carries the studio-wide GitHub working principles,
   whatever its toolset — and the orchestrator is told them too, so no brief waits on a push approval. */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { orchestratorChatPrompt } from '../../src/office/threads.ts';
import { composePrompt } from '../../src/runtime/compose.ts';
import { fakeRunner } from '../../src/runtime/fake.ts';
import { GITHUB_PRINCIPLES_SECTION } from '../../src/runtime/github-principles.ts';
import type { RunSpec } from '../../src/runtime/runner.ts';
import { testApp } from '../helpers.ts';

const agent = { name: 'Ada', role: 'Backend', prompt: 'You build services.' };
const project = { name: 'P' };

describe('GitHub working principles', () => {
  it('name each rule the user set', () => {
    for (const rule of [
      'Commit small',
      'Run the tests before you push',
      'resolve any conflicts yourself',
      'Never force push or rewrite shared history',
      'Never commit secrets or `.env` files',
      "Push only to this project's own `origin`",
      'Push, rebuild and deploy yourself',
      'Nobody approves a push',
    ])
      expect(GITHUB_PRINCIPLES_SECTION).toContain(rule);
  });

  it('are in the prompt for every toolset: full shell, restricted git, no git, no shell', () => {
    const variants = [
      composePrompt({ agent, project }),
      composePrompt({ agent, project, shell: ['git', 'ls'], settingsPrefix: false }),
      composePrompt({ agent, project, shell: ['ls', 'cat'], edit: 'none' }),
      composePrompt({ agent, project, shell: [] }),
    ];
    for (const p of variants) expect(p).toContain(GITHUB_PRINCIPLES_SECTION);
  });

  it('tell only a hooked run that it may push; a restricted one hears its push is refused', () => {
    expect(composePrompt({ agent, project })).toContain("You may `git push` to this project's `origin`");
    const restricted = composePrompt({ agent, project, shell: ['git'], settingsPrefix: false });
    expect(restricted).not.toContain('You may `git push`');
    expect(restricted).toContain("Your toolset can't `git push`");
  });

  it('reach the orchestrator, who briefs agents to push themselves', () => {
    const p = orchestratorChatPrompt({ name: 'Pixel', role: 'Orchestrator', prompt: 'You lead.' }, 'P');
    expect(p).toContain(GITHUB_PRINCIPLES_SECTION);
    expect(p).toContain('never to wait for a push approval');
  });
});

describe('every agent run on a project', () => {
  let h: ReturnType<typeof testApp>;
  afterEach(() => h.close());

  it('carries the principles in its system prompt', async () => {
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
    for (const s of seen) expect(s.systemPrompt).toContain(GITHUB_PRINCIPLES_SECTION);
  });
});
