/* Cast data: the three lists from the query cache + optimistic auto-save (no Save buttons).
   Every edit lands in the cache at once, then goes to the server one request at a time per
   record (a queue), so a slow reply never overwrites a newer local edit. Errors: a calm toast
   and a re-sync from the server. Deletes return a restore token → the Undo toast. */
import { getQueryData, invalidate, isApiError, setQueryData, useQuery } from '../../api';
import type {
  Agent,
  AgentCreate,
  AgentPatch,
  Deleted,
  Role,
  Team,
  TeamCreate,
  TeamPatch,
} from '../../api/types';
import { toast } from '../../ui';
import { castApi, KEYS } from './api';
import { announce } from './fx';

export function useCast() {
  const agents = useQuery(KEYS.agents, castApi.agents.list);
  const roles = useQuery(KEYS.roles, castApi.roles.list);
  const teams = useQuery(KEYS.teams, castApi.teams.list);
  return {
    agents: agents.data,
    roles: roles.data,
    teams: teams.data,
    loading: agents.loading || roles.loading || teams.loading,
    error: agents.error ?? roles.error ?? teams.error,
    retry: () => Promise.all([agents.refetch(), roles.refetch(), teams.refetch()]),
  };
}

export const resync = () =>
  Promise.all([invalidate(KEYS.agents), invalidate(KEYS.roles), invalidate(KEYS.teams)]);

export function failed(e: unknown) {
  const msg = isApiError(e) ? e.message : 'Couldn’t save that.';
  toast(`${msg.replace(/\.$/, '')}. Nothing was lost — showing what the studio has.`);
  void resync();
}

/* ---------- list helpers ---------- */
const upsert =
  <T extends { id: string }>(x: T) =>
  (list: T[] | undefined) =>
    list?.some((y) => y.id === x.id) ? list.map((y) => (y.id === x.id ? x : y)) : [...(list ?? []), x];
const edit =
  <T extends { id: string }>(id: string, fn: (x: T) => T) =>
  (list: T[] | undefined) =>
    (list ?? []).map((y) => (y.id === id ? fn(y) : y));

/* ---------- per-record queue + versioning ---------- */
const chains = new Map<string, Promise<unknown>>();
const versions = new Map<string, number>();
function enqueue<R>(key: string, job: () => Promise<R>): Promise<R> {
  const prev = chains.get(key) ?? Promise.resolve();
  const next = prev.then(job, job);
  chains.set(
    key,
    next.catch(() => undefined),
  );
  return next;
}
const bump = (key: string) => {
  const v = (versions.get(key) ?? 0) + 1;
  versions.set(key, v);
  return v;
};
const latest = (key: string, v: number) => versions.get(key) === v;

/* ---------- debounce for typing (name, prompt, blurb, team texts, jobs) ---------- */
const timers = new Map<string, { t: ReturnType<typeof setTimeout>; fn: () => void }>();
export function later(key: string, fn: () => void, ms = 400) {
  const cur = timers.get(key);
  if (cur) clearTimeout(cur.t);
  timers.set(key, {
    t: setTimeout(() => {
      timers.delete(key);
      fn();
    }, ms),
    fn,
  });
}
/** Run every pending debounced save now (leaving a panel, closing the zoom). */
export function flushAll() {
  for (const [k, { t, fn }] of timers) {
    clearTimeout(t);
    timers.delete(k);
    fn();
  }
}

/* ---------- agents ---------- */
type SaveOpts = {
  onSaved?: () => void /** extra display fields to show at once (e.g. the role name) */;
  view?: Partial<Agent>;
};
export function saveAgent(
  id: string,
  patch: AgentPatch,
  { onSaved, view }: SaveOpts = {},
): Promise<Agent | undefined> {
  const key = `agent:${id}`;
  const v = bump(key);
  setQueryData<Agent[]>(
    KEYS.agents,
    edit<Agent>(id, (a) => ({ ...a, ...(patch as Partial<Agent>), ...view })),
  );
  return enqueue(key, () => castApi.agents.update(id, patch)).then(
    (a) => {
      if (latest(key, v)) setQueryData<Agent[]>(KEYS.agents, upsert(a));
      onSaved?.();
      return a;
    },
    (e) => {
      failed(e);
      return undefined;
    },
  );
}

