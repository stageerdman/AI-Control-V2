/* The B3 Key Cabinet API, kept while the app still calls it (G3 moves it to /accesses): a credential is
   an access read through its first field. Values are write-only — no response ever contains one. */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { parse } from '../errors.ts';
import type { Cabinet } from '../secrets/cabinet.ts';
import { accessInfo, EnvVar, Value } from './accesses.ts';
import { IdParams, Name } from './schemas.ts';

const CredentialCreate = z.strictObject({
  ...accessInfo,
  envVar: EnvVar.optional(),
  value: Value.optional(),
});
const CredentialPatch = z.strictObject({ ...accessInfo, name: Name.optional() });
const ValueBody = z.strictObject({ value: Value });

export const credentialRoutes =
  ({ cabinet }: { cabinet: Cabinet }): FastifyPluginAsync =>
  async (app) => {
    const c = cabinet.credentials;
    app.get('/credentials', async () => c.list());
    app.get('/credentials/:id', async (req) => c.get(parse(IdParams, req.params).id));
    app.post('/credentials', async (req, reply) =>
      reply.status(201).send(c.create(parse(CredentialCreate, req.body))),
    );
    app.patch('/credentials/:id', async (req) =>
      c.update(parse(IdParams, req.params).id, parse(CredentialPatch, req.body)),
    );
    app.put('/credentials/:id/value', async (req) =>
      c.replaceValue(parse(IdParams, req.params).id, parse(ValueBody, req.body).value),
    );
    app.delete('/credentials/:id', async (req) => c.remove(parse(IdParams, req.params).id));
    app.post('/credentials/import', async () => c.importFromEnv());
  };
