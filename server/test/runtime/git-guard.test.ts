/* AGENTS PUSH: agents push to their own origin freely; force, other remotes and remote deletes are refused. */
import { describe, expect, it } from 'vitest';
import { checkGit } from '../../src/runtime/git-guard.ts';

describe('the git guard', () => {
  it.each([
    'git push',
    'git push origin',
    'git push origin main',
    'git push origin master',
    'git push -u origin studio/my-branch',
    'git push --set-upstream origin HEAD',
    'git push origin 1bb2479:main',
    'git push origin HEAD:refs/heads/main',
    'git push origin --tags',
    'git push --follow-tags origin main',
    'git push origin v1.2.0',
    'git push -o ci.skip origin main',
    'git push --dry-run origin main',
    'git push . HEAD:master',
    "git push 'origin' main",
    'CI=1 git push origin main',
    'git status',
    'git -C .. merge --ff-only studio/x',
    'git -c user.name=Bob commit -m x',
    'git remote -v',
    'git remote get-url origin',
    'git config --get remote.origin.url',
    'git config remote.origin.url',
    'git config user.email bob@example.com',
    'npm run deploy',
    'npx wrangler pages deploy dist',
    'echo git push --force',
  ])('lets through %s', (cmd) => {
    expect(checkGit(cmd)).toEqual({ kind: 'ok' });
  });

  it.each([
    ['git push --force origin master', /Force pushes/],
    ['git push -f origin main', /Force pushes/],
    ['git push -uf origin main', /Force pushes/],
    ['git push origin main --force', /Force pushes/],
    ['git push --force-with-lease origin main', /Force pushes/],
    ['git push --force-with-lease=main:abc origin main', /Force pushes/],
    ['git push origin +HEAD:master', /Force pushes/],
    ['git push origin +main', /Force pushes/],
    ['git push --mirror origin', /Force pushes/],
    ['git push . +HEAD:master', /Force pushes/],
    ['git push origin --delete feature', /Deleting remote branches/],
    ['git push origin -d feature', /Deleting remote branches/],
    ['git push origin :feature', /Deleting remote branches/],
    ['git push --prune origin', /Deleting remote branches/],
    ['git push upstream main', /origin only/],
    ['git push https://github.com/someone/other.git main', /origin only/],
    ['git push --repo=other main', /--repo is refused/],
    ['git push --receive-pack=evil origin main', /--receive-pack is refused/],
    ['git -C ../other-project push origin main', /inside this project's folder/],
    ['git --git-dir=/x/.git push', /inside this project's folder/],
    ['git status && git push --force origin main', /Force pushes/],
    ['git remote add other git@github.com:x/y.git', /git remote add is refused/],
    ['git remote set-url origin git@github.com:x/y.git', /git remote set-url is refused/],
    ['git config remote.origin.url git@github.com:x/y.git', /reroutes/],
    ['git config alias.ship "push --force"', /reroutes/],
    ['git config set url.evil.insteadOf origin', /reroutes/],
    ['git -c alias.p=push p', /reroutes/],
    ['git -c remote.origin.url=x push', /reroutes/],
  ])('refuses %s', (cmd, why) => {
    const r = checkGit(cmd);
    expect(r.kind).toBe('deny');
    expect(r.kind === 'deny' && r.reason).toMatch(why);
  });
});
