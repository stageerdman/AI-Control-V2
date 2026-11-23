import { describe, expect, it } from 'vitest';
import { plainProblem } from '../../src/whiteboard/plain-problem.ts';

const msg = (note: string, status: 'failed' | 'cancelled' = 'failed') => plainProblem(status, note)?.message;

describe('plainProblem: why a task stopped, in everyday words', () => {
  it('only failed and cancelled tasks have a problem', () => {
    expect(plainProblem('done', 'Deployed.')).toBeNull();
    expect(plainProblem('running', null)).toBeNull();
    expect(plainProblem('todo', 'Stopped: reached the turn cap (30)')).toBeNull();
  });

  it('the turn cap: ran out of steps, the work is saved', () => {
    expect(plainProblem('failed', 'Stopped: reached the turn cap (30)')).toEqual({
      message: 'Ran out of steps. The work is saved and can continue.',
      details: 'Stopped: reached the turn cap (30)',
    });
    expect(msg('error_max_turns')).toBe('Ran out of steps. The work is saved and can continue.');
  });

  it.each([
    ['error_max_budget_usd', 'Hit its size limit. The work is saved and can continue.'],
    ['Stopped by you', 'You stopped this. It can continue whenever you like.'],
    ['Paused: the studio closed during this run', 'Paused when the studio closed. It carries on by itself.'],
    ['Skipped: an earlier item did not succeed', "Skipped, because an earlier step didn't finish."],
    [
      'Ada sent it back 3 times — it needs you. Last notes: x',
      'Sent back too many times. It needs your call.',
    ],
    ['Finished without filing the report', 'Finished without filing its report.'],
    ["Couldn't make a checkout: EACCES", "Couldn't set up its own copy of the project."],
    [
      'Could not start Claude Code: spawn claude ENOENT',
      "Couldn't start the agent. Is Claude Code installed?",
    ],
    ['Merging main into studio/x conflicts in a.ts, b.ts', 'Its changes clash with other work.'],
    ["Couldn't merge main into studio/x: fatal", "Couldn't land the work."],
    ['API Error: 529 overloaded_error', 'The AI service was busy. Try again in a bit.'],
    ['rate_limit_error: 429', 'Hit the usage limit. Try again later.'],
    ['Claude Code exited (code 1): boom', 'The agent stopped unexpectedly.'],
  ])('%s → %s', (note, message) => {
    expect(msg(note)).toBe(message);
  });

  it("a review that hit its turn cap reads as the review, not the reviewer's steps", () => {
    expect(msg("Ada's review didn't finish: Stopped: reached the turn cap (15)")).toBe(
      "The review didn't finish.",
    );
  });

  it('a kept branch says the work is saved (once)', () => {
    expect(msg('tests are red — work kept on branch studio/x')).toBe(
      'Something went wrong. The work is saved.',
    );
    expect(msg('Stopped: reached the turn cap (30) — work kept on branch studio/x')).toBe(
      'Ran out of steps. The work is saved and can continue.',
    );
  });

  it('unknown errors fall back by status; no note → no details', () => {
    expect(plainProblem('failed', 'tests are red')).toEqual({
      message: 'Something went wrong.',
      details: 'tests are red',
    });
    expect(plainProblem('cancelled', null)).toEqual({ message: 'Stopped.' });
    expect(plainProblem('failed', '  ')).toEqual({ message: 'Something went wrong.' });
  });
});
