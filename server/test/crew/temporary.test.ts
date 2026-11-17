/* Workflows phase 3: a temporary workflow — someone leads a small crew on one goal. While the goal runs the lead
   is the crew's contact and approver, may stop and tell them, hands them work that stays on the goal, and signs
   it off. All of it is worked out from the running goal, so it ends with the goal. */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { fakeBrain } from '../../src/crew/fake-brain.ts';
import { contractOf } from '../../src/crew/structured.ts';
import { getChatMessages } from '../../src/db/chats.ts';
import { type Goal, workRepo } from '../../src/db/work.ts';
import { crewsLedBy, leadOf } from '../../src/domain/workflows.ts';
import { type FakeStep, fakeRunner } from '../../src/runtime/fake.ts';
import type { RunSpec } from '../../src/runtime/runner.ts';
import { crewSlot } from '../../src/whiteboard/board.ts';
import { testApp } from '../helpers.ts';
import { scriptedCrew } from './brain.ts';

const led = (status: string, lead = 'a-baron', crew = ['a-pete']) => ({ status, workflow: { lead, crew } });

describe('temporary command, pure', () => {
  it('leadOf: the lead of a running goal’s crew member; nobody once the goal ends or for others', () => {
    expect(leadOf('a-pete', led('running'))).toBe('a-baron');
    expect(leadOf('a-pete', led('cancelled'))).toBeNull();
    expect(leadOf('a-pete', led('done'))).toBeNull();
    expect(leadOf('a-scar', led('running'))).toBeNull();
    expect(leadOf('a-pete', { status: 'running', workflow: null })).toBeNull();
  });

  it('crewsLedBy: the crews of the running goals they lead, once each', () => {
    const goals = [
      led('running'),
      led('running', 'a-baron', ['a-pete', 'a-query']),
      led('done', 'a-baron', ['a-scar']),
    ];
    expect(crewsLedBy('a-baron', goals)).toEqual(['a-pete', 'a-query']);
    expect(crewsLedBy('a-pete', goals)).toEqual([]);
  });

  it('crewSlot: after the lead’s last task and the crew work right after it; no lead task → the end', () => {
    const items = (...ids: string[]) => ids.map((agentId) => ({ agentId }));
    expect(crewSlot(items('a-baron', 'a-pete', 'a-lint'), 'a-baron', ['a-pete'])).toBe(2);
    expect(crewSlot(items('a-baron', 'a-lint', 'a-baron'), 'a-baron', ['a-pete'])).toBe(3);
    expect(crewSlot(items('a-lint', 'a-pete'), 'a-baron', ['a-pete'])).toBe(2);
  });
});

const isChat = (s: RunSpec) => s.task.startsWith('Studio summary right now: ');
const isReview = (s: RunSpec) => s.task.startsWith('You are reviewing');
const nameOf = (s: RunSpec) => /^# (.+)\n/.exec(s.systemPrompt)?.[1] ?? '';
const chatUrl = '/projects/aurora/threads/a-pixel/messages';
const COMMAND = { lead: 'a-baron', crew: ['Pixel Pete', 'a-query'] };

async function until(ok: () => boolean, what: () => unknown, ms = 5000) {
  const end = Date.now() + ms;
  while (!ok()) {
    if (Date.now() > end) throw new Error(`timed out waiting; now: ${JSON.stringify(what())}`);
    await new Promise((r) => setTimeout(r, 20));
  }
}

