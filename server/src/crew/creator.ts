/* The Agent Creator (v5): designs what the Cast lacks — an agent, or a whole team with
   its emblem, name and captain — and adds it to the Cast for every project to reuse.

   Contracts: `mint-agent` → AgentDef, `mint-team` → TeamDef (src/domain/creator.ts).
   Accepting a plan (`POST /drafts/:id/accept`) designs every brief first (slow, outside
   any transaction), then persists them all + the resolved plan in ONE transaction: either
   the whole plan lands in the Cast, or nothing does. */
import type { Agent } from '../db/agents.ts';
import { castView } from '../db/drafts.ts';
import type { Role } from '../db/roles.ts';
import type { Store } from '../db/store.ts';
import type { Team } from '../db/teams.ts';
import {
  AGENT_HATS,
  AGENT_TOOLS,
  ANTENNAS,
  BODIES,
  EMBLEM_IDS,
  FACES,
  HAT_DECAL,
  HUES,
} from '../domain/catalog.ts';
import { resolvePlaceholders } from '../domain/collaboration.ts';
import {
  type AgentDef,
  AgentDefSchema,
  agentDefIssues,
  type MintContext,
  NEW_PER_TEAM,
  type TeamDef,
  TeamDefSchema,
  teamDefIssues,
} from '../domain/creator.ts';
import { assertPlan, type Plan } from '../domain/plan.ts';
import { TEAM_MAX } from '../domain/teams.ts';
import { conflict } from '../errors.ts';
import type { EventLog } from '../events/log.ts';
import type { BridgeTool } from '../room/bridge.ts';
import { CREATOR_TOOLS } from '../room/context.ts';
import type { Room } from '../room/room.ts';
import { CREATOR_ALTITUDE, crewSystemPrompt, json } from './prompts.ts';
import { type Crew, type Validate, validateWith } from './structured.ts';

export const MINT_AGENT = 'mint-agent';
export const MINT_TEAM = 'mint-team';

const LOOK_OPTIONS = {
  hat: AGENT_HATS,
  tool: AGENT_TOOLS,
  body: BODIES,
  antenna: ANTENNAS,
  face: FACES,
  hue: HUES,
};
const AGENT_EXAMPLE = {
  name: 'A fun, memorable name not in use',
  nick: 'Short name (optional)',
  role: 'An existing role name if one fits, else a new short one',
  prompt:
    'The agent’s system prompt in second person: who they are, what they own, how they work, what they never do.',
  look: { hat: '…', tool: '…', body: '…', antenna: '…', face: '…', hue: '…' },
};
const TEAM_EXAMPLE = {
  name: 'The … (a fun team name not in use)',
  blurb: 'One line: what the team is for.',
  instr: 'What the team does: its mission and working rules.',
  code: 'How the team codes: folders, conventions, what it touches and what it leaves alone.',
  emblem: '<emblem id>',
  color: '<colour>',
  members: [
    { agentId: '<an existing agent id>', job: 'their job on this team' },
    { newAgent: AGENT_EXAMPLE, job: 'their job on this team' },
  ],
  captain: '<an agentId from members, or the name of one of the new agents>',
};

export type Design =
  | { kind: 'agent'; brief: string; def: AgentDef }
  | { kind: 'team'; brief: string; def: TeamDef };
