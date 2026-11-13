import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ensureDirs, expandPath, loadConfig } from '../src/config.ts';
import { tempDir, testConfig } from './helpers.ts';

describe('loadConfig', () => {
  it('defaults every path under the user home and port 4319', () => {
    const c = loadConfig({}, '/Users/x');
    expect(c).toEqual({
      home: '/Users/x/.ai-studio',
      sandbox: '/Users/x/dev/AI-Studio-Sandbox',
      controlHome: '/Users/x/.ai-control',
      dbPath: '/Users/x/.ai-studio/studio.db',
      port: 4319,
      host: '127.0.0.1',
    });
  });

  it('honours overrides, expanding ~ and coercing PORT', () => {
    const c = loadConfig(
      { AI_STUDIO_HOME: '/data/studio', AI_STUDIO_SANDBOX: '~/box', AI_CONTROL_HOME: '~', PORT: '5000' },
      '/Users/x',
    );
    expect(c.home).toBe('/data/studio');
    expect(c.dbPath).toBe('/data/studio/studio.db');
    expect(c.sandbox).toBe('/Users/x/box');
    expect(c.controlHome).toBe('/Users/x');
    expect(c.port).toBe(5000);
  });

  it('rejects a non-numeric or out-of-range PORT', () => {
    expect(() => loadConfig({ PORT: 'abc' }, '/u')).toThrow(/PORT/);
    expect(() => loadConfig({ PORT: '70000' }, '/u')).toThrow(/PORT/);
  });

  it('rejects empty path overrides', () => {
    expect(() => loadConfig({ AI_STUDIO_SANDBOX: '  ' }, '/u')).toThrow(/AI_STUDIO_SANDBOX/);
  });

  it('expandPath resolves relative paths to absolute', () => {
    expect(expandPath('rel/dir', '/u').startsWith('/')).toBe(true);
    expect(expandPath('~/a', '/u')).toBe('/u/a');
  });
});

describe('ensureDirs', () => {
  let cleanup = () => {};
  afterEach(() => cleanup());

  it('creates home (0700) and sandbox, but never AI Control home', () => {
    const t = tempDir();
    cleanup = t.cleanup;
    const c = testConfig(join(t.dir, 'nested', 'deeper'));
    ensureDirs(c);
    expect(statSync(c.home).isDirectory()).toBe(true);
    expect(statSync(c.home).mode & 0o777).toBe(0o700);
    expect(statSync(c.sandbox).isDirectory()).toBe(true);
    expect(existsSync(c.controlHome)).toBe(false);
    ensureDirs(c); // idempotent
  });
});
