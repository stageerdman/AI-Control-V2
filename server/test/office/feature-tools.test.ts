/* The director changes the features list from its office chat with its features tools — through the same
   service as the UI (so `feature.changed` goes out), and never by putting work on the whiteboard. */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { getChatMessages } from '../../src/db/chats.ts';
import { workRepo } from '../../src/db/work.ts';
import type { FakeStep } from '../../src/runtime/fake.ts';
import type { RunSpec } from '../../src/runtime/runner.ts';
import { scriptedCrew } from '../crew/brain.ts';
import { testApp } from '../helpers.ts';

const isChat = (s: RunSpec) => s.task.startsWith('Studio summary right now: ');
const url = '/projects/aurora/threads/a-pixel/messages';

describe('the director edits the features list', () => {
  let h: ReturnType<typeof testApp>;
  afterEach(() => h.close());

  function studio() {
    const turns: FakeStep[][] = [];
    const prompts: string[] = [];
    const crew = scriptedCrew({}, (s) => {
      if (!isChat(s)) return [{ result: 'Done.' }];
      prompts.push(s.systemPrompt ?? '');
      return [...(turns.shift() ?? []), { result: '{"reply":"Done."}' }];
    });
    h = testApp({ seed: true, runner: crew.runner });
    mkdirSync(join(h.config.sandbox, 'aurora'));
    h.store.projects.update('aurora', { folder: 'aurora' });
    /** One director turn saying `text` and running these tool calls → what each tool answered. */
    const turn = async (text: string, ...calls: { tool: string; args: Record<string, unknown> }[]) => {
      turns.push(calls);
      const r = await h.call('POST', url, { text });
      await h.runtime.settled(r.body.runId);
      return getChatMessages(h.db, r.body.runId)
        .filter((m) => m.role === 'assistant')
        .map((m) => m.text)
        .slice(0, calls.length);
    };
    const list = async () =>
      (await h.call('GET', '/projects/aurora/features')).body as {
        id: string;
        name: string;
        status: string;
        order: number;
        pct: number | null;
        owner: string | null;
      }[];
    return { turn, list, prompts };
  }

  it('"add dark mode to the features list" lands under Planned, live, and nothing goes on the whiteboard', async () => {
    const { turn, list, prompts } = studio();
    const [added] = await turn('add dark mode to the features list', {
      tool: 'add_feature',
      args: { name: 'Dark mode', description: 'A dark theme for the whole app.' },
    });
    expect(added).toMatch(/^Added to the features list: f-dark-mode — Dark mode \[planned #1\]/);
    const [f] = await list();
    expect(f).toMatchObject({ id: 'f-dark-mode', name: 'Dark mode', status: 'planned', order: 1 });
    expect(workRepo(h.db).goals('aurora')).toEqual([]);
    const ev = h.events.after('project', 'aurora').filter((e) => e.type === 'feature.changed');
    expect(ev.map((e) => (e.payload as { featureId: string }).featureId)).toEqual(['f-dark-mode']);
    // the prompt tells it the two lists apart, and no longer offers "the whiteboard as a feature"
    expect(prompts[0]).toContain('`add_feature`');
    expect(prompts[0]).not.toContain('as a feature');
  });

  it('views, edits (move, order, pct, owner by name), refuses bad input and removes', async () => {
    const { turn, list } = studio();
    await turn(
      'plan two features',
      { tool: 'add_feature', args: { name: 'Backups' } },
      { tool: 'add_feature', args: { name: 'Sync' } },
    );
    const [view] = await turn('what features are there?', { tool: 'features', args: {} });
    expect(view).toBe('f-backups — Backups [planned #1]\nf-sync — Sync [planned #2]');

    const [moved, badStatus, nobody] = await turn(
      'we are doing sync now, Baron has it, half done',
      { tool: 'edit_feature', args: { feature: 'f-sync', status: 'now', pct: 50, owner: 'Baron' } },
      { tool: 'edit_feature', args: { feature: 'f-sync', status: 'later' } },
      { tool: 'edit_feature', args: { feature: 'f-sync', owner: 'Zed' } },
    );
    expect(moved).toBe('Feature updated: f-sync — Sync [now #1, 50%, Baron von Backup]');
    expect(badStatus).toMatch(/"status" is one of: now, planned, shipped/);
    expect(nobody).toMatch(/Nobody and no team called 'Zed'/);
    expect((await list()).map((f) => [f.id, f.status, f.order, f.owner])).toEqual([
      ['f-sync', 'now', 1, 'a-baron'],
      ['f-backups', 'planned', 1, null],
    ]);

    const [shipped, removed, gone] = await turn(
      'sync shipped; drop backups',
      { tool: 'edit_feature', args: { feature: 'f-sync', status: 'shipped', pct: 100, owner: '' } },
      { tool: 'remove_feature', args: { feature: 'f-backups' } },
      { tool: 'remove_feature', args: { feature: 'f-backups' } },
    );
    expect(shipped).toBe('Feature updated: f-sync — Sync [shipped #1, 100%]');
    expect(removed).toBe('Removed from the features list: Backups');
    expect(gone).toMatch(/not found/i);
    expect((await list()).map((f) => f.id)).toEqual(['f-sync']);
  });
});
