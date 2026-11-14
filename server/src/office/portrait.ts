/* The project's picture (OFFICE portrait): the framed picture on the office wall and the Projects card icon.
   Purely the app's: stored in <data dir>/images/<projectId>.<ext> — never in the project folder — with
   {ext, v} on the project row (v busts caches). The type is checked from the bytes, not only the header. */
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Db } from '../db/connection.ts';
import type { Store } from '../db/store.ts';
import { now } from '../db/util.ts';
import { invalid } from '../errors.ts';
import type { EventLog } from '../events/log.ts';

/** The app crops + shrinks to a square before upload; this is the server's hard cap. */
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export const IMAGE_TYPES = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
} as const;
export type ImageType = keyof typeof IMAGE_TYPES;
const TYPE_OF_EXT = Object.fromEntries(Object.entries(IMAGE_TYPES).map(([t, e]) => [e, t])) as Record<
  string,
  ImageType
>;

/** What the bytes are (magic numbers), or null. */
export function sniff(b: Uint8Array): ImageType | null {
  const at = (i: number, ...v: number[]) => v.every((x, k) => b[i + k] === x);
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png';
  if (at(0, 0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (at(0, 0x47, 0x49, 0x46, 0x38)) return 'image/gif';
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return 'image/webp';
  return null;
}

export function createPortraits(deps: { db: Db; store: Store; events: EventLog; home: string }) {
  const dir = join(deps.home, 'images');
  const fileOf = (id: string, ext: string) => join(dir, `${id}.${ext}`);
  const recordOf = (id: string): { ext: string; v: string } | null => {
    const r = deps.db.prepare('SELECT image FROM projects WHERE id = ?').get(id) as { image: string | null };
    try {
      return r?.image ? JSON.parse(r.image) : null;
    } catch {
      return null;
    }
  };
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

  return {
    dir,
    /** Save a picture (the bytes decide the type; a header that disagrees is refused). */
    put(id: string, bytes: Uint8Array, declared?: string) {
      deps.store.projects.require(id);
      if (!bytes.length) throw invalid('The picture is empty');
      if (bytes.length > MAX_IMAGE_BYTES)
        throw invalid('The picture is over 2 MB — pick a smaller one', { maxBytes: MAX_IMAGE_BYTES });
      const type = sniff(bytes);
      if (!type) throw invalid('That isn’t a PNG, JPEG, WebP or GIF picture');
      if (declared && declared !== type) throw invalid(`The picture is a ${type}, not ${declared}`);
      const ext = IMAGE_TYPES[type];
      mkdirSync(dir, { recursive: true, mode: 0o700 });
      const tmp = `${fileOf(id, ext)}.${randomBytes(4).toString('hex')}.tmp`;
      writeFileSync(tmp, bytes, { mode: 0o600 });
      renameSync(tmp, fileOf(id, ext));
      removeFiles(id, ext);
      const v = Date.now().toString(36);
      deps.db
        .prepare('UPDATE projects SET image = ?, updated_at = ? WHERE id = ?')
        .run(JSON.stringify({ ext, v }), now(), id);
      announce(id);
      return deps.store.projects.require(id);
    },
    /** Back to the tile. */
    remove(id: string) {
      deps.store.projects.require(id);
      removeFiles(id);
      deps.db.prepare('UPDATE projects SET image = NULL, updated_at = ? WHERE id = ?').run(now(), id);
      announce(id);
      return deps.store.projects.require(id);
    },
    /** The bytes + type, or null (no picture, or its file is gone). */
    read(id: string): { bytes: Buffer; type: ImageType } | null {
      deps.store.projects.require(id);
      const rec = recordOf(id);
      const type = rec && TYPE_OF_EXT[rec.ext];
      if (!rec || !type || !existsSync(fileOf(id, rec.ext))) return null;
      return { bytes: readFileSync(fileOf(id, rec.ext)), type };
    },
  };
}
export type Portraits = ReturnType<typeof createPortraits>;
