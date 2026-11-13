import { describe, expect, it } from 'vitest';
import { slugify, uniqueId } from '../../src/domain/ids.ts';
import { normalizeRoleName, roleKey } from '../../src/domain/roles.ts';

describe('ids', () => {
  it('slugifies names and de-duplicates', () => {
    expect(slugify('The Night Shift')).toBe('the-night-shift');
    expect(slugify('Café  Crème!')).toBe('cafe-creme');
    expect(slugify('!!!', 'agent')).toBe('agent');
    const taken = new Set(['x', 'x-2']);
    expect(uniqueId('x', (id) => taken.has(id))).toBe('x-3');
    expect(uniqueId('y', (id) => taken.has(id))).toBe('y');
  });
});

describe('role names', () => {
  it('normalizes whitespace and length, keys ignore case', () => {
    expect(normalizeRoleName('  Voice   UX ')).toBe('Voice UX');
    expect(normalizeRoleName('x'.repeat(40))).toHaveLength(28);
    expect(roleKey('Voice UX')).toBe(roleKey('voice ux'));
    expect(() => normalizeRoleName('   ')).toThrow(/empty/);
  });
});
