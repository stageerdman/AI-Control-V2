/* STUDIO LIFE: each agent's saved to-do list (open first, in the order they came). */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { Store } from '../db/store.ts';
import { parse } from '../errors.ts';
import type { Todos } from '../todos/todos.ts';
import { Id, IdParams } from './schemas.ts';

const Query = z.object({ agentId: Id });

export const todoRoutes =
  ({ todos, store }: { todos: Todos; store: Store }): FastifyPluginAsync =>
  async (app) => {
    app.get('/projects/:id/todos', async (req) => {
      const { id } = parse(IdParams, req.params);
      store.projects.require(id);
      return { todos: todos.list(id, parse(Query, req.query).agentId) };
    });
  };
