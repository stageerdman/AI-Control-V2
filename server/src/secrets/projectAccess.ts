/* What a project can reach. Grants live in the db (default: nothing); `sync`
   writes exactly the granted secrets into the project's own .env inside the
   sandbox, in a managed block it rewrites every time — so an ungranted key
   disappears on the next sync and lines the user wrote by hand stay. */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Store } from '../db/store.ts';
import { conflict } from '../errors.ts';
import { resolveInSandbox, SandboxError } from '../fs/sandbox.ts';
import { type EnvLine, formatLine, parseEnv, serializeEnv } from './dotenv.ts';
import { readEnvFile, type SecretStore, writeFileAtomic } from './secretStore.ts';

export const BLOCK_BEGIN = '# >>> AI Studio access (managed: rewritten on every sync) >>>';
export const BLOCK_END = '# <<< AI Studio access <<<';
const GITIGNORE_COVERS_ENV = new Set(['.env', '/.env', '.env*', '/.env*', '*.env']);

export type AccessEntry = {
  credentialId: string;
  name: string;
  envVar: string;
  serves: string;
  hasValue: boolean;
  last4: string | null;
  granted: boolean;
};
export type ProjectAccessView = { projectId: string; granted: number; total: number; entries: AccessEntry[] };
export type SyncResult = {
  /** Sandbox-relative path of the project's .env. */
  file: string;
  /** Env var names now in the managed block. */
  written: string[];
  /** Env var names dropped from it since the last sync. */
  removed: string[];
  /** Granted, but the cabinet has no value for them — not written. */
  missing: string[];
  gitignore: 'present' | 'added';
};

/** Split a .env into the lines outside the managed block and the keys inside it. */
function splitBlock(lines: EnvLine[]): { outside: EnvLine[]; blockKeys: string[] } {
  const b = lines.findIndex((l) => l.raw.trim() === BLOCK_BEGIN);
  if (b === -1) return { outside: lines, blockKeys: [] };
  let e = lines.findIndex((l, i) => i > b && l.raw.trim() === BLOCK_END);
  if (e === -1) e = lines.length - 1; // unterminated: the block runs to the end
  const block = lines.slice(b + 1, e);
  return {
    outside: [...lines.slice(0, b), ...lines.slice(e + 1)],
    blockKeys: block.flatMap((l) => (l.key ? [l.key] : [])),
  };
}

function ensureGitignore(dir: string): SyncResult['gitignore'] {
  const path = join(dir, '.gitignore');
  const text = existsSync(path) ? readFileSync(path, 'utf8') : '';
  if (text.split(/\r?\n/).some((l) => GITIGNORE_COVERS_ENV.has(l.trim()))) return 'present';
  const mode = existsSync(path) ? statSync(path).mode & 0o777 : 0o644;
  writeFileAtomic(path, `${text}${text === '' || text.endsWith('\n') ? '' : '\n'}.env\n`, mode);
  return 'added';
}

export function projectAccess(store: Store, secrets: SecretStore, sandbox: string) {
  const projectDir = (projectId: string) => {
    const p = store.projects.require(projectId);
    if (!p.folder) throw conflict(`Project '${p.name}' has no folder yet — set it up first`);
    let dir: string;
    try {
      dir = resolveInSandbox(sandbox, p.folder);
    } catch (e) {
      if (e instanceof SandboxError) throw conflict(e.message, { folder: p.folder });
      throw e;
    }
    if (!existsSync(dir) || !statSync(dir).isDirectory())
      throw conflict(`Project folder '${p.folder}' doesn't exist yet — set the project up first`, {
        folder: p.folder,
      });
    return { dir, folder: p.folder };
  };

  /** The granted env vars that have a value — the ONLY place values leave the store. */
  const grantedEnv = (projectId: string) => {
    const granted = new Set(store.credentials.grantedIds(projectId));
    const env: Record<string, string> = {};
    const missing: string[] = [];
    for (const c of store.credentials.list()) {
      if (!granted.has(c.id)) continue;
      const v = secrets.get(c.envVar);
      if (v) env[c.envVar] = v;
      else missing.push(c.envVar);
    }
    return { env, missing };
  };

  const svc = {
    view(projectId: string): ProjectAccessView {
      const granted = new Set(store.credentials.grantedIds(projectId));
      const entries = store.credentials.list().map((c) => ({
        credentialId: c.id,
        name: c.name,
        envVar: c.envVar,
        serves: c.serves,
        hasValue: c.hasValue,
        last4: c.last4,
        granted: granted.has(c.id),
      }));
      return { projectId, granted: granted.size, total: entries.length, entries };
    },

    setGrants(projectId: string, grants: Record<string, boolean>): ProjectAccessView {
      store.tx(() => store.credentials.setGrants(projectId, grants));
      return svc.view(projectId);
    },

    sync(projectId: string): SyncResult {
      const { dir, folder } = projectDir(projectId);
      const { env, missing } = grantedEnv(projectId);
      const path = join(dir, '.env');
      const existed = existsSync(path);
      const { outside, blockKeys } = splitBlock(readEnvFile(path));
      const written = Object.keys(env);
      /* the block wins over a hand-written duplicate of a granted key */
      const kept = outside.filter((l) => !(l.key && written.includes(l.key)));
      let next = kept;
      if (written.length) {
        const last = kept[kept.length - 1];
        const gap = last && last.raw.trim() !== '' ? [{ raw: '' }] : [];
        next = [
          ...kept,
          ...gap,
          { raw: BLOCK_BEGIN },
          ...written.map((k) => parseEnv(formatLine(k, env[k] as string))[0] as EnvLine),
          { raw: BLOCK_END },
        ];
      }
      if (existed || written.length) writeFileAtomic(path, serializeEnv(next), 0o600);
      return {
        file: join(folder, '.env'),
        written,
        removed: blockKeys.filter((k) => !written.includes(k)),
        missing,
        gitignore: ensureGitignore(dir),
      };
    },

    /** For the agent runtime (B5): the env a run in this project may see. Never send over HTTP. */
    envFor: (projectId: string): Record<string, string> => grantedEnv(projectId).env,
  };
  return svc;
}
export type ProjectAccess = ReturnType<typeof projectAccess>;
