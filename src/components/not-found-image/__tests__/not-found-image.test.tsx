import * as React from 'react';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import NotFoundImage from '../not-found-image';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const act = (React as { act?: (cb: () => void | Promise<void>) => void | Promise<void> }).act as (cb: () => void | Promise<void>) => void | Promise<void>;

vi.mock('../../../generated/asset-manifest', () => ({
  NOT_FOUND_IMAGES: ['/missing-1.png', '/missing-2.png', '/missing-3.png'],
}));

let container: HTMLDivElement;
let root: Root;
let randomSpy: ReturnType<typeof vi.spyOn>;

describe('NotFoundImage', () => {
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    randomSpy = vi.spyOn(Math, 'random');
  });

  afterEach(() => {
    randomSpy.mockRestore();
    act(() => root.unmount());
    container.remove();
  });

  it('picks a deterministic image on mount and keeps it stable across rerenders', () => {
    randomSpy.mockReturnValueOnce(0);

    act(() => {
      root.render(createElement(NotFoundImage));
    });

    expect(container.querySelector('img')?.getAttribute('src')).toBe('/missing-1.png');

    randomSpy.mockReturnValueOnce(0.99);
    act(() => {
      root.render(createElement(NotFoundImage));
    });

    expect(container.querySelector('img')?.getAttribute('src')).toBe('/missing-1.png');
  });

  it('can pick a later image when mounted with a different random value', () => {
    randomSpy.mockReturnValueOnce(0.99);

    act(() => {
      root.render(createElement(NotFoundImage));
    });

    expect(container.querySelector('img')?.getAttribute('src')).toBe('/missing-3.png');
  });
});
