import * as React from 'react';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MultiboardModal from '../multiboard-modal';
import useMultiboardModalStore from '../../../stores/use-multiboard-modal-store';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const act = (React as { act?: (cb: () => void | Promise<void>) => void | Promise<void> }).act as (cb: () => void | Promise<void>) => void | Promise<void>;

const testState = vi.hoisted(() => ({
  directories: [
    { address: 'tech.bso', title: '/g/ - Technology' },
    { address: 'science.bso', title: '/sci/ - Science & Math' },
    { address: 'tv.bso', title: '/tv/ - Television & Film' },
    { address: 'random.bso', title: '/b/ - Random' },
    { address: 'zines.bso', title: '/zines/ - Zines' },
  ],
  account: {
    subscriptions: ['music-posting.bso', 'tech.bso'],
    multiboards: [] as Array<{ id: string; name: string; boards: string[] }>,
  },
  createMultiboard: vi.fn(async () => 'tech'),
  updateMultiboard: vi.fn(async () => undefined),
  deleteMultiboard: vi.fn(async () => undefined),
  setMultiboardHasBoard: vi.fn(async () => undefined),
}));

vi.mock('../../../hooks/use-directories', () => ({
  useDirectories: () => testState.directories,
}));

vi.mock('../../../hooks/use-active-account-field', () => ({
  useActiveAccountField: <T,>(selector: (account: typeof testState.account) => T) => selector(testState.account),
}));

vi.mock('../../../lib/utils/saved-multiboards', async () => {
  const actual = await vi.importActual<typeof import('../../../lib/utils/saved-multiboards')>('../../../lib/utils/saved-multiboards');
  return {
    ...actual,
    createMultiboard: testState.createMultiboard,
    updateMultiboard: testState.updateMultiboard,
    deleteMultiboard: testState.deleteMultiboard,
    setMultiboardHasBoard: testState.setMultiboardHasBoard,
  };
});

let container: HTMLDivElement;
let root: Root;

const LocationProbe = () => {
  const location = useLocation();
  return createElement('output', { 'data-testid': 'location' }, `${location.pathname}${location.search}`);
};

const renderModal = async (initialEntry: string) => {
  const element = createElement(React.Fragment, null, createElement(MultiboardModal), createElement(LocationProbe));
  await act(async () => {
    root.render(
      createElement(
        MemoryRouter,
        { initialEntries: [initialEntry] },
        createElement(
          Routes,
          null,
          createElement(Route, { path: '/all', element }),
          createElement(Route, { path: '/all/catalog', element }),
          createElement(Route, { path: '/:boardIdentifier', element }),
        ),
      ),
    );
  });
};

