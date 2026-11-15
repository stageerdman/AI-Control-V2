import { describe, expect, it, vi } from 'vitest';
import { type Proc, parseElapsed, parsePs, stopTree, treeOf } from '../../src/running/processes.ts';

const p = (pid: number, ppid: number, pgid: number, command = `cmd${pid}`): Proc => ({
  pid,
  ppid,
  pgid,
  elapsedSec: 1,
  command,
});

describe('the process table', () => {
  it('reads ps elapsed times in every shape', () => {
    expect(parseElapsed('00:07')).toBe(7);
    expect(parseElapsed('12:05')).toBe(725);
    expect(parseElapsed('01:00:00')).toBe(3600);
    expect(parseElapsed('2-03:04:05')).toBe(2 * 86400 + 3 * 3600 + 4 * 60 + 5);
    expect(parseElapsed('soon')).toBeNaN();
  });

  it('parses ps lines and skips the malformed ones', () => {
    const text =
      '  101     1   101   01:02 /usr/bin/node server.js --port 3568\nnoise\n 202 101 101 00:03 sleep 5\n';
    expect(parsePs(text)).toEqual([
      { pid: 101, ppid: 1, pgid: 101, elapsedSec: 62, command: '/usr/bin/node server.js --port 3568' },
      { pid: 202, ppid: 101, pgid: 101, elapsedSec: 3, command: 'sleep 5' },
    ]);
  });

  it("a session's tree: its group, plus children that made their own group and theirs — never strangers", () => {
    const table = [
      p(100, 1, 100), // the session itself
      p(101, 100, 100), // a shell in its group
      p(102, 101, 102), // a server that made its own group (setsid)
      p(103, 102, 102), // the server's worker
      p(104, 1, 100), // an orphan still in the group
      p(200, 1, 200), // somebody else
      p(201, 200, 200),
    ];
    expect(treeOf(100, table).map((x) => x.pid)).toEqual([101, 102, 103, 104]);
    expect(treeOf(999, table)).toEqual([]);
  });

  it('stopTree signals the group and every member, then KILLs after the grace', () => {
    vi.useFakeTimers();
    try {
      const kill = vi.fn((_pid: number, _sig: NodeJS.Signals) => true);
      stopTree(100, 50, { procs: () => [p(100, 1, 100), p(101, 100, 100), p(102, 101, 102)], kill });
      expect(kill.mock.calls).toEqual([
        [-100, 'SIGTERM'],
        [100, 'SIGTERM'],
        [101, 'SIGTERM'],
        [102, 'SIGTERM'],
      ]);
      vi.advanceTimersByTime(50);
      expect(kill.mock.calls.slice(4).map((c) => c[1])).toEqual(['SIGKILL', 'SIGKILL', 'SIGKILL', 'SIGKILL']);
    } finally {
      vi.useRealTimers();
    }
  });
});
