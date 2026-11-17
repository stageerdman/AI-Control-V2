/* The director's workflow tools (WORKFLOWS): read the project's stable workflows, add or change one ("from now
   on Health Analyst checks backend work"), take one off. Thin adapters over the workflows service: people and
   teams are said by name and resolved to ids here; the service checks the rest and refuses with the field.
   Every change lands in the board's history (who changed how the work runs). */
import type { WorkflowsService } from '../crew/workflows.ts';
import type { Store } from '../db/store.ts';
import { GATE_KINDS, keepDrawing, stableCopy, type Workflow } from '../domain/workflows.ts';
import { AppError, invalid } from '../errors.ts';
import type { CapableTool } from '../room/bridge.ts';
import { workflowRefs } from './workflow-refs.ts';

export type WorkflowToolDeps = {
  workflows: WorkflowsService;
  store: Store;
  /** Records a change in the board's history. */
  note: (projectId: string, by: string, summary: string) => void;
  /** The workflow a goal of this project runs under (refused: no such goal). */
  goalWorkflow: (projectId: string, goalId: string) => Workflow;
};

type Args = Record<string, unknown>;
const NOTHING = { say: '', note: '' };
const KEPT = { say: ' Kept its drawing (who starts, hand-offs, who signs last).', note: '' };
const drawn = (w?: Workflow) => !!w && (!!w.first || !!w.final || !!w.steps?.length);
const str = (a: Args, k: string) => (typeof a[k] === 'string' ? (a[k] as string).trim() : undefined);

/** "Quick fix!" → "quick-fix". */
export const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);

