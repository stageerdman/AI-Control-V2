/* Prompt composer (pure). What an agent is told, most personal first:
   brain ▸ what the team does ▸ how the team codes ▸ its job on this team ▸ project rules.
   The project's CLAUDE.md is NOT pasted in: Claude Code reads it itself from cwd. */

export type ComposeInput = {
  agent: { name: string; prompt: string; role: string };
  team?: { name: string; instr: string; code: string; isCaptain: boolean; job: string } | null;
  project: { name: string };
  /** Toolsmiths (quality / test roles): their persistent toolkit + the per-project tools folder. */
  toolkit?: { dir: string; projectDir: string } | null;
};

const section = (title: string, body: string) => (body.trim() ? `## ${title}\n\n${body.trim()}` : '');

export function composePrompt({ agent, team, project, toolkit }: ComposeInput): string {
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
    toolkit
      ? section(
          'Your toolkit',
          [
            `You are a toolsmith: you build and keep small checks of your own that keep the work correct, on track and simple.`,
            `- Your persistent toolkit (yours across every project): \`${toolkit.dir}\`. Reuse what is there before writing something new; keep each tool small, with a one-line note on what it checks in \`${toolkit.dir}/README.md\`.`,
            `- Checks specific to this project go in \`${toolkit.projectDir}/\` here (commit them with your work).`,
            '- Before you judge anything, read the big picture: CLAUDE.md, the open update plan in `updates/` (goal, phases, status) and issues.txt — check the work against what the project is trying to be, and push back on anything that makes it bigger or more complicated than it needs to be.',
          ].join('\n'),
        )
      : '',
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
