/* A deterministic stand-in brain for the FakeRunner (dev server with AI_STUDIO_RUNNER=fake,
   and the default in tests' buildApp): answers every crew contract with valid JSON derived
   from the task itself, so the whole flow — chat → plan → accept → finish → work → runs —
   works for free. It's a demo, not a planner: first team, simple designs, one item per lead. */
import { DEFAULT_SCRIPT, type FakeStep } from '../runtime/fake.ts';
import type { RunSpec } from '../runtime/runner.ts';
import type { CastCatalogue } from './prompts.ts';
import { contractOf } from './structured.ts';

/** The JSON after `prefix` on its own line of the task (prompts put one JSON value per line). */
function field<T>(task: string, prefix: string): T | undefined {
  const line = task.split('\n').find((l) => l.startsWith(prefix));
  if (!line) return undefined;
  try {
    return JSON.parse(line.slice(prefix.length).trim()) as T;
  } catch {
    return undefined;
  }
}
const answer = (v: unknown): FakeStep[] => [
  { tokens: { input: 400, output: 60 } },
  { result: JSON.stringify(v) },
];

const LOOKS = [
  { hat: 'headphones', tool: 'stylus', body: 'sprout', antenna: 'curl', face: 'glasses', hue: 'coral' },
  { hat: 'goggles', tool: 'cog', body: 'lanky', antenna: 'bob', face: 'freckles', hue: 'mint' },
  { hat: 'beret', tool: 'palette', body: 'hero', antenna: 'spikes', face: 'none', hue: 'rose' },
];
const NAMES = ['Nova', 'Sprocket', 'Juniper', 'Comet', 'Pixie', 'Bolt', 'Marble', 'Echo'];
const TEAM_NAMES = ['The Night Shift', 'The Pocket Rockets', 'The Signal Crew', 'The Moonlighters'];

function freshName(taken: string[], pool: string[], suffix = '') {
  const used = new Set(taken.map((n) => n.toLowerCase()));
  for (let n = 1; ; n++)
    for (const base of pool) {
      const name = `${base}${suffix}${n > 1 ? ` ${n}` : ''}`;
      if (!used.has(name.toLowerCase())) return name;
    }
}
const topic = (brief: string) =>
  (/\bfor\s+([a-z][a-z-]{2,20})/i.exec(brief)?.[1] ?? 'Specialist').replace(/^./, (c) => c.toUpperCase());

function agentDef(brief: string, taken: string[], i = 0) {
  const role = topic(brief);
  const name = freshName(taken, NAMES);
  return {
    name,
    role,
    prompt: `You are ${name}, the studio's ${role} specialist. ${brief}. Stay in your lane, keep changes small, and ask when the brief is unclear.`,
    look: LOOKS[i % LOOKS.length],
  };
}

export function fakeBrain(spec: RunSpec): FakeStep[] {
  const c = contractOf(spec.task);
  const t = spec.task;
  switch (c?.name) {
    case 'setup-chat': {
      const cast = field<CastCatalogue>(t, 'The Cast:');
      const said = (field<string>(t, 'The user now says:') ?? '').toLowerCase();
      const team = cast?.teams[0];
      const wantsTeam = /\bnew\b.{0,12}\b(team|crew|squad)\b/.test(said);
      const wantsAgent = !wantsTeam && /\b(add|need)\b.*\b(specialist|expert)\b/.test(said);
      return answer({
        reply: team
          ? `${team.name} can carry this — ${team.blurb.replace(/\.$/, '').toLowerCase()}.${wantsTeam ? ' And I’ve asked the Agent Creator for a brand-new team.' : ''}${wantsAgent ? ' Plus a specialist the Agent Creator will design.' : ''}`
          : 'There is no team in the Cast yet, so the Agent Creator will design one.',
        plan: {
          teams: team ? [{ teamId: team.id, why: team.blurb || 'a good fit' }] : [],
          newTeams: wantsTeam || !team ? [{ brief: `A team for ${topic(said || 'building')}` }] : [],
          newAgents: wantsAgent ? [{ brief: `A specialist for ${topic(said)}` }] : [],
          summary: team ? `${team.name} leads.` : 'A new team leads.',
        },
      });
    }
    case 'mint-agent': {
      const brief = field<string>(t, 'Brief from the orchestrator:') ?? 'a specialist';
      return answer(agentDef(brief, field<string[]>(t, 'Agent names already taken:') ?? []));
    }
    case 'mint-team': {
      const brief = field<string>(t, 'Brief from the orchestrator:') ?? 'a team';
      const taken = field<string[]>(t, 'Agent names already taken:') ?? [];
      const lead = agentDef(brief, taken, 0);
      const mate = agentDef(brief, [...taken, lead.name], 1);
      return answer({
        name: freshName(field<string[]>(t, 'Team names already taken:') ?? [], TEAM_NAMES),
        blurb: `${topic(brief)} from first sketch to shipped build.`,
        instr: `Own everything ${topic(brief).toLowerCase()} on the projects you join. The captain splits the work and reports to the orchestrator.`,
        code: 'Feature folders, tests next to the code, small focused commits.',
        emblem: 'droneship',
        color: 'coral',
        members: [
          { newAgent: lead, job: 'Lead the build and split the work.' },
          { newAgent: mate, job: 'Build alongside the captain.' },
        ],
        captain: lead.name,
      });
    }
    case 'dispatch': {
      const goal = field<string>(t, "The user's goal:") ?? 'the goal';
      const staff = field<{
        teams: { teamId: string; captain: { id: string } | null }[];
        specialists: { id: string }[];
      }>(t, 'Who works on it:');
      const items = [
        ...(staff?.teams ?? []).flatMap((tm) =>
          tm.captain ? [{ text: `${goal} (${tm.teamId})`, assignee: tm.captain.id, teamId: tm.teamId }] : [],
        ),
        ...(staff?.specialists ?? []).map((s) => ({ text: `${goal} (support)`, assignee: s.id })),
      ]
        .slice(0, 8)
        .map((i) => ({ ...i, text: i.text.slice(0, 300), brief: `Do your part of: ${goal}` }));
      return answer({ summary: `Everyone takes a slice of: ${goal}`.slice(0, 1000), items });
    }
    case 'health': {
      const aspect = (grade: string, good: string, fix: string) => ({ grade, good, fix });
      return [
        { activity: { kind: 'reading', label: 'Reading CLAUDE.md', target: 'CLAUDE.md' } },
        { activity: { kind: 'searching', label: 'Searching for **/*' } },
        ...answer({
          modularity: aspect('B', 'Small, separate files.', 'Keep new features in their own folders.'),
          cleanliness: aspect('A', 'No dead code or stray files.', 'Keep issues.txt current.'),
          reusability: aspect(
            'B',
            'Nothing duplicated yet.',
            'Extract shared pieces once a second caller appears.',
          ),
          summary: 'A small, tidy project — healthy so far (fake check).',
        }),
      ];
    }
    default:
      return DEFAULT_SCRIPT;
  }
}
