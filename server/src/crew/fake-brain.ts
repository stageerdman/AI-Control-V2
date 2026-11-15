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

/** AGENT MCP: with studio tools, the creator asks the Cast's designer for a costume, then creates the design. */
function viaTools(spec: RunSpec, create: string, def: unknown, who: string): FakeStep[] {
  const names = spec.studioTools?.names ?? [];
  if (!names.includes(create)) return [];
  const designer = field<{ name: string }[]>(
    spec.task,
    "Fellow agents with a designer's eye (call_agent):",
  )?.[0];
  return [
    ...(designer && names.includes('call_agent')
      ? [
          {
            tool: 'call_agent',
            args: {
              agent: designer.name,
              request: `Design a costume for ${who}, a new agent. Pick one value per look slot (see studio_catalog).`,
              why: 'design the costume',
            },
          },
        ]
      : []),
    { tool: create, args: def as Record<string, unknown> },
  ];
}

/** Demo pacing for the UI (free runner only): `pace` ms between steps so a watcher sees robots work,
    and an agent task that says "ask me" asks the user first (the pager / "!" path). Off by default. */
export function pacedBrain(pace: number): (spec: RunSpec) => FakeStep[] {
  return (spec) => {
    let steps = fakeBrain(spec);
    /* STUDIO LIFE demo: "please forget" → the agent leaves a desk note and starts fresh from it */
    if (
      !contractOf(spec.task) &&
      /please forget/i.test(spec.task) &&
      !spec.task.startsWith('You chose to forget')
    )
      steps = [
        { tokens: { input: 900, output: 40 } },
        {
          tool: 'forget',
          args: {
            where: 'The first half is done and committed.',
            doing: 'Working through the brief step by step.',
            next: 'Pick up the second half of the brief.',
          },
        },
        { wait: 5000 },
      ];
    if (!contractOf(spec.task) && /\bask me\b/i.test(spec.task))
      steps = [{ ask: 'Quick check before I start — go ahead?', options: ['Go ahead', 'Hold on'] }, ...steps];
    return pace > 0 ? steps.flatMap((s) => [s, { wait: pace }]) : steps;
  };
}

