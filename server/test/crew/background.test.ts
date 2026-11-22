/* Shutdown waits for background work (a merge, a checkout put away) — including what that work starts. */
import { describe, expect, it } from 'vitest';
import { createBackground } from '../../src/crew/background.ts';

const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('background work', () => {
  it('drain waits for pending work and for the work it starts, failures included', async () => {
    const bg = createBackground();
    const done: string[] = [];
    bg.track(
      tick(5).then(() => {
        done.push('merge');
        bg.track(tick(5).then(() => done.push('put away')));
      }),
    );
    bg.track(Promise.reject(new Error('push failed'))).catch(() => done.push('failed, handled'));
    bg.soon(() => done.push('alert'));
    await bg.drain();
    expect(done.sort()).toEqual(['alert', 'failed, handled', 'merge', 'put away']);
    expect(bg.size()).toBe(0);
  });
});
