/* Folders outside the project: a Mac app project's own data folder reaches every run by itself (`--add-dir`,
   real path, no vault entry); other folders join only once shared from the vault. The guard refuses folders too
   broad or overlapping the studio; backups copy only from inside a shared folder (symlinks followed); the app's
   bundle id is read from its project files. */
import { mkdirSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MIGRATIONS, migrate } from '../../src/db/migrations.ts';
import { cliArgs } from '../../src/runtime/claude-cli.ts';
import { fakeRunner } from '../../src/runtime/fake.ts';
import type { RunSpec } from '../../src/runtime/runner.ts';
import { bundleIdOf } from '../../src/secrets/bundleId.ts';
import { checkFolder, type FolderGuard, liveFolder } from '../../src/secrets/folderAccess.ts';
import { backUp, backupTool, insideShared } from '../../src/secrets/folderBackup.ts';
import { tempDir, testApp } from '../helpers.ts';

const status = (fn: () => unknown) => {
  try {
    fn();
    return 'ok';
  } catch (e) {
    return (e as { status?: number }).status ?? (e as Error).message;
  }
};

describe('folder guard', () => {
  let t: ReturnType<typeof tempDir>;
  let guard: FolderGuard;
  let support: string;
  beforeEach(() => {
    t = tempDir();
    support = join(t.dir, 'me', 'Library', 'Application Support');
    mkdirSync(join(support, 'com.example.app'), { recursive: true });
    mkdirSync(join(t.dir, 'studio'));
    guard = { userHome: join(t.dir, 'me'), protect: [join(t.dir, 'studio')] };
  });
  afterEach(() => t.cleanup());

  it("allows one app's folder, normalized", () => {
    expect(checkFolder(`${join(support, 'com.example.app')}/`, guard)).toBe(join(support, 'com.example.app'));
  });
  it('refuses a relative path, and folders too broad (Application Support and above)', () => {
    expect(status(() => checkFolder('Library/x', guard))).toBe(422);
    for (const p of ['/', t.dir, join(t.dir, 'me'), join(t.dir, 'me', 'Library'), support])
      expect(
        status(() => checkFolder(p, guard)),
        p,
      ).toBe(422);
  });
  it("refuses a folder that holds or sits inside the studio's own folders", () => {
    expect(status(() => checkFolder(join(t.dir, 'studio', 'x'), guard))).toBe(422);
    expect(status(() => checkFolder(t.dir, { userHome: '/nowhere', protect: guard.protect }))).toBe(422);
  });
  it('a link to the studio is refused when saved and when a run starts; a missing folder is not passed', () => {
    const link = join(support, 'com.example.link');
    symlinkSync(join(t.dir, 'studio'), link);
    expect(status(() => checkFolder(link, guard))).toBe(422);
    expect(liveFolder(link, guard)).toBeNull();
    expect(liveFolder(join(support, 'com.example.gone'), guard)).toBeNull();
    expect(liveFolder(join(support, 'com.example.app'), guard)).toBe(
      realpathSync(join(support, 'com.example.app')),
    );
  });
});

