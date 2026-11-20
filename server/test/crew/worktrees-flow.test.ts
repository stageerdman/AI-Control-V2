/* F1b: items run in their own git worktrees (parallel-safe) and merge back when accepted;
   a conflict goes back to the builder (merge-fix), bounded; work is never lost. */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { FakeStep } from '../../src/runtime/fake.ts';
import type { RunSpec } from '../../src/runtime/runner.ts';
import { testApp } from '../helpers.ts';
import { scriptedCrew, worked } from './brain.ts';

const ID = {
  GIT_AUTHOR_NAME: 't',
  GIT_AUTHOR_EMAIL: 't@t',
  GIT_COMMITTER_NAME: 't',
  GIT_COMMITTER_EMAIL: 't@t',
};
const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...ID } }).trim();
const tryGit = (cwd: string, ...args: string[]) => {
  try {
    return git(cwd, ...args);
  } catch {
    return null;
  }
};

const item = (text: string, assignee: string, teamId?: string, parallel = false) => ({
  text,
  assignee,
  ...(teamId ? { teamId } : {}),
  brief: `Do: ${text}`,
  parallel,
});

function studio(plan: object, work: (s: RunSpec) => FakeStep[]) {
  const crew = scriptedCrew({ dispatch: [plan] }, work);
  const h = testApp({ seed: true, runner: crew.runner });
  const repo = join(h.config.sandbox, 'aurora');
  mkdirSync(repo);
  git(repo, 'init', '-q', '-b', 'main');
  git(repo, 'config', 'user.name', 't');
  git(repo, 'config', 'user.email', 't@t');
  writeFileSync(join(repo, 'shared.txt'), 'base\n');
  git(repo, 'add', '.');
  git(repo, 'commit', '-q', '-m', 'init');
  h.store.projects.update('aurora', { folder: 'aurora' });
  return { h, crew, repo };
}
async function settled(h: ReturnType<typeof testApp>, goalId: string) {
  for (let i = 0; i < 600; i++) {
    const g = (await h.call('GET', `/projects/aurora/work/${goalId}`)).body;
    if (g.status !== 'running') {
      await new Promise((r) => setTimeout(r, 30)); // let checkouts be put away
      return (await h.call('GET', `/projects/aurora/work/${goalId}`)).body;
    }
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('goal never settled');
}
const itemText = (s: RunSpec) => /Your checklist item: (.*)/.exec(s.task)?.[1] ?? '';

describe('worktrees: parallel items, merge back, conflicts', () => {
  let h: ReturnType<typeof testApp>;
  afterEach(() => h.close());

  it('independent items run side by side in their own checkouts and both merge into main', async () => {
    let live = 0;
    let peak = 0;
    const cwds: string[] = [];
    const s = studio(
      {
        summary: 's',
        items: [item('Make a.txt', 'a-semic', 'ship-it'), item('Make b.txt', 'a-lint', 'polish', true)],
      },
      (spec) => {
        cwds.push(spec.cwd);
        const file = itemText(spec).includes('a.txt') ? 'a.txt' : 'b.txt';
        writeFileSync(join(spec.cwd, file), `${file}\n`);
        live++;
        peak = Math.max(peak, live);
        return [{ wait: 40 }, { result: `made ${file}` }];
      },
    );
    h = s.h;
    const r = await h.call('POST', '/projects/aurora/work', { goal: 'Two files' });
    expect(s.crew.crewCalls()[0]?.task).toContain('Every item runs in its own checkout');
    const g = await settled(h, r.body.id);
    expect(g.status).toBe('done');
    expect(peak).toBe(2);
    const root = join(h.config.home, 'worktrees');
    expect(cwds.every((c) => c.startsWith(root))).toBe(true);
    expect(new Set(cwds).size).toBe(2);
    expect(git(s.repo, 'ls-files').split('\n').sort()).toEqual(['a.txt', 'b.txt', 'shared.txt']);
    expect(git(s.repo, 'status', '--porcelain')).toBe('');
    expect(git(s.repo, 'branch', '--list', 'studio/*')).toBe(''); // merged → deleted
    expect(readdirSync(join(root, 'aurora'))).toEqual([]); // checkouts removed
    expect(g.items[0].workspace).toMatchObject({
      branch: expect.stringMatching(/^studio\/make-a-txt-/),
      main: 'main',
    });
    const merged = h.events.after('project', 'aurora').filter((e) => e.type === 'item.merged');
    expect(merged).toHaveLength(2);
    // the brief tells the builder about its branch
    const runs = (await h.call('GET', '/projects/aurora/runs')).body as { task: string }[];
    expect(runs[0]?.task).toMatch(/You work in your own checkout on branch studio\//);
  });

  it('a conflict goes back to the builder to merge main in their checkout, then lands', async () => {
    const s = studio(
      {
        summary: 's',
        items: [item('Edit shared A', 'a-semic', 'ship-it'), item('Edit shared B', 'a-lint', 'polish', true)],
      },
      (spec) => {
        if (spec.task.includes("can't merge back yet")) {
          tryGit(spec.cwd, 'merge', 'main'); // conflicts
          writeFileSync(join(spec.cwd, 'shared.txt'), 'A and B\n');
          git(spec.cwd, 'add', 'shared.txt');
          git(spec.cwd, 'commit', '-q', '--no-edit');
          return [{ result: 'Merged main, kept both.' }];
        }
        const who = itemText(spec).endsWith('A') ? 'A' : 'B';
        writeFileSync(join(spec.cwd, 'shared.txt'), `${who}\n`);
        return [{ wait: who === 'A' ? 5 : 40 }, { result: `edited ${who}` }];
      },
    );
    h = s.h;
    const r = await h.call('POST', '/projects/aurora/work', { goal: 'Both edit' });
    const g = await settled(h, r.body.id);
    expect(g.status).toBe('done');
    expect(readFileSync(join(s.repo, 'shared.txt'), 'utf8')).toBe('A and B\n');
    expect(g.items[1]).toMatchObject({ mergeTries: 1, status: 'done' });
    const fix = h.events
      .after('project', 'aurora')
      .find((e) => e.type === 'handoff' && (e.payload as { kind: string }).kind === 'merge-fix');
    expect(fix?.payload).toMatchObject({ kind: 'merge-fix', from: 'a-lint', to: 'a-lint' });
    expect((fix?.payload as { note?: string } | undefined)?.note).toMatch(/conflicts in shared\.txt/);
  });

  it('an unresolved conflict stops after the retries: failed, work kept on its branch, main untouched', async () => {
    const s = studio(
      {
        summary: 's',
        items: [item('Edit shared A', 'a-semic', 'ship-it'), item('Edit shared B', 'a-lint', 'polish', true)],
      },
      (spec) => {
        if (spec.task.includes("can't merge back yet")) return worked('I could not.');
        const who = itemText(spec).endsWith('A') ? 'A' : 'B';
        writeFileSync(join(spec.cwd, 'shared.txt'), `${who}\n`);
        return [{ wait: who === 'A' ? 5 : 40 }, { result: `edited ${who}` }];
      },
    );
    h = s.h;
    const r = await h.call('POST', '/projects/aurora/work', { goal: 'Both edit' });
    const g = await settled(h, r.body.id);
    expect(g.status).toBe('failed');
    expect(g.items[1]).toMatchObject({ status: 'failed', mergeTries: 2 });
    expect(g.items[1].note).toMatch(/conflicts in shared\.txt — work kept on branch studio\/edit-shared-b-/);
    expect(readFileSync(join(s.repo, 'shared.txt'), 'utf8')).toBe('A\n');
    expect(git(s.repo, 'show', `${g.items[1].workspace.branch}:shared.txt`)).toBe('B');
    expect(existsSync(g.items[1].workspace.cwd)).toBe(false);
  });

  it('reviews happen in the builder’s checkout; a failed build keeps its work on the branch', async () => {
    const s = studio(
      {
        summary: 's',
        items: [item('Page', 'a-semic', 'ship-it'), item('Broken', 'a-baron', undefined, true)],
      },
      (spec) => {
        if (spec.task.startsWith('You are reviewing'))
          return [{ result: '{"verdict":"approve","notes":"ok"}' }];
        if (itemText(spec) === 'Broken') {
          writeFileSync(join(spec.cwd, 'half.txt'), 'half\n');
          return [{ fail: 'ran out of turns' }];
        }
        writeFileSync(join(spec.cwd, 'page.html'), 'p\n');
        return [{ result: 'built' }];
      },
    );
    h = s.h;
    h.store.projects.update('aurora', {
      workflows: [
        {
          id: 'usual',
          name: 'Our usual way',
          when: 'everything',
          orchestratorTalksTo: 'captains',
          gates: [{ after: 'ship-it', reviewer: 'a-lint', kind: 'quality', why: 'w' }],
          maxSendBacks: 2,
          summary: 's',
        },
      ],
    });
    const r = await h.call('POST', '/projects/aurora/work', { goal: 'Page' });
    const g = await settled(h, r.body.id);
    const page = g.items[0];
    expect(page.status).toBe('done');
    const review = s.crew.calls.find((c) => c.task.startsWith('You are reviewing'));
    expect(review?.cwd).toBe(page.workspace.cwd);
    expect(review?.task).toContain(`Their work is on branch ${page.workspace.branch}`);
    expect(g.items[1]).toMatchObject({ status: 'failed' });
    expect(g.items[1].note).toMatch(/ran out of turns — work kept on branch/);
    expect(git(s.repo, 'show', `${g.items[1].workspace.branch}:half.txt`)).toBe('half');
    expect(existsSync(join(s.repo, 'page.html'))).toBe(true);
  });

  it('report items in a git project: their checkout is put away too (live-run regression)', async () => {
    const s = studio(
      { summary: 's', items: [{ text: 'Compare hosts', assignee: 'a-prof', brief: 'b', report: true }] },
      () => [
        {
          report: {
            title: 'Hosting compared',
            summary: 'Pages wins.',
            body: '## Answer\n\nPages.',
            kind: 'research',
          },
        },
        { result: 'Filed.' },
      ],
    );
    h = s.h;
    h.store.projects.update('aurora', { agentIds: ['a-prof'] });
    const r = await h.call('POST', '/projects/aurora/work', { goal: 'Research hosting' });
    const g = await settled(h, r.body.id);
    expect(g.items[0]).toMatchObject({ status: 'done', reportId: expect.stringMatching(/^rep_/) });
    expect(git(s.repo, 'worktree', 'list').split('\n')).toHaveLength(1);
    expect(git(s.repo, 'branch', '--list', 'studio/*')).toBe('');
  });

  it('a review that keeps sending it back: failed, checkout put away, work kept on its branch', async () => {
    const s = studio({ summary: 's', items: [item('Page', 'a-semic', 'ship-it')] }, (spec) => {
      if (spec.task.startsWith('You are reviewing'))
        return [{ result: '{"verdict":"changes","notes":"no"}' }];
      writeFileSync(join(spec.cwd, `page-${Math.random()}.html`), 'p\n');
      return [{ result: 'built' }];
    });
    h = s.h;
    h.store.projects.update('aurora', {
      workflows: [
        {
          id: 'usual',
          name: 'Our usual way',
          when: 'everything',
          orchestratorTalksTo: 'captains',
          gates: [{ after: '*', reviewer: 'a-lint', kind: 'quality', why: 'w' }],
          maxSendBacks: 0,
          summary: 's',
        },
      ],
    });
    const r = await h.call('POST', '/projects/aurora/work', { goal: 'Page' });
    const g = await settled(h, r.body.id);
    expect(g.items[0].status).toBe('failed');
    expect(g.items[0].note).toMatch(/it needs you[\s\S]*work kept on branch studio\//);
    expect(existsSync(g.items[0].workspace.cwd)).toBe(false);
  });
});
