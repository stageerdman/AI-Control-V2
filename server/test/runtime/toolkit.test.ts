/* Toolsmiths (F1b): quality/test roles keep a toolkit folder inside the data dir, reachable via --add-dir
   (only that dir); reporters get the web research tools. */
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { cliArgs } from '../../src/runtime/claude-cli.ts';
import { composePrompt } from '../../src/runtime/compose.ts';
import { fakeRunner } from '../../src/runtime/fake.ts';
import type { RunSpec } from '../../src/runtime/runner.ts';
import { testApp } from '../helpers.ts';

function studio(seen: RunSpec[]) {
  const h = testApp({
    seed: true,
    runner: fakeRunner((s) => {
      seen.push(s);
      return [{ result: 'ok' }];
    }),
  });
  mkdirSync(join(h.config.sandbox, 'aurora'));
  h.store.projects.update('aurora', { folder: 'aurora' });
  return h;
}

describe('toolkits', () => {
  let h: ReturnType<typeof testApp>;
  afterEach(() => h.close());

  it('the seed marks QA and Quality as toolsmiths; PATCH /roles toggles it', async () => {
    const seen: RunSpec[] = [];
    h = studio(seen);
    const roles = (await h.call('GET', '/roles')).body as { name: string; toolsmith: boolean; id: string }[];
    expect(roles.filter((r) => r.toolsmith).map((r) => r.name)).toEqual(['QA', 'Quality']);
    const design = roles.find((r) => r.name === 'Design') as { id: string };
    const r = await h.call('PATCH', `/roles/${design.id}`, { toolsmith: true });
    expect(r.body).toMatchObject({ name: 'Design', toolsmith: true, reporter: false });
    expect((await h.call('PATCH', `/roles/${design.id}`, {})).status).toBe(422);
  });

  it('a toolsmith run gets its own toolkit dir (data dir, 0700) via addDirs and a toolkit section; others get none', async () => {
    const seen: RunSpec[] = [];
    h = studio(seen);
    const lint = await h.call('POST', '/projects/aurora/runs', {
      agentId: 'a-lint',
      teamId: 'polish',
      task: 'check',
    });
    await h.runtime.settled(lint.body.id);
    const pete = await h.call('POST', '/projects/aurora/runs', {
      agentId: 'a-pete',
      teamId: 'ship-it',
      task: 'build',
    });
    await h.runtime.settled(pete.body.id);
    const [l, p] = seen;
    const dir = join(h.config.home, 'toolkits', 'a-lint');
    expect(l?.addDirs).toEqual([dir]);
    expect(existsSync(dir) && (statSync(dir).mode & 0o777).toString(8)).toBe('700');
    expect(l?.systemPrompt).toContain('## Your toolkit');
    expect(l?.systemPrompt).toContain(dir);
    expect(l?.systemPrompt).toContain('`tools/sir-lint-a-lot/`');
    expect(l?.web).toBeUndefined();
    expect(p?.addDirs).toBeUndefined();
    expect(p?.systemPrompt).not.toContain('toolkit');
  });

  it('reporters get WebSearch/WebFetch; the CLI gets --add-dir for exactly the toolkit', async () => {
    const seen: RunSpec[] = [];
    h = studio(seen);
    h.store.projects.update('aurora', { agentIds: ['a-prof'] });
    const r = await h.call('POST', '/projects/aurora/runs', { agentId: 'a-prof', task: 'research' });
    await h.runtime.settled(r.body.id);
    expect(seen[0]?.web).toBe(true);

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
    const args = cliArgs(
      { ...base, addDirs: ['/data/toolkits/a-lint'], web: true },
      { askServer: '/ask.ts' },
    );
    expect(args.filter((a) => a === '--add-dir')).toHaveLength(1);
    expect(args[args.indexOf('--add-dir') + 1]).toBe('/data/toolkits/a-lint');
    expect(args[args.indexOf('--tools') + 1]).toBe('Read,Edit,Write,Glob,Grep,Bash,WebSearch,WebFetch');
    expect(args[args.indexOf('--allowed-tools') + 1]).toMatch(/,WebSearch,WebFetch$/);
    const plain = cliArgs(base, { askServer: '/ask.ts' });
    expect(plain).not.toContain('--add-dir');
    expect(plain[plain.indexOf('--tools') + 1]).not.toContain('Web');
    // big-picture runs stay tool-less
    expect(cliArgs({ ...base, tools: [] }, { askServer: '/ask.ts' })[plain.indexOf('--tools') + 1]).toBe('');
  });

  it('compose: the toolkit section points at the big picture', () => {
    const p = composePrompt({
      agent: { name: 'Q', prompt: 'x', role: 'QA' },
      project: { name: 'P' },
      toolkit: { dir: '/d/toolkits/q', projectDir: 'tools/q' },
    });
    expect(p).toMatch(/## Your toolkit[\s\S]*CLAUDE\.md, the open update plan/);
  });
});