describe('bundle id', () => {
  let t: ReturnType<typeof tempDir>;
  beforeEach(() => {
    t = tempDir();
  });
  afterEach(() => t.cleanup());
  const write = (rel: string, text: string) => {
    mkdirSync(join(t.dir, rel, '..'), { recursive: true });
    writeFileSync(join(t.dir, rel), text);
  };

  it('reads Tauri v2, then v1', () => {
    write('tauri.conf.json', JSON.stringify({ tauri: { bundle: { identifier: 'com.example.v1' } } }));
    expect(bundleIdOf(t.dir)).toBe('com.example.v1');
    write('src-tauri/tauri.conf.json', JSON.stringify({ identifier: 'com.example.v2' }));
    expect(bundleIdOf(t.dir)).toBe('com.example.v2');
  });
  it('reads Xcode, leaving out test targets and unexpanded settings', () => {
    write(
      'App.xcodeproj/project.pbxproj',
      'PRODUCT_BUNDLE_IDENTIFIER = com.example.mac;\nPRODUCT_BUNDLE_IDENTIFIER = com.example.macTests;\nPRODUCT_BUNDLE_IDENTIFIER = "$(BASE).x";\n',
    );
    expect(bundleIdOf(t.dir)).toBe('com.example.mac');
  });
  it('none: a 409 naming every file checked; several: a 409 naming them', () => {
    expect(() => bundleIdOf(t.dir)).toThrow(/src-tauri\/tauri\.conf\.json, tauri\.conf\.json, \*\.xcodeproj/);
    write(
      'A.xcodeproj/project.pbxproj',
      'PRODUCT_BUNDLE_IDENTIFIER = a.one;\nPRODUCT_BUNDLE_IDENTIFIER = a.two;\n',
    );
    expect(() => bundleIdOf(t.dir)).toThrow(/several bundle ids \(a\.one, a\.two\)/);
  });
});

describe('backups', () => {
  let t: ReturnType<typeof tempDir>;
  let shared: string;
  beforeEach(() => {
    t = tempDir();
    shared = join(t.dir, 'shared');
    mkdirSync(join(shared, 'vault'), { recursive: true });
    writeFileSync(join(shared, 'vault', 'note.md'), 'hello');
    writeFileSync(join(t.dir, 'outside.txt'), 'private');
    symlinkSync(join(t.dir, 'outside.txt'), join(shared, 'sneaky.txt'));
  });
  afterEach(() => t.cleanup());

  it('copies a path inside the shared folder to the backups dir', () => {
    const b = backUp([shared], join(shared, 'vault'), join(t.dir, 'backups'), 'stamp');
    expect(b.to).toBe(join(t.dir, 'backups', 'stamp-vault'));
    expect(readFileSync(join(b.to, 'note.md'), 'utf8')).toBe('hello');
  });
  it('refuses a path outside, a link leading outside, and anything before a folder is shared', () => {
    expect(status(() => insideShared([shared], join(t.dir, 'outside.txt')))).toBe(422);
    expect(status(() => insideShared([shared], join(shared, 'sneaky.txt')))).toBe(422);
    expect(status(() => insideShared([shared], join(shared, '..', 'outside.txt')))).toBe(422);
    expect(status(() => insideShared([], join(shared, 'vault')))).toBe(409);
  });
  it('the backup_folder tool reads the shared folders at call time', async () => {
    let roots: string[] = [];
    const tool = backupTool({
      foldersFor: () => roots,
      backupsDir: join(t.dir, 'b'),
      now: () => new Date(0),
    });
    await expect(tool.run({ path: join(shared, 'vault', 'note.md') })).rejects.toThrow(/No folder is shared/);
    roots = [shared];
    expect(await tool.run({ path: join(shared, 'vault', 'note.md') })).toContain(join(t.dir, 'b'));
  });
});

