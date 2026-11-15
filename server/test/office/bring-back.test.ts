/* Bring someone back as a solo specialist (spec-ux-team-rebuild §1): the lineup lists who left, POST
   /projects/:id/specialists adds them at once, a rebuild's "specialist" move can bring a leaver in (and Undo takes
   them off again), and work assigned to them reaches them — not a captain.
   Seed: Aurora = Ship-It (Semic captain, Pete, Scar) + Polish (Lint captain, Doc, Twinkle); specialists Baron,
   Query, Merge. */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { workRepo } from '../../src/db/work.ts';
import { castAvailable } from '../../src/office/staffing.ts';
import { scriptedCrew } from '../crew/brain.ts';
import { testApp } from '../helpers.ts';

let h: ReturnType<typeof testApp>;
afterEach(() => h.close());

const until = async (fn: () => Promise<boolean>) => {
  for (let i = 0; i < 300 && !(await fn()); i++) await new Promise((ok) => setTimeout(ok, 10));
};
type Who = { id: string };
const lineup = async () =>
  (await h.call('GET', '/projects/aurora/lineup')).body as { specialists: Who[]; left: Who[]; teams: unknown[] };
const ids = (xs: Who[]) => xs.map((x) => x.id);

/** Take people off Aurora through the rebuild routes (confirm card → apply). */
const removeFromAurora = async (remove: string[]) => {
  const plan = await h.call('POST', '/projects/aurora/rebuild/plan', { remove });
  const done = await h.call('POST', `/rebuild/${plan.body.planId}/apply`, {});
  expect(done.status).toBe(200);
};

describe('bring someone back as a specialist', () => {
  it('remove, then bring back: specialist again, off the left list, joins the room, and gets their work', async () => {
    const crew = scriptedCrew({ dispatch: [{ summary: 's', items: [{ text: 'Seed the data', assignee: 'a-baron', brief: 'b' }] }] });
    h = testApp({ seed: true, runner: crew.runner });
    mkdirSync(join(h.config.sandbox, 'aurora'));
    h.store.projects.update('aurora', { folder: 'aurora' });

    await removeFromAurora(['a-pete']);
    await removeFromAurora(['a-baron']);
    let l = await lineup();
    expect(ids(l.left)).toEqual(['a-baron', 'a-pete']); // newest first
    expect(castAvailable(h.store, 'aurora').agents.find((a) => a.name === 'Baron von Backup')).toMatchObject({ wasHere: true });

    const seen = h.events.after('project', 'aurora').at(-1)?.id ?? 0;
    const r = await h.call('POST', '/projects/aurora/specialists', { agentId: 'a-baron' });
    expect(r.body).toEqual({ ok: true, name: 'Baron von Backup' });
    l = await lineup();
    expect(ids(l.specialists)).toContain('a-baron');
    expect(ids(l.left)).toEqual(['a-pete']);
    const evs = h.events.after('project', 'aurora', seen);
    expect(evs.find((e) => e.type === 'room.joined')?.payload).toMatchObject({ agentId: 'a-baron' });
    expect(evs.some((e) => e.type === 'staff.changed')).toBe(true);

    const g = await h.call('POST', '/projects/aurora/work', { goal: 'Seed it' });
    await until(async () => (await h.call('GET', `/projects/aurora/work/${g.body.id}`)).body.status === 'done');
    const [item] = workRepo(h.store.db).projectItems('aurora', 'done');
    expect(item).toMatchObject({ agentId: 'a-baron', teamId: null });
    const run = h.store.db.prepare('SELECT agent_id FROM runs WHERE id = ?').get(item?.runId ?? '') as { agent_id: string };
    expect(run.agent_id).toBe('a-baron');
  });

  it('refuses someone not in the Cast, or already on the project (on a team: use Rearrange)', async () => {
    h = testApp({ seed: true });
    const before = JSON.stringify(h.store.projects.require('aurora'));
    const ask = async (agentId: string) => (await h.call('POST', '/projects/aurora/specialists', { agentId })).body;
    expect(await ask('a-nobody')).toEqual({ ok: false, error: expect.stringContaining('not in the Cast') });
    expect(await ask('a-baron')).toEqual({ ok: false, error: expect.stringContaining('already on this project') });
    expect((await ask('a-pete')).error).toMatch(/already on this project.*Rearrange/);
    expect(JSON.stringify(h.store.projects.require('aurora'))).toBe(before);
  });

  it('a rebuild "specialist" move brings a leaver back at once; Undo takes them off again', async () => {
    h = testApp({ seed: true });
    await removeFromAurora(['a-baron']);
    const plan = await h.call('POST', '/projects/aurora/rebuild/plan', { move: [{ agent: 'Baron', to: 'specialist' }] });
    expect(plan.status).toBe(200);
    expect(plan.body.needsConfirm).toBe(false);
    expect(plan.body.card.specialists).toEqual([{ id: 'a-baron', name: 'Baron von Backup' }]);
    const done = await h.call('POST', `/rebuild/${plan.body.planId}/apply`, {});
    expect(done.body.summary).toBe('Done — Baron von Backup works solo.');
    expect(h.store.projects.require('aurora').agentIds).toContain('a-baron');
    const joined = h.events.after('project', 'aurora').filter((e) => e.type === 'room.joined');
    expect(joined.at(-1)?.payload).toMatchObject({ agentId: 'a-baron' });

    await h.call('POST', `/rebuild/undo/${done.body.undoToken}`);
    expect(h.store.projects.require('aurora').agentIds).not.toContain('a-baron');
    expect(ids((await lineup()).left)).toEqual(['a-baron']);
  });
});
