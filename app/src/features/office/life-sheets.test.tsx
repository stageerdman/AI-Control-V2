// @vitest-environment happy-dom
/* STUDIO LIFE sheets: notes to self, the principles binder, the mailbox, bring someone in — against a fake server. */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearQueryCache } from '../../api';
import type { Agent, DeskNote, Mail } from '../../api/types';
import { BringInBody } from './BringInSheet';
import { NoteBody } from './DeskNoteSheet';
import { MailBody } from './MailSheet';
import { PrinciplesBody } from './PrinciplesSheet';

const look = { hat: 'none', tool: 'none', body: 'hero', antenna: 'bob', face: 'none', hue: 'rose' };
const agent = (id: string, name: string, kind: Agent['kind'] = 'agent') =>
  ({ id, name, nick: null, kind, look, role: 'Research', roleId: null }) as unknown as Agent;
const AGENTS = [
  agent('a-ada', 'Ada'),
  agent('a-pixel', 'Pixel'),
  agent('a-max', 'Max', 'orchestrator'),
  agent('a-zed', 'Zed'),
];
const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
const note = (id: string, min: number, next = `Next ${id}`): DeskNote => ({
  id,
  projectId: 'aurora',
  agentId: 'a-pixel',
  runId: null,
  where: `Where ${id}`,
  doing: `Doing ${id}`,
  next,
  at: ago(min),
});
const letter = (id: string, p: Partial<Mail> = {}): Mail => ({
  id,
  fromProjectId: 'kite',
  fromAgentId: 'a-ada',
  to: 'aurora',
  kind: 'mail',
  subject: `Subject ${id}`,
  body: `Body **${id}**`,
  status: 'new',
  goalId: null,
  note: null,
  at: ago(10),
  ...p,
});

type Db = {
  notes: DeskNote[];
  files: { file: string; title: string; updatedAt: string }[];
  bodies: Record<string, string>;
  inbox: Mail[];
  sent: Mail[];
};
let db: Db;
let calls: { method: string; url: string; body?: unknown }[];
const json = (v: unknown, status = 200) =>
  new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } });

beforeEach(() => {
  clearQueryCache();
  calls = [];
  db = { notes: [], files: [], bodies: {}, inbox: [], sent: [] };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = String(input).replace(/^https?:\/\/[^/]+/, '');
      const method = init?.method ?? 'GET';
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ method, url, body });
      if (url === '/agents') return json(AGENTS);
      if (url === '/projects')
        return json([{ id: 'kite', name: 'Kite', tile: { g1: '#000', g2: '#fff', glyph: 'star' } }]);
      if (url.startsWith('/projects/aurora/desk-notes')) return json({ notes: db.notes });
      if (url === '/projects/aurora/principles')
        return json({
          teams: [
            {
              teamId: 't-ux',
              name: 'The UX Crew',
              captainId: 'a-pixel',
              dir: 'principles/ux-crew',
              files: db.files,
            },
          ],
        });
      const pf = /^\/projects\/aurora\/principles\/t-ux\/(.+)$/.exec(url);
      if (pf) return json({ teamId: 't-ux', file: pf[1], body: db.bodies[decodeURIComponent(pf[1])] ?? '' });
      if (url.startsWith('/projects/aurora/mail?box=')) {
        const sent = url.endsWith('sent');
        return json({
          mail: sent ? db.sent : db.inbox,
          unread: db.inbox.filter((m) => m.status === 'new').length,
          sent: db.sent.length,
          triaging: false,
        });
      }
      const ml = /^\/projects\/aurora\/mail\/(.+)$/.exec(url);
      if (ml && method === 'PATCH') {
        const m = db.inbox.find((x) => x.id === ml[1]);
        if (m) m.status = body.status;
        return json(m);
      }
      if (url === '/projects/aurora/guests' && method === 'POST')
        return json({ guest: { ...body, projectId: 'aurora', addedAt: ago(0) }, runId: 'r1' }, 201);
      if (/^\/projects\/aurora\/guests\//.test(url) && method === 'DELETE')
        return new Response(null, { status: 204 });
      return json({ error: { code: 'not_found', message: url } }, 404);
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('DeskNoteSheet', () => {
  it('shows the latest note, earlier ones swap in, and opening marks the newest seen', async () => {
    db.notes = [note('n2', 5, 'Ship the dark mode toggle'), note('n1', 90)];
    const onSeen = vi.fn();
    render(<NoteBody pid="aurora" agentId="a-pixel" nick="Pixel" onSeen={onSeen} />);
    expect(await screen.findByText('Where n2')).toBeTruthy();
    expect(screen.getByText('Ship the dark mode toggle')).toBeTruthy();
    expect(screen.getByText('Pixel · 5 min ago')).toBeTruthy();
    await waitFor(() => expect(onSeen).toHaveBeenCalledWith('a-pixel', db.notes[0].at));
    expect(screen.getByText('Earlier (1)')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Next n1/ }));
    expect(screen.getByText('Where n1')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '← Latest note' }));
    expect(screen.getByText('Where n2')).toBeTruthy();
  });
});

