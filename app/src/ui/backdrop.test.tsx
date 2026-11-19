// @vitest-environment happy-dom
/* Every Sheet (the safe, mail, bell, running now, team, notes, principles, picture, ports, history,
   the access editor) closes on a click on its dimmed background, and only there. */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Sheet, useBackdropDismiss } from './index';

afterEach(cleanup);

const show = () => {
  const onClose = vi.fn();
  render(
    <Sheet open onClose={onClose} label="Mail">
      <h2>Mail</h2>
      <input aria-label="Subject" />
      <button type="button">Send</button>
    </Sheet>,
  );
  const scrim = document.querySelector('.scrim') as HTMLElement;
  return { onClose, scrim };
};
/** A real click: press and release on the same element. */
const click = (el: Element) => {
  fireEvent.mouseDown(el);
  fireEvent.mouseUp(el);
  fireEvent.click(el);
};

describe('Sheet: close on background click', () => {
  it('a click on the background closes it', () => {
    const { onClose, scrim } = show();
    click(scrim);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('clicks inside the panel never close it', () => {
    const { onClose } = show();
    click(screen.getByRole('dialog', { name: 'Mail' }));
    click(screen.getByRole('heading', { name: 'Mail' }));
    click(screen.getByRole('textbox', { name: 'Subject' }));
    click(screen.getByRole('button', { name: 'Send' }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('a drag that starts inside and ends on the background does not close it', () => {
    const { onClose, scrim } = show();
    fireEvent.mouseDown(screen.getByRole('textbox', { name: 'Subject' }));
    fireEvent.mouseUp(scrim);
    fireEvent.click(scrim);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('a drag that starts on the background and ends inside does not close it', () => {
    const { onClose, scrim } = show();
    fireEvent.mouseDown(scrim);
    fireEvent.click(screen.getByRole('dialog'));
    fireEvent.click(scrim);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('the ✕ still closes it', () => {
    const { onClose } = show();
    click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

function Box({ onDismiss }: { onDismiss: () => void }) {
  const b = useBackdropDismiss(onDismiss);
  return (
    <div data-testid="bg" {...b}>
      <p>inside</p>
    </div>
  );
}

describe('useBackdropDismiss', () => {
  it('fires only for a press and release on the element itself', () => {
    const fn = vi.fn();
    render(<Box onDismiss={fn} />);
    click(screen.getByText('inside'));
    expect(fn).not.toHaveBeenCalled();
    click(screen.getByTestId('bg'));
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
