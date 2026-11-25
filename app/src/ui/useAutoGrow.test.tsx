// @vitest-environment happy-dom
/* The growing message box: grows line by line, stops at the cap and scrolls inside, goes back to one line
   when emptied (a send). Enter sends, Shift+Enter is a new line, Enter while composing does nothing.
   happy-dom has no layout, so scrollHeight is faked: 20px a line plus 20px of padding. */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { MessageBox } from './MessageBox';
import { fitTextarea } from './useAutoGrow';

const LINE = 20;
let desc: PropertyDescriptor | undefined;
beforeAll(() => {
  desc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight');
  Object.defineProperty(HTMLTextAreaElement.prototype, 'scrollHeight', {
    configurable: true,
    get(this: HTMLTextAreaElement) {
      return this.value.split('\n').length * LINE + 20;
    },
  });
});
afterAll(() => {
  // biome-ignore lint/performance/noDelete: put the prototype back as it was
  delete (HTMLTextAreaElement.prototype as { scrollHeight?: number }).scrollHeight;
  if (desc) Object.defineProperty(HTMLElement.prototype, 'scrollHeight', desc);
});
afterEach(cleanup);

const STYLE = {
  boxSizing: 'border-box',
  border: '2px solid',
  padding: '10px 14px',
  lineHeight: `${LINE}px`,
  fontSize: '14px',
} as const;

function Box({ maxPx, onSend }: { maxPx?: number; onSend?: (v: string) => void }) {
  const [v, setV] = useState('');
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSend?.(v);
        setV('');
      }}
    >
      <MessageBox aria-label="Message" value={v} onText={setV} maxPx={maxPx} style={STYLE} />
    </form>
  );
}
const box = () => screen.getByRole('textbox', { name: 'Message' }) as HTMLTextAreaElement;
const type = (v: string) => fireEvent.change(box(), { target: { value: v } });

describe('useAutoGrow', () => {
  it('starts as one line', () => {
    render(<Box maxPx={200} />);
    expect(box().getAttribute('rows')).toBe('1');
    expect(box().style.height).toBe('');
    expect(box().style.overflowY).toBe('hidden');
  });

  it('grows with each line, border included', () => {
    render(<Box maxPx={200} />);
    type('one');
    expect(box().style.height).toBe('44px');
    type('one\ntwo\nthree');
    expect(box().style.height).toBe('84px');
    expect(box().style.overflowY).toBe('hidden');
  });

  it('stops at the cap and scrolls inside', () => {
    render(<Box maxPx={100} />);
    type(Array.from({ length: 12 }, (_, i) => `line ${i}`).join('\n'));
    expect(box().style.height).toBe('100px');
    expect(box().style.overflowY).toBe('auto');
  });

  it('the default cap is ten lines, or 40% of a short window', () => {
    render(<Box />);
    type(Array.from({ length: 30 }, () => 'x').join('\n'));
    /* 10 lines × 20 + padding 20 + border 4, or 40% of the window if that is less */
    expect(box().style.height).toBe(`${Math.min(224, window.innerHeight * 0.4)}px`);
    expect(box().style.overflowY).toBe('auto');
  });

  it('shrinks back to one line after a send', () => {
    const onSend = vi.fn();
    render(<Box maxPx={200} onSend={onSend} />);
    type('one\ntwo\nthree');
    fireEvent.keyDown(box(), { key: 'Enter' });
    expect(onSend).toHaveBeenCalledWith('one\ntwo\nthree');
    expect(box().value).toBe('');
    expect(box().style.height).toBe('');
  });

  it('refits when the window resizes', () => {
    render(<Box maxPx={200} />);
    type('a\nb');
    box().style.height = '10px';
    act(() => void window.dispatchEvent(new Event('resize')));
    expect(box().style.height).toBe('64px');
  });

  it('fitTextarea keeps the scroll position when capped', () => {
    const el = document.createElement('textarea');
    Object.assign(el.style, STYLE);
    document.body.append(el);
    el.value = Array.from({ length: 20 }, () => 'x').join('\n');
    el.scrollTop = 30;
    fitTextarea(el, 100);
    expect(el.style.height).toBe('100px');
    expect(el.scrollTop).toBe(30);
    el.remove();
  });
});

describe('MessageBox keys', () => {
  it('Enter sends, Shift+Enter does not', () => {
    const onSend = vi.fn();
    render(<Box onSend={onSend} />);
    type('hi');
    fireEvent.keyDown(box(), { key: 'Enter', shiftKey: true });
    expect(onSend).not.toHaveBeenCalled();
    fireEvent.keyDown(box(), { key: 'Enter' });
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it('Enter while composing (IME) does not send', () => {
    const onSend = vi.fn();
    render(<Box onSend={onSend} />);
    type('にほ');
    fireEvent.keyDown(box(), { key: 'Enter', isComposing: true });
    expect(onSend).not.toHaveBeenCalled();
  });

  it("the caller's onKeyDown runs first and can stop the send", () => {
    const onSend = vi.fn();
    function Stopper() {
      const [v, setV] = useState('x');
      return (
        <form onSubmit={(e) => (e.preventDefault(), onSend())}>
          <MessageBox aria-label="Message" value={v} onText={setV} onKeyDown={(e) => e.preventDefault()} />
        </form>
      );
    }
    render(<Stopper />);
    fireEvent.keyDown(box(), { key: 'Enter' });
    expect(onSend).not.toHaveBeenCalled();
  });
});
