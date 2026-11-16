/* Design an agent with Tinker (STUDIO LIFE): a saved, continuous chat. Each turn Tinker answers and keeps the whole
   draft — name, role, a one-line summary, the system prompt and the look — up to date; it may research the web
   (WebSearch / WebFetch, shown live as `activity`). The user may also edit the draft by hand between turns.
   Accept adds the agent to the Cast (the same persist as the Agent Creator's designs). Contract `creator-chat`. */
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { z } from 'zod';
import type { Agent } from '../db/agents.ts';
import type { Db } from '../db/connection.ts';
import type { Store } from '../db/store.ts';
import { rows } from '../db/util.ts';
import { AGENT_HATS, AGENT_TOOLS, ANTENNAS, BODIES, FACES, HUES } from '../domain/catalog.ts';
import { AgentDefSchema, agentDefIssues, LookDefSchema } from '../domain/creator.ts';
import { ROLE_NAME_MAX } from '../domain/roles.ts';
import { conflict, invalid, notFound } from '../errors.ts';
import type { Activity } from '../runtime/runner.ts';
import type { Creator } from './creator.ts';
import { CREATOR_ALTITUDE, crewSystemPrompt, json } from './prompts.ts';
import { type Crew, validateWith } from './structured.ts';

export const CREATOR_CHAT = 'creator-chat';
const WEB = ['WebSearch', 'WebFetch'];
const HISTORY = 30;

/** The draft on Tinker's table: an agent definition + a one-line summary for the nameplate. */
export const DraftSchema = AgentDefSchema.extend({ summary: z.string().trim().min(1).max(90) });
export type Draft = z.output<typeof DraftSchema>;
/** Hand edits: any subset, loosely checked (the full check runs on accept). */
export const DraftPatchSchema = z.strictObject({
  name: z.string().trim().min(1).max(40).optional(),
  nick: z.string().trim().min(1).max(30).nullable().optional(),
  role: z.string().trim().min(1).max(ROLE_NAME_MAX).optional(),
  summary: z.string().trim().max(90).optional(),
  prompt: z.string().trim().max(4000).optional(),
  look: LookDefSchema.partial().optional(),
});
const ReplySchema = z.strictObject({
  reply: z.string().trim().min(1).max(2000),
  draft: DraftSchema.nullable(),
});

export type ChatLine = { from: 'user' | 'creator'; text: string };
export type Session = {
  id: string;
  chat: ChatLine[];
  draft: Partial<Draft> | null;
  /** What Tinker is doing right now (a turn in flight): thinking, or looking something up. */
  activity: Activity | null;
  createdAt: string;
  updatedAt: string;
};
type Row = { id: string; chat: string; draft: string | null; created_at: string; updated_at: string };

const EXAMPLE = {
  reply: 'Plain, friendly words to the user: what you made or changed, and at most one question.',
  draft: {
    name: 'A fun, memorable name not in use',
    role: 'An existing role if one fits, else a new short one',
    summary: 'One line (≤ 90 chars) on who they are',
    prompt:
      'Their system prompt in second person: who they are, what they own, how they work, what they never do.',
    look: { hat: '…', tool: '…', body: '…', antenna: '…', face: '…', hue: '…' },
  },
};

/** Hand edits made while Tinker was answering win over his draft (field by field; look slot by slot). */
export function keepHandEdits(
  before: Partial<Draft> | null,
  now: Partial<Draft> | null,
  tinker: Partial<Draft> | null,
): Partial<Draft> | null {
  if (!now || JSON.stringify(now) === JSON.stringify(before)) return tinker;
  const out: Record<string, unknown> = { ...(tinker ?? {}) };
  const b = (before ?? {}) as Record<string, unknown>;
  for (const [k, v] of Object.entries(now)) {
    if (k === 'look') {
      const bl = (b.look ?? {}) as Record<string, unknown>;
      const changed = Object.entries((v ?? {}) as Record<string, unknown>).filter(
        ([slot, x]) => bl[slot] !== x,
      );
      if (changed.length) out.look = { ...((out.look as object) ?? {}), ...Object.fromEntries(changed) };
    } else if (JSON.stringify(b[k]) !== JSON.stringify(v)) out[k] = v;
  }
  return out as Partial<Draft>;
}

