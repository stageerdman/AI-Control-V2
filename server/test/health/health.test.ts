import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { extractJson } from '../../src/crew/structured.ts';
import { HEALTH_ALLOWED, HealthSchema } from '../../src/health/health.ts';
import { cliArgs } from '../../src/runtime/claude-cli.ts';
import { createStreamParser } from '../../src/runtime/stream.ts';
import { type Answer, scriptedCrew } from '../crew/brain.ts';
import { testApp } from '../helpers.ts';

const GOOD = {
  modularity: { grade: 'B', good: 'Small files.', fix: 'Split the big one.' },
  cleanliness: { grade: 'A', good: 'Tidy.', fix: 'Keep issues.txt current.' },
  reusability: { grade: 'C', good: 'Little duplication.', fix: 'Share the button.' },
  summary: 'Healthy, with one big file to split.',
};

function studio(answers: Record<string, Answer[]>) {
  const crew = scriptedCrew(answers);
  const h = testApp({ seed: true, runner: crew.runner });
  const dir = join(h.config.sandbox, 'aurora');
  mkdirSync(dir);
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
  h.store.projects.update('aurora', { folder: 'aurora' });
  return { h, crew, dir };
}

describe('health check', () => {
  let h: ReturnType<typeof testApp>;
  afterEach(() => h.close());

  it('runs read-only in the project folder, persists the report (latest + history), announces it', async () => {
    const s = studio({ health: [GOOD, { ...GOOD, summary: 'Second look.' }] });
    h = s.h;
    expect((await h.call('GET', '/projects/aurora/health')).body).toMatchObject({
      latest: null,
      history: [],
      git: { repo: true, branch: 'main', commits: 0 },
    });
    const r = await h.call('POST', '/projects/aurora/health', {});
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({
      ...GOOD,
      projectId: 'aurora',
      git: { repo: true, clean: true, remote: null, github: { note: 'No remote — local only' } },
      usage: { attempts: 1, turns: 1, input: 200, output: 40 },
    });
    await h.call('POST', '/projects/aurora/health', {});
    const got = (await h.call('GET', '/projects/aurora/health')).body;
    expect(got.latest.summary).toBe('Second look.');
    expect(got.history.map((x: { summary: string }) => x.summary)).toEqual(['Second look.', GOOD.summary]);
    const ev = h.events.after('project', 'aurora').find((e) => e.type === 'health.checked');
    expect(ev?.payload).toEqual({
      reportId: r.body.id,
      modularity: 'B',
      cleanliness: 'A',
      reusability: 'C',
      summary: GOOD.summary,
    });

    // read-only by construction: cwd = the project, no Write/Edit tool, Bash only read-only commands
    const [spec] = s.crew.crewCalls();
    expect(spec?.cwd).toBe(s.dir);
    expect(spec?.tools).toEqual(['Read', 'Glob', 'Grep', 'Bash']);
    expect(spec?.secretValues).toEqual([]);
    expect(spec?.systemPrompt).toMatch(/^# Pixel[\s\S]*health inspector/);
    const argv = cliArgs(spec as NonNullable<typeof spec>, { askServer: '/a.ts' });
    expect(argv[argv.indexOf('--tools') + 1]).toBe('Read,Glob,Grep,Bash');
    const allowed = argv[argv.indexOf('--allowed-tools') + 1]?.split(',') ?? [];
    expect(allowed).toEqual(HEALTH_ALLOWED);
    for (const a of allowed) expect(a).not.toMatch(/Write|Edit|git (add|commit|push|checkout|reset)|rm /);
  });

  it('one repair, then 502 with nothing stored', async () => {
    const bad = { ...GOOD, modularity: { ...GOOD.modularity, grade: 'E' } };
    const s = studio({ health: [bad, GOOD, 'All good!', bad] });
    h = s.h;
    const ok = await h.call('POST', '/projects/aurora/health', {});
    expect(ok.status).toBe(201);
    expect(ok.body.usage.attempts).toBe(2);
    expect(s.crew.crewCalls()[1]?.task).toMatch(
      /^AI Studio contract: health \(repair\)[\s\S]*modularity\.grade/,
    );
    const no = await h.call('POST', '/projects/aurora/health', {});
    expect(no.status).toBe(502);
    expect((await h.call('GET', '/projects/aurora/health')).body.history).toHaveLength(1);
  });

  it('refuses without a folder; one check at a time', async () => {
    const s = studio({ health: [[{ wait: 80 }, { result: JSON.stringify(GOOD) }]] });
    h = s.h;
    expect((await h.call('POST', '/projects/atlas/health', {})).status).toBe(409);
    expect((await h.call('GET', '/projects/atlas/health')).status).toBe(409);
    const first = h.call('POST', '/projects/aurora/health', {});
    await new Promise((r) => setTimeout(r, 20));
    expect((await h.call('POST', '/projects/aurora/health', {})).status).toBe(409);
    expect((await first).status).toBe(201);
    expect((await h.call('POST', '/projects/aurora/health', { caps: { maxTurns: 0 } })).status).toBe(422);
  });

  it('a recorded-style health stream parses to a valid report', () => {
    const p = createStreamParser();
    const kinds: string[] = [];
    for (const line of readFileSync(
      join(import.meta.dirname, '../fixtures/health-stream.jsonl'),
      'utf8',
    ).split('\n'))
      for (const e of line.trim() ? p.feed(line) : []) if (e.kind === 'activity') kinds.push(e.activity.kind);
    const o = p.outcome();
    expect(o).toMatchObject({ status: 'succeeded', turns: 4 });
    expect(kinds).toEqual(['searching', 'reading', 'running']);
    expect(HealthSchema.parse(extractJson(o.result ?? '')).reusability.grade).toBe('C');
  });

  it('the fake brain answers health checks too (AI_STUDIO_RUNNER=fake)', async () => {
    h = testApp({ seed: true });
    mkdirSync(join(h.config.sandbox, 'aurora'));
    h.store.projects.update('aurora', { folder: 'aurora' });
    const r = await h.call('POST', '/projects/aurora/health', {});
    expect(r.status).toBe(201);
    expect(r.body.git.repo).toBe(false);
    expect(r.body.cleanliness.grade).toBe('A');
  });
});
