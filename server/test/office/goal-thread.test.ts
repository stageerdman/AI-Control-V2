/* F1b gaps: a goal and the orchestrator's plan reply live in its thread; report follow-ups carry the report;
   caps and the agent shell are configured in one place. */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { cliArgs, shellAllowed } from '../../src/runtime/claude-cli.ts';
import { composePrompt } from '../../src/runtime/compose.ts';
import { AGENT_SHELL, loadCaps, loadShell } from '../../src/runtime/config.ts';
import type { RunSpec } from '../../src/runtime/runner.ts';
import { scriptedCrew } from '../crew/brain.ts';
import { testApp } from '../helpers.ts';

function studio(answers: Parameters<typeof scriptedCrew>[0]) {
  const crew = scriptedCrew(answers, () => [{ result: 'ok' }]);
  const h = testApp({ seed: true, runner: crew.runner });
  mkdirSync(join(h.config.sandbox, 'aurora'));
  h.store.projects.update('aurora', { folder: 'aurora' });
  return { h, crew };
}

describe('the orchestrator thread records goals; follow-ups carry the report', () => {
  let h: ReturnType<typeof testApp>;
  afterEach(() => h.close());

  it('a goal → the user line + the plan reply (who does what, who checks) with the goal id; a failed plan → a calm error', async () => {
    const s = studio({
      dispatch: [
        {
          summary: 'Search first, then tidy.',
          items: [
            { text: 'Build search', assignee: 'a-semic', teamId: 'ship-it', brief: 'b' },
            { text: 'Compare engines', assignee: 'a-baron', brief: 'b' },
          ],
        },
        'not json',
        'still not json',
      ],
    });
    h = s.h;
    h.store.projects.update('aurora', {
      collaboration: {
        orchestratorTalksTo: 'captains',
        gates: [{ after: 'ship-it', reviewer: 'a-lint', kind: 'quality', why: 'w' }],
        maxSendBacks: 2,
        summary: 's',
      },
    });
    const g = (await h.call('POST', '/projects/aurora/work', { goal: 'Ship search' })).body;
    const t = (await h.call('GET', '/projects/aurora/threads/a-pixel/messages')).body;
    expect(t.messages.map((m: { from: string; goalId: string }) => [m.from, m.goalId])).toEqual([
      ['user', g.id],
      ['a-pixel', g.id],
    ]);
    expect(t.messages[0].text).toBe('Ship search');
    expect(t.messages[1].text).toBe(
      'Search first, then tidy.\n\nOn the whiteboard:\n• Build search — Captain Semicolon (checked by Sir Lint-a-lot)\n• Compare engines — Baron von Backup',
    );
    const ev = h.events.after('project', 'aurora').filter((e) => e.type === 'thread.message');
    expect(ev.map((e) => (e.payload as { goalId?: string }).goalId)).toEqual([g.id, g.id]);

    expect((await h.call('POST', '/projects/aurora/work', { goal: 'Again' })).status).toBe(502);
    const after = (await h.call('GET', '/projects/aurora/threads/a-pixel/messages')).body.messages;
    expect(after.at(-2)).toMatchObject({ from: 'user', text: 'Again', goalId: null });
    expect(after.at(-1)).toMatchObject({ from: 'a-pixel', kind: 'error' });
    expect(after.at(-1).text).toMatch(/^I couldn’t plan that: /);
  });

  it('a follow-up on a report carries its title, summary and a body excerpt; unknown report → 404', async () => {
    const s = studio({});
    h = s.h;
    h.store.projects.update('aurora', { agentIds: ['a-prof'] });
    h.db
      .prepare(
        `INSERT INTO reports (id, project_id, kind, title, summary, body, author, created_at)
         VALUES ('rep_1', 'aurora', 'research', 'Payment providers', 'Stripe wins.', ?, ?, '2026-11-14T00:00:00Z')`,
      )
      .run(
        `## Findings\n\nStripe has the best docs.${' x'.repeat(5000)}`,
        JSON.stringify({ agentId: 'a-prof', name: 'Professor Prompt', teamId: null, teamName: null }),
      );
    const r = await h.call('POST', '/projects/aurora/threads/a-prof/messages', {
      text: 'Why not Adyen?',
      reportId: 'rep_1',
    });
    expect(r.status).toBe(202);
    expect(r.body.message).toMatchObject({ text: 'Why not Adyen?', reportId: 'rep_1' });
    const spec = s.crew.calls.at(-1) as RunSpec;
    expect(spec.task).toContain('The user is following up on this report (Professor Prompt, 2026-11-14)');
    expect(spec.task).toContain('Title: "Payment providers"');
    expect(spec.task).toContain('Summary: "Stripe wins."');
    expect(spec.task).toMatch(/Report \(excerpt\): "## Findings\\n\\nStripe has the best docs\./);
    expect(spec.task.length).toBeLessThan(6000);
    await h.runtime.settled(r.body.runId);
    const bad = await h.call('POST', '/projects/aurora/threads/a-prof/messages', {
      text: 'x',
      reportId: 'rep_nope',
    });
    expect(bad.status).toBe(404);
  });
});

describe('caps + agent shell', () => {
  it('sane defaults (agent 120, review 15, orchestrator 6 turns), turn caps from env', () => {
    expect(loadCaps({})).toEqual({
      agent: { maxTurns: 120, maxBudgetUsd: 10 },
      review: { maxTurns: 15, maxBudgetUsd: 5 },
      orchestrator: { maxTurns: 6, maxBudgetUsd: 2 },
    });
    const c = loadCaps({
      AI_STUDIO_AGENT_TURNS: '50',
      AI_STUDIO_REVIEW_TURNS: 'x',
      AI_STUDIO_ORCHESTRATOR_TURNS: '0',
    });
    expect([c.agent.maxTurns, c.review.maxTurns, c.orchestrator.maxTurns]).toEqual([50, 15, 6]);
  });

  it('dev shell by default (mkdir, npm, npx, node), safe on request; the prompt names exactly what is approved', () => {
    expect(loadShell({})).toBe(AGENT_SHELL.dev);
    expect(loadShell({ AI_STUDIO_AGENT_SHELL: 'safe' })).toBe(AGENT_SHELL.safe);
    expect(shellAllowed(['npm', 'pwd'])).toEqual(['Bash(npm)', 'Bash(npm *)', 'Bash(pwd)']);
    const base = {
      runId: 'r',
      cwd: '/x',
      systemPrompt: 'p',
      task: 't',
      model: 'm',
      caps: { maxTurns: 1, maxBudgetUsd: 1 },
      env: {},
      secretValues: [],
    };
    const allowed = cliArgs(base, { askServer: '/a.ts' }).find((a) => a.includes('Bash(npm *)'));
    expect(allowed).toContain('Bash(git *)');
    const p = composePrompt({
      agent: { name: 'A', prompt: 'x', role: 'r' },
      project: { name: 'P' },
      shell: AGENT_SHELL.dev,
    });
    expect(p).toContain('`git`, `ls`, `cat`, `pwd`, `mkdir`, `npm`, `npx` and `node` are pre-approved');
    expect(p).toContain('Commit your work with git');
  });
});
