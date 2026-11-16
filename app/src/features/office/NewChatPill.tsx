/* "✦ New chat" above History in the director's chat (design/new-chat/new-chat.md). The look comes from
   newChatState; this only draws it. aria-disabled (not disabled) keeps it in the tab order with its reason.
   The sweep plays when the class lands (entering SHINING); `quiet` skips it (back from a failed start). */
import type { NewChatLook } from './new-chat';

export type NewChatPillProps = {
  state: NewChatLook['state'] | 'starting';
  reason?: string;
  quiet?: boolean;
  /** The director's short name ("Pixel"). */
  who: string;
  onStart: () => void;
};

const LOOK = { idle: 'is-idle', shining: 'is-shining', starting: 'is-idle', disabled: 'is-dim' } as const;
const nameOf = (state: NewChatPillProps['state'], who: string, reason?: string) =>
  state === 'idle'
    ? 'New chat — this chat is already new'
    : state === 'shining'
      ? `New chat with ${who}`
      : state === 'starting'
        ? 'Starting a new chat'
        : `New chat — available when work finishes.${reason ? ` ${reason}` : ''}`;

export function NewChatPill({ state, reason, quiet, who, onStart }: NewChatPillProps) {
  const on = state === 'shining';
  const label = nameOf(state, who, reason);
  return (
    <>
      <button
        type="button"
        className={`op-pill op-pill-new ${LOOK[state]}${quiet ? ' no-sweep' : ''}`}
        data-testid="new-chat-pill"
        aria-label={label}
        aria-disabled={on ? undefined : true}
        onClick={on ? onStart : undefined}
      >
        <span className="op-pill-v">
          {state === 'starting' ? (
            'Starting…'
          ) : (
            <>
              <span aria-hidden="true">✦ </span>New chat
            </>
          )}
        </span>
      </button>
      {state === 'disabled' && reason && (
        <span className="op-why" aria-hidden="true">
          {reason}
        </span>
      )}
    </>
  );
}
