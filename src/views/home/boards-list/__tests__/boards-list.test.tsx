import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useBoardsFilterStore from '../../../../stores/use-boards-filter-store';
import BoardsList from '../boards-list';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const testState = vi.hoisted(() => ({
  accountCommunityAddresses: ['moderated.bso'],
  showDisclaimerModal: vi.fn(),
  openDirectoryModal: vi.fn(),
}));

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('../../../../hooks/use-account-community-addresses', () => ({
  useAccountCommunityAddresses: () => testState.accountCommunityAddresses,
}));
vi.mock('../../../../hooks/use-directories', () => ({ useDirectoriesState: () => ({ error: null }) }));
vi.mock('../../../../stores/use-disclaimer-modal-store', () => ({
  DISCLAIMER_ACCEPTED_KEY: '5chan-disclaimer-accepted',
  default: (selector: (state: { showDisclaimerModal: typeof testState.showDisclaimerModal }) => unknown) => selector(testState),
}));
vi.mock('../../../../stores/use-directory-modal-store', () => ({
  default: (selector: (state: { openDirectoryModal: typeof testState.openDirectoryModal }) => unknown) => selector(testState),
}));

const directories = [{ address: 'music.bso', title: '/mu/ - Music', directoryCode: 'mu' }];
const multiboards = [
  ['All 5chan Directories', '/all'],
  ['Subscriptions', '/subs'],
  ['boards_you_moderate_nav', '/mod'],
] as const;

const Location = () => <output data-testid='location'>{useLocation().pathname}</output>;

let container: HTMLDivElement;
let root: Root;

const renderBoards = () => {
  act(() => {
    root.render(
      <MemoryRouter>
        <BoardsList multisub={directories} />
        <Location />
      </MemoryRouter>,
    );
  });
};

const getLink = (name: string) => {
  const link = Array.from(container.querySelectorAll('a')).find((element) => element.textContent === name);
  expect(link).toBeDefined();
  return link!;
};

const clickButton = (name: string) => {
  const button = Array.from(container.querySelectorAll('button')).find((element) => element.textContent === name);
  expect(button).toBeDefined();
  act(() => button!.click());
};

describe('homepage board catalog links', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    useBoardsFilterStore.setState({ useCatalogLinks: false, boardFilter: 'all' });
    testState.accountCommunityAddresses = ['moderated.bso'];
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('toggles every multiboard and directory link through Use Catalog', () => {
    renderBoards();

    const expectLinks = (suffix: string) => {
      for (const [name, path] of multiboards) {
        expect(getLink(name).getAttribute('href')).toBe(`${path}${suffix}`);
      }
      expect(getLink('Music').getAttribute('href')).toBe(`/mu${suffix}`);
    };

    expectLinks('');
    clickButton('filter ▼');
    clickButton('use_catalog');
    expectLinks('/catalog');
    expect(localStorage.getItem('5chan-boards-use-catalog')).toBe('true');

    clickButton('filter ▼');
    clickButton('use_catalog');
    expectLinks('');

    expect(localStorage.getItem('5chan-boards-use-catalog')).toBe('false');
  });

  it.each(multiboards)('opens the catalog from %s when the preference is enabled', (name, path) => {
    useBoardsFilterStore.setState({ useCatalogLinks: true });
    renderBoards();

    act(() => getLink(name).click());

    expect(container.querySelector('[data-testid="location"]')?.textContent).toBe(`${path}/catalog`);
    expect(testState.showDisclaimerModal).not.toHaveBeenCalled();
  });

  it('keeps the moderated multiboard hidden when the account moderates no boards', () => {
    testState.accountCommunityAddresses = [];
    useBoardsFilterStore.setState({ useCatalogLinks: true });
    renderBoards();

    expect(container.textContent).not.toContain('boards_you_moderate_nav');
  });
});
