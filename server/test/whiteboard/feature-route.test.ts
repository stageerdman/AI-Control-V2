/* Tasks that touch the Features list: a features-only task waits with the orchestrator (the one with the feature
   tools), whoever was named; a mixed task stays with its owner, its brief linked to the features it names. */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { getChatMessages } from '../../src/db/chats.ts';
import { featuresRepo } from '../../src/db/features.ts';
import { workRepo } from '../../src/db/work.ts';
import type { FakeStep } from '../../src/runtime/fake.ts';
import type { RunSpec } from '../../src/runtime/runner.ts';
import { featuresNamed, linkedBrief } from '../../src/whiteboard/feature-route.ts';
import { scriptedCrew } from '../crew/brain.ts';
import { testApp } from '../helpers.ts';

const DARK = { id: 'f-dark-mode', name: 'Dark mode' };
const SYNC = { id: 'f-sync', name: 'Cloud sync' };

describe('the features a task names', () => {
  it('finds them by id or by name, as whole words, in any case', () => {
    expect(featuresNamed('Ship f-sync and polish dark MODE', [DARK, SYNC])).toEqual([DARK, SYNC]);
    expect(featuresNamed('f-sync-v2 and darkmode', [DARK, SYNC])).toEqual([]);
  });

  it('links a builder’s brief once, and leaves the orchestrator’s alone', () => {
    const t = { text: 'Build cloud sync', brief: 'Wire the sync API.' };
    const linked = linkedBrief(t, [DARK, SYNC], false);
    expect(linked).toBe(
      'Wire the sync API.\n\nFeatures this task names — update them with your `feature` tool by id: f-sync (“Cloud sync”).',
    );
    expect(linkedBrief({ ...t, brief: linked }, [DARK, SYNC], false)).toBe(linked);
    expect(linkedBrief(t, [DARK, SYNC], true)).toBe(t.brief);
    expect(linkedBrief({ text: 'Fix login', brief: 'x' }, [DARK, SYNC], false)).toBe('x');
  });
});

describe('the director plans tasks that touch the Features list', () => {
  let h: ReturnType<typeof testApp>;
  afterEach(() => h.close());

  it('keeps a features-only task with the orchestrator and links a mixed one to its features', async () => {
    const turns: FakeStep[][] = [];
    const isChat = (s: RunSpec) => s.task.startsWith('Studio summary right now: ');
    const crew = scriptedCrew({}, (s) =>
      isChat(s) ? [...(turns.shift() ?? []), { result: '{"reply":"Done."}' }] : [{ wait: 10_000 }],
    );
    h = testApp({ seed: true, runner: crew.runner });
    mkdirSync(join(h.config.sandbox, 'aurora'));
    h.store.projects.update('aurora', { folder: 'aurora' });
    const sync = featuresRepo(h.db).create('aurora', { name: 'Cloud sync' });
    const turn = async (...calls: { tool: string; args: Record<string, unknown> }[]) => {
      turns.push(calls);
      const r = await h.call('POST', '/projects/aurora/threads/a-pixel/messages', { text: 'plan' });
      await h.runtime.settled(r.body.runId);
      return getChatMessages(h.db, r.body.runId).find((m) => m.role === 'assistant')?.text ?? '';
    };

    const said = await turn({
      tool: 'add_goal',
      args: {
        text: 'Tidy the roadmap',
        tasks: [
          { text: 'Shelve Cloud sync on the Features list', owner: 'Baron', featuresOnly: true },
          {
            text: 'Build the upload retry',
            owner: 'Baron',
            brief: 'Retry failed uploads, then move Cloud sync to 80%.',
            parallel: true,
          },
        ],
      },
    });

    expect(said).toContain('only edit(s) the Features list, so it waits with you');
    const [only, mixed] = workRepo(h.db).goals('aurora')[0]?.items ?? [];
    expect(only).toMatchObject({ agentId: 'a-pixel', teamId: null, brief: only?.text });
    expect(mixed?.agentId).toBe('a-baron');
    expect(mixed?.brief).toContain(`update them with your \`feature\` tool by id: ${sync.id} (“Cloud sync”)`);

    /* handed on to a builder later, it gains the link too */
    await turn({ tool: 'edit_task', args: { task: only?.id, owner: 'Baron' } });
    expect(workRepo(h.db).item(only?.id ?? '')?.brief).toContain(`by id: ${sync.id}`);
  });
});
