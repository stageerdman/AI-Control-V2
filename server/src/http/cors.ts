/* CORS for the AI Studio app — exactly its origins, never a wildcard. A browser
   request from any OTHER origin is refused outright (403), not just left unreadable:
   this server can touch the file system, so a random web page must not be able to
   POST to it. Requests without an Origin (curl, the app's own runtime) pass. */
import type { FastifyInstance } from 'fastify';

export const APP_ORIGINS = ['http://localhost:1420', 'tauri://localhost'] as const;
const METHODS = 'GET, POST, PATCH, DELETE, OPTIONS';
const HEADERS = 'content-type, last-event-id';

export function allowedOrigin(origin: string, host: string | undefined): boolean {
  if ((APP_ORIGINS as readonly string[]).includes(origin)) return true;
  return !!host && (origin === `http://${host}` || origin === `https://${host}`); // same-origin
}

export function registerCors(app: FastifyInstance): void {
  app.addHook('onRequest', async (req, reply) => {
    const origin = req.headers.origin;
    if (origin === undefined) return;
    if (!allowedOrigin(origin, req.headers.host)) {
      return reply.status(403).send({ error: { code: 'forbidden_origin', message: `Origin not allowed: ${origin}` } });
    }
    reply.header('access-control-allow-origin', origin).header('vary', 'Origin');
    if (req.method === 'OPTIONS') {
      return reply
        .status(204)
        .header('access-control-allow-methods', METHODS)
        .header('access-control-allow-headers', HEADERS)
        .header('access-control-max-age', '600')
        .send();
    }
  });
}
