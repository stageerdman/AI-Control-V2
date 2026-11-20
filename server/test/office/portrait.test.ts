/* OFFICE: the project's picture — the app's only. Stored in <data dir>/images, never the project folder; the bytes
   decide the type; ≤ 2 MB; DELETE = back to the tile; the payload carries a cache-busting imageUrl. */
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { MAX_IMAGE_BYTES, sniff } from '../../src/office/image-types.ts';
import { testApp } from '../helpers.ts';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 9, 9]);
const GIF = Buffer.from('GIF89a....');
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBPVP8 ')]);

describe('the project picture', () => {
  let h: ReturnType<typeof testApp>;
  afterEach(() => h.close());
  const put = (body: Buffer, type = 'image/png', id = 'aurora') =>
    h.app.inject({
      method: 'PUT',
      url: `/projects/${id}/image`,
      headers: { 'content-type': type },
      payload: body,
    });

  it('PUT stores it in the data dir (never the project folder), the payload gets imageUrl, GET serves it', async () => {
    h = testApp({ seed: true });
    mkdirSync(join(h.config.sandbox, 'aurora'));
    h.store.projects.update('aurora', { folder: 'aurora' });
    expect((await h.call('GET', '/projects/aurora')).body.imageUrl).toBeNull();
    const r = await put(PNG);
    expect(r.statusCode).toBe(200);
    const p = r.json();
    expect(p.imageUrl).toMatch(/^\/projects\/aurora\/image\?v=[a-z0-9]+$/);
    expect(existsSync(join(h.config.home, 'images', 'aurora.png'))).toBe(true);
    expect(readdirSync(join(h.config.sandbox, 'aurora'))).toEqual([]); // nothing written in the project
    const g = await h.app.inject({ method: 'GET', url: '/projects/aurora/image' });
    expect(g.statusCode).toBe(200);
    expect(g.headers['content-type']).toBe('image/png');
    expect(g.rawPayload.equals(PNG)).toBe(true);
    // the list carries it too, and a change is announced
    expect(
      (await h.call('GET', '/projects')).body.find((x: { id: string }) => x.id === 'aurora').imageUrl,
    ).toBe(p.imageUrl);
    expect(h.events.after('project', 'aurora').some((e) => e.type === 'project.changed')).toBe(true);
    // a new picture of another type replaces the old file and the version moves
    await new Promise((res) => setTimeout(res, 5));
    const j = (await put(JPG, 'image/jpeg')).json();
    expect(j.imageUrl).not.toBe(p.imageUrl);
    expect(readdirSync(join(h.config.home, 'images'))).toEqual(['aurora.jpg']);
  });

  it('refuses other types, lying headers, empty and too-large pictures; unknown project 404', async () => {
    h = testApp({ seed: true });
    expect((await put(Buffer.from('hello, not svg'), 'image/svg+xml')).statusCode).toBe(422);
    expect([415, 422]).toContain((await put(Buffer.from('hello'), 'text/plain')).statusCode);
    expect((await put(Buffer.from('not a png at all'))).statusCode).toBe(422);
    expect((await put(JPG, 'image/png')).statusCode).toBe(422); // header says png, bytes say jpeg
    expect((await put(Buffer.alloc(0))).statusCode).toBe(422);
    const big = Buffer.concat([PNG, Buffer.alloc(MAX_IMAGE_BYTES)]);
    expect([413, 422]).toContain((await put(big)).statusCode);
    expect((await put(PNG, 'image/png', 'nope')).statusCode).toBe(404);
    expect((await h.call('GET', '/projects/aurora')).body.imageUrl).toBeNull();
    expect(existsSync(join(h.config.home, 'images', 'aurora.png'))).toBe(false);
  });

  it('DELETE goes back to the tile (file removed); GET with no picture is 404', async () => {
    h = testApp({ seed: true });
    await put(GIF, 'image/gif');
    const d = await h.call('DELETE', '/projects/aurora/image');
    expect(d.status).toBe(200);
    expect(d.body.imageUrl).toBeNull();
    expect(d.body.tile).toBeTruthy();
    expect(readdirSync(join(h.config.home, 'images'))).toEqual([]);
    expect((await h.app.inject({ method: 'GET', url: '/projects/aurora/image' })).statusCode).toBe(404);
  });

  it('renaming is the display name only — the folder stays', async () => {
    h = testApp({ seed: true });
    mkdirSync(join(h.config.sandbox, 'aurora'));
    h.store.projects.update('aurora', { folder: 'aurora' });
    const r = await h.call('PATCH', '/projects/aurora', { name: 'Aurora Shop' });
    expect(r.body).toMatchObject({ id: 'aurora', name: 'Aurora Shop', folder: 'aurora' });
    expect(existsSync(join(h.config.sandbox, 'aurora'))).toBe(true);
  });

  it('sniff: png, jpeg, gif, webp by their bytes', () => {
    expect([PNG, JPG, GIF, WEBP].map(sniff)).toEqual(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
    expect(sniff(Buffer.from('RIFF0000WAVE'))).toBeNull();
  });
});
