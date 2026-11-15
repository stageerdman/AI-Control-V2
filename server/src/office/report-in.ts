/* Report-in (DIRECTOR POWERS): when a whiteboard step finishes or fails, its owner tells the director (a `deliver`
   handoff to the director — the office walks it over, the comms log keeps it), and the director decides, in one crew
   call (`report-in`), what the user hears:
     - "page"  → a line in the director's chat AND a page on the pager (comms kind 'page' until the office is visited);
     - "chat"  → a line in the director's chat;
     - "keep"  → nothing for the user (kept in the comms log as the director's note).
   The whiteboard itself is updated by dispatch either way. Members already report to their captain (dispatch's own
   `deliver`), so only the whiteboard's own items report here. One report at a time per project. */
import { z } from 'zod';
import type { Comms } from '../comms/comms.ts';
import { type Crew, validateWith } from '../crew/structured.ts';
import type { Db } from '../db/connection.ts';
import type { Store } from '../db/store.ts';
import { rows } from '../db/util.ts';
import { workRepo } from '../db/work.ts';
import type { EventLog } from '../events/log.ts';
import { orchestratorChatPrompt, type Threads, waitsFor } from './threads.ts';

export const REPORT_IN = 'report-in';
export const ReportInSchema = z.strictObject({
  tell: z.enum(['page', 'chat', 'keep']),
  say: z.string().trim().min(1).max(600),
});
const json = (v: unknown) => JSON.stringify(v);
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function createReportIn(deps: {
  db: Db;
  store: Store;
  events: EventLog;
  crew: Crew;
  threads: Threads;
  comms: Comms;
}) {
  const { db, store, events, crew } = deps;
  const work = workRepo(db);
  const seen = new Set<string>();
  const queue = new Map<string, Promise<void>>();
  const name = (id: string) => store.agents.get(id)?.name ?? id;

  async function report(projectId: string, itemId: string) {
    const it = work.item(itemId);
    const p = store.projects.get(projectId);
    const director = p ? store.agents.get(p.orchestratorId) : null;
    if (!it || !p || !director || (it.status !== 'done' && it.status !== 'failed')) return;
    const goal = work.goal(it.goalId);
    if (!goal) return;
    /* the owner tells the director: the office shows them walking it over; comms keeps it */
    events.append('project', projectId, {
      type: 'handoff',
      payload: {
        itemId: it.id,
        goalId: it.goalId,
        from: it.agentId,
        to: director.id,
        kind: 'deliver',
        ...(it.note ? { note: clip(it.note, 600) } : {}),
      },
    });
    const items = goal.items;
    const goalDone = items.every((i) => i.status === 'done');
    /* the next step is usually briefed already (dispatch starts it as this one settles) */
    const next = items
      .filter((i, n) => i.status === 'running' || (i.status === 'todo' && !waitsFor(items, n)))
      .map((i) => `${clip(i.text, 120)} (${name(i.agentId)})`);
    const chat = rows<{ sender: string; text: string }>(
      db
        .prepare(
          `SELECT sender, text FROM thread_messages WHERE project_id = ? AND agent_id = ? AND kind = 'text'
           ORDER BY created_at DESC, rowid DESC LIMIT 4`,
        )
        .all(projectId, director.id),
    )
      .reverse()
      .map((m) => `${m.sender === 'user' ? 'User' : 'You'}: ${clip(m.text.replace(/\s+/g, ' '), 200)}`);
    const { value } = await crew.call({
      who: director.name,
      contract: REPORT_IN,
      track: { scope: 'project', ownerId: projectId, agentId: director.id, kind: 'thinking' },
      systemPrompt: orchestratorChatPrompt(director, p.name),
      task: [
        `${name(it.agentId)} reports in: the step ${json(it.text)} ${it.status === 'done' ? 'is done' : 'FAILED'}.`,
        `What they say: ${json(clip(it.note ?? '(nothing)', 1500))}`,
        `The goal: ${json(clip(goal.text, 300))} — ${goalDone ? 'every step is done now' : `${goal.pct}% done`}.`,
        `Whiteboard now: ${json(items.map((i) => ({ step: clip(i.text, 120), owner: name(i.agentId), status: i.status })))}`,
        next.length ? `Working now / up next (briefed automatically): ${json(next)}` : '',
        chat.length ? `Your chat with the user lately:\n${chat.join('\n')}` : '',
        'The whiteboard is already updated. Decide what the user hears:',
        '- "page": they should know now — the whole goal is done, a step failed or is stuck, or they asked to hear about exactly this. Paging buzzes their pager; use it sparingly.',
        '- "chat": a step worth one line in your chat with them (they read it when they look).',
        '- "keep": routine progress the whiteboard already shows — nothing for the user.',
        'Answer with ONE JSON object: {"tell": "page" | "chat" | "keep", "say": "one or two plain sentences: what landed and what happens next (for keep: your own note)"}',
      ]
        .filter(Boolean)
        .join('\n\n'),
      validate: validateWith(ReportInSchema),
    });
    if (value.tell === 'keep') {
      deps.comms.record({
        scope: 'project',
        scopeId: projectId,
        kind: 'note',
        from: director.id,
        to: director.id,
        text: value.say,
        refs: { itemId: it.id, goalId: it.goalId },
      });
      return;
    }
    const line = deps.threads.record(projectId, director.id, {
      sender: 'agent',
      text: value.say,
      goalId: it.goalId,
    });
    if (value.tell === 'page')
      deps.comms.record({
        scope: 'project',
        scopeId: projectId,
        kind: 'page',
        from: director.id,
        to: 'user',
        text: value.say,
        refs: { itemId: it.id, goalId: it.goalId, messageId: line.id },
      });
  }

  const stop = events.bus.subscribeAll((e) => {
    if (e.scope !== 'project' || e.type !== 'checklist.item') return;
    const p = e.payload as { itemId: string; status?: string; parentId?: string };
    if (p.parentId || (p.status !== 'done' && p.status !== 'failed')) return;
    const k = `${p.itemId}:${p.status}`;
    if (seen.has(k)) return;
    seen.add(k);
    /* after the event that triggered it (dispatch finishes settling first), one report at a time per project */
    const prev = queue.get(e.scopeId) ?? Promise.resolve();
    const next = prev
      .then(() => new Promise<void>((ok) => setImmediate(ok)))
      .then(() => report(e.scopeId, p.itemId))
      .catch(() => {
        /* a report-in that can't be decided never breaks the work: the whiteboard already shows it */
      });
    queue.set(e.scopeId, next);
  });

  return {
    stop,
    /** Resolves once every queued report-in for the project is handled (tests). */
    settled: (projectId: string) => queue.get(projectId) ?? Promise.resolve(),
  };
}
export type ReportIn = ReturnType<typeof createReportIn>;
