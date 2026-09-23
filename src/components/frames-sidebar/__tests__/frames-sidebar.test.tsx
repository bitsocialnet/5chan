import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useBoardsFilterStore from '../../../stores/use-boards-filter-store';
import useFramesStore from '../../../stores/use-frames-store';
import FramesSidebar from '../frames-sidebar';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const testState = vi.hoisted(() => ({
  accountCommunityAddresses: ['moderated.bso'],
  showDisclaimerModal: vi.fn(),
  openDirectoryModal: vi.fn(),
  directories: [
    { address: 'tech.bso', directoryCode: 'g', title: '/g/ - Technology', nsfw: false },
    { address: 'flash.bso', directoryCode: 'f', title: '/f/ - Flash', nsfw: true },
    { address: 'anime.bso', directoryCode: 'a', title: '/a/ - Anime & Manga', nsfw: false },
  ],
  defaults: {
    directories: {
      a: { title: '/a/ - Anime & Manga', features: { safeForWork: true } },
      f: { title: '/f/ - Flash', features: { safeForWork: false } },
      g: { title: '/g/ - Technology', features: { safeForWork: true } },
      '3': { title: '/3/ - 3DCG', features: { safeForWork: true } },
    },
  },
}));

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('../../../hooks/use-account-community-addresses', () => ({ useAccountCommunityAddresses: () => testState.accountCommunityAddresses }));
vi.mock('../../../hooks/use-directories', () => ({
  useDirectories: () => testState.directories,
  useDirectoryDefaults: () => testState.defaults,
}));
vi.mock('../../../constants/board-codes', () => ({ getAllBoardCodes: () => ['g', 'a', 'f', 'h', 'cgl', 'unknown'] }));
vi.mock('../../../stores/use-disclaimer-modal-store', () => ({
  default: (selector: (state: { showDisclaimerModal: typeof testState.showDisclaimerModal }) => unknown) => selector(testState),
}));
vi.mock('../../../stores/use-directory-modal-store', () => ({
  default: (selector: (state: { openDirectoryModal: typeof testState.openDirectoryModal }) => unknown) => selector(testState),
}));

const Location = () => <output data-testid='location'>{useLocation().pathname}</output>;

let container: HTMLDivElement;
let root: Root;

const renderSidebar = () => {
  act(() => {
    root.render(
      <MemoryRouter>
        <FramesSidebar />
        <Location />
      </MemoryRouter>,
    );
  });
};

const getLink = (name: string) => {
  const link = Array.from(container.querySelectorAll('a')).find((element) => element.textContent === name);
  expect(link, `Link ${name}`).toBeDefined();
  return link!;
};

const clickButton = (text: string) => {
  const button = Array.from(container.querySelectorAll('button')).find((element) => element.textContent === text);
  expect(button, `Button ${text}`).toBeDefined();
  act(() => button!.click());
};

describe('frames navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    useBoardsFilterStore.setState({ useCatalogLinks: false, boardFilter: 'all' });
    useFramesStore.setState({ useFrames: true, showDirectories: false, worksafeOnly: false, collapsedSections: { image: false, upload: false, multi: false } });
    testState.accountCommunityAddresses = ['moderated.bso'];
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('sorts image boards by directory and puts Flash in Upload Boards', () => {
    renderSidebar();

    const imageBoards = Array.from(container.querySelectorAll('#frames-image-boards li')).map((element) => element.textContent);
    expect(imageBoards).toEqual(['3DCG', 'Anime & Manga', 'Cosplay & EGL', 'Technology', 'Hentai', '/unknown/']);
    expect(container.querySelector('#frames-upload-boards')?.textContent).toBe('Flash');
  });

  it('uses catalog links for directories and multiboards while Flash stays in its feed', () => {
    renderSidebar();
    expect(getLink('Technology').getAttribute('href')).toBe('/g');

    act(() => useBoardsFilterStore.getState().setUseCatalogLinks(true));

    expect(getLink('Technology').getAttribute('href')).toBe('/g/catalog');
    expect(getLink('Flash').getAttribute('href')).toBe('/f');
    expect(getLink('all_boards').getAttribute('href')).toBe('/all/catalog');
    expect(getLink('subscriptions').getAttribute('href')).toBe('/subs/catalog');
    expect(getLink('boards_you_moderate_nav').getAttribute('href')).toBe('/mod/catalog');

    act(() => getLink('Technology').click());
    expect(testState.showDisclaimerModal).toHaveBeenCalledWith('tech.bso', expect.any(Function), 'g/catalog');

    act(() => getLink('Flash').click());
    expect(testState.showDisclaimerModal).toHaveBeenLastCalledWith('flash.bso', expect.any(Function), 'f');

    act(() => getLink('subscriptions').click());
    expect(container.querySelector('[data-testid="location"]')?.textContent).toBe('/subs/catalog');
  });

  it('leaves modified clicks available to browser new-tab navigation', () => {
    renderSidebar();

    for (const modifier of ['ctrlKey', 'metaKey', 'shiftKey', 'altKey']) {
      const event = new MouseEvent('click', { bubbles: true, cancelable: true, [modifier]: true });
      act(() => getLink('Technology').dispatchEvent(event));
      expect(event.defaultPrevented).toBe(false);
    }
    expect(testState.showDisclaimerModal).not.toHaveBeenCalled();
  });

  it('opens the directory modal for both known and unknown placeholders', () => {
    renderSidebar();

    clickButton('Hentai');
    clickButton('3DCG');
    clickButton('/unknown/');

    expect(testState.openDirectoryModal).toHaveBeenCalledTimes(3);
    expect(testState.showDisclaimerModal).not.toHaveBeenCalled();
  });

  it('adds directory codes and filters explicitly worksafe boards including placeholders', () => {
    renderSidebar();

    clickButton('[show_directories]');
    expect(getLink('/g/ - Technology').getAttribute('href')).toBe('/g');
    expect(getLink('/subs/ - subscriptions').getAttribute('href')).toBe('/subs');

    clickButton('[show_worksafe_only]');
    const boardText = container.querySelector('#frames-image-boards')?.textContent;
    expect(boardText).toContain('/3/ - 3DCG');
    expect(boardText).toContain('/cgl/ - Cosplay & EGL');
    expect(boardText).not.toContain('Hentai');
    expect(boardText).not.toContain('unknown');
    expect(container.querySelector('#frames-upload-boards')).toBeNull();
    expect(container.textContent).not.toContain('upload_boards');

    clickButton('[show_all_boards]');
    expect(container.querySelector('#frames-image-boards')?.textContent).toContain('Hentai');
    expect(getLink('/f/ - Flash').getAttribute('href')).toBe('/f');
  });

  it('collapses sections independently and removes frames without resetting preferences', () => {
    renderSidebar();
    const collapseImage = container.querySelector<HTMLButtonElement>('button[aria-controls="frames-image-boards"]')!;

    act(() => collapseImage.click());
    expect(collapseImage.getAttribute('aria-expanded')).toBe('false');
    expect(container.querySelector<HTMLUListElement>('#frames-image-boards')?.hidden).toBe(true);
    expect(container.querySelector<HTMLUListElement>('#frames-upload-boards')?.hidden).toBe(false);

    clickButton('[remove_frames]');
    expect(useFramesStore.getState().useFrames).toBe(false);
    expect(useFramesStore.getState().collapsedSections.image).toBe(true);
  });

  it('only includes the moderated multiboard when the account has boards', () => {
    testState.accountCommunityAddresses = [];
    renderSidebar();
    expect(container.textContent).not.toContain('boards_you_moderate_nav');
  });
});
