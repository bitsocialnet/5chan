import * as React from 'react';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BlotterMessage from '../blotter-message';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const act = (React as { act?: (cb: () => void | Promise<void>) => void | Promise<void> }).act as (cb: () => void | Promise<void>) => void | Promise<void>;

vi.mock('../blotter-message.module.css', () => ({
  default: {
    versionLink: 'versionLink',
  },
}));

let container: HTMLDivElement;
let root: Root;

describe('BlotterMessage', () => {
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('normalizes legacy subplebbit wording without rewriting plain community text', async () => {
    await act(async () => {
      root.render(
        createElement(BlotterMessage, {
          entry: {
            id: 'manual-1',
            kind: 'manual',
            message: 'Moved a subplebbit into a community spotlight',
            timestamp: 1_710_000_000,
          },
        }),
      );
    });

    expect(container.textContent).toContain('Moved a board into a community spotlight');
    expect(container.textContent).not.toContain('board spotlight');
  });

  it('normalizes release one-liners after the version prefix', async () => {
    await act(async () => {
      root.render(
        createElement(BlotterMessage, {
          entry: {
            id: 'release-1',
            kind: 'release',
            message: 'v0.7.0: Fix subplebbit loading in plebchan',
            timestamp: 1_710_000_000,
            version: '0.7.0',
          },
        }),
      );
    });

    expect(container.querySelector('a')?.getAttribute('href')).toBe('https://github.com/bitsocialnet/5chan/releases/tag/v0.7.0');
    expect(container.textContent).toContain('Fix board loading in 5chan');
  });
});
