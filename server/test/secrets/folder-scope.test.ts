/* Vault folder access v3: a folder is global (listed in every project, off until switched on there) or local
   to one project (no other project sees it), and read-only or read and write. A switched-on folder reaches the
   project's runs as `--add-dir`; a read-only one also as deny rules for the file-editing tools. */
import { mkdirSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cliArgs } from '../../src/runtime/claude-cli.ts';
import { fakeRunner } from '../../src/runtime/fake.ts';
import type { RunSpec } from '../../src/runtime/runner.ts';
import { tempDir, testApp } from '../helpers.ts';

describe('folder grants: global or local, read or read and write', () => {
  let h: ReturnType<typeof testApp>;
  let home: ReturnType<typeof tempDir>;
  let notes: string;
  let photos: string;
  let seen: RunSpec[];
  beforeEach(() => {
    seen = [];
    home = tempDir();
    h = testApp({
      seed: true,
      userHome: join(home.dir, 'me'),
      runner: fakeRunner((s) => {
        seen.push(s);
        return [{ result: 'ok' }];
      }),
    });
    for (const p of ['aurora', 'lumi']) mkdirSync(join(h.config.sandbox, p), { recursive: true });
    h.store.projects.update('aurora', { folder: 'aurora' });
    h.store.projects.update('lumi', { folder: 'lumi', teamIds: [], agentIds: ['a-pete'] });
    notes = join(home.dir, 'me', 'Documents', 'notes');
    photos = join(home.dir, 'me', 'Pictures', 'photos');
    mkdirSync(notes, { recursive: true });
    mkdirSync(photos, { recursive: true });
  });
  afterEach(async () => {
    await h.close();
    home.cleanup();
  });

  const run = async (projectId: string) => {
    const body = projectId === 'aurora' ? { agentId: 'a-pete', teamId: 'ship-it' } : { agentId: 'a-pete' };
    const r = await h.call('POST', `/projects/${projectId}/runs`, { ...body, task: 'go' });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    await h.runtime.settled(r.body.id);
    return seen.at(-1) as RunSpec;
  };
  const listed = async (projectId: string) =>
    (
      (await h.call('GET', `/projects/${projectId}/access`)).body.accesses as {
        id: string;
        granted: boolean;
      }[]
    ).map((a) => `${a.id}:${a.granted ? 'on' : 'off'}`);
  const global = async (folder: string, folderMode?: 'read' | 'write') =>
    (
      await h.call('POST', '/accesses', {
        name: 'Notes',
        folder,
        fields: [],
        ...(folderMode ? { folderMode } : {}),
      })
    ).body;

  it('a global folder is listed in every project, off until switched on, and reaches only that project', async () => {
    const a = await global(notes);
    expect(a).toMatchObject({ folderMode: 'write', localTo: null });
    expect(await listed('aurora')).toEqual([`${a.id}:off`]);
    expect(await listed('lumi')).toEqual([`${a.id}:off`]);
    expect((await run('aurora')).addDirs).toBeUndefined();

    await h.call('PUT', `/projects/aurora/access/${a.id}`);
    expect(await listed('lumi')).toEqual([`${a.id}:off`]);
    expect((await run('aurora')).addDirs).toEqual([realpathSync(notes)]);
    expect((await run('lumi')).addDirs).toBeUndefined();

    await h.call('DELETE', `/projects/aurora/access/${a.id}`);
    expect((await run('aurora')).addDirs).toBeUndefined();
  });

  it('a local folder exists in its project only: on at once there, unseen and refused elsewhere', async () => {
    const r = await h.call('POST', '/projects/aurora/accesses', {
      name: 'Photos',
      folder: photos,
      fields: [],
    });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ localTo: 'aurora', granted: true, folder: photos });
    expect(await listed('aurora')).toEqual([`${r.body.id}:on`]);
    expect(await listed('lumi')).toEqual([]);
    expect((await h.call('PUT', `/projects/lumi/access/${r.body.id}`)).status).toBe(422);
    expect((await run('aurora')).addDirs).toEqual([realpathSync(photos)]);
    expect((await run('lumi')).addDirs).toBeUndefined();

    await h.call('DELETE', `/projects/aurora/access/${r.body.id}`);
    expect(await listed('aurora')).toEqual([`${r.body.id}:off`]);
    expect((await run('aurora')).addDirs).toBeUndefined();
  });

  it('a read-only folder reaches the CLI with editing denied under it; read and write has no deny rule', async () => {
    const ro = await global(notes, 'read');
    const rw = await h.call('POST', '/projects/aurora/accesses', {
      name: 'Photos',
      folder: photos,
      fields: [],
    });
    await h.call('PUT', `/projects/aurora/access/${ro.id}`);
    const spec = await run('aurora');
    expect(spec.addDirs).toEqual([realpathSync(notes), realpathSync(photos)]);
    expect(spec.readOnlyDirs).toEqual([realpathSync(notes)]);
    expect(spec.systemPrompt).toContain(`\`${notes}\`, read only`);
    expect(spec.systemPrompt).toContain(`\`${photos}\`, read and write`);

    const args = cliArgs(spec, { askServer: '/a.ts' });
    const denied = args[args.indexOf('--disallowed-tools') + 1] as string;
    const [r, w] = [realpathSync(notes), realpathSync(photos)];
    expect(denied).toContain(`Edit(/${r}/**)`);
    expect(denied).not.toContain(`Edit(/${w}/**)`);
    /* neither folder ever shows a .env */
    for (const d of [r, w]) expect(denied).toContain(`Read(/${d}/**/.env)`);
    expect(rw.status).toBe(201);
  });

  it("the projects folder may be shared read-only (other projects' .env stay hidden), never read and write", async () => {
    const projects = h.config.sandbox;
    const write = await h.call('POST', '/projects/aurora/accesses', {
      name: 'Dev',
      folder: projects,
      fields: [],
    });
    expect(write.status).toBe(422);
    expect(JSON.stringify(write.body)).toMatch(/share it read-only/);
    const ro = { name: 'Dev', folder: projects, folderMode: 'read', fields: [] };
    expect((await h.call('POST', '/projects/aurora/accesses', ro)).status).toBe(201);
    const spec = await run('aurora');
    expect(spec.readOnlyDirs).toEqual([realpathSync(projects)]);
    const args = cliArgs(spec, { askServer: '/a.ts' });
    expect(args[args.indexOf('--disallowed-tools') + 1]).toContain(
      `Read(/${realpathSync(projects)}/**/.env)`,
    );
    /* the studio's own data folder stays refused, read-only or not */
    const data = { name: 'Data', folder: h.config.home, folderMode: 'read', fields: [] };
    expect((await h.call('POST', '/projects/aurora/accesses', data)).status).toBe(422);
  });

  it('the same folder may be global once and local once per project, never twice in one scope', async () => {
    await global(notes);
    expect((await h.call('POST', '/accesses', { name: 'Again', folder: notes, fields: [] })).status).toBe(
      409,
    );
    const local = { name: 'Mine', folder: notes, fields: [] };
    expect((await h.call('POST', '/projects/aurora/accesses', local)).status).toBe(201);
    expect((await h.call('POST', '/projects/lumi/accesses', local)).status).toBe(201);
    expect((await h.call('POST', '/projects/aurora/accesses', local)).status).toBe(409);
  });

  it('refuses a missing folder, a file, the home folder, / and a link to the home folder', async () => {
    const file = join(home.dir, 'me', 'note.txt');
    writeFileSync(file, 'x');
    const link = join(home.dir, 'me', 'Documents', 'home-link');
    symlinkSync(join(home.dir, 'me'), link);
    for (const folder of [join(notes, 'gone'), file, join(home.dir, 'me'), '/', link, 'relative/path'])
      expect((await h.call('POST', '/accesses', { name: 'X', folder, fields: [] })).status, folder).toBe(422);
    expect((await h.call('POST', '/accesses', { name: 'X', folderMode: 'read', fields: [] })).status).toBe(
      422,
    );
  });
});
