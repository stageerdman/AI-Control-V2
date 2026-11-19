/* Work handed to the orchestrator (`call_agent` work: true to Pixel) lands on Pixel's whiteboard on every project:
   one with teams (Aurora) and one with only specialists (Lumi, like HQ). The orchestrator is always a member. */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { workRepo } from '../../src/db/work.ts';
import { projectMembers } from '../../src/room/members.ts';
import type { RunSpec } from '../../src/runtime/runner.ts';
import { testApp } from '../helpers.ts';
import { scriptedCrew } from './brain.ts';

const CASES = [
  { project: 'aurora', builder: 'a-baron', teams: 'with teams' },
  { project: 'lumi', builder: 'a-prof', teams: 'without teams' },
] as const;

async function until<T>(read: () => T, ok: (v: T) => boolean, ms = 8000): Promise<T> {
  for (const end = Date.now() + ms; Date.now() < end; await new Promise((r) => setTimeout(r, 10))) {
    const v = read();
    if (ok(v)) return v;
  }
  throw new Error(`timed out; now: ${JSON.stringify(read())}`);
}

describe('work: true to the orchestrator reaches them on every project', () => {
  let h: ReturnType<typeof testApp>;
  afterEach(() => h.close());

  it.each(CASES)(
    'a project $teams: Pixel gets a task waiting for a new owner',
    async ({ project, builder }) => {
      const plan = {
        summary: 'One item.',
        items: [{ text: 'Build it', assignee: builder, brief: 'Build it.' }],
      };
      let asked = false;
      const crew = scriptedCrew(
        { dispatch: [plan], help: [{ answer: 'Noted.', say: 'noted' }] },
        (s: RunSpec) => {
          if (asked || !s.task.includes('Your checklist item')) return [{ result: 'Done.' }];
          asked = true;
          return [
            {
              tool: 'call_agent',
              args: {
                agent: 'Pixel',
                request: 'Add a feature for offline mode.',
                why: 'flag it',
                work: true,
              },
            },
            { result: 'Done.' },
          ];
        },
      );
      h = testApp({ seed: true, runner: crew.runner });
      mkdirSync(join(h.config.sandbox, project));
      h.store.projects.update(project, { folder: project });
      expect(projectMembers(h.store, project)[0]).toBe('a-pixel');
      const r = await h.call('POST', `/projects/${project}/work`, { goal: 'Build it' });
      expect(r.status).toBe(201);
      const work = workRepo(h.db);
      const items = await until(
        () => work.goals(project).flatMap((g) => g.items),
        (all) => all.some((i) => i.agentId === 'a-pixel' && i.status === 'todo'),
      );
      expect(items.find((i) => i.agentId === 'a-pixel')).toMatchObject({ teamId: null, buildRunId: null });
      const calls = (h.events.after('project', project) as { type: string; payload: { status?: string } }[])
        .filter((e) => e.type === 'room.call')
        .map((e) => e.payload.status);
      expect(calls).not.toContain('failed');
      await until(
        () => h.runtime.liveCount(),
        (n) => n === 0,
      );
    },
    20_000,
  );
});
