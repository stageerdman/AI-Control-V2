/* The Key Cabinet API. Values are write-only: POST and PUT …/value accept one,
   no response ever contains it (only hasValue + last4). */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { parse } from '../errors.ts';
import type { Cabinet } from '../secrets/cabinet.ts';
import { ENV_KEY } from '../secrets/dotenv.ts';
import { IdParams, Name, Text } from './schemas.ts';

/* pasted keys often carry a trailing newline — trim, then insist on one line */
const Value = z
  .string()
  .trim()
  .min(1)
  .max(8192)
  .refine((v) => !/[\n\r\0]/.test(v), 'A key must be a single line');
const EnvVar = z
  .string()
  .trim()
  .max(100)
  .regex(ENV_KEY, 'Use letters, digits and _ (not starting with a digit)');
const meta = {
  name: Name,
  serves: z.string().trim().max(200).optional(),
  docsUrl: z
    .url({ protocol: /^https?$/ })
    .max(2000)
    .nullable()
    .optional(),
  instructions: Text.optional(),
};
const CredentialCreate = z.strictObject({ ...meta, envVar: EnvVar.optional(), value: Value.optional() });
const CredentialPatch = z.strictObject({ ...meta, name: Name.optional() });
const ValueBody = z.strictObject({ value: Value });

export const credentialRoutes =
  ({ cabinet }: { cabinet: Cabinet }): FastifyPluginAsync =>
  async (app) => {
    app.get('/credentials', async () => cabinet.list());
    app.get('/credentials/:id', async (req) => cabinet.get(parse(IdParams, req.params).id));
    app.post('/credentials', async (req, reply) =>
      reply.status(201).send(cabinet.create(parse(CredentialCreate, req.body))),
    );
    /* metadata only; envVar is fixed at creation (it's the key in every .env) */
    app.patch('/credentials/:id', async (req) =>
      cabinet.update(parse(IdParams, req.params).id, parse(CredentialPatch, req.body)),
    );
    /* replace key — the old one is never shown */
    app.put('/credentials/:id/value', async (req) =>
      cabinet.replaceValue(parse(IdParams, req.params).id, parse(ValueBody, req.body).value),
    );
    /* not restorable — an undo snapshot would have to keep the value */
    app.delete('/credentials/:id', async (req) => cabinet.remove(parse(IdParams, req.params).id));
    app.post('/credentials/import', async () => cabinet.importFromEnv());
  };
