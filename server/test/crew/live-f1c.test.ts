/* The real streams of the F1c live check ("Tip Splitter 2", 2026-11-14): the orchestrator planning an empty project
   (stack first) and linking a feature, the captain's two splits (self for the setup, team for the page), a member
   building in its own checkout off the team branch, the captain integrating, and the QA review whose notes quoted
   code with braces — replayed so the formats the model actually produced stay accepted. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DispatchSchema } from '../../src/crew/dispatch.ts';
import { extractJson } from '../../src/crew/structured.ts';
import { parseRework, splitIssues, TeamSplitSchema } from '../../src/crew/team.ts';
import { parseVerdict } from '../../src/domain/collaboration.ts';
import { createStreamParser } from '../../src/runtime/stream.ts';

const lines = (name: string) =>
  readFileSync(join(import.meta.dirname, '../fixtures', `live-f1c-${name}.jsonl`), 'utf8')
    .split('\n')
    .filter((l) => l.trim());
const replay = (name: string) => {
  const p = createStreamParser();
  for (const l of lines(name)) p.feed(l);
  return p.outcome();
};
const cwd = (name: string) => (JSON.parse(lines(name)[0] as string) as { cwd: string }).cwd;
const toolUses = (name: string) =>
  lines(name).flatMap((l) => {
    const d = JSON.parse(l);
    if (d.type !== 'assistant') return [];
    return (d.message.content as { type: string; name: string; input: { command?: string } }[])
      .filter((c) => c.type === 'tool_use')
      .map((c) => `${c.name}${c.input.command ? ` ${c.input.command.split('\n')[0]}` : ''}`);
  });
const crew = { captainId: 'a-semic', members: ['a-semic', 'a-pete', 'a-twinkle'] };

describe('F1c live streams', () => {
  it('dispatch on an empty project: setup first, both items to the captain, a new feature linked', () => {
    const o = replay('dispatch-features');
    expect(o).toMatchObject({ status: 'succeeded', turns: 1 });
    const plan = DispatchSchema.parse(extractJson(o.result ?? ''));
    expect(plan.items.map((i) => [i.assignee, i.teamId, i.parallel ?? false])).toEqual([
      ['a-semic', 'f1c-web-crew', false],
      ['a-semic', 'f1c-web-crew', false],
    ]);
    expect(plan.items[0]?.text).toMatch(/Set up/);
    expect(plan.feature?.name).toBeTruthy();
    expect(plan.feature?.description).toBeTruthy();
  });

  it('the captain keeps the setup to itself (self), and splits the page between Pete and Twinkle (team)', () => {
    const self = TeamSplitSchema.parse(extractJson(replay('split-self').result ?? ''));
    expect(self.mode).toBe('self');
    expect(splitIssues(self, crew)).toEqual([]);
    const team = TeamSplitSchema.parse(extractJson(replay('split-team').result ?? ''));
    expect(team.mode).toBe('team');
    expect(team.subtasks.map((s) => s.assignee)).toEqual(['a-pete', 'a-twinkle', 'a-semic']);
    expect(team.subtasks.at(-1)?.parallel).toBe(false); // the captain's own part waits for the members
    expect(splitIssues(team, crew)).toEqual([]);
    expect(cwd('split-team')).toMatch(/\/worktrees\/tip-splitter-2\/build-the-tip-splitter-page-/);
  });

  it('a member builds in its own checkout and commits there; the captain integrates in the team checkout and runs the tests', () => {
    expect(cwd('member-build')).toMatch(/\/worktrees\/tip-splitter-2\/style-the-page-/);
    expect(replay('member-build').status).toBe('succeeded');
    expect(toolUses('member-build')).toContain('Bash git add public/styles.css');
    expect(cwd('integrate')).toBe(cwd('split-team'));
    const o = replay('integrate');
    expect(o.status).toBe('succeeded');
    expect(toolUses('integrate')).toContain('Bash npm test');
    expect(parseRework(o.result ?? '')).toEqual([]); // nothing sent back
  });

  it('review: an approve whose notes quote code with braces still reads as approve (the live bug)', () => {
    const o = replay('review-braces');
    expect(o.result).toContain('{ok:false, field, message}');
    expect(parseVerdict(o.result ?? '')).toMatchObject({ verdict: 'approve' });
    expect(toolUses('review-braces')).toContain('Bash node --test');
  });
});
