/* The real streams of the F1b live check ("F1b Live Check", 2026-11-14): a gated dispatch, a build in its own
   worktree, the QA review that approved it (and ran its own check with node), and a reporter that researched
   the web and filed a report — replayed so the formats the model actually produced stay accepted. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DispatchSchema } from '../../src/crew/dispatch.ts';
import { extractJson } from '../../src/crew/structured.ts';
import { parseVerdict } from '../../src/domain/collaboration.ts';
import { createStreamParser } from '../../src/runtime/stream.ts';

const lines = (name: string) =>
  readFileSync(join(import.meta.dirname, '../fixtures', `${name}.jsonl`), 'utf8')
    .split('\n')
    .filter((l) => l.trim());
const replay = (name: string) => {
  const p = createStreamParser();
  for (const l of lines(name)) p.feed(l);
  return p.outcome();
};
const init = (name: string) => JSON.parse(lines(name)[0] as string) as { cwd: string; tools: string[] };
const toolUses = (name: string) =>
  lines(name).flatMap((l) => {
    const d = JSON.parse(l);
    if (d.type !== 'assistant') return [];
    return (d.message.content as { type: string; name: string; input: { command?: string } }[])
      .filter((c) => c.type === 'tool_use')
      .map((c) => `${c.name}${c.input.command ? ` ${c.input.command.split('\n')[0]}` : ''}`);
  });

describe('F1b live streams', () => {
  it('dispatch with a quality gate: one build item, no separate QA item (the gate runs on its own)', () => {
    const o = replay('live-f1b-dispatch-gated');
    expect(o).toMatchObject({ status: 'succeeded', turns: 1 });
    const plan = DispatchSchema.parse(extractJson(o.result ?? ''));
    expect(plan.items).toHaveLength(1);
    expect(plan.items[0]).toMatchObject({ assignee: 'a-pete', parallel: false });
    expect(JSON.stringify(plan.items)).not.toMatch(/\bQA\b|review/i);
  });

  it('build: works in its own checkout under the data dir and commits there with plain git commands', () => {
    expect(init('live-f1b-build-worktree').cwd).toMatch(
      /\/\.ai-studio\/worktrees\/f1b-live-check\/build-hello-html-/,
    );
    expect(replay('live-f1b-build-worktree')).toMatchObject({ status: 'succeeded', turns: 7 });
    const used = toolUses('live-f1b-build-worktree');
    expect(used).toContain('Bash git add hello.html');
    expect(used.some((u) => u.startsWith('Bash git commit -m'))).toBe(true);
  });

  it('review: same checkout, diffs from the base, runs its own check with node (dev shell), ends with an approve verdict', () => {
    expect(init('live-f1b-review-approve').cwd).toBe(init('live-f1b-build-worktree').cwd);
    const o = replay('live-f1b-review-approve');
    expect(o.status).toBe('succeeded');
    expect(parseVerdict(o.result ?? '')).toMatchObject({ verdict: 'approve' });
    const used = toolUses('live-f1b-review-approve');
    expect(used[0]).toMatch(/^Bash git diff [0-9a-f]{12}\.\.HEAD$/);
    expect(used).toContain('Bash node tools/scarlett-scenario/check-hello.mjs');
  });

  it('report: the reporter had WebSearch/WebFetch + file_report, used them, and filed', () => {
    expect(init('live-f1b-report-web').tools).toEqual(
      expect.arrayContaining(['WebSearch', 'WebFetch', 'mcp__studio__file_report', 'mcp__studio__ask_user']),
    );
    expect(replay('live-f1b-report-web')).toMatchObject({ status: 'succeeded', turns: 11 });
    const used = toolUses('live-f1b-report-web');
    expect(used.filter((u) => u === 'WebSearch')).toHaveLength(2);
    expect(used.at(-1)).toBe('mcp__studio__file_report');
  });
});
