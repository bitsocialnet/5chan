import * as React from 'react';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CopyErrorLabel from '../copy-error-label';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const act = (React as { act?: (cb: () => void | Promise<void>) => void | Promise<void> }).act as (cb: () => void | Promise<void>) => void | Promise<void>;

const testState = vi.hoisted(() => ({
  copyToClipboardMock: vi.fn<(value: string) => Promise<void>>(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
  }),
}));

vi.mock('../../../lib/utils/clipboard-utils', () => ({
  copyToClipboard: (value: string) => testState.copyToClipboardMock(value),
}));

let container: HTMLDivElement;
let root: Root;

const getButton = () => container.querySelector('button') as HTMLButtonElement;

const click = async () => {
  await act(async () => {
    getButton().click();
  });
};

describe('CopyErrorLabel', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    testState.copyToClipboardMock.mockReset();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  it('copies the full error read at click time, then shows the label again', async () => {
    testState.copyToClipboardMock.mockResolvedValue(undefined);
    const error = Object.assign(new Error('Thread update timed out after 60 seconds'), { details: { threadCid: 'QmThread' } });
    const getError = vi.fn(() => error);
    await act(async () => {
      root.render(createElement(CopyErrorLabel, { label: 'Connection Error', getError }));
    });

    expect(getButton().textContent).toBe('Connection Error');
    expect(getButton().title).toBe('Copy full error');
    expect(getError).not.toHaveBeenCalled();

    await click();

    const copied = JSON.parse(testState.copyToClipboardMock.mock.calls[0][0]);
    expect(copied).toMatchObject({ name: 'Error', message: 'Thread update timed out after 60 seconds', details: { threadCid: 'QmThread' } });
    expect(getButton().textContent).toBe('Copied');

    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    expect(getButton().textContent).toBe('Connection Error');
  });

  it('says so when the clipboard is unavailable', async () => {
    testState.copyToClipboardMock.mockRejectedValue(new Error('no clipboard'));
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await act(async () => {
      root.render(createElement(CopyErrorLabel, { label: 'Failed', getError: () => ({ message: 'Failed to load board' }) }));
    });

    await click();

    expect(getButton().textContent).toBe('Copy failed');
    consoleErrorSpy.mockRestore();
  });
});
