import { describe, expect, it } from 'vitest';
import { approverFor, callRefusal, MAX_CHAIN } from '../../src/room/rule.ts';

const base = {
  orchestratorId: 'orch',
  inRoom: (id: string) => ['orch', 'cap', 'mem', 'creator'].includes(id),
  captainOf: (id: string) => (id === 'mem' || id === 'cap' ? 'cap' : null),
};

describe('who must OK a call', () => {
  it('the orchestrator brings anyone in; anyone may call someone already in the room', () => {
    expect(approverFor({ ...base, callerId: 'orch', calleeId: 'outsider' })).toBeNull();
    expect(approverFor({ ...base, callerId: 'mem', calleeId: 'creator' })).toBeNull();
  });
  it('someone new: a member asks their captain; a captain, a specialist or the creator asks the orchestrator', () => {
    expect(approverFor({ ...base, callerId: 'mem', calleeId: 'outsider' })).toBe('cap');
    expect(approverFor({ ...base, callerId: 'cap', calleeId: 'outsider' })).toBe('orch');
    expect(approverFor({ ...base, callerId: 'creator', calleeId: 'outsider' })).toBe('orch');
  });
  it('refuses calling yourself, a cycle, and nesting deeper than the cap', () => {
    expect(callRefusal({ callerId: 'a', calleeId: 'a', chain: [] })).toMatch(/yourself/);
    expect(callRefusal({ callerId: 'b', calleeId: 'a', chain: ['a'] })).toMatch(/already part/);
    expect(
      callRefusal({
        callerId: 'z',
        calleeId: 'y',
        chain: Array.from({ length: MAX_CHAIN }, (_, i) => `x${i}`),
      }),
    ).toMatch(/deeper/);
    expect(callRefusal({ callerId: 'b', calleeId: 'c', chain: ['a'] })).toBeNull();
  });
});

describe('create_* input', () => {
  it('parses a nested object sent as a JSON string (live: look as a string)', async () => {
    const { unstring } = await import('../../src/crew/creator.ts');
    expect(unstring({ name: 'N', look: '{"hat":"captain"}', prompt: '{not json' })).toEqual({
      name: 'N',
      look: { hat: 'captain' },
      prompt: '{not json',
    });
    expect(unstring({ members: [{ newAgent: '{"look":"{\\"hue\\":\\"teal\\"}"}' }] })).toEqual({
      members: [{ newAgent: { look: { hue: 'teal' } } }],
    });
  });
});
