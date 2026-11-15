/* STUDIO LIFE: the office mailbox — inbox (HQ's includes mail addressed to HQ), sent, one letter, file / unfile,
   the user writing a letter, and "the office opened" (the director reads the new mail in the background). */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { parse } from '../errors.ts';
import { type MailDesk, SendSchema } from '../office/mail.ts';
import { Id, IdParams } from './schemas.ts';

const BoxQuery = z.object({ box: z.enum(['in', 'sent']).optional() });
const MailParams = z.object({ id: Id, mailId: z.uuid() });
const StatusBody = z.strictObject({ status: z.enum(['filed', 'new']) });

export const mailRoutes =
  ({ mail }: { mail: MailDesk }): FastifyPluginAsync =>
  async (app) => {
    app.get('/projects/:id/mail', async (req) => {
      const { id } = parse(IdParams, req.params);
      const inbox = mail.inbox(id);
      const box = parse(BoxQuery, req.query).box;
      return {
        mail: box === 'sent' ? mail.sent(id) : inbox,
        unread: inbox.filter((m) => m.status === 'new').length,
        sent: mail.sent(id).length,
        triaging: mail.busy(id),
      };
    });
    app.get('/projects/:id/mail/:mailId', async (req) => {
      const { id, mailId } = parse(MailParams, req.params);
      return mail.get(id, mailId);
    });
    app.patch('/projects/:id/mail/:mailId', async (req) => {
      const { id, mailId } = parse(MailParams, req.params);
      return mail.setStatus(id, mailId, parse(StatusBody, req.body).status);
    });
    /* the user writes from this office */
    app.post('/projects/:id/mail', async (req, reply) =>
      reply
        .status(201)
        .send(
          mail.send(
            { projectId: parse(IdParams, req.params).id, agentId: null },
            parse(SendSchema, req.body),
          ),
        ),
    );
    app.get('/mail/directory', async () => ({ addresses: mail.directory(null) }));
    /* the office opened: the director reads new mail on its own (202 — it lands as events + chat lines) */
    app.post('/projects/:id/mail/open', async (req, reply) => {
      const { id } = parse(IdParams, req.params);
      const unread = mail.inbox(id).filter((m) => m.status === 'new').length;
      if (unread)
        void mail.triage(id).catch((e: Error) => req.log.warn({ err: e.message }, 'mail triage failed'));
      return reply.status(202).send({ unread, triaging: unread > 0 });
    });
  };
