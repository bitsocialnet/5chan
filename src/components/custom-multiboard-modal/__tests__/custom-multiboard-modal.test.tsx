import * as React from 'react';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CustomMultiboardModal from '../custom-multiboard-modal';
import useCustomMultiboardModalStore from '../../../stores/use-custom-multiboard-modal-store';

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
}));

vi.mock('../../../hooks/use-directories', () => ({
  useDirectories: () => testState.directories,
}));

let container: HTMLDivElement;
let root: Root;

const LocationProbe = () => {
  const location = useLocation();
  return createElement('output', { 'data-testid': 'location' }, `${location.pathname}${location.search}`);
};

const renderModal = async (initialEntry: string) => {
  const element = createElement(React.Fragment, null, createElement(CustomMultiboardModal), createElement(LocationProbe));
  await act(async () => {
    root.render(
      createElement(
        MemoryRouter,
        { initialEntries: [initialEntry] },
        createElement(Routes, null, createElement(Route, { path: '/all', element }), createElement(Route, { path: '/all/catalog', element })),
      ),
    );
  });
};

const getCheckbox = (label: string) => {
  const labelElement = Array.from(container.querySelectorAll('label')).find((candidate) => candidate.textContent === label);
  return container.querySelector<HTMLInputElement>(`#${labelElement?.htmlFor}`)!;
};

const click = async (element: Element | null | undefined) => {
  await act(async () => {
    element?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};

const getShowButton = () => Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Show')!;

describe('CustomMultiboardModal', () => {
  beforeEach(() => {
    useCustomMultiboardModalStore.setState({ showModal: true });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    useCustomMultiboardModalStore.setState({ showModal: false });
  });

  it('lists directory boards under the home page headings, with later boards last', async () => {
    await renderModal('/all');

    const legends = Array.from(container.querySelectorAll('legend')).map((legend) => legend.textContent);
    expect(legends).toEqual(['Interests', 'Misc. (NSFW)', 'More Boards']);
    expect(getCheckbox('Zines')).toBeTruthy();
    expect(getShowButton().disabled).toBe(true);
  });

  it('starts from the current category and links the picked boards in listing order', async () => {
    await renderModal('/all/catalog?t=1w&c=interests');

    expect(getCheckbox('Technology').checked).toBe(true);
    expect(getCheckbox('Television & Film').checked).toBe(true);

    await click(getCheckbox('Television & Film'));
    await click(getCheckbox('Zines'));
    await click(getShowButton());

    expect(container.querySelector('[data-testid="location"]')?.textContent).toBe('/all/catalog?t=1w&c=g,sci,zines');
    expect(useCustomMultiboardModalStore.getState().showModal).toBe(false);
  });

  it('cannot submit a list whose codes have no listed board', async () => {
    await renderModal('/all?c=nope');

    expect(getShowButton().disabled).toBe(true);
  });

  it('takes focus on open and closes on Escape without navigating', async () => {
    await renderModal('/all?c=g,b');

    expect(getCheckbox('Random').checked).toBe(true);
    expect(document.activeElement).toBe(container.querySelector('dialog'));

    await act(async () => {
      container.querySelector('dialog')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });

    expect(useCustomMultiboardModalStore.getState().showModal).toBe(false);
    expect(container.querySelector('[data-testid="location"]')?.textContent).toBe('/all?c=g,b');
  });
});
