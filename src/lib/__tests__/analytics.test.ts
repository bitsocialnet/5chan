import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sdk = vi.hoisted(() => ({ inject: vi.fn(), pageview: vi.fn(), track: vi.fn() }));
vi.mock('@vercel/analytics', () => sdk);

const setLocation = (url: string, isElectron = false) => vi.stubGlobal('window', { location: new URL(url), isElectron });
const settle = () => vi.dynamicImportSettled();

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  vi.stubEnv('PROD', true);
  vi.stubEnv('VITE_APP_DISTRIBUTION', '');
  setLocation('https://5chan.app/#/');
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('analytics privacy', () => {
  it('works in supported browsers without Array.prototype.at', async () => {
    const { getAnalyticsPath, trackPageView } = await import('../analytics/client');
    vi.spyOn(Array.prototype, 'at').mockImplementation(() => {
      throw new Error('unsupported browser API');
    });
    expect(getAnalyticsPath('/g/thread/private-cid')).toBe('/g/thread');
    expect(() => trackPageView('/g')).not.toThrow();
    await settle();
    expect(sdk.pageview).toHaveBeenCalledExactlyOnceWith({ path: '/g', route: '/[board]' });
  });
  it.each([
    ['/', '/'],
    ['/all', '/all'],
    ['/all/catalog?t=day', '/all/catalog'],
    ['/subs', '/subs'],
    ['/g', '/g'],
    ['/technology-posting.bso/catalog', '/g/catalog'],
    ['/technology-posting.eth', '/g'],
    ['/g/42', '/g/page'],
    ['/g/thread/private-cid', '/g/thread'],
    ['/g/thread/another-cid?query=secret#123', '/g/thread'],
    ['/private-board.bso/thread/private-cid', '/other/thread'],
    ['/private-board.bso', '/other'],
    ['/pending/123', '/pending'],
    ['/search?query=private+words', '/search'],
    ['/search/catalog?query=secret', '/search/catalog'],
    ['/search/directory', '/search/directory'],
    ['/settings/account-data', '/settings'],
    ['/private-board.bso/board-settings', '/settings'],
    ['/g/thread/private-cid/settings?section=private', '/settings'],
    ['/g/mod/queue', '/mod/queue'],
    ['/trash', '/trash'],
    ['/off-topic.bso/thread/cid', '/trash/thread'],
    ['/faq', '/faq'],
    ['/invalid/private/path', '/not-found'],
    ['/%broken', '/not-found'],
  ])('normalizes %s to %s without leaking route data', async (input, expected) => {
    const { getAnalyticsPath } = await import('../analytics/client');
    expect(getAnalyticsPath(input)).toBe(expected);
    expect(getAnalyticsPath(expected)).toBe(expected);
  });

  it('sanitizes both pageview and custom-event URLs at the transport boundary', async () => {
    setLocation('https://5chan.app/?token=private#/private-board.bso/thread/private-cid?s=private-search');
    const { sanitizeAnalyticsEvent } = await import('../analytics/client');
    expect(sanitizeAnalyticsEvent({ type: 'pageview', url: 'https://5chan.app/g/thread/private-cid?secret=value#anchor' })).toEqual({
      type: 'pageview',
      url: 'https://5chan.app/g/thread',
    });
    expect(sanitizeAnalyticsEvent({ type: 'event', url: 'https://5chan.app/?token=private#/secret' })).toEqual({
      type: 'event',
      url: 'https://5chan.app/',
    });
    expect(sanitizeAnalyticsEvent({ type: 'pageview', url: 'invalid url' })).toBeNull();
  });

  it.each([
    ['/', '/'],
    ['/g', '/[board]'],
    ['/g/thread', '/[board]/thread'],
    ['/other/catalog', '/[board]/catalog'],
    ['/trash/page', '/[board]/page'],
    ['/all/catalog', '/all/catalog'],
    ['/mod/queue', '/mod/queue'],
    ['/search/catalog', '/search/catalog'],
    ['/faq', '/faq'],
  ])('routes %s as %s so custom events, which carry the route, never name a board', async (path, route) => {
    const { getAnalyticsRoute } = await import('../analytics/client');
    expect(getAnalyticsRoute(path)).toBe(route);
  });

  it('sends only the thread or reply kind with a posting event', async () => {
    const { trackPostingEvent } = await import('../analytics');
    trackPostingEvent('post_challenge_failed', { kind: 'thread' });
    trackPostingEvent('post_upload_failed', { kind: 'reply' });
    await settle();
    expect(sdk.track.mock.calls).toEqual([
      ['post_challenge_failed', { kind: 'thread' }],
      ['post_upload_failed', { kind: 'reply' }],
    ]);
  });
});