export function createCreatorChat(deps: {
  db: Db;
  store: Store;
  crew: Crew;
  creator: Creator;
  /** Where Tinker's research runs (the crew scratch dir). */
  scratchDir: string;
}) {
  const { db, store, crew } = deps;
  const busy = new Map<string, Activity>();
  const now = () => new Date().toISOString();
  const toSession = (r: Row): Session => ({
    id: r.id,
    chat: JSON.parse(r.chat) as ChatLine[],
    draft: r.draft ? (JSON.parse(r.draft) as Partial<Draft>) : null,
    activity: busy.get(r.id) ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  });
  const read = (id: string) => {
    const r = db.prepare('SELECT * FROM creator_sessions WHERE id = ?').get(id) as Row | undefined;
    if (!r) throw notFound('Design chat', id);
    return toSession(r);
  };
  const save = (id: string, chat: ChatLine[], draft: Partial<Draft> | null) => {
    db.prepare('UPDATE creator_sessions SET chat = ?, draft = ?, updated_at = ? WHERE id = ?').run(
      JSON.stringify(chat),
      draft ? JSON.stringify(draft) : null,
      now(),
      id,
    );
    return read(id);
  };
  const tinker = (): Agent => {
    const c = store.agents.records().find((a) => a.kind === 'creator');
    if (!c) throw conflict('The studio has no Agent Creator');
    return store.agents.require(c.id);
  };
  const taken = () => store.agents.records().map((a) => a.name);

  async function say(
    id: string,
    text: string,
  ): Promise<{ reply: string; draft: Partial<Draft> | null; chat: ChatLine[] }> {
    const s = read(id);
    if (busy.has(id)) throw conflict('Tinker is still working on your last message');
    const me = tinker();
    busy.set(id, { kind: 'thinking', label: 'Thinking' });
    mkdirSync(deps.scratchDir, { recursive: true, mode: 0o700 });
    try {
      const { value } = await crew.call({
        who: me.name,
        contract: CREATOR_CHAT,
        systemPrompt: crewSystemPrompt(me, CREATOR_ALTITUDE, true),
        task: [
          'You are designing ONE new agent for the Cast together with the user, in a chat. Keep the whole draft up to date every turn; change only what the user asks for or what clearly follows. Ask at most one short question when something important is unclear — otherwise just make a good draft. You may research the web (WebSearch, WebFetch) when the role needs real-world knowledge (tools, standards, a domain); keep it brief.',
          `Roles already in the studio (reuse one if it fits): ${json(store.roles.list().map((r) => r.name))}`,
          `Agent names already taken: ${json(taken())}`,
          `Look options (one value per slot): ${json({ hat: AGENT_HATS, tool: AGENT_TOOLS, body: BODIES, antenna: ANTENNAS, face: FACES, hue: HUES })}`,
          `The draft now (the user may have edited it by hand): ${s.draft ? json(s.draft) : 'none yet'}`,
          `Conversation so far: ${json(s.chat.slice(-HISTORY))}`,
          `The user now says: ${json(text)}`,
          `Answer with one JSON object: ${json(EXAMPLE)} — "draft" may be null only if you truly can't start yet.`,
        ].join('\n\n'),
        validate: validateWith(ReplySchema, (v) =>
          v.draft
            ? agentDefIssues(v.draft, { agentNames: taken(), teamNames: [], agent: () => null }).map(
                (i) => `draft.${i}`,
              )
            : [],
        ),
        workspace: { cwd: deps.scratchDir, tools: WEB, allowedTools: WEB },
        onEvent: (e) => {
          if (e.kind === 'activity') busy.set(id, e.activity);
        },
      });
      const chat: ChatLine[] = [...s.chat, { from: 'user', text }, { from: 'creator', text: value.reply }];
      const saved = save(id, chat, keepHandEdits(s.draft, read(id).draft, value.draft ?? s.draft));
      return { reply: value.reply, draft: saved.draft, chat: saved.chat };
    } finally {
      busy.delete(id);
    }
  }

  return {
    list: (): Session[] =>
      rows<Row>(db.prepare('SELECT * FROM creator_sessions ORDER BY updated_at DESC').all()).map(toSession),
    get: read,
    /** A new chat; with `text`, its first turn too. */
    async create(text?: string) {
      const id = randomUUID();
      const t = now();
      db.prepare(
        'INSERT INTO creator_sessions (id, chat, draft, created_at, updated_at) VALUES (?, ?, NULL, ?, ?)',
      ).run(id, '[]', t, t);
      if (text) await say(id, text);
      return read(id);
    },
    say,
    /** Hand edits between turns (no AI). */
    edit(id: string, patch: z.output<typeof DraftPatchSchema>): Session {
      const s = read(id);
      const prev = s.draft ?? {};
      const look = patch.look ? { ...(prev.look ?? {}), ...patch.look } : prev.look;
      const { look: _l, nick, ...rest } = patch;
      const draft = {
        ...prev,
        ...rest,
        ...(nick === null ? { nick: undefined } : nick ? { nick } : {}),
        ...(look ? { look } : {}),
      };
      return save(id, s.chat, draft as Partial<Draft>);
    },
    /** Add the draft to the Cast (fully checked), close the chat. */
    accept(id: string): Agent {
      const s = read(id);
      if (busy.has(id)) throw conflict('Tinker is still working — wait for the answer');
      const { summary: _s, ...def } = s.draft ?? {};
      const parsed = AgentDefSchema.safeParse(def);
      if (!parsed.success)
        throw invalid('The draft is not complete yet', {
          issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
        });
      const issues = agentDefIssues(parsed.data, { agentNames: taken(), teamNames: [], agent: () => null });
      if (issues.length) throw conflict(issues[0] as string, { issues });
      const agent = store.tx(() => {
        const minted = deps.creator.persist([
          { kind: 'agent', brief: 'Designed with the user', def: parsed.data },
        ]);
        db.prepare('DELETE FROM creator_sessions WHERE id = ?').run(id);
        return minted.agents[0] as Agent;
      });
      return store.agents.require(agent.id);
    },
    /** An agent's design proposal (HQ's `propose_agent`): a new draft chat in the Cast, for the user to review. */
    propose(by: { name: string; projectName: string }, input: unknown, note?: string): Session {
      const r = DraftSchema.safeParse(input);
      if (!r.success)
        throw new Error(
          `Not yet — fix this and call again:\n${r.error.issues.map((i) => `- ${i.path.join('.') || '(root)'}: ${i.message}`).join('\n')}`,
        );
      const issues = agentDefIssues(r.data, { agentNames: taken(), teamNames: [], agent: () => null });
      if (issues.length) throw new Error(`Not yet — ${issues.join('; ')}`);
      const id = randomUUID();
      const t = now();
      const chat: ChatLine[] = [
        {
          from: 'creator',
          text: `${by.name} sent this design over from ${by.projectName}${note ? ` — ${note}` : ''}. Tell me what to change, or add them to the Cast.`,
        },
      ];
      db.prepare(
        'INSERT INTO creator_sessions (id, chat, draft, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      ).run(id, JSON.stringify(chat), JSON.stringify(r.data), t, t);
      return read(id);
    },
    drop(id: string): void {
      read(id);
      db.prepare('DELETE FROM creator_sessions WHERE id = ?').run(id);
    },
  };
}
export type CreatorChat = ReturnType<typeof createCreatorChat>;

/** propose_agent: HQ agents design new agents for the Cast — they wait as Tinker drafts until the user adds them. */
export function proposeTool(chats: CreatorChat, by: () => { name: string; projectName: string }) {
  return {
    name: 'propose_agent',
    description: `Propose a new agent for the AI Studio Cast: it appears in the Cast as a draft the user reviews with Tinker and adds (or not). Original characters only — no real people's names or likenesses, no characters, names or art from films, games or studios; capture a spirit, not a copy. Shape: ${JSON.stringify(EXAMPLE.draft)}. Look options: ${JSON.stringify({ hat: AGENT_HATS, tool: AGENT_TOOLS, body: BODIES, antenna: ANTENNAS, face: FACES, hue: HUES })}.`,
    inputSchema: {
      type: 'object',
      properties: {
        draft: { type: 'object', description: 'The agent: {name, role, summary, prompt, look}.' },
        note: { type: 'string', description: 'One line for the user: why this agent.' },
      },
      required: ['draft'],
    },
    run: async (a: Record<string, unknown>) => {
      const draft = typeof a.draft === 'string' ? (JSON.parse(a.draft) as unknown) : a.draft;
      const s = chats.propose(by(), draft, typeof a.note === 'string' ? a.note : undefined);
      return `Proposed ${String((s.draft as { name?: string })?.name)} — it waits in the Cast as a draft for the user.`;
    },
  };
}

/** The director hires from chat: propose_agent with its capability line. */
export function hireTool(chats: CreatorChat, by: () => { name: string; projectName: string }) {
  return {
    ...proposeTool(chats, by),
    can: 'hire someone new: propose a new Cast agent (the user reviews the draft with Tinker), when nobody in the Cast fits',
  };
}
