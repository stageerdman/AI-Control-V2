/* GitHub (G1): the studio creates a project's repo with `gh`, sets `origin`, pushes, flips visibility, and pushes
   again after every merge to main. Agents push to that origin themselves too (AGENTS PUSH: git-guard.ts).

   - By default the Project Setter creates the repo when it sets a project up (private, named after the folder);
     an adopted folder that already has an origin keeps it. Off per draft (`github: false`) or studio-wide
     (`githubByDefault: false`). gh missing / not logged in never fails a setup: the step is skipped and the
     project's health says "GitHub not connected — Publish".
   - `publish` is the user's button for the rest. It refuses clearly: no gh, gh not logged in, already a remote,
     not a git repo / no commit yet.
   - Auto-push: after `item.merged` on a published project, `git push origin <branch>`; a failure is a calm note
     on health + a `github.push {ok: false}` event — never the item's problem.
   State lives in `github_repos`, keyed by sandbox folder (a draft's setup and its project share it). */
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { promisify } from 'node:util';
import type { Db } from '../db/connection.ts';
import { metaFlag } from '../db/settings.ts';
import type { Store } from '../db/store.ts';
import { now, row } from '../db/util.ts';
import { AppError, conflict } from '../errors.ts';
import type { EventLog } from '../events/log.ts';
import { resolveInSandbox } from '../fs/sandbox.ts';
import { githubRepo, safeRemoteUrl } from '../health/git-status.ts';
import { head, isRepo } from '../setter/git.ts';
import { GH_HELPER_KEY, ghHelper } from './credential.ts';

const execFileP = promisify(execFile);
export type Visibility = 'public' | 'private';
export type LastPush = { ok: boolean; at: string; note?: string; commit?: string };
export type GithubView = {
  published: boolean;
  url: string | null;
  visibility: 'public' | 'private' | 'internal' | null;
  lastPush: LastPush | null;
  /** A calm line for health: not connected yet, or the last push failed. Absent when all is well. */
  note?: string;
};
export type SetupStep = { step: 'github'; status: 'done' | 'kept' | 'skipped'; detail: string };

/** Runs gh (configurable binary; tests use a stub). Resolves stdout; rejects with stderr in the message. */
export type GhRun = (args: string[], cwd?: string) => Promise<string>;
export function ghCli(bin: string): GhRun {
  return async (args, cwd) => {
    try {
      const { stdout } = await execFileP(bin, args, {
        ...(cwd ? { cwd } : {}),
        timeout: 60_000,
        env: {
          HOME: process.env.HOME ?? '',
          PATH: process.env.PATH ?? '/usr/bin:/bin',
          GH_PROMPT_DISABLED: '1',
          GH_NO_UPDATE_NOTIFIER: '1',
          NO_COLOR: '1',
        },
      });
      return stdout;
    } catch (e) {
      const err = e as { stderr?: string; message: string };
      throw new Error((err.stderr || err.message).trim().split('\n').slice(-3).join(' ').slice(0, 300));
    }
  };
}

const NOT_INSTALLED = 'GitHub CLI (gh) isn’t installed — install it (brew install gh), then publish again';
const NOT_LOGGED_IN = 'gh isn’t logged in — run `gh auth login` in Terminal, then publish again';
export const NOT_CONNECTED = 'GitHub not connected — Publish';

type RepoRow = {
  folder: string;
  url: string;
  visibility: GithubView['visibility'];
  last_push: string | null;
};

