/* Deleted agents are hidden, kept 30 days, listed, and come back unchanged.
   Seed: Aurora = Ship-It (Semic captain, Pete, Scar) + Polish. */
import { afterEach, describe, expect, it } from 'vitest';
import { appendChatMessage, listAgentChats } from '../../src/db/chats.ts';
import { runsRepo } from '../../src/db/runs.ts';
import { TRASH_TTL_MS } from '../../src/db/trash.ts';
import { exists } from '../../src/db/util.ts';
import { addMember, TEAM_MAX } from '../../src/domain/teams.ts';
import { testApp } from '../helpers.ts';

let h: ReturnType<typeof testApp>;
afterEach(() => h.close());

const DAY = 24 * 3600 * 1000;
const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

function pastChat(agentId: string, id: string) {
  const runs = runsRepo(h.store.db);
  runs.insert({
    id,
    projectId: 'aurora',
    agentId,
    teamId: 'ship-it',
    task: 'Do it',
    runner: 'fake',
    model: null,
    caps: { maxTurns: 5, maxBudgetUsd: 1 },
  });
  appendChatMessage(h.store.db, { runId: id, projectId: 'aurora', agentId, role: 'assistant', text: 'Done' });
  runs.finish(id, { status: 'succeeded', sessionId: `s-${id}`, usage, turns: 1 });
}
const seatOf = (agentId: string) => {
  const team = h.store.teams.get('ship-it');
  return {
    index: team?.members.findIndex((m) => m.agentId === agentId),
    captain: team?.captainId === agentId,
  };
};
const ids = (items: { id: string }[]) => items.map((a) => a.id);
const backdate = (token: string, days: number) =>
  h.db
    .prepare('UPDATE trash SET created_at = ? WHERE token = ?')
    .run(new Date(Date.now() - days * DAY).toISOString(), token);

describe('deleted agents: hidden, listed, restored unchanged', () => {
  it('a captain with chats leaves the Cast, shows in the trash, and comes back as it was', async () => {
    h = testApp({ seed: true });
    pastChat('a-semic', 'run-1');
    pastChat('a-semic', 'run-2');
    const before = {
      record: h.store.agents.record('a-semic'),
      seat: seatOf('a-semic'),
      chats: listAgentChats(h.db, { projectId: 'aurora', agentId: 'a-semic' }),
    };
    expect(before.seat).toEqual({ index: 0, captain: true });

    const del = await h.call('DELETE', '/agents/a-semic');
    expect(del.status).toBe(200);
    expect(ids((await h.call('GET', '/agents')).body)).not.toContain('a-semic');
    expect((await h.call('GET', '/agents/a-semic')).status).toBe(404);
    expect(seatOf('a-semic').index).toBe(-1);

    const { items } = (await h.call('GET', '/trash/agents')).body;
    expect(items).toHaveLength(1);
    const item = items[0];
    expect(item).toMatchObject({
      token: del.body.restoreToken,
      id: 'a-semic',
      name: 'Captain Semicolon',
      look: JSON.parse(before.record?.look ?? '{}'),
      chats: 2,
    });
    expect(Date.parse(item.expiresAt) - Date.parse(item.deletedAt)).toBe(30 * DAY);

    const res = await h.call('POST', `/trash/${del.body.restoreToken}/restore`);
    expect(res.body).toEqual({ restored: { kind: 'agent', id: 'a-semic' } });
    expect(h.store.agents.record('a-semic')).toEqual(before.record);
    expect(seatOf('a-semic')).toEqual(before.seat);
    expect(listAgentChats(h.db, { projectId: 'aurora', agentId: 'a-semic' })).toEqual(before.chats);
    expect((await h.call('GET', '/trash/agents')).body.items).toEqual([]);
  });

  it('lists newest first', async () => {
    h = testApp({ seed: true });
    const a = await h.call('DELETE', '/agents/a-pete');
    await h.call('DELETE', '/agents/a-scar');
    backdate(a.body.restoreToken, 1);
    expect(ids((await h.call('GET', '/trash/agents')).body.items)).toEqual(['a-scar', 'a-pete']);
  });

  it('restores a snapshot filed before soft delete (row hard-deleted)', async () => {
    h = testApp({ seed: true });
    const before = h.store.agents.record('a-pete');
    const del = await h.call('DELETE', '/agents/a-pete');
    h.store.agents.deleteRecord('a-pete'); // what a delete used to do
    expect((await h.call('POST', `/trash/${del.body.restoreToken}/restore`)).status).toBe(200);
    expect(h.store.agents.record('a-pete')).toEqual(before);
  });

  it('purges an agent 31 days in the trash, keeps one 29 days in', async () => {
    h = testApp({ seed: true });
    expect(TRASH_TTL_MS).toBe(30 * DAY);
    const old = await h.call('DELETE', '/agents/a-pete');
    const recent = await h.call('DELETE', '/agents/a-scar');
    backdate(old.body.restoreToken, 31);
    backdate(recent.body.restoreToken, 29);

    await h.call('DELETE', '/agents/a-doc'); // filing runs the purge

    expect(exists(h.db, 'agents', 'a-pete')).toBe(false);
    expect((await h.call('POST', `/trash/${old.body.restoreToken}/restore`)).status).toBe(404);
    expect(ids((await h.call('GET', '/trash/agents')).body.items)).toEqual(['a-doc', 'a-scar']);
    expect((await h.call('POST', `/trash/${recent.body.restoreToken}/restore`)).status).toBe(200);
    expect(h.store.agents.record('a-scar')).toBeDefined();
  });

  it('listing purges expired agents too, so 30 days means 30 days even with no new deletes', async () => {
    h = testApp({ seed: true });
    const old = await h.call('DELETE', '/agents/a-pete');
    backdate(old.body.restoreToken, 31);
    expect((await h.call('GET', '/trash/agents')).body.items).toEqual([]);
    expect(exists(h.db, 'agents', 'a-pete')).toBe(false);
  });

  it('a seat that filled up meanwhile is named in the restore reply', async () => {
    h = testApp({ seed: true });
    const del = await h.call('DELETE', '/agents/a-pete');
    let roster = h.store.teams.roster('ship-it');
    for (const a of h.store.agents.records()) {
      if (roster.members.length >= TEAM_MAX) break;
      if (a.kind !== 'agent' || roster.members.some((m) => m.agentId === a.id)) continue;
      roster = addMember(roster, { id: a.id, kind: a.kind }, '', roster.members.length);
    }
    expect(roster.members).toHaveLength(TEAM_MAX);
    h.store.teams.saveRoster('ship-it', roster);
    const res = await h.call('POST', `/trash/${del.body.restoreToken}/restore`);
    expect(res.body.seatsLost).toEqual([h.store.teams.get('ship-it')?.name]);
  });
});
