/* Folder accesses: a Mac app's data folder in the cabinet, shared with a project by the user. Only once it is
   granted does it reach a run (`--add-dir`, real path); the guard refuses folders too broad or overlapping the
   studio; backups copy only from inside a shared folder (symlinks followed); the app's bundle id is read from its
   project files. */
import { mkdirSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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

describe('the app data access, end to end', () => {
  let h: ReturnType<typeof testApp>;
  let seen: RunSpec[];
  let appData: string;
  let home: ReturnType<typeof tempDir>;
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
    const project = join(h.config.sandbox, 'aurora');
    mkdirSync(join(project, 'src-tauri'), { recursive: true });
    writeFileSync(
      join(project, 'src-tauri', 'tauri.conf.json'),
      JSON.stringify({ identifier: 'com.example.pensieve' }),
    );
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

  it('creates the entry once, not shared; a second call returns it', async () => {
    const first = await h.call('POST', '/projects/aurora/app-data-access');
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ folder: appData, projectIds: [], fields: [] });
    const again = await h.call('POST', '/projects/aurora/app-data-access');
    expect(again.status).toBe(200);
    expect(again.body.id).toBe(first.body.id);
    expect((await h.call('GET', '/accesses')).body).toHaveLength(1);
  });

  it('reaches a run only once shared: --add-dir with its real path, and the prompt names it', async () => {
    const { body } = await h.call('POST', '/projects/aurora/app-data-access');
    expect((await run()).addDirs).toBeUndefined();
    expect((await h.call('PUT', `/projects/aurora/access/${body.id}`)).status).toBe(200);
    const spec = await run();
    expect(spec.addDirs).toEqual([realpathSync(appData)]);
    expect(spec.systemPrompt).toContain(appData);
    expect(spec.systemPrompt).toContain('backup_folder');
    const args = cliArgs(spec, {});
    expect(args[args.indexOf('--add-dir') + 1]).toBe(realpathSync(appData));
  });

  it('no bundle id: a 409 naming the files checked', async () => {
    writeFileSync(join(h.config.sandbox, 'aurora', 'src-tauri', 'tauri.conf.json'), '{}');
    const r = await h.call('POST', '/projects/aurora/app-data-access');
    expect(r.status).toBe(409);
    expect(JSON.stringify(r.body)).toContain('src-tauri/tauri.conf.json');
  });

  it('POST /accesses takes a folder without fields, and refuses a field-less access without one', async () => {
    const ok = await h.call('POST', '/accesses', { name: 'Vault', folder: appData, fields: [] });
    expect(ok.status).toBe(201);
    expect((await h.call('POST', '/accesses', { name: 'Empty', fields: [] })).status).toBe(422);
    expect((await h.call('POST', '/accesses', { name: 'Root', folder: '/', fields: [] })).status).toBe(422);
  });
});
