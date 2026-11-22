import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['test/setup.ts'],
    // Flow tests spawn git and real CLI runners: ~1 s alone, but several seconds when
    // other agents run suites on the same machine (load 25+ on 8 cores). The 5 s default
    // fails them for load, not for bugs; a hang still fails, just later.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
