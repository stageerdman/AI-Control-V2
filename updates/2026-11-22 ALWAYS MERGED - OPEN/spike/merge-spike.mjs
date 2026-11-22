/* Spike: how today's merge (git merge in the user's project folder) behaves when that folder is dirty,
   and whether `git merge-tree --write-tree` can merge with no working tree at all.
   Run: node "updates/2026-11-22 ALWAYS MERGED - OPEN/spike/merge-spike.mjs" — throwaway temp repos only. */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const env = { ...process.env, GIT_AUTHOR_NAME: 's', GIT_AUTHOR_EMAIL: 's@x', GIT_COMMITTER_NAME: 's', GIT_COMMITTER_EMAIL: 's@x' };
const git = (cwd, ...a) => execFileSync('git', a, { cwd, env, encoding: 'utf8', stdio: 'pipe' }).trim();
const tryGit = (cwd, ...a) => {
  try {
    return { ok: true, out: git(cwd, ...a) };
  } catch (e) {
    return { ok: false, out: `${e.stdout ?? ''}${e.stderr ?? ''}`.trim().split('\n').slice(0, 2).join(' | ') };
  }
};
const say = (name, v) => console.log(`${v ? 'YES' : 'NO '}  ${name}`);

function repo() {
  const dir = mkdtempSync(join(tmpdir(), 'merge-spike-'));
  git(dir, 'init', '-q', '-b', 'master');
  writeFileSync(join(dir, 'a.txt'), 'one\n');
  writeFileSync(join(dir, 'b.txt'), 'one\n');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'base');
  return dir;
}
function branchEditing(dir, file, text) {
  git(dir, 'checkout', '-q', '-b', 'studio/x');
  writeFileSync(join(dir, file), text);
  git(dir, 'commit', '-qam', 'work');
  git(dir, 'checkout', '-q', 'master');
}

/* 1. dirty file NOT touched by the branch: today's merge works */
{
  const d = repo();
  branchEditing(d, 'a.txt', 'two\n');
  writeFileSync(join(d, 'b.txt'), 'user edit\n');
  say('1 dirty, other file: ff merge lands', tryGit(d, 'merge', '-q', '--ff-only', 'studio/x').ok);
}
/* 2. dirty file the branch touches: today's merge refuses -> item fails, work stranded */
{
  const d = repo();
  branchEditing(d, 'a.txt', 'two\n');
  writeFileSync(join(d, 'a.txt'), 'user edit\n');
  const r = tryGit(d, 'merge', '-q', '--ff-only', 'studio/x');
  say(`2 dirty, same file: ff merge lands (${r.out})`, r.ok);
}
/* 3. merge-tree: merge two diverged branches with no checkout, then advance master by ref */
{
  const d = repo();
  branchEditing(d, 'a.txt', 'two\n');
  writeFileSync(join(d, 'b.txt'), 'main moved\n');
  git(d, 'commit', '-qam', 'main moved');
  const tree = tryGit(d, 'merge-tree', '--write-tree', 'master', 'studio/x');
  say('3 merge-tree, no conflict: writes a tree', tree.ok);
  const commit = git(d, 'commit-tree', tree.out.split('\n')[0], '-p', 'master', '-p', 'studio/x', '-m', 'merge');
  say('3 commit-tree makes the merge commit', commit.length === 40);
}
/* 4. merge-tree on a conflict: exit 1, names the files, touches nothing */
{
  const d = repo();
  branchEditing(d, 'a.txt', 'branch\n');
  writeFileSync(join(d, 'a.txt'), 'main\n');
  git(d, 'commit', '-qam', 'main edit');
  const r = tryGit(d, 'merge-tree', '--write-tree', '--name-only', 'master', 'studio/x');
  say(`4 merge-tree reports the conflict without touching files (${r.out})`, !r.ok && git(d, 'status', '--porcelain') === '');
}
/* 5. project folder on another branch: today's merge refuses; a ref update of master does not care */
{
  const d = repo();
  branchEditing(d, 'a.txt', 'two\n');
  git(d, 'checkout', '-q', '-b', 'user-branch');
  const tip = git(d, 'rev-parse', 'studio/x');
  say('5 update-ref master while folder is elsewhere', tryGit(d, 'update-ref', 'refs/heads/master', tip, git(d, 'rev-parse', 'master')).ok);
}
