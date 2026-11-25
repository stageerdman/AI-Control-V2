// @vitest-environment happy-dom
/* Quit still pausing agents: the app gives way to the one calm line, announced politely. */
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { Quitting, STOPPING_EVENT, STOPPING_LINE } from './Quitting';

afterEach(cleanup);

it('shows the app until the shell says it is stopping, then only the line', async () => {
  let fire = () => {};
  const subscribe = async (event: string, on: () => void) => {
    expect(event).toBe(STOPPING_EVENT);
    fire = on;
    return () => {};
  };
  render(
    <Quitting subscribe={subscribe}>
      <h1>Studio</h1>
    </Quitting>,
  );
  expect(screen.getByText('Studio')).toBeTruthy();
  expect(screen.getByRole('status').textContent).toBe('');

  await act(async () => fire());
  expect(screen.queryByText('Studio')).toBeNull();
  const line = screen.getByRole('status');
  expect(line.textContent).toBe(STOPPING_LINE);
  expect(line.getAttribute('aria-live')).toBe('polite');
  expect(screen.queryByRole('button')).toBeNull();
});
