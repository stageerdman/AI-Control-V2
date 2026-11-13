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
        teams: { teamId: string; captain: { id: string } | null; reporter?: boolean }[];
        specialists: { id: string; reporter?: boolean }[];
      }>(t, 'Who works on it:');
      let items: { text: string; assignee: string; teamId?: string; reporter?: boolean }[] = [
        ...(staff?.teams ?? []).flatMap((tm) =>
          tm.captain
            ? [
                {
                  text: `${goal} (${tm.teamId})`,
                  assignee: tm.captain.id,
                  teamId: tm.teamId,
                  reporter: tm.reporter,
                },
              ]
            : [],
        ),
        ...(staff?.specialists ?? []).map((s) => ({
          text: `${goal} (support)`,
          assignee: s.id,
          reporter: s.reporter,
        })),
      ];
      /* knowledge, not change → one report item for the first reporter */
      const research = /\b(research|compare|investigate|find out|write up|review|status of)\b/i.test(goal);
      const reporter = items.find((i) => i.reporter);
      if (research && reporter) items = [{ ...reporter, text: goal }];
      const out = items.slice(0, 8).map(({ reporter: _, ...i }) => ({
        ...i,
        text: i.text.slice(0, 300),
        brief: `Do your part of: ${goal}`,
        ...(research && reporter ? { report: true } : {}),
      }));
      return answer({ summary: `Everyone takes a slice of: ${goal}`.slice(0, 1000), items: out });
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
      /* a report item (or a reporter asked for research): file a report, like a real reporter would */
      if (/file_report/.test(t)) {
        const q = /question: "([^"]{1,200})"/.exec(t)?.[1] ?? 'the question';
        return [
          { activity: { kind: 'reading', label: 'Reading CLAUDE.md', target: 'CLAUDE.md' } },
          { tokens: { input: 900, output: 300 } },
          {
            report: {
              title: `Findings: ${q}`.slice(0, 80),
              summary: 'A fake report from the free runner — the real one would answer the question here.',
              body: `## What we looked at\n\n- The project folder\n- CLAUDE.md\n\n## Answer\n\nThis is a scripted report (AI_STUDIO_RUNNER=fake) for: ${q}.`,
              kind: 'research',
              question: q,
              sources: [{ title: 'Project rules', path: 'CLAUDE.md' }],
            },
          },
          { result: 'Filed the report.' },
        ];
      }
      /* an office-chat turn: a short, obviously-fake reply that echoes the user */
      if (/^The user says: /m.test(t)) {
        const said = field<string>(t, 'The user says:') ?? '';
        return [
          { activity: { kind: 'thinking', label: 'Thinking' } },
          { tokens: { input: 300, output: 40 } },
          { result: `Got it — “${said.slice(0, 200)}”. (A scripted reply: AI_STUDIO_RUNNER=fake.)` },
        ];
      }
      return DEFAULT_SCRIPT;
  }
}
