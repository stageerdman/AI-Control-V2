/* STUDIO LIFE: team principles — captains keep principles/<team>/, members read them first, the office lists and reads them. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { fakeRunner } from '../../src/runtime/fake.ts';
import type { RunSpec } from '../../src/runtime/runner.ts';
import { testApp } from '../helpers.ts';

describe('team principles', () => {
  let h: ReturnType<typeof testApp>;
  afterEach(() => h.close());

  it('the captain keeps them, a member reads them, a specialist reads them all; the office lists and reads them', async () => {
    const specs: RunSpec[] = [];
    h = testApp({ seed: true, runner: fakeRunner((s) => (specs.push(s), [{ result: 'ok' }])) });
    const dir = join(h.config.sandbox, 'aurora');
    mkdirSync(join(dir, 'principles/ship-it-squad'), { recursive: true });
    writeFileSync(
      join(dir, 'principles/ship-it-squad/design.md'),
      '# Design principles\n\n- Calm over clever.\n',
    );
    writeFileSync(join(dir, 'principles/ship-it-squad/notes.exe'), 'nope');
    h.store.projects.update('aurora', { folder: 'aurora' });

    for (const [agentId, teamId] of [
      ['a-semic', 'ship-it'],
      ['a-pete', 'ship-it'],
      ['a-baron', undefined],
    ] as const) {
      const r = (
        await h.call('POST', '/projects/aurora/runs', { agentId, task: 'go', ...(teamId ? { teamId } : {}) })
      ).body;
      await h.runtime.settled(r.id);
    }
    const [captain, member, solo] = specs.map((s) => s.systemPrompt);
    expect(captain).toContain("You keep your team's principles in `principles/ship-it-squad/`");
    expect(member).toContain('read every file in `principles/ship-it-squad/`');
    expect(member).toContain("Don't edit them");
    expect(solo).toContain('read the team principles in `principles/`');

    const list = (await h.call('GET', '/projects/aurora/principles')).body;
    expect(list.teams.map((t: { teamId: string; dir: string }) => [t.teamId, t.dir])).toEqual([
      ['ship-it', 'principles/ship-it-squad'],
      ['polish', 'principles/polish-patrol'],
    ]);
    expect(list.teams[0].files).toEqual([
      { file: 'design.md', title: 'Design principles', updatedAt: expect.any(String) },
    ]);
    expect(list.teams[1].files).toEqual([]);
    const one = await h.call('GET', '/projects/aurora/principles/ship-it/design.md');
    expect(one.body.body).toContain('Calm over clever.');
    expect((await h.call('GET', '/projects/aurora/principles/ship-it/..%2F..%2Fsecret.md')).status).toBe(404);
    expect((await h.call('GET', '/projects/aurora/principles/engine/design.md')).status).toBe(404); // not on the project
  });
});
