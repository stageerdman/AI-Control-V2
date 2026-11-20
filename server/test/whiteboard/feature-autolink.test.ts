/* A new task is linked by itself to the existing features its text or brief names (clear names only); the goal's
   hand-set feature stays as it was, and the builder's `feature` tool picks the linked one when none is named. */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { featuresRepo } from '../../src/db/features.ts';
import { type ChecklistItem, workRepo } from '../../src/db/work.ts';
import { agentFeatureTool } from '../../src/office/agent-feature-tool.ts';
import { createFeatures } from '../../src/office/features.ts';
import type { FakeStep } from '../../src/runtime/fake.ts';
import type { RunSpec } from '../../src/runtime/runner.ts';
import { scriptedCrew } from '../crew/brain.ts';
import { testApp } from '../helpers.ts';

describe('tasks linked to the features they name', () => {
  let h: ReturnType<typeof testApp>;
  afterEach(() => h.close());

  /** Aurora with four features; the director adds both goals in one chat turn. */
  async function plan() {
    const turns: FakeStep[][] = [];
    const isChat = (s: RunSpec) => s.task.startsWith('Studio summary right now: ');
    const crew = scriptedCrew({}, (s) =>
      isChat(s) ? [...(turns.shift() ?? []), { result: '{"reply":"Done."}' }] : [{ wait: 10_000 }],
    );
    h = testApp({ seed: true, runner: crew.runner });
    mkdirSync(join(h.config.sandbox, 'aurora'));
    h.store.projects.update('aurora', { folder: 'aurora' });
    const repo = featuresRepo(h.db);
    const [dark, sync, search] = ['Dark mode', 'Cloud sync', 'Search'].map((name) =>
      repo.create('aurora', { name }),
    );
    repo.create('aurora', { name: 'UI' });
    turns.push([
      {
        tool: 'add_goal',
        args: {
          text: 'Sync and polish',
          tasks: [
            { text: 'Build cloud sync', owner: 'Baron', brief: 'Then add its toggle to Dark mode.' },
            { text: 'Fix the login typo in the UI', owner: 'Baron' },
          ],
        },
      },
      {
        tool: 'add_goal',
        args: {
          text: 'Search results',
          feature: search?.id,
          tasks: [{ text: 'Show Cloud sync status next to results', owner: 'Baron' }],
        },
      },
    ]);
    const r = await h.call('POST', '/projects/aurora/threads/a-pixel/messages', { text: 'plan' });
    await h.runtime.settled(r.body.runId);
    const goal = (text: string) =>
      workRepo(h.db)
        .goals('aurora')
        .find((g) => g.text === text);
    return { dark, sync, search, goal };
  }

  /** The builder's `feature` tool, as if this item's run called it with `args`. */
  const toolFor = async (item: ChecklistItem | undefined, args: Record<string, unknown>) => {
    const work = workRepo(h.db);
    const runId = `r-${item?.id}`;
    work.setItem(item?.id ?? '', { status: 'todo', runId });
    const features = createFeatures({ db: h.db, store: h.store, events: h.events });
    return agentFeatureTool({ features, work }, { projectId: 'aurora', runId }).run(args);
  };

  it('links a task that names one or two features to them on creation', async () => {
    const s = await plan();
    const [both] = s.goal('Sync and polish')?.items ?? [];
    expect(both?.featureIds).toEqual([s.dark?.id, s.sync?.id]);
    const [one] = s.goal('Search results')?.items ?? [];
    expect(one?.featureIds).toEqual([s.sync?.id]);
  });

  it('links nothing when a task names no feature (a too-short name does not count)', async () => {
    const s = await plan();
    const [, none] = s.goal('Sync and polish')?.items ?? [];
    expect(none?.featureIds).toEqual([]);
    expect(await toolFor(none, {}).catch((e: Error) => e.message)).toContain('not linked to a feature');
  });

  it('keeps the goal’s hand-set feature, which the tool still picks first', async () => {
    const s = await plan();
    const g = s.goal('Search results');
    expect(g?.featureId).toBe(s.search?.id);
    expect(await toolFor(g?.items[0], {})).toContain(`${s.search?.id} — Search`);
  });

  it('the tool reads the one feature a task names, and asks which when it names several', async () => {
    const s = await plan();
    const [both] = s.goal('Sync and polish')?.items ?? [];
    expect(await toolFor(both, {}).catch((e: Error) => e.message)).toContain('linked to several features');
    expect(await toolFor(both, { feature: s.sync?.id })).toContain('Cloud sync');
  });
});
