/* Real team work (F1c): a captain leads their team on a team item. The rules and words live here; dispatch
   (src/crew/dispatch.ts) owns the flow.

   1. Split — one short structured call (contract `team-split`) in the item's checkout with read-only tools: the
      captain decides to do it alone ("self") or to give 1–4 sub-tasks to members by their job on the team ("team").
   2. Members build their sub-tasks in their own checkouts (branched from the team item's branch) and the studio
      merges each into the team item's branch.
   3. Integrate — the captain's run in the team item's checkout: pull the parts together, check them, fix small gaps;
      at most one rework round may send parts back to members (a JSON line at the end of the reply).
   Then the item goes on like any other: the project's review gates, then main. */
import { z } from 'zod';
import type { Agent } from '../db/agents.ts';
import type { Team } from '../db/teams.ts';
import type { ChecklistItem, Goal } from '../db/work.ts';
import { HEALTH_ALLOWED, HEALTH_TOOLS } from '../health/health.ts';
import type { Caps } from '../runtime/runner.ts';
import { crewSystemPrompt, json } from './prompts.ts';

export const TEAM_SPLIT = 'team-split';
export const MAX_SUBTASKS = 4;
/** Rework rounds a captain may send members back for after integrating (then it fixes things itself). */
export const MAX_TEAM_ROUNDS = 1;
/** The split: a quick look + one answer. */
export const SPLIT_CAPS: Caps = { maxTurns: 8, maxBudgetUsd: 2 };
/** The split may glance at the checkout, never change it (the health check's read-only tool set). */
export const SPLIT_WORKSPACE = { tools: HEALTH_TOOLS, allowedTools: HEALTH_ALLOWED };

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export const TeamSplitSchema = z.strictObject({
  mode: z.enum(['team', 'self']),
  summary: z.string().trim().min(1).max(1000),
  subtasks: z
    .array(
      z.strictObject({
        text: z.string().trim().min(1).max(300),
        assignee: z.string().trim().min(1).max(80),
        brief: z.string().trim().min(1).max(4000),
        /** May build at the same time as the sub-task before it (different files). Default: true. */
        parallel: z.boolean().optional(),
      }),
    )
    .max(MAX_SUBTASKS)
    .default([]),
});
export type TeamSplit = z.output<typeof TeamSplitSchema>;

/** Pure: a team split gives each sub-task to one member of THIS team (one each), at least one of them not the captain. */
export function splitIssues(s: TeamSplit, team: { captainId: string | null; members: string[] }): string[] {
  if (s.mode === 'self') return [];
  const out: string[] = [];
  if (!s.subtasks.length) out.push('subtasks: a "team" split needs 1–4 sub-tasks (or answer "mode": "self")');
  const seen = new Set<string>();
  s.subtasks.forEach((t, i) => {
    if (!team.members.includes(t.assignee))
      out.push(
        `subtasks.${i}: '${t.assignee}' is not a member of your team — use a member id from "Your team"`,
      );
    if (seen.has(t.assignee))
      out.push(`subtasks.${i}: '${t.assignee}' already has a sub-task — one sub-task per member`);
    seen.add(t.assignee);
  });
  if (s.subtasks.length && s.subtasks.every((t) => t.assignee === team.captainId))
    out.push('subtasks: every sub-task is yours — answer "mode": "self" instead');
  return out;
}

export const CAPTAIN_ALTITUDE =
  'You are the captain of your team: you lead it on this item. You split the work by your members’ jobs, keep the parts small and separate, and pull them together at the end. You never micromanage — a sub-task says what done looks like, not how to type it.';

export type TeamView = Pick<Team, 'id' | 'name' | 'instr' | 'code' | 'captainId' | 'members'>;

/** The captain's split call: system prompt + task (the contract line is added by the crew). */
export function splitCall(o: {
  captain: Pick<Agent, 'name' | 'role' | 'prompt'>;
  team: TeamView;
  item: ChecklistItem;
  goal: Goal;
  orchestrator: string;
  name: (id: string) => string;
  role: (id: string) => string;
  /** What the goal's earlier items finished (dispatch's "Done before you"), or ''. */
  earlier?: string;
}) {
  const { team, item } = o;
  const members = team.members.map((m) => ({
    id: m.agentId,
    name: o.name(m.agentId),
    role: o.role(m.agentId),
    job: clip(m.instr, 300),
    ...(m.agentId === team.captainId ? { captain: true } : {}),
  }));
  const systemPrompt = crewSystemPrompt(o.captain, CAPTAIN_ALTITUDE);
  const task = [
    `Goal from ${o.orchestrator} (your orchestrator): ${json(clip(o.goal.text, 2000))}`,
    `Your team's item: ${json(item.text)}`,
    `Brief: ${json(item.brief)}`,
    o.earlier ?? '',
    `Your team: ${json({ name: team.name, whatWeDo: clip(team.instr, 600), howWeCode: clip(team.code, 600), members })}`,
    [
      'You are in the item’s checkout (its own git branch). You may glance around with Read, Glob, Grep and read-only commands (ls, git log, git ls-files) — a few files at most; you cannot change anything here.',
      'Decide how your team does this item:',
      `- "mode": "team" — split it when that saves time or a part matches a member's job: 1–${MAX_SUBTASKS} sub-tasks, each for ONE member (one each; you may take one yourself), each touching different files so they build side by side in their own checkouts. Set "parallel": false on a sub-task that needs the one before it. When they are done you pull their work together and check it.`,
      '- "mode": "self" — do it yourself when it is small (one file, a quick fix): splitting tiny work only adds handoffs.',
      '"text" is a short line; "brief" says what done looks like and which files/folder it owns. When one part uses another part\'s code, write the exact interface (file, function names and arguments, data shapes) into BOTH briefs — members build side by side and cannot see each other\'s work. "summary" is your split in one plain sentence.',
    ].join('\n'),
    `Answer with one JSON object shaped like this: ${json({
      mode: 'team',
      summary: 'Who does what, in one sentence.',
      subtasks: [
        {
          text: 'Short line',
          assignee: '<member id>',
          brief: 'What to build, which files it owns, what done looks like.',
          parallel: true,
        },
      ],
    })}`,
  ]
    .filter(Boolean)
    .join('\n\n');
  return { systemPrompt, task, workspace: { cwd: item.workspace?.cwd ?? '', ...SPLIT_WORKSPACE } };
}

