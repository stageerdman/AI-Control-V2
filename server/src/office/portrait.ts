/* The project's picture (OFFICE icon): the framed picture on the office wall and the Projects card icon.
   Set by upload, or linked to an icon file inside the project folder (its AppIcon, favicon…). Either way a copy is
   kept in <data dir>/images/<projectId>.<ext> — never written into the project folder — so it still shows if the
   file moves; a linked file that changed is copied again on the next read. The row keeps {ext, v, source?}
   (v busts caches). Which bytes are a picture: image-types.ts. */
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { Db } from '../db/connection.ts';
import type { Store } from '../db/store.ts';
import { now } from '../db/util.ts';
import { conflict, invalid } from '../errors.ts';
import type { EventLog } from '../events/log.ts';
import { resolveInSandbox, SandboxError } from '../fs/sandbox.ts';
import { findIconFiles } from './icon-finder.ts';
import { IMAGE_TYPES, type ImageType, MAX_SOURCE_BYTES, toStorable } from './image-types.ts';

/** The linked file, relative to the project folder, with the stamp it had when last copied. */
type Source = { path: string; mtimeMs: number; size: number };
type IconRecord = { ext: string; v: string; source?: Source };

const TYPE_OF_EXT = Object.fromEntries(Object.entries(IMAGE_TYPES).map(([t, e]) => [e, t])) as Record<
  string,
  ImageType
>;
const stampOf = (file: string) => {
  const s = statSync(file);
  return { mtimeMs: s.mtimeMs, size: s.size, isFile: s.isFile() };
};

export function createPortraits(deps: {
  db: Db;
  store: Store;
  events: EventLog;
  home: string;
  sandbox: string;
}) {
  const dir = join(deps.home, 'images');
  const fileOf = (id: string, ext: string) => join(dir, `${id}.${ext}`);
  const recordOf = (id: string): IconRecord | null => {
    const r = deps.db.prepare('SELECT image FROM projects WHERE id = ?').get(id) as { image: string | null };
    try {
      return r?.image ? JSON.parse(r.image) : null;
    } catch {
      return null;
    }
  };
  const writeRecord = (id: string, rec: IconRecord | null) =>
    deps.db
      .prepare('UPDATE projects SET image = ?, updated_at = ? WHERE id = ?')
      .run(rec ? JSON.stringify(rec) : null, now(), id);
  const announce = (id: string) => {
    try {
      deps.events.append('project', id, {
        type: 'project.changed',
        payload: { imageUrl: deps.store.projects.require(id).imageUrl },
      });
    } catch {
      /* the picture is saved; a bad event line never undoes it */
    }
  };
  const removeFiles = (id: string, keep?: string) => {
    for (const ext of Object.values(IMAGE_TYPES)) if (ext !== keep) rmSync(fileOf(id, ext), { force: true });
  };

  /** Check the bytes, keep the copy, record where it came from. */
  function save(id: string, bytes: Uint8Array, declared: string | undefined, source?: Source) {
    const pic = toStorable(bytes, declared);
    const ext = IMAGE_TYPES[pic.type];
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const tmp = `${fileOf(id, ext)}.${randomBytes(4).toString('hex')}.tmp`;
    writeFileSync(tmp, pic.bytes, { mode: 0o600 });
    renameSync(tmp, fileOf(id, ext));
    removeFiles(id, ext);
    /* the version moves on every save, even within one millisecond */
    writeRecord(id, {
      ext,
      v: `${Date.now().toString(36)}${randomBytes(2).toString('hex')}`,
      ...(source ? { source } : {}),
    });
    announce(id);
    return deps.store.projects.require(id);
  }

  /** The project folder on disk (the link's root). */
  const folderOf = (id: string) => {
    const p = deps.store.projects.require(id);
    if (!p.folder) throw conflict(`Project '${id}' has no folder yet — upload a picture instead`);
    return resolveInSandbox(deps.sandbox, p.folder);
  };
  /** An existing file inside the project folder (symlinks followed), or a 422 that says why not. */
  function fileInProject(id: string, path: string): { root: string; file: string } {
    const root = folderOf(id);
    let file: string;
    try {
      file = resolveInSandbox(root, path.trim());
    } catch (e) {
      if (e instanceof SandboxError)
        throw invalid(`Only files inside the project folder can be the icon: ${path}`, { path });
      throw e;
    }
    if (!existsSync(file) || !stampOf(file).isFile) throw invalid(`No file at ${path} in the project folder`);
    if (stampOf(file).size > MAX_SOURCE_BYTES) throw invalid('The file is over 8 MB — pick a smaller one');
    return { root, file };
  }

  /** Copy the linked file again if it changed since the last copy. A moved, gone or broken file keeps the copy. */
  function refresh(id: string): void {
    const rec = recordOf(id);
    if (!rec?.source) return;
    let file: string;
    try {
      file = fileInProject(id, rec.source.path).file;
    } catch {
      return; // moved or gone: the kept copy still shows
    }
    const s = stampOf(file);
    if (s.mtimeMs === rec.source.mtimeMs && s.size === rec.source.size) return;
    const source = { path: rec.source.path, mtimeMs: s.mtimeMs, size: s.size };
    try {
      save(id, readFileSync(file), undefined, source);
    } catch {
      /* not a picture any more: keep the copy, remember the stamp so it isn't read on every view */
      writeRecord(id, { ...rec, source });
    }
  }

  return {
    dir,
    /** Save an uploaded picture (the bytes decide the type; a header that disagrees is refused). Unlinks any file. */
    put(id: string, bytes: Uint8Array, declared?: string) {
      deps.store.projects.require(id);
      return save(id, bytes, declared);
    },
    /** Use an icon file inside the project folder (relative to it, or absolute inside it); outside is refused. */
    link(id: string, path: string) {
      const { root, file } = fileInProject(id, path);
      const s = stampOf(file);
      return save(id, readFileSync(file), undefined, {
        path: relative(root, file),
        mtimeMs: s.mtimeMs,
        size: s.size,
      });
    },
    /** Back to the tile. */
    remove(id: string) {
      deps.store.projects.require(id);
      removeFiles(id);
      writeRecord(id, null);
      announce(id);
      return deps.store.projects.require(id);
    },
    /** Icon files found in the project folder (best first); none when it has no folder yet. */
    candidates(id: string): string[] {
      const p = deps.store.projects.require(id);
      if (!p.folder) return [];
      try {
        return findIconFiles(folderOf(id));
      } catch {
        return [];
      }
    },
    /** A file in the project folder as the picture it would become (checked like a link; nothing is saved). */
    preview(id: string, path: string): { bytes: Uint8Array; type: ImageType } {
      return toStorable(readFileSync(fileInProject(id, path).file));
    },
    refresh,
    /** Refresh every project's linked icon (cheap: one stat each). */
    refreshAll() {
      const rows = deps.db.prepare('SELECT id FROM projects WHERE image IS NOT NULL').all() as {
        id: string;
      }[];
      for (const r of rows) refresh(r.id);
    },
    /** The bytes + type, or null (no picture, or its file is gone). A linked file is refreshed first. */
    read(id: string): { bytes: Buffer; type: ImageType } | null {
      deps.store.projects.require(id);
      refresh(id);
      const rec = recordOf(id);
      const type = rec && TYPE_OF_EXT[rec.ext];
      if (!rec || !type || !existsSync(fileOf(id, rec.ext))) return null;
      return { bytes: readFileSync(fileOf(id, rec.ext)), type };
    },
  };
}
export type Portraits = ReturnType<typeof createPortraits>;
