/* STUDIO LIFE: the user brings a Cast agent in with a brief — they join the room, start at once, sit in the office,
   can be chatted with; the director plans with them only when allowed. */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { fakeBrain } from '../../src/crew/fake-brain.ts';
import { fakeRunner } from '../../src/runtime/fake.ts';
import type { RunSpec } from '../../src/runtime/runner.ts';
import { testApp } from '../helpers.ts';

const BRIEF = 'Analyze the team’s communication and report to HQ.';

describe('bring someone in', () => {
  let h: ReturnType<typeof testApp>;
  afterEach(() => h.close());

  it('joins the room, starts on the brief, sits in the office; the director may use them only when allowed', async () => {
    const calls: RunSpec[] = [];
    h = testApp({ seed: true, runner: fakeRunner((spec) => (calls.push(spec), fakeBrain(spec))) });
    const plans = {
      at: (i: number) => calls.filter((c) => c.task.startsWith('AI Studio contract: dispatch'))[i],
    };
    mkdirSync(join(h.config.sandbox, 'aurora'));
    h.store.projects.update('aurora', { folder: 'aurora' });

    const r = await h.call('POST', '/projects/aurora/guests', { agentId: 'a-prof', brief: BRIEF });
    expect(r.status).toBe(201);
    expect(r.body.guest).toMatchObject({ agentId: 'a-prof', brief: BRIEF, orchestratorMay: false });
    await h.runtime.settled(r.body.runId);
    const run = calls.find((c) => !c.task.startsWith('AI Studio contract'));
    expect(run?.task).toContain(BRIEF);
    expect(run?.task).toMatch(/^The user brought you into "Aurora Storefront" as a guest/);

    const evs = h.events.after('project', 'aurora');
    expect(evs.filter((e) => e.type === 'room.joined').map((e) => e.payload)).toEqual([
      { agentId: 'a-prof', why: BRIEF },
    ]);
    expect(evs.filter((e) => e.type === 'guest.changed').map((e) => e.payload)).toEqual([
      { agentId: 'a-prof', change: 'joined' },
    ]);
    const office = (await h.call('GET', '/projects/aurora/office')).body;
    expect(office.solo).toContain('a-prof');
    expect(office.guests).toEqual([{ agentId: 'a-prof', brief: BRIEF, orchestratorMay: false }]);
    expect((await h.call('GET', '/projects/aurora/comms')).body.comms.at(-1)).toMatchObject({
      kind: 'brief',
      to: 'a-prof',
      text: BRIEF,
    });

    // locked: the director doesn't see them when planning
    await h.call('POST', '/projects/aurora/work', { goal: 'Tidy the cart' });
    expect(plans.at(0)?.task).not.toContain('Professor Prompt');
    // unlocked: now they're one of the specialists
    expect(
      (await h.call('PATCH', '/projects/aurora/guests/a-prof', { orchestratorMay: true })).body
        .orchestratorMay,
    ).toBe(true);
    await h.call('POST', '/projects/aurora/work', { goal: 'Tidy the cart again' });
    expect(plans.at(1)?.task).toContain('Professor Prompt');

    // staff can't be brought in; crew can't either; sending home
    expect((await h.call('POST', '/projects/aurora/guests', { agentId: 'a-pete', brief: 'x' })).status).toBe(
      409,
    );
    expect(
      (await h.call('POST', '/projects/aurora/guests', { agentId: 'a-creator', brief: 'x' })).status,
    ).toBe(422);
    expect((await h.call('DELETE', '/projects/aurora/guests/a-prof')).status).toBe(204);
    expect((await h.call('GET', '/projects/aurora/office')).body.guests).toEqual([]);
  });
});
