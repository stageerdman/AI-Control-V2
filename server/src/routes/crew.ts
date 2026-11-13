/* The studio crew at work: setup chat with the orchestrator. */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { SetupChat } from '../crew/setup-chat.ts';
import { parse } from '../errors.ts';
import { IdParams } from './schemas.ts';

const ChatBody = z.strictObject({ text: z.string().trim().min(1).max(4000).optional() });

export const crewRoutes =
  ({ chat }: { chat: SetupChat }): FastifyPluginAsync =>
  async (app) => {
    app.get('/drafts/:id/chat', async (req) => chat.history(parse(IdParams, req.params).id));
    /* one orchestrator turn: {text} from the user, or no text → the orchestrator opens with a proposal */
    app.post('/drafts/:id/chat', async (req) => {
      const { id } = parse(IdParams, req.params);
      const { text } = parse(ChatBody, req.body ?? {});
      return chat.say(id, text);
    });
  };
