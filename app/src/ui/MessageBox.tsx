/* The one chat message box: a one-line textarea that grows as you type (useAutoGrow).
   Enter sends (submits its form), Shift+Enter is a new line, Enter while composing (IME) does nothing. */
import { type KeyboardEvent, type Ref, type TextareaHTMLAttributes, useImperativeHandle, useRef } from 'react';
import { useAutoGrow } from './useAutoGrow';

export type MessageBoxProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> & {
  value: string;
  onText: (v: string) => void;
  ref?: Ref<HTMLTextAreaElement | null>;
  maxPx?: number;
};

export function MessageBox({ value, onText, ref, maxPx, onKeyDown, ...rest }: MessageBoxProps) {
  const box = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(ref, () => box.current as HTMLTextAreaElement, []);
  useAutoGrow(box, value, maxPx === undefined ? undefined : { maxPx });
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    onKeyDown?.(e);
    if (e.defaultPrevented || e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return;
    e.preventDefault();
    e.currentTarget.form?.requestSubmit();
  };
  return (
    <textarea
      ref={box}
      rows={1}
      autoComplete="off"
      {...rest}
      value={value}
      onChange={(e) => onText(e.target.value)}
      onKeyDown={onKey}
    />
  );
}
