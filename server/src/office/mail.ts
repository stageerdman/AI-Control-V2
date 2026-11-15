/* The mailbox (STUDIO LIFE): mail between projects. Agents write with `send_mail` (when their `canMail` is on);
   HQ is a known address — the project marked HQ in settings (the studio's own repo). Mail to HQ waits under 'hq'
   until there is one. When the user opens an office, its director reads the new mail (crew contract `mail-triage`)
   and on its own: puts it on the whiteboard as a goal, brings it up in the chat, or files it. */
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Comms } from '../comms/comms.ts';
import { crewSystemPrompt, json, ORCHESTRATOR_ALTITUDE } from '../crew/prompts.ts';
import { type Crew, validateWith } from '../crew/structured.ts';
import type { Db } from '../db/connection.ts';
import type { Store } from '../db/store.ts';
import { rows } from '../db/util.ts';
import { conflict, invalid, notFound } from '../errors.ts';
import type { EventLog } from '../events/log.ts';
import type { BridgeTool } from '../room/bridge.ts';

export const HQ = 'hq';
export const MAIL_TRIAGE = 'mail-triage';
export const MAIL_KINDS = ['mail', 'ticket', 'idea'] as const;
export type MailKind = (typeof MAIL_KINDS)[number];
export type MailStatus = 'new' | 'board' | 'discussed' | 'filed';
export type Mail = {
  id: string;
  fromProjectId: string | null;
  fromAgentId: string | null;
  /** A project id, or 'hq'. */
  to: string;
  kind: MailKind;
  subject: string;
  body: string;
  status: MailStatus;
  goalId: string | null;
  note: string | null;
  at: string;
};
type Row = {
  id: string;
  from_project: string | null;
  from_agent: string | null;
  to_project: string;
  kind: MailKind;
  subject: string;
  body: string;
  status: MailStatus;
  goal_id: string | null;
  note: string | null;
  at: string;
};
const toMail = (r: Row): Mail => ({
  id: r.id,
  fromProjectId: r.from_project,
  fromAgentId: r.from_agent,
  to: r.to_project,
  kind: r.kind,
  subject: r.subject,
  body: r.body,
  status: r.status,
  goalId: r.goal_id,
  note: r.note,
  at: r.at,
});

