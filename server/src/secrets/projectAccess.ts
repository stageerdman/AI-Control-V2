/* What a project can reach. Grants live in the db (default: nothing); `sync`
   writes exactly the granted secrets into the project's own .env inside the
   sandbox, in a managed block it rewrites every time — so an ungranted key
   disappears on the next sync and lines the user wrote by hand stay. */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Store } from '../db/store.ts';
import { conflict } from '../errors.ts';
import { resolveInSandbox, SandboxError } from '../fs/sandbox.ts';
import { bundleIdOf } from './bundleId.ts';
import type { Access, Cabinet } from './cabinet.ts';
import { type EnvLine, formatLine, parseEnv, serializeEnv } from './dotenv.ts';
import { appDataFolder, checkFolder, type FolderGuard, liveFolder } from './folderAccess.ts';
import { readEnvFile, type SecretStore, writeFileAtomic } from './secretStore.ts';

export const BLOCK_BEGIN = '# >>> AI Studio access (managed: rewritten on every sync) >>>';
export const BLOCK_END = '# <<< AI Studio access <<<';
const GITIGNORE_COVERS_ENV = new Set(['.env', '/.env', '.env*', '/.env*', '*.env']);

/** B3 row (the current app's Access sheet): an access read through its first field. */
export type AccessEntry = {
  credentialId: string;
  name: string;
  envVar: string;
  serves: string;
  hasValue: boolean;
  last4: string | null;
  granted: boolean;
};
/** G1 row: the whole access (non-secret values included, as in GET /accesses) + this project's view of it. */
export type ProjectAccessItem = Access & {
  granted: boolean;
  /** Added to the cabinet since this project last looked (POST …/access/seen). */
  isNew: boolean;
};
export type ProjectAccessView = {
  projectId: string;
  granted: number;
  total: number;
  /** When the project last looked (its creation before the first look). */
  seenAt: string;
  /** How many accesses are new since then (the "new" dot). */
  newCount: number;
  accesses: ProjectAccessItem[];
  /** @deprecated B3 shape, kept while the app still reads it. */
  entries: AccessEntry[];
};
/** What an agent is told it can reach: names, labels and env vars — never a value. */
export type AgentAccess = {
  name: string;
  serves: string;
  instructions: string;
  /** A folder access: the folder it shares, read and write. */
  folder: string | null;
  fields: { label: string; envVar: string; hasValue: boolean }[];
};
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

