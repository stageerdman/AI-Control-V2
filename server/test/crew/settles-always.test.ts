/* STUCK ANSWERS: finished work always closes its task. A step after the run that throws (here: the merge,
   because the item's branch vanished) ends the item failed with the reason — it never stays 'running'. */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { testApp } from '../helpers.ts';
import { scriptedCrew } from './brain.ts';

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 't',
      GIT_AUTHOR_EMAIL: 't@t',
      GIT_COMMITTER_NAME: 't',
      GIT_COMMITTER_EMAIL: 't@t',
    },
  }).trim();

async function settled(h: ReturnType<typeof testApp>, goalId: string) {
  for (let i = 0; i < 300; i++) {
    const g = (await h.call('GET', `/projects/aurora/work/${goalId}`)).body;
    if (g.status !== 'running') return g;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('goal never settled: its item stayed running');
}

describe('finished work always settles its item', () => {
  let h: ReturnType<typeof testApp>;
  afterEach(() => {
    vi.restoreAllMocks();
    return h.close();
  });

  it('a merge that throws fails the item with the reason and settles the goal', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    let repo = '';
    const crew = scriptedCrew(
      { dispatch: [{ summary: 's', items: [{ text: 'Deploy notes', assignee: 'a-baron', brief: 'b' }] }] },
      (spec) => {
        /* while it works, main disappears: the landing's git call throws */
        writeFileSync(join(spec.cwd, 'notes.txt'), 'hi\n');
        git(repo, 'checkout', '-q', '-b', 'other');
        git(repo, 'branch', '-D', 'main');
        return [{ result: 'done' }];
      },
    );
    h = testApp({ seed: true, runner: crew.runner });
    repo = join(h.config.sandbox, 'aurora');
    mkdirSync(repo);
    git(repo, 'init', '-q', '-b', 'main');
    writeFileSync(join(repo, 'README.md'), 'base\n');
    git(repo, 'add', '.');
    git(repo, 'commit', '-q', '-m', 'init');
    h.store.projects.update('aurora', { folder: 'aurora' });

    const r = await h.call('POST', '/projects/aurora/work', { goal: 'Deploy notes' });
    const g = await settled(h, r.body.id);
    expect(g.status).toBe('failed');
    expect(g.items[0].status).toBe('failed');
    expect(g.items[0].note).toMatch(
      /^Couldn't land it on main \(its work is on branch studio\/deploy-notes-.*\): /,
    );
    expect(logged).toHaveBeenCalledWith(
      `[dispatch] couldn't land it on main (its work is on branch ${g.items[0].workspace.branch})`,
      expect.objectContaining({ projectId: 'aurora', itemId: g.items[0].id }),
    );
  });
});
