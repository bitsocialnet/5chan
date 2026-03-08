import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('update-favicon', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    vi.resetModules();
  });

  it('creates a favicon link and replaces it only when the target icon changes', async () => {
    const { updateFavicon } = await import('../update-favicon');

    updateFavicon(false);
    expect(document.querySelectorAll('link[rel="icon"]')).toHaveLength(1);
    expect(document.querySelector('link[rel="icon"]')?.getAttribute('href')).toBe('/favicon.ico');

    updateFavicon(false);
    expect(document.querySelectorAll('link[rel="icon"]')).toHaveLength(1);

    updateFavicon(true);
    expect(document.querySelectorAll('link[rel="icon"]')).toHaveLength(1);
    expect(document.querySelector('link[rel="icon"]')?.getAttribute('href')).toBe('/favicon2.ico');
  });

  it('marks only non-special, non-routing aggregate sfw boards as sfw', async () => {
    const { isSfwBoard } = await import('../update-favicon');

    expect(
      isSfwBoard({
        pathname: '/',
        isSpecialTheme: false,
        isInAllView: false,
        isInSubscriptionsView: false,
        isInModView: false,
        subplebbitAddress: 'music.eth',
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
        subplebbitAddress: 'music.eth',
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
        subplebbitAddress: 'flash.eth',
        directories: [{ address: 'flash.eth', nsfw: true }],
      }),
    ).toBe(false);
  });
});
