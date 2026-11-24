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

vi.mock('react-i18next', () => ({
  Trans: ({ i18nKey, components }: { i18nKey: string; components: Record<string, React.ReactElement> }) => (
    <>
      {i18nKey} {React.cloneElement(components[1], {}, '/all/')}
    </>
  ),
  useTranslation: () => ({ t: (key: string, options?: Record<string, string>) => (options ? `${key}:${JSON.stringify(options)}` : key) }),
}));
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
    expect(container.textContent).toContain('no_saved_multiboards');
    expect(container.querySelector('a')?.textContent).toBe('/all/');
    expect(container.querySelector('a')?.getAttribute('href')).toBe('/all');
  });

  it('links each saved multiboard with its boards and deletes one after confirming', async () => {
    testState.multiboards = [
      { id: 'tech', name: 'Tech', boards: ['g', 'sci', 'music-posting.bso'] },
      { id: 'art', name: 'Art', boards: ['ic'] },
    ];
    render();

    expect(container.querySelector('a')?.getAttribute('href')).toBe('/all?c=@tech');
    expect(container.textContent).toContain('Tech [g / sci / music-posting.bso]');
    expect(container.textContent).toContain('Art [ic]');

    vi.stubGlobal(
      'confirm',
      vi.fn(() => false),
    );
    act(() => container.querySelector('button')!.click());
    expect(testState.deleteMultiboard).not.toHaveBeenCalled();

    const confirm = vi.fn(() => true);
    vi.stubGlobal('confirm', confirm);
    act(() => container.querySelector('button')!.click());
    expect(confirm).toHaveBeenCalledWith('delete_multiboard_confirm:{"name":"Tech"}');
    expect(testState.deleteMultiboard).toHaveBeenCalledWith('tech');
  });

  it('shows a failed delete until the next delete starts', async () => {
    testState.multiboards = [{ id: 'tech', name: 'Tech', boards: ['g'] }];
    testState.deleteMultiboard.mockRejectedValueOnce(new Error('disk full'));
    vi.stubGlobal(
      'confirm',
      vi.fn(() => true),
    );
    render();

    await act(async () => container.querySelector('button')!.click());
    expect(container.textContent).toContain('multiboard_delete_failed:{"error":"disk full"}');

    await act(async () => container.querySelector('button')!.click());
    expect(container.textContent).not.toContain('multiboard_delete_failed');
  });
});
