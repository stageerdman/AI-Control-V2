/* OFFICE icon: upload (SVG, ICNS → PNG), or a file inside the project folder (outside refused), a copy kept in
   the data dir and re-copied when the file changes; bad types refused; clearing; the director's office_icon tool. */
import { mkdirSync, readdirSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { iconTool } from '../../src/office/icon-tool.ts';
import { largestPngInIcns, sniff } from '../../src/office/image-types.ts';
import { createPortraits } from '../../src/office/portrait.ts';
import { testApp } from '../helpers.ts';

const png = (...tail: number[]) => Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...tail]);
const SVG = Buffer.from(
  '<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"/>',
);
/** An .icns: 'icns' + total length, then entries (type, length incl. 8-byte header, data). */
function icns(...entries: [string, Buffer][]): Buffer {
  const parts = entries.map(([type, data]) => {
    const head = Buffer.alloc(8);
    head.write(type, 0, 'latin1');
    head.writeUInt32BE(data.length + 8, 4);
    return Buffer.concat([head, data]);
  });
  const head = Buffer.alloc(8);
  head.write('icns', 0, 'latin1');
  head.writeUInt32BE(8 + parts.reduce((n, p) => n + p.length, 0), 4);
  return Buffer.concat([head, ...parts]);
}

describe('the office icon', () => {
  let h: ReturnType<typeof testApp>;
  afterEach(() => h.close());
  /** The seeded project, with a folder holding `files`. */
  const withFolder = (files: Record<string, Buffer | string> = {}) => {
    h = testApp({ seed: true });
    const root = join(h.config.sandbox, 'aurora');
    mkdirSync(root);
    for (const [rel, body] of Object.entries(files)) {
      mkdirSync(join(root, rel, '..'), { recursive: true });
      writeFileSync(join(root, rel), body);
    }
    h.store.projects.update('aurora', { folder: 'aurora' });
    return root;
  };
  const upload = (body: Buffer, type: string) =>
    h.app.inject({
      method: 'PUT',
      url: '/projects/aurora/image',
      headers: { 'content-type': type },
      payload: body,
    });
  const link = (path: string) => h.call('PUT', '/projects/aurora/image/source', { path });
  const image = () => h.app.inject({ method: 'GET', url: '/projects/aurora/image' });

  it('upload: SVG is kept as SVG (served script-free); ICNS becomes its largest PNG', async () => {
    withFolder();
    const s = await upload(SVG, 'image/svg+xml');
    expect(s.statusCode).toBe(200);
    expect(s.json().imageSource).toBe('upload');
    const g = await image();
    expect(g.headers['content-type']).toBe('image/svg+xml');
    expect(g.headers['content-security-policy']).toContain('sandbox');
    expect(g.rawPayload.equals(SVG)).toBe(true);

    const big = png(9, 9, 9, 9);
    const i = await upload(icns(['TOC ', Buffer.alloc(8)], ['ic07', png(1)], ['ic10', big]), 'image/x-icns');
    expect(i.statusCode).toBe(200);
    expect(readdirSync(join(h.config.home, 'images'))).toEqual(['aurora.png']);
    expect((await image()).rawPayload.equals(big)).toBe(true);
  });

  it('upload as octet-stream (a browser can’t name an .icns): the bytes decide', async () => {
    withFolder();
    const big = png(5, 5, 5);
    const i = await upload(icns(['ic10', big]), 'application/octet-stream');
    expect(i.statusCode).toBe(200);
    expect((await image()).rawPayload.equals(big)).toBe(true);
    expect((await upload(SVG, 'application/octet-stream')).statusCode).toBe(200);
    expect((await image()).headers['content-type']).toBe('image/svg+xml');
    expect((await upload(Buffer.from('%PDF-1.4'), 'application/octet-stream')).statusCode).toBe(422);
  });

  it('path inside the folder: copied to the data dir, the project names its source', async () => {
    const root = withFolder({ 'Assets/AppIcon.png': png(1, 2) });
    const r = await link('Assets/AppIcon.png');
    expect(r.status).toBe(200);
    expect(r.body.imageSource).toBe('Assets/AppIcon.png');
    expect(r.body.imageUrl).toMatch(/^\/projects\/aurora\/image\?v=/);
    expect((await image()).rawPayload.equals(png(1, 2))).toBe(true);
    // an absolute path inside the folder works too, and is kept relative
    expect((await link(join(root, 'Assets/AppIcon.png'))).body.imageSource).toBe('Assets/AppIcon.png');
  });

  it('path outside the folder is refused: absolute, "..", a symlink out, another project', async () => {
    const root = withFolder();
    mkdirSync(join(h.config.sandbox, 'other'));
    writeFileSync(join(h.config.sandbox, 'other', 'icon.png'), png(7));
    writeFileSync(join(h.config.home, 'secret.png'), png(7));
    symlinkSync(join(h.config.home, 'secret.png'), join(root, 'link.png'));
    for (const path of [join(h.config.home, 'secret.png'), '../other/icon.png', 'link.png', '/etc/hosts']) {
      const r = await link(path);
      expect(r.status, path).toBe(422);
      expect(r.body.error.message).toMatch(/inside the project folder/);
    }
    expect((await link('missing.png')).status).toBe(422);
    expect((await h.call('GET', '/projects/aurora')).body.imageUrl).toBeNull();
  });

  it('bad file types are refused, by path and by upload; an .icns with no PNG too', async () => {
    withFolder({
      'README.md': '# hi',
      'fake.png': 'not a png',
      'old.icns': icns(['it32', Buffer.alloc(16)]),
    });
    for (const path of ['README.md', 'fake.png', 'old.icns'])
      expect((await link(path)).status, path).toBe(422);
    expect((await upload(Buffer.from('%PDF-1.4'), 'image/png')).statusCode).toBe(422);
    expect((await upload(SVG, 'image/png')).statusCode).toBe(422); // the header lies
    expect((await upload(Buffer.from('x'), 'application/pdf')).statusCode).toBe(415);
    expect((await h.call('GET', '/projects/aurora')).body.imageUrl).toBeNull();
  });

  it('a linked file that changes is copied again; one that moves keeps the copy', async () => {
    const root = withFolder({ 'icon.png': png(1) });
    const first = (await link('icon.png')).body.imageUrl;
    writeFileSync(join(root, 'icon.png'), png(2, 2));
    utimesSync(join(root, 'icon.png'), new Date(), new Date(Date.now() + 5000));
    const listed = (await h.call('GET', '/projects')).body.find((p: { id: string }) => p.id === 'aurora');
    expect(listed.imageUrl).not.toBe(first);
    expect((await image()).rawPayload.equals(png(2, 2))).toBe(true);

    rmSync(join(root, 'icon.png'));
    expect((await h.call('GET', '/projects/aurora')).body).toMatchObject({ imageUrl: listed.imageUrl });
    expect((await image()).rawPayload.equals(png(2, 2))).toBe(true);
  });

  it('clearing a linked icon goes back to the tile; the project folder is never touched', async () => {
    const root = withFolder({ 'icon.svg': SVG });
    await link('icon.svg');
    const d = await h.call('DELETE', '/projects/aurora/image');
    expect(d.body).toMatchObject({ imageUrl: null, imageSource: null });
    expect(readdirSync(join(h.config.home, 'images'))).toEqual([]);
    expect(readdirSync(root)).toEqual(['icon.svg']);
    expect((await image()).statusCode).toBe(404);
  });

  it('the director’s office_icon tool sets, reads and clears', async () => {
    withFolder({ 'public/favicon.svg': SVG });
    const portraits = createPortraits({ ...h, home: h.config.home, sandbox: h.config.sandbox });
    const tool = iconTool(portraits, h.store, 'aurora');
    expect(await tool.run({})).toMatch(/No office icon/);
    expect(await tool.run({ path: 'public/favicon.svg' })).toMatch(/public\/favicon\.svg/);
    expect(h.store.projects.require('aurora').imageSource).toBe('public/favicon.svg');
    await expect(tool.run({ path: '../../etc/hosts' })).rejects.toThrow(/inside the project folder/);
    expect(await tool.run({ clear: true })).toMatch(/cleared/);
    expect(h.store.projects.require('aurora').imageUrl).toBeNull();
  });

  it('sniff and ICNS unwrapping', () => {
    expect(sniff(SVG)).toBe('image/svg+xml');
    expect(sniff(Buffer.from('﻿  <!-- logo --><svg viewBox="0 0 1 1"></svg>'))).toBe('image/svg+xml');
    expect(sniff(Buffer.from('<html><body>svg</body></html>'))).toBeNull();
    expect(sniff(icns())).toBe('image/x-icns');
    expect(largestPngInIcns(icns(['ic08', png(1, 1, 1)], ['ic07', png(1)]))).toEqual(png(1, 1, 1));
    // a broken length stops the walk instead of reading past the end
    const broken = icns(['ic07', png(1)]);
    broken.writeUInt32BE(9999, 12);
    expect(largestPngInIcns(broken)).toBeNull();
  });
});
