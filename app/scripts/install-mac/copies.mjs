// Find every copy of AI Studio on this Mac: app folders, Downloads/Desktop, build output, mounted disk images,
// what Spotlight has indexed (by bundle id and by name) and what Launch Services still has registered.
// The system calls come in as `spotlight` and `launchServices`, so a test can plant copies in a temp folder.
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { namesProduct, parseLsDump, uniqueCopies } from './plan.mjs';

/** Where copies end up on a Mac. `home` is the user's home; `buildDirs` the cargo target dirs. */
export function macPlaces(home, buildDirs) {
  return {
    folders: ['/Applications', join(home, 'Applications'), join(home, 'Downloads'), join(home, 'Desktop')],
    buildDirs: buildDirs.flatMap((d) =>
      ['release', 'debug'].flatMap((p) => [join(d, p, 'bundle', 'macos'), join(d, p, 'bundle', 'dmg')]),
    ),
    volumes: '/Volumes',
    trash: join(home, '.Trash'),
  };
}

const list = (dir) => {
  try {
    return readdirSync(dir).map((n) => join(dir, n));
  } catch {
    return []; // a folder that isn't there has no copies
  }
};

/** Copies named after the product directly inside `dirs`. */
const namedIn = (dirs, productName) =>
  dirs.flatMap(list).filter((p) => namesProduct(p.split('/').pop(), productName));

/** @returns {{kind: 'app'|'dmg'|'volume'|'ghost', path: string}[]} every copy, the installed one included */
export function findCopies({ places, productName, bundleId, spotlight, launchServices, exists = existsSync }) {
  const mounted = list(places.volumes);
  const found = [
    ...namedIn([...places.folders, ...places.buildDirs, ...mounted], productName),
    ...spotlight(`kMDItemCFBundleIdentifier == "${bundleId}"`),
    ...spotlight(`kMDItemFSName == "*${productName}*"c`).filter((p) => namesProduct(p.split('/').pop(), productName)),
    ...parseLsDump(launchServices(), bundleId),
  ];
  return uniqueCopies(found, { exists, volumes: places.volumes, trash: places.trash });
}

/** The real system: mdfind and lsregister -dump through `run` (steps.mjs). A failing lookup is reported and
    treated as "found nothing", so one broken index never hides what the folders show. */
export function macLookups(run, lsregister, warn) {
  const safe = (what, fallback, fn) => {
    try {
      return fn();
    } catch (e) {
      warn(`${what} lookup failed: ${e.message}`);
      return fallback;
    }
  };
  return {
    spotlight: (query) =>
      safe('Spotlight', [], () => run('find', 'mdfind', [query], { capture: true }).split('\n').filter(Boolean)),
    launchServices: () => safe('Launch Services', '', () => run('find', lsregister, ['-dump'], { capture: true })),
  };
}
