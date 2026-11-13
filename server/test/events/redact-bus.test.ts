import { describe, expect, it } from 'vitest';
import { createBus, type StoredEvent, streamKey } from '../../src/events/bus.ts';
import { REDACTED, redactSecrets } from '../../src/events/redact.ts';

describe('redactSecrets', () => {
  it('replaces known secret values anywhere in nested strings', () => {
    const secret = 'super-secret-value-123';
    const r = redactSecrets({ a: `token=${secret}!`, list: [{ deep: secret }], n: 5, ok: true }, [
      secret,
      'short',
    ]);
    expect(r.value).toEqual({ a: `token=${REDACTED}!`, list: [{ deep: REDACTED }], n: 5, ok: true });
    expect(r.redacted).toBe(2);
  });

  it('catches common key shapes even when the store doesn’t know them', () => {
    const keys = [
      'sk-ant-api03-abcdefghijklmnopqrstuv',
      'ghp_abcdefghijklmnopqrstuvwxyz0123456789',
      'AKIAABCDEFGHIJKLMNOP',
      'sk-proj-abcdefghijklmnopqrstuvwx',
    ];
    for (const k of keys) expect(redactSecrets(`use ${k} now`, []).value).toBe(`use ${REDACTED} now`);
  });

  it('leaves ordinary text alone and never scans values shorter than 8 chars', () => {
    expect(redactSecrets('ask the sk-learn docs; use key abc', ['abc', 'key']).value).toBe(
      'ask the sk-learn docs; use key abc',
    );
  });
});

describe('event bus', () => {
  const ev = (scopeId: string, id: number): StoredEvent => ({
    id,
    scope: 'project',
    scopeId,
    type: 'progress',
    payload: {},
    at: '',
  });

  it('fans out per stream to every subscriber; unsubscribe stops delivery and frees the stream', () => {
    const bus = createBus();
    const a: number[] = [];
    const b: number[] = [];
    const other: number[] = [];
    const ua = bus.subscribe(streamKey('project', 'p'), (e) => a.push(e.id));
    bus.subscribe(streamKey('project', 'p'), (e) => b.push(e.id));
    bus.subscribe(streamKey('project', 'q'), (e) => other.push(e.id));
    bus.publish(ev('p', 1));
    ua();
    bus.publish(ev('p', 2));
    expect([a, b, other]).toEqual([[1], [1, 2], []]);
    expect(bus.listenerCount(streamKey('project', 'p'))).toBe(1);
  });

  it('a throwing subscriber never blocks the others', () => {
    const bus = createBus();
    const got: number[] = [];
    bus.subscribe(streamKey('project', 'p'), () => {
      throw new Error('boom');
    });
    bus.subscribe(streamKey('project', 'p'), (e) => got.push(e.id));
    bus.publish(ev('p', 7));
    expect(got).toEqual([7]);
  });
});
