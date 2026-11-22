/* Aurora with a git folder and one item to build, for whiteboard flows end to end (handovers, cant_do).
   Columbo's part is played by Captain Semicolon (ship-it), Uncle Bob's by Baron von Backup (a specialist);
   Sir Lint-a-lot reviews everyone's work. */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getChatMessages } from '../../src/db/chats.ts';
import type { Workflow } from '../../src/domain/workflows.ts';
import type { FakeStep } from '../../src/runtime/fake.ts';
import type { Runner, RunSpec } from '../../src/runtime/runner.ts';
import { testApp } from '../helpers.ts';
import { scriptedCrew } from './brain.ts';

export const [COLUMBO, BOB, LINT] = ['a-semic', 'a-baron', 'a-lint'];
export const CHECKED: Workflow = {
  id: 'checked',
  name: 'Checked',
  when: 'always',
  orchestratorTalksTo: 'captains',
  gates: [{ after: '*', reviewer: LINT, kind: 'review', why: 'A second pair of eyes.' }],
  maxSendBacks: 1,
  summary: 'Lint reviews all work.',
};
const PLAN = {
  summary: 'One item.',
  items: [{ text: 'Build the Pensieve', assignee: COLUMBO, teamId: 'ship-it', brief: 'Store memories.' }],
};
const ENV = {
  GIT_AUTHOR_NAME: 't',
  GIT_AUTHOR_EMAIL: 't@t',
  GIT_COMMITTER_NAME: 't',
  GIT_COMMITTER_EMAIL: 't@t',
};
export const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...ENV } }).trim();

export type Ev = { type: string; payload: Record<string, unknown> };
export const isReview = (s: RunSpec) => s.task.startsWith('You are reviewing');
export const isChat = (s: RunSpec) => s.task.startsWith('Studio summary right now: ');

/** Aurora with a git folder; `work` scripts every run but the director's chat turns (played by `director`).
    `runner`: wraps the scripted one (a test that sends some runs through the real CLI runner). */
export function studio(
  work: (h: ReturnType<typeof testApp>, s: RunSpec) => FakeStep[],
  plan: object = PLAN,
  runner: (scripted: Runner) => Runner = (r) => r,
) {
  const box: { h?: ReturnType<typeof testApp> } = {};
  const turns: FakeStep[][] = [];
  const crew = scriptedCrew({ dispatch: [plan], help: [{ answer: 'On it.', say: 'on it' }] }, (s) =>
    isChat(s) ? [...(turns.shift() ?? []), { result: '{"reply":"Done."}' }] : work(box.h as never, s),
  );
  const h = testApp({ seed: true, runner: runner(crew.runner) });
  box.h = h;
  const repo = join(h.config.sandbox, 'aurora');
  mkdirSync(repo);
  git(repo, 'init', '-q', '-b', 'main');
  writeFileSync(join(repo, 'README.md'), 'base\n');
  git(repo, 'add', '.');
  git(repo, 'commit', '-q', '-m', 'init');
  h.store.projects.update('aurora', { folder: 'aurora', workflows: [CHECKED] });
  /** One director chat turn calling this whiteboard tool → what the tool answered. */
  const director = async (tool: string, args: Record<string, unknown>) => {
    turns.push([{ tool, args }]);
    const r = await h.call('POST', '/projects/aurora/threads/a-pixel/messages', { text: 'board' });
    await h.runtime.settled(r.body.runId);
    return getChatMessages(h.db, r.body.runId).find((m) => m.role === 'assistant')?.text ?? '';
  };
  return { h, crew, director };
}
export const isRunOf = (h: ReturnType<typeof testApp>, s: RunSpec, agentId: string) =>
  s.systemPrompt.startsWith(`# ${h.store.agents.require(agentId).name}\n`);
/** The builder commits a file of its own, so the merge has its work. */
export const commit = (s: RunSpec, file: string): FakeStep[] => {
  writeFileSync(join(s.cwd, file), `${file}\n`);
  git(s.cwd, 'add', '.');
  git(s.cwd, 'commit', '-q', '-m', file);
  return [{ result: `Built ${file}.` }];
};
/** A reviewer's reply with this verdict. */
export const verdict = (v: 'approve' | 'changes', notes: string): FakeStep[] => [
  { result: JSON.stringify({ verdict: v, notes }) },
];
/** The stall alerts Aurora's orchestrator got. */
export const alerts = (h: ReturnType<typeof testApp>) =>
  (h.events.after('project', 'aurora') as Ev[])
    .filter((e) => e.type === 'work.stalled')
    .map((e) => e.payload);
export async function until<T>(read: () => T, ok: (v: T) => boolean, ms = 8000): Promise<T> {
  for (const end = Date.now() + ms; Date.now() < end; await new Promise((r) => setTimeout(r, 10))) {
    const v = read();
    if (ok(v)) return v;
  }
  throw new Error(`timed out; now: ${JSON.stringify(read())}`);
}
