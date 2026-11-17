/* Workflows phase 4: switching a goal's workflow mid-way, the end of a temporary crew, keeping its way of
   working, and the sign-off sheet read from recorded reviews. */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { fakeBrain } from '../../src/crew/fake-brain.ts';
import { settledLine } from '../../src/crew/settled.ts';
import { contractOf } from '../../src/crew/structured.ts';
import { type Goal, type ItemReview, workRepo } from '../../src/db/work.ts';
import { parseEventInput } from '../../src/domain/events.ts';
import {
  DEFAULT_WORKFLOW,
  gatesFor,
  type ItemGate,
  leadOf,
  signedBy,
  signoffs,
  stableCopy,
  type Workflow,
  WorkflowSchema,
} from '../../src/domain/workflows.ts';
import { type FakeStep, fakeRunner } from '../../src/runtime/fake.ts';
import type { RunSpec } from '../../src/runtime/runner.ts';
import { type BoardPort, createBoard } from '../../src/whiteboard/board.ts';
import { testApp } from '../helpers.ts';

const gate = (reviewer: string, kind: ItemGate['kind'] = 'review'): ItemGate => ({
  reviewer,
  kind,
  why: 'w',
});
const review = (reviewer: string, verdict: ItemReview['verdict'], gateKind: ItemGate['kind'] = 'review') => ({
  reviewer,
  gate: gateKind,
  verdict,
});
const states = (it: Parameters<typeof signoffs>[0]) => signoffs(it).map((s) => `${s.reviewer}:${s.state}`);

describe('sign-off sheet, pure', () => {
  const gates = [gate('a-merge', 'quality'), gate('a-baron')];

  it('signoffs: pending, signed, sent back, re-reviewed then signed, and reopened from scratch', () => {
    expect(states({ gates, gateIndex: 0, reviews: [] })).toEqual(['a-merge:pending', 'a-baron:pending']);
    expect(states({ gates, gateIndex: 2, reviews: [] })).toEqual(['a-merge:signed', 'a-baron:signed']);
    const sentBack = [review('a-merge', 'changes', 'quality')];
    expect(states({ gates, gateIndex: 0, reviews: sentBack })).toEqual([
      'a-merge:sent-back',
      'a-baron:pending',
    ]);
    const again = [...sentBack, review('a-merge', 'approve', 'quality')];
    expect(states({ gates, gateIndex: 1, reviews: again })).toEqual(['a-merge:signed', 'a-baron:pending']);
    expect(states({ gates, gateIndex: 1, reviews: [...again, review('a-baron', 'changes')] })).toEqual([
      'a-merge:signed',
      'a-baron:sent-back',
    ]);
    // redone from scratch: an old approval no longer counts
    expect(states({ gates, gateIndex: 0, reviews: again })).toEqual(['a-merge:pending', 'a-baron:pending']);
    expect(signoffs({ gates: [], gateIndex: 0, reviews: [] })).toEqual([]);
  });

  it('signedBy: everyone who signed, once each, in task order', () => {
    const items = [
      { gates, gateIndex: 2, reviews: [] },
      { gates: [gate('a-baron'), gate('a-query')], gateIndex: 2, reviews: [] },
      { gates: [gate('a-pete')], gateIndex: 0, reviews: [] },
    ];
    expect(signedBy({ items })).toEqual(['a-merge', 'a-baron', 'a-query']);
  });

  it('stableCopy: the lead’s sign-offs become plain gates; lead and crew are dropped', () => {
    const temp: Workflow = {
      ...DEFAULT_WORKFLOW,
      id: 'temp',
      name: 'Baron leads',
      lead: 'a-baron',
      crew: ['a-pete'],
    };
    const kept = stableCopy(temp, { id: 'lead-and-build', name: 'Lead and build', when: 'backups' });
    expect(kept).toMatchObject({ id: 'lead-and-build', name: 'Lead and build', when: 'backups' });
    expect(kept.lead).toBeUndefined();
    expect(kept.crew).toBeUndefined();
    expect(kept.gates.map((g) => [g.after, g.reviewer])).toEqual([['a-pete', 'a-baron']]);
    expect(WorkflowSchema.parse(kept)).toEqual(kept);
  });

  it('settledLine: a finished crew gets the keep offer; signed goals say who; others stay quiet', () => {
    const name = (id: string) => ({ 'a-baron': 'Baron', 'a-pete': 'Pete' })[id] ?? id;
    const goal = (status: Goal['status'], workflow: Workflow | null, gateIndex = 1) =>
      ({
        status,
        text: 'Ship backups',
        workflow,
        items: [{ gates: [gate('a-baron')], gateIndex, reviews: [] }],
      }) as unknown as Goal;
    const temp = { ...DEFAULT_WORKFLOW, lead: 'a-baron', crew: ['a-pete'] };
    expect(settledLine(goal('done', temp), name)).toBe(
      "Baron's crew finished 'Ship backups'. Keep this way of working? I can save its checks as a workflow, or make Baron and Pete a team. Signed by Baron.",
    );
    expect(settledLine(goal('done', null), name)).toBe("'Ship backups' is done. Signed by Baron.");
    expect(settledLine(goal('done', null, 0), name)).toBeNull();
    expect(settledLine(goal('cancelled', temp), name)).toBeNull();
  });

  it('event schemas accept workflow.changed and workflow.ended', () => {
    expect(() =>
      parseEventInput({
        type: 'workflow.changed',
        payload: {
          goalId: 'g',
          regated: 2,
          id: 'temp',
          name: 'Baron leads',
          temporary: true,
          lead: 'a-baron',
          crew: ['a-pete'],
        },
      }),
    ).not.toThrow();
    expect(() =>
      parseEventInput({
        type: 'workflow.ended',
        payload: { goalId: 'g', lead: 'a-baron', crew: ['a-pete'], status: 'done' },
      }),
    ).not.toThrow();
    expect(() =>
      parseEventInput({
        type: 'workflow.ended',
        payload: { goalId: 'g', lead: 'a-baron', crew: [], status: 'running' },
      }),
    ).toThrow();
  });
});