const getLocation = () => container.querySelector('[data-testid="location"]')?.textContent;
const getCheckbox = (label: string) => {
  const labelElement = Array.from(container.querySelectorAll('label')).find((candidate) => candidate.textContent === label);
  return container.querySelector<HTMLInputElement>(`[id="${labelElement?.htmlFor}"]`)!;
};
const getButton = (text: string) => Array.from(container.querySelectorAll('button')).find((button) => button.textContent === text)!;
const click = async (element: Element | null | undefined) => {
  await act(async () => {
    element?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};
const typeName = async (value: string) => {
  const input = container.querySelector<HTMLInputElement>('#multiboard-name')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

describe('MultiboardModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testState.account.multiboards = [];
    useMultiboardModalStore.setState({ modal: { kind: 'editor' } });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    useMultiboardModalStore.setState({ modal: null });
    vi.unstubAllGlobals();
  });

  it('lists directory boards under the home page headings, then later boards, then subscriptions outside the directories', async () => {
    await renderModal('/all');

    expect(container.querySelector('h2')?.textContent).toBe('New Multiboard');
    expect(Array.from(container.querySelectorAll('legend')).map((legend) => legend.textContent)).toEqual(['Interests', 'Misc. (NSFW)', 'More Boards', 'Other Boards']);
    expect(getCheckbox('Zines')).toBeTruthy();
    // Subscribed to by address: tech.bso is /g/ and stays under its heading.
    expect(getCheckbox('music-posting.bso')).toBeTruthy();
    expect(getButton('Show').disabled).toBe(true);
    expect(getButton('Save').disabled).toBe(true);
  });

  it('starts from the category being read and shows the picked boards unsaved, in listing order', async () => {
    await renderModal('/all/catalog?t=1w&c=interests');

    expect(getCheckbox('Technology').checked).toBe(true);
    await click(getCheckbox('Television & Film'));
    await click(getCheckbox('Zines'));
    await click(getCheckbox('music-posting.bso'));
    await click(getButton('Show'));

    expect(getLocation()).toBe('/all/catalog?t=1w&c=g,sci,zines,music-posting.bso');
    expect(useMultiboardModalStore.getState().modal).toBeNull();
  });

  it('saves a named multiboard in the account and shows it', async () => {
    await renderModal('/all?c=g,sci');

    expect(getButton('Save').disabled).toBe(true);
    await typeName('  Tech ');
    await click(getButton('Save'));

    expect(testState.createMultiboard).toHaveBeenCalledWith('Tech', ['g', 'sci']);
    expect(getLocation()).toBe('/all?c=@tech');
    expect(useMultiboardModalStore.getState().modal).toBeNull();
  });

  it('edits and deletes a saved multiboard', async () => {
    testState.account.multiboards = [{ id: 'tech', name: 'Tech', boards: ['g', 'music-posting.bso'] }];
    useMultiboardModalStore.setState({ modal: { kind: 'editor', multiboardId: 'tech' } });
    await renderModal('/all?c=@tech');

    expect(container.querySelector('h2')?.textContent).toBe('Edit Multiboard');
    expect(container.querySelector<HTMLInputElement>('#multiboard-name')?.value).toBe('Tech');
    expect(getCheckbox('music-posting.bso').checked).toBe(true);
    expect(container.textContent).not.toContain('Show');

    await click(getCheckbox('Science & Math'));
    await click(getButton('Save'));
    expect(testState.updateMultiboard).toHaveBeenCalledWith('tech', { name: 'Tech', boards: ['g', 'sci', 'music-posting.bso'] });

    useMultiboardModalStore.setState({ modal: { kind: 'editor', multiboardId: 'tech' } });
    await act(async () => undefined);
    vi.stubGlobal(
      'confirm',
      vi.fn(() => true),
    );
    await click(getButton('Delete'));

    expect(testState.deleteMultiboard).toHaveBeenCalledWith('tech');
    expect(getLocation()).toBe('/all');
  });

  it('stays on the board page when a multiboard is made from it', async () => {
    useMultiboardModalStore.setState({ modal: { kind: 'editor', boards: ['g'] } });
    await renderModal('/g');

    expect(getCheckbox('Technology').checked).toBe(true);
    await typeName('Tech');
    await click(getButton('Save'));

    expect(testState.createMultiboard).toHaveBeenCalledWith('Tech', ['g']);
    expect(getLocation()).toBe('/g');
  });

  it('adds a board to saved multiboards, or starts a new one with it', async () => {
    testState.account.multiboards = [
      { id: 'tech', name: 'Tech', boards: ['g'] },
      { id: 'art', name: 'Art', boards: ['ic'] },
    ];
    useMultiboardModalStore.setState({ modal: { kind: 'add', board: 'g', boardLabel: '/g/', aliases: ['tech.bso'] } });
    await renderModal('/g');

    expect(container.querySelector('h2')?.textContent).toBe('Add /g/ to a Multiboard');
    expect(getCheckbox('Tech').checked).toBe(true);
    expect(getCheckbox('Art').checked).toBe(false);

    await click(getCheckbox('Art'));
    expect(testState.setMultiboardHasBoard).toHaveBeenCalledWith('art', 'g', true, ['tech.bso']);

    await click(getButton('New Multiboard…'));
    expect(container.querySelector('h2')?.textContent).toBe('New Multiboard');
    expect(getCheckbox('Technology').checked).toBe(true);
    expect(getCheckbox('Science & Math').checked).toBe(false);
  });

  it('keeps a directory board saved by its address on that address, and counts it in the add list', async () => {
    testState.account.multiboards = [{ id: 'tech', name: 'Tech', boards: ['sci', 'tech.bso'] }];
    useMultiboardModalStore.setState({ modal: { kind: 'editor', multiboardId: 'tech' } });
    await renderModal('/all?c=@tech');

    // tech.bso is /g/'s address: it stays an entry of its own instead of being dropped or turned into /g/.
    expect(getCheckbox('tech.bso').checked).toBe(true);
    expect(getCheckbox('Technology').checked).toBe(false);
    await click(getButton('Save'));
    expect(testState.updateMultiboard).toHaveBeenCalledWith('tech', { name: 'Tech', boards: ['sci', 'tech.bso'] });

    useMultiboardModalStore.setState({ modal: { kind: 'add', board: 'g', boardLabel: '/g/', aliases: ['tech.bso'] } });
    await act(async () => undefined);
    expect(getCheckbox('Tech').checked).toBe(true);
    await click(getCheckbox('Tech'));
    expect(testState.setMultiboardHasBoard).toHaveBeenCalledWith('tech', 'g', false, ['tech.bso']);
  });

  it('leaves another modal alone when a save finishes after its own modal closed', async () => {
    let finishSave: (id: string) => void = () => undefined;
    testState.createMultiboard.mockImplementationOnce(() => new Promise<string>((resolve) => (finishSave = resolve)));
    await renderModal('/all?c=g');

    await typeName('Tech');
    await click(getButton('Save'));
    await act(async () => {
      container.querySelector('dialog')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    const otherModal = { kind: 'editor' as const, boards: ['sci'] };
    useMultiboardModalStore.setState({ modal: otherModal });
    await act(async () => finishSave('tech'));

    expect(useMultiboardModalStore.getState().modal).toBe(otherModal);
    expect(getLocation()).toBe('/all?c=g');
  });

  it('takes focus on open and closes on Escape without navigating', async () => {
    await renderModal('/all?c=g,b');

    expect(getCheckbox('Random').checked).toBe(true);
    expect(document.activeElement).toBe(container.querySelector('dialog'));

    await act(async () => {
      container.querySelector('dialog')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });

    expect(useMultiboardModalStore.getState().modal).toBeNull();
    expect(getLocation()).toBe('/all?c=g,b');
  });
});
