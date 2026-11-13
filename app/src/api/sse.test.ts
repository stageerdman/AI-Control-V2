import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openEventStream, type StreamStatus } from './sse';

class FakeES {
  static all: FakeES[] = [];
  readyState = 0;
  onopen: ((e: Event) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  listeners = new Map<string, ((e: MessageEvent) => void)[]>();
  closed = false;
  constructor(readonly url: string) {
    FakeES.all.push(this);
  }
  addEventListener(t: string, fn: (e: MessageEvent) => void) {
    this.listeners.set(t, [...(this.listeners.get(t) ?? []), fn]);
  }
  close() {
    this.closed = true;
    this.readyState = 2;
  }
  open() {
    this.readyState = 1;
    this.onopen?.(new Event('open'));
  }
  emit(type: string, id: number, payload: unknown = {}) {
    const data = JSON.stringify({ id, projectId: 'p', type, payload, at: 'now' });
    for (const fn of this.listeners.get(type) ?? [])
      fn(new MessageEvent(type, { data, lastEventId: String(id) }));
  }
  fail(closed: boolean) {
    this.readyState = closed ? 2 : 0;
    this.onerror?.(new Event('error'));
  }
}
const ES = FakeES as unknown as NonNullable<Parameters<typeof openEventStream>[2]>['EventSource'];

describe('openEventStream', () => {
  beforeEach(() => {
    FakeES.all = [];
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it('delivers named events, tracks status, drops duplicates', () => {
    const got: number[] = [];
    const st: StreamStatus[] = [];
    const s = openEventStream('http://h/projects/p/events', (e) => got.push(e.id), {
      EventSource: ES,
      onStatus: (x) => st.push(x),
    });
    const es = FakeES.all[0];
    expect(es.url).toBe('http://h/projects/p/events');
    es.open();
    es.emit('agent.status', 1);
    es.emit('progress', 2);
    es.emit('progress', 2);
    es.emit('run.started', 1);
    expect(got).toEqual([1, 2]);
    expect(st).toEqual(['connecting', 'open']);
    s.close();
    expect(es.closed).toBe(true);
    expect(st.at(-1)).toBe('closed');
  });

  it('when the browser retries by itself (CONNECTING) it does not open a second stream', () => {
    openEventStream('http://h/e', () => {}, { EventSource: ES });
    FakeES.all[0].fail(false);
    vi.advanceTimersByTime(60_000);
    expect(FakeES.all).toHaveLength(1);
  });

  it('when CLOSED it reconnects with ?after=<last id> and backoff, and resumes without duplicates', () => {
    const got: number[] = [];
    const st: StreamStatus[] = [];
    openEventStream('http://h/e', (e) => got.push(e.id), {
      EventSource: ES,
      onStatus: (x) => st.push(x),
      backoffMs: (n) => 100 * (n + 1),
    });
    const a = FakeES.all[0];
    a.open();
    a.emit('progress', 5);
    a.fail(true);
    expect(a.closed).toBe(true);
    vi.advanceTimersByTime(99);
    expect(FakeES.all).toHaveLength(1);
    vi.advanceTimersByTime(1);
    const b = FakeES.all[1];
    expect(b.url).toBe('http://h/e?after=5');
    b.fail(true); /* still down: next try waits longer */
    vi.advanceTimersByTime(199);
    expect(FakeES.all).toHaveLength(2);
    vi.advanceTimersByTime(1);
    const c = FakeES.all[2];
    expect(c.url).toBe('http://h/e?after=5');
    c.open();
    c.emit('progress', 5); /* replayed again — dropped */
    c.emit('progress', 6);
    expect(got).toEqual([5, 6]);
    expect(st).toEqual([
      'connecting',
      'open',
      'reconnecting',
      'reconnecting',
      'reconnecting',
      'reconnecting',
      'open',
    ]);
  });

  it('starts after a given id and stops reconnecting once closed', () => {
    const s = openEventStream('http://h/e?x=1', () => {}, { EventSource: ES, after: 9 });
    expect(FakeES.all[0].url).toBe('http://h/e?x=1&after=9');
    FakeES.all[0].fail(true);
    s.close();
    vi.advanceTimersByTime(60_000);
    expect(FakeES.all).toHaveLength(1);
  });
});
