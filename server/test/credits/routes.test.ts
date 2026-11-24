import type { ServerResponse } from 'node:http';
import Fastify from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { createCredits } from '../../src/credits/credits.ts';
import type { LimitReading } from '../../src/credits/reading.ts';
import { openDb } from '../../src/db/connection.ts';
import { createStore } from '../../src/db/store.ts';
import { creditsRoutes } from '../../src/routes/credits.ts';
import { seedIfNeeded } from '../../src/seed.ts';
import { connect, type SseClient } from '../sse-client.ts';

const NOW = Date.parse('2026-11-24T12:00:00.000Z');
const reading = (used: number): LimitReading => ({
  at: '2026-11-24T12:00:00.000Z',
  overage: false,
  windows: [{ name: 'five_hour', used, resetsAt: '2026-11-24T15:00:00.000Z', status: 'allowed' }],
});

function setup(refreshMs?: number) {
  const db = openDb(':memory:');
  const store = createStore(db, { sandbox: '/tmp/none' });
  seedIfNeeded(store);
  const credits = createCredits({ db, store, now: () => NOW });
  const open = new Set<ServerResponse>();
  const app = Fastify();
  app.register(creditsRoutes({ credits, open, ...(refreshMs ? { refreshMs } : {}) }));
  app.addHook('onClose', async () => {
    for (const res of open) res.end();
  });
  return { db, store, credits, app };
}

let cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const c of cleanup) await c();
  cleanup = [];
});

describe('GET /credits', () => {
  it('none before any reading; then the forecast with the studio’s share per agent', async () => {
    const { app, credits, db, store } = setup();
    cleanup.push(() => app.close());
    expect((await app.inject('/credits')).json()).toMatchObject({
      state: 'none',
      binding: null,
      studioShare: [],
    });

    const project = store.projects.list()[0];
    if (!project) throw new Error('seed made no project');
    db.prepare(
      `INSERT INTO runs (id, project_id, agent_id, task, status, runner, caps, started_at, input_tokens, output_tokens)
       VALUES ('r1', ?, ?, 't', 'succeeded', 'fake', '{}', '2026-11-24T11:00:00.000Z', 900, 100)`,
    ).run(project.id, project.orchestratorId);
    credits.record(reading(0.5));

    const body = (await app.inject('/credits')).json();
    expect(Object.keys(body).sort()).toEqual([
      'at',
      'binding',
      'readingAgeMs',
      'state',
      'studioShare',
      'windows',
    ]);
    expect(body).toMatchObject({ state: 'warning', binding: 'five_hour', readingAgeMs: 0 });
    expect(Object.keys(body.windows[0]).sort()).toEqual([
      'hitsAt',
      'left',
      'name',
      'opensAt',
      'ratePerHour',
      'readingAgeMs',
      'resetsAt',
      'used',
      'verdict',
    ]);
    expect(body.studioShare).toEqual([
      {
        agentId: project.orchestratorId,
        name: store.agents.get(project.orchestratorId)?.name,
        tokens: 1000,
        share: 1,
      },
    ]);
  });
});

describe('GET /credits/events', () => {
  const live = async (refreshMs?: number) => {
    const s = setup(refreshMs);
    const url = await s.app.listen({ port: 0, host: '127.0.0.1' });
    const client: SseClient = await connect(`${url}/credits/events`);
    cleanup.push(async () => {
      client.close();
      await s.app.close();
    });
    const views = () =>
      client
        .events()
        .filter((e) => e.type === 'credits')
        .map((e) => e.body);
    return { ...s, client, views };
  };

  it('sends the view on connect and again after each new reading (not for an unchanged one)', async () => {
    const { client, credits, views } = await live();
    await client.waitFor(() => views().length === 1);
    expect(views()[0]).toMatchObject({ state: 'none' });
    credits.record(reading(0.2));
    await client.waitFor(() => views().length === 2);
    expect(views()[1]).toMatchObject({ state: 'ok', binding: 'five_hour' });
    credits.record(reading(0.2));
    credits.record(reading(0.3));
    await client.waitFor(() => views().length === 3);
    expect(views()[2]).toMatchObject({ windows: [{ used: 0.3 }] });
  });

  it('re-sends on its own timer while idle', async () => {
    const { client, views } = await live(30);
    await client.waitFor(() => views().length >= 3);
  });

  it('stops telling a client that left', async () => {
    const { client, credits } = await live();
    await client.waitFor(() => client.events().length === 1);
    client.close();
    await new Promise((r) => setTimeout(r, 50));
    expect(() => credits.record(reading(0.4))).not.toThrow();
  });
});