export function projectAccess(
  store: Store,
  secrets: SecretStore,
  sandbox: string,
  deps: {
    cabinet: Cabinet;
    notify?: (projectId: string, accessId: string, granted: boolean) => void;
    /** Folder accesses: the same guard the cabinet saves them with. Absent = no folder ever reaches a run. */
    folders?: FolderGuard;
  },
) {
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

  const granted = (projectId: string) => {
    const ids = new Set(store.accesses.grantedIds(projectId));
    return store.accesses.list().filter((a) => ids.has(a.id));
  };
  /** Every field of every granted access that has a value — the ONLY place values leave the store. */
  const grantedEnv = (projectId: string) => {
    const env: Record<string, string> = {};
    const missing: string[] = [];
    for (const a of granted(projectId))
      for (const f of a.fields) {
        const v = secrets.get(f.envVar);
        if (v) env[f.envVar] = v;
        else missing.push(f.envVar);
      }
    return { env, missing };
  };
  const svc = {
    view(projectId: string): ProjectAccessView {
      const ids = new Set(store.accesses.grantedIds(projectId));
      const seenAt = store.accesses.seenAt(projectId);
      const all = store.accesses.list();
      const accesses = deps.cabinet
        .list()
        .map((a) => ({ ...a, granted: ids.has(a.id), isNew: a.createdAt > seenAt }));
      const entries = all.map((a) => {
        const f = a.fields[0];
        return {
          credentialId: a.id,
          name: a.name,
          envVar: f?.envVar ?? '',
          serves: a.serves,
          hasValue: !!f?.hasValue,
          last4: f?.last4 ?? null,
          granted: ids.has(a.id),
        };
      });
      return {
        projectId,
        granted: ids.size,
        total: all.length,
        seenAt,
        newCount: accesses.filter((a) => a.isNew).length,
        accesses,
        entries,
      };
    },

    setGrants(projectId: string, grants: Record<string, boolean>): ProjectAccessView {
      const changed = store.tx(() => store.accesses.setGrants(projectId, grants));
      for (const id of changed) deps.notify?.(projectId, id, grants[id] as boolean);
      return svc.view(projectId);
    },

    /** The project looked at its access now: nothing reads as new until another access is added. */
    markSeen: (projectId: string) => ({ projectId, seenAt: store.accesses.markSeen(projectId) }),

    sync(projectId: string): SyncResult {
      const { dir, folder } = projectDir(projectId);
      return syncInto(projectId, dir, folder);
    },

    /** The same managed block in a running agent's own checkout (`dir`: its absolute cwd, already guarded by the
        runtime) — how a newly granted access reaches a session that is already working. */
    syncDir: (projectId: string, dir: string): SyncResult => {
      if (!existsSync(dir) || !statSync(dir).isDirectory())
        throw conflict(`The working folder is missing on disk`, { dir });
      return syncInto(projectId, dir, dir);
    },

    /** For the agent runtime (B5): the env a run in this project may see. Never send over HTTP. */
    envFor: (projectId: string): Record<string, string> => grantedEnv(projectId).env,

    /** For agents' prompts: what each granted access provides, by label and env var. No values. */
    agentAccess: (projectId: string): AgentAccess[] => granted(projectId).map(agentView),

    /** For the agent runtime: the real paths of the granted folders that exist — each run's extra working folders. */
    foldersFor: (projectId: string): string[] => {
      const guard = deps.folders;
      if (!guard) return [];
      return granted(projectId).flatMap((a) => {
        const real = a.folder ? liveFolder(a.folder, guard) : null;
        return real ? [real] : [];
      });
    },

    /** Put this project's Mac app data folder (`~/Library/Application Support/<its bundle id>`) in the cabinet,
        not granted: the user shares it. Safe to repeat — an existing entry comes back as it is. */
    addAppDataFolder(projectId: string): { access: Access; created: boolean } {
      if (!deps.folders) throw conflict('This studio takes no folder accesses');
      const name = store.projects.require(projectId).name;
      const folder = appDataFolder(deps.folders.userHome, bundleIdOf(projectDir(projectId).dir));
      const existing = store.accesses.byFolder(checkFolder(folder, deps.folders));
      if (existing) return { access: deps.cabinet.get(existing.id), created: false };
      const access = deps.cabinet.create({
        name: `${name} app data`,
        serves: `The ${name} Mac app's data folder (read and write)`,
        instructions: 'Quit the app before changing its data. Back up what you change first.',
        folder,
        fields: [],
      });
      return { access, created: true };
    },

    /** One access as an agent is told about it (no values); null when it is gone. */
    agentAccessOf: (accessId: string): AgentAccess | null => {
      const a = store.accesses.list().find((x) => x.id === accessId);
      return a ? agentView(a) : null;
    },
  };
  /** Write exactly the granted values into `<dir>/.env`'s managed block; `label` names the folder in the result. */
  function syncInto(projectId: string, dir: string, label: string): SyncResult {
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
      file: join(label, '.env'),
      written,
      removed: blockKeys.filter((k) => !written.includes(k)),
      missing,
      gitignore: ensureGitignore(dir),
    };
  }
  return svc;
}
export type ProjectAccess = ReturnType<typeof projectAccess>;

const agentView = (a: Access): AgentAccess => ({
  name: a.name,
  serves: a.serves,
  instructions: a.instructions,
  folder: a.folder,
  fields: a.fields.map((f) => ({ label: f.label, envVar: f.envVar, hasValue: f.hasValue })),
});
