import { describe, expect, it } from 'vitest';
import { checkServer, parseHealth, startBackend } from './health';

const body = {
  ok: true,
  version: '0.1.0',
  paths: {
    home: '/h/.ai-studio',
    sandbox: '/h/sb',
    controlHome: '/h/.ai-control',
    db: '/h/.ai-studio/studio.db',
  },
  db: { ok: true },
};
const started =
  (b: unknown, reused = false) =>
  async () => ({ reused, health: JSON.stringify(b) });

describe('parseHealth', () => {
  it('accepts the server shape and keeps only what the UI needs', () => {
    const h = parseHealth(JSON.stringify(body));
    expect(h).toEqual({ ok: true, version: '0.1.0', paths: body.paths });
  });

  it('rejects non-JSON and wrong shapes with readable errors', () => {
    expect(() => parseHealth('<html>')).toThrow(/not with JSON/);
    expect(() => parseHealth('null')).toThrow(/unexpected/);
    expect(() => parseHealth(JSON.stringify({ ...body, paths: { home: 1 } }))).toThrow(/unexpected/);
  });
});

describe('startBackend', () => {
  it('is ready when the server is healthy (spawned or reused)', async () => {
    expect(await startBackend(started(body))).toMatchObject({ kind: 'ready', reused: false });
    expect(await startBackend(started(body, true))).toMatchObject({ kind: 'ready', reused: true });
  });

  it('calls the backend_start command', async () => {
    const calls: string[] = [];
    await startBackend(async (cmd) => {
      calls.push(cmd);
      return { reused: false, health: JSON.stringify(body) };
    });
    expect(calls).toEqual(['backend_start']);
  });

  it('turns a rejected start into an honest error (Rust sends strings)', async () => {
    const s = await startBackend(async () => {
      throw "The server didn't answer on port 4319 within 30s.";
    });
    expect(s).toEqual({ kind: 'error', message: "The server didn't answer on port 4319 within 30s." });
  });

  it('reports an unhealthy db and a garbled body as errors', async () => {
    expect((await startBackend(started({ ...body, ok: false }))).kind).toBe('error');
    expect(await startBackend(async () => ({ reused: false, health: 'oops' }))).toMatchObject({
      kind: 'error',
      message: expect.stringMatching(/JSON/),
    });
  });
});

describe('checkServer (browser, no Tauri)', () => {
  it('reads /health from the given url', async () => {
    const f = async (u: string | URL | Request) => {
      expect(String(u)).toBe('http://x:1/health');
      return new Response(JSON.stringify(body));
    };
    const s = await checkServer('http://x:1', f as typeof fetch);
    expect(s).toMatchObject({ kind: 'ready', health: { version: '0.1.0' } });
  });
  it('explains a missing server', async () => {
    const s = await checkServer('http://x:1', (async () => {
      throw new TypeError('Failed to fetch');
    }) as typeof fetch);
    expect(s.kind).toBe('error');
    expect(s.kind === 'error' && s.message).toMatch(/No studio server at http:\/\/x:1/);
  });
});

describe('watchStep + ping (the live watch)', () => {
  it('is lost only after two failures in a row; one success resets', async () => {
    const { watchStep } = await import('./health');
    let s = watchStep(0, false);
    expect(s).toEqual({ fails: 1, lost: false });
    s = watchStep(s.fails, false);
    expect(s.lost).toBe(true);
    expect(watchStep(s.fails, true)).toEqual({ fails: 0, lost: false });
  });

  it('pings: healthy → true; down, 503 or garbage → false (never throws)', async () => {
    const { ping } = await import('./health');
    const ok = (async () => new Response(JSON.stringify(body))) as unknown as typeof fetch;
    const down = (async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    const sick = (async () => new Response('{}', { status: 503 })) as unknown as typeof fetch;
    const junk = (async () => new Response('<html>')) as unknown as typeof fetch;
    expect(await ping('http://x', ok)).toBe(true);
    expect(await ping('http://x', down)).toBe(false);
    expect(await ping('http://x', sick)).toBe(false);
    expect(await ping('http://x', junk)).toBe(false);
  });
});

describe('portBase + the started port', () => {
  it('keeps host and path, swaps the port', async () => {
    const { portBase } = await import('./health');
    expect(portBase('http://127.0.0.1:4319', 4391)).toBe('http://127.0.0.1:4391');
    expect(portBase('http://localhost:1501/api', 4391)).toBe('http://localhost:4391/api');
    expect(portBase('nonsense', 4391)).toBe('http://127.0.0.1:4391');
  });
  it("startBackend passes the reused backend's port through", async () => {
    const s = await startBackend(async () => ({ reused: true, health: JSON.stringify(body), port: 4391 }));
    expect(s).toMatchObject({ kind: 'ready', reused: true, port: 4391 });
  });
});
