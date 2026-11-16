import { describe, expect, it } from 'vitest';
import type { Look, Role, Team } from '../../api/types';
import { EMBLEMS, hatDecal, LOOK_SLOTS } from '../../characters';
import { HUES } from '../../design/palette';
import {
  addLocal,
  candidates,
  capLine,
  captainLocal,
  castOrder,
  cycleLook,
  diffLine,
  draftDiff,
  draftLook,
  enterChoice,
  formationSpot,
  inwardFacing,
  KIND_ABOUT,
  leastUsedHue,
  lineupRows,
  newTeamLook,
  normRole,
  orderedMembers,
  removeLocal,
  roleByName,
  roleOptions,
  roleText,
  roleUse,
  sameLook,
  TEAM_MAX,
  tinkerDoing,
  trayOptions,
} from './model';

const look: Look = { hat: 'none', tool: 'none', body: 'hero', antenna: 'none', face: 'none', hue: 'sun' };
const role = (id: string, name: string, reporter = false): Role => ({ id, name, agentCount: 0, reporter });
const ROLES = [role('r1', 'Frontend'), role('r2', 'Backend'), role('r3', 'Research', true)];
const team = (ids: string[], captainId: string | null = ids[0] ?? null) => ({
  members: ids.map((agentId) => ({ agentId, instr: `job ${agentId}` })),
  captainId,
});

describe('cast order + labels', () => {
  it('studio crew first (setter, orchestrators, creator), then everyone else in order', () => {
    const k = (id: string, kind: 'agent' | 'setter' | 'orchestrator' | 'creator') => ({ id, kind });
    const out = castOrder([
      k('a', 'agent'),
      k('c', 'creator'),
      k('o1', 'orchestrator'),
      k('s', 'setter'),
      k('b', 'agent'),
      k('o2', 'orchestrator'),
    ]);
    expect(out.map((x) => x.id)).toEqual(['s', 'o1', 'o2', 'c', 'a', 'b']);
  });
  it('crew show their kind, agents their custom role or "No role yet"', () => {
    expect(roleText({ kind: 'orchestrator', role: 'x', roleId: null })).toBe('Orchestrator');
    expect(roleText({ kind: 'agent', role: 'Frontend', roleId: 'r1' })).toBe('Frontend');
    expect(roleText({ kind: 'agent', role: '', roleId: null })).toBe('No role yet');
  });
  it('required crew carry one short line', () => {
    expect(KIND_ABOUT).toEqual({
      setter: 'Sets up new projects.',
      orchestrator: 'Runs a project — big picture.',
      creator: 'Makes new agents and teams.',
    });
  });
  it('role usage line', () => {
    expect([roleUse(0), roleUse(1), roleUse(4)]).toEqual(['unused', '1 agent', '4 agents']);
  });
});

describe('look arrows + recruit colour', () => {
  it('every slot wraps both ways; the hat carries its decal', () => {
    for (const sl of LOOK_SLOTS) {
      const first = { ...look, [sl.id]: sl.options[0] } as Look;
      const back = cycleLook(first, sl.id, -1);
      expect(back[sl.id]).toBe(sl.options[sl.options.length - 1]);
      expect(cycleLook(back, sl.id, 1)[sl.id]).toBe(sl.options[0]);
    }
    const hat = LOOK_SLOTS.find((s) => s.id === 'hat');
    if (!hat) throw new Error('no hat slot');
    const next = cycleLook({ ...look, hat: hat.options[0] as string }, 'hat', 1);
    expect(next.decal).toBe(hatDecal(next.hat));
  });
  it('trayOptions: every option of every slot, in order, the current one marked, each tried on', () => {
    for (const sl of LOOK_SLOTS) {
      const opts = trayOptions(look, sl.id);
      expect(opts.map((o) => o.value)).toEqual([...sl.options]);
      expect(opts.filter((o) => o.current).map((o) => o.value)).toEqual([look[sl.id]]);
      for (const o of opts) {
        expect(o.look[sl.id]).toBe(o.value);
        expect(o.name).toBe(sl.name(o.value));
        /* only the slot changes (and the hat's decal) */
        for (const k of ['hat', 'tool', 'body', 'antenna', 'face', 'hue'] as const)
          if (k !== sl.id) expect(o.look[k]).toBe(look[k]);
      }
    }
    const captain = trayOptions(look, 'hat').find((o) => o.value === 'captain');
    expect(captain?.look.decal).toBe(hatDecal('captain'));
    expect(captain?.name).toBe("Captain's cap");
    expect(trayOptions(look, 'hue')).toHaveLength(7);
  });
  it('sameLook ignores key order and a missing decal', () => {
    const shuffled = {
      hue: 'sun',
      face: 'none',
      antenna: 'none',
      body: 'hero',
      tool: 'none',
      hat: 'none',
    } as Look;
    expect(sameLook(look, shuffled)).toBe(true);
    expect(sameLook(look, { ...look, decal: undefined })).toBe(true);
    expect(sameLook(look, { ...look, decal: 'none' })).toBe(true);
    expect(sameLook(look, { ...look, hat: 'beret' })).toBe(false);
    expect(sameLook(look, { ...look, decal: 'Design' })).toBe(false);
  });
  it('a new recruit wears the least-used hue', () => {
    const worn = HUES.filter((h) => h !== 'grape').map((hue) => ({ look: { ...look, hue } }));
    expect(leastUsedHue(worn)).toBe('grape');
    expect(leastUsedHue([])).toBe(HUES[0]);
  });
});

