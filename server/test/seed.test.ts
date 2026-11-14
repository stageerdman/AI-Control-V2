import { afterEach, describe, expect, it } from 'vitest';
import { SEED_COUNTS, seedIfNeeded } from '../src/seed.ts';
import { testApp } from './helpers.ts';

describe('seed', () => {
  let h: ReturnType<typeof testApp>;
  afterEach(() => h.close());

  it('loads the prototype cast: 10 agents + setter, 2 orchestrators, creator; 10 roles; 4 teams; 9 projects', () => {
    h = testApp({ seed: true });
    const { agents, roles, teams, projects } = h.store;
    expect(SEED_COUNTS).toEqual({ roles: 10, agents: 14, teams: 4, projects: 9 });
    const cast = agents.list();
    expect(cast).toHaveLength(14);
    expect(roles.list()).toHaveLength(10);
    expect(teams.list()).toHaveLength(4);
    expect(projects.list()).toHaveLength(9);
    // crew first, in kind order
    expect(cast.slice(0, 4).map((a) => [a.id, a.kind])).toEqual([
      ['a-setter', 'setter'],
      ['a-pixel', 'orchestrator'],
      ['a-maestro', 'orchestrator'],
      ['a-creator', 'creator'],
    ]);
    expect(cast.filter((a) => a.kind === 'agent')).toHaveLength(10);
  });

  it('keeps every rule true in the seeded data', () => {
    h = testApp({ seed: true });
    const cast = h.store.agents.list();
    const kindOf = new Map(cast.map((a) => [a.id, a.kind]));
    for (const t of h.store.teams.list()) {
      expect(t.members.length).toBeGreaterThan(0);
      expect(t.members.length).toBeLessThanOrEqual(7);
      expect(t.members.map((m) => m.agentId)).toContain(t.captainId);
      for (const m of t.members) expect(kindOf.get(m.agentId)).toBe('agent');
    }
    for (const p of h.store.projects.list()) expect(kindOf.get(p.orchestratorId)).toBe('orchestrator');
  });

  it('carries the prototype details: roles, looks, captains, Aurora staffing', () => {
    h = testApp({ seed: true });
    const pete = h.store.agents.require('a-pete');
    expect(pete).toMatchObject({
      role: 'Frontend',
      nick: 'Pete',
      look: { hat: 'headphones', tool: 'stylus', hue: 'teal', body: 'sprout' },
    });
    expect(h.store.agents.require('a-setter')).toMatchObject({
      name: 'Rivet',
      role: 'Project Setter',
      roleId: null,
    });
    expect(h.store.teams.require('ship-it')).toMatchObject({ captainId: 'a-semic', projectIds: ['aurora'] });
    expect(h.store.projects.require('aurora')).toMatchObject({
      orchestratorId: 'a-pixel',
      status: 'live',
      progress: 64,
      teamIds: ['ship-it', 'polish'],
      agentIds: ['a-baron', 'a-query', 'a-merge'],
      github: { connected: false, private: true, published: false, url: null, visibility: null },
    });
    expect(h.store.projects.require('atlas').orchestratorId).toBe('a-maestro');
  });

  it('is idempotent and never re-seeds what the user deleted', () => {
    h = testApp({ seed: true });
    expect(seedIfNeeded(h.store)).toBe(false);
    h.store.trash.trashAgent('a-pete');
    expect(seedIfNeeded(h.store)).toBe(false);
    expect(h.store.agents.get('a-pete')).toBeNull();
    expect(h.store.agents.list()).toHaveLength(13);
  });
});
