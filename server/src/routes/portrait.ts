/* The project's picture (OFFICE icon). PUT /image = upload raw bytes (Content-Type image/png|jpeg|webp|gif|svg+xml|
   x-icns, or octet-stream when the browser can't name it); PUT /image/source {path} = use an icon file inside the project folder; DELETE = back to the tile;
   GET = the bytes. A copy is always kept in the data dir, never written into the project folder. */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { parse } from '../errors.ts';
import { declaredType, MAX_SOURCE_BYTES, UPLOAD_TYPES } from '../office/image-types.ts';
import type { Portraits } from '../office/portrait.ts';
import { IdParams } from './schemas.ts';

const LinkBody = z.strictObject({ path: z.string().trim().min(1).max(500) });

export const portraitRoutes =
  ({ portraits }: { portraits: Portraits }): FastifyPluginAsync =>
  async (app) => {
    /* raw bytes for the image types only (anything else is Fastify's 415); a little over the cap so ours speaks */
    app.addContentTypeParser(
      UPLOAD_TYPES,
      { parseAs: 'buffer', bodyLimit: MAX_SOURCE_BYTES + 64 * 1024 },
      (_req, body, done) => done(null, body),
    );
    app.put('/projects/:id/image', async (req) => {
      const { id } = parse(IdParams, req.params);
      const body = req.body instanceof Buffer ? req.body : Buffer.alloc(0);
      return portraits.put(id, body, declaredType(req.headers['content-type']));
    });
    app.put('/projects/:id/image/source', async (req) =>
      portraits.link(parse(IdParams, req.params).id, parse(LinkBody, req.body).path),
    );
    app.delete('/projects/:id/image', async (req) => portraits.remove(parse(IdParams, req.params).id));
    app.get('/projects/:id/image', async (req, reply) => {
      const { id } = parse(IdParams, req.params);
      const img = portraits.read(id);
      if (!img)
        return reply
          .status(404)
          .send({ error: { code: 'not_found', message: 'No picture for this project' } });
      return (
        reply
          .header('content-type', img.type)
          .header('cache-control', 'private, max-age=31536000, immutable')
          .header('x-content-type-options', 'nosniff')
          /* an SVG opened on its own runs no script and loads nothing */
          .header('content-security-policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox")
          .send(img.bytes)
      );
    });
  };