export function createGithub(deps: {
  db: Db;
  store: Store;
  events: EventLog;
  sandbox: string;
  /** null = gh not installed. */
  gh: GhRun | null;
  /** Extra env for git (tests point github.com at a local bare repo with GIT_CONFIG_*). */
  gitEnv?: Record<string, string>;
  /** The real gh binary: pushes to github.com authenticate through `gh auth git-credential` (no other git setup needed). */
  ghBin?: string | null;
}) {
  const { db, store, events } = deps;
  const git = async (cwd: string, args: string[], timeout = 15_000) =>
    (
      await execFileP('git', args, {
        cwd,
        timeout,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0', ...deps.gitEnv },
        encoding: 'utf8',
      })
    ).stdout.trim();
  const tryGit = async (cwd: string, args: string[]) => {
    try {
      return await git(cwd, args);
    } catch {
      return null;
    }
  };
  const repoRow = (folder: string) =>
    row<RepoRow>(db.prepare('SELECT * FROM github_repos WHERE folder = ?').get(folder));
  const save = (folder: string, url: string, visibility: GithubView['visibility']) => {
    const t = now();
    db.prepare(
      `INSERT INTO github_repos (folder, url, visibility, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(folder) DO UPDATE SET url = excluded.url, visibility = excluded.visibility, updated_at = excluded.updated_at`,
    ).run(folder, url, visibility, t, t);
  };
  const emit = (
    projectId: string,
    type: 'github.changed' | 'github.push',
    payload: Record<string, unknown>,
  ) => {
    try {
      events.append('project', projectId, { type, payload } as Parameters<EventLog['append']>[2]);
    } catch {
      /* a progress line never fails the work */
    }
  };
  const projectDir = (projectId: string) => {
    const p = store.projects.require(projectId);
    if (!p.folder) throw conflict(`Project '${p.name}' has no folder yet — set it up first`);
    const dir = resolveInSandbox(deps.sandbox, p.folder);
    if (!existsSync(dir)) throw conflict(`Project folder '${p.folder}' is missing on disk`);
    return { p, dir, folder: p.folder };
  };
  const firstRemote = async (dir: string) => {
    const name = ((await tryGit(dir, ['remote'])) ?? '').split('\n').filter(Boolean)[0];
    if (!name) return null;
    const url = await tryGit(dir, ['config', '--get', `remote.${name}.url`]); // as written (no insteadOf)
    return url ? { name, url: safeRemoteUrl(url) } : null;
  };
  const branchOf = async (dir: string) =>
    (await tryGit(dir, ['symbolic-ref', '--short', '-q', 'HEAD'])) || 'main';

  /** Can we use gh right now? */
  async function ready(): Promise<{ ok: true } | { ok: false; reason: string }> {
    if (!deps.gh) return { ok: false, reason: NOT_INSTALLED };
    try {
      await deps.gh(['auth', 'status']);
      return { ok: true };
    } catch {
      return { ok: false, reason: NOT_LOGGED_IN };
    }
  }

  async function push(
    dir: string,
  ): Promise<{ ok: true; commit: string | null } | { ok: false; note: string }> {
    const branch = await branchOf(dir);
    try {
      const helper = deps.ghBin ? ['-c', `${GH_HELPER_KEY}=${ghHelper(deps.ghBin)}`] : [];
      await git(dir, [...helper, 'push', '-u', 'origin', branch], 60_000);
      return { ok: true, commit: head(dir) };
    } catch (e) {
      const msg = ((e as { stderr?: string }).stderr || (e as Error).message)
        .trim()
        .split('\n')
        .slice(-2)
        .join(' ');
      return { ok: false, note: msg.slice(0, 300) || 'git push failed' };
    }
  }

  /** gh repo create → origin → push. Preflight refusals throw 409; a push failure after the repo exists does not. */
  async function publishDir(
    dir: string,
    folder: string,
    opts: { name: string; visibility: Visibility; description?: string },
  ): Promise<{ url: string; visibility: Visibility; pushed: boolean; note?: string }> {
    if (!isRepo(dir)) throw conflict('This project isn’t a git repository yet — set it up first');
    if (!head(dir)) throw conflict('Nothing to publish yet — the project has no commit');
    const remote = await firstRemote(dir);
    if (remote)
      throw conflict(`This project already has a remote (${remote.name} → ${remote.url})`, {
        remote: remote.url,
      });
    const r = await ready();
    if (!r.ok) throw conflict(r.reason);
    const gh = deps.gh as GhRun;
    let out: string;
    try {
      out = await gh(
        [
          'repo',
          'create',
          opts.name,
          `--${opts.visibility}`,
          ...(opts.description ? ['--description', opts.description.slice(0, 300)] : []),
        ],
        dir,
      );
    } catch (e) {
      throw conflict(`GitHub didn’t create the repo: ${(e as Error).message}`);
    }
    const url = /https:\/\/github\.com\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+/
      .exec(out)?.[0]
      ?.replace(/\.git$/, '');
    if (!url)
      throw new AppError('agent_error', 'gh created the repo but didn’t say where', {
        out: out.slice(0, 300),
      });
    await git(dir, ['remote', 'add', 'origin', `${url}.git`]);
    save(folder, url, opts.visibility);
    const p = await push(dir);
    const at = now();
    const last: LastPush = p.ok
      ? { ok: true, at, ...(p.commit ? { commit: p.commit } : {}) }
      : { ok: false, at, note: p.note };
    db.prepare('UPDATE github_repos SET last_push = ? WHERE folder = ?').run(JSON.stringify(last), folder);
    return { url, visibility: opts.visibility, pushed: p.ok, ...(p.ok ? {} : { note: p.note }) };
  }

  function view(folder: string | null): GithubView {
    const r = folder ? repoRow(folder) : undefined;
    if (!r) return { published: false, url: null, visibility: null, lastPush: null, note: NOT_CONNECTED };
    const lastPush = r.last_push ? (JSON.parse(r.last_push) as LastPush) : null;
    return {
      published: true,
      url: r.url,
      visibility: r.visibility,
      lastPush,
      ...(lastPush && !lastPush.ok
        ? { note: `Couldn’t push to GitHub: ${lastPush.note ?? 'unknown error'}` }
        : {}),
    };
  }

  /* one push at a time per project, in merge order */
  const queues = new Map<string, Promise<void>>();
  function pushAfterMerge(projectId: string): Promise<void> {
    const prev = queues.get(projectId) ?? Promise.resolve();
    const next = prev.then(async () => {
      const p = store.projects.get(projectId);
      if (!p?.folder || !repoRow(p.folder)) return;
      const dir = resolveInSandbox(deps.sandbox, p.folder);
      if (!existsSync(dir)) return;
      const r = await push(dir);
      const at = now();
      const last: LastPush = r.ok
        ? { ok: true, at, ...(r.commit ? { commit: r.commit } : {}) }
        : { ok: false, at, note: r.note };
      db.prepare('UPDATE github_repos SET last_push = ?, updated_at = ? WHERE folder = ?').run(
        JSON.stringify(last),
        at,
        p.folder,
      );
      emit(
        projectId,
        'github.push',
        r.ok ? { ok: true, ...(r.commit ? { commit: r.commit } : {}) } : { ok: false, note: r.note },
      );
    });
    const settled = next.catch(() => {});
    queues.set(projectId, settled);
    return settled;
  }
  /* auto-push: every merge into main on a published project */
  const unsubscribe = events.bus.subscribeAll((e) => {
    if (e.scope === 'project' && e.type === 'item.merged') void pushAfterMerge(e.scopeId);
  });

  const byDefault = metaFlag(db, 'github_by_default');
  const settings = { githubByDefault: byDefault.get, setGithubByDefault: byDefault.set };

  /* GET /github/status: can the studio use gh, and as whom (the publish form's owner prefix). */
  let login: string | null = null;
  async function status(): Promise<{ gh: 'ready' | 'missing' | 'signed-out'; login: string | null }> {
    if (!deps.gh) return { gh: 'missing', login: null };
    if (!(await ready()).ok) {
      login = null;
      return { gh: 'signed-out', login: null };
    }
    if (!login)
      try {
        login = (await deps.gh(['api', 'user', '--jq', '.login'])).trim().split('\n')[0] || null;
      } catch {
        /* the owner is a nicety; ready is what counts */
      }
    return { gh: 'ready', login };
  }

  return {
    ready,
    status,
    view,
    settings,
    pushAfterMerge,
    stop: unsubscribe,

    /** The Project Setter's GitHub step. Never throws: whatever goes wrong, setup still finishes. */
    async onSetup(
      dir: string,
      folder: string,
      opts: { want: boolean; name: string; description?: string },
    ): Promise<SetupStep> {
      try {
        const remote = await firstRemote(dir);
        if (remote) {
          const repo = githubRepo(remote.url);
          if (!repo)
            return {
              step: 'github',
              status: 'kept',
              detail: `Kept its remote (${remote.url}) — not on GitHub`,
            };
          let visibility: GithubView['visibility'] = null;
          if ((await ready()).ok) {
            try {
              const v = String(
                (
                  JSON.parse(await (deps.gh as GhRun)(['repo', 'view', repo, '--json', 'visibility'])) as {
                    visibility?: string;
                  }
                ).visibility ?? '',
              ).toLowerCase();
              if (v === 'public' || v === 'private' || v === 'internal') visibility = v;
            } catch {
              /* unknown visibility is fine */
            }
          }
          save(folder, `https://github.com/${repo}`, visibility);
          return { step: 'github', status: 'kept', detail: `Kept its GitHub repo ${repo}` };
        }
        if (!opts.want)
          return {
            step: 'github',
            status: 'skipped',
            detail: 'GitHub is off for this project — publish any time from health',
          };
        const p = await publishDir(dir, folder, {
          name: opts.name,
          visibility: 'private',
          ...(opts.description ? { description: opts.description } : {}),
        });
        return {
          step: 'github',
          status: 'done',
          detail: p.pushed
            ? `Created ${p.url} (private) and pushed`
            : `Created ${p.url} (private) — the push failed: ${p.note}`,
        };
      } catch (e) {
        return {
          step: 'github',
          status: 'skipped',
          detail: `${NOT_CONNECTED} — ${(e as Error).message}`.slice(0, 2000),
        };
      }
    },

    /** GET /projects/:id/github and the health payload: the view for this project's folder. */
    projectView: (projectId: string): GithubView => view(store.projects.require(projectId).folder),

    /** POST /projects/:id/github/publish — the user's button. */
    async publish(projectId: string, body: { name?: string; visibility: Visibility }) {
      const { p, dir, folder } = projectDir(projectId);
      const r = await publishDir(dir, folder, {
        name: body.name ?? folder.split('/').at(-1) ?? p.id,
        visibility: body.visibility,
        ...(p.note ? { description: p.note } : {}),
      });
      const v = view(folder);
      emit(projectId, 'github.changed', { published: true, url: v.url, visibility: v.visibility });
      return { ...v, pushed: r.pushed };
    },

    /** POST /projects/:id/github/push — the health row's "Try again" after a failed push. */
    async pushNow(projectId: string): Promise<GithubView> {
      const { folder } = projectDir(projectId);
      if (!repoRow(folder)) throw conflict('This project isn’t on GitHub yet — publish it first');
      await pushAfterMerge(projectId);
      return view(folder);
    },

    /** PATCH /projects/:id/github — the public/private switch. */
    async setVisibility(projectId: string, visibility: Visibility): Promise<GithubView> {
      const { folder } = projectDir(projectId);
      const row = repoRow(folder);
      if (!row) throw conflict('This project isn’t on GitHub yet — publish it first');
      const r = await ready();
      if (!r.ok) throw conflict(r.reason.replace('publish again', 'try again'));
      const repo = githubRepo(row.url) as string;
      try {
        await (deps.gh as GhRun)([
          'repo',
          'edit',
          repo,
          '--visibility',
          visibility,
          '--accept-visibility-change-consequences',
        ]);
      } catch (e) {
        throw conflict(`GitHub didn’t change the visibility: ${(e as Error).message}`);
      }
      db.prepare('UPDATE github_repos SET visibility = ?, updated_at = ? WHERE folder = ?').run(
        visibility,
        now(),
        folder,
      );
      const v = view(folder);
      emit(projectId, 'github.changed', { published: true, url: v.url, visibility: v.visibility });
      return v;
    },
  };
}
export type Github = ReturnType<typeof createGithub>;
