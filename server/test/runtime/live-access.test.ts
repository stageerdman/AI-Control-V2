/* LIVE ACCESS: an access shared while an agent works reaches its running session — written into the .env of its
   working folder and announced after its next step ('live') — or, when that can't be written, the agent is told
   to restart (forget), and the fresh session has it in its environment and its prompt. Never a value in a message. */
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { getChatMessages } from '../../src/db/chats.ts';
import { accessNotice } from '../../src/runtime/access-notice.ts';
import { type FakeStep, fakeRunner } from '../../src/runtime/fake.ts';
import type { RunSpec } from '../../src/runtime/runner.ts';
import { testApp } from '../helpers.ts';

const KEY = 'sk_live_9f8e7d6c5b4a3210';
const NOTE = { where: 'cart done', doing: 'payments', next: 'charge with Stripe' };

describe('an access shared with a working agent', () => {
  let h: ReturnType<typeof testApp>;
  afterEach(() => h.close());

  const setup = async (script: (spec: RunSpec) => FakeStep[]) => {
    const specs: RunSpec[] = [];
    const recorded = (s: RunSpec) => {
      specs.push(s);
      return script(s);
    };
    h = testApp({ seed: true, runner: fakeRunner(recorded) });
    const folder = join(h.config.sandbox, 'aurora');
    mkdirSync(folder);
    h.store.projects.update('aurora', { folder: 'aurora' });
    const access = (
      await h.call('POST', '/accesses', { name: 'Stripe', fields: [{ label: 'Secret key', value: KEY }] })
    ).body;
    const envVar = access.fields[0].envVar as string;
    const run = (
      await h.call('POST', '/projects/aurora/runs', { agentId: 'a-pete', task: 'Build checkout.' })
    ).body;
    return { specs, folder, envVar, accessId: access.id as string, run };
  };

  it('works in the current session: the value lands in its .env and the agent is told it can use it now', async () => {
    const { specs, folder, envVar, accessId, run } = await setup(() => [{ wait: 5000 }]);
    expect(specs[0]?.env[envVar]).toBeUndefined(); // not granted when it started

    expect((await h.call('PUT', `/projects/aurora/access/${accessId}`)).status).toBe(200);

    expect(readFileSync(join(folder, '.env'), 'utf8')).toContain(`${envVar}=${KEY}`);
    const nudge = h.runtime.internal.nudge(run.id) as string;
    expect(nudge).toContain('a new access (Stripe) was shared with you');
    expect(nudge).toContain(`\`${envVar}\``);
    expect(nudge).toContain('You can use it now');
    expect(nudge).not.toContain(KEY);
    expect(specs[0]?.secretValues).toContain(KEY); // scrubbed from this session's stream from now on
    const said = getChatMessages(h.db, run.id).find((m) => m.meta?.kind === 'access');
    expect(said).toMatchObject({ role: 'system', meta: { pickup: 'live', accessId } });
    expect(said?.text).not.toContain(KEY);
    await h.call('POST', `/projects/aurora/runs/${run.id}/cancel`);
  });

  it("can't be written → a clear restart notice; forget restarts with chat and work kept and the access in place", async () => {
    const { specs, folder, envVar, accessId, run } = await setup((s) =>
      s.task.startsWith('You chose to forget')
        ? [{ result: 'Charged.' }]
        : [{ wait: 300 }, { tool: 'forget', args: NOTE }, { wait: 5000 }],
    );
    rmSync(folder, { recursive: true }); // its working folder is gone: nothing to write into
    await h.call('PUT', `/projects/aurora/access/${accessId}`);

    const nudge = h.runtime.internal.nudge(run.id) as string;
    expect(nudge).toContain('a new access (Stripe) was shared with you');
    expect(nudge).toContain('Restart your session to use it');
    expect(nudge).toContain('`forget`');
    expect(nudge).not.toContain(KEY);

    const ended = await h.runtime.settled(run.id);
    expect(ended).toMatchObject({ id: run.id, status: 'succeeded', result: 'Charged.' }); // the same run
    expect(specs).toHaveLength(2);
    expect(specs[1]?.env[envVar]).toBe(KEY); // the fresh session has it
    expect(specs[1]?.systemPrompt).toContain(`Secret key → \`${envVar}\``);
    const chat = getChatMessages(h.db, run.id);
    expect(chat[0]?.text).toBe('Build checkout.'); // one chat, kept
    expect(chat.find((m) => m.meta?.kind === 'access')?.meta).toMatchObject({ pickup: 'restart' });
    expect(JSON.stringify(chat)).not.toContain(KEY);
  });

  it('reaches nobody when no one is working, and a revoke sends no notice', async () => {
    const { accessId, run } = await setup(() => [{ wait: 5000 }]);
    await h.call('PUT', `/projects/aurora/access/${accessId}`);
    h.runtime.internal.nudge(run.id); // the grant's notice
    await h.call('DELETE', `/projects/aurora/access/${accessId}`);
    expect(h.runtime.internal.nudge(run.id)).toBeNull();
    await h.call('POST', `/projects/aurora/runs/${run.id}/cancel`);
    await h.runtime.settled(run.id);
    expect(h.runtime.accessShared('aurora', accessId)).toEqual([]);
  });
});

describe('accessNotice', () => {
  const stripe = {
    name: 'Stripe',
    serves: '',
    instructions: '',
    fields: [
      { label: 'Secret key', envVar: 'STRIPE_SECRET_KEY', hasValue: true },
      { label: 'Account', envVar: 'STRIPE_ACCOUNT', hasValue: false },
    ],
    folder: null,
  };
  it('a shared folder names its path, read and write', () => {
    const vault = { name: 'Vault', serves: '', instructions: '', fields: [], folder: '/Users/me/Library/x' };
    expect(accessNotice(vault, 'restart', true)).toContain('read and write: `/Users/me/Library/x`');
  });
  it('names the access and its env vars, and marks fields with no value yet', () => {
    const live = accessNotice(stripe, 'live', true);
    expect(live).toContain('a new access (Stripe) was shared with you');
    expect(live).toContain('Secret key → `STRIPE_SECRET_KEY`, Account → `STRIPE_ACCOUNT` (not set yet)');
  });
  it('without forget, the restart notice still says to restart', () => {
    const r = accessNotice(stripe, 'restart', false);
    expect(r).toContain('Restart your session to use it');
    expect(r).not.toContain('forget');
  });
});
