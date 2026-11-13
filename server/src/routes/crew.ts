/* The studio crew at work: setup chat with the orchestrator, the Agent Creator minting on accept. */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { Creator } from '../crew/creator.ts';
import type { SetupChat } from '../crew/setup-chat.ts';
import { parse } from '../errors.ts';
import { IdParams } from './schemas.ts';

const ChatBody = z.strictObject({ text: z.string().trim().min(1).max(4000).optional() });

export const crewRoutes =
  ({ chat, creator }: { chat: SetupChat; creator: Creator }): FastifyPluginAsync =>
  async (app) => {
    app.get('/drafts/:id/chat', async (req) => chat.history(parse(IdParams, req.params).id));
    /* one orchestrator turn: {text} from the user, or no text → the orchestrator opens with a proposal */
    app.post('/drafts/:id/chat', async (req) => {
      const { id } = parse(IdParams, req.params);
      const { text } = parse(ChatBody, req.body ?? {});
      return chat.say(id, text);
    });
    /* accept the plan: the Agent Creator mints every brief, the plan resolves to real ids (all or nothing) */
    app.post('/drafts/:id/accept', async (req) => creator.accept(parse(IdParams, req.params).id));
  };