describe('analytics initialization', () => {
  it('initializes once with automatic pageviews disabled and preserves distinct thread visits', async () => {
    const { trackPageView } = await import('../analytics');
    const { sanitizeAnalyticsEvent } = await import('../analytics/client');
    trackPageView('/g/thread/first-cid');
    trackPageView('/g/thread/second-cid');
    await settle();
    expect(sdk.inject).toHaveBeenCalledExactlyOnceWith({ disableAutoTrack: true, beforeSend: sanitizeAnalyticsEvent, mode: 'production' });
    expect(sdk.pageview.mock.calls).toEqual([[{ path: '/g/thread', route: '/[board]/thread' }], [{ path: '/g/thread', route: '/[board]/thread' }]]);
  });

  it.each([
    ['http://localhost:5173/#/g', false, '', true],
    ['https://branch.5chan.localhost/#/g', false, '', true],
    ['https://preview.vercel.app/#/g', false, '', true],
    ['https://5channel.org/#/g', false, '', true],
    ['file:///app/index.html#/g', true, '', true],
    ['capacitor://localhost/#/g', false, '', true],
    ['https://5chan.app/#/g', true, '', true],
    ['https://5chan.app/#/g', false, 'fdroid', true],
    ['https://5chan.app/#/g', false, '', false],
    ['http://5chan.app/#/g', false, '', true],
  ])('never initializes or tracks on an excluded environment (%s, Electron=%s, distribution=%s, production=%s)', async (url, electron, distribution, production) => {
    setLocation(url, electron);
    vi.stubEnv('VITE_APP_DISTRIBUTION', distribution);
    vi.stubEnv('PROD', production);
    const { trackPageView, trackPostingEvent } = await import('../analytics');
    const { sanitizeAnalyticsEvent } = await import('../analytics/client');
    trackPageView('/g');
    trackPostingEvent('post_publish_failed', { kind: 'thread' });
    await settle();
    expect(sdk.inject).not.toHaveBeenCalled();
    expect(sdk.pageview).not.toHaveBeenCalled();
    expect(sdk.track).not.toHaveBeenCalled();
    expect(sanitizeAnalyticsEvent({ type: 'event', url })).toBeNull();
  });

  it('supports the existing www production hostname', async () => {
    setLocation('https://www.5chan.app/#/g');
    const { trackPageView } = await import('../analytics');
    trackPageView('/g');
    await settle();
    expect(sdk.pageview).toHaveBeenCalledExactlyOnceWith({ path: '/g', route: '/[board]' });
  });

  it('does not throw or reject into the app if analytics initialization or tracking fails', async () => {
    const { trackPageView, trackPostingEvent } = await import('../analytics');
    sdk.inject.mockImplementation(() => {
      throw new Error('analytics unavailable');
    });
    expect(() => trackPageView('/g')).not.toThrow();
    expect(() => trackPostingEvent('post_publish_failed', { kind: 'thread' })).not.toThrow();
    await settle();
    expect(sdk.pageview).not.toHaveBeenCalled();
    expect(sdk.track).not.toHaveBeenCalled();
  });

  it('isolates errors from event dispatch after successful initialization', async () => {
    const { trackPageView, trackPostingEvent } = await import('../analytics');
    sdk.pageview.mockImplementation(() => {
      throw new Error('blocked');
    });
    sdk.track.mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => trackPageView('/g')).not.toThrow();
    expect(() => trackPostingEvent('post_publish_failed', { kind: 'reply' })).not.toThrow();
    await settle();
    expect(sdk.inject).toHaveBeenCalledOnce();
  });
});
