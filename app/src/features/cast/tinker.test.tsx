// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../api';
import type { Agent, CreatorSession, Look } from '../../api/types';
import { AgentPanel, type PanelAgent } from './AgentPanel';
import { TinkerZoom } from './TinkerZoom';

const tinker = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  get: vi.fn(),
  say: vi.fn(),
  edit: vi.fn(),
  accept: vi.fn(),
  drop: vi.fn(),
}));
const fx = vi.hoisted(() => ({ announce: vi.fn() }));
vi.mock('./api', () => ({ castApi: { tinker }, KEYS: { agents: 'agents', roles: 'roles', tinker: 'tk' } }));
vi.mock('./fx', async (orig) => ({
  ...(await orig<typeof import('./fx')>()),
  announce: fx.announce,
  reducedMotion: () => true,
  sparkle: () => {},
}));
afterEach(cleanup);
beforeEach(() => {
  for (const f of [...Object.values(tinker), fx.announce]) f.mockReset();
  location.hash = '#cast/agent/tinker';
});

const look: Look = { hat: 'none', tool: 'none', body: 'hero', antenna: 'none', face: 'none', hue: 'mint' };
const TINKER = { id: 'c1', kind: 'creator', name: 'Tinker', nick: null, look } as unknown as Agent;
const session = (over: Partial<CreatorSession> = {}): CreatorSession => ({
  id: 's1',
  chat: [],
  draft: null,
  activity: null,
  createdAt: '',
  updatedAt: '',
  ...over,
});
const DRAFT = {
  name: 'Swifty',
  role: 'iOS',
  summary: 'Ships SwiftUI apps.',
  prompt: 'You build iOS apps.',
  look,
};

function zoom(sid: string | null = null) {
  render(
    <TinkerZoom
      sid={sid}
      animate={false}
      closing={false}
      onClosed={() => {}}
      agents={[TINKER]}
      roles={[]}
      teams={[]}
    />,
  );
  return screen.getByRole('textbox', { name: 'Message Tinker' }) as HTMLInputElement;
}
const say = (input: HTMLInputElement, text: string) => {
  fireEvent.change(input, { target: { value: text } });
  fireEvent.submit(input.closest('form') as HTMLFormElement);
};
const deferred = <T,>() => {
  let ok!: (v: T) => void;
  let fail!: (e: unknown) => void;
  const promise = new Promise<T>((a, b) => {
    ok = a;
    fail = b;
  });
  return { promise, ok, fail };
};

describe('New agent — Manual · With Tinker', () => {
  const blank: PanelAgent = {
    id: '',
    kind: 'agent',
    name: '',
    roleId: null,
    role: '',
    prompt: '',
    teamIds: [],
    projectIds: [],
    canDelete: { ok: false, why: '' } as PanelAgent['canDelete'],
  };
  const panel = (agent: PanelAgent, onTinker?: () => void) =>
    render(
      <AgentPanel
        agent={agent}
        isNew
        roles={[]}
        teams={[]}
        onName={() => {}}
        onRole={() => {}}
        onPrompt={() => {}}
        onDelete={() => {}}
        onSaved={() => {}}
        onTinker={onTinker}
      />,
    );
  it('defaults to Manual; With Tinker hands over', () => {
    const onTinker = vi.fn();
    panel(blank, onTinker);
    const group = screen.getByRole('radiogroup', { name: 'How to make them' });
    expect(group.querySelector('[aria-checked="true"]')?.textContent).toBe('Manual');
    fireEvent.click(screen.getByRole('radio', { name: 'With Tinker' }));
    expect(onTinker).toHaveBeenCalledOnce();
  });
  it('goes away once a name is typed, and never shows without onTinker', () => {
    panel(blank, () => {});
    fireEvent.change(screen.getByRole('textbox', { name: 'Agent name' }), { target: { value: 'Pete' } });
    expect(screen.queryByRole('radiogroup')).toBeNull();
    cleanup();
    panel(blank);
    expect(screen.queryByRole('radiogroup')).toBeNull();
    expect(screen.getByText('New recruit')).toBeTruthy();
  });
});

