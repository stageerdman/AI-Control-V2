// One command to leave exactly one AI Studio on this Mac: the newest build from master, in /Applications.
//   node ~/dev/AI-Control-V2/app/scripts/clean-mac/main.mjs            find, show, ask "yes", then do it
//   … --dry-run                                                        only show what it would do
//   … --yes                                                            don't ask
// Old copies go to the Trash (never deleted for good). Step-by-step details: ~/.ai-studio/logs/clean-mac.log.
import { mkdirSync, openSync, writeSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { randomBytes } from 'node:crypto';
import { findCopies, macLookups, macPlaces } from '../install-mac/copies.mjs';
import { targetDirs } from '../install-mac/plan.mjs';
import { appDir, appIdentity, createSteps, LSREGISTER, repo } from '../install-mac/steps.mjs';
import { runClean, StopError } from './flow.mjs';
import { tilde } from './report.mjs';
import { moveToTrash } from './trash.mjs';

const home = homedir();
const studioHome = process.env.AI_STUDIO_HOME?.replace(/^~(?=$|\/)/, home) ?? join(home, '.ai-studio');
const logFile = join(studioHome, 'logs', 'clean-mac.log');
mkdirSync(dirname(logFile), { recursive: true });
const logFd = openSync(logFile, 'a');
const trace = randomBytes(3).toString('hex');
const log = (step, msg, ctx = {}) =>
  writeSync(logFd, `${JSON.stringify({ at: new Date().toISOString(), module: 'clean-mac', trace, step, msg, ...ctx })}\n`);
const say = (...lines) => {
  for (const l of lines) console.log(l);
};
const steps = createSteps({ log, output: logFd });
process.env.GIT_TERMINAL_PROMPT = '0'; // a fetch that needs a password fails at once instead of hanging

/** The main checkout's master, compared with GitHub's (fetched once). Read-only until fastForward(). */
function gitSource() {
  const tryGit = (args) => {
    try {
      return steps.git('git', args);
    } catch {
      return null;
    }
  };
  let fetchNote = null;
  if (tryGit(['fetch', '--quiet', 'origin', 'master']) === null)
    fetchNote = "couldn't reach GitHub; using the local master";
  const ancestor = (a, b) => tryGit(['merge-base', '--is-ancestor', a, b]) !== null;
  return {
    state() {
      const master = steps.git('git', ['rev-parse', 'master']);
      const origin = tryGit(['rev-parse', '--verify', '--quiet', 'refs/remotes/origin/master']);
      const fastForward = Boolean(origin && origin !== master && ancestor(master, origin));
      const notes = fetchNote ? [fetchNote] : [];
      if (origin && origin !== master && !fastForward && !ancestor(origin, master))
        notes.push('local master and GitHub master have diverged; building the local one');
      if (tryGit(['status', '--porcelain'])) notes.push('the checkout has uncommitted changes; they are built in too');
      return { branch: steps.git('git', ['rev-parse', '--abbrev-ref', 'HEAD']), master, latest: fastForward ? origin : master, fastForward, notes };
    },
    fastForward: () => steps.git('git', ['merge', '--ff-only', 'origin/master']),
    head: () => steps.git('git', ['rev-parse', 'HEAD']),
  };
}

async function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await rl.question(question);
  } finally {
    rl.close();
  }
}

async function main() {
  const app = appIdentity();
  const places = macPlaces(home, targetDirs({ env: process.env, home, appDir }));
  const lookups = macLookups(steps.run, LSREGISTER, (msg) => say(`  Note: ${msg}`));
  const unregister = (path) => {
    try {
      steps.run('forget', LSREGISTER, ['-u', path]);
    } catch (e) {
      log('forget', 'lsregister -u failed (the check at the end shows if it is still listed)', { path, error: e.message });
    }
  };
  log('start', 'clean-up', { repo, target: app.target, args: process.argv.slice(2) });
  return runClean({
    app,
    repo,
    source: gitSource(),
    steps,
    discover: () => findCopies({ places, productName: app.productName, bundleId: app.bundleId, ...lookups }),
    actions: {
      trash: (path) => log('trash', 'moved to the Trash', { path, to: moveToTrash(path, places.trash) }),
      eject: (volume) => steps.run('eject', 'hdiutil', ['detach', volume], { capture: true }),
      unregister,
    },
    io: { say, ask },
    show: tilde(home),
    dryRun: process.argv.includes('--dry-run'),
    yes: process.argv.includes('--yes'),
  });
}

try {
  process.exitCode = await main();
} catch (e) {
  log('failed', e.message, { cause: e.cause?.message });
  if (e instanceof StopError) {
    say('', e.message, 'Nothing changed.');
    process.exitCode = 2;
  } else {
    say('', `Failed: ${e.message}`, `Details: ${tilde(home)(logFile)}`);
    process.exitCode = 1;
  }
}
