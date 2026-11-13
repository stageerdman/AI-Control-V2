import { describe, expect, it } from 'vitest';
import type { AgentKind } from '../../src/domain/cast.ts';
import {
  addMember,
  buildRoster,
  type Roster,
  removeMember,
  setCaptain,
  TEAM_MAX,
} from '../../src/domain/teams.ts';

const ag = (id: string, kind: AgentKind = 'agent') => ({ id, kind });
const empty: Roster = { captainId: null, members: [] };

describe('team rules', () => {
  it('first member becomes captain; later members don’t change it', () => {
    let t = addMember(empty, ag('a'));
    expect(t.captainId).toBe('a');
    t = addMember(t, ag('b'), 'do b');
    expect(t).toEqual({
      captainId: 'a',
      members: [
        { agentId: 'a', instr: '' },
        { agentId: 'b', instr: 'do b' },
      ],
    });
  });

  it('is pure — never mutates the input', () => {
    const t = addMember(empty, ag('a'));
    addMember(t, ag('b'));
    expect(t.members).toHaveLength(1);
  });

  it('refuses duplicates, system agents and an 8th member', () => {
    const t = addMember(empty, ag('a'));
    expect(() => addMember(t, ag('a'))).toThrow(/already on this team/);
    for (const k of ['setter', 'orchestrator', 'creator'] as const)
      expect(() => addMember(t, ag('s', k))).toThrow(/system agent/);
    let full = empty;
    for (let i = 0; i < TEAM_MAX; i++) full = addMember(full, ag(`m${i}`));
    expect(full.members).toHaveLength(7);
    expect(() => addMember(full, ag('extra'))).toThrow(/at most 7/);
  });

  it('inserts at a given index (used by restore)', () => {
    const t = buildRoster([{ agent: ag('a') }, { agent: ag('c') }]);
    expect(addMember(t, ag('b'), '', 1).members.map((m) => m.agentId)).toEqual(['a', 'b', 'c']);
  });

  it('removing the captain promotes the next member; removing the last empties the captain', () => {
    const t = buildRoster([{ agent: ag('a') }, { agent: ag('b') }, { agent: ag('c') }], 'b');
    const r = removeMember(t, 'b');
    expect(r).toMatchObject({ index: 1, wasCaptain: true, team: { captainId: 'a' } });
    const r2 = removeMember(t, 'c');
    expect(r2?.team.captainId).toBe('b');
    expect(r2?.wasCaptain).toBe(false);
    const solo = buildRoster([{ agent: ag('a') }]);
    expect(removeMember(solo, 'a')?.team).toEqual({ captainId: null, members: [] });
    expect(removeMember(solo, 'nobody')).toBeNull();
  });

  it('the captain must be a member', () => {
    const t = buildRoster([{ agent: ag('a') }, { agent: ag('b') }]);
    expect(setCaptain(t, 'b').captainId).toBe('b');
    expect(() => setCaptain(t, 'z')).toThrow(/must be a member/);
    expect(() => buildRoster([{ agent: ag('a') }], 'z')).toThrow(/must be a member/);
  });
});
