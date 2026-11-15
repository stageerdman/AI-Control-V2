import { afterEach, describe, expect, it } from 'vitest';
import { ARCHETYPES } from '../../src/cast-packs/archetypes.ts';
import { installPackIfNeeded } from '../../src/cast-packs/pack.ts';
import { ToolsetSchema } from '../../src/domain/toolset.ts';
import { testApp } from '../helpers.ts';

const IDS = ARCHETYPES.agents.map((a) => a.id);
const ROLE_IDS = [
  'Visionary',
  'Moonshot',
  'Navigator',
  'Warden',
  'Rogue',
  'Fable',
  'Showman',
  'Archivist',
  'Alchemist',
];

describe('archetype cast pack', () => {
  let h: ReturnType<typeof testApp>;
  afterEach(() => h.close());

  it('adds nine agents with their looks, roles and toolsets to a seeded studio', async () => {
    h = testApp({ seed: true });
    expect(installPackIfNeeded(h.store, ARCHETYPES)).toBe(true);
    const { body } = await h.call('GET', '/agents');
    const pack = (body as { id: string }[]).filter((a) => IDS.includes(a.id)) as {
      id: string;
      roleId: string;
      look: unknown;
      tools: unknown;
    }[];
    expect(pack).toHaveLength(9);
    expect(pack.map((a) => a.roleId).sort()).toEqual([...ROLE_IDS].sort());
    for (const a of pack) {
      const def = ARCHETYPES.agents.find((d) => d.id === a.id);
      expect(a.look).toEqual(def?.look);
      expect(ToolsetSchema.parse(a.tools)).toEqual(def?.tools);
    }
    expect(h.store.roles.require('Warden').reporter).toBe(true);
    expect(h.store.roles.require('Alchemist').toolsmith).toBe(true);
  });

  it('installs once: no duplicates, and a deleted agent stays deleted', () => {
    h = testApp({ seed: true });
    installPackIfNeeded(h.store, ARCHETYPES);
    const count = h.store.agents.list().length;
    h.store.trash.trashAgent('a-sola');
    expect(installPackIfNeeded(h.store, ARCHETYPES)).toBe(false);
    expect(h.store.agents.get('a-sola')).toBeNull();
    expect(h.store.agents.list()).toHaveLength(count - 1);
  });

  it('works on an empty studio and reuses a role the user already named the same', () => {
    h = testApp();
    const mine = h.store.roles.create('Archivist', 'my-archivist');
    installPackIfNeeded(h.store, ARCHETYPES);
    expect(h.store.agents.require('a-quillon').roleId).toBe(mine.id);
    expect(h.store.roles.get('Archivist')).toBeNull();
    expect(h.store.agents.list()).toHaveLength(9);
  });

  it('lets an archetype join a team', async () => {
    h = testApp({ seed: true });
    installPackIfNeeded(h.store, ARCHETYPES);
    const team = h.store.teams.list().find((t) => t.members.length < 7);
    const res = await h.call('POST', `/teams/${team?.id}/members`, { agentId: 'a-brisk' });
    expect(res.status).toBe(201);
    expect(h.store.teams.require(team?.id as string).members.map((m) => m.agentId)).toContain('a-brisk');
  });
});
