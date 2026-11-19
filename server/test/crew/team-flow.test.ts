/* F1c: real team work — a captain splits a team item into member sub-tasks, members build in their own
   checkouts off the item's branch, the captain integrates (one bounded rework round), then the item goes
   through the project's gates and merges into main. Plus features following goals. */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { memberGates, parseRework, splitIssues } from '../../src/crew/team.ts';
import { featuresRepo } from '../../src/db/features.ts';
import type { FakeStep } from '../../src/runtime/fake.ts';
import type { RunSpec } from '../../src/runtime/runner.ts';
import { testApp } from '../helpers.ts';
import { type Answer, scriptedCrew } from './brain.ts';

/* Aurora: ship-it (captain a-semic; a-pete, a-scar) + polish (captain a-lint; a-doc, a-twinkle) */
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

const ONE = {
  summary: 'Build the page.',
  items: [{ text: 'Build the search page', assignee: 'a-semic', teamId: 'ship-it', brief: 'A page.' }],
};
const SPLIT = {
  mode: 'team',
  summary: 'Pete does the UI, Scarlett the tests.',
  subtasks: [
    { text: 'Search UI', assignee: 'a-pete', brief: 'ui.txt', parallel: true },
    { text: 'Search tests', assignee: 'a-scar', brief: 'tests.txt', parallel: true },
  ],
};
const GATE = {
  orchestratorTalksTo: 'captains',
  gates: [{ after: 'ship-it', reviewer: 'a-lint', kind: 'quality', why: 'Keep it clean.' }],
  maxSendBacks: 1,
  summary: 'Ship-It builds, Lint checks.',
};

const isIntegrate = (s: RunSpec) => s.task.includes("Your team's parts:");
const isReview = (s: RunSpec) => s.task.startsWith('You are reviewing');
const subtask = (s: RunSpec) => /Your sub-task: (.*)/.exec(s.task)?.[1] ?? '';