/** Typing / clicking fast: show it now, send one merged PATCH when it settles. */
const pending = new Map<string, AgentPatch>();
export function saveAgentSoon(id: string, patch: AgentPatch, opts: SaveOpts = {}, ms = 400) {
  setQueryData<Agent[]>(
    KEYS.agents,
    edit<Agent>(id, (a) => ({ ...a, ...(patch as Partial<Agent>), ...opts.view })),
  );
  pending.set(id, { ...pending.get(id), ...patch });
  later(
    `agent:${id}`,
    () => {
      const p = pending.get(id);
      pending.delete(id);
      if (p) void saveAgent(id, p, opts);
    },
    ms,
  );
}

export async function createAgent(body: AgentCreate): Promise<Agent | undefined> {
  try {
    const a = await castApi.agents.create(body);
    setQueryData<Agent[]>(KEYS.agents, upsert(a));
    if (body.roleId) void invalidate(KEYS.roles);
    return a;
  } catch (e) {
    failed(e);
    return undefined;
  }
}

/** Delete + an Undo toast that restores it (teams, captaincy and projects come back too). */
export async function deleteAgent(a: Agent, then?: () => void) {
  let res: Deleted;
  try {
    res = await castApi.agents.remove(a.id);
  } catch (e) {
    failed(e);
    return false;
  }
  setQueryData<Agent[]>(KEYS.agents, (l) => (l ?? []).filter((x) => x.id !== a.id));
  void invalidate(KEYS.teams);
  void invalidate(KEYS.roles);
  const moved = a.kind === 'orchestrator' ? a.projectIds.length : 0;
  if (moved) {
    void invalidate('projects');
    void invalidate(KEYS.agents); // the other orchestrator's project count
  }
  then?.();
  const also = moved ? ` · ${moved} project${moved === 1 ? '' : 's'} handed to another orchestrator` : '';
  toast(`${a.name} deleted${also}`, {
    undo: () => void restore(res.restoreToken, `${a.name} is back.`),
  });
  return true;
}

export async function restore(token: string, said: string) {
  try {
    await castApi.restore(token);
    await resync();
    void invalidate('projects');
    announce(said);
  } catch (e) {
    failed(e);
  }
}

/* ---------- roles ---------- */
/** Pick-or-create by name: returns the role (existing on a 409 race). */
export async function ensureRole(name: string): Promise<Role | undefined> {
  const hit = getQueryData<Role[]>(KEYS.roles)?.find((r) => r.name.toLowerCase() === name.toLowerCase());
  if (hit) return hit;
  try {
    const r = await castApi.roles.create(name);
    setQueryData<Role[]>(KEYS.roles, upsert(r));
    return r;
  } catch (e) {
    if (isApiError(e) && e.status === 409) {
      await invalidate(KEYS.roles);
      return getQueryData<Role[]>(KEYS.roles)?.find((r) => r.name.toLowerCase() === name.toLowerCase());
    }
    failed(e);
    return undefined;
  }
}

/** Rename: every agent with the role follows (the server stores role by id). false = taken/empty. */
export async function renameRole(id: string, name: string): Promise<boolean> {
  try {
    const r = await castApi.roles.rename(id, name);
    setQueryData<Role[]>(KEYS.roles, upsert(r));
    setQueryData<Agent[]>(KEYS.agents, (l) =>
      (l ?? []).map((a) => (a.roleId === id ? { ...a, role: r.name } : a)),
    );
    return true;
  } catch (e) {
    if (isApiError(e) && (e.status === 409 || e.status === 422)) return false;
    failed(e);
    return false;
  }
}

export function setRoleReporter(id: string, reporter: boolean, onSaved?: () => void) {
  setQueryData<Role[]>(
    KEYS.roles,
    edit<Role>(id, (r) => ({ ...r, reporter })),
  );
  return enqueue(`role:${id}`, () => castApi.roles.setReporter(id, reporter)).then((r) => {
    setQueryData<Role[]>(KEYS.roles, upsert(r));
    onSaved?.();
  }, failed);
}

