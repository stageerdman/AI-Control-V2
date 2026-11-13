import { readdirSync, readFileSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  formatLine,
  getValue,
  parseEnv,
  removeKey,
  serializeEnv,
  setValue,
} from '../../src/secrets/dotenv.ts';
import { fileSecretStore, writeFileAtomic } from '../../src/secrets/secretStore.ts';
import { tempDir } from '../helpers.ts';

describe('dotenv', () => {
  it('parses bare, quoted, export-prefixed and commented values; keeps everything else raw', () => {
    const text = [
      '# Global secrets',
      '',
      'A=plain',
      'export B="has space \\"q\\""',
      "C='lit $HOME # not a comment'",
      'D=val # trailing comment',
      'E=',
      'not a line at all',
    ].join('\n');
    const lines = parseEnv(`${text}\n`);
    expect(lines.map((l) => [l.key, l.value])).toEqual([
      [undefined, undefined],
      [undefined, undefined],
      ['A', 'plain'],
      ['B', 'has space "q"'],
      ['C', 'lit $HOME # not a comment'],
      ['D', 'val'],
      ['E', ''],
      [undefined, undefined],
    ]);
    expect(serializeEnv(lines)).toBe(`${text}\n`); // round-trips byte for byte
  });

  it('formats values so they parse back identically', () => {
    for (const v of ['sk-abc_123', 'with space', "it's", 'a"b\\c', '#hash', 'x=y', '']) {
      expect(getValue(parseEnv(formatLine('K', v)), 'K')).toBe(v);
    }
    expect(() => formatLine('K', 'a\nb')).toThrow();
    expect(() => formatLine('1BAD', 'x')).toThrow();
  });

  it('set replaces in place (dropping duplicates) or appends; remove drops every occurrence', () => {
    const lines = parseEnv('# c\nA=1\nB=2\nA=3\n');
    expect(serializeEnv(setValue(lines, 'A', 'new'))).toBe('# c\nA=new\nB=2\n');
    expect(serializeEnv(setValue(lines, 'Z', 'z'))).toBe('# c\nA=1\nB=2\nA=3\nZ=z\n');
    expect(serializeEnv(removeKey(lines, 'A'))).toBe('# c\nB=2\n');
  });
});

describe('fileSecretStore', () => {
  let t: ReturnType<typeof tempDir>;
  beforeEach(() => {
    t = tempDir();
  });
  afterEach(() => t.cleanup());

  it('preserves unrelated lines and comments, writes 0600, leaves no temp files', () => {
    const path = join(t.dir, '.env');
    writeFileSync(path, '# keep me\nOTHER=untouched # note\n\n', { mode: 0o644 });
    const s = fileSecretStore(path);
    s.set('GITHUB_TOKEN', 'ghp_value_1');
    s.set('OPENAI_API_KEY', 'sk two');
    s.set('GITHUB_TOKEN', 'ghp_value_2');
    expect(readFileSync(path, 'utf8')).toBe(
      "# keep me\nOTHER=untouched # note\n\nGITHUB_TOKEN=ghp_value_2\nOPENAI_API_KEY='sk two'\n",
    );
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(s.get('OPENAI_API_KEY')).toBe('sk two');
    expect(s.keys()).toEqual(['OTHER', 'GITHUB_TOKEN', 'OPENAI_API_KEY']);
    s.delete('GITHUB_TOKEN');
    s.delete('NEVER_THERE');
    expect(readFileSync(path, 'utf8')).toBe("# keep me\nOTHER=untouched # note\n\nOPENAI_API_KEY='sk two'\n");
    expect(readdirSync(t.dir)).toEqual(['.env']);
  });

  it('creates the file (and its dir) on first write', () => {
    const s = fileSecretStore(join(t.dir, 'control', '.env'));
    expect(s.get('X')).toBeUndefined();
    expect(s.keys()).toEqual([]);
    s.set('X', 'y');
    expect(readFileSync(join(t.dir, 'control', '.env'), 'utf8')).toBe('X=y\n');
  });

  it('writes through a symlinked .env instead of replacing the link', () => {
    const real = join(t.dir, 'real.env');
    writeFileSync(real, 'A=1\n');
    symlinkSync(real, join(t.dir, '.env'));
    writeFileAtomic(join(t.dir, '.env'), 'A=2\n');
    expect(readFileSync(real, 'utf8')).toBe('A=2\n');
  });
});
