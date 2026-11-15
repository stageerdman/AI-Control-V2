/* STUDIO LIFE: the mailbox — agents mail another project or HQ; mail to HQ waits until there is one; on open the
   director reads new mail on its own (board → a goal, discuss → a chat line, file); canMail off → no mail tools. */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { fakeBrain } from '../../src/crew/fake-brain.ts';
import { contractOf } from '../../src/crew/structured.ts';
import { type FakeStep, fakeRunner } from '../../src/runtime/fake.ts';
import type { RunSpec } from '../../src/runtime/runner.ts';
import { testApp } from '../helpers.ts';

describe('the mailbox', () => {
  let h: ReturnType<typeof testApp>;
  afterEach(() => h.close());

  it('an agent mails HQ and another project; HQ’s director puts one on the board, brings one up, files one', async () => {
    const calls: RunSpec[] = [];
    let triage: object = {};
    h = testApp({
      seed: true,
      runner: fakeRunner((spec): FakeStep[] => {
        calls.push(spec);
        if (contractOf(spec.task)?.name === 'mail-triage') return [{ result: JSON.stringify(triage) }];
        if (contractOf(spec.task) || spec.task !== 'go') return fakeBrain(spec);
        return [
          { tool: 'mail_directory', args: {} },
          {
            tool: 'send_mail',
            args: {
              to: 'HQ',
              subject: 'Pager hides asks',
              body: 'The pager hid my ask for an hour.',
              kind: 'ticket',
            },
          },
          {
            tool: 'send_mail',
            args: { to: 'hq', subject: 'Dark mode', body: 'Idea: a dark office.', kind: 'idea' },
          },
          { tool: 'send_mail', args: { to: 'HQ', subject: 'Thanks', body: 'All good.' } },
          {
            tool: 'send_mail',
            args: { to: 'atlas analytics', subject: 'Cart events', body: 'We now emit cart events.' },
          },
          { tool: 'send_mail', args: { to: 'Aurora Storefront', subject: 'x', body: 'y' } },
          { result: 'ok' },
        ];
      }),
    });
    for (const p of ['aurora', 'atlas']) {
      mkdirSync(join(h.config.sandbox, p));
      h.store.projects.update(p, { folder: p });
    }
    const r = (await h.call('POST', '/projects/aurora/runs', { agentId: 'a-pete', task: 'go' })).body;
    await h.runtime.settled(r.id);

    // no HQ yet: the three HQ letters wait; Atlas got its letter; mailing yourself is refused
    expect((await h.call('GET', '/projects/atlas/mail')).body).toMatchObject({ unread: 1 });
    const sent = (await h.call('GET', '/projects/aurora/mail?box=sent')).body.mail;
    expect(sent.map((m: { to: string; kind: string }) => [m.to, m.kind])).toEqual([
      ['atlas', 'mail'],
      ['hq', 'mail'],
      ['hq', 'idea'],
      ['hq', 'ticket'],
    ]);

    // Atlas becomes HQ: the waiting letters are its mail now
    expect((await h.call('PATCH', '/settings', { hqProjectId: 'atlas' })).body.hqProjectId).toBe('atlas');
    const inbox = (await h.call('GET', '/projects/atlas/mail')).body;
    expect(inbox.unread).toBe(4);
    const byS = (s: string) => inbox.mail.find((m: { subject: string }) => m.subject === s).id;
    triage = {
      decisions: [
        {
          mailId: byS('Pager hides asks'),
          action: 'board',
          goal: 'Make the pager keep asks visible',
          say: 'On the board.',
        },
        { mailId: byS('Dark mode'), action: 'discuss', say: 'Worth a chat — do we want a dark office?' },
        { mailId: byS('Thanks'), action: 'file', say: 'Nice note, nothing to do.' },
        { mailId: byS('Cart events'), action: 'file', say: 'Noted.' },
      ],
      summary: 'Four letters: one on the board, one to talk about, two filed.',
    };
    expect((await h.call('POST', '/projects/atlas/mail/open')).body).toEqual({ unread: 4, triaging: true });
    for (let i = 0; i < 50 && (await h.call('GET', '/projects/atlas/mail')).body.unread; i++)
      await new Promise((ok) => setTimeout(ok, 20));
    const after = (await h.call('GET', '/projects/atlas/mail')).body.mail;
    const st = (s: string) => after.find((m: { subject: string }) => m.subject === s);
    expect(st('Pager hides asks')).toMatchObject({ status: 'board', goalId: expect.any(String) });
    expect(st('Dark mode').status).toBe('discussed');
    expect(st('Thanks').status).toBe('filed');
    const goals = (await h.call('GET', '/projects/atlas/work')).body;
    expect(JSON.stringify(goals)).toContain('Make the pager keep asks visible');
    const orch = h.store.projects.require('atlas').orchestratorId;
    const thread = (await h.call('GET', `/projects/atlas/threads/${orch}/messages`)).body.messages.map(
      (m: { text: string }) => m.text,
    );
    expect(thread).toContain(
      '📬 Dark mode (from Pixel Pete in Aurora Storefront) — Worth a chat — do we want a dark office?',
    );
    expect(thread.at(-1)).toBe('Four letters: one on the board, one to talk about, two filed.');
    expect(
      (await h.call('GET', '/projects/aurora/comms')).body.comms.filter(
        (c: { kind: string }) => c.kind === 'mail',
      ),
    ).toHaveLength(4);
  });

  it('canMail off → the agent gets no mail tools', async () => {
    const calls: RunSpec[] = [];
    h = testApp({ seed: true, runner: fakeRunner((s) => (calls.push(s), [{ result: 'ok' }])) });
    mkdirSync(join(h.config.sandbox, 'aurora'));
    h.store.projects.update('aurora', { folder: 'aurora' });
    expect((await h.call('PATCH', '/agents/a-pete', { canMail: false })).body.canMail).toBe(false);
    const r = (await h.call('POST', '/projects/aurora/runs', { agentId: 'a-pete', task: 'go' })).body;
    await h.runtime.settled(r.id);
    expect(calls[0]?.studioTools?.names).not.toContain('send_mail');
  });
});
