/* F1c: run the project's app — the command from .project / package.json, one process per project, its address,
   a masked log tail, stop (whole process group) and stop-on-shutdown; the health view shows it. */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { maskLine, urlIn } from '../../src/apps/app-runner.ts';
import { readRunLine, runCommandOf } from '../../src/apps/run-command.ts';
import { testApp } from '../helpers.ts';

const SERVER = `
console.log('\\u001b[32m  VITE ready\\u001b[0m');
console.log('  Local:   http://localhost:5199/');
console.log('token is ' + process.env.SHH + ' sk-live-abcdef123456');
console.log('home set: ' + Boolean(process.env.HOME) + ', server secret leaked: ' + Boolean(process.env.AI_STUDIO_TEST_LEAK));
setInterval(() => {}, 1000);
`;

const wait = async (fn: () => Promise<boolean>) => {
  for (let i = 0; i < 300; i++) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('timed out');
};
const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

describe('run the app (F1c)', () => {
  let h: ReturnType<typeof testApp>;
  let dir: string;
  afterEach(() => h.close());
  const setup = (files: Record<string, string>) => {
    h = testApp({ seed: true });
    dir = join(h.config.sandbox, 'aurora');
    mkdirSync(dir);
    for (const [f, t] of Object.entries(files)) writeFileSync(join(dir, f), t);
    h.store.projects.update('aurora', { folder: 'aurora' });
  };

  it('starts the recorded command, finds its address, masks secrets, stops the whole group', async () => {
    process.env.AI_STUDIO_TEST_LEAK = 'x';
    setup({ '.project': 'name: Aurora\nrun: node server.js\n', 'server.js': SERVER });
    h.secrets.set('SHH', 'sk-live-abcdef123456');
    const before = (await h.call('GET', '/projects/aurora/app')).body;
    expect(before).toMatchObject({
      status: 'stopped',
      command: 'node server.js',
      source: '.project',
      url: null,
      log: [],
    });

    const r = await h.call('POST', '/projects/aurora/app/start');
    expect(r.status).toBe(202);
    expect(r.body.status).toBe('running');
    expect((await h.call('POST', '/projects/aurora/app/start')).status).toBe(409); // one at a time
    await wait(async () => !!(await h.call('GET', '/projects/aurora/app')).body.url);
    await wait(async () => (await h.call('GET', '/projects/aurora/app')).body.log.length >= 4);
    const v = (await h.call('GET', '/projects/aurora/app')).body;
    expect(v.url).toBe('http://localhost:5199/');
    expect(v.log[0]).toBe('  VITE ready'); // ANSI stripped
    expect(v.log.join('\n')).not.toContain('sk-live-abcdef123456');
    expect(v.log.join('\n')).toContain('token is undefined ••••'); // not in its env, and masked anyway
    expect(v.log.join('\n')).toContain('home set: true, server secret leaked: false');
    const health = (await h.call('GET', '/projects/aurora/health')).body;
    expect(health.app).toEqual({
      status: 'running',
      url: 'http://localhost:5199/',
      command: 'node server.js',
    });

    const pid = v.pid as number;
    const s = await h.call('POST', '/projects/aurora/app/stop');
    expect(s.body).toMatchObject({ status: 'stopped', url: null, pid: null });
    expect(alive(pid)).toBe(false);
    const ev = h.events
      .after('project', 'aurora')
      .filter((e) => e.type === 'app.status')
      .map((e) => e.payload);
    expect(ev).toEqual([
      { status: 'running' },
      { status: 'running', url: 'http://localhost:5199/' },
      expect.objectContaining({ status: 'stopped' }),
    ]);
    delete process.env.AI_STUDIO_TEST_LEAK;
  });

  it('an app that ends on its own reads exited with its code; package.json scripts are the fallback', async () => {
    setup({
      'package.json': JSON.stringify({ scripts: { start: 'node -e "console.log(1); process.exit(3)"' } }),
    });
    expect((await h.call('GET', '/projects/aurora/app')).body).toMatchObject({
      command: 'npm start',
      source: 'package.json',
    });
    await h.call('PATCH', '/projects/aurora/app', { command: 'x' }).then((r) => expect(r.status).toBe(409)); // no .project
    writeFileSync(join(dir, '.project'), 'name: Aurora\n');
    const p = await h.call('PATCH', '/projects/aurora/app', { command: 'node -e "process.exit(3)"' });
    expect(p.body).toMatchObject({ command: 'node -e "process.exit(3)"', source: '.project' });
    expect(readFileSync(join(dir, '.project'), 'utf8')).toBe(
      'name: Aurora\nrun: node -e "process.exit(3)"\n',
    );
    await h.call('POST', '/projects/aurora/app/start');
    await wait(async () => (await h.call('GET', '/projects/aurora/app')).body.status === 'exited');
    expect((await h.call('GET', '/projects/aurora/app')).body).toMatchObject({
      status: 'exited',
      exitCode: 3,
    });
    expect((await h.call('PATCH', '/projects/aurora/app', { command: 'a\nb' })).status).toBe(422);
  });

  it('no way to start it → a calm 409; the server shutting down stops a running app', async () => {
    setup({ '.project': 'name: Aurora\n' });
    const r = await h.call('POST', '/projects/aurora/app/start');
    expect(r.status).toBe(409);
    expect(r.body.error.message).toMatch(/Nobody has recorded how to start this app/);
    writeFileSync(join(dir, 'server.js'), SERVER);
    await h.call('PATCH', '/projects/aurora/app', { command: 'node server.js' });
    const pid = (await h.call('POST', '/projects/aurora/app/start')).body.pid as number;
    expect(alive(pid)).toBe(true);
    await h.app.close();
    expect(alive(pid)).toBe(false);
  });

  it('pure helpers', () => {
    expect(readRunLine('name: x\nrun:  "npm run dev" \n')).toBe('npm run dev');
    expect(readRunLine('name: x\n')).toBeNull();
    expect(runCommandOf('/nonexistent')).toBeNull();
    expect(urlIn('  ➜  Local:   http://0.0.0.0:3000/app.')).toBe('http://localhost:3000/app');
    expect(urlIn('Listening on http://127.0.0.1:8080')).toBe('http://127.0.0.1:8080');
    expect(urlIn('see https://example.com')).toBeNull();
    expect(maskLine('a secret123 b', ['secret123', 'ab'])).toBe('a •••• b');
  });
});
