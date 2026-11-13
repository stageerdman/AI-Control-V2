/* Where secret VALUES live: a .env file (the global one is ~/.ai-control/.env).
   The db only ever holds metadata + last-4. Writes are atomic (tmp + fsync +
   rename) and leave the file 0600; lines we don't own are preserved. */
import { randomBytes } from 'node:crypto';
import {
  closeSync,
  existsSync,
  fchmodSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { type EnvLine, getValue, keys, parseEnv, removeKey, serializeEnv, setValue } from './dotenv.ts';

export interface SecretStore {
  get(envVar: string): string | undefined;
  set(envVar: string, value: string): void;
  delete(envVar: string): void;
  /** Every key in the file, in order (includes empty placeholders). */
  keys(): string[];
}

/** Write `text` to `path` atomically with `mode` (default 0600). Follows a symlinked target. */
export function writeFileAtomic(path: string, text: string, mode = 0o600): void {
  const target = existsSync(path) ? realpathSync(path) : path;
  mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
  const tmp = join(dirname(target), `.${basename(target)}.${randomBytes(6).toString('hex')}.tmp`);
  const fd = openSync(tmp, 'wx', mode);
  try {
    fchmodSync(fd, mode); // umask-proof
    writeSync(fd, text);
    fsyncSync(fd);
  } catch (e) {
    closeSync(fd);
    rmSync(tmp, { force: true });
    throw e;
  }
  closeSync(fd);
  try {
    renameSync(tmp, target);
  } catch (e) {
    rmSync(tmp, { force: true });
    throw e;
  }
}

export function readEnvFile(path: string): EnvLine[] {
  return existsSync(path) ? parseEnv(readFileSync(path, 'utf8')) : [];
}

/** File-backed store. Re-reads on every call, so hand edits are always seen. */
export function fileSecretStore(path: string): SecretStore & { path: string } {
  const update = (fn: (lines: EnvLine[]) => EnvLine[]) =>
    writeFileAtomic(path, serializeEnv(fn(readEnvFile(path))));
  return {
    path,
    get: (envVar) => getValue(readEnvFile(path), envVar),
    set: (envVar, value) => update((l) => setValue(l, envVar, value)),
    delete: (envVar) => {
      const lines = readEnvFile(path);
      if (lines.some((l) => l.key === envVar)) writeFileAtomic(path, serializeEnv(removeKey(lines, envVar)));
    },
    keys: () => keys(readEnvFile(path)),
  };
}