describe('role pick-or-type', () => {
  it('normalises names (trim, collapse spaces, 28 chars)', () => {
    expect(normRole('  Sound   Design ')).toBe('Sound Design');
    expect(normRole('x'.repeat(40))).toHaveLength(28);
  });
  it('finds a role by name, case-insensitively', () => {
    expect(roleByName(ROLES, ' frontend ')?.id).toBe('r1');
    expect(roleByName(ROLES, '')).toBeNull();
    expect(roleByName(ROLES, 'Sound')).toBeNull();
  });
  it('options: matches + "Create “x”" unless the name exists exactly', () => {
    expect(roleOptions(ROLES, '').map((o) => o.label)).toEqual(['Frontend', 'Backend', 'Research']);
    expect(roleOptions(ROLES, 'end').map((o) => o.label)).toEqual(['Frontend', 'Backend', 'Create “end”']);
    expect(roleOptions(ROLES, '  sound   design ').at(-1)?.label).toBe(
      `Create “${normRole('  sound   design ')}”`,
    );
    expect(roleOptions(ROLES, 'backend').some((o) => o.create)).toBe(false);
    expect(roleOptions(ROLES, 'Sound Design ').at(-1)).toEqual({
      id: 'new',
      label: 'Create “Sound Design”',
      create: true,
    });
  });
  it('Enter = highlighted option, else an exact match, else create', () => {
    const opts = roleOptions(ROLES, 'end');
    expect(enterChoice(opts, 1, 'end')?.label).toBe('Backend');
    expect(enterChoice(roleOptions(ROLES, 'Backend'), -1, 'Backend')?.id).toBe('r2');
    expect(enterChoice(opts, -1, 'end')?.create).toBe(true);
    expect(enterChoice([], -1, 'x')).toBeNull();
  });
});

describe('lineup layout', () => {
  it('crew rows first, the rest balanced (11 in 6 cols → 6 + 5)', () => {
    const rows = lineupRows(
      ['s', 'o', 'c'],
      Array.from({ length: 11 }, (_, i) => String(i)),
      6,
    );
    expect(rows.map((r) => [r.items.length, r.crew])).toEqual([
      [3, true],
      [6, false],
      [5, false],
    ]);
  });
  it('the middle faces front, the sides turn inward', () => {
    expect(inwardFacing(1, 3)).toEqual({ facing: 'front', dir: 'left' });
    expect(inwardFacing(0, 3)).toEqual({ facing: 'three-quarter', dir: 'right' });
    expect(inwardFacing(2, 3)).toEqual({ facing: 'three-quarter', dir: 'left' });
  });
});

