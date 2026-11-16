/* The director's office-chat answer. Every action is a tool that runs during the turn (whiteboard, features,
   ask / resume / stop, staff / rebuild), so the reply is plain words that say what really happened. */
import { type Capabilities, canStartWork } from './capabilities.ts';

/** The last block of every orchestrator chat task: act with the tools, then answer in plain words. */
export function directorAnswer(can: Capabilities): string {
  const idea = canStartWork(can) ? '; for an idea, ask whether they want it on the whiteboard' : '';
  return [
    'Decide what this message is, then answer.',
    '- The user clearly asks for something you can do (build, add, fix, change, remove, staff, stop, ask someone…), or says yes to something you offered: do it now with your tools, then say in one or two sentences what happened — only what the tools told you.',
    `- A question, an idea, a maybe ("maybe we could add dark mode?", "should we…?", "what about…?"), status, priorities, small talk, or anything unclear: answer it${idea}. Never start work on a question.`,
    'Answer in plain words only — no JSON.',
  ].join('\n');
}

/** The run's final text → the reply. Older sessions may still wrap it as {"reply": "…"}: unwrap that. */
export function replyText(raw: string): string {
  const text = raw.trim();
  if (!text.startsWith('{')) return text;
  try {
    const reply = (JSON.parse(text) as { reply?: unknown } | null)?.reply;
    return typeof reply === 'string' && reply.trim() ? reply.trim() : text;
  } catch {
    return text;
  }
}
