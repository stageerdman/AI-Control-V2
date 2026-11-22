/* The Sea GPS timeline, replayed end to end on one task. Live, it went: the builder started its e2e tests in the
   background and answered "the full e2e is still running, I'll pick up again when it finishes" — the studio
   stopped it 10s later (killing the tests) and sent the "still running" answer to review; review after review
   failed it; edit_task set it back to todo with a new brief, but the reviewer re-ran and the builder never saw
   the brief; stop_work showed the goal as cancelled. Here each step is checked on the whiteboard Pixel reads.
   The paused run goes through the real CLI runner (a stand-in `claude`), so the wait and the wake-up are real. */
import { chmodSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { contractOf } from '../../src/crew/structured.ts';
import { type ChecklistItem, workRepo } from '../../src/db/work.ts';
import { claudeCliRunner } from '../../src/runtime/claude-cli.ts';
import type { FakeStep } from '../../src/runtime/fake.ts';
import type { Runner, RunSpec } from '../../src/runtime/runner.ts';
import { tempDir, type testApp } from '../helpers.ts';
import { commit, isChat, isReview, studio, until, verdict } from './aurora-studio.ts';

const PAUSE = "The full e2e is still running, I'll pick up again when it finishes.";
const WOKEN = 'All 42 e2e tests pass. Committed.';
const NEW_BRIEF = 'Store memories with a timestamp, and test the empty state.';
const LONG: FakeStep[] = [{ text: 'Reworking it.' }, { wait: 10_000 }, { result: 'never' }];

/* A stand-in `claude`: answers that it waits on its background e2e run, then — once the test drops the
   FAKE_RELEASE file (the tests finished) — reports the background task gone and answers again, as the CLI does
   when it wakes the model. */
const CLI = `#!${process.execPath}
const fs = require('node:fs');
const line = (o) => process.stdout.write(JSON.stringify({ session_id: 'sea-gps', ...o }) + '\\n');
const result = (text, extra) => line({ type: 'result', subtype: 'success', is_error: false, num_turns: 3, result: text, total_cost_usd: 0.1, usage: { input_tokens: 10, output_tokens: 5 }, ...extra });
const say = (id, text) => line({ type: 'assistant', message: { id, content: [{ type: 'text', text }] } });
let started = false;
process.stdin.on('data', () => {
  if (started) return;
  started = true;
  line({ type: 'system', subtype: 'background_tasks_changed', tasks: [{ task_id: 'e2e', description: 'npm run e2e' }] });
  say('a1', ${JSON.stringify(PAUSE)});
  result(${JSON.stringify(PAUSE)});
  const poll = setInterval(() => {
    if (!fs.existsSync(process.env.FAKE_RELEASE)) return;
    clearInterval(poll);
    line({ type: 'system', subtype: 'background_tasks_changed', tasks: [] });
    say('a2', ${JSON.stringify(WOKEN)});
    result(${JSON.stringify(WOKEN)}, { num_turns: 2, total_cost_usd: 0.3, origin: { kind: 'task-notification' } });
    process.exit(0);
  }, 20);
});
`;

const isBuild = (s: RunSpec) => !isReview(s) && !isChat(s) && !contractOf(s.task);

/** The builder's first run goes to the real CLI runner (the stand-in in `dir`); every other run stays scripted. */
function firstBuildOnCli(dir: string, release: string, paused: RunSpec[]) {
  const bin = join(dir, 'claude');
  writeFileSync(bin, CLI);
  chmodSync(bin, 0o755);
  const cli = claudeCliRunner({
    bin,
    afterResultMs: 100,
    askServer: '/srv/ask-server.ts',
    node: process.execPath,
  });
  return (scripted: Runner): Runner => ({
    name: 'sea-gps',
    start(spec, io) {
      if (paused.length || !isBuild(spec)) return scripted.start(spec, io);
      paused.push(spec);
      return cli.start({ ...spec, env: { ...spec.env, FAKE_RELEASE: release } }, io);
    },
  });
}

describe('the Sea GPS timeline, replayed', () => {
  let h: ReturnType<typeof testApp>;
  let t: ReturnType<typeof tempDir>;
  afterEach(() => {
    h.close();
    t.cleanup();
  });

  it('waits for its tests, wakes when they end, restarts with the new brief; the board is true at every step', async () => {
    t = tempDir();
    const release = join(t.dir, 'e2e-finished');
    const paused: RunSpec[] = [];
    const builds: RunSpec[] = [];
    let reviews = 0;
    const s = studio(
      (_app, spec) => {
        if (isReview(spec)) {
          reviews++;
          if (reviews === 1) return verdict('changes', 'Memories need a timestamp.');
          if (reviews === 2) return verdict('changes', 'The empty state crashes.');
          return verdict('approve', 'Good.');
        }
        builds.push(spec);
        if (spec.task.includes('the user stopped you')) return commit(spec, 'resumed.txt');
        if (spec.task.includes(NEW_BRIEF)) return LONG; // still reworking when stop_work lands
        return commit(spec, 'rework.txt');
      },
      undefined,
      firstBuildOnCli(t.dir, release, paused),
    );
    h = s.h;
    const work = workRepo(h.db);
    const board = () => s.director('whiteboard', {});
    const r = await h.call('POST', '/projects/aurora/work', { goal: 'Build the Pensieve' });
    const goalId = r.body.id as string;
    const id = r.body.items[0].id as string;
    const item = () => work.item(id) as ChecklistItem;

    /* 1. it pauses for its background e2e run: the task waits — running, not failed, not sent to review */
    const firstRun = (await until(() => paused[0]?.runId, Boolean)) as string;
    await until(
      () => h.runtime.waitingOn(firstRun),
      (w) => w,
    );
    await new Promise((ok) => setTimeout(ok, 500)); // well past the 100ms a lingering CLI is given
    expect(item()).toMatchObject({ status: 'running', stage: 'build', runId: firstRun, sendBacks: 0 });
    expect(h.runtime.get('aurora', firstRun)).toMatchObject({ status: 'running', endedAt: null });
    expect(reviews).toBe(0);
    expect(await board()).toContain('[waiting for its background tests to finish] Build the Pensieve');

    /* 2. the tests finish: the same run wakes, its woken answer is the answer, and the work goes on to review */
    commit(paused[0] as RunSpec, 'e2e.txt');
    writeFileSync(release, 'done\n');
    await until(
      () => h.runtime.get('aurora', firstRun).status,
      (st) => st !== 'running',
    );
    expect(h.runtime.get('aurora', firstRun)).toMatchObject({ status: 'succeeded', result: WOKEN });

    /* 3. two send-backs fail it; the board says so */
    const failed = await until(item, (i) => i.status === 'failed');
    expect(failed).toMatchObject({ stage: 'review', sendBacks: 2 });
    expect(reviews).toBe(2);
    expect(await board()).toContain('[did not finish] Build the Pensieve');

    /* 4. back to todo with a new brief: the builder (not the reviewer) runs, in its session, with the brief */
    await s.director('edit_task', { task: id, status: 'todo', brief: NEW_BRIEF });
    const restart = await until(
      () => builds.at(-1),
      (b) => !!b?.task.includes(NEW_BRIEF),
    );
    expect(restart?.resumeSessionId).toBe(`fake-${failed.buildRunId}`); // the builder's latest session
    expect(restart?.task).toContain(`Your brief now (follow this one, it may have changed): ${NEW_BRIEF}`);
    expect(restart?.task).toContain('The empty state crashes.');
    expect(reviews).toBe(2);
    expect(await until(item, (i) => i.status === 'running')).toMatchObject({ stage: 'build', sendBacks: 0 });
    const running = await board();
    expect(running).toContain('[running now] Build the Pensieve');
    expect(running).toMatch(new RegExp(`Goal ${goalId} \\[running`));

    /* 5. stop_work: the goal shows stopped, not cancelled — on the board and in the store */
    await s.director('stop_work', { everyone: true });
    const stopped = await until(
      () => work.goal(goalId),
      (g) => g?.status !== 'running',
    );
    expect(stopped?.status).toBe('stopped');
    const halted = await board();
    expect(halted).toMatch(new RegExp(`Goal ${goalId} \\[stopped`));
    expect(halted).not.toMatch(new RegExp(`Goal ${goalId} \\[cancelled`));
    expect(halted).toContain('[stopped] Build the Pensieve');

    /* 6. set running again: the agent carries on with the brief, and the goal is done */
    expect(await s.director('edit_goal', { goal: goalId, status: 'running' })).toContain(
      'Goal running again',
    );
    const done = await until(
      () => work.goal(goalId),
      (g) => g?.status === 'done' || g?.status === 'failed',
    );
    expect(done?.status, done?.items[0]?.note ?? '').toBe('done');
    const resumed = builds.at(-1) as RunSpec;
    expect(resumed.task).toContain('the user stopped you, and has now asked you to continue');
    expect(resumed.task).toContain(`Your brief now (follow this one, it may have changed): ${NEW_BRIEF}`);
    expect(reviews).toBe(3);
    expect(await board()).toContain('[done] Build the Pensieve');
  }, 40_000);
});