describe('switching a goal’s workflow (the board)', () => {
  let h: ReturnType<typeof testApp>;
  afterEach(() => h.close());

  const CHECKED = WorkflowSchema.parse({
    id: 'checked',
    name: 'Checked',
    gates: [{ after: '*', reviewer: 'a-merge', kind: 'quality', why: 'w' }],
    summary: 'Madame checks everything.',
  });

  function setup() {
    h = testApp({ seed: true });
    h.store.projects.update('aurora', { workflows: [DEFAULT_WORKFLOW, CHECKED] });
    const switched: [string, number][] = [];
    const port = {
      gatesOf: (_p: string, owner: { agentId: string; teamId: string | null }, w: Workflow) =>
        gatesFor(w, owner),
      workflowOf: (g: Goal) => g.workflow ?? DEFAULT_WORKFLOW,
      workflowChanged: (_p: string, goalId: string, n: number) => switched.push([goalId, n]),
      changed: () => {},
      stopItems: async () => {},
      reopen: () => {},
    } as unknown as BoardPort;
    const board = createBoard({ db: h.db, store: h.store, port });
    const work = workRepo(h.db);
    const task = (id: string) => ({ id, text: id, brief: id, agentId: 'a-pete', teamId: null });
    work.insertGoal(
      { id: 'g1', projectId: 'aurora', text: 'Ship', summary: 'Ship', workflow: DEFAULT_WORKFLOW },
      [task('fresh'), task('running'), task('reviewing'), task('finished')],
    );
    work.setItem('running', { status: 'running', runId: 'r1' });
    work.setItem('reviewing', { status: 'todo', stage: 'review', buildRunId: 'r2' });
    work.setItem('finished', { status: 'done' });
    const gates = () =>
      Object.fromEntries((work.goal('g1') as Goal).items.map((i) => [i.id, i.gates.map((g) => g.reviewer)]));
    return { board, work, switched, gates };
  }

  it('re-gates only untouched todo tasks; running, reviewed and done work keep theirs', async () => {
    const { board, switched, gates } = setup();
    const said = await board.editGoal('aurora', 'a-pixel', 'g1', { workflow: 'checked' });
    expect(said).toMatch(
      /^Now runs under 'Checked': 1 task\(s\) not started yet take its checks; 3 started or finished keep theirs\./,
    );
    expect(gates()).toEqual({ fresh: ['a-merge'], running: [], reviewing: [], finished: [] });
    expect(switched).toEqual([['g1', 1]]);
  });

  it('stable → temporary gives the lead command at once; back to stable takes it away', async () => {
    const { board, work, gates } = setup();
    const goal = () => work.goal('g1') as Goal;
    await board.editGoal('aurora', 'a-pixel', 'g1', { workflow: { lead: 'a-baron', crew: ['a-pete'] } });
    expect(leadOf('a-pete', goal())).toBe('a-baron');
    expect(gates().fresh).toEqual(['a-baron']);
    await board.editGoal('aurora', 'a-pixel', 'g1', { workflow: 'checked' });
    expect(leadOf('a-pete', goal())).toBeNull();
    expect(goal().workflow?.id).toBe('checked');
  });

  it('an unknown workflow refuses the whole edit', async () => {
    const { board, work } = setup();
    await expect(
      board.editGoal('aurora', 'a-pixel', 'g1', { workflow: 'ghost', text: 'Renamed' }),
    ).rejects.toThrow(/'ghost' is not a workflow of this project/);
    expect(work.goal('g1')?.text).toBe('Ship');
  });
});

