/* A stub `gh` for tests (G1): a real executable script, so the studio's own gh runner is exercised.
   - `auth status` exits 1 while `<dir>/logged-out` exists;
   - `repo create NAME --private|--public` makes a bare repo `<dir>/remotes/NAME.git` and prints
     https://github.com/stub-owner/NAME (git pushes reach it through `gitEnv`'s insteadOf);
   - `repo view R --json visibility` prints the visibility recorded for R (PRIVATE by default);
   - `repo edit R --visibility V …` records it;
   - `api user …` prints stub-owner.
   Every call is appended to `<dir>/calls.log`. It never touches the network. */
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function stubGh(dir: string) {
  mkdirSync(join(dir, 'remotes'), { recursive: true });
  const bin = join(dir, 'gh');
  writeFileSync(
    bin,
    `#!/bin/sh
D='${dir}'
echo "$*" >> "$D/calls.log"
case "$1 $2" in
  "auth status") [ -e "$D/logged-out" ] && { echo "You are not logged into any GitHub hosts." >&2; exit 1; }; exit 0 ;;
  "repo create")
    [ -e "$D/remotes/$3.git" ] && { echo "GraphQL: Name already exists on this account" >&2; exit 1; }
    git init -q --bare "$D/remotes/$3.git" || exit 1
    case "$*" in *--public*) echo PUBLIC > "$D/remotes/$3.vis" ;; *) echo PRIVATE > "$D/remotes/$3.vis" ;; esac
    echo "https://github.com/stub-owner/$3"; exit 0 ;;
  "repo view") N=\${3#*/}; V=$(cat "$D/remotes/$N.vis" 2>/dev/null || echo PRIVATE); echo "{\\"visibility\\":\\"$V\\"}"; exit 0 ;;
  "api user") echo stub-owner; exit 0 ;;
  "repo edit") N=\${3#*/}; echo "$5" | tr a-z A-Z > "$D/remotes/$N.vis"; exit 0 ;;
esac
echo "stub gh: unknown command $*" >&2; exit 2
`,
  );
  chmodSync(bin, 0o755);
  return {
    bin,
    /** git: https://github.com/stub-owner/X → the local bare repo. */
    gitEnv: {
      GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_KEY_0: `url.${join(dir, 'remotes')}/.insteadOf`,
      GIT_CONFIG_VALUE_0: 'https://github.com/stub-owner/',
    },
    calls: () =>
      existsSync(join(dir, 'calls.log'))
        ? readFileSync(join(dir, 'calls.log'), 'utf8').trim().split('\n')
        : [],
    logOut: () => writeFileSync(join(dir, 'logged-out'), ''),
    remote: (name: string) => join(dir, 'remotes', `${name}.git`),
    visibility: (name: string) => readFileSync(join(dir, 'remotes', `${name}.vis`), 'utf8').trim(),
  };
}
