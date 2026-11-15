// The clean-up, start to finish: check, find every copy, show the list, ask, build from latest master,
// clear the old copies (Trash / eject / forget), install, refresh Spotlight, report. Every system call comes
// in through `deps`, so the whole flow runs in a test against planted copies.
import { formatPlan, formatSummary } from './report.mjs';

export class StopError extends Error {
  name = 'StopError';
}

/** One old copy cleared; a failure is recorded and the rest go on (the summary lists it). */
function clear(copy, actions) {
  try {
    if (copy.kind === 'volume') actions.eject(copy.path);
    else {
      actions.unregister(copy.path);
      if (copy.kind !== 'ghost') actions.trash(copy.path);
    }
    return { ...copy };
  } catch (e) {
    return { ...copy, error: e.message };
  }
}

/**
 * @param deps.app      { productName, bundleId, target }
 * @param deps.source   { state() → {branch, master, latest, fastForward, notes}, fastForward(), head() }
 * @param deps.steps    install steps (../install-mac/steps.mjs)
 * @param deps.discover () → copies (../install-mac/copies.mjs findCopies)
 * @param deps.actions  { trash(path), eject(volume), unregister(path) }
 * @param deps.io       { say(line), ask(question) → Promise<string> }
 * @returns exit code: 0 done and MATCH (or a dry run) · 1 done with a problem · 2 stopped, nothing changed
 */
export async function runClean({ app, repo, source, steps, discover, actions, io, show, dryRun = false, yes = false }) {
  const state = source.state();
  /* a dry run changes nothing, so what would stop a real run is only a note there */
  const stop = (why) => {
    if (!dryRun) throw new StopError(why);
    state.notes.push(`a real run would stop here: ${why}`);
  };
  try {
    steps.checkCheckout();
  } catch (e) {
    stop(e.message);
  }
  if (steps.isOpen(app.target)) stop('AI Studio is open. Quit it (⌘Q), then run this again.');
  if (state.branch !== 'master') stop(`${repo} is on branch "${state.branch}". Run: git -C "${repo}" checkout master`);
  if (!dryRun) steps.checkToolchain(); // fail before asking, not after a yes

  const copies = discover();
  for (const line of formatPlan({ copies, target: app.target, repo, source: state, show })) io.say(line);
  if (dryRun) {
    io.say('', 'Dry run: nothing changed.');
    return 0;
  }
  const answer = yes ? 'yes' : (await io.ask('Type yes to continue (anything else stops; nothing changes): ')).trim();
  if (answer.toLowerCase() !== 'yes') {
    io.say('Stopped. Nothing changed.');
    return 2;
  }

  if (state.fastForward) source.fastForward();
  const built = source.head();
  io.say('', `Building from ${built.slice(0, 7)} (takes a few minutes)…`);
  steps.ensureDeps();
  const bundle = steps.build(app.productName);
  io.say('Clearing old copies…');
  /* the build may have rewritten an old build-output copy in place: that path is now the new app */
  const outcomes = copies.filter((c) => c.path !== bundle).map((c) => clear(c, actions));
  io.say('Installing and refreshing Spotlight…');
  steps.install(bundle, app.target);
  steps.register(app.target);
  steps.writeMarker(built, app.target);

  const leftovers = discover().filter((c) => c.path !== app.target);
  const { lines, ok } = formatSummary({ outcomes, target: app.target, built, master: source.state().latest, leftovers, show });
  for (const line of lines) io.say(line);
  return ok ? 0 : 1;
}
