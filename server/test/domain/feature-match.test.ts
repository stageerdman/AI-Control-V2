import { describe, expect, it } from 'vitest';
import { matchFeatures } from '../../src/domain/feature-match.ts';

const names = (fs: { name: string }[]) => fs.map((f) => f.name);
const all = [{ name: 'Dark mode' }, { name: 'Dark mode v2' }, { name: 'Offline  mode' }, { name: 'Search' }];

describe('matchFeatures', () => {
  it('matches a whole name in any case and spacing; an exact name wins over longer ones', () => {
    expect(names(matchFeatures(all, '  dark MODE '))).toEqual(['Dark mode']);
    expect(names(matchFeatures(all, 'offline mode'))).toEqual(['Offline  mode']);
  });

  it('matches part of a name, returning every match in order', () => {
    expect(names(matchFeatures(all, 'sear'))).toEqual(['Search']);
    expect(names(matchFeatures(all, 'MODE'))).toEqual(['Dark mode', 'Dark mode v2', 'Offline  mode']);
  });

  it('finds nothing for an unknown or empty name', () => {
    expect(matchFeatures(all, 'billing')).toEqual([]);
    expect(matchFeatures(all, '   ')).toEqual([]);
  });
});
