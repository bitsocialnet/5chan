import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('update-favicon', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    vi.resetModules();
  });

  it('replaces managed tab icon links without removing larger crawler icons', async () => {
    const { updateFavicon } = await import('../update-favicon');

    document.head.innerHTML =
      '<link rel="icon" sizes="16x16" href="/favicon.ico"><link rel="shortcut icon" sizes="16x16" href="/favicon.ico"><link rel="icon" sizes="192x192" href="/manifest-icon-192x192.png"><link rel="apple-touch-icon" sizes="256x256" href="/apple-touch-icon.png">';

    updateFavicon('default');
    expect(document.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]')).toHaveLength(4);
    expect(document.querySelector('link[rel="icon"][sizes="16x16"]')?.getAttribute('href')).toBe('/favicon.ico?variant=nsfw');
    expect(document.querySelector('link[rel="shortcut icon"][sizes="16x16"]')?.getAttribute('href')).toBe('/favicon.ico?variant=nsfw');
    expect(document.querySelector('link[rel="icon"][sizes="192x192"]')?.getAttribute('href')).toBe('/manifest-icon-192x192.png');
    expect(document.querySelector('link[rel="apple-touch-icon"]')?.getAttribute('href')).toBe('/apple-touch-icon.png');

    updateFavicon('default');
    expect(document.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]')).toHaveLength(4);

    updateFavicon('sfw');
    expect(document.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]')).toHaveLength(4);
    expect(document.querySelector('link[rel="icon"][sizes="16x16"]')?.getAttribute('href')).toBe('/favicon2.ico?variant=sfw');
    expect(document.querySelector('link[rel="shortcut icon"][sizes="16x16"]')?.getAttribute('href')).toBe('/favicon2.ico?variant=sfw');
    expect(document.querySelector('link[rel="icon"][sizes="192x192"]')?.getAttribute('href')).toBe('/manifest-icon-192x192.png');
    expect(document.querySelector('link[rel="apple-touch-icon"]')?.getAttribute('href')).toBe('/apple-touch-icon.png');
  });

  it('can switch to the not-found ico favicon without removing larger crawler icons', async () => {
    const { updateFavicon } = await import('../update-favicon');

    document.head.innerHTML =
      '<link rel="icon" sizes="16x16" href="/favicon.ico"><link rel="shortcut icon" sizes="16x16" href="/favicon.ico"><link rel="icon" sizes="192x192" href="/manifest-icon-192x192.png"><link rel="apple-touch-icon" sizes="256x256" href="/apple-touch-icon.png">';

    updateFavicon('not-found');

    expect(document.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]')).toHaveLength(4);
    expect(document.querySelector('link[rel="icon"][sizes="16x16"]')?.getAttribute('href')).toBe('/favicon-404.ico?variant=404');
    expect(document.querySelector('link[rel="shortcut icon"][sizes="16x16"]')?.getAttribute('href')).toBe('/favicon-404.ico?variant=404');
    expect(document.querySelector('link[rel="icon"][sizes="16x16"]')?.getAttribute('type')).toBe('image/x-icon');
    expect(document.querySelector('link[rel="shortcut icon"][sizes="16x16"]')?.getAttribute('type')).toBe('image/x-icon');
    expect(document.querySelector('link[rel="icon"][sizes="192x192"]')?.getAttribute('href')).toBe('/manifest-icon-192x192.png');
    expect(document.querySelector('link[rel="apple-touch-icon"]')?.getAttribute('href')).toBe('/apple-touch-icon.png');

    updateFavicon('default');
    expect(document.querySelector('link[rel="icon"][sizes="16x16"]')?.getAttribute('href')).toBe('/favicon.ico?variant=nsfw');
    expect(document.querySelector('link[rel="shortcut icon"][sizes="16x16"]')?.getAttribute('href')).toBe('/favicon.ico?variant=nsfw');
    expect(document.querySelector('link[rel="icon"][sizes="16x16"]')?.getAttribute('type')).toBe('image/png');
  });

  it('shows thread updater alerts on the board favicon but never on the not-found favicon', async () => {
    const { updateFavicon } = await import('../update-favicon');

    updateFavicon('default', 'new-posts');
    expect(document.querySelector('link[rel="icon"][sizes="16x16"]')?.getAttribute('href')).toBe('/favicon-newposts.ico?variant=default-new-posts');
    expect(document.querySelector('link[rel="shortcut icon"][sizes="16x16"]')?.getAttribute('href')).toBe('/favicon-newposts.ico?variant=default-new-posts');

    updateFavicon('sfw', 'new-replies');
    expect(document.querySelector('link[rel="icon"][sizes="16x16"]')?.getAttribute('href')).toBe('/favicon2-newreplies.ico?variant=sfw-new-replies');

    updateFavicon('sfw', 'dead');
    expect(document.querySelector('link[rel="icon"][sizes="16x16"]')?.getAttribute('href')).toBe('/favicon2-deadthread.ico?variant=sfw-dead');
    expect(document.querySelector('link[rel="icon"][sizes="16x16"]')?.getAttribute('type')).toBe('image/png');

    updateFavicon('not-found', 'new-posts');
    expect(document.querySelector('link[rel="icon"][sizes="16x16"]')?.getAttribute('href')).toBe('/favicon-404.ico?variant=404');

    updateFavicon('default');
    expect(document.querySelector('link[rel="icon"][sizes="16x16"]')?.getAttribute('href')).toBe('/favicon.ico?variant=nsfw');
    expect(document.querySelectorAll('link[rel="icon"][sizes="16x16"], link[rel="shortcut icon"][sizes="16x16"]')).toHaveLength(2);
  });

  it('marks only non-special, non-routing aggregate sfw boards as sfw', async () => {
    const { isSfwBoard } = await import('../update-favicon');
    const { TRASH_BOARD_ADDRESS } = await import('../special-boards');

    expect(
      isSfwBoard({
        pathname: '/',
        isSpecialTheme: false,
        isInAllView: false,
        isInSubscriptionsView: false,
        isInModView: false,
        communityAddress: 'music.eth',
        directories: [{ address: 'music.eth', nsfw: false }],
      }),
    ).toBe(false);

    expect(
      isSfwBoard({
        pathname: '/music.eth',
        isSpecialTheme: false,
        isInAllView: false,
        isInSubscriptionsView: false,
        isInModView: false,
        communityAddress: 'music.eth',
        directories: [
          { address: 'music.eth', nsfw: false },
          { address: 'flash.eth', nsfw: true },
        ],
      }),
    ).toBe(true);

    expect(
      isSfwBoard({
        pathname: '/flash.eth',
        isSpecialTheme: false,
        isInAllView: false,
        isInSubscriptionsView: false,
        isInModView: false,
        communityAddress: 'flash.eth',
        directories: [{ address: 'flash.eth', nsfw: true }],
      }),
    ).toBe(false);

    expect(
      isSfwBoard({
        pathname: '/trash',
        isSpecialTheme: false,
        isInAllView: false,
        isInSubscriptionsView: false,
        isInModView: false,
        communityAddress: TRASH_BOARD_ADDRESS,
        directories: [],
      }),
    ).toBe(false);
  });

  it('prefers the derived community verdict over the directory lookup', async () => {
    const { isSfwBoard } = await import('../update-favicon');

    const base = {
      pathname: '/flash.eth',
      isSpecialTheme: false,
      isInAllView: false,
      isInSubscriptionsView: false,
      isInModView: false,
      communityAddress: 'flash.eth',
    };

    // An undeclared board stays on the directory verdict.
    expect(isSfwBoard({ ...base, communityNsfw: undefined, directories: [{ address: 'flash.eth', nsfw: true }] })).toBe(false);

    // A board outside the directory that the protocol declares NSFW is no longer treated as sfw.
    expect(isSfwBoard({ ...base, communityNsfw: true, directories: [] })).toBe(false);

    // A declared-sfw verdict is still sfw.
    expect(isSfwBoard({ ...base, communityNsfw: false, directories: [] })).toBe(true);
  });
});