export const SendSchema = z.strictObject({
  to: z.string().trim().min(1).max(200),
  subject: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(8000),
  kind: z.enum(MAIL_KINDS).default('mail'),
});
export const TriageSchema = z.strictObject({
  decisions: z
    .array(
      z.strictObject({
        mailId: z.string().min(1).max(80),
        action: z.enum(['board', 'discuss', 'file']),
        goal: z.string().trim().min(1).max(2000).optional(),
        say: z.string().trim().min(1).max(600),
      }),
    )
    .max(20),
  summary: z.string().trim().min(1).max(600),
});

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function createMail(deps: {
  db: Db;
  store: Store;
  events: EventLog;
  crew: Crew;
  comms?: Comms;
  /** The HQ project's id (settings), or null. */
  hq: () => string | null;
  /** Put a goal on the whiteboard (dispatch, as from chat). */
  startWork: (projectId: string, goal: string) => Promise<{ id: string }>;
  /** A line in the user's thread with the director. */
  say: (projectId: string, directorId: string, text: string, goalId?: string | null) => void;
}) {
  const { db, store, events, crew } = deps;
  const triaging = new Set<string>();

  const isHq = (projectId: string) => deps.hq() === projectId;
  const inboxOf = (projectId: string) =>
    rows<Row>(
      db
        .prepare(
          `SELECT * FROM mail WHERE to_project = ?${isHq(projectId) ? ` OR to_project = '${HQ}'` : ''} ORDER BY at DESC, rowid DESC`,
        )
        .all(projectId),
    ).map(toMail);
  const get = (id: string) => {
    const r = db.prepare('SELECT * FROM mail WHERE id = ?').get(id) as Row | undefined;
    return r ? toMail(r) : null;
  };
  /** Where a mail lands (for its events): its project, or HQ's. */
  const home = (m: Pick<Mail, 'to'>) => (m.to === HQ ? deps.hq() : m.to);
  const changed = (m: Mail, change: 'arrived' | 'triaged' | 'filed' | 'reopened') => {
    const p = home(m);
    if (p && store.projects.get(p))
      events.append('project', p, {
        type: 'mail.changed',
        payload: { mailId: m.id, change, status: m.status },
      });
  };
  const setStatus = (
    id: string,
    status: MailStatus,
    extra: { goalId?: string | null; note?: string | null } = {},
  ) => {
    db.prepare(
      'UPDATE mail SET status = ?, goal_id = COALESCE(?, goal_id), note = COALESCE(?, note) WHERE id = ?',
    ).run(status, extra.goalId ?? null, extra.note ?? null, id);
    return get(id) as Mail;
  };

  /** 'HQ', a project's name or id → the stored address. */
  function resolve(to: string, fromProjectId: string | null): string {
    const k = to.trim().toLowerCase();
    const hq = deps.hq();
    if (
      k === HQ ||
      k === 'ai studio' ||
      (hq && (k === hq || store.projects.get(hq)?.name.toLowerCase() === k))
    )
      return HQ;
    const p = store.projects.list().find((x) => x.id === to.trim() || x.name.toLowerCase() === k);
    if (!p) throw invalid(`No project called '${to}'. Use mail_directory for the addresses.`);
    if (p.id === fromProjectId) throw invalid('That is this project — talk to the team instead.');
    return p.id;
  }

  function send(
    from: { projectId: string | null; agentId: string | null },
    input: z.input<typeof SendSchema>,
  ): Mail {
    const m = SendSchema.parse(input);
    const to = resolve(m.to, from.projectId);
    const id = randomUUID();
    db.prepare(
      'INSERT INTO mail (id, from_project, from_agent, to_project, kind, subject, body, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(id, from.projectId, from.agentId, to, m.kind, m.subject, m.body, new Date().toISOString());
    const mail = get(id) as Mail;
    if (from.projectId)
      deps.comms?.record({
        scope: 'project',
        scopeId: from.projectId,
        kind: 'mail',
        from: from.agentId,
        to: to === HQ ? 'HQ' : to,
        text: `[${m.kind}] ${m.subject}\n\n${m.body}`,
        refs: { mailId: id },
      });
    changed(mail, 'arrived');
    return mail;
  }

  function directory(fromProjectId: string | null) {
    const hq = deps.hq();
    return [
      { address: 'HQ', about: 'The AI Studio itself — tickets, requests and ideas to improve the studio.' },
      ...store.projects
        .list()
        .filter((p) => p.id !== fromProjectId && p.id !== hq && p.status !== 'archived')
        .map((p) => ({ address: p.name, about: clip(p.note || '', 160) })),
    ];
  }

  /** The director reads the new mail and acts on it (in the background). */
  async function triage(projectId: string): Promise<void> {
    const p = store.projects.require(projectId);
    const fresh = inboxOf(projectId)
      .filter((m) => m.status === 'new')
      .slice(0, 20);
    if (!fresh.length || triaging.has(projectId)) return;
    triaging.add(projectId);
    const director = store.agents.require(p.orchestratorId);
    const status = (label?: string) =>
      events.append('project', projectId, {
        type: 'agent.status',
        payload: label
          ? { agentId: director.id, status: 'working', activity: { kind: 'mail', label } }
          : { agentId: director.id, status: 'idle' },
      });
    const sender = (m: Mail) =>
      [
        m.fromAgentId ? store.agents.get(m.fromAgentId)?.name : 'the user',
        m.fromProjectId ? store.projects.get(m.fromProjectId)?.name : null,
      ]
        .filter(Boolean)
        .join(' from ');
    const say = (text: string, goalId?: string | null) => {
      try {
        deps.say(projectId, director.id, text, goalId);
      } catch {
        /* a chat line never stops the triage */
      }
    };
    try {
      status('Reading the mail');
      const { value } = await crew.call({
        who: director.name,
        contract: MAIL_TRIAGE,
        track: { scope: 'project', ownerId: projectId, agentId: director.id, kind: 'thinking' },
        systemPrompt: crewSystemPrompt(director, ORCHESTRATOR_ALTITUDE),
        task: [
          `You direct "${p.name}"${isHq(projectId) ? ' — this is HQ, the AI Studio itself: mail here is about improving the studio' : ''}. New mail arrived:`,
          json(
            fresh.map((m) => ({
              mailId: m.id,
              from: sender(m),
              kind: m.kind,
              subject: m.subject,
              body: clip(m.body, 3000),
            })),
          ),
          'Decide each one on your own: "board" = it is clear, useful work for this project — write the goal for the whiteboard; "discuss" = it needs the user or the team to weigh in — say what you would bring up; "file" = nothing to do (say why in a few words).',
          `Answer with one JSON object: ${json({ decisions: [{ mailId: '<id>', action: 'board | discuss | file', goal: '<only for board: the goal, plain words>', say: 'one or two sentences for the user' }], summary: 'one line: what you did with the mail' })}`,
        ].join('\n\n'),
        validate: validateWith(TriageSchema, (v) =>
          v.decisions
            .filter((d) => !fresh.some((m) => m.id === d.mailId))
            .map((d) => `decisions: unknown mailId '${d.mailId}'`),
        ),
      });
      for (const d of value.decisions) {
        const m = fresh.find((x) => x.id === d.mailId) as Mail;
        if (d.action === 'board') {
          try {
            const goal = await deps.startWork(projectId, d.goal ?? m.subject);
            deps.say(projectId, director.id, `📬 ${m.subject} — ${d.say}`, goal.id);
            changed(setStatus(m.id, 'board', { goalId: goal.id, note: d.say }), 'triaged');
          } catch (e) {
            deps.say(
              projectId,
              director.id,
              `📬 ${m.subject} — ${d.say} (I couldn’t put it on the board: ${(e as Error).message})`,
            );
            changed(setStatus(m.id, 'discussed', { note: d.say }), 'triaged');
          }
        } else if (d.action === 'discuss') {
          deps.say(projectId, director.id, `📬 ${m.subject} (from ${sender(m)}) — ${d.say}`);
          changed(setStatus(m.id, 'discussed', { note: d.say }), 'triaged');
        } else changed(setStatus(m.id, 'filed', { note: d.say }), 'triaged');
      }
      deps.say(projectId, director.id, value.summary);
    } finally {
      triaging.delete(projectId);
      status();
    }
  }

  return {
    send,
    directory,
    triage,
    inbox: (projectId: string) => {
      store.projects.require(projectId);
      return inboxOf(projectId);
    },
    sent: (projectId: string) =>
      rows<Row>(
        db.prepare('SELECT * FROM mail WHERE from_project = ? ORDER BY at DESC, rowid DESC').all(projectId),
      ).map(toMail),
    get(projectId: string, mailId: string): Mail {
      const m = get(mailId);
      if (!m || (home(m) !== projectId && m.fromProjectId !== projectId)) throw notFound('Mail', mailId);
      return m;
    },
    /** The user files a letter or puts it back as new. */
    setStatus(projectId: string, mailId: string, status: 'filed' | 'new'): Mail {
      const m = this.get(projectId, mailId);
      if (home(m) !== projectId) throw conflict('Only the receiving office can file a letter');
      const next = setStatus(m.id, status);
      changed(next, status === 'filed' ? 'filed' : 'reopened');
      return next;
    },
    busy: (projectId: string) => triaging.has(projectId),
    /** send_mail + mail_directory for an agent run here (only when the agent may mail). */
    tools(projectId: string, agentId: string): BridgeTool[] {
      if (!store.agents.get(agentId)?.canMail) return [];
      return [
        {
          name: 'send_mail',
          description:
            'Send mail to another project or to HQ (the AI Studio itself). For findings that affect another project, or a ticket / idea to improve the studio. Their director reads it and decides. Self-contained: they know nothing of your work.',
          inputSchema: {
            type: 'object',
            properties: {
              to: { type: 'string', description: '"HQ" or a project name from mail_directory.' },
              subject: { type: 'string', description: 'A short subject line.' },
              body: { type: 'string', description: 'The letter, in plain words.' },
              kind: {
                type: 'string',
                enum: [...MAIL_KINDS],
                description: 'mail (default), ticket (a problem), idea (an improvement).',
              },
            },
            required: ['to', 'subject', 'body'],
          },
          run: async (a) => {
            const r = SendSchema.safeParse(a);
            if (!r.success)
              throw new Error(
                `Not sent: ${r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
              );
            const m = send({ projectId, agentId }, r.data);
            return `Sent to ${m.to === HQ ? 'HQ' : (store.projects.get(m.to)?.name ?? m.to)}.`;
          },
        },
        {
          name: 'mail_directory',
          description: 'Who you can mail: HQ and the other projects in the studio, with a line about each.',
          inputSchema: { type: 'object', properties: {} },
          run: async () => JSON.stringify(directory(projectId)),
        },
      ];
    },
  };
}
export type MailDesk = ReturnType<typeof createMail>;