export type Minted = { roles: Role[]; agents: Agent[]; teams: Team[] };

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Fellow agents a creator may ask for a costume (a designer's eye). */
const DESIGNERS = /design|ux|ui\b|art|look|costume|brand/i;

export function createCreator(deps: { store: Store; events: EventLog; crew: Crew; room?: Room }) {
  const { store, events, crew, room } = deps;
  const creator = () => {
    const c = store.agents.records().find((a) => a.kind === 'creator');
    if (!c) throw conflict('The studio has no Agent Creator'); // unreachable while the cast rules hold
    return store.agents.require(c.id);
  };
  const running = new Set<string>();

  /** Names already in use: the Cast plus earlier designs of the same accept. */
  const contextFor = (earlier: Design[], specialists: readonly string[] = []): MintContext => {
    const view = castView(store.agents, store.teams);
    const newAgents = earlier.flatMap((d) =>
      d.kind === 'agent'
        ? [d.def.name]
        : d.def.members.flatMap((m) => ('newAgent' in m ? [m.newAgent.name] : [])),
    );
    return {
      agentNames: [...store.agents.records().map((a) => a.name), ...newAgents],
      teamNames: [
        ...store.teams.list().map((t) => t.name),
        ...earlier.flatMap((d) => (d.kind === 'team' ? [d.def.name] : [])),
      ],
      agent: (id) => view.agent(id),
      specialists,
    };
  };

  /** studio_catalog: everything a design may use (also offered to the helpers the creator calls). */
  const catalog = (): BridgeTool => ({
    name: 'studio_catalog',
    description:
      'The studio catalogue for designing agents and teams: look slots (one value per slot), roles, agent and team names already taken, team emblems and colours.',
    inputSchema: { type: 'object', properties: {} },
    run: async () =>
      JSON.stringify({
        look: LOOK_OPTIONS,
        roles: store.roles.list().map((r) => r.name),
        agentNamesTaken: store.agents.records().map((a) => a.name),
        teamNamesTaken: store.teams.list().map((t) => t.name),
        emblems: EMBLEM_IDS,
        colours: HUES,
      }),
  });
  room?.setCatalog(catalog());

  /** create_agent / create_team: checked at once (shape + studio rules), staged until the plan is accepted. */
  const stager = <T>(kind: 'agent' | 'team', check: Validate<T>) => {
    let staged: T | null = null;
    const tool: BridgeTool = {
      name: kind === 'agent' ? 'create_agent' : 'create_team',
      description:
        kind === 'agent'
          ? `Create the agent: ${json(AGENT_EXAMPLE)}. Checked at once — fix what it lists and call again. Joins the Cast when the plan is accepted.`
          : `Create the team: ${json(TEAM_EXAMPLE)}. Checked at once — fix what it lists and call again. Joins the Cast when the plan is accepted.`,
      inputSchema: { type: 'object', additionalProperties: true },
      run: async (args) => {
        const v = check(args);
        if (!v.ok)
          throw new Error(`Not yet — fix this and call again:\n${v.issues.map((i) => `- ${i}`).join('\n')}`);
        staged = v.value;
        const name = (v.value as { name: string }).name;
        return `Created ${name} — they join the Cast when the plan is accepted. Now answer with the same design as the JSON object.`;
      },
    };
    /** The staged design wins; else the answer itself (the JSON contract, as before). */
    const validate: Validate<T> = (raw) => (staged ? { ok: true, value: staged } : check(raw));
    return { tool, validate };
  };

  /** One design, by the Agent Creator. `scope` is where its progress shows (the draft's stream). */
  async function design(
    kind: 'agent' | 'team',
    brief: string,
    opts: {
      project: { name: string; about: string };
      earlier?: Design[];
      specialists?: readonly string[];
      onTokens?: (i: number, o: number) => void;
      /** The draft whose setup time this is (the work clock). */
      draftId?: string;
    },
  ): Promise<Design> {
    const me = creator();
    const ctx = contextFor(opts.earlier ?? [], opts.specialists);
    const common = [
      `Brief from the orchestrator: ${json(brief)}`,
      `The project that needs it (context only — design for reuse across projects): ${json(opts.project)}`,
      `Roles already in the studio (reuse one if it fits, else name a new one): ${json(store.roles.list().map((r) => r.name))}`,
      `Agent names already taken: ${json(ctx.agentNames)}`,
      `Look options (pick one value per slot; give mates on a team different looks): ${json(LOOK_OPTIONS)}`,
    ];
    const track = opts.draftId
      ? ({ scope: 'draft', ownerId: opts.draftId, agentId: me.id, kind: 'setup' } as const)
      : undefined;
    const onEvent = (e: { kind: string; input?: number; output?: number }) => {
      if (e.kind === 'tokens') opts.onTokens?.(e.input ?? 0, e.output ?? 0);
    };
    /* AGENT MCP: in a setup room the creator works through tools and may call a fellow agent */
    const roomTools =
      room && opts.draftId
        ? room.tools({ scope: 'draft', ownerId: opts.draftId, agentId: me.id, chain: [] })
        : null;
    const designers = store.agents
      .list()
      .filter((a) => a.kind === 'agent' && DESIGNERS.test(a.role))
      .map((a) => ({ name: a.name, role: a.role }));
    const toolsLine = roomTools
      ? [
          `${CREATOR_TOOLS}`,
          ...(designers.length
            ? [`Fellow agents with a designer's eye (call_agent): ${json(designers)}`]
            : []),
        ]
      : [];
    const system = crewSystemPrompt(me, CREATOR_ALTITUDE, !!roomTools);
    if (kind === 'agent') {
      const s = stager(
        'agent',
        validateWith(AgentDefSchema, (d) => agentDefIssues(d, contextFor(opts.earlier ?? []))),
      );
      const { value } = await crew.call({
        who: me.name,
        contract: MINT_AGENT,
        ...(track ? { track } : {}),
        systemPrompt: system,
        task: [
          ...common,
          ...toolsLine,
          `Design ONE agent. Answer with one JSON object shaped like this: ${json(AGENT_EXAMPLE)}`,
        ].join('\n\n'),
        validate: s.validate,
        ...(roomTools ? { tools: [...roomTools, catalog(), s.tool] } : {}),
        onEvent,
      });
      return { kind, brief, def: value };
    }
    const s = stager(
      'team',
      validateWith(TeamDefSchema, (d) => teamDefIssues(d, contextFor(opts.earlier ?? [], opts.specialists))),
    );
    const { value } = await crew.call({
      who: me.name,
      contract: MINT_TEAM,
      ...(track ? { track } : {}),
      systemPrompt: system,
      ...(roomTools ? { tools: [...roomTools, catalog(), s.tool] } : {}),
      task: [
        ...common,
        `Team names already taken: ${json(ctx.teamNames)}`,
        `Cast agents you may put on the team (id, name, role): ${json(
          store.agents
            .list()
            .filter((a) => a.kind === 'agent' && !opts.specialists?.includes(a.id))
            .map((a) => ({ id: a.id, name: a.name, role: a.role })),
        )}`,
        `Emblems: ${json(EMBLEM_IDS)}. Colours: ${json(HUES)}. Prefer an emblem and colour no other team uses: ${json(
          store.teams.list().map((t) => ({ emblem: t.emblem, color: t.color })),
        )}`,
        ...toolsLine,
        `Design ONE team of 2–${TEAM_MAX} members (at most ${NEW_PER_TEAM} new agents; reuse Cast agents where they fit) with exactly one captain from its members. Answer with one JSON object shaped like this: ${json(TEAM_EXAMPLE)}`,
      ].join('\n\n'),
      validate: s.validate,
      onEvent,
    });
    return { kind, brief, def: value };
  }

  /** Persist designs (call inside store.tx). Roles are reused by name or created; every B1 rule applies again. */
  function persist(designs: Design[]): Minted & { ids: string[] } {
    const out: Minted & { ids: string[] } = { roles: [], agents: [], teams: [], ids: [] };
    const makeAgent = (def: AgentDef): Agent => {
      let role = store.roles.findByName(def.role);
      if (!role) {
        role = store.roles.create(def.role);
        out.roles.push(role);
      }
      const decal = HAT_DECAL[def.look.hat];
      const a = store.agents.create({
        kind: 'agent',
        name: def.name,
        ...(def.nick ? { nick: def.nick } : {}),
        roleId: role.id,
        prompt: def.prompt,
        look: { ...def.look, ...(decal && decal !== 'none' ? { decal } : {}) },
      });
      out.agents.push(a);
      return a;
    };
    for (const d of designs) {
      if (d.kind === 'agent') {
        out.ids.push(makeAgent(d.def).id);
        continue;
      }
      let captainId: string | null = null;
      const members = d.def.members.map((m) => {
        const id = 'agentId' in m ? m.agentId : makeAgent(m.newAgent).id;
        const isCaptain =
          'agentId' in m
            ? m.agentId === d.def.captain
            : m.newAgent.name.toLowerCase() === d.def.captain.toLowerCase();
        if (isCaptain) captainId = id;
        return { agentId: id, instr: m.job };
      });
      const t = store.teams.create({
        name: d.def.name,
        blurb: d.def.blurb,
        instr: d.def.instr,
        code: d.def.code,
        emblem: d.def.emblem,
        color: d.def.color,
        members,
        captainId,
      });
      out.teams.push(t);
      out.ids.push(t.id);
    }
    return out;
  }

  const sayCreated = (d: Design, minted: Minted): string => {
    if (d.kind === 'agent') {
      const a = minted.agents.find((x) => x.name === d.def.name);
      return `Done — meet ${d.def.name}, ${a?.role ?? d.def.role}. They're in the Cast now, so any project can use them.`;
    }
    const t = minted.teams.find((x) => x.name === d.def.name);
    const names = (t?.members ?? []).map((m) => store.agents.get(m.agentId)?.name ?? m.agentId);
    const captain = t?.captainId ? (store.agents.get(t.captainId)?.name ?? t.captainId) : '';
    return `Here's ${d.def.name}: ${names.join(', ')} — ${captain} captains. They're in the Cast now, so any project can use them.`;
  };

  return {
    design,
    persist,

    /** Accept the draft's plan: mint every brief, resolve the plan to real ids — all or nothing. */
    async accept(draftId: string): Promise<{ plan: Plan; minted: Minted }> {
      const draft = store.drafts.require(draftId);
      const plan = draft.plan;
      if (!plan) throw conflict('There is no plan yet — chat with the orchestrator first');
      assertPlan(plan, castView(store.agents, store.teams)); // the Cast may have changed since the chat
      if (running.has(draftId)) throw conflict('The Agent Creator is already working on this plan');
      running.add(draftId);
      const me = creator();
      const status = (s: 'working' | 'idle') =>
        events.append('draft', draftId, {
          type: 'agent.status',
          payload: {
            agentId: me.id,
            status: s,
            ...(s === 'working' ? { activity: { kind: 'designing', label: 'Designing for the Cast' } } : {}),
          },
        });
      const briefs = [
        ...plan.newAgents.map((b) => ({ kind: 'agent' as const, brief: b.brief })),
        ...plan.newTeams.map((b) => ({ kind: 'team' as const, brief: b.brief })),
      ];
      try {
        if (briefs.length) {
          /* AGENT MCP: the orchestrator calls the Agent Creator into the room */
          const scope = { scope: 'draft' as const, ownerId: draftId };
          if (room && draft.orchestratorId) {
            const what = [
              plan.newAgents.length
                ? `${plan.newAgents.length === 1 ? 'a new agent' : `${plan.newAgents.length} new agents`}`
                : '',
              plan.newTeams.length
                ? `${plan.newTeams.length === 1 ? 'a new team' : `${plan.newTeams.length} new teams`}`
                : '',
            ]
              .filter(Boolean)
              .join(' and ');
            if (room.join(scope, me.id, draft.orchestratorId, `design ${what}`))
              room.say(
                scope,
                draft.orchestratorId,
                `${me.nick || me.name}, could you design ${what} for this project?`,
                me.id,
              );
          }
          status('working');
        }
        const designs: Design[] = [];
        for (const b of briefs)
          designs.push(
            await design(b.kind, b.brief, {
              project: { name: draft.name, about: draft.about },
              earlier: designs,
              draftId,
              specialists: plan.specialists.map((s) => s.agentId),
              onTokens: (input, output) =>
                events.append('draft', draftId, {
                  type: 'tokens',
                  payload: { agentId: me.id, input, output },
                }),
            }),
          );
        const { minted, resolved, chat } = store.tx(() => {
          const m = persist(designs);
          const ids = m.ids;
          const nAgents = plan.newAgents.length;
          const resolved: Plan = {
            teams: [
              ...plan.teams,
              ...plan.newTeams.map((b, i) => ({
                teamId: ids[nAgents + i] as string,
                why: clip(b.brief, 500),
              })),
            ],
            specialists: [
              ...plan.specialists,
              ...plan.newAgents.map((b, i) => ({ agentId: ids[i] as string, why: clip(b.brief, 500) })),
            ],
            newAgents: [],
            newTeams: [],
            summary: plan.summary,
            ...(plan.collaboration
              ? {
                  collaboration: resolvePlaceholders(plan.collaboration, {
                    agents: ids.slice(0, nAgents) as string[],
                    teams: ids.slice(nAgents) as string[],
                  }),
                }
              : {}),
          };
          assertPlan(resolved, castView(store.agents, store.teams));
          const before = store.drafts.require(draftId).chat; // the room may have talked meanwhile
          const chat = [
            ...before,
            ...designs.map((d) => ({ from: 'creator' as const, text: sayCreated(d, m) })),
          ];
          store.drafts.update(draftId, { plan: resolved, chat });
          return {
            minted: { roles: m.roles, agents: m.agents, teams: m.teams },
            resolved,
            chat: chat.slice(before.length),
          };
        });
        /* events only after the commit (a rolled-back mint must not be announced) */
        const created = (kind: 'agent' | 'team' | 'role', id: string, name: string) =>
          events.append('draft', draftId, { type: 'cast.created', payload: { kind, id, name, by: me.id } });
        for (const r of minted.roles) created('role', r.id, r.name);
        for (const a of minted.agents) created('agent', a.id, a.name);
        for (const t of minted.teams) created('team', t.id, t.name);
        for (const m of chat)
          events.append('draft', draftId, {
            type: 'chat.message',
            payload: { from: 'creator', agentId: me.id, text: m.text },
          });
        if (designs.length)
          events.append('draft', draftId, {
            type: 'plan.changed',
            payload: {
              summary: resolved.summary,
              teamIds: resolved.teams.map((t) => t.teamId),
              agentIds: resolved.specialists.map((s) => s.agentId),
              newAgents: 0,
              newTeams: 0,
            },
          });
        return { plan: resolved, minted };
      } finally {
        running.delete(draftId);
        if (briefs.length && store.drafts.record(draftId)) status('idle');
      }
    },
  };
}
export type Creator = ReturnType<typeof createCreator>;
