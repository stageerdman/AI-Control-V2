/* The Vault's "Choose…" button: POST /folders/pick opens the Mac's folder picker (a stub here). */
import { afterEach, describe, expect, it } from 'vitest';
import { testApp } from '../helpers.ts';

describe('POST /folders/pick', () => {
  let h: ReturnType<typeof testApp> | undefined;
  afterEach(async () => {
    await h?.close();
    h = undefined;
  });

  it('answers the chosen folder', async () => {
    h = testApp({ pickFolder: async () => '/Users/me/dev' });
    expect(await h.call('POST', '/folders/pick')).toEqual({ status: 200, body: { path: '/Users/me/dev' } });
  });

  it('answers null when the user cancels', async () => {
    h = testApp({ pickFolder: async () => null });
    expect((await h.call('POST', '/folders/pick')).body).toEqual({ path: null });
  });

  it('says why when there is no picker or it fails (the user pastes the path instead)', async () => {
    h = testApp();
    expect((await h.call('POST', '/folders/pick')).status).toBe(422);
    await h.close();
    h = testApp({
      pickFolder: async () => {
        throw new Error('The folder picker needs macOS — paste the path instead');
      },
    });
    const r = await h.call('POST', '/folders/pick');
    expect(r.status).toBe(422);
    expect(r.body.error.message).toMatch(/paste the path/);
  });
});
