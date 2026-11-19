/* Agents get new features created: an agent proposes one (`propose_feature`), it waits for the director in the
   summary and the `features` tool, and the director approves it (it lands in Features) or declines it. The
   director can also add one straight from an agent's request (`add_feature`). */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { getChatMessages } from '../../src/db/chats.ts';
import type { Feature } from '../../src/db/features.ts';
import type { FakeStep } from '../../src/runtime/fake.ts';
import type { RunSpec } from '../../src/runtime/runner.ts';
import { scriptedCrew } from '../crew/brain.ts';
import { testApp } from '../helpers.ts';

const isDirector = (s: RunSpec) => s.task.startsWith('Studio summary right now: ');
type Call = { tool: string; args: Record<string, unknown> };

describe('agents get new features created', () => {
  let h: ReturnType<typeof testApp>;
  afterEach(() => h.close());

  function studio() {
    const turns: FakeStep[][] = [];
    const tasks: string[] = [];
    const prompts: string[] = [];
    const crew = scriptedCrew({}, (s) => {
      tasks.push(s.task);
      prompts.push(s.systemPrompt ?? '');
      const steps = turns.shift() ?? [];
      return [...steps, { result: isDirector(s) ? '{"reply":"Done."}' : 'Done.' }];
    });
    h = testApp({ seed: true, runner: crew.runner });
    mkdirSync(join(h.config.sandbox, 'aurora'));
    h.store.projects.update('aurora', { folder: 'aurora' });
    /** One chat turn with `agent`, running these tool calls → what each tool answered. */
    const turn = async (agent: string, ...calls: Call[]) => {
      turns.push(calls);
      const r = await h.call('POST', `/projects/aurora/threads/${agent}/messages`, { text: 'go' });
      await h.runtime.settled(r.body.runId);
      return getChatMessages(h.db, r.body.runId)
        .filter((m) => m.role === 'assistant')
        .map((m) => m.text)
        .slice(0, calls.length);
    };
    const list = async () => (await h.call('GET', '/projects/aurora/features')).body as Feature[];
    return { turn, list, tasks, prompts };
  }

  const offline = {
    tool: 'propose_feature',
    args: { name: 'Offline mode', description: 'Works without a network.', status: 'now', pct: 80 },
  };

  it('a proposal waits for the director, who approves it into Features (owner: the proposer)', async () => {
    const { turn, list, tasks } = studio();
    const [said] = await turn('a-semic', offline);
    expect(said).toContain('Proposed “Offline mode” (fp-offline-mode)');
    expect(await list()).toEqual([]);

    const [seen, approved] = await turn(
      'a-pixel',
      { tool: 'features', args: {} },
      { tool: 'approve_feature', args: { proposal: 'fp-offline-mode' } },
    );
    expect(tasks.at(-1)).toContain('"featureProposals":[{"id":"fp-offline-mode","name":"Offline mode"');
    expect(seen).toContain('Proposed by agents, waiting for you:');
    expect(seen).toContain(
      'fp-offline-mode — Offline mode [now, 80%, by Captain Semicolon]: Works without a network.',
    );
    expect(approved).toContain(
      'Approved, now on the features list: f-offline-mode — Offline mode [now #1, 80%',
    );
    expect(await list()).toMatchObject([
      {
        id: 'f-offline-mode',
        status: 'now',
        pct: 80,
        owner: 'a-semic',
        description: 'Works without a network.',
      },
    ]);
    const changed = h.events.after('project', 'aurora').filter((e) => e.type === 'feature.changed');
    expect(changed).toHaveLength(1);

    // decided: it leaves the waiting list, and a second approve is refused
    const [again] = await turn('a-pixel', { tool: 'approve_feature', args: { proposal: 'fp-offline-mode' } });
    expect(again).toMatch(/approve_feature refused: .*fp-offline-mode/);
    expect(tasks.at(-1)).toContain('"featureProposals":[]');
  });

  it('the director can change it on approval, or decline it (nothing reaches Features)', async () => {
    const { turn, list } = studio();
    await turn('a-semic', offline, { tool: 'propose_feature', args: { name: 'Themes' } });
    await turn(
      'a-pixel',
      { tool: 'approve_feature', args: { proposal: 'fp-offline-mode', status: 'planned', owner: 'Pixel' } },
      { tool: 'decline_feature', args: { proposal: 'fp-themes' } },
    );
    expect(await list()).toMatchObject([{ name: 'Offline mode', status: 'planned', owner: 'a-pixel' }]);
    const [seen] = await turn('a-pixel', { tool: 'features', args: {} });
    expect(seen).not.toContain('Proposed by agents');
  });

  it('an agent cannot propose a closed feature or a nameless one', async () => {
    const { turn } = studio();
    const [shipped, nameless] = await turn(
      'a-semic',
      { tool: 'propose_feature', args: { name: 'X', status: 'shipped' } },
      { tool: 'propose_feature', args: { name: '  ' } },
    );
    expect(shipped).toContain('"status" is one of: now, planned.');
    expect(nameless).toContain('"name" is required.');
  });

  it('the director creates one straight from an agent’s request, and knows both ways', async () => {
    const { turn, list, prompts } = studio();
    await turn('a-pixel', {
      tool: 'add_feature',
      args: { name: 'Personal feeds and contacts', status: 'planned', pct: 0, owner: 'Captain Semicolon' },
    });
    expect(await list()).toMatchObject([
      { name: 'Personal feeds and contacts', status: 'planned', owner: 'a-semic' },
    ]);
    expect(prompts[0]).toContain('`approve_feature`');
    expect(prompts[0]).toContain('add it with `add_feature`');
  });
});
