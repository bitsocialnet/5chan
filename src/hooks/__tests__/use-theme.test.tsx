import * as React from 'react';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useTheme from '../use-theme';
import useThreadLiveUpdatesStore from '../../stores/use-thread-live-updates-store';
import { TRASH_BOARD_ADDRESS, TRASH_BOARD_CODE } from '../../lib/special-boards';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const act = (React as { act?: (cb: () => void | Promise<void>) => void | Promise<void> }).act as (cb: () => void | Promise<void>) => void | Promise<void>;

const testState = vi.hoisted(() => ({
  activeSpecialTheme: undefined as 'christmas' | 'halloween' | undefined,
  boardIdentifier: 'trash' as string | undefined,
  directories: [] as Array<{ address: string; nsfw?: boolean }>,
  isSpecialThemeEnabled: false as boolean | null,
  specialThemeEvent: null as string | null,
  locationPathname: '/trash',
  locationState: null as { pendingPost?: { communityAddress?: string } } | null,
  liveCommunity: undefined as { features?: { safeForWork?: unknown } } | undefined,
  resolvedAddress: 'off-topic.bso' as string | undefined,
  setIsEnabledMock: vi.fn(),
  setThemeMock: vi.fn().mockResolvedValue(undefined),
  sfw: false,
  updateFaviconMock: vi.fn(),
  themes: {
    nsfw: 'tomorrow',
    sfw: 'yotsuba-b',
  },
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useLocation: () => ({ pathname: testState.locationPathname, state: testState.locationState }),
    useParams: () => ({ boardIdentifier: testState.boardIdentifier }),
  };
});

vi.mock('@bitsocial/bitsocial-react-hooks', () => ({
  useAccountComment: () => undefined,
}));

vi.mock('../use-directories', () => ({
  useDirectories: () => testState.directories,
}));

vi.mock('../use-stable-community', () => ({
  useCommunityField: <T,>(_address: string | undefined, selector: (community: typeof testState.liveCommunity) => T) => selector(testState.liveCommunity),
}));

vi.mock('../use-resolved-community-address', () => ({
  useResolvedCommunityAddress: () => testState.resolvedAddress,
}));

vi.mock('../../stores/use-special-theme-store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../stores/use-special-theme-store')>()),
  default: <T,>(selector?: (state: { isEnabled: boolean | null; event: string | null; setIsEnabled: (value: boolean) => void }) => T) => {
    const state = { isEnabled: testState.isSpecialThemeEnabled, event: testState.specialThemeEvent, setIsEnabled: testState.setIsEnabledMock };
    return selector ? selector(state) : state;
  },
}));

vi.mock('../../stores/use-theme-store', () => ({
  default: <T,>(selector: (state: { setTheme: (category: 'nsfw' | 'sfw', theme: string) => Promise<void>; themes: typeof testState.themes }) => T) =>
    selector({
      setTheme: testState.setThemeMock,
      themes: testState.themes,
    }),
}));

vi.mock('../../lib/update-favicon', () => ({
  isSfwBoard: () => testState.sfw,
  updateFavicon: testState.updateFaviconMock,
}));

vi.mock('../../lib/utils/time-utils', () => ({
  getActiveSpecialTheme: () => testState.activeSpecialTheme,
  getActiveSpecialThemeEvent: () => (testState.activeSpecialTheme ? `${testState.activeSpecialTheme}-2026` : null),
  getSpecialThemeClass: (specialTheme: string) => (specialTheme === 'halloween' ? 'spooky' : 'tomorrow'),
}));

let latestValue: [string, (theme: string) => void | Promise<void>] | undefined;
let container: HTMLDivElement;
let root: Root;

const HookHarness = () => {
  latestValue = useTheme({ applyDocumentEffects: true });
  return null;
};

const renderHook = async () => {
  await act(async () => {
    root.render(createElement(HookHarness));
  });
};

