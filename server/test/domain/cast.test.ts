import { describe, expect, it } from 'vitest';
import {
  type AgentKind,
  answersTo,
  assertCanCreate,
  assertCanDelete,
  assertNotSystem,
  assertOrchestrator,
  canDelete,
  replacementOrchestrator,
} from '../../src/domain/cast.ts';
import { AppError } from '../../src/errors.ts';

const a = (id: string, kind: AgentKind) => ({ id, kind });
const cast = [
  a('s', 'setter'),
  a('o1', 'orchestrator'),
  a('o2', 'orchestrator'),
  a('c', 'creator'),
  a('x', 'agent'),
];

describe('answersTo', () => {
  const tinker = { id: 'a-creator', kind: 'creator' as const, name: 'Tinker', nick: null };
  it('the one-of-a-kind creator answers to its name and its role', () => {
    for (const said of ['Tinker', 'tinker ', 'a-creator', 'Agent Creator', 'the agent creator'])
      expect(answersTo(tinker, said)).toBe(true);
    expect(answersTo(tinker, 'Creator')).toBe(false);
  });
  it('a role shared by many (orchestrator) is never a name', () => {
    expect(answersTo({ id: 'o', kind: 'orchestrator', name: 'Pixel' }, 'Orchestrator')).toBe(false);
  });
});

const code = (fn: () => void) => {
  try {
    fn();
  } catch (e) {
    return e instanceof AppError ? e.status : 'other';
  }
  return 'ok';
};

describe('cast rules', () => {
  it('refuses a second setter or creator; orchestrators and agents are open', () => {
    expect(code(() => assertCanCreate('setter', cast))).toBe(409);
    expect(code(() => assertCanCreate('creator', cast))).toBe(409);
    expect(code(() => assertCanCreate('orchestrator', cast))).toBe('ok');
    expect(code(() => assertCanCreate('agent', cast))).toBe('ok');
    expect(code(() => assertCanCreate('setter', [a('x', 'agent')]))).toBe('ok');
  });

  it('never deletes the setter or creator', () => {
    expect(canDelete(a('s', 'setter'), cast)).toMatchObject({
      ok: false,
      why: expect.stringMatching(/Project Setter/),
    });
    expect(canDelete(a('c', 'creator'), cast)).toMatchObject({
      ok: false,
      why: expect.stringMatching(/Agent Creator/),
    });
    expect(code(() => assertCanDelete(a('s', 'setter'), cast))).toBe(409);
  });

  it('deletes orchestrators down to the last one', () => {
    expect(canDelete(a('o1', 'orchestrator'), cast).ok).toBe(true);
    const one = cast.filter((x) => x.id !== 'o2');
    expect(canDelete(a('o1', 'orchestrator'), one)).toMatchObject({
      ok: false,
      why: expect.stringMatching(/At least one/),
    });
    expect(canDelete(a('x', 'agent'), one).ok).toBe(true);
  });

  it('hands an orchestrator’s projects to the first other orchestrator', () => {
    expect(replacementOrchestrator(a('o1', 'orchestrator'), cast)).toBe('o2');
    expect(replacementOrchestrator(a('o2', 'orchestrator'), cast)).toBe('o1');
    expect(replacementOrchestrator(a('o1', 'orchestrator'), [a('o1', 'orchestrator')])).toBeNull();
  });

  it('only orchestrators run projects; system agents never join', () => {
    expect(code(() => assertOrchestrator(a('x', 'agent')))).toBe(409);
    expect(code(() => assertOrchestrator(a('o1', 'orchestrator')))).toBe('ok');
    for (const k of ['setter', 'orchestrator', 'creator'] as const)
      expect(code(() => assertNotSystem(a('q', k)))).toBe(409);
    expect(code(() => assertNotSystem(a('x', 'agent')))).toBe('ok');
  });
});
