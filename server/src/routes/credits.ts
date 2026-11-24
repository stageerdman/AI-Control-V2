/* AI Credits Tracker: the plan's usage, studio-wide. GET /credits once; GET /credits/events live — the view on
   connect, after every new reading, and once a minute so "runs out at" and "resets in" stay current while idle. */
import type { FastifyPluginAsync } from 'fastify';
import type { Credits, CreditsView } from '../credits/credits.ts';
import { type OpenStreams, openPipe } from '../http/sse.ts';

export const REFRESH_MS = 60_000;

const creditsFrame = (v: CreditsView) => `event: credits\ndata: ${JSON.stringify(v)}\n\n`;

export const creditsRoutes =
  ({
    credits,
    open,
    heartbeatMs,
    refreshMs = REFRESH_MS,
  }: {
    credits: Credits;
    open: OpenStreams;
    heartbeatMs?: number;
    refreshMs?: number;
  }): FastifyPluginAsync =>
  async (app) => {
    app.get('/credits', async () => credits.view());
    app.get('/credits/events', async (req, reply) => {
      let stop = () => {};
      const res = openPipe(req, reply, {
        open,
        ...(heartbeatMs === undefined ? {} : { heartbeatMs }),
        onClose: () => stop(),
      });
      const send = (v: CreditsView) => res.write(creditsFrame(v));
      const unwatch = credits.watch(send);
      const tick = setInterval(() => send(credits.view()), refreshMs);
      stop = () => {
        clearInterval(tick);
        unwatch();
      };
      send(credits.view());
    });
  };
