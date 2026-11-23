/* Report-in: a finished step is reported to the director, who decides what the user hears — a chat line, a page on
   the pager (until they visit the office), or nothing (kept). */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { mergedLine } from '../../src/office/report-in.ts';
import { scriptedCrew } from '../crew/brain.ts';
import { testApp } from '../helpers.ts';

describe('mergedLine (Always Merged)', () => {
  it('a landed step says it is merged and that branch or review talk is out of date', () => {
    const line = mergedLine({ mergedCommit: 'abc1234def5678' });
    expect(line).toContain('It is merged into main (commit abc1234).');
    expect(line).toMatch(/branches, pushing or waiting for review or a merge is out of date/);
  });
  it('nothing landed: no line', () => {
    expect(mergedLine({ mergedCommit: null })).toBe('');
  });
});

describe('report-in', () => {
  let h: ReturnType<typeof testApp>;
  afterEach(() => h.close());

  it('each step reports to the director; it chats, pages or keeps; the pager clears on a visit', async () => {
    const crew = scriptedCrew({
      dispatch: [
        {
          summary: 'Three steps.',
          items: [
            { text: 'Sketch it', assignee: 'a-baron', brief: 'b' },
            { text: 'Build it', assignee: 'a-query', brief: 'b' },
            { text: 'Ship it', assignee: 'a-merge', brief: 'b' },
          ],
        },
      ],
      'report-in': [
        { tell: 'keep', say: 'Sketch done, Query is on it.' },
        { tell: 'chat', say: 'Query built it; Merge ships next.' },
        { tell: 'page', say: 'It shipped — have a look.' },
      ],
    });
    h = testApp({ seed: true, runner: crew.runner });
    mkdirSync(join(h.config.sandbox, 'aurora'));
    h.store.projects.update('aurora', { folder: 'aurora' });
    const g = (await h.call('POST', '/projects/aurora/work', { goal: 'Make the thing' })).body;
    const pages = async () =>
      ((await h.call('GET', '/asks')).body as { id: string; news?: boolean; question: string }[]).filter(
        (a) => a.news,
      );
    for (let i = 0; i < 400 && !(await pages()).length; i++) await new Promise((r) => setTimeout(r, 5));

    // each owner told the director (the office walks it over)
    const delivers = h.events
      .after('project', 'aurora')
      .filter((e) => e.type === 'handoff')
      .map((e) => e.payload as { kind: string; from: string; to: string });
    expect(delivers.map((d) => [d.kind, d.from, d.to])).toEqual([
      ['deliver', 'a-baron', 'a-pixel'],
      ['deliver', 'a-query', 'a-pixel'],
      ['deliver', 'a-merge', 'a-pixel'],
    ]);
    // the director knew what finished and what starts next
    const first = crew.crewCalls().find((c) => c.task.includes('contract: report-in'));
    expect(first?.task).toContain('"Sketch it" is done');
    expect(first?.task).toContain('Working now / up next (briefed automatically): ["Build it (Querious)"]');

    // keep → nothing in the chat; chat + page → a line each (with the goal)
    const t = (await h.call('GET', '/projects/aurora/threads/a-pixel/messages')).body.messages as {
      text: string;
      goalId: string;
    }[];
    const lines = t.map((m) => m.text);
    expect(lines).not.toContain('Sketch done, Query is on it.');
    expect(lines.slice(-2)).toEqual(['Query built it; Merge ships next.', 'It shipped — have a look.']);
    expect(t.at(-1)?.goalId).toBe(g.id);

    // page → on the pager, from the director, until the office is visited
    expect(await pages()).toEqual([
      expect.objectContaining({
        projectId: 'aurora',
        agentId: 'a-pixel',
        question: 'It shipped — have a look.',
      }),
    ]);
    await h.call('POST', '/asks/seen', { projectId: 'aurora' });
    expect(await pages()).toEqual([]);
  });
});
