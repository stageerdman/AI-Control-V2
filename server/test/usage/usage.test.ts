/* The object-use log and the how-to page built on it. */
import { describe, expect, it } from 'vitest';
import { hireTool } from '../../src/crew/creator-chat.ts';
import { openDb } from '../../src/db/connection.ts';
import { migrate } from '../../src/db/migrations.ts';
import { createBus } from '../../src/events/bus.ts';
import { eventLog } from '../../src/events/log.ts';
import { actionTools } from '../../src/office/action-tools.ts';
import { featureTools } from '../../src/office/feature-tools.ts';
import { pagerTools } from '../../src/office/pager.ts';
import { questionTools } from '../../src/office/question-tools.ts';
import { teamTools } from '../../src/office/team-tools.ts';
import { todoTools } from '../../src/todos/tools.ts';
import { howToPage } from '../../src/usage/how-to.ts';
import { OFFICE_OBJECTS } from '../../src/usage/objects.ts';
import { toolUse, tracked } from '../../src/usage/usage.ts';
import { whiteboardTools } from '../../src/whiteboard/tools.ts';

function setup() {
  const db = openDb(':memory:');
  migrate(db);
  db.prepare(
    "INSERT INTO agents (id, kind, name, look, position, created_at, updated_at) VALUES ('o', 'orchestrator', 'O', '{}', 0, '', '')",
  ).run();
  db.prepare(
    "INSERT INTO projects (id, name, status, orchestrator_id, tile, position, created_at, updated_at) VALUES ('kite', 'Kite', 'live', 'o', '{}', 0, '', '')",
  ).run();
  const events = eventLog(db, createBus());
  return { db, record: (pid: string, e: Parameters<typeof events.append>[2]) => events.append('project', pid, e) };
}
const tool = (name: string, run: (args: Record<string, unknown>) => Promise<string>) => ({ name, description: '', inputSchema: {}, run });

describe('object-use log', () => {
  it('records every call (failures too) and counts them per tool and agent, most used first', async () => {
    const { db, record } = setup();
    const [room, page] = tracked(
      [tool('room', async () => 'ok'), tool('page_user', async () => Promise.reject(new Error('no')))],
      { projectId: 'kite', agentId: 'bob', runId: 'r1' },
      record,
    );
    await room?.run({});
    await room?.run({});
    await expect(page?.run({})).rejects.toThrow('no');
    const [director] = tracked([tool('add_goal', async () => 'ok')], { projectId: 'kite', agentId: 'o' }, record);
    await director?.run({});
    expect(toolUse(db, 'kite').map(({ tool, agentId, uses, errors }) => ({ tool, agentId, uses, errors }))).toEqual([
      { tool: 'room', agentId: 'bob', uses: 2, errors: 0 },
      { tool: 'add_goal', agentId: 'o', uses: 1, errors: 0 },
      { tool: 'page_user', agentId: 'bob', uses: 1, errors: 1 },
    ]);
  });

  it('the how-to page shows each object, how the AIs use it, and the real counts (escaped)', () => {
    const page = howToPage(
      'Kite <b>',
      [{ tool: 'call_agent', agentId: 'bob', uses: 3, errors: 1, lastAt: '' }],
      (id) => (id === 'bob' ? 'Bob' : id),
    );
    expect(page).toContain('<h2>Whiteboard</h2>');
    expect(page).toContain('3 (1 failed) — Bob ×3');
    expect(page).toContain('Kite &lt;b&gt;');
    expect(page).not.toContain('Kite <b>');
  });

  it('the page’s map covers every tool the director and agents really have', () => {
    const director = [
      ...whiteboardTools({} as never, 'p', 'o'),
      ...featureTools({} as never, {} as never, 'p'),
      ...actionTools({} as never, 'p', 'o'),
      ...teamTools({} as never, 'p', 'o', { card: () => {} }),
      ...questionTools({} as never, 'p'),
      ...pagerTools({} as never, 'p', 'o'),
      ...todoTools({} as never, String, 'p', 'o'),
      hireTool({} as never, () => ({ name: 'O', projectName: 'p' })),
    ].map((t) => t.name);
    const agents = ['room', 'call_agent', 'comms_log', 'my_runs', 'cancel_run', 'my_history', 'feature'];
    const more = ['send_mail', 'mail_directory', 'read_mail', 'forget', 'file_report', 'ask_user', 'tell_agent'];
    const mapped = new Set(OFFICE_OBJECTS.flatMap((o) => o.tools.map((t) => t.name)));
    for (const name of [...director, ...agents, ...more]) expect(mapped.has(name), name).toBe(true);
  });
});
