/* The director's team tools: bring Cast people onto the project, and rebuild its teams. Thin adapters over the
   staffing and rebuild services the Rearrange screen uses. They run during the director's turn, so it knows who
   joined, or why not, before it replies. A rebuild that needs the user's yes comes back as a confirm card: the
   tool hands the card to the turn (`card`), and the thread shows it under the director's reply. */
import type { z } from 'zod';
import { invalid } from '../errors.ts';
import type { CapableTool } from '../room/bridge.ts';
import { RebuildSchema } from './rebuild.ts';
import type { Offer, Rebuilds } from './rebuild-service.ts';
import { type Staffing, StaffSchema } from './staffing.ts';

export type TeamServices = { staffing: Staffing; rebuilds: Rebuilds };
/** What a tool may hand to the turn it runs in: the rebuild card shown under the reply. */
export type TurnHooks = { card: (offer: Offer) => void };

const NAME = { type: 'string' };
const NAMES = { type: 'array', items: NAME };

/** Tool arguments → the service's input, or a refusal that says which field is wrong. */
function parsed<S extends z.ZodType>(schema: S, args: unknown): z.output<S> {
  const r = schema.safeParse(args);
  if (r.success) return r.data;
  throw invalid(r.error.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`).join('; '));
}

export function teamTools(
  s: TeamServices,
  projectId: string,
  directorId: string,
  turn: TurnHooks,
): CapableTool[] {
  function staffProject(a: unknown): string {
    const { added, teamNames } = s.staffing.apply(projectId, parsed(StaffSchema, a), directorId);
    const teams = teamNames.length ? ` Teams on the project now include: ${teamNames.join(', ')}.` : '';
    if (!added.length) return `Nobody new: they were all on the project already.${teams}`;
    return `Joined the project: ${added.map((x) => x.name).join(', ')}.${teams}`;
  }

  function rebuildTeams(a: unknown): string {
    const offer = s.rebuilds.plan(projectId, parsed(RebuildSchema, a));
    if (offer.needsConfirm) {
      turn.card(offer);
      return 'The plan is on a card under your reply; nothing has changed yet. Say it in one line and end with "confirm below" — never say it is done.';
    }
    const done = s.rebuilds.apply(offer.planId, {}, directorId);
    turn.card({ ...offer, card: done.card, undoToken: done.undoToken, summary: done.summary });
    return `Done: ${done.summary}. An Undo shows under your reply.`;
  }

  return [
    {
      name: 'staff_project',
      can: 'bring Cast people and teams onto the project: a new team made of Cast agents, whole Cast teams, or single specialists (also people who were here before)',
      description:
        'Add people from the Cast to this project, by the names in the summary’s `castAvailable` only. Never invent anyone: new agents are designed with Tinker in the Cast, so say so if the user wants someone who does not exist. Someone with "wasHere": true can come back as a specialist. Call this before add_goal when the same message also asks for work.',
      inputSchema: {
        type: 'object',
        properties: {
          team: {
            type: 'object',
            description: 'A NEW team made of Cast agents.',
            properties: {
              name: NAME,
              captain: NAME,
              members: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: { agent: NAME, job: { type: 'string', description: 'Their job on the team.' } },
                  required: ['agent'],
                },
              },
            },
            required: ['name', 'captain', 'members'],
          },
          teams: { ...NAMES, description: 'Whole Cast teams, by name.' },
          specialists: { ...NAMES, description: 'Single Cast agents, by name.' },
        },
      },
      run: async (a) => staffProject(a),
    },
    {
      name: 'rebuild_teams',
      can: 'take people or teams off the project, split or merge teams, move someone, make someone a solo specialist, or change a captain (when there is something to decide, the user confirms on a card)',
      description:
        'Change who is on the project, using only the names of the summary’s teams and specialists. Removing never deletes anyone from the Cast. A change with open work comes back as a confirm card for the user; a plain one is done at once with an Undo.',
      inputSchema: {
        type: 'object',
        properties: {
          remove: { ...NAMES, description: 'People to take off the project.' },
          removeTeams: { ...NAMES, description: 'Teams to take off the project.' },
          move: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                agent: NAME,
                to: { type: 'string', description: 'A team name, or "specialist".' },
                job: NAME,
              },
              required: ['agent', 'to'],
            },
          },
          split: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                team: NAME,
                into: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: { name: NAME, captain: NAME, members: NAMES },
                    required: ['name', 'captain', 'members'],
                  },
                },
              },
              required: ['team', 'into'],
            },
          },
          captain: {
            type: 'array',
            items: { type: 'object', properties: { team: NAME, agent: NAME }, required: ['team', 'agent'] },
          },
        },
      },
      run: async (a) => rebuildTeams(a),
    },
  ];
}
