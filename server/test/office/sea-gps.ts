/* The Sea GPS case, shared by the One-Step Team Building tests: the user's ask, the team Tinker designs for it, and
   a studio where Tinker's whiteboard run plays a script. */
import { teamRequestsRepo } from '../../src/db/team-requests.ts';
import type { FakeStep } from '../../src/runtime/fake.ts';
import type { RunSpec } from '../../src/runtime/runner.ts';
import { worked } from '../crew/brain.ts';
import { directorStudio } from './director-studio.ts';

export const SEA_GPS =
  'Build a team for the Sea GPS one-page app presentation: a storyteller and a Presentation Creator, the storyteller as captain.';

const prompt = (who: string) =>
  `You are ${who}. You own one clear job on this team, you work in small, honest steps, and you never invent facts.`;

export const marina = {
  name: 'Marina',
  role: 'Storyteller',
  prompt: prompt('Marina, a storyteller who finds the one story an app tells'),
  look: { hat: 'captain', tool: 'quill', body: 'hero', antenna: 'curl', face: 'freckles', hue: 'teal' },
};
export const slidewright = {
  name: 'Slidewright',
  role: 'Presentation Creator',
  prompt: prompt('Slidewright, a presentation creator who builds one clear page from a story'),
  look: { hat: 'beret', tool: 'stylus', body: 'lanky', antenna: 'tuft', face: 'glasses', hue: 'sky' },
};
export const TIDE_TELLERS = {
  name: 'The Tide Tellers',
  blurb: 'Tell the Sea GPS story on one bright page.',
  instr: 'Find the story first, then shape the one-page presentation around it.',
  code: 'Work in the presentation folder only; keep the page a single, self-contained file.',
  emblem: 'compass',
  color: 'teal',
  members: [
    { newAgent: marina, job: 'Captain: find the story and keep the why.' },
    { newAgent: slidewright, job: 'Build the one-page presentation from the story.' },
  ],
  captain: 'Marina',
};

const isTinker = (s: RunSpec) => s.systemPrompt.startsWith('# Tinker\n');
const requestIn = (task: string) => /Approved request: (tr-[\w-]+)/.exec(task)?.[1] ?? 'none';

/** The studio, with Tinker's whiteboard run playing `tinker` (everyone else just works). */
export function seaGps(
  tinker: (spec: RunSpec, request: string) => FakeStep[],
  helper?: Parameters<typeof directorStudio>[0],
) {
  const s = directorStudio(helper, (spec) =>
    isTinker(spec) ? tinker(spec, requestIn(spec.task)) : worked('Built.'),
  );
  const requests = () => teamRequestsRepo(s.h.db).list('lumi');
  /** The user asks, the director proposes, the user says yes, the director hands it over. */
  const approve = async () => {
    await s.turn('Build me a team for the Sea GPS presentation');
    await s.turn('Yes, build that team', {
      tool: 'hand_to_agent_creator',
      args: { work: SEA_GPS, user_yes: 'yes, build that team' },
    });
  };
  return { ...s, requests, approve };
}
