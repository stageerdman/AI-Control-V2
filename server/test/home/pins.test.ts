/* HOME My Workplace: PUT /projects/pins sets the whole ordered list (pin, unpin and reorder are one call). */
import { afterEach, describe, expect, it } from 'vitest';
import { tempDir, testApp } from '../helpers.ts';

type P = { id: string; pinRank: number | null };
type H = ReturnType<typeof testApp>;

/** The pinned ids, in My Workplace order. */
const pinned = (list: P[]) =>
  list
    .filter((p) => p.pinRank !== null)
    .sort((a, b) => (a.pinRank as number) - (b.pinRank as number))
    .map((p) => p.id);
const listed = async (h: H) => pinned((await h.call('GET', '/projects')).body);

describe('PUT /projects/pins', () => {
  let h: H;
  let dir: ReturnType<typeof tempDir> | undefined;
  afterEach(async () => {
    await h.close();
    dir?.cleanup();
    dir = undefined;
  });

  it('pins in order, reorders, unpins what is left out, and clears with an empty list', async () => {
    h = testApp({ seed: true });
    expect(await listed(h)).toEqual([]);

    const r = await h.call('PUT', '/projects/pins', { ids: ['lumi', 'aurora'] });
    expect(r.status).toBe(200);
    expect(pinned(r.body)).toEqual(['lumi', 'aurora']);
    expect(r.body.find((p: P) => p.id === 'atlas').pinRank).toBeNull();

    await h.call('PUT', '/projects/pins', { ids: ['aurora', 'muse', 'lumi'] });
    expect(await listed(h)).toEqual(['aurora', 'muse', 'lumi']);

    await h.call('PUT', '/projects/pins', { ids: ['muse'] });
    expect(await listed(h)).toEqual(['muse']);

    await h.call('PUT', '/projects/pins', { ids: [] });
    expect(await listed(h)).toEqual([]);
  });

  it('refuses an unknown id (404) or a duplicate (422) and keeps the pins it had', async () => {
    h = testApp({ seed: true });
    await h.call('PUT', '/projects/pins', { ids: ['lumi'] });
    expect((await h.call('PUT', '/projects/pins', { ids: ['aurora', 'ghost'] })).status).toBe(404);
    expect((await h.call('PUT', '/projects/pins', { ids: ['aurora', 'aurora'] })).status).toBe(422);
    expect((await h.call('PUT', '/projects/pins', {})).status).toBe(422);
    expect(await listed(h)).toEqual(['lumi']);
  });

  it('a deleted project drops out; the rest keep their order', async () => {
    h = testApp({ seed: true });
    await h.call('PUT', '/projects/pins', { ids: ['lumi', 'aurora', 'muse'] });
    expect((await h.call('DELETE', '/projects/aurora')).status).toBe(204);
    expect(await listed(h)).toEqual(['lumi', 'muse']);
  });

  it('pins are kept across a restart', async () => {
    dir = tempDir();
    h = testApp({ seed: true, at: dir.dir });
    await h.call('PUT', '/projects/pins', { ids: ['muse', 'lumi'] });
    await h.close();
    h = testApp({ seed: true, at: dir.dir });
    expect(await listed(h)).toEqual(['muse', 'lumi']);
  });
});