describe("a Mac app project's own data folder, end to end", () => {
  let h: ReturnType<typeof testApp>;
  let seen: RunSpec[];
  let appData: string;
  let home: ReturnType<typeof tempDir>;
  const tauri = (identifier: string) =>
    writeFileSync(
      join(h.config.sandbox, 'aurora', 'src-tauri', 'tauri.conf.json'),
      JSON.stringify({ identifier }),
    );
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
    mkdirSync(join(h.config.sandbox, 'aurora', 'src-tauri'), { recursive: true });
    tauri('com.example.pensieve');
    h.store.projects.update('aurora', { folder: 'aurora' });
    appData = join(home.dir, 'me', 'Library', 'Application Support', 'com.example.pensieve');
    mkdirSync(appData, { recursive: true });
  });
  afterEach(async () => {
    await h.close();
    home.cleanup();
  });
  const run = async () => {
    const r = await h.call('POST', '/projects/aurora/runs', {
      agentId: 'a-pete',
      teamId: 'ship-it',
      task: 'go',
    });
    await h.runtime.settled(r.body.id);
    return seen.at(-1) as RunSpec;
  };

  it('reaches every run with no vault entry and no grant: --add-dir with its real path, named in the prompt', async () => {
    const spec = await run();
    expect(spec.addDirs).toEqual([realpathSync(appData)]);
    expect(spec.systemPrompt).toContain(appData);
    expect(spec.systemPrompt).toContain('backup_folder');
    const args = cliArgs(spec, { askServer: '/a.ts' });
    expect(args[args.indexOf('--add-dir') + 1]).toBe(realpathSync(appData));
    expect((await h.call('GET', '/accesses')).body).toEqual([]);
  });

  it('nothing for a project that is not a Mac app, a folder the app has not made yet, or an odd bundle id', async () => {
    tauri('com.example.unborn');
    expect((await run()).addDirs).toBeUndefined();
    tauri('../../..');
    expect((await run()).addDirs).toBeUndefined();
    writeFileSync(join(h.config.sandbox, 'aurora', 'src-tauri', 'tauri.conf.json'), '{}');
    const spec = await run();
    expect(spec.addDirs).toBeUndefined();
    expect(spec.systemPrompt).not.toContain('app data');
  });

  it('the old route is gone; a folder shared by hand in the vault still joins, once', async () => {
    expect((await h.call('POST', '/projects/aurora/app-data-access')).status).toBe(404);
    const other = join(home.dir, 'me', 'Library', 'Application Support', 'com.example.other');
    mkdirSync(other);
    const same = await h.call('POST', '/accesses', { name: 'Same', folder: appData, fields: [] });
    const extra = await h.call('POST', '/accesses', { name: 'Other', folder: other, fields: [] });
    for (const a of [same, extra]) await h.call('PUT', `/projects/aurora/access/${a.body.id}`);
    expect((await run()).addDirs).toEqual([realpathSync(appData), realpathSync(other)]);
  });

  it('POST /accesses takes a folder without fields, and refuses a field-less access without one', async () => {
    const ok = await h.call('POST', '/accesses', { name: 'Vault', folder: appData, fields: [] });
    expect(ok.status).toBe(201);
    expect((await h.call('POST', '/accesses', { name: 'Empty', fields: [] })).status).toBe(422);
    expect((await h.call('POST', '/accesses', { name: 'Root', folder: '/', fields: [] })).status).toBe(422);
  });
});

describe('migration 50: the auto-added app data entries leave the vault', () => {
  it("drops v1's entries and their grants, keeps folders the user added by hand", () => {
    const db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    for (const sql of MIGRATIONS.slice(0, 49)) db.exec(sql);
    db.exec('PRAGMA user_version = 49');
    db.exec(
      `INSERT INTO agents (id, kind, name, look, position, created_at, updated_at) VALUES ('o', 'orchestrator', 'O', '{}', 0, '', '');
       INSERT INTO projects (id, name, status, orchestrator_id, tile, position, created_at, updated_at) VALUES ('p', 'Pensieve', 'live', 'o', '{}', 0, '', '');
       INSERT INTO accesses (id, name, serves, instructions, folder, position, created_at, updated_at) VALUES
         ('auto', 'Pensieve app data', 'The Pensieve Mac app''s data folder (read and write)',
          'Quit the app before changing its data. Back up what you change first.', '/x/com.p', 0, '', ''),
         ('hand', 'Photos', 'My photos', '', '/x/photos', 1, '', '');
       INSERT INTO access_grants (project_id, access_id, granted_at) VALUES ('p', 'auto', ''), ('p', 'hand', '');`,
    );
    migrate(db);
    expect(db.prepare('SELECT id FROM accesses').all()).toEqual([{ id: 'hand' }]);
    expect(db.prepare('SELECT access_id FROM access_grants').all()).toEqual([{ access_id: 'hand' }]);
  });
});
