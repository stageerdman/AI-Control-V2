/* An agent whose work has no linked feature can still use its `feature` tool: list the features, find one by
   (part of) its name to get the id, then read and update it by that id. */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { getChatMessages } from '../../src/db/chats.ts';
import type { Feature } from '../../src/db/features.ts';
import type { FakeStep } from '../../src/runtime/fake.ts';
import { scriptedCrew } from '../crew/brain.ts';
import { testApp } from '../helpers.ts';

type Call = { tool: string; args: Record<string, unknown> };

describe('the feature tool without a linked feature', () => {
  let h: ReturnType<typeof testApp>;
  afterEach(() => h.close());

  /** Aurora with three features; `ask` runs feature-tool calls in a plain chat with Semic (no whiteboard item). */
  async function studio() {
    const turns: FakeStep[][] = [];
    const crew = scriptedCrew({}, () => [...(turns.shift() ?? []), { result: 'Done.' }]);
    h = testApp({ seed: true, runner: crew.runner });
    mkdirSync(join(h.config.sandbox, 'aurora'));
    h.store.projects.update('aurora', { folder: 'aurora' });
    const add = async (name: string) =>
      (await h.call('POST', '/projects/aurora/features', { name })).body as Feature;
    const dark = await add('Dark mode');
    const darkV2 = await add('Dark mode v2');
    const search = await add('Search');
    const ask = async (...args: Record<string, unknown>[]) => {
      turns.push(args.map((a): Call => ({ tool: 'feature', args: a })));
      const r = await h.call('POST', '/projects/aurora/threads/a-semic/messages', { text: 'go' });
      await h.runtime.settled(r.body.runId);
      return getChatMessages(h.db, r.body.runId)
        .filter((m) => m.role === 'assistant')
        .map((m) => m.text)
        .slice(0, args.length);
    };
    return { ask, dark, darkV2, search };
  }

  it('lists every feature with its id, name and status', async () => {
    const s = await studio();
    const [said] = await s.ask({ list: true });
    expect(said).toBe(
      [
        `${s.dark.id} — Dark mode [planned]`,
        `${s.darkV2.id} — Dark mode v2 [planned]`,
        `${s.search.id} — Search [planned]`,
      ].join('\n'),
    );
  });

  it('finds one by its exact name or part of it, in any case', async () => {
    const s = await studio();
    const [exact, partial] = await s.ask({ find: 'dark MODE' }, { find: 'sea' });
    expect(exact).toBe(`One feature matches “dark MODE”:\n${s.dark.id} — Dark mode [planned]`);
    expect(partial).toBe(`One feature matches “sea”:\n${s.search.id} — Search [planned]`);
  });

  it('returns every match when several fit, and says so plainly when none do', async () => {
    const s = await studio();
    const [several, none] = await s.ask({ find: 'dark' }, { find: 'billing' });
    expect(several).toBe(
      `2 features match “dark”:\n${s.dark.id} — Dark mode [planned]\n${s.darkV2.id} — Dark mode v2 [planned]`,
    );
    expect(none).toBe('No feature matches “billing”.');
  });

  it('with no linked feature, points to find / list, then updates the feature by the id it found', async () => {
    const s = await studio();
    const [unlinked, , updated] = await s.ask(
      { pct: 30 },
      { find: 'search' },
      { feature: s.search.id, pct: 30, status: 'now', line: 'Search box in the header.' },
    );
    expect(unlinked).toContain('look one up with "find"');
    expect(updated).toContain('Feature updated:');
    const f = (await h.call('GET', `/projects/aurora/features/${s.search.id}`)).body as Feature;
    expect(f).toMatchObject({ status: 'now', pct: 30, description: 'Search box in the header.' });
  });

  it('a lookup never changes anything', async () => {
    const s = await studio();
    const [said] = await s.ask({ find: 'search', pct: 50 });
    expect(said).toContain('"list" and "find" only look');
    const f = (await h.call('GET', `/projects/aurora/features/${s.search.id}`)).body as Feature;
    expect(f.pct).toBeNull();
  });
});