describe('temporary command, live in the studio', () => {
  let h: ReturnType<typeof testApp>;
  afterEach(() => h.close());

  /** Director turns play `turns` in order; agent runs play `work` by the agent's name; crew contracts say yes. */
  function studio(turns: FakeStep[][], work: (name: string, spec: RunSpec) => FakeStep[] = () => []) {
    const calls: RunSpec[] = [];
    h = testApp({
      seed: true,
      runner: fakeRunner((spec): FakeStep[] => {
        calls.push(spec);
        if (isChat(spec)) return [...(turns.shift() ?? []), { result: 'Done.' }];
        const c = contractOf(spec.task);
        if (c?.name === 'allow-call') return [{ result: '{"allow":true,"reply":"Yes — go ahead."}' }];
        if (c?.name === 'help') return [{ result: '{"answer":"On it.","say":"on it"}' }];
        if (c) return fakeBrain(spec);
        if (isReview(spec)) return [{ result: '{"verdict":"approve","notes":"Good."}' }];
        return [...work(nameOf(spec), spec), { result: 'Built.' }];
      }),
    });
    mkdirSync(join(h.config.sandbox, 'aurora'));
    h.store.projects.update('aurora', { folder: 'aurora' });
    return calls;
  }
  const say = async () => {
    const r = await h.call('POST', chatUrl, { text: 'Baron, take command and use Pete' });
    await h.runtime.settled(r.body.runId);
    return said(r.body.runId);
  };
  const said = (runId: string) =>
    getChatMessages(h.db, runId)
      .filter((m) => m.role === 'assistant')
      .map((m) => m.text);
  const board = () => workRepo(h.db).goals('aurora');
  const state = () => board().map((g) => [g.text, g.status, g.items.map((i) => [i.text, i.status])]);
  const addGoal = (workflow: object, crewMember = 'a-pete'): FakeStep => ({
    tool: 'add_goal',
    args: {
      text: 'Ship backups',
      tasks: [
        { text: 'Plan backups', owner: 'a-baron' },
        { text: 'Build backups', owner: crewMember },
      ],
      workflow,
    },
  });

  it('the lead leads the crew while the goal runs: contact, approver, hands, crew work on the goal, sign-off', async () => {
    const tools: Record<string, readonly string[] | undefined> = {};
    let peteRun = '';
    const calls = studio([[addGoal(COMMAND)]], (name, spec) => {
      const label = ['Plan backups', 'later'].find((t) => spec.task.includes(t));
      if (label) tools[`${name}:${label}`] = spec.studioTools?.names;
      if (name === 'Baron von Backup' && spec.task.includes('Plan backups'))
        return [
          {
            tool: 'call_agent',
            args: { agent: 'Pixel Pete', request: 'Add a restore drill', why: 'drill restores', work: true },
          },
          {
            tool: 'call_agent',
            args: {
              agent: 'Madame Mergeworthy',
              request: 'Tidy the merge queue',
              why: 'tidy up',
              work: true,
            },
          },
          { tool: 'tell_agent', args: { to: 'Captain Semicolon', message: 'hi' } },
        ];
      if (name === 'Pixel Pete' && spec.task.includes('Build backups')) {
        peteRun = spec.runId;
        return [
          { tool: 'room', args: {} },
          {
            tool: 'call_agent',
            args: { agent: 'Professor Prompt', request: 'Sources?', why: 'find sources' },
          },
        ];
      }
      return [];
    });
    await say();
    const goal = () => board().find((g) => g.text === 'Ship backups') as Goal;
    expect(goal().workflow).toMatchObject({
      id: 'temp',
      name: 'Baron leads',
      lead: 'a-baron',
      crew: ['a-pete', 'a-query'],
    });

    await until(() => goal().status === 'done', state, 8000);
    const items = goal().items; // the lead's hand-off stays on this goal, right after the crew work that follows the lead's task, signed by the lead
    expect(items.map((i) => [i.text, i.agentId, i.gates.map((g) => g.reviewer)])).toEqual([
      ['Plan backups', 'a-baron', []],
      ['Build backups', 'a-pete', ['a-baron']],
      ['Add a restore drill', 'a-pete', ['a-baron']],
    ]);
    // someone outside the crew gets a side quest, as before
    expect(board().find((g) => g.text === 'Tidy the merge queue')?.quest).toBe('side');

    const baronRun = items[0]?.runId as string;
    const baronSaid = said(baronRun).join('\n');
    expect(baronSaid).toContain("Added to this goal as Pixel Pete's task #3; you sign it off.");
    expect(baronSaid).toContain('Nobody called Captain Semicolon is on your team.');
    expect(tools['Baron von Backup:Plan backups']).toEqual(
      expect.arrayContaining(['stop_work', 'tell_agent']),
    );

    // the crew member's contact and approver is the lead while the goal runs
    expect(said(peteRun).join('\n')).toMatch(/"yourContact":\s*"Baron von Backup"/);
    const allow = calls.filter(
      (c) => contractOf(c.task)?.name === 'allow-call' && c.task.includes('Sources?'),
    );
    expect(allow.map(nameOf)).toEqual(['Baron von Backup']);
    expect(allow[0]?.task).toContain('You lead Pixel Pete on this goal');

    // the goal ended: the lead's hands are gone
    const after = (await h.call('POST', '/projects/aurora/runs', { agentId: 'a-baron', task: 'later' })).body;
    await h.runtime.settled(after.id);
    expect(tools['Baron von Backup:later']).not.toContain('stop_work');
  });

  it('the live example end to end: lead hands work, signs it, the goal ends, Pixel offers to keep it', async () => {
    const peteRuns: string[] = [];
    const turns: FakeStep[][] = [[addGoal({ lead: 'a-baron', crew: ['Pixel Pete'] })]];
    studio(turns, (name, spec) => {
      if (name === 'Pixel Pete') peteRuns.push(spec.runId);
      if (name === 'Baron von Backup' && spec.task.includes('Plan backups'))
        return [
          {
            tool: 'call_agent',
            args: { agent: 'Pixel Pete', request: 'Add a restore drill', why: 'drill restores', work: true },
          },
        ];
      if (name === 'Pixel Pete') return [{ tool: 'room', args: {} }];
      return [];
    });
    await say();
    const goal = () => board().find((g) => g.text === 'Ship backups') as Goal;
    await until(() => goal().status === 'done', state, 8000);

    // the hand-off is main work on the same goal, gated and signed by the lead
    expect(board()).toHaveLength(1);
    expect(goal().quest).toBe('main');
    const [view] = (await h.call('GET', '/projects/aurora/work')).body;
    expect(
      view.items.map((i: { text: string; signoffs: { reviewer: { name: string }; state: string }[] }) => [
        i.text,
        i.signoffs.map((s) => `${s.reviewer.name}:${s.state}`),
      ]),
    ).toEqual([
      ['Plan backups', []],
      ['Build backups', ['Baron von Backup:signed']],
      ['Add a restore drill', ['Baron von Backup:signed']],
    ]);
    // both of Pete's tasks ran with Baron as his contact
    expect(peteRuns).toHaveLength(2);
    for (const run of peteRuns) expect(said(run).join('\n')).toMatch(/"yourContact":\s*"Baron von Backup"/);

    // it ended once, and Pixel offers to keep the way of working
    const ended = h.events.after('project', 'aurora').filter((e) => e.type === 'workflow.ended');
    expect(ended.map((e) => e.payload)).toEqual([
      { goalId: goal().id, lead: 'a-baron', crew: ['a-pete'], status: 'done' },
    ]);
    const thread = JSON.stringify((await h.call('GET', chatUrl)).body);
    expect(thread).toContain("Baron von Backup's crew finished 'Ship backups'. Keep this way of working?");

    // kept as a stable workflow: Baron still signs Pete's work, nobody leads
    turns.push([
      { tool: 'save_workflow', args: { goal: goal().id, name: 'Lead and build', when: 'backups' } },
    ]);
    const turn = await h.call('POST', chatUrl, { text: 'Keep it' });
    await h.runtime.settled(turn.body.runId);
    expect(said(turn.body.runId).join('\n')).toContain("Saved 'Lead and build'.");
    const kept = h.store.projects.require('aurora').workflows?.find((w) => w.id === 'lead-and-build');
    expect(kept?.lead).toBeUndefined();
    expect(kept?.gates.map((g) => [g.after, g.reviewer])).toEqual([['a-pete', 'a-baron']]);

    // afterwards Pete's contact is the usual one again
    const later = (await h.call('POST', '/projects/aurora/runs', { agentId: 'a-pete', task: 'later' })).body;
    await h.runtime.settled(later.id);
    expect(said(later.id).join('\n')).toMatch(/"yourContact":\s*"(?!Baron von Backup)[^"]+"/);
  });

  it('a crew name nobody has is refused; a Cast agent not on the project is seated as a guest', async () => {
    studio([
      [
        addGoal({ lead: 'a-baron', crew: ['Nobody Here'] }, 'a-query'),
        addGoal({ lead: 'a-baron', crew: ['Professor Prompt'] }, 'a-prof'),
      ],
    ]);
    const [refused, added] = await say();
    expect(refused).toMatch(/^add_goal refused: .*'Nobody Here' is not on this project/);
    expect(added).toContain('Added to the whiteboard');
    expect(board()[0]?.workflow).toMatchObject({ crew: ['a-prof'] });
    expect(h.store.guests.ids('aurora')).toContain('a-prof');
  });

  it('planning: the orchestrator may plan a goal under a temporary lead', async () => {
    const crew = scriptedCrew(
      {
        dispatch: [
          {
            summary: 'Baron leads.',
            items: [
              { text: 'Plan backups', assignee: 'a-baron', brief: 'b' },
              { text: 'Build backups', assignee: 'a-query', brief: 'b' },
            ],
            workflow: { lead: 'a-baron', crew: ['a-query'] },
          },
        ],
      },
      () => [{ result: 'Done.' }],
    );
    h = testApp({ seed: true, runner: crew.runner });
    mkdirSync(join(h.config.sandbox, 'aurora'));
    h.store.projects.update('aurora', { folder: 'aurora' });
    const r = await h.call('POST', '/projects/aurora/work', { goal: 'Ship backups' });
    expect(r.status).toBe(201);
    expect(r.body.workflow).toMatchObject({
      id: 'temp',
      lead: 'a-baron',
      crew: ['a-query'],
      temporary: true,
    });
    expect(
      r.body.items.map((i: { gates: { reviewer: string }[] }) => i.gates.map((g) => g.reviewer)),
    ).toEqual([[], ['a-baron']]);
  });
});
