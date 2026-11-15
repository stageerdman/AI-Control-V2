/* STUDIO LIFE: design an agent with Tinker — a saved chat with a live draft; GET shows what Tinker is doing now. */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { type CreatorChat, DraftPatchSchema } from '../crew/creator-chat.ts';
import { parse } from '../errors.ts';

const Text = z.string().trim().min(1).max(4000);
const CreateBody = z.strictObject({ text: Text.optional() });
const ChatBody = z.strictObject({ text: Text });
const EditBody = z.strictObject({ draft: DraftPatchSchema });
const Params = z.object({ id: z.uuid() });

export const creatorChatRoutes =
  ({ chats }: { chats: CreatorChat }): FastifyPluginAsync =>
  async (app) => {
    app.get('/creator/sessions', async () => ({ sessions: chats.list() }));
    app.post('/creator/sessions', async (req, reply) =>
      reply.status(201).send(await chats.create(parse(CreateBody, req.body ?? {}).text)),
    );
    app.get('/creator/sessions/:id', async (req) => chats.get(parse(Params, req.params).id));
    app.post('/creator/sessions/:id/chat', async (req) =>
      chats.say(parse(Params, req.params).id, parse(ChatBody, req.body).text),
    );
    app.patch('/creator/sessions/:id', async (req) =>
      chats.edit(parse(Params, req.params).id, parse(EditBody, req.body).draft),
    );
    app.post('/creator/sessions/:id/accept', async (req, reply) =>
      reply.status(201).send({ agent: chats.accept(parse(Params, req.params).id) }),
    );
    app.delete('/creator/sessions/:id', async (req, reply) => {
      chats.drop(parse(Params, req.params).id);
      return reply.status(204).send();
    });
  };
