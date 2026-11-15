// Build AI Studio and make it the one copy on this Mac: /Applications/AI Studio.app, registered with
// Launch Services and Spotlight, every other app copy removed. Run: `npm --prefix app run install:mac`
// (the studio's backend runs it on start when the installed app is behind, and after every merge).
// Prints one JSON line per step (with a trace id) so the log tells the whole story.
// The interactive, ask-first version that also clears disk images is ../clean-mac.
import { randomBytes } from 'node:crypto';
import { rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { findCopies, macLookups, macPlaces } from './copies.mjs';
import { targetDirs } from './plan.mjs';
import { appDir, appIdentity, createSteps, LSREGISTER, repo } from './steps.mjs';

const trace = randomBytes(3).toString('hex');
const log = (step, msg, ctx = {}) =>
  console.log(JSON.stringify({ at: new Date().toISOString(), module: 'install-mac', trace, step, msg, ...ctx }));
const steps = createSteps({ log });

/** Remove every other app copy and forget registrations whose file is gone. Disk images are left alone. */
function removeStale({ productName, bundleId, target }) {
  const places = macPlaces(homedir(), targetDirs({ env: process.env, home: homedir(), appDir }));
  const lookups = macLookups(steps.run, LSREGISTER, (msg) => log('cleanup', msg));
  const copies = findCopies({ places, productName, bundleId, ...lookups });
  for (const copy of copies.filter((c) => c.path !== target && (c.kind === 'app' || c.kind === 'ghost'))) {
    try {
      steps.run('cleanup', LSREGISTER, ['-u', copy.path]);
      if (copy.kind === 'app') rmSync(copy.path, { recursive: true, force: true });
      log('cleanup', copy.kind === 'app' ? 'removed an old copy' : 'unregistered a missing copy', copy);
    } catch (e) {
      log('cleanup', 'could not remove an old copy (left in place)', { ...copy, error: e.message });
    }
  }
}

function main() {
  const app = appIdentity();
  log('start', 'installing AI Studio', { repo, target: app.target });
  steps.checkCheckout();
  steps.checkToolchain();
  /* the commit being built, read before the build: a merge landing mid-build is the next run's job */
  const commit = steps.git('start', ['rev-parse', 'HEAD']);
  steps.ensureDeps();
  const bundle = steps.build(app.productName);
  const open = steps.isOpen(app.target);
  steps.install(bundle, app.target);
  removeStale(app);
  steps.register(app.target);
  steps.writeMarker(commit, app.target);
  log('done', open ? 'installed; the open app switches to it when quit and reopened' : 'installed', {
    target: app.target,
    commit: commit.slice(0, 7),
  });
}

try {
  main();
} catch (e) {
  log('failed', e.message, { cause: e.cause?.message });
  process.exit(1);
}
