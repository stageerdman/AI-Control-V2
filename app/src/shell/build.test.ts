import { describe, expect, it } from 'vitest';
import type { BuildReport } from '../api/types';
import { staleNotice } from './build';

const HEAD = 'ab691c5aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const report = (over: Partial<BuildReport> = {}): BuildReport => ({
  running: HEAD,
  installed: { commit: HEAD },
  install: null,
  ...over,
});

/* the bug: the installed window was an old build, so merged features (chat History) were just missing */
describe('staleNotice', () => {
  it('is silent when the window is the build the backend runs (short vs full hash), or when it can’t tell', () => {
    expect(staleNotice('ab691c5', report())).toBeNull();
    expect(staleNotice('ab691c5', undefined)).toBeNull();
    expect(staleNotice('unknown', report())).toBeNull();
    expect(staleNotice('13c5ed4', report({ running: 'unknown' }))).toBeNull();
  });

  it('says a newer build is installed when the marker matches the backend', () => {
    expect(staleNotice('13c5ed4', report())?.text).toMatch(
      /newer AI Studio \(ab691c5\) is installed — quit and reopen/,
    );
  });

  it('says an install is running, or failed with where to look', () => {
    const at = '2026-11-15T00:00:00Z';
    expect(staleNotice('13c5ed4', report({ install: { state: 'installing', at } }))?.text).toMatch(
      /Installing/,
    );
    const failed = staleNotice('13c5ed4', report({ install: { state: 'failed', at, error: 'x' } }));
    expect(failed).toMatchObject({ tone: 'error' });
    expect(failed?.text).toMatch(/didn’t install.*self-install\.log/);
  });

  it('is honest when nothing newer is installed', () => {
    const n = staleNotice('13c5ed4', report({ installed: { commit: '13c5ed4' } }));
    expect(n?.tone).toBe('error');
    expect(n?.text).toMatch(/older build than ab691c5 and no update is installed/);
  });
});
