import { describe, expect, it } from 'vitest';
import { ownerKey, ownerOf, withoutOwnerTag } from '../../src/reaper/owner.ts';
import { fromBundles, ownedBy } from '../../src/reaper/pick.ts';
import type { Proc } from '../../src/running/processes.ts';

const proc = (pid: number, ppid: number, command: string, pgid = pid): Proc => ({
  pid,
  ppid,
  pgid,
  elapsedSec: 1,
  command,
});
const KEY = ownerKey('/Users/me/.ai-studio');
const tagged = (cmd: string, key = KEY) => `${cmd} HOME=/Users/me AI_STUDIO_OWNER=${key} PATH=/bin`;
const pids = (ps: Proc[]) => ps.map((p) => p.pid);

describe('owner tag', () => {
  it('keys a data dir stably and apart from another', () => {
    expect(ownerKey('/a')).toBe(ownerKey('/a'));
    expect(ownerKey('/a')).not.toBe(ownerKey('/b'));
  });
  it('reads the key from a ps -E line, null without one', () => {
    expect(ownerOf(tagged('node x.js'))).toBe(KEY);
    expect(ownerOf('node x.js HOME=/Users/me')).toBeNull();
    expect(ownerOf('node --flag=MY_AI_STUDIO_OWNER=zzz')).toBeNull();
  });
  it('strips the tag for the self-installer only', () => {
    expect(withoutOwnerTag({ AI_STUDIO_OWNER: KEY, PATH: '/bin' })).toEqual({ PATH: '/bin' });
  });
});

describe('ownedBy', () => {
  const SELF = 100;
  const table = [
    proc(1, 0, '/sbin/launchd'),
    proc(50, 1, '/Applications/AI Studio.app/Contents/MacOS/ai-studio'),
    proc(100, 50, tagged('node main.ts')), // the server: inherits a tag from a parent studio, still never itself
    proc(200, 100, tagged('claude -p'), 200),
    proc(201, 200, '/bin/sh -c npm run dev', 200), // Apple binary: no env shown, same group
    proc(300, 1, tagged('node vite.js'), 300), // double-forked away: re-parented to launchd
    proc(301, 300, 'sleep 100', 301), // its untagged child in a new group
    proc(400, 1, tagged('node other.js', ownerKey('/elsewhere')), 400), // another studio's
    proc(500, 1, 'node unrelated.js'),
  ];

  it("takes tagged processes, their groups and descendants — never self, its ancestors or another studio's", () => {
    expect(pids(ownedBy(KEY, table, SELF))).toEqual([200, 201, 300, 301]);
  });
  it('finds nothing in a table without our tag', () => {
    expect(ownedBy(KEY, [proc(500, 1, 'node unrelated.js')], SELF)).toEqual([]);
  });
});

describe('fromBundles', () => {
  const table = [
    proc(50, 1, '/Applications/AI Studio.app/Contents/MacOS/ai-studio'),
    proc(100, 50, 'node main.ts'),
    proc(600, 1, '/w/target/release/bundle/macos/Game.app/Contents/MacOS/game --x'),
    proc(601, 1, '/w/target/release/bundle/macos/Game.app.bak/Contents/MacOS/game'),
  ];
  it('takes processes running from an opened bundle, never the studio itself', () => {
    const bundles = ['/w/target/release/bundle/macos/Game.app/', '/Applications/AI Studio.app'];
    expect(pids(fromBundles(bundles, table, 100))).toEqual([600]);
  });
});
