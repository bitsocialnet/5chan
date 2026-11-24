import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MultiboardsSetting from '../multiboards-setting';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const testState = vi.hoisted(() => ({
  multiboards: [] as Array<{ id: string; name: string; boards: string[] }>,
  deleteMultiboard: vi.fn(async () => undefined),
}));

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('../../../../hooks/use-saved-multiboards', () => ({ useSavedMultiboards: () => testState.multiboards }));
vi.mock('../../../../lib/utils/saved-multiboards', () => ({ deleteMultiboard: testState.deleteMultiboard }));

let container: HTMLDivElement;
let root: Root;

const render = () => {
  act(() => {
    root.render(
      <MemoryRouter>
        <MultiboardsSetting />
      </MemoryRouter>,
    );
  });
};

describe('MultiboardsSetting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testState.multiboards = [];
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it('says how to make a multiboard when none is saved', () => {
    render();
    expect(container.textContent).toContain('No saved multiboards.');
    expect(container.querySelector('a')?.textContent).toBe('/all/');
    expect(container.querySelector('a')?.getAttribute('href')).toBe('/all');
  });

  it('links each saved multiboard and deletes one after confirming', () => {
    testState.multiboards = [
      { id: 'tech', name: 'Tech', boards: ['g', 'sci'] },
      { id: 'art', name: 'Art', boards: ['ic'] },
    ];
    render();

    expect(container.querySelector('a')?.getAttribute('href')).toBe('/all?c=@tech');
    expect(container.textContent).toContain('Tech (2 boards)');
    expect(container.textContent).toContain('Art (1 board)');

    vi.stubGlobal(
      'confirm',
      vi.fn(() => false),
    );
    act(() => container.querySelector('button')!.click());
    expect(testState.deleteMultiboard).not.toHaveBeenCalled();

    vi.stubGlobal(
      'confirm',
      vi.fn(() => true),
    );
    act(() => container.querySelector('button')!.click());
    expect(testState.deleteMultiboard).toHaveBeenCalledWith('tech');
  });
});
