/* The comms log (STUDIO LIFE): every message between agents, kept whole, so another AI can analyse how the studio
   talks later. Calls, approvals and answers are recorded where they happen (room.ts), mail and desk notes too;
   handoffs, reviews and captains' splits are picked up from the event log. Secrets are masked before storing. */
import type { Db } from '../db/connection.ts';
import { rows } from '../db/util.ts';
import type { EventLog } from '../events/log.ts';
import { redactSecrets } from '../events/redact.ts';

export type CommKind =
  | 'call' // someone asks a fellow agent for a hand (call_agent)
  | 'answer' // the fellow agent's answer
  | 'allow' // asking the captain / orchestrator to bring someone in, and their verdict
  | 'handoff' // work changes hands (review, rework, delegate, deliver…)
  | 'review' // a reviewer's verdict + notes
  | 'split' // a captain hands members their sub-tasks
  | 'mail' // inter-project mail
  | 'desk-note' // an agent's note to its future self before it forgets
  | 'brief'; // the user's brief to an agent they brought in
export type CommScope = 'project' | 'draft' | 'studio';
export type Comm = {
  id: number;
  scope: CommScope;
  scopeId: string;
  kind: CommKind;
  from: string | null;
  to: string | null;
  text: string;
  refs: Record<string, unknown>;
  at: string;
};
type Row = {
  id: number;
  scope: CommScope;
  scope_id: string;
  kind: CommKind;
  from_id: string | null;
  to_id: string | null;
  text: string;
  refs: string;
  at: string;
};
const toComm = (r: Row): Comm => ({
  id: r.id,
  scope: r.scope,
  scopeId: r.scope_id,
  kind: r.kind,
  from: r.from_id,
  to: r.to_id,
  text: r.text,
  refs: JSON.parse(r.refs),
  at: r.at,
});

export function createComms(deps: { db: Db; events: EventLog; secretValues?: () => string[] }) {
  const { db, events } = deps;

  function record(c: {
    scope: CommScope;
    scopeId: string;
    kind: CommKind;
    from?: string | null;
    to?: string | null;
    text: string;
    refs?: Record<string, unknown>;
  }): void {
    const text = redactSecrets(c.text, deps.secretValues?.() ?? []).value;
    db.prepare(
      'INSERT INTO comms (scope, scope_id, kind, from_id, to_id, text, refs, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(
      c.scope,
      c.scopeId,
      c.kind,
      c.from ?? null,
      c.to ?? null,
      text,
      JSON.stringify(c.refs ?? {}),
      new Date().toISOString(),
    );
  }

  /* what the dispatch flow already says in events */
  const stop = events.bus.subscribeAll((e) => {
    if (e.scope !== 'project') return;
    const p = e.payload as Record<string, unknown>;
    const base = { scope: 'project' as const, scopeId: e.scopeId };
    try {
      if (e.type === 'handoff')
        record({
          ...base,
          kind: 'handoff',
          from: String(p.from),
          to: String(p.to),
          text: `${String(p.kind)}${p.note ? `: ${String(p.note)}` : ''}`,
          refs: { itemId: p.itemId, goalId: p.goalId, handoff: p.kind },
        });
      else if (e.type === 'review.approved' || e.type === 'review.changes')
        record({
          ...base,
          kind: 'review',
          from: String(p.reviewerId),
          text: `${e.type === 'review.approved' ? 'approved' : 'changes'} (${String(p.gate)})${p.notes ? `: ${String(p.notes)}` : ''}`,
          refs: { itemId: p.itemId, goalId: p.goalId },
        });
      else if (e.type === 'team.split')
        for (const t of (p.subtasks as { agentId: string; text: string }[]) ?? [])
          record({
            ...base,
            kind: 'split',
            from: String(p.captainId),
            to: t.agentId,
            text: t.text,
            refs: { itemId: p.itemId, goalId: p.goalId },
          });
    } catch {
      /* the log never breaks the work */
    }
  });

  const query = (where: string, args: (string | number)[], limit: number) =>
    rows<Row>(db.prepare(`SELECT * FROM comms ${where} ORDER BY id LIMIT ?`).all(...args, limit)).map(toComm);

  return {
    record,
    stop,
    /** One stream (a project, a draft), oldest first, after `since` (an id). */
    list: (scope: CommScope, scopeId: string, since = 0, limit = 1000) =>
      query('WHERE scope = ? AND scope_id = ? AND id > ?', [scope, scopeId, since], Math.min(limit, 10_000)),
    /** Everything the studio said, oldest first. */
    all: (since = 0, limit = 1000) => query('WHERE id > ?', [since], Math.min(limit, 10_000)),
    /** The latest `n` of a stream (or everywhere), oldest first — what an analyst agent reads. */
    latest(scope: CommScope | null, scopeId: string | null, n = 100): Comm[] {
      const r = scope
        ? rows<Row>(
            db
              .prepare('SELECT * FROM comms WHERE scope = ? AND scope_id = ? ORDER BY id DESC LIMIT ?')
              .all(scope, scopeId ?? '', n),
          )
        : rows<Row>(db.prepare('SELECT * FROM comms ORDER BY id DESC LIMIT ?').all(n));
      return r.map(toComm).reverse();
    },
  };
}
export type Comms = ReturnType<typeof createComms>;
