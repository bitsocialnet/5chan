import * as React from 'react';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import LoadingEllipsis from '../loading-ellipsis';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const act = (React as { act?: (cb: () => void | Promise<void>) => void | Promise<void> }).act as (cb: () => void | Promise<void>) => void | Promise<void>;

let container: HTMLDivElement;
let root: Root;

describe('LoadingEllipsis', () => {
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('keeps the last word inside the nowrap span and preserves the prefix text', () => {
    act(() => {
      root.render(createElement(LoadingEllipsis, { string: 'Downloading board' }));
    });

    const spans = container.querySelectorAll('span');
    expect(container.textContent).toBe('Downloading board');
    expect(spans[1]?.textContent).toBe('board');
    expect(spans[2]).toBeTruthy();
  });

  it('renders single-word strings without a leading space', () => {
    act(() => {
      root.render(createElement(LoadingEllipsis, { string: 'Loading' }));
    });

    expect(container.textContent).toBe('Loading');
    expect(container.firstChild?.textContent).toBe('Loading');
  });
});