describe('PrinciplesSheet', () => {
  const team = { id: 't-ux', name: 'The UX Crew', emblem: 'rocket', color: 'teal' };
  it('empty: invites the captain to write them; Talk to the captain', async () => {
    const onTalk = vi.fn();
    render(<PrinciplesBody pid="aurora" team={team} captain="Pixel" onTalk={onTalk} />);
    expect(
      await screen.findByText('No principles yet. Pixel writes them down as the team learns what works.'),
    ).toBeTruthy();
    expect(screen.getByText('Kept by Pixel. The team reads these first.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Talk to Pixel' }));
    expect(onTalk).toHaveBeenCalled();
  });
  it('list → read: title, summary, then the file with its path', async () => {
    db.files = [{ file: '01-calm.md', title: 'Calm by default', updatedAt: ago(60) }];
    db.bodies['01-calm.md'] = '# Calm by default\n\nCut what does not earn its place.\n\n- one';
    render(<PrinciplesBody pid="aurora" team={team} captain={null} onTalk={() => {}} />);
    expect(await screen.findByText('Cut what does not earn its place.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Talk to/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Calm by default/ }));
    expect(await screen.findByText(/principles\/ux-crew\/01-calm\.md/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '← All principles' }));
    expect(screen.getByRole('button', { name: /Calm by default/ })).toBeTruthy();
  });
});