export function workflowTools(d: WorkflowToolDeps, projectId: string, by: string): CapableTool[] {
  const name = (id: string) => d.store.agents.get(id)?.name ?? d.store.teams.get(id)?.name ?? id;
  const { gate } = workflowRefs(d.store, projectId);

  const describe = (w: Workflow, i: number) => {
    const gates = w.gates.length
      ? w.gates
          .map(
            (g) =>
              `${name(g.reviewer)} checks ${g.after === '*' ? 'all work' : `${name(g.after)}'s work`} (${g.kind})`,
          )
          .join('; ')
      : 'no checks';
    return `${i === 0 ? '(usual) ' : ''}${w.name} [id: ${w.id}] — when: ${w.when}. ${gates}. ${w.summary}`;
  };
  const listText = (list: readonly Workflow[]) => list.map(describe).join('\n');

  function setWorkflow(a: Args): string {
    const given = str(a, 'name');
    if (!given) throw invalid('"name" is required.');
    const id = str(a, 'id') || slug(given);
    if (!id) throw invalid('"id": give a slug (lowercase letters, digits, dashes).');
    const talksTo = str(a, 'talksTo');
    const w = {
      id,
      name: given,
      when: str(a, 'when') || 'everything',
      orchestratorTalksTo: talksTo === 'everyone' ? 'everyone' : 'captains',
      gates: Array.isArray(a.gates) ? (a.gates as Args[]).map(gate) : [],
      maxSendBacks: typeof a.maxSendBacks === 'number' ? a.maxSendBacks : 2,
      summary: str(a, 'summary') || given,
    } as Workflow;
    const before = d.workflows.list(projectId);
    const prev = before.designed ? before.workflows.find((x) => x.id === id) : undefined;
    const { list, drawing } = putKeepingDrawing(w, prev, a.first === true);
    const replaced = !!prev;
    d.note(projectId, by, `${replaced ? 'Changed' : 'Added'} workflow '${w.name}'${drawing.note}`);
    return `${replaced ? 'Changed' : 'Added'} '${w.name}'.${drawing.say} Workflows now:\n${listText(list)}`;
  }

  /** Voice knows only the gates: keep the editor's drawing while it still fits them. When it no longer does,
      the voice change wins and the drawing is cleared, and the answer says why (never silently). */
  function putKeepingDrawing(w: Workflow, prev: Workflow | undefined, first: boolean) {
    if (!prev) return { list: d.workflows.put(projectId, w, { first }), drawing: NOTHING };
    try {
      return {
        list: d.workflows.put(projectId, keepDrawing(w, prev), { first }),
        drawing: drawn(prev) ? KEPT : NOTHING,
      };
    } catch (e) {
      if (!(e instanceof AppError) || e.code !== 'conflict' || !drawn(prev)) throw e;
      const list = d.workflows.put(projectId, w, { first });
      return {
        list,
        drawing: {
          say: ` Its drawing no longer fit these checks (${e.message}), so it was cleared — redraw it in the editor.`,
          note: ' (drawing cleared)',
        },
      };
    }
  }

  /** Keep a goal's way of working (a temporary crew that went well) as one of the project's workflows. */
  function saveWorkflow(a: Args): string {
    const goal = str(a, 'goal');
    const given = str(a, 'name');
    if (!goal || !given) throw invalid('"goal" and "name" are required.');
    const id = slug(given);
    if (!id) throw invalid('"name": use some letters or digits.');
    if (d.workflows.list(projectId).workflows.some((w) => w.id === id))
      throw invalid(`A workflow '${id}' exists already — pick another name, or change it with set_workflow.`);
    const w = stableCopy(d.goalWorkflow(projectId, goal), {
      id,
      name: given,
      when: str(a, 'when') || 'everything',
    });
    const list = d.workflows.put(projectId, w, { first: false });
    d.note(projectId, by, `Saved workflow '${w.name}' from a goal`);
    return `Saved '${w.name}'. Workflows now:\n${listText(list)}`;
  }

  function removeWorkflow(a: Args): string {
    const id = str(a, 'id');
    if (!id) throw invalid('"id" is required — see them with workflows.');
    const gone = d.workflows.list(projectId).workflows.find((w) => w.id === id);
    const list = d.workflows.remove(projectId, id);
    d.note(projectId, by, `Removed workflow '${gone?.name ?? id}'`);
    return `Removed '${gone?.name ?? id}'. Goals already running under it keep it. Workflows now:\n${listText(list)}`;
  }

  return [
    {
      name: 'workflows',
      can: "see the project's workflows: who checks whose work, for which kind of goal",
      description:
        'The project’s stable workflows, the usual (first) one marked: each with its id, when to use it and who signs off whose work.',
      inputSchema: { type: 'object', properties: {} },
      run: async () => {
        const { workflows, designed } = d.workflows.list(projectId);
        return `${listText(workflows)}${designed ? '' : '\n(Not designed yet: this is the studio default.)'}`;
      },
    },
    {
      name: 'set_workflow',
      can: 'add or change a way of working ("from now on Health Analyst checks backend work", "a quick-fix way with no review")',
      description:
        'Add a workflow, or change the one with this id (it is replaced whole: list every check it keeps; a drawing from the editor stays while it still fits the checks, else it is cleared and the answer says so). People and teams by name. Goals already running keep the workflow they started with; new goals pick from these.',
      inputSchema: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'To change one: its id. Leave out to add (made from the name).',
          },
          name: { type: 'string', description: 'Short name, e.g. "Quick fix".' },
          when: { type: 'string', description: 'The kind of goal it is for, e.g. "small fixes".' },
          talksTo: {
            type: 'string',
            enum: ['captains', 'everyone'],
            description: 'Whom you brief: team captains (default) or anyone on a team.',
          },
          gates: {
            type: 'array',
            description: 'The sign-offs, in order.',
            items: {
              type: 'object',
              properties: {
                after: { type: 'string', description: 'Whose work: a team, a person, or "*" for all work.' },
                reviewer: {
                  type: 'string',
                  description: 'Who signs it off (on the project, never the builder).',
                },
                kind: { type: 'string', enum: GATE_KINDS },
                why: { type: 'string', description: 'Why this check earns its place.' },
              },
              required: ['after', 'reviewer', 'kind', 'why'],
            },
          },
          maxSendBacks: {
            type: 'number',
            description: 'How often a reviewer may send work back (0–3, default 2).',
          },
          summary: { type: 'string', description: 'One line for people.' },
          first: { type: 'boolean', description: 'Make it the usual (default) one.' },
        },
        required: ['name', 'when', 'gates', 'summary'],
      },
      run: async (a) => setWorkflow(a),
    },
    {
      name: 'save_workflow',
      can: "keep a goal's way of working as one of the project's workflows",
      description:
        'Save the workflow a goal ran under as a stable workflow of the project: its checks stay, a temporary lead’s sign-offs of the crew become plain checks, the lead and crew themselves do not. To make the lead and crew a real team instead, use rebuild_teams.',
      inputSchema: {
        type: 'object',
        properties: {
          goal: { type: 'string', description: 'The goal id (see whiteboard).' },
          name: { type: 'string', description: 'Short name, e.g. "Lead and builder".' },
          when: { type: 'string', description: 'The kind of goal it is for.' },
        },
        required: ['goal', 'name', 'when'],
      },
      run: async (a) => saveWorkflow(a),
    },
    {
      name: 'remove_workflow',
      can: 'take a way of working off the project (never the last one)',
      description: 'Remove a workflow by id. The last one stays. Running goals keep theirs.',
      inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      run: async (a) => removeWorkflow(a),
    },
  ];
}
