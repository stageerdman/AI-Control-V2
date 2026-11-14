/* The health board's GitHub row, pure (spec-ux-G2 §2b–2e): which state the row is in and its exact
   words, and how publish / visibility errors read. The component (GithubRow) only renders this. */
import { isApiError } from '../../api/client';
import type { GhStatus, GithubView, GitStatus } from '../../api/types';
import { ago } from './time';

export type GhRowState =
  | { kind: 'loading'; text: string }
  | { kind: 'no-repo'; text: string }
  | { kind: 'other-remote'; text: string }
  | { kind: 'not-tracked'; text: string; repo: string; url: string }
  | { kind: 'unpublished'; text: string; gh: GhStatus['gh'] | null }
  | {
      kind: 'published';
      repo: string;
      name: string;
      url: string;
      public: boolean;
      /** The small trailing push text. */
      push: string;
      pushFailed: boolean;
    };

/** "https://github.com/stage/tip-splitter" → "stage/tip-splitter". */
export const repoOf = (url: string): string =>
  url.replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/, '');

export function ghRowState(
  view: GithubView | undefined,
  git: GitStatus | undefined,
  gh: GhStatus | undefined,
  now = Date.now(),
): GhRowState {
  if (!git || !view) return { kind: 'loading', text: '…' };
  if (view.published && view.url) {
    const repo = repoOf(view.url);
    const last = view.lastPush;
    return {
      kind: 'published',
      repo,
      name: repo.split('/').at(-1) ?? repo,
      url: view.url,
      public: view.visibility === 'public',
      push: !last
        ? 'not pushed yet'
        : last.ok
          ? `pushed ${ago(last.at, now)}`
          : 'last push didn’t go through',
      pushFailed: !!last && !last.ok,
    };
  }
  if (!git.repo) return { kind: 'no-repo', text: 'No git repository yet' };
  if (git.remote) {
    const repo = git.github.repo;
    if (repo)
      return {
        kind: 'not-tracked',
        text:
          git.github.visibility === 'public'
            ? 'Public'
            : git.github.visibility === 'private'
              ? 'Private'
              : '',
        repo,
        url: `https://github.com/${repo}`,
      };
    return { kind: 'other-remote', text: `Has another remote (${git.remote.name}) — publishing is off` };
  }
  const tail =
    gh?.gh === 'missing'
      ? ' · needs the GitHub CLI'
      : gh?.gh === 'signed-out'
        ? ' · sign in to the GitHub CLI'
        : '';
  return { kind: 'unpublished', text: `Not on GitHub yet${tail}`, gh: gh?.gh ?? null };
}

/** The how-to line when gh isn't ready (AI Studio never runs gh auth itself). */
export const ghHint = (gh: GhStatus['gh']): string | null =>
  gh === 'missing'
    ? 'Install the GitHub CLI (brew install gh), then sign in with gh auth login in Terminal.'
    : gh === 'signed-out'
      ? 'Run gh auth login in Terminal, then come back.'
      : null;

export const REPO_NAME = /^[A-Za-z0-9._-]{1,100}$/;

/** The publish confirm sentence (spec §2c). */
export function publishSentence(owner: string | null, name: string, pub: boolean, commits: number): string {
  const where = `github.com/${owner ? `${owner}/` : ''}${name}`;
  const main = `push main (${commits} commit${commits === 1 ? '' : 's'})`;
  return pub
    ? `Create ${where} as a public repo — anyone can see the code and its full history — and ${main}?`
    : `Create ${where} as a private repo and ${main}?`;
}

/** A failed publish, in one sentence (the server's 409s are already written for the user). */
export function publishError(e: unknown, name: string): string {
  if (!isApiError(e)) return 'Couldn’t reach GitHub — nothing was published.';
  if (e.code === 'network') return 'Couldn’t reach GitHub — nothing was published.';
  if (/already exists/i.test(e.message)) return `You already have a repo called ${name} — pick another name.`;
  if (/logged in|auth/i.test(e.message)) return 'GitHub signed you out — run gh auth login, then try again.';
  return e.issues[0] ?? e.message;
}