export function setRoleToolsmith(id: string, toolsmith: boolean, onSaved?: () => void) {
  setQueryData<Role[]>(
    KEYS.roles,
    edit<Role>(id, (r) => ({ ...r, toolsmith })),
  );
  return enqueue(`role:${id}`, () => castApi.roles.setToolsmith(id, toolsmith)).then((r) => {
    setQueryData<Role[]>(KEYS.roles, upsert(r));
    onSaved?.();
  }, failed);
}

export async function deleteRole(r: Role, then?: () => void) {
  let res: Deleted;
  try {
    res = await castApi.roles.remove(r.id);
  } catch (e) {
    failed(e);
    return;
  }
  setQueryData<Role[]>(KEYS.roles, (l) => (l ?? []).filter((x) => x.id !== r.id));
  setQueryData<Agent[]>(KEYS.agents, (l) =>
    (l ?? []).map((a) => (a.roleId === r.id ? { ...a, roleId: null, role: '' } : a)),
  );
  then?.();
  const n = r.agentCount;
  toast(`Role “${r.name}” deleted${n ? ` · ${n} agent${n === 1 ? '' : 's'} now without a role` : ''}`, {
    undo: () => void restore(res.restoreToken, `Role ${r.name} restored.`),
  });
}

/* ---------- teams ---------- */
/** Optimistic team change: `local` moves the stage now, `remote` saves; the reply wins if nothing newer. */
export function teamOp(
  id: string,
  local: (t: Team) => Team,
  remote: () => Promise<Team>,
  { onSaved, members = false }: { onSaved?: () => void; members?: boolean } = {},
): Promise<Team | undefined> {
  const key = `team:${id}`;
  const v = bump(key);
  setQueryData<Team[]>(KEYS.teams, edit<Team>(id, local));
  return enqueue(key, remote).then(
    (t) => {
      if (latest(key, v)) setQueryData<Team[]>(KEYS.teams, upsert(t));
      if (members) void invalidate(KEYS.agents); // agents carry teamIds
      onSaved?.();
      return t;
    },
    (e) => {
      failed(e);
      return undefined;
    },
  );
}

export const patchTeam = (id: string, patch: TeamPatch, onSaved?: () => void) =>
  teamOp(
    id,
    (t) => ({ ...t, ...(patch as Partial<Team>) }),
    () => castApi.teams.update(id, patch),
    { onSaved },
  );

export async function createTeam(body: TeamCreate): Promise<Team | undefined> {
  try {
    const t = await castApi.teams.create(body);
    setQueryData<Team[]>(KEYS.teams, upsert(t));
    void invalidate(KEYS.agents);
    return t;
  } catch (e) {
    failed(e);
    return undefined;
  }
}

export async function deleteTeam(t: Team, then?: () => void) {
  let res: Deleted;
  try {
    res = await castApi.teams.remove(t.id);
  } catch (e) {
    failed(e);
    return;
  }
  setQueryData<Team[]>(KEYS.teams, (l) => (l ?? []).filter((x) => x.id !== t.id));
  void invalidate(KEYS.agents);
  then?.();
  toast(`${t.name} deleted`, { undo: () => void restore(res.restoreToken, `${t.name} restored.`) });
}

/** Typing in a team field: show it now, one merged PATCH when it settles. */
const teamPending = new Map<string, TeamPatch>();
export function patchTeamSoon(id: string, patch: TeamPatch, onSaved?: () => void, ms = 400) {
  setQueryData<Team[]>(
    KEYS.teams,
    edit<Team>(id, (t) => ({ ...t, ...(patch as Partial<Team>) })),
  );
  teamPending.set(id, { ...teamPending.get(id), ...patch });
  later(
    `team:${id}`,
    () => {
      const p = teamPending.get(id);
      teamPending.delete(id);
      if (p) void patchTeam(id, p, onSaved);
    },
    ms,
  );
}

/** A member's job on this team (debounced per member). */
export function setJobSoon(id: string, agentId: string, instr: string, onSaved?: () => void) {
  setQueryData<Team[]>(
    KEYS.teams,
    edit<Team>(id, (t) => ({
      ...t,
      members: t.members.map((m) => (m.agentId === agentId ? { ...m, instr } : m)),
    })),
  );
  later(
    `job:${id}:${agentId}`,
    () => {
      void teamOp(
        id,
        (t) => t,
        () => castApi.teams.setJob(id, agentId, instr),
        { onSaved },
      );
    },
    400,
  );
}
