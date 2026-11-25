/* Restoring deleted Cast agents: from the trash snapshot, from a cast pack, twice (safe), chats reconnecting,
   blocked work carrying on, and an agent nothing is left of.
   Seed: Aurora = Ship-It (Semic captain, Pete, Scar) + Polish; specialists Baron, Query, Merge. */
import { afterEach, describe, expect, it } from 'vitest';
import { ARCHETYPES } from '../../src/cast-packs/archetypes.ts';
import { installPackIfNeeded } from '../../src/cast-packs/pack.ts';
import { appendChatMessage, listAgentChats } from '../../src/db/chats.ts';
import { runsRepo } from '../../src/db/runs.ts';
import { workRepo } from '../../src/db/work.ts';
import { findMissingAgents, restoreAgent } from '../../src/office/restore-missing.ts';
import { testApp } from '../helpers.ts';

let h: ReturnType<typeof testApp>;
afterEach(() => h.close());

const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
/** A finished run (= a chat) of the agent on Aurora, with one message and a resumable session. */
function pastRun(agentId: string, id = `run-${agentId}`) {
  const runs = runsRepo(h.store.db);
  runs.insert({
    id,
    projectId: 'aurora',
    agentId,
    teamId: null,
    task: 'Do it',
    runner: 'fake',
    model: null,
    caps: { maxTurns: 5, maxBudgetUsd: 1 },
  });
  appendChatMessage(h.store.db, {
    runId: id,
    projectId: 'aurora',
    agentId,
    role: 'assistant',
    text: 'Done half',
  });
  runs.finish(id, { status: 'failed', error: 'Agent gone', sessionId: `s-${id}`, usage, turns: 1 });
  return id;
}
/** A failed goal whose one item (for the agent) failed in that run. */
function failedItem(agentId: string, runId: string) {
  const work = workRepo(h.store.db);
  const g = work.insertGoal({ id: `g-${agentId}`, projectId: 'aurora', text: 'Goal', summary: '' }, [
    { id: `i-${agentId}`, text: 'Item', brief: 'b', agentId, teamId: null },
  ]);
  work.setItem(`i-${agentId}`, { status: 'failed', runId, note: 'Agent gone' });
  work.setGoalStatus(g.id, 'failed');
  return `i-${agentId}`;
}
/** As if the agent was hard-deleted with no snapshot left: the trash rows and the hidden agent row go. */
const deleteTrashRows = (id: string) => {
  h.store.db.prepare('DELETE FROM trash WHERE item_id = ?').run(id);
  h.store.agents.deleteRecord(id);
};