describe('Design with Tinker — the chat', () => {
  it('opens locally, makes the session on the first send, shows the draft and adds it to the Cast', async () => {
    const input = zoom();
    expect(screen.getByText('Hi, I’m Tinker. Who do you need?')).toBeTruthy();
    expect(screen.getByText('Tinker sketches here as you talk.')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Add to the Cast' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(tinker.create).not.toHaveBeenCalled();

    const turn = deferred<{ reply: string; draft: typeof DRAFT; chat: CreatorSession['chat'] }>();
    tinker.create.mockResolvedValue(session());
    tinker.say.mockReturnValue(turn.promise);
    tinker.get.mockResolvedValue(session());
    await act(async () => say(input, 'I need a Swift dev'));
    expect(tinker.create).toHaveBeenCalledWith();
    expect(tinker.say).toHaveBeenCalledWith('s1', 'I need a Swift dev');
    expect(location.hash).toBe('#cast/agent/tinker/s1');
    expect(screen.getByText('Thinking…')).toBeTruthy();
    expect(screen.getByText('I need a Swift dev')).toBeTruthy();

    const chat = [
      { from: 'user' as const, text: 'I need a Swift dev' },
      { from: 'creator' as const, text: 'Here’s a first sketch: Swifty.' },
    ];
    await act(async () => turn.ok({ reply: 'Here’s a first sketch: Swifty.', draft: DRAFT, chat }));
    expect(screen.getByText('Here’s a first sketch: Swifty.')).toBeTruthy();
    expect(screen.getByText('Ships SwiftUI apps.')).toBeTruthy();
    expect(screen.getByText('Designing Swifty')).toBeTruthy();
    expect(fx.announce).toHaveBeenCalledWith('Draft updated: name, role, summary, prompt, look');

    tinker.accept.mockResolvedValue({ agent: { id: 'a9', name: 'Swifty' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Add to the Cast' })));
    expect(tinker.accept).toHaveBeenCalledWith('s1');
    expect(screen.getByText('Swifty joined the Cast.')).toBeTruthy();
    await waitFor(() => expect(location.hash).toBe('#cast/agent/a9'));
  });

  it('shows the research line from the polled activity', async () => {
    const input = zoom();
    tinker.create.mockResolvedValue(session());
    tinker.say.mockReturnValue(new Promise(() => {}));
    tinker.get.mockResolvedValue(session({ activity: { kind: 'research', label: 'Looking up “SwiftUI”' } }));
    await act(async () => say(input, 'research SwiftUI'));
    await waitFor(() => expect(screen.getAllByText('Looking up “SwiftUI”…')).toHaveLength(2), {
      timeout: 2500,
    });
  });

  it('a failed turn says so and puts your text back', async () => {
    const input = zoom();
    tinker.create.mockResolvedValue(session());
    tinker.say.mockRejectedValue(new Error('boom'));
    await act(async () => say(input, 'Hello'));
    expect(screen.getByRole('alert').textContent).toBe('Tinker couldn’t answer — boom');
    expect(input.value).toBe('Hello');
  });

  it('resumes a saved chat; a failed Add explains and offers Try again', async () => {
    tinker.get.mockResolvedValue(session({ draft: { ...DRAFT, prompt: '' } }));
    zoom('s1');
    await waitFor(() => expect(screen.getByText('Ships SwiftUI apps.')).toBeTruthy());
    tinker.accept.mockRejectedValue(
      new ApiError(422, 'invalid', 'The draft is not complete yet', { issues: ['prompt: Too small'] }),
    );
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Add to the Cast' })));
    expect(screen.getByRole('alert').textContent).toBe(
      'Couldn’t add Swifty — The draft is not complete yet: prompt: Too small',
    );
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });

  it('Details edits save to the draft (no AI turn)', async () => {
    tinker.get.mockResolvedValue(session({ draft: DRAFT }));
    tinker.edit.mockResolvedValue(session({ draft: { ...DRAFT, name: 'Swiftly' } }));
    zoom('s1');
    await waitFor(() => expect(screen.getByText('Ships SwiftUI apps.')).toBeTruthy());
    fireEvent.click(screen.getByRole('tab', { name: 'Details' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Agent name' }), { target: { value: 'Swiftly' } });
    await waitFor(() => expect(tinker.edit).toHaveBeenCalledWith('s1', { name: 'Swiftly' }));
    expect(tinker.say).not.toHaveBeenCalled();
  });

  it('locks direct edits while Tinker works (his turn would overwrite them)', async () => {
    tinker.get.mockResolvedValue(session({ draft: DRAFT }));
    tinker.say.mockReturnValue(new Promise(() => {}));
    const input = zoom('s1');
    await waitFor(() => expect(screen.getByText('Ships SwiftUI apps.')).toBeTruthy());
    await act(async () => say(input, 'Make him playful'));
    fireEvent.click(screen.getByRole('tab', { name: 'Details' }));
    const name = screen.getByRole('textbox', { name: 'Agent name' }) as HTMLInputElement;
    expect(name.closest('fieldset')?.disabled).toBe(true);
  });
});