const isChat = (s: RunSpec) => s.task.startsWith('Studio summary right now: ');
const isReview = (s: RunSpec) => s.task.startsWith('You are reviewing');

async function until(ok: () => boolean, what: () => unknown, ms = 8000) {
  const end = Date.now() + ms;
  while (!ok()) {
    if (Date.now() > end) throw new Error(`timed out waiting; now: ${JSON.stringify(what())}`);
    await new Promise((r) => setTimeout(r, 20));
  }
}

describe('a temporary crew ends, and its way of working is kept', () => {
  let h: ReturnType<typeof testApp>;
  afterEach(() => h.close());

  it('workflow.ended once, the keep offer signed by the lead, signoffs on the board, save_workflow', async () => {
    const turns: FakeStep[][] = [
      [
        {
          tool: 'add_goal',
          args: {
            text: 'Ship backups',
            tasks: [
              { text: 'Plan backups', owner: 'a-baron' },
              { text: 'Build backups', owner: 'a-pete' },
            ],
            workflow: { lead: 'a-baron', crew: ['a-pete'] },
          },
        },
      ],
    ];
    h = testApp({
      seed: true,
      runner: fakeRunner((spec): FakeStep[] => {
        if (isChat(spec)) return [...(turns.shift() ?? []), { result: 'Done.' }];
        if (contractOf(spec.task)) return fakeBrain(spec);
        if (isReview(spec)) return [{ result: '{"verdict":"approve","notes":"Good."}' }];
        return [{ result: 'Built.' }];
      }),
    });
    mkdirSync(join(h.config.sandbox, 'aurora'));
    h.store.projects.update('aurora', { folder: 'aurora' });
    const chat = async (text: string) => {
      const r = await h.call('POST', '/projects/aurora/threads/a-pixel/messages', { text });
      await h.runtime.settled(r.body.runId);
    };
    const goal = () => workRepo(h.db).goals('aurora')[0] as Goal;

    await chat('Baron, take command and use Pete');
    await until(
      () => goal()?.status === 'done',
      () => goal()?.items.map((i) => i.status),
    );

    const ended = h.events.after('project', 'aurora').filter((e) => e.type === 'workflow.ended');
    expect(ended.map((e) => e.payload)).toEqual([
      { goalId: goal().id, lead: 'a-baron', crew: ['a-pete'], status: 'done' },
    ]);
    const thread = JSON.stringify((await h.call('GET', '/projects/aurora/threads/a-pixel/messages')).body);
    expect(thread).toContain(
      "Baron von Backup's crew finished 'Ship backups'. Keep this way of working? I can save its checks as a workflow, or make Baron von Backup and Pixel Pete a team. Signed by Baron von Backup.",
    );

    const [view] = (await h.call('GET', '/projects/aurora/work')).body;
    expect(
      view.items.map((i: { signoffs: { reviewer: { name: string }; state: string }[] }) =>
        i.signoffs.map((s) => `${s.reviewer.name}:${s.state}`),
      ),
    ).toEqual([[], ['Baron von Backup:signed']]);
    expect(view.signedBy.map((p: { name: string }) => p.name)).toEqual(['Baron von Backup']);

    turns.push([
      { tool: 'save_workflow', args: { goal: goal().id, name: 'Lead and build', when: 'backups' } },
    ]);
    await chat('Keep it');
    const kept = h.store.projects.require('aurora').workflows?.find((w) => w.id === 'lead-and-build');
    expect(kept).toMatchObject({ name: 'Lead and build', when: 'backups' });
    expect(kept?.lead).toBeUndefined();
    expect(kept?.gates.map((g) => [g.after, g.reviewer])).toEqual([['a-pete', 'a-baron']]);
  });
});
