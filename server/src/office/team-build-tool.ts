/* build_team: the Agent Creator's one call for an approved team request — new agents into the Cast, the team onto the
   project. Offered only in the Agent Creator's own runs; the request id (from the whiteboard brief) is the gate. */
import { z } from 'zod';
import { invalid } from '../errors.ts';
import { TeamDefSchema } from '../domain/creator.ts';
import type { BridgeTool } from '../room/bridge.ts';
import type { TeamBuild } from './team-build.ts';

export const BUILD_TEAM = 'build_team';

export function teamBuildTool(builds: TeamBuild, projectId: string, creatorId: string): BridgeTool {
  return {
    name: BUILD_TEAM,
    description: [
      'Build the team the user approved, in one go: its new agents join the Cast, the team (with its captain and members) goes on this project, and the director’s chat gets a line on what you made. Only for an approved request: pass its id from your brief ("Approved request: tr-…").',
      'Design rules: original names only (no real people, no film, TV, game or brand names; not taken in the Cast) — short, easy to say, tied to the job. Team name "The …" with a playful plural, a one-line blurb, an emblem that fits the theme. Each prompt in second person: who they are, what they own, how they work, what they never do. Tool and hat tell the role’s story (a storyteller: quill, book or scroll). Teammates look different: no shared hue, at least two of hat, tool and body differ; the "captain" or "helm" hat only for the captain. The captain holds the "why" (for a story-led deliverable, the storyteller).',
      'Checked at once: fix what it lists and call again.',
    ].join(' '),
    inputSchema: {
      type: 'object',
      properties: {
        request: { type: 'string', description: 'The approved request id, from your brief (tr-…).' },
        team: {
          ...(z.toJSONSchema(TeamDefSchema, { io: 'input' }) as Record<string, unknown>),
          description:
            'The team: members are {newAgent: {name, role, prompt, look}, job} for new agents or {agentId, job} for Cast agents; captain is a new agent’s name or a member’s agentId.',
        },
      },
      required: ['request', 'team'],
    },
    run: async (a) => {
      const request = typeof a.request === 'string' ? a.request.trim() : '';
      if (!request) throw invalid('"request" is required: the approved request id from your brief.');
      const team = typeof a.team === 'string' ? (JSON.parse(a.team) as unknown) : a.team;
      const done = builds.build(projectId, request, creatorId, team);
      return `${done.line} Your report to the director: say what you built, in two plain lines.`;
    },
  };
}
