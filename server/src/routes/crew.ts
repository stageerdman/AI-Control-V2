/* The studio crew at work: setup chat with the orchestrator, the Agent Creator minting on
   accept, and the orchestrator dispatching a goal to captains/specialists. */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { Creator } from '../crew/creator.ts';
import type { Dispatch } from '../crew/dispatch.ts';
import type { SetupChat } from '../crew/setup-chat.ts';
import type { Goal } from '../db/work.ts';
import { parse } from '../errors.ts';
import { type FindAgent, presentGoal } from '../whiteboard/present.ts';
import { Id, IdParams } from './schemas.ts';

const ChatBody = z.strictObject({ text: z.string().trim().min(1).max(4000).optional() });
const WorkBody = z.strictObject({
  goal: z.string().trim().min(1).max(4000),
  /** Caps for every run the goal dispatches (size limits; the budget is an API-equivalent estimate). */
  caps: z
    .strictObject({
      maxTurns: z.number().int().min(1).max(100).optional(),
      maxBudgetUsd: z.number().min(0.01).max(25).optional(),
    })
    .optional(),
});
const GoalParams = z.object({ id: Id, goalId: z.uuid() });
const ItemParams = z.object({ id: Id, itemId: z.uuid() });

export const crewRoutes =
  ({
    chat,
    creator,
    dispatch,
    findAgent,
    nameOf,
  }: {
    chat: SetupChat;
    creator: Creator;
    dispatch: Dispatch;
    findAgent: FindAgent;
    nameOf: (id: string) => string;
  }): FastifyPluginAsync =>
  async (app) => {
    const view = (g: Goal) => presentGoal(g, findAgent, nameOf);
    app.get('/drafts/:id/chat', async (req) => chat.history(parse(IdParams, req.params).id));
    /* one orchestrator turn: {text} from the user, or no text → the orchestrator opens with a proposal */
    app.post('/drafts/:id/chat', async (req) => {
      const { id } = parse(IdParams, req.params);
      const { text } = parse(ChatBody, req.body ?? {});
      return chat.say(id, text);
    });
    /* accept the plan: the Agent Creator mints every brief, the plan resolves to real ids (all or nothing) */
    app.post('/drafts/:id/accept', async (req) => creator.accept(parse(IdParams, req.params).id));

    /* the whiteboard: a goal → checklist (captains/specialists) → runs, ≤ 2 at a time per project */
    app.post('/projects/:id/work', async (req, reply) => {
      const { id } = parse(IdParams, req.params);
      const { goal, caps } = parse(WorkBody, req.body);
      const clean = caps && Object.fromEntries(Object.entries(caps).filter(([, v]) => v !== undefined));
      return reply.status(201).send(view(await dispatch.start(id, goal, clean)));
    });
    app.get('/projects/:id/work', async (req) => dispatch.list(parse(IdParams, req.params).id).map(view));
    app.get('/projects/:id/work/:goalId', async (req) => {
      const { id, goalId } = parse(GoalParams, req.params);
      return view(dispatch.get(id, goalId));
    });
    app.post('/projects/:id/work/:goalId/cancel', async (req, reply) => {
      const { id, goalId } = parse(GoalParams, req.params);
      return reply.status(202).send(view(dispatch.cancel(id, goalId)));
    });
    /* continue a stopped goal: its unfinished items carry on where they were */
    app.post('/projects/:id/work/:goalId/resume', async (req, reply) => {
      const { id, goalId } = parse(GoalParams, req.params);
      return reply.status(202).send(view(dispatch.resume(id, goalId)));
    });
    /* start a stopped or finished task over from main's tip (earlier unmerged work stays on a renamed branch) */
    app.post('/projects/:id/tasks/:itemId/restart-fresh', async (req, reply) => {
      const { id, itemId } = parse(ItemParams, req.params);
      const { item, keptOn } = await dispatch.restartFresh(id, itemId);
      dispatch.board.changed(id, [item.goalId]);
      return reply.status(202).send({ goal: view(dispatch.get(id, item.goalId)), keptOn });
    });
  };