describe('teams', () => {
  it('captain first in every list; "Captain" never doubled', () => {
    expect(orderedMembers(team(['a', 'b', 'c'], 'b')).map((m) => m.agentId)).toEqual(['b', 'a', 'c']);
    expect(capLine('Doc Hollywood')).toBe('Captain Doc Hollywood');
    expect(capLine('Captain Semicolon')).toBe('Captain Semicolon');
    expect(capLine(undefined)).toBe('Captain none yet');
  });
  it('max 7: the 6th and 7th stand in a back row, smaller and further back', () => {
    const spots = Array.from({ length: TEAM_MAX }, (_, i) => formationSpot(i, 1000, 300, 186));
    expect(spots.filter((s) => s.back)).toHaveLength(2);
    expect(spots[5]?.back && spots[6]?.back).toBe(true);
    expect(spots[0]?.px).toBe(300);
    expect((spots[5]?.z ?? 99) < (spots[1]?.z ?? 0)).toBe(true);
    expect(Math.sign(spots[5]?.x ?? 0)).toBe(-1);
    expect(Math.sign(spots[6]?.x ?? 0)).toBe(1);
  });
  it('add: no duplicates, never past 7, the first member becomes captain, at = old place', () => {
    const empty = team([], null);
    const one = addLocal(empty, 'a');
    expect(one.captainId).toBe('a');
    expect(addLocal(one, 'a')).toBe(one);
    const full = team(['1', '2', '3', '4', '5', '6', '7']);
    expect(addLocal(full, '8')).toBe(full);
    expect(addLocal(team(['a', 'c']), 'b', 'x', 1).members.map((m) => m.agentId)).toEqual(['a', 'b', 'c']);
  });
  it('remove: the captain passes on; undo data keeps index + job', () => {
    const r = removeLocal(team(['a', 'b', 'c'], 'a'), 'a');
    expect(r?.team.captainId).toBe('b');
    expect(r?.wasCaptain).toBe(true);
    expect(r?.index).toBe(0);
    expect(r?.member.instr).toBe('job a');
    expect(removeLocal(team(['a']), 'zz')).toBeNull();
    expect(removeLocal(team(['a']), 'a')?.team.captainId).toBeNull();
  });
  it('make captain only for members', () => {
    const t = team(['a', 'b']);
    expect(captainLocal(t, 'b').captainId).toBe('b');
    expect(captainLocal(t, 'x')).toBe(t);
  });
  it('candidates = non-crew agents not on the team', () => {
    const agents = [
      { id: 'o', kind: 'orchestrator' as const },
      { id: 'a', kind: 'agent' as const },
      { id: 'b', kind: 'agent' as const },
    ];
    expect(candidates(agents, team(['a'])).map((x) => x.id)).toEqual(['b']);
  });
  it('a new team gets the first unused colour and emblem', () => {
    const t = [{ color: HUES[0], emblem: EMBLEMS[0]?.id }] as Pick<Team, 'color' | 'emblem'>[];
    expect(newTeamLook(t)).toEqual({ color: HUES[1], emblem: EMBLEMS[1]?.id });
    expect(EMBLEMS).toHaveLength(18);
  });
});

describe('design with Tinker', () => {
  const d1 = { name: 'Swifty', role: 'iOS', summary: 'Ships SwiftUI apps.', prompt: 'You build…', look };
  it('a first draft changes every field it brings (and the look slots it sets)', () => {
    expect(draftDiff(null, { name: 'Swifty', look: { hue: 'mint' } })).toEqual({
      fields: ['name'],
      look: ['hue'],
    });
    expect(draftDiff(null, d1).fields).toEqual(['name', 'role', 'summary', 'prompt']);
  });
  it('only what differs counts; whitespace does not', () => {
    const d2 = { ...d1, role: 'iOS Engineer', prompt: ' You build… ', look: { ...look, hat: 'cap' } };
    expect(draftDiff(d1, d2)).toEqual({ fields: ['role'], look: ['hat'] });
    expect(draftDiff(d1, { ...d1 })).toEqual({ fields: [], look: [] });
  });
  it('announces field names only, never values', () => {
    expect(diffLine({ fields: ['role'], look: ['hat', 'hue'] })).toBe('Draft updated: role, look');
    expect(diffLine({ fields: [], look: [] })).toBeNull();
  });
  it('completes a partial drafted look over a base', () => {
    expect(draftLook(look, { look: { hue: 'mint' } })).toEqual({ ...look, hue: 'mint' });
    expect(draftLook(look, null)).toEqual(look);
  });
  it('says what Tinker is doing', () => {
    expect(tinkerDoing(null)).toEqual({ status: '', research: null });
    expect(tinkerDoing({ kind: 'thinking', label: 'Thinking' })).toEqual({
      status: 'Thinking…',
      research: null,
    });
    const r = tinkerDoing({ kind: 'research', label: 'Looking up “SwiftUI”' });
    expect(r).toEqual({ status: 'Looking up “SwiftUI”…', research: 'Looking up “SwiftUI”…' });
  });
});
