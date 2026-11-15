/* The side-chat log (setup's team step, the Cast's design-with-Tinker): saved lines, my message while
   it's being answered, an optional status aside (e.g. "Looking up …"), typing dots, an inline error.
   Lives in `.np-chat` (chat.css); the column around it — head, composer — belongs to the caller. */
import { useLayoutEffect, useRef } from 'react';
import './chat.css';

export type ChatLine = { from: string; text: string; to?: string | undefined };

export function ChatLog<M extends ChatLine>({
  chat,
  who,
  mine,
  typing,
  typingLabel,
  aside,
  error,
}: {
  chat: readonly M[];
  /** The name over a line ("You", "Pixel"). */
  who: (m: M) => string;
  /** My message while the other side answers. */
  mine: string | null;
  typing: boolean;
  /** Screen-reader text for the typing dots ("Pixel is typing"). */
  typingLabel: string;
  /** A quiet status line from the other side (shown instead of the dots). */
  aside?: { text: string; className?: string } | null;
  error: string | null;
}) {
  const log = useRef<HTMLDivElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll to the newest line whenever one lands
  useLayoutEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [chat.length, mine, typing, aside?.text, error]);
  return (
    <div className="op-log" role="log" aria-live="polite" ref={log}>
      {chat.map((m, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: the chat is append-only
        <div key={i} className={`bubble ${m.from === 'user' ? 'me' : 'them'}${m.to ? ' np-aside' : ''}`}>
          <span className="who">{who(m)}</span>
          <span className="t">{m.text}</span>
        </div>
      ))}
      {mine && (
        <div className="bubble me">
          <span className="who">You</span>
          <span className="t">{mine}</span>
        </div>
      )}
      {aside ? (
        <div className={`bubble them np-aside ${aside.className ?? ''}`}>
          <span className="t">{aside.text}</span>
        </div>
      ) : (
        typing && (
          <div className="bubble them np-typing">
            <span className="sr-only">{typingLabel}</span>
            <span className="typing" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
          </div>
        )
      )}
      {error && (
        <div className="bubble np-chaterr" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
