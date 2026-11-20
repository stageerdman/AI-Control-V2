/* The office's objects and the tools the AIs reach them with — the how-to page's map (usage/how-to.ts).
   Who: 'everyone' = every agent run; 'director' = the orchestrator's chat; 'leaders' = director + captains. */
export type OfficeObject = {
  name: string;
  what: string;
  how: string;
  tools: { name: string; who: 'everyone' | 'director' | 'leaders' }[];
};

const all = (...names: string[]) => names.map((name) => ({ name, who: 'everyone' as const }));
const director = (...names: string[]) => names.map((name) => ({ name, who: 'director' as const }));
const leaders = (...names: string[]) => names.map((name) => ({ name, who: 'leaders' as const }));

export const OFFICE_OBJECTS: readonly OfficeObject[] = [
  {
    name: 'Whiteboard',
    what: 'The goals and their steps: who does what, in which order.',
    how: 'The director puts work on it and takes it off; a step’s owner is briefed when its turn comes and reports in when done.',
    tools: director(
      'whiteboard',
      'add_goal',
      'add_task',
      'edit_goal',
      'edit_task',
      'remove_from_board',
      'clean_board',
      'board_history',
      'undo_board',
      'resume_goal',
    ),
  },
  {
    name: 'Features list',
    what: 'What the project is building: Planned, Now, Shipped, with how far along each is.',
    how: 'The director adds and edits features (without touching the whiteboard) and approves or declines the ones agents propose; an agent sets its own feature’s progress as work lands.',
    tools: [
      ...director(
        'features',
        'add_feature',
        'edit_feature',
        'remove_feature',
        'approve_feature',
        'decline_feature',
      ),
      ...all('feature', 'propose_feature'),
    ],
  },
  {
    name: 'Office icon',
    what: 'The project’s picture on the office wall and its Projects card.',
    how: 'The user uploads one; the director points it at the app’s icon file inside the project folder (a copy is kept and refreshed when the file changes) or clears it back to the tile.',
    tools: director('office_icon'),
  },
  {
    name: 'The room & calls',
    what: 'Who is on this work, who leads whom, and talking face to face.',
    how: 'Anyone asks anyone (`call_agent`); `work: true` hands work over (on the whiteboard and the callee’s to-do list); a builder lacking a tool, access or permission says so with `cant_do` and its item goes back to the director at once. The director asks from chat with `ask_person`. Every message is kept in the comms log.',
    tools: [...all('room', 'call_agent', 'comms_log', 'cant_do'), ...director('ask_person')],
  },
  {
    name: 'Stop & tell',
    what: 'Interrupting someone at work.',
    how: 'Only leaders stop or interrupt: the director anyone, a captain their own team. A stop can carry a message (left on the desk); a note reaches a running agent after its next step.',
    tools: leaders('stop_work', 'tell_agent'),
  },
  {
    name: 'To-do list',
    what: 'Each agent’s own saved list: requests from others in the order they came, and its own reminders.',
    how: 'Agents read it when they start and before they finish; a notify item pages the user when ticked off. It is the paper on the desk.',
    tools: [...all('my_todos', 'add_todo', 'done_todo'), ...director('page_when_done')],
  },
  {
    name: 'Pager',
    what: 'Short messages that wait for the user until they open the office.',
    how: 'Any agent pages for what the user must see soon; the director can also page when a goal ends.',
    tools: [...all('page_user'), ...director('page_when_done')],
  },
  {
    name: 'Mailbox',
    what: 'Letters between projects and HQ.',
    how: 'Agents send mail to other projects or HQ; the director reads this office’s mail and acts on it.',
    tools: [...all('send_mail', 'mail_directory'), ...director('read_mail')],
  },
  {
    name: 'Reports',
    what: 'Research, reviews and write-ups the user reads in the Reports tray.',
    how: 'Any agent files a report when asked; reporters also search the web. The Communication drawer next to it shows who talked to whom.',
    tools: all('file_report'),
  },
  {
    name: 'Desk & memory',
    what: 'The note an agent leaves itself before it forgets, and its earlier chats.',
    how: 'An agent with a long context leaves a note (`forget`) and carries on fresh from it; `my_history` reads back earlier chats.',
    tools: all('forget', 'my_history'),
  },
  {
    name: 'Runs',
    what: 'Sessions, servers, tests and builds an agent has running.',
    how: 'An agent lists and stops its own runs.',
    tools: all('my_runs', 'cancel_run'),
  },
  {
    name: 'Questions',
    what: 'Questions agents ask the user or the director.',
    how: 'Agents ask the user (`ask_user`) only for what only the user knows; the director answers the ones it can.',
    tools: [...all('ask_user'), ...director('open_questions', 'answer_question')],
  },
  {
    name: 'Staff & Cast',
    what: 'Who is on the project, and the Cast of every agent in the studio.',
    how: 'The director staffs and rebuilds teams from the Cast, and proposes new agents when nobody fits.',
    tools: director('staff_project', 'rebuild_teams', 'propose_agent'),
  },
];