describe('restore missing agents', () => {
  it('restores from the trash snapshot: same id, setup, tools and team seat', () => {
    h = testApp({ seed: true });
    const before = h.store.agents.record('a-pete');
    h.store.trash.trashAgent('a-pete');
    expect(findMissingAgents(h.store)).toEqual([
      { id: 'a-pete', name: 'Pixel Pete', source: 'trash', chatsFound: false, blockedRuns: [] },
    ]);

    const r = restoreAgent(h.store, 'a-pete');
    expect(r).toEqual({
      id: 'a-pete',
      name: 'Pixel Pete',
      restored: true,
      setupFrom: 'trash',
      toolsRestored: true,
      chatsRelinked: 0,
      runsResumed: [],
      lost: [],
    });
    expect(h.store.agents.record('a-pete')).toEqual(before);
    expect(h.store.agents.require('a-pete').teamIds.length).toBeGreaterThan(0);
    expect(findMissingAgents(h.store)).toEqual([]);
  });

  it('rebuilds from the cast-pack archetype when there is no snapshot', () => {
    h = testApp({ seed: true });
    installPackIfNeeded(h.store, ARCHETYPES);
    const pack = ARCHETYPES.agents.find((a) => a.id === 'a-sola');
    h.store.trash.trashAgent('a-sola');
    deleteTrashRows('a-sola');
    expect(findMissingAgents(h.store).find((m) => m.id === 'a-sola')?.source).toBe('pack');

    const r = restoreAgent(h.store, 'a-sola');
    expect(r).toMatchObject({ restored: true, setupFrom: 'pack', toolsRestored: true, name: pack?.name });
    expect(r.lost).toEqual([expect.stringContaining('no trash snapshot')]);
    expect(h.store.agents.require('a-sola')).toMatchObject({
      tools: pack?.tools,
      prompt: pack?.prompt,
      roleId: pack?.roleId,
    });
  });

  it('rebuilds from the pack when the snapshot expired but the hidden row was never purged', () => {
    h = testApp({ seed: true });
    installPackIfNeeded(h.store, ARCHETYPES);
    h.store.trash.trashAgent('a-sola');
    h.store.db
      .prepare("UPDATE trash SET created_at = ? WHERE item_id = 'a-sola'")
      .run(new Date(Date.now() - 31 * 24 * 3600 * 1000).toISOString());

    expect(() => restoreAgent(h.store, 'a-sola')).not.toThrow();
    expect(h.store.agents.record('a-sola')).toBeDefined();
  });

  it('rebuilds from the pack when a hidden row has no trash row at all', () => {
    h = testApp({ seed: true });
    installPackIfNeeded(h.store, ARCHETYPES);
    h.store.trash.trashAgent('a-sola');
    h.store.db.prepare("DELETE FROM trash WHERE item_id = 'a-sola'").run();

    expect(restoreAgent(h.store, 'a-sola')).toMatchObject({ restored: true, setupFrom: 'pack' });
  });

  it('a new cast pack skips an id the user has in Recently deleted', () => {
    h = testApp({ seed: true });
    h.store.trash.trashAgent('a-pete');
    const pack = { key: 'probe', roles: [], agents: [{ ...ARCHETYPES.agents[0], id: 'a-pete' }] } as never;
    expect(() => installPackIfNeeded(h.store, pack)).not.toThrow();
    expect(h.store.agents.record('a-pete')).toBeUndefined();
  });

  it('is safe to run twice: an agent in the Cast is never overwritten', () => {
    h = testApp({ seed: true });
    h.store.trash.trashAgent('a-pete');
    restoreAgent(h.store, 'a-pete');
    h.store.agents.update('a-pete', { prompt: 'edited after the restore' });
    const count = h.store.agents.records().length;

    const again = restoreAgent(h.store, 'a-pete');
    expect(again).toMatchObject({ restored: false, setupFrom: 'none', runsResumed: [], lost: [] });
    expect(h.store.agents.records()).toHaveLength(count);
    expect(h.store.agents.require('a-pete').prompt).toBe('edited after the restore');
  });

  it('reconnects the agent’s chats under its original id', () => {
    h = testApp({ seed: true });
    const runId = pastRun('a-pete');
    h.store.trash.trashAgent('a-pete');
    expect(findMissingAgents(h.store)[0]?.chatsFound).toBe(true);

    expect(restoreAgent(h.store, 'a-pete').chatsRelinked).toBe(1);
    expect(
      listAgentChats(h.store.db, { projectId: 'aurora', agentId: 'a-pete' }).map((c) => c.runId),
    ).toEqual([runId]);
  });

  it('a blocked item carries on: the agent is back on the project and the item queues again in its session', () => {
    h = testApp({ seed: true });
    installPackIfNeeded(h.store, ARCHETYPES);
    const runId = pastRun('a-sola');
    const itemId = failedItem('a-sola', runId);
    h.store.trash.trashAgent('a-sola');
    deleteTrashRows('a-sola'); // pack path: the agent was never on Aurora, bringBack must add it
    expect(findMissingAgents(h.store).find((m) => m.id === 'a-sola')?.blockedRuns).toEqual([itemId]);

    const woken: string[] = [];
    const r = restoreAgent(h.store, 'a-sola', { wake: (p) => woken.push(p) });
    expect(r.runsResumed).toEqual([itemId]);
    expect(woken).toEqual(['aurora']);
    expect(h.store.projects.require('aurora').agentIds).toContain('a-sola');
    const work = workRepo(h.store.db);
    expect(work.item(itemId)).toMatchObject({
      status: 'todo',
      runId: null,
      resumeRunId: runId,
      agentId: 'a-sola',
    });
    expect(work.goal('g-a-sola')?.status).toBe('running');
  });

  it('an agent nothing is left of: not restored, and the reason is in lost', () => {
    h = testApp({ seed: true });
    const runId = pastRun('a-ghost');
    const itemId = failedItem('a-ghost', runId);
    expect(findMissingAgents(h.store)).toEqual([
      { id: 'a-ghost', name: 'a-ghost', source: 'none', chatsFound: true, blockedRuns: [itemId] },
    ]);

    const r = restoreAgent(h.store, 'a-ghost');
    expect(r).toMatchObject({
      restored: false,
      setupFrom: 'none',
      toolsRestored: false,
      chatsRelinked: 1,
      runsResumed: [],
    });
    expect(r.lost[0]).toMatch(/no trash snapshot and no cast-pack archetype/);
    expect(r.lost[1]).toContain(itemId);
    expect(h.store.agents.record('a-ghost')).toBeUndefined();
  });
});
