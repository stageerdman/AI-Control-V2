/* "Build me a team for X" in one step: the director hands team-building work to the Agent Creator only after the
   user said yes in chat; the yes (their words, the time) is saved on the request. Without it: refused, ask first. */
import { afterEach, describe, expect, it } from 'vitest';
import { workRepo } from '../../src/db/work.ts';
import { ASK_FIRST } from '../../src/office/creator-handoff-tool.ts';
import { findUserYes } from '../../src/office/user-yes.ts';
import { directorStudio } from './director-studio.ts';
import { SEA_GPS } from './sea-gps.ts';
const hand = (userYes?: string) => ({
  tool: 'hand_to_agent_creator',
  args: { work: SEA_GPS, ...(userYes === undefined ? {} : { user_yes: userYes }) },
});

describe('the director hands team-building work to the Agent Creator', () => {
  let h: ReturnType<typeof directorStudio>['h'];
  afterEach(() => h.close());
  const tinkerTasks = () =>
    workRepo(h.db)
      .goals('lumi')
      .flatMap((g) => g.items)
      .filter((i) => i.agentId === 'a-creator');

  it('after the user’s yes: Tinker gets it on the whiteboard, with the yes and its time on the request', async () => {
    const s = directorStudio();
    h = s.h;
    await s.turn('Build me a team for the Sea GPS presentation');
    const said = await s.turn('Yes, go ahead and build that team', hand('yes, go ahead'));
    const thread = await h.call('GET', `/projects/lumi/threads/${s.orch}/messages`);
    const asked = thread.body.messages.find(
      (m: { text: string }) => m.text === 'Yes, go ahead and build that team',
    );
    expect(said).toContain(`with the user’s yes recorded (${asked.at}: "Yes, go ahead and build that team")`);
    const [task] = tinkerTasks();
    expect(task?.text).toBe(SEA_GPS);
    expect(task?.brief).toContain(`The user said yes in chat on ${asked.at}: "Yes, go ahead and build that team"`);
    // …and it queues on Tinker's to-do list with the same yes
    const todos = await h.call('GET', '/projects/lumi/todos?agentId=a-creator');
    expect(todos.body.todos[0].text).toContain('The user said yes in chat on');
    // the director knows the tool and its gate
    expect(s.calls[0]?.systemPrompt).toContain('`hand_to_agent_creator`');
  });

  it('without a yes it refuses and tells the director to ask the user first', async () => {
    const s = directorStudio();
    h = s.h;
    expect(await s.turn('Build me a team for the Sea GPS presentation', hand())).toBe(
      `hand_to_agent_creator refused: ${ASK_FIRST}`,
    );
    expect(tinkerTasks()).toEqual([]);
  });

  it('a yes the user never wrote is refused', async () => {
    const s = directorStudio();
    h = s.h;
    await s.turn('Build me a team for the Sea GPS presentation');
    const said = await s.turn('Hmm, let me think about it', hand('yes'));
    expect(said).toMatch(/^hand_to_agent_creator refused: The user’s messages here, after you asked, don’t say "yes"\. Ask the user first/);
    expect(tinkerTasks()).toEqual([]);
  });

  it('ask_person can’t go around the gate with `work: true`', async () => {
    const s = directorStudio();
    h = s.h;
    const said = await s.turn('Build me a team', {
      tool: 'ask_person',
      args: { to: 'Tinker', question: SEA_GPS, work: true },
    });
    expect(said).toMatch(/^ask_person refused: Work for the Agent Creator goes through `hand_to_agent_creator`/);
    expect(tinkerTasks()).toEqual([]);
  });
});

describe('findUserYes', () => {
  const line = (id: string, from: string, text: string) => ({ id, from, text, at: `t${id}` });
  const chat = [
    line('1', 'user', 'Build me a team, yes please'),
    line('2', 'a-pixel', 'Shall I have Tinker design a storyteller and a Presentation Creator?'),
    line('3', 'user', 'Yes — do it!'),
  ];
  it('finds the user’s reply after the director spoke, ignoring case, quotes and spacing', () => {
    expect(findUserYes(chat, '  “yes —   DO it”')).toEqual({ words: 'Yes — do it!', at: 't3', messageId: '3' });
  });
  it('the opening ask, the director’s own words, or an empty quote are not a yes', () => {
    expect(findUserYes(chat, 'yes please')).toBeNull();
    expect(findUserYes(chat, 'Shall I have Tinker')).toBeNull();
    expect(findUserYes(chat, '  ')).toBeNull();
    expect(findUserYes([line('1', 'user', 'yes')], 'yes')).toBeNull();
  });
});
