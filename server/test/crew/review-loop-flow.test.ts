/* A review loop that can't pass, end to end: a reviewer who sends the same note back twice stops the loop — the
   item goes to the orchestrator with both notes instead of a third round. Different notes keep going as normal. */
import { afterEach, describe, expect, it } from 'vitest';
import { type ChecklistItem, workRepo } from '../../src/db/work.ts';
import type { RunSpec } from '../../src/runtime/runner.ts';
import type { testApp } from '../helpers.ts';
import { alerts, CHECKED, COLUMBO, commit, type Ev, isReview, LINT, studio, until } from './aurora-studio.ts';

const SQLITE = 'The Pensieve needs sqlite, but it is not installed and npm install is refused.';
const changes = (notes: string) => [{ result: JSON.stringify({ verdict: 'changes', notes }) }];
const APPROVE = [{ result: '{"verdict":"approve","notes":"Good."}' }];

/** Aurora where Lint may send back up to twice, answering its reviews in turn from `verdicts`. */
function loop(verdicts: (typeof APPROVE)[]) {
  const specs: RunSpec[] = [];
  const s = studio((_app, spec) => {
    specs.push(spec);
    if (isReview(spec)) return verdicts.shift() ?? APPROVE;
    return commit(spec, `pensieve-${specs.length}.txt`);
  });
  s.h.store.projects.update('aurora', { workflows: [{ ...CHECKED, maxSendBacks: 2 }] });
  return { ...s, specs };
}

describe('review loops: the same note twice goes to the orchestrator', () => {
  let h: ReturnType<typeof testApp>;
  afterEach(() => h.close());

  it('two rounds with the same note: the item is back with Pixel, with both notes, and no third round', async () => {
    const s = loop([changes(SQLITE), changes(`${SQLITE.toLowerCase()}!`)]);
    h = s.h;
    const r = await h.call('POST', '/projects/aurora/work', { goal: 'Build the Pensieve' });
    const work = workRepo(h.db);
    const id = r.body.items[0].id as string;
    await until(
      () => work.item(id) as ChecklistItem,
      (i) => i.agentId === 'a-pixel' && i.status === 'todo',
    );
    await until(
      () => h.runtime.liveCount(),
      (n) => n === 0,
    );

    expect(work.item(id)).toMatchObject({ agentId: 'a-pixel', status: 'todo', stage: 'build', sendBacks: 0 });
    expect(s.specs.filter(isReview)).toHaveLength(2);
    expect(s.specs.filter((x) => !isReview(x))).toHaveLength(2); // build + one rework, no third
    const handoffs = (h.events.after('project', 'aurora') as Ev[]).filter((e) => e.type === 'handoff');
    expect(handoffs.map((e) => `${e.payload.kind}:${e.payload.from}→${e.payload.to}`)).toEqual([
      `review:${COLUMBO}→${LINT}`,
      `rework:${LINT}→${COLUMBO}`,
      `review:${COLUMBO}→${LINT}`,
      `handover:${COLUMBO}→a-pixel`,
    ]);
    const note = String(handoffs.at(-1)?.payload.note);
    expect(note).toContain('sent Captain Semicolon');
    expect(note).toContain(`First: ${SQLITE}`);
    expect(note).toContain(`Second: ${SQLITE.toLowerCase()}!`);
    expect(await s.director('whiteboard', {})).toMatch(
      /\[waiting for a new owner\] Build the Pensieve — Pixel/,
    );
  }, 20_000);

  /* Sea GPS: "HEAD is 1bb2479 with no new commits", sent back five times with different notes, then failed */
  it('reworks that add no commit: after two empty tries the item is back with Pixel, who hears why', async () => {
    let builds = 0;
    const s = studio((_app, spec) => {
      if (isReview(spec)) return changes(`Still nothing new, round ${builds}.`);
      builds++;
      /* the reworks run the tests (real work) but commit nothing */
      return builds === 1
        ? commit(spec, 'pensieve.txt')
        : [
            { activity: { kind: 'running', label: 'npm test' }, tool: 'Bash' },
            { result: 'Tests pass for me.' },
          ];
    });
    s.h.store.projects.update('aurora', { workflows: [{ ...CHECKED, maxSendBacks: 3 }] });
    h = s.h;
    const r = await h.call('POST', '/projects/aurora/work', { goal: 'Build the Pensieve' });
    const work = workRepo(h.db);
    const id = r.body.items[0].id as string;
    const back = await until(
      () => work.item(id) as ChecklistItem,
      (i) => i.agentId === 'a-pixel' || i.status === 'failed',
    );
    expect(back, back.note ?? '').toMatchObject({ agentId: 'a-pixel', status: 'todo' });
    expect(back.reviews).toHaveLength(3); // build → changes, two empty reworks → changes, then it stops
    expect(back.note).toContain('the last 2 reworks added no new commits');
    expect(alerts(h)).toContainEqual(expect.objectContaining({ kind: 'stuck', itemId: id }));
  }, 20_000);

  it('different notes keep going: a third round, then approved and done with the builder', async () => {
    const s = loop([changes('Add a test for empty memories.'), changes('Name the store module by its job.')]);
    h = s.h;
    const r = await h.call('POST', '/projects/aurora/work', { goal: 'Build the Pensieve' });
    const done = await until(
      () => workRepo(h.db).item(r.body.items[0].id) as ChecklistItem,
      (i) => i.status === 'done' || i.status === 'failed',
    );
    expect(done).toMatchObject({ status: 'done', agentId: COLUMBO, sendBacks: 2 });
    expect(s.specs.filter(isReview)).toHaveLength(3);
  }, 20_000);
});