describe('useTheme', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    latestValue = undefined;
    testState.activeSpecialTheme = undefined;
    testState.sfw = false;
    testState.boardIdentifier = TRASH_BOARD_CODE;
    testState.directories = [];
    testState.isSpecialThemeEnabled = false;
    testState.specialThemeEvent = null;
    testState.locationPathname = `/${TRASH_BOARD_CODE}`;
    testState.locationState = null;
    testState.liveCommunity = undefined;
    testState.resolvedAddress = TRASH_BOARD_ADDRESS;
    testState.themes = {
      nsfw: 'tomorrow',
      sfw: 'yotsuba-b',
    };
    document.body.className = '';
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    document.body.className = '';
  });

  it('uses the nsfw theme bucket for hidden special boards', async () => {
    await renderHook();

    expect(latestValue?.[0]).toBe('tomorrow');

    await act(async () => {
      await latestValue?.[1]('photon');
    });

    expect(testState.setThemeMock).toHaveBeenCalledWith('nsfw', 'photon');
  });

  it('applies the document theme before the first paint and route-change paint', async () => {
    const themesAtLayout: string[] = [];
    const PaintHarness = () => {
      useTheme({ applyDocumentEffects: true });
      React.useLayoutEffect(() => {
        themesAtLayout.push(document.body.className);
      });
      return null;
    };

    await act(async () => root.render(createElement(PaintHarness)));
    expect(themesAtLayout).toEqual(['tomorrow']);

    testState.locationPathname = '/';
    await act(async () => root.render(createElement(PaintHarness)));
    expect(themesAtLayout).toEqual(['tomorrow', 'yotsuba']);
  });

  it('leaves the document theme to the layout owner for read-only consumers', async () => {
    document.body.className = 'yotsuba';
    const ConsumerHarness = () => {
      useTheme();
      return null;
    };

    await act(async () => root.render(createElement(ConsumerHarness)));

    expect(document.body.className).toBe('yotsuba');
    expect(testState.updateFaviconMock).not.toHaveBeenCalled();
  });

  it('restores the default favicon when navigating from not-found to mod', async () => {
    testState.boardIdentifier = undefined;
    testState.resolvedAddress = undefined;
    testState.locationPathname = '/not-found';
    await renderHook();

    expect(testState.updateFaviconMock).toHaveBeenLastCalledWith('not-found', undefined);

    testState.locationPathname = '/mod';
    await renderHook();

    expect(testState.updateFaviconMock).toHaveBeenLastCalledWith('default', undefined);
  });

  it('adds the thread updater alert to the board favicon', async () => {
    await renderHook();
    expect(testState.updateFaviconMock).toHaveBeenLastCalledWith('default', undefined);

    await act(async () => {
      useThreadLiveUpdatesStore.setState({ faviconAlert: 'new-replies' });
    });
    expect(testState.updateFaviconMock).toHaveBeenLastCalledWith('default', 'new-replies');

    await act(async () => {
      useThreadLiveUpdatesStore.getState().resetState();
    });
    expect(testState.updateFaviconMock).toHaveBeenLastCalledWith('default', undefined);
  });

  it('shares the multiboard theme bucket on the archive search', async () => {
    testState.boardIdentifier = undefined;
    testState.resolvedAddress = undefined;
    testState.locationPathname = '/search';

    await renderHook();

    expect(latestValue?.[0]).toBe('tomorrow');
    expect(document.body.classList.contains('tomorrow')).toBe(true);

    await act(async () => {
      await latestValue?.[1]('futaba');
    });

    expect(testState.setThemeMock).toHaveBeenCalledWith('nsfw', 'futaba');
  });

  it('keeps the board theme while an optimistic pending post is being persisted', async () => {
    testState.boardIdentifier = undefined;
    testState.directories = [{ address: 'music-posting.eth', nsfw: true }];
    testState.locationPathname = '/pending/0';
    testState.locationState = { pendingPost: { communityAddress: 'music-posting.eth' } };
    testState.resolvedAddress = undefined;

    await renderHook();

    expect(latestValue?.[0]).toBe('tomorrow');
    expect(document.body.classList.contains('tomorrow')).toBe(true);
    expect(document.body.classList.contains('yotsuba')).toBe(false);
  });

  it('keeps the nsfw theme when a live community claims to be safe for work on an nsfw directory board', async () => {
    testState.boardIdentifier = 'b';
    testState.directories = [{ address: 'random-nsfw.bso', nsfw: true }];
    testState.liveCommunity = { features: { safeForWork: true } };
    testState.locationPathname = '/b';
    testState.resolvedAddress = 'random-nsfw.bso';

    await renderHook();

    expect(latestValue?.[0]).toBe('tomorrow');

    await act(async () => {
      await latestValue?.[1]('photon');
    });

    expect(testState.setThemeMock).toHaveBeenCalledWith('nsfw', 'photon');
  });

  it('uses the nsfw theme for a board outside the directory that declares itself not safe for work', async () => {
    testState.boardIdentifier = 'unlisted';
    testState.directories = [];
    testState.liveCommunity = { features: { safeForWork: false } };
    testState.locationPathname = '/unlisted.bso';
    testState.resolvedAddress = 'unlisted.bso';

    await renderHook();

    expect(latestValue?.[0]).toBe('tomorrow');
  });

  it('keeps the sfw theme for a board outside the directory that declares nothing', async () => {
    testState.boardIdentifier = 'unlisted';
    testState.directories = [];
    testState.liveCommunity = { features: { safeForWork: 'false' } };
    testState.locationPathname = '/unlisted.bso';
    testState.resolvedAddress = 'unlisted.bso';

    await renderHook();

    expect(latestValue?.[0]).toBe('yotsuba-b');
  });

  it('marks a worksafe board under the Halloween theme, like 4chan', async () => {
    testState.activeSpecialTheme = 'halloween';
    testState.isSpecialThemeEnabled = true;
    testState.specialThemeEvent = 'halloween-2026';
    testState.sfw = true;

    await renderHook();

    expect(document.body.className).toBe('spooky ws');

    testState.sfw = false;
    await renderHook();

    expect(document.body.className).toBe('spooky');
  });

  it('paints an unset Halloween theme on a board from the first commit, like 4chan, then saves it', async () => {
    testState.activeSpecialTheme = 'halloween';
    testState.isSpecialThemeEnabled = null;

    await renderHook();

    expect(latestValue?.[0]).toBe('spooky');
    expect(testState.setIsEnabledMock).toHaveBeenCalledWith(true);
  });

  it('paints Halloween on a board in a session left open since a theme was picked before it', async () => {
    // StyleSelector saved the pick as turning the seasonal theme off, outside any event.
    testState.activeSpecialTheme = 'halloween';
    testState.isSpecialThemeEnabled = false;
    testState.specialThemeEvent = null;

    await renderHook();

    expect(latestValue?.[0]).toBe('spooky');
    expect(testState.setIsEnabledMock).toHaveBeenCalledWith(true);
  });

  it('keeps a Halloween opt-out off for the rest of that Halloween', async () => {
    testState.activeSpecialTheme = 'halloween';
    testState.isSpecialThemeEnabled = false;
    testState.specialThemeEvent = 'halloween-2026';

    await renderHook();

    expect(latestValue?.[0]).toBe('tomorrow');
    expect(testState.setIsEnabledMock).not.toHaveBeenCalled();
  });

  it('leaves an unset Halloween theme off in multiboard views until a board turns it on', async () => {
    testState.activeSpecialTheme = 'halloween';
    testState.isSpecialThemeEnabled = null;
    testState.boardIdentifier = undefined;
    testState.locationPathname = '/all';
    testState.resolvedAddress = undefined;

    await renderHook();

    expect(latestValue?.[0]).toBe('tomorrow');
    expect(testState.setIsEnabledMock).not.toHaveBeenCalled();
  });

  it('marks worksafe boards only under the Halloween theme', async () => {
    testState.activeSpecialTheme = 'christmas';
    testState.isSpecialThemeEnabled = true;
    testState.specialThemeEvent = 'christmas-2026';
    testState.sfw = true;

    await renderHook();

    expect(document.body.className).toBe('tomorrow');
  });
});
