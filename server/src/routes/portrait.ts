/* The project's picture (OFFICE portrait): PUT raw image bytes (Content-Type image/png|jpeg|webp|gif, ≤ 2 MB),
   DELETE = back to the tile, GET = the bytes. Stored in the data dir, never the project folder. */
import type { FastifyPluginAsync } from 'fastify';
import { parse } from '../errors.ts';
import { IMAGE_TYPES, MAX_IMAGE_BYTES, type Portraits } from '../office/portrait.ts';
import { IdParams } from './schemas.ts';

export const portraitRoutes =
  ({ portraits }: { portraits: Portraits }): FastifyPluginAsync =>
  async (app) => {
    /* raw bytes for the image types only (anything else is Fastify's 415); a little over the cap so ours speaks */
    app.addContentTypeParser(
      Object.keys(IMAGE_TYPES),
      { parseAs: 'buffer', bodyLimit: MAX_IMAGE_BYTES + 64 * 1024 },
      (_req, body, done) => done(null, body),
    );
    app.put('/projects/:id/image', async (req) => {
      const { id } = parse(IdParams, req.params);
      const body = req.body instanceof Buffer ? req.body : Buffer.alloc(0);
      const declared = String(req.headers['content-type'] ?? '')
        .split(';')[0]
        ?.trim();
      return portraits.put(id, body, declared);
    });
    app.delete('/projects/:id/image', async (req) => portraits.remove(parse(IdParams, req.params).id));
    app.get('/projects/:id/image', async (req, reply) => {
      const { id } = parse(IdParams, req.params);
      const img = portraits.read(id);
      if (!img)
        return reply
          .status(404)
          .send({ error: { code: 'not_found', message: 'No picture for this project' } });
      return reply
        .header('content-type', img.type)
        .header('cache-control', 'private, max-age=31536000, immutable')
        .header('x-content-type-options', 'nosniff')
        .send(img.bytes);
    });
  };
