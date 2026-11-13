import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { streamKey } from '../../src/events/bus.ts';
import { testApp } from '../helpers.ts';

describe('event log', () => {
  let h: ReturnType<typeof testApp>;
  beforeEach(() => {
    h = testApp({ seed: true });
  });
  afterEach(() => h.close());

  it('appends with strictly increasing ids across streams and replays per stream in order', () => {
    const a = h.events.append('project', 'aurora', { type: 'progress', payload: { pct: 10 } });
    const b = h.events.append('project', 'atlas', { type: 'progress', payload: { pct: 20 } });
    const c = h.events.append('project', 'aurora', {
      type: 'tokens',
      payload: { agentId: 'a-pete', input: 5, output: 9 },
    });
    expect(a.id < b.id && b.id < c.id).toBe(true);
    expect(h.events.after('project', 'aurora').map((e) => e.id)).toEqual([a.id, c.id]);
    expect(h.events.after('project', 'aurora', a.id).map((e) => e.type)).toEqual(['tokens']);
    expect(h.events.after('project', 'aurora', 0, 1)).toHaveLength(1);
  });

  it('validates every payload against the catalogue', () => {
    const bad = [
      { type: 'progress', payload: { pct: 120 } },
      { type: 'agent.status', payload: { agentId: 'a-pete', status: 'dancing' } },
      {
        type: 'ask.opened',
        payload: { askId: 'q1', agentId: 'a-pete', kind: 'question', question: 'x', extra: 1 },
      },
      { type: 'nope', payload: {} },
    ];
    for (const e of bad) expect(() => h.events.append('project', 'aurora', e as never)).toThrow();
    expect(h.events.after('project', 'aurora')).toEqual([]);
  });

  it('never stores or publishes a secret value — not in the row, not on the bus', () => {
    const secret = 'sk_live_51HxYzVerySecretValue';
    h.secrets.set('STRIPE_KEY', secret);
    const heard: unknown[] = [];
    h.events.bus.subscribe(streamKey('project', 'aurora'), (e) => heard.push(e.payload));
    const e = h.events.append('project', 'aurora', {
      type: 'agent.status',
      payload: {
        agentId: 'a-semic',
        status: 'working',
        activity: { kind: 'coding', label: 'Wiring Stripe', detail: `using ${secret}` },
      },
    });
    expect(JSON.stringify(e)).not.toContain(secret);
    expect(JSON.stringify(heard)).not.toContain(secret);
    const rows = h.db.prepare('SELECT payload FROM events').all() as { payload: string }[];
    expect(rows.map((r) => r.payload).join()).not.toContain(secret);
    expect(JSON.stringify(e.payload)).toContain('using ••••');
  });

  it('a project’s log goes when the project goes', async () => {
    h.events.append('project', 'pebble', { type: 'progress', payload: { pct: 1 } });
    await h.call('DELETE', '/projects/pebble');
    expect(h.events.after('project', 'pebble')).toEqual([]);
  });
});