/** "Build the checkout" → work; "maybe dark mode?" → a reply that asks; anything else → a scripted echo. */
export function fakeDirector(said: string): { reply: string; work: { goal: string } | null } {
  const t = said.trim();
  const ask =
    /\?\s*$/.test(t) ||
    /^(maybe|perhaps|should|could|would|what|how|why|when|who|can|is|are|do|does)\b/i.test(t);
  const work =
    !ask &&
    /^(please\s+)?(build|add|make|create|implement|fix|ship|write|set up|setup|research|compare|investigate|find out|review|refactor|design|improve|update|remove|migrate|test|document)\b/i.test(
      t,
    );
  if (work)
    return { reply: 'On it — it’s going on the whiteboard and I’ll brief the team.', work: { goal: t } };
  if (ask && /\b(add|build|make|could|should|maybe)\b/i.test(t))
    return {
      reply: `Good idea — want me to put “${t.replace(/\?\s*$/, '').slice(0, 160)}” on the whiteboard? Say the word. (A scripted reply: AI_STUDIO_RUNNER=fake.)`,
      work: null,
    };
  return { reply: `Got it — “${t.slice(0, 200)}”. (A scripted reply: AI_STUDIO_RUNNER=fake.)`, work: null };
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
      const def = agentDef(brief, field<string[]>(t, 'Agent names already taken:') ?? []);
      return [...viaTools(spec, 'create_agent', def, def.name), ...answer(def)];
    }
    case 'mint-team': {
      const brief = field<string>(t, 'Brief from the orchestrator:') ?? 'a team';
      const taken = field<string[]>(t, 'Agent names already taken:') ?? [];
      const lead = agentDef(brief, taken, 0);
      const mate = agentDef(brief, [...taken, lead.name], 1);
      const team = {
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
      };
      return [...viaTools(spec, 'create_team', team, lead.name), ...answer(team)];
    }
    /* STUDIO LIFE: designing with Tinker — a draft from what the user said, changes on later turns */
    case 'creator-chat': {
      const said = field<string>(t, 'The user now says:') ?? '';
      const now = field<Record<string, unknown> | null>(
        t,
        'The draft now (the user may have edited it by hand):',
      );
      const base: Record<string, unknown> = now?.name
        ? now
        : { ...agentDef(said, field<string[]>(t, 'Agent names already taken:') ?? []), summary: '' };
      const playful = /playful|fun/i.test(said);
      const draft = {
        ...base,
        summary:
          (playful ? 'A playful ' : 'A ') +
          String(base.role ?? 'specialist').toLowerCase() +
          ' who keeps it simple.',
        ...(playful ? { look: { ...(base.look as object), face: 'freckles', hue: 'rose' } } : {}),
      };
      return [
        ...(/research|look up|latest/i.test(said)
          ? [{ activity: { kind: 'research', label: `Looking up “${said.slice(0, 40)}”` } }]
          : []),
        ...answer({
          reply: playful ? 'Done — more playful now.' : `Here’s a first sketch: ${String(base.name)}.`,
          draft,
        }),
      ];
    }
    /* STUDIO LIFE: the director's mail — tickets go on the board, ideas get discussed, the rest is filed */
    case 'mail-triage': {
      const mail = (() => {
        const line = t.split('\n').find((l) => l.startsWith('[{"mailId"'));
        try {
          return line ? (JSON.parse(line) as { mailId: string; kind: string; subject: string }[]) : [];
        } catch {
          return [];
        }
      })();
      return answer({
        decisions: mail.map((m) =>
          m.kind === 'ticket'
            ? { mailId: m.mailId, action: 'board', goal: m.subject, say: 'On the whiteboard.' }
            : m.kind === 'idea'
              ? { mailId: m.mailId, action: 'discuss', say: 'Worth a word with you first.' }
              : { mailId: m.mailId, action: 'file', say: 'Noted.' },
        ),
        summary: `${mail.length} letter${mail.length === 1 ? '' : 's'} read.`,
      });
    }
    /* AGENT MCP: an approver always says yes; a helper answers with a costume */
    case 'allow-call':
      return answer({ allow: true, reply: 'Yes — go ahead.' });
    case 'help':
      return answer({
        answer: `Costume: ${JSON.stringify(LOOKS[2])} — a beret, a palette and a rose finish read as "maker".`,
        say: 'a beret, a palette and a rose finish',
      });
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
      /* a building goal makes (or reuses) its feature, when the studio offers the features folder */
      const features = field<{ id: string; name: string; status: string }[]>(t, 'Features:');
      const same = features?.find((f) => f.name.toLowerCase() === goal.slice(0, 120).toLowerCase());
      const feature =
        !features || (research && reporter)
          ? undefined
          : same
            ? { id: same.id }
            : { name: goal.slice(0, 120), description: `What the user asked for: ${goal}`.slice(0, 2000) };
      return answer({
        summary: `Everyone takes a slice of: ${goal}`.slice(0, 1000),
        items: out,
        ...(feature ? { feature } : {}),
      });
    }
    case 'team-split': {
      /* the captain hands a part to up to two teammates (by their jobs) — tiny items stay with the captain */
      const item = field<string>(t, "Your team's item:") ?? 'the item';
      const team = field<{ members: { id: string; name: string; job: string; captain?: boolean }[] }>(
        t,
        'Your team:',
      );
      const mates = (team?.members ?? []).filter((m) => !m.captain).slice(0, 2);
      if (!mates.length || /\b(typo|tiny|quick fix)\b/i.test(item))
        return answer({ mode: 'self', summary: 'Small enough — I’ll do it myself.', subtasks: [] });
      return answer({
        mode: 'team',
        summary: `${mates.map((m) => m.name).join(' and ')} each take a part; I pull it together.`,
        subtasks: mates.map((m, i) => ({
          text: `Part ${i + 1} of: ${item}`.slice(0, 300),
          assignee: m.id,
          brief: `Build part ${i + 1} of "${item}" (${m.job || 'your job on the team'}).`,
          parallel: true,
        })),
      });
    }
    case 'collaboration': {
      type Who = { id: string; name: string; role: string };
      const people = field<{ teams: { teamId: string; members: Who[] }[]; specialists: Who[] }>(
        t,
        'Who works on it:',
      );
      const everyone = [...(people?.teams ?? []).flatMap((tm) => tm.members), ...(people?.specialists ?? [])];
      const qa = everyone.find((p) => /\b(qa|quality|test)/i.test(p.role));
      return answer({
        reply: qa
          ? `${qa.name} checks every piece of work before it counts as done.`
          : 'I brief the captains; nobody here does reviews yet.',
        collaboration: {
          orchestratorTalksTo: 'captains',
          gates: qa
            ? [{ after: '*', reviewer: qa.id, kind: 'quality', why: 'A second pair of eyes on quality.' }]
            : [],
          maxSendBacks: 2,
          summary: qa ? `Captains build, ${qa.name} reviews.` : 'Captains build; no review gates.',
        },
      });
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
      /* a review gate (dispatch): approve, the way a happy reviewer ends its reply */
      if (/^You are reviewing /.test(t))
        return [
          { activity: { kind: 'reading', label: 'Reading the changes' } },
          { tokens: { input: 600, output: 80 } },
          { result: 'Looks good.\n{"verdict": "approve", "notes": "Meets the brief (fake review)."}' },
        ];
      /* the director's office-chat turn (one Send): work for a clear ask, a reply (that asks) otherwise */
      if (t.startsWith('Studio summary right now: ')) {
        const said = field<string>(t, 'The user says:') ?? '';
        return [
          { activity: { kind: 'thinking', label: 'Thinking' } },
          { tokens: { input: 300, output: 40 } },
          { result: JSON.stringify(fakeDirector(said)) },
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