function studio(answers: Record<string, Answer[]>, work: (s: RunSpec) => FakeStep[]) {
  const crew = scriptedCrew(answers, work);
  const h = testApp({ seed: true, runner: crew.runner });
  const repo = join(h.config.sandbox, 'aurora');
  mkdirSync(repo);
  git(repo, 'init', '-q', '-b', 'main');
  writeFileSync(join(repo, 'shared.txt'), 'base\n');
  writeFileSync(join(repo, '.project'), 'name: Aurora\n');
  git(repo, 'add', '.');
  git(repo, 'commit', '-q', '-m', 'init');
  h.store.projects.update('aurora', { folder: 'aurora' });
  return { h, crew, repo };
}
async function settled(h: ReturnType<typeof testApp>, goalId: string) {
  for (let i = 0; i < 800; i++) {
    const g = (await h.call('GET', `/projects/aurora/work/${goalId}`)).body;
    if (g.status !== 'running') {
      await new Promise((r) => setTimeout(r, 30)); // let checkouts be put away
      return (await h.call('GET', `/projects/aurora/work/${goalId}`)).body;
    }
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('goal never settled');
}
const types = (h: ReturnType<typeof testApp>, t: string) =>
  h.events
    .after('project', 'aurora')
    .filter((e) => e.type === t)
    .map((e) => e.payload as Record<string, unknown>);

describe('captains delegate (F1c)', () => {
  let h: ReturnType<typeof testApp>;
  afterEach(() => h.close());

  it('split → members build side by side → captain integrates → gate → merged into main', async () => {
    let live = 0;
    let peak = 0;
    const seen: RunSpec[] = [];
    const s = studio({ dispatch: [ONE], 'team-split': [SPLIT] }, (spec) => {
      seen.push(spec);
      if (isReview(spec)) return [{ result: '{"verdict":"approve","notes":"Clean."}' }];
      if (isIntegrate(spec)) {
        writeFileSync(join(spec.cwd, 'page.txt'), 'ui + tests wired\n');
        return [{ result: 'Wired the UI to the tests; all good.' }];
      }
      const file = subtask(spec) === 'Search UI' ? 'ui.txt' : 'tests.txt';
      writeFileSync(join(spec.cwd, file), `${file}\n`);
      live++;
      peak = Math.max(peak, live);
      return [{ wait: 40 }, { result: `made ${file}` }];
    });
    h = s.h;
    await h.call('PUT', '/projects/aurora/collaboration', GATE);
    const r = await h.call('POST', '/projects/aurora/work', { goal: 'Search' });
    const g = await settled(h, r.body.id);

    expect(g.status).toBe('done');
    expect(g.items).toHaveLength(1); // sub-tasks never land on the whiteboard's top level
    const it0 = g.items[0];
    expect(it0).toMatchObject({ teamPhase: null, teamPlan: SPLIT.summary, status: 'done', teamRounds: 0 });
    expect(it0.subtasks.map((x: { agentId: string; status: string }) => [x.agentId, x.status])).toEqual([
      ['a-pete', 'done'],
      ['a-scar', 'done'],
    ]);
    expect(it0.subtasks[0]).toMatchObject({ parentId: it0.id, teamId: 'ship-it' });
    expect(peak).toBe(2); // both members at once

    // time estimates: every run says which item it served, and so does the captain's split
    const ids = [it0.id, ...it0.subtasks.map((x: { id: string }) => x.id)];
    const runItems = h.db.prepare("SELECT item_id FROM runs WHERE project_id = 'aurora'").all();
    expect(runItems.length).toBeGreaterThan(3);
    for (const r of runItems) expect(ids).toContain((r as { item_id: string }).item_id);
    expect(h.db.prepare("SELECT item_id FROM crew_time WHERE agent_id = 'a-semic'").all()).toEqual([
      { item_id: it0.id },
    ]);
    const sheet = (await h.call('GET', '/projects/aurora/timesheet')).body;
    const task = sheet.tasks.find((t: { itemId: string }) => t.itemId === it0.id);
    expect(task.time.runs).toBe(runItems.length + 1); // every run and the split, sub-tasks included
    expect(task.time.endedAt).not.toBeNull();
    expect(task.time.byAgent.map((a: { agentId: string }) => a.agentId).sort()).toEqual(
      ['a-lint', 'a-pete', 'a-scar', 'a-semic'].sort(),
    );
    expect(sheet.goals[0]).toMatchObject({ goalId: r.body.id, status: 'done' });
    expect(sheet.goals[0].time.activeMs).toBe(task.time.activeMs);

    // the split call: the captain's own words, its team and members' jobs, read-only in the item's checkout
    const splitCall = s.crew.crewCalls().find((c) => c.task.startsWith('AI Studio contract: team-split'));
    expect(splitCall?.task).toContain('"whatWeDo"');
    expect(splitCall?.task).toContain('a-pete');
    expect(splitCall?.cwd.startsWith(join(h.config.home, 'worktrees'))).toBe(true);
    expect(splitCall?.tools).not.toContain('Write');

    // members branch off the item's branch, in their own checkouts
    const members = seen.filter((x) => subtask(x));
    expect(new Set(members.map((m) => m.cwd)).size).toBe(2);
    expect(members[0]?.task).toMatch(/from the team's branch studio\/build-the-search-page-/);
    expect(members[0]?.task).toContain('Teammates build the other parts');
    // F3 live: a member sees each teammate's brief (the interfaces they promise), not just its title
    const pete = members.find((m) => subtask(m) === 'Search UI') as RunSpec;
    expect(pete.task).toContain('• Scarlett Scenario: Search tests — brief: tests.txt');
    expect(pete.task).toMatch(/Don't ask the user about a teammate's part/);
    expect(splitCall?.task).toMatch(/exact interface[\s\S]*BOTH briefs/);
    // the captain integrates in the item's checkout, sees both parts, then Lint reviews it there
    const integ = seen.find(isIntegrate) as RunSpec;
    expect(integ.task).toContain('Search UI — Pixel Pete (merged into your branch): made ui.txt');
    expect(integ.task).toContain('"rework"');
    expect(seen.find(isReview)?.cwd).toBe(integ.cwd);
    expect(integ.task).toContain('Lint');

    // main has everything; nothing left behind
    expect(git(s.repo, 'ls-files').split('\n').sort()).toEqual([
      '.project',
      'page.txt',
      'shared.txt',
      'tests.txt',
      'ui.txt',
    ]);
    expect(git(s.repo, 'branch', '--list', 'studio/*')).toBe('');
    expect(readdirSync(join(h.config.home, 'worktrees', 'aurora'))).toEqual([]);

    // the office's story
    const split = types(h, 'team.split');
    expect(split).toEqual([
      expect.objectContaining({
        itemId: it0.id,
        captainId: 'a-semic',
        teamId: 'ship-it',
        mode: 'team',
        round: 0,
      }),
    ]);
    const hand = types(h, 'handoff').map((p) => [p.kind, p.from, p.to]);
    expect(hand).toEqual([
      ['delegate', 'a-semic', 'a-pete'],
      ['delegate', 'a-semic', 'a-scar'],
      expect.arrayContaining(['deliver', 'a-semic']),
      expect.arrayContaining(['deliver', 'a-semic']),
      ['review', 'a-semic', 'a-lint'],
      ['deliver', 'a-semic', 'a-pixel'], // the captain reports in to the director (report-in)
    ]);
    expect(types(h, 'handoff')[0]).toMatchObject({ parentId: it0.id });
    expect(types(h, 'checklist.item').some((p) => p.teamPhase === 'integrate')).toBe(true);
    expect(types(h, 'item.merged')).toHaveLength(1); // only the team item lands on main
  });

  it('a small item: the captain does it alone (mode self), as before', async () => {
    const s = studio(
      { dispatch: [ONE], 'team-split': [{ mode: 'self', summary: 'One file — mine.', subtasks: [] }] },
      (spec) => {
        writeFileSync(join(spec.cwd, 'page.txt'), 'x\n');
        return [{ result: 'Done.' }];
      },
    );
    h = s.h;
    const r = await h.call('POST', '/projects/aurora/work', { goal: 'Tiny' });
    const g = await settled(h, r.body.id);
    expect(g.items[0]).toMatchObject({ status: 'done', subtasks: [], teamPlan: 'One file — mine.' });
    expect(types(h, 'team.split')).toMatchObject([{ mode: 'self', subtasks: [] }]);
    expect(git(s.repo, 'ls-files')).toContain('page.txt');
  });

  it('a split that breaks the rules twice → the captain does it itself (calm, no failure)', async () => {
    const bad = { ...SPLIT, subtasks: [{ text: 'x', assignee: 'a-baron', brief: 'b' }] };
    const s = studio({ dispatch: [ONE], 'team-split': [bad, bad] }, () => [{ result: 'Did it.' }]);
    h = s.h;
    const r = await h.call('POST', '/projects/aurora/work', { goal: 'Search' });
    const g = await settled(h, r.body.id);
    expect(g.items[0]).toMatchObject({ status: 'done', subtasks: [] });
    const repair = s.crew.crewCalls().find((c) => c.task.includes('team-split (repair)'));
    expect(repair?.task).toMatch(/'a-baron' is not a member of your team/);
  });

  it('no checkout (not a git repo) → no split: the captain works in the project folder', async () => {
    const crew = scriptedCrew({ dispatch: [ONE] });
    h = testApp({ seed: true, runner: crew.runner });
    mkdirSync(join(h.config.sandbox, 'aurora'));
    h.store.projects.update('aurora', { folder: 'aurora' });
    const r = await h.call('POST', '/projects/aurora/work', { goal: 'Search' });
    const g = await settled(h, r.body.id);
    expect(g.items[0]).toMatchObject({ status: 'done', subtasks: [], teamPlan: null });
    expect(crew.crewCalls().filter((c) => !c.task.includes('contract: report-in'))).toHaveLength(1);
  });

  it('members touching the same file: the second one fixes the merge in its checkout, then it lands', async () => {
    const s = studio({ dispatch: [ONE], 'team-split': [SPLIT] }, (spec) => {
      if (isIntegrate(spec)) return [{ result: 'Integrated.' }];
      if (spec.task.includes("can't merge back yet")) {
        tryGit(spec.cwd, 'merge', /git merge (\S+)`/.exec(spec.task)?.[1] ?? 'x');
        writeFileSync(join(spec.cwd, 'shared.txt'), 'UI and tests\n');
        git(spec.cwd, 'add', 'shared.txt');
        git(spec.cwd, 'commit', '-q', '--no-edit');
        return [{ result: 'Merged, kept both.' }];
      }
      const ui = subtask(spec) === 'Search UI';
      writeFileSync(join(spec.cwd, 'shared.txt'), ui ? 'UI\n' : 'tests\n');
      return [{ wait: ui ? 5 : 40 }, { result: 'edited' }];
    });
    h = s.h;
    const r = await h.call('POST', '/projects/aurora/work', { goal: 'Search' });
    const g = await settled(h, r.body.id);
    expect(g.status).toBe('done');
    expect(readFileSync(join(s.repo, 'shared.txt'), 'utf8')).toBe('UI and tests\n');
    expect(g.items[0].subtasks[1]).toMatchObject({ mergeTries: 1, status: 'done' });
    expect(types(h, 'handoff').find((p) => p.kind === 'merge-fix')).toMatchObject({
      from: 'a-scar',
      to: 'a-scar',
    });
  });

  it('one rework round: the captain sends a part back, integrates again (no second round offered)', async () => {
    const integrations: RunSpec[] = [];
    const s = studio({ dispatch: [ONE], 'team-split': [SPLIT] }, (spec) => {
      if (isIntegrate(spec)) {
        integrations.push(spec);
        return integrations.length === 1
          ? [
              {
                result:
                  'The tests miss the empty case.\n{"rework":[{"assignee":"a-scar","notes":"Cover the empty search."}]}',
              },
            ]
          : [{ result: 'All wired.\n{"rework":[{"assignee":"a-scar","notes":"again"}]}' }];
      }
      const file = subtask(spec).includes('UI') ? 'ui.txt' : 'tests.txt';
      writeFileSync(join(spec.cwd, file), `${file} ${spec.task.includes('sends it back') ? 'v2' : 'v1'}\n`);
      return [{ result: `made ${file}` }];
    });
    h = s.h;
    const r = await h.call('POST', '/projects/aurora/work', { goal: 'Search' });
    const g = await settled(h, r.body.id);
    expect(g.status).toBe('done');
    expect(integrations).toHaveLength(2);
    expect(integrations[1]?.task).not.toContain('"rework"'); // the round is used up
    expect(integrations[1]?.task).toContain(
      'Rework: Search tests — Scarlett Scenario (merged into your branch)',
    );
    const it0 = g.items[0];
    expect(it0.teamRounds).toBe(1);
    expect(it0.subtasks.map((x: { text: string }) => x.text)).toEqual([
      'Search UI',
      'Search tests',
      'Rework: Search tests',
    ]);
    expect(it0.subtasks[2]).toMatchObject({ agentId: 'a-scar', notes: 'Cover the empty search.' });
    expect(readFileSync(join(s.repo, 'tests.txt'), 'utf8')).toBe('tests.txt v2\n');
    expect(types(h, 'team.split').map((p) => p.round)).toEqual([0, 1]);
    expect(types(h, 'handoff').find((p) => p.kind === 'rework')).toMatchObject({
      from: 'a-semic',
      to: 'a-scar',
      note: 'Cover the empty search.',
    });
  });

  it('a member whose run fails: the captain is told and finishes it; the item still lands', async () => {
    const s = studio({ dispatch: [ONE], 'team-split': [SPLIT] }, (spec) => {
      if (isIntegrate(spec)) return [{ result: 'Did the tests myself.' }];
      if (subtask(spec) === 'Search tests') return [{ fail: 'ran out of turns' }];
      writeFileSync(join(spec.cwd, 'ui.txt'), 'ui\n');
      return [{ result: 'ui' }];
    });
    h = s.h;
    const r = await h.call('POST', '/projects/aurora/work', { goal: 'Search' });
    const g = await settled(h, r.body.id);
    expect(g.status).toBe('done');
    const integ = (await h.call('GET', '/projects/aurora/runs')).body.find((x: { task: string }) =>
      x.task.includes("Your team's parts:"),
    );
    expect(integ.task).toContain('Search tests — Scarlett Scenario did NOT finish (failed)');
  });

  it('cancelling the goal while members build stops their parts, then the team item', async () => {
    let started = 0;
    const s = studio({ dispatch: [ONE], 'team-split': [SPLIT] }, () => {
      started++;
      return [{ wait: 5000 }, { result: 'never' }];
    });
    h = s.h;
    const r = await h.call('POST', '/projects/aurora/work', { goal: 'Search' });
    for (let i = 0; i < 200 && started < 2; i++) await new Promise((x) => setTimeout(x, 10));
    expect((await h.call('POST', `/projects/aurora/work/${r.body.id}/cancel`)).status).toBe(202);
    const g = await settled(h, r.body.id);
    expect(g.status).toBe('cancelled');
    expect(g.items[0].status).toBe('cancelled');
    expect(g.items[0].subtasks.every((x: { status: string }) => x.status === 'cancelled')).toBe(true);
    expect(git(s.repo, 'worktree', 'list').split('\n')).toHaveLength(1);
  });
});

describe('real work follows the drawing (Workflows Phase 7 re-check)', () => {
  let h: ReturnType<typeof testApp>;
  afterEach(() => h.close());
  const PAYMENTS = 'if it touches payments';
  const SELF = { mode: 'self', summary: 'Mine.', subtasks: [] };
  const done = (spec: RunSpec): FakeStep[] =>
    isReview(spec) ? [{ result: '{"verdict":"approve","notes":"ok"}' }] : [{ result: 'done' }];
  const reviewers = (it: { gates: { reviewer: string; kind: string }[] }) =>
    it.gates.map((g) => `${g.reviewer}:${g.kind}`);

  it('a branched sign-off runs only on items the planner says it holds for; a made-up label is repaired', async () => {
    const plan = (pay: string) => ({
      summary: 'Stack, then checkout.',
      items: [
        {
          text: 'Set up the project stack',
          assignee: 'a-semic',
          teamId: 'ship-it',
          brief: 'b',
          branches: [],
        },
        { text: 'Checkout', assignee: 'a-semic', teamId: 'ship-it', brief: 'b', branches: [pay] },
        { text: 'Contact page', assignee: 'a-semic', teamId: 'ship-it', brief: 'b' },
      ],
    });
    const s = studio(
      { dispatch: [plan('payments'), plan(PAYMENTS)], 'team-split': [SELF, SELF, SELF] },
      done,
    );
    h = s.h;
    await h.call('PUT', '/projects/aurora/collaboration', {
      ...GATE,
      gates: [
        {
          after: 'a-semic',
          reviewer: 'a-scar',
          kind: 'crash-test',
          why: 'Payments must not break.',
          when: PAYMENTS,
        },
        GATE.gates[0],
      ],
    });
    const r = await h.call('POST', '/projects/aurora/work', { goal: 'A shop' });
    expect(r.body.items.map(reviewers)).toEqual([
      ['a-lint:quality'],
      ['a-scar:crash-test', 'a-lint:quality'],
      ['a-scar:crash-test', 'a-lint:quality'], // no "branches": every gate holds, as before
    ]);
    const [ask, repair] = s.crew.crewCalls();
    expect(ask?.task).toContain(`"branches":["${PAYMENTS}"]`);
    expect(ask?.task).toMatch(/On every item set "branches"/);
    expect(repair?.task).toMatch(/items\.1\.branches: 'payments' is not a branch/);
    await settled(h, r.body.id);
  });

  it("a team's own way reaches the split and its sign-offs run on the members' parts", async () => {
    const split = {
      ...SPLIT,
      subtasks: [
        { ...SPLIT.subtasks[0], branches: [PAYMENTS] },
        { ...SPLIT.subtasks[1], branches: [] },
      ],
    };
    const seen: RunSpec[] = [];
    const s = studio({ dispatch: [ONE], 'team-split': [split] }, (spec) => {
      seen.push(spec);
      return done(spec);
    });
    h = s.h;
    /* the office says Pixel Pete starts — Pete is on Ship-It, not its captain */
    await h.call('PUT', '/projects/aurora/workflows', {
      workflows: [
        {
          id: 'usual',
          name: 'Usual',
          ...GATE,
          steps: [{ from: 'a-pete', to: 'a-lint', why: 'hands the build over' }],
          first: 'a-pete',
        },
      ],
    });
    const way = {
      name: 'Ship-It way',
      summary: 'Pete builds, Scarlett crash-tests payments, Semic signs.',
      gates: [
        { after: 'a-pete', reviewer: 'a-scar', kind: 'crash-test', why: 'Break it.', when: PAYMENTS },
        { after: 'ship-it', reviewer: 'a-semic', kind: 'review', why: 'The captain signs.' },
      ],
    };
    expect((await h.call('PUT', '/teams/ship-it/workflow', { workflow: way })).status).toBe(200);
    const r = await h.call('POST', '/projects/aurora/work', { goal: 'Search' });
    const g = await settled(h, r.body.id);

    const planner = s.crew.crewCalls()[0]?.task ?? '';
    expect(planner).toMatch(
      /names a team member who is not its captain[^.]*give that team's item to its captain/,
    );
    const splitTask = s.crew
      .crewCalls()
      .find((c) => c.task.startsWith('AI Studio contract: team-split'))?.task;
    expect(splitTask).toContain('How work flows on this goal: Pixel Pete starts.');
    expect(splitTask).toContain("Your team's own way of working");
    expect(splitTask).toMatch(/Scarlett Scenario \(a-scar\) checks Pixel Pete \(a-pete\) \(crash-test\)/);
    expect(splitTask).toMatch(/that member's sub-task comes first/);

    expect(g.status).toBe('done');
    const [pete, scar] = g.items[0].subtasks;
    expect(reviewers(pete)).toEqual(['a-scar:crash-test', 'a-semic:review']);
    expect(reviewers(scar)).toEqual(['a-semic:review']); // no payments; never reviews themself
    const peteTask = seen.find((x) => subtask(x) === 'Search UI')?.task ?? '';
    expect(peteTask).toContain('How work flows on this goal: Pixel Pete starts.');
    expect(peteTask).toMatch(
      /your part goes to Scarlett Scenario \(crash-test\), then .* \(review\) for sign-off/,
    );
    expect(seen.filter(isReview).length).toBeGreaterThanOrEqual(3); // two parts' sign-offs, then Lint's
  });

  it('under the default way a split adds no gates: no review runs', async () => {
    const seen: RunSpec[] = [];
    const s = studio({ dispatch: [ONE], 'team-split': [SPLIT] }, (spec) => {
      seen.push(spec);
      return done(spec);
    });
    h = s.h;
    const g = await settled(h, (await h.call('POST', '/projects/aurora/work', { goal: 'Search' })).body.id);
    expect(g.status).toBe('done');
    expect(g.items[0].subtasks.map(reviewers)).toEqual([[], []]);
    expect(seen.filter(isReview)).toEqual([]);
  });

  it('under a chain the parts run in chain order, one after another, whatever the captain answered', async () => {
    const backwards = { ...SPLIT, subtasks: [...SPLIT.subtasks].reverse() };
    const started: [string, number][] = [];
    const s = studio({ dispatch: [ONE], 'team-split': [backwards] }, (spec) => {
      if (!subtask(spec)) return done(spec);
      started.push([subtask(spec), Date.now()]);
      return [{ wait: 40 }, { result: 'done' }];
    });
    h = s.h;
    expect((await h.call('PATCH', '/teams/ship-it', { wayShape: 'chain' })).status).toBe(200);
    const g = await settled(h, (await h.call('POST', '/projects/aurora/work', { goal: 'Search' })).body.id);
    expect(g.status).toBe('done');
    expect(g.items[0].subtasks.map((x: { agentId: string }) => x.agentId)).toEqual(['a-pete', 'a-scar']);
    expect(started.map(([part]) => part)).toEqual(['Search UI', 'Search tests']);
    const [[, ui], [, tests]] = started as [[string, number], [string, number]];
    expect(tests - ui).toBeGreaterThanOrEqual(40); // the second waits for the first
    expect(g.items[0].subtasks.map((x: { parallel: boolean }) => x.parallel)).toEqual([false, false]);
  });
});

describe('features follow goals (F1c)', () => {
  let h: ReturnType<typeof testApp>;
  afterEach(() => h.close());
  const solo = (feature?: object) => ({
    summary: 'Do it.',
    items: [{ text: 'Do it', assignee: 'a-baron', brief: 'b' }],
    ...(feature ? { feature } : {}),
  });

  it('a new feature goes to Now with its description, follows the goal, and ships when it lands', async () => {
    const s = studio({ dispatch: [solo({ name: 'Search', description: 'Find products fast.' })] }, () => [
      { result: 'done' },
    ]);
    h = s.h;
    const r = await h.call('POST', '/projects/aurora/work', { goal: 'Search' });
    expect(r.body.featureId).toBe('f-search');
    expect(s.crew.crewCalls()[0]?.task).toContain('Features: []');
    // F3 live: a follow-up goal linked the already-shipped feature, so nothing on the features folder moved
    expect(s.crew.crewCalls()[0]?.task).toMatch(
      /A Shipped feature is done: a goal that ADDS something new to it[^.]*gets a NEW feature/,
    );
    const g = await settled(h, r.body.id);
    expect(g).toMatchObject({ status: 'done', featureId: 'f-search', ships: true });
    const f = (await h.call('GET', '/projects/aurora/features/f-search')).body;
    expect(f).toMatchObject({ status: 'shipped', pct: 100, description: 'Find products fast.' });
    expect(types(h, 'feature.shipped')).toEqual([{ featureId: 'f-search', goalId: g.id, name: 'Search' }]);
    const p = (await h.call('GET', '/projects/aurora/office')).body.progress;
    expect(p).toMatchObject({ shipped: 1, total: 1, pct: 100 });
  });

  it('an existing planned feature moves to Now; ships: false keeps it open; unknown ids are repaired', async () => {
    const s = studio(
      {
        dispatch: [solo({ id: 'f-ghost' }), solo({ id: 'f-cart', ships: false })],
      },
      () => [{ result: 'done' }],
    );
    h = s.h;
    await h.call('POST', '/projects/aurora/features', { name: 'Cart', status: 'planned' });
    const r = await h.call('POST', '/projects/aurora/work', { goal: 'First cart step' });
    expect(s.crew.crewCalls()[1]?.task).toMatch(/'f-ghost' is not a feature of this project/);
    const g = await settled(h, r.body.id);
    expect(g).toMatchObject({ status: 'done', featureId: 'f-cart', ships: false });
    expect((await h.call('GET', '/projects/aurora/features/f-cart')).body.status).toBe('now');
    expect(types(h, 'feature.shipped')).toEqual([]);
  });

  it('a shelved feature comes back to Now with a new goal; denied while it runs, it stays denied', async () => {
    let denyNow = () => {};
    const s = studio({ dispatch: [solo({ id: 'f-cart' })] }, () => {
      denyNow();
      return [{ result: 'done' }];
    });
    h = s.h;
    await h.call('POST', '/projects/aurora/features', { name: 'Cart', status: 'shelved' });
    const statusNow: string[] = [];
    denyNow = () => {
      statusNow.push(featuresRepo(h.db).require('aurora', 'f-cart').status);
      featuresRepo(h.db).update('aurora', 'f-cart', { status: 'denied' });
    };
    const r = await h.call('POST', '/projects/aurora/work', { goal: 'Cart again' });
    const g = await settled(h, r.body.id);
    expect(g).toMatchObject({ status: 'done', featureId: 'f-cart' });
    expect(statusNow[0]).toBe('now');
    expect((await h.call('GET', '/projects/aurora/features/f-cart')).body.status).toBe('denied');
    expect(types(h, 'feature.shipped')).toEqual([]);
  });

  it('the orchestrator is told when the project has no code yet (stack first, run line, project rules)', async () => {
    const s = studio({ dispatch: [solo()] }, () => [{ result: 'done' }]);
    h = s.h;
    const r = await h.call('POST', '/projects/aurora/work', { goal: 'Start' });
    await settled(h, r.body.id);
    const task = s.crew.crewCalls()[0]?.task ?? '';
    expect(task).toContain('The project right now: {"hasCode":true,"run":null}'); // shared.txt counts as code
    expect(task).toContain('Nobody has recorded how to start the app yet');
  });

  it('an empty project (only the scaffold): the first item sets up the stack', async () => {
    const s = studio({ dispatch: [solo()] }, () => [{ result: 'done' }]);
    h = s.h;
    git(s.repo, 'rm', '-q', 'shared.txt');
    git(s.repo, 'commit', '-q', '-m', 'empty');
    expect(existsSync(join(s.repo, 'shared.txt'))).toBe(false);
    const r = await h.call('POST', '/projects/aurora/work', { goal: 'Start' });
    await settled(h, r.body.id);
    const task = s.crew.crewCalls()[0]?.task ?? '';
    expect(task).toContain('The project right now: {"hasCode":false,"run":null}');
    expect(task).toContain('the FIRST item sets up the stack');
    expect(task).toContain('Project-specific rules');
  });
});

describe('team rules (pure)', () => {
  const team = { captainId: 'a-semic', members: ['a-semic', 'a-pete', 'a-scar'] };
  const t = (assignee: string) => ({ text: 'x', assignee, brief: 'b' });
  it('splitIssues: members of this team only, one each, not all the captain; self needs nothing', () => {
    expect(splitIssues({ mode: 'self', summary: 's', subtasks: [] }, team)).toEqual([]);
    expect(splitIssues({ mode: 'team', summary: 's', subtasks: [t('a-pete'), t('a-semic')] }, team)).toEqual(
      [],
    );
    expect(splitIssues({ mode: 'team', summary: 's', subtasks: [] }, team)[0]).toMatch(/needs 1–4/);
    expect(splitIssues({ mode: 'team', summary: 's', subtasks: [t('a-lint')] }, team)[0]).toMatch(
      /not a member/,
    );
    expect(
      splitIssues({ mode: 'team', summary: 's', subtasks: [t('a-pete'), t('a-pete')] }, team)[0],
    ).toMatch(/already has a sub-task/);
    expect(splitIssues({ mode: 'team', summary: 's', subtasks: [t('a-semic')] }, team)[0]).toMatch(/"self"/);
  });
  it("memberGates: the team's sign-offs on one part — teammates only, never yourself, branches respected", () => {
    const view = { id: 'ship-it', members: ['a-semic', 'a-pete'].map((agentId) => ({ agentId })) } as never;
    const way = {
      gates: [
        { after: 'ship-it', reviewer: 'a-semic', kind: 'review', why: 'w' },
        { after: '*', reviewer: 'a-lint', kind: 'quality', why: 'outsider' },
        { after: 'a-pete', reviewer: 'a-semic', kind: 'crash-test', why: 'w', when: 'payments' },
      ],
    } as never;
    const of = (agentId: string, branches?: string[]) =>
      memberGates(way, view, { agentId, branches }).map((g) => g.kind);
    expect(of('a-pete', [])).toEqual(['review']);
    expect(of('a-pete')).toEqual(['review', 'crash-test']);
    expect(of('a-semic')).toEqual([]);
    expect(memberGates(null, view, { agentId: 'a-pete' })).toEqual([]);
  });

  it('parseRework: the last {"rework": …} line, entries with notes only', () => {
    expect(parseRework('All good.')).toEqual([]);
    expect(
      parseRework('x\n{"rework":[{"assignee":"a","notes":"fix"},{"assignee":"b","notes":""}]}\ntrailing'),
    ).toEqual([{ assignee: 'a', notes: 'fix' }]);
    expect(parseRework('`{"rework":[{"assignee":"a","notes":"n"}]}`')).toEqual([
      { assignee: 'a', notes: 'n' },
    ]);
    expect(parseRework('{"rework": "nope"}')).toEqual([]);
  });
});
