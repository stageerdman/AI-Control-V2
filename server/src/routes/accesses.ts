/* The cabinet API (G1): accesses = named bundles of fields. Secret values are write-only: they go in
   on create / add field / PUT …/value and no response ever contains one (only hasValue + last4);
   a field marked `secret: false` shows its value. */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { parse } from '../errors.ts';
import type { Cabinet } from '../secrets/cabinet.ts';
import { ENV_KEY } from '../secrets/dotenv.ts';
import type { ProjectAccess } from '../secrets/projectAccess.ts';
import { Id, IdParams, Name, Text } from './schemas.ts';

/* pasted keys often carry a trailing newline — trim, then insist on one line */
export const Value = z
  .string()
  .trim()
  .min(1)
  .max(8192)
  .refine((v) => !/[\n\r\0]/.test(v), 'A key must be a single line');
export const EnvVar = z
  .string()
  .trim()
  .max(100)
  .regex(ENV_KEY, 'Use letters, digits and _ (not starting with a digit)');
export const accessInfo = {
  name: Name,
  serves: z.string().trim().max(200).optional(),
  docsUrl: z
    .url({ protocol: /^https?$/ })
    .max(2000)
    .nullable()
    .optional(),
  instructions: Text.optional(),
};
const Label = z.string().trim().min(1).max(60);
const FieldCreate = z.strictObject({
  label: Label,
  envVar: EnvVar.optional(),
  secret: z.boolean().optional(),
  value: Value.optional(),
});
/* a folder access shares its folder (read, or read and write: the default), so it needs no field; any other
   access needs at least one. Global through /accesses, local to one project through /projects/:id/accesses. */
const AccessCreate = z
  .strictObject({
    ...accessInfo,
    folder: z.string().trim().min(1).max(1024).optional(),
    folderMode: z.enum(['read', 'write']).optional(),
    fields: z.array(FieldCreate).max(20),
  })
  .refine((a) => a.folder !== undefined || a.fields.length > 0, {
    message: 'An access needs at least one field',
    path: ['fields'],
  })
  .refine((a) => a.folder !== undefined || a.folderMode === undefined, {
    message: 'Only a folder access has a folder mode',
    path: ['folderMode'],
  });
const AccessPatch = z.strictObject({ ...accessInfo, name: Name.optional() });
const FieldPatch = z.strictObject({
  label: Label.optional(),
  envVar: EnvVar.optional(),
  secret: z.boolean().optional(),
});
const ValueBody = z.strictObject({ value: Value });
const FieldParams = z.object({ id: Id, fieldId: Id });
const GrantParams = z.object({ id: Id, accessId: Id });
/* partial: only the toggled entries — `{ "grants": { "a-stripe": true } }` */
const GrantsBody = z.strictObject({ grants: z.record(Id, z.boolean()) });

export const accessesRoutes =
  ({ cabinet, access }: { cabinet: Cabinet; access: ProjectAccess }): FastifyPluginAsync =>
  async (app) => {
    app.get('/accesses', async () => cabinet.list());
    app.get('/accesses/:id', async (req) => cabinet.get(parse(IdParams, req.params).id));
    app.post('/accesses', async (req, reply) =>
      reply.status(201).send(cabinet.create(parse(AccessCreate, req.body))),
    );
    app.patch('/accesses/:id', async (req) =>
      cabinet.update(parse(IdParams, req.params).id, parse(AccessPatch, req.body)),
    );
    /* not restorable — an undo snapshot would have to keep the values */
    app.delete('/accesses/:id', async (req) => cabinet.remove(parse(IdParams, req.params).id));
    app.post('/accesses/import', async () => cabinet.importFromEnv());

    app.post('/accesses/:id/fields', async (req, reply) =>
      reply.status(201).send(cabinet.addField(parse(IdParams, req.params).id, parse(FieldCreate, req.body))),
    );
    app.patch('/accesses/:id/fields/:fieldId', async (req) => {
      const { id, fieldId } = parse(FieldParams, req.params);
      return cabinet.updateField(id, fieldId, parse(FieldPatch, req.body));
    });
    app.delete('/accesses/:id/fields/:fieldId', async (req) => {
      const { id, fieldId } = parse(FieldParams, req.params);
      return cabinet.removeField(id, fieldId);
    });
    /* set / replace a value — a secret's old value is never shown */
    app.put('/accesses/:id/fields/:fieldId/value', async (req) => {
      const { id, fieldId } = parse(FieldParams, req.params);
      return cabinet.setValue(id, fieldId, parse(ValueBody, req.body).value);
    });

    /* per project: which accesses it may use (none by default), sync, seen */
    app.get('/projects/:id/access', async (req) => access.view(parse(IdParams, req.params).id));
    /* an access of this project only, switched on at once; answers with the project's view */
    app.post('/projects/:id/accesses', async (req, reply) =>
      reply.status(201).send(access.addLocal(parse(IdParams, req.params).id, parse(AccessCreate, req.body))),
    );
    app.put('/projects/:id/access', async (req) =>
      access.setGrants(parse(IdParams, req.params).id, parse(GrantsBody, req.body).grants),
    );
    app.put('/projects/:id/access/:accessId', async (req) => {
      const { id, accessId } = parse(GrantParams, req.params);
      return access.setGrants(id, { [accessId]: true });
    });
    app.delete('/projects/:id/access/:accessId', async (req) => {
      const { id, accessId } = parse(GrantParams, req.params);
      return access.setGrants(id, { [accessId]: false });
    });
    app.post('/projects/:id/access/sync', async (req) => access.sync(parse(IdParams, req.params).id));
    app.post('/projects/:id/access/seen', async (req) => access.markSeen(parse(IdParams, req.params).id));
  };