describe('MailSheet', () => {
  const props = {
    pid: 'aurora',
    hq: false,
    hqId: 'studio',
    name: 'Aurora',
    director: 'Max',
    open: true,
    onClose: () => {},
    goalName: (id: string) => (id === 'g1' ? 'Dark mode' : null),
  };
  it('empty inbox says where mail comes from (HQ says it differently)', async () => {
    const { unmount } = render(<MailBody {...props} onTalk={() => {}} onGoal={() => {}} />);
    expect(
      await screen.findByText('No mail yet. When another project writes to Aurora, it lands here.'),
    ).toBeTruthy();
    unmount();
    clearQueryCache();
    render(<MailBody {...props} hq onTalk={() => {}} onGoal={() => {}} />);
    expect(await screen.findByText(/When an agent has an idea for AI Studio/)).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'HQ mail' })).toBeTruthy();
  });
  it('rows: new first with a dot, kind tag, status words; read one, file it, talk about it', async () => {
    db.inbox = [
      letter('old', { status: 'board', goalId: 'g1', at: ago(5) }),
      letter('fresh', { kind: 'ticket', at: ago(60) }),
    ];
    db.sent = [letter('out', { to: 'hq', fromProjectId: 'aurora' })];
    const onTalk = vi.fn();
    const onGoal = vi.fn();
    render(<MailBody {...props} onTalk={onTalk} onGoal={onGoal} />);
    const rows = await screen.findAllByRole('button', { name: /^(New: )?Subject/ });
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining('Subject fresh'),
      expect.stringContaining('Subject old'),
    ]);
    expect(rows[0].querySelector('.rp-dot')).not.toBeNull();
    expect(rows[0].textContent).toContain('Ticket');
    expect(rows[0].textContent).toContain('Kite · Ada');
    expect(rows[1].textContent).toContain('On the board');

    fireEvent.click(rows[1]);
    expect(await screen.findByText('From Ada in Kite', { exact: false })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Dark mode' }));
    expect(onGoal).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '← Mail' }));

    fireEvent.click(await screen.findByRole('button', { name: /^New: Subject fresh/ }));
    expect(screen.getByText('New — Max reads it while you’re here.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'File' }));
    await waitFor(() =>
      expect(calls).toContainEqual({
        method: 'PATCH',
        url: '/projects/aurora/mail/fresh',
        body: { status: 'filed' },
      }),
    );
    expect(await screen.findByRole('button', { name: 'Put back' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Talk about it' }));
    expect(onTalk).toHaveBeenCalledWith(expect.objectContaining({ id: 'fresh' }));
  });
  it('Sent (n) swaps to outgoing letters', async () => {
    db.sent = [letter('out', { to: 'hq', fromProjectId: 'aurora' })];
    render(<MailBody {...props} onTalk={() => {}} onGoal={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Sent (1)' }));
    expect(await screen.findByText('To HQ')).toBeTruthy();
  });
});

describe('BringInSheet', () => {
  const base = {
    pid: 'aurora',
    roster: AGENTS,
    here: new Set(['a-pixel', 'a-max']),
    director: 'Max',
    open: true,
    onClose: () => {},
  };
  it('picks a Cast agent not here yet, needs a brief, director switch off by default', async () => {
    const onBrought = vi.fn();
    render(<BringInBody {...base} guests={[]} onBrought={onBrought} />);
    const radios = screen.getAllByRole('radio');
    expect(radios.map((r) => (r as HTMLInputElement).value)).toEqual(['a-ada', 'a-zed']);
    const go = screen.getByRole('button', { name: 'Bring them in' }) as HTMLButtonElement;
    expect(go.disabled).toBe(true);
    fireEvent.click(radios[0]);
    expect((screen.getByRole('button', { name: 'Bring Ada in' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Their brief'), {
      target: { value: 'Read the comms, report to HQ' },
    });
    const sw = screen.getByRole('switch', { name: 'Director may give them work' });
    expect(sw.getAttribute('aria-checked')).toBe('false');
    expect(screen.getByText('They work only on your brief.')).toBeTruthy();
    fireEvent.click(sw);
    expect(screen.getByText('Max can plan work with them too.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Bring Ada in' }));
    await waitFor(() => expect(onBrought).toHaveBeenCalled());
    expect(calls).toContainEqual({
      method: 'POST',
      url: '/projects/aurora/guests',
      body: { agentId: 'a-ada', brief: 'Read the comms, report to HQ', orchestratorMay: true },
    });
  });
  it('Here now: Send home asks first, then sends them home', async () => {
    render(
      <BringInBody
        {...base}
        here={new Set(['a-pixel', 'a-max', 'a-ada', 'a-zed'])}
        guests={[{ agentId: 'a-ada', brief: 'Analyze the comms', orchestratorMay: false }]}
        onBrought={() => {}}
      />,
    );
    expect(screen.getByText('Everyone in the Cast is already here.')).toBeTruthy();
    expect(screen.getByText('Analyze the comms')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Send home' }));
    expect(screen.getByText('Send Ada home? What they made stays.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Keep' }));
    expect(screen.queryByText(/What they made stays/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Send home' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Send home' })[0]);
    await waitFor(() =>
      expect(calls).toContainEqual({
        method: 'DELETE',
        url: '/projects/aurora/guests/a-ada',
        body: undefined,
      }),
    );
  });
});