/** A member's task for its sub-task. */
export function memberTask(o: {
  sub: ChecklistItem;
  parent: ChecklistItem;
  goal: Goal;
  team: TeamView;
  name: (id: string) => string;
  siblings: ChecklistItem[];
  rework?: string | null;
  earlier?: string;
}): string {
  const { sub, parent } = o;
  const captain = o.name(parent.agentId);
  const others = o.siblings.filter((s) => s.id !== sub.id && s.status !== 'cancelled');
  return [
    `Goal: ${o.goal.text}`,
    `${captain} (captain of ${o.team.name}) leads your team's item "${parent.text}" and gave you a part of it.`,
    `Your sub-task: ${sub.text}`,
    `Brief: ${sub.brief}`,
    o.earlier ?? '',
    o.rework ? `${captain} looked at your earlier part and sends it back. Their notes: ${o.rework}` : '',
    /* F3 live: with only the titles, "use the shapes from the captain's sub-task" pointed at nothing and the member had
       to ask the user. Their briefs carry the interfaces they promise. */
    others.length
      ? `Teammates build the other parts at the same time, in their own checkouts — their work is NOT in yours yet. Stay within your part and code against what their briefs promise (files, function names, data shapes); ${captain} fits the parts together afterwards. Don't ask the user about a teammate's part — if a detail is missing, make the simplest reasonable choice and say it in your summary.\n${others.map((s) => `• ${o.name(s.agentId)}: ${s.text} — brief: ${clip(s.brief, 1500)}`).join('\n')}`
      : '',
    sub.workspace
      ? `You work in your own checkout on branch ${sub.workspace.branch} (from the team's branch ${sub.workspace.main}): commit your work there (plain \`git add\` / \`git commit\`) — ${captain} merges it into the team's branch. Do not push.`
      : '',
    'When you are done, reply with a short plain-words summary of what you did.',
  ]
    .filter(Boolean)
    .join('\n\n');
}

/** The captain's integration run (in the team item's checkout, with the members' work merged in). */
export function integrateTask(o: {
  parent: ChecklistItem;
  goal: Goal;
  team: TeamView;
  name: (id: string) => string;
  /** The latest sub-task per member this round (and earlier rounds' summaries). */
  parts: ChecklistItem[];
  canSendBack: boolean;
  reviewers: string[];
}): string {
  const { parent } = o;
  const lines = o.parts.map((s) =>
    s.status === 'done'
      ? `• ${s.text} — ${o.name(s.agentId)} (merged into your branch): ${clip(s.note ?? 'done', 600)}`
      : `• ${s.text} — ${o.name(s.agentId)} did NOT finish (${s.status}): ${clip(s.note ?? '', 400)}`,
  );
  const ws = parent.workspace;
  return [
    `You lead ${o.team.name} on "${parent.text}" (goal: ${o.goal.text}).`,
    `Brief: ${parent.brief}`,
    `Your team's parts:\n${lines.join('\n')}`,
    ws
      ? `They are merged into this checkout (branch ${ws.branch}). See the work with \`git log ${ws.base.slice(0, 12)}..HEAD\` and \`git diff ${ws.base.slice(0, 12)}..HEAD\`.`
      : '',
    'Now integrate: make sure the parts fit together and the item does what the brief asks — run it or its tests when there is a way to. Fix small gaps yourself (and any part that did not finish), then commit (plain `git add` / `git commit`; do not push).',
    o.reviewers.length ? `After you, it goes to ${o.reviewers.join(', then ')} for review.` : '',
    'If the project has an app to start and no `run:` line in `.project` yet, add one (e.g. `run: npm run dev`).',
    o.canSendBack
      ? `Only if a member's part is clearly wrong and needs real rework, don't rewrite it: end your reply with ONE line of JSON ${json({ rework: [{ assignee: '<member id>', notes: 'what to fix' }] })} — they rework it and you integrate again (once).`
      : '',
    'Finish with a short plain-words summary of the integrated result.',
  ]
    .filter(Boolean)
    .join('\n\n');
}

/** The rework a captain asks for at the end of its integration reply (the last `{"rework": …}` line), if any. */
export function parseRework(reply: string): { assignee: string; notes: string }[] {
  const lines = reply
    .split('\n')
    .map((l) => l.trim().replace(/^`+|`+$/g, ''))
    .filter((l) => l.startsWith('{') && l.includes('"rework"'));
  for (const raw of lines.reverse()) {
    try {
      const v = JSON.parse(raw) as { rework?: unknown };
      if (!Array.isArray(v.rework)) continue;
      return v.rework
        .filter(
          (r): r is { assignee: string; notes: string } =>
            !!r && typeof r.assignee === 'string' && typeof r.notes === 'string' && !!r.notes.trim(),
        )
        .slice(0, MAX_SUBTASKS)
        .map((r) => ({ assignee: r.assignee.trim(), notes: clip(r.notes.trim(), 2000) }));
    } catch {
      /* next */
    }
  }
  return [];
}
