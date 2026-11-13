/* Prompt composer (pure). What an agent is told, most personal first:
   brain ▸ what the team does ▸ how the team codes ▸ its job on this team ▸ project rules.
   The project's CLAUDE.md is NOT pasted in: Claude Code reads it itself from cwd. */

export type ComposeInput = {
  agent: { name: string; prompt: string; role: string };
  team?: { name: string; instr: string; code: string; isCaptain: boolean; job: string } | null;
  project: { name: string };
};

const section = (title: string, body: string) => (body.trim() ? `## ${title}\n\n${body.trim()}` : '');

export function composePrompt({ agent, team, project }: ComposeInput): string {
  const who = `You are ${agent.name}${agent.role ? ` (${agent.role})` : ''}, an agent in AI Studio.`;
  return [
    `# ${agent.name}`,
    `${who}\n\n${agent.prompt.trim()}`.trim(),
    team ? `## Your team: ${team.name}${team.isCaptain ? '\n\nYou are the captain of this team.' : ''}` : '',
    team ? section('What the team does', team.instr) : '',
    team ? section('How the team codes', team.code) : '',
    team ? section('Your job on this team', team.job) : '',
    section(
      'Project rules',
      `You are working on the project "${project.name}" in the current working directory. Its CLAUDE.md holds the project's rules — follow them.`,
    ),
    section(
      'How to work here',
      [
        '- Work only inside this project folder.',
        '- Create and change files with the Write and Edit tools. In the shell, run one plain command at a time (no `;`, `&&`, pipes or redirects): `git`, `ls`, `cat` and `pwd` are pre-approved, anything else is refused.',
        '- If you need a decision or information only the user has, call the `ask_user` tool and wait for the answer. Never guess credentials.',
        '- Finish with a short plain-words summary of what you did.',
      ].join('\n'),
    ),
  ]
    .filter(Boolean)
    .join('\n\n')
    .concat('\n');
}
