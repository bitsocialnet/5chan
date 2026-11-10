import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('../polyfills.js', () => ({}));
vi.mock('../lib/init-translations', () => ({}));
vi.mock('../components/app-update-registration', () => ({ default: () => null }));
vi.mock('../components/web-analytics', () => ({ default: () => null }));
vi.mock('../lib/p2p-browser-config', () => ({ configureP2PBrowserPkcOptions: () => {} }));
vi.mock('@capacitor/app', () => ({ App: { addListener: () => {}, exitApp: () => {} } }));
vi.mock('../route-modules', () => ({ loadRouteModules: async () => {} }));
// The app's chunk failed to download, as on a dropped connection or a deploy that removed it.
vi.mock('../app', () => {
  throw new TypeError('Importing a module script failed.');
});
vi.mock('../app-with-board-routes', () => {
  throw new TypeError('Importing a module script failed.');
});

describe('index', () => {
  const originalLocation = window.location;
  let calls: string[];

  beforeEach(() => {
    calls = [];
    // React's first commit replaces the static frame index.html painted (scripts/vite-static-shell.mjs).
    document.body.innerHTML = '<div id="root"><div data-static-shell>static frame</div></div>';
    Object.defineProperty(window, 'location', { configurable: true, value: { ...originalLocation, reload: vi.fn(() => calls.push('reload')) } });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (file: string, init?: RequestInit) => {
        calls.push(`fetch ${file} ${init?.cache}`);
        return new Response();
      }),
    );
  });

  afterEach(() => {
    document.body.innerHTML = '';
    document.head.querySelectorAll('link').forEach((link) => link.remove());
    vi.unstubAllGlobals();
    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
  });

  it('offers a reload in place of the static frame when the app fails to download', async () => {
    await import('../index');

    const alert = await vi.waitFor(() => {
      const element = document.querySelector('#root [role="alert"]');
      expect(element).not.toBeNull();
      return element!;
    });
    expect(alert.textContent).toContain('thread_update_connection_error');
    expect(document.querySelector('[data-static-shell]')).toBeNull();

    alert.querySelector('button')!.click();
    await vi.waitFor(() => expect(calls).toContain('reload'));
  });

  it('offers the reload too when the app with the board routes and then the app alone fail to download', async () => {
    vi.resetModules();
    const routePreload = document.createElement('link');
    routePreload.rel = 'modulepreload';
    routePreload.href = '/assets/board-routes.js';
    routePreload.setAttribute('data-fivechan-route-preload', '');
    document.head.appendChild(routePreload);

    await import('../index');

    await vi.waitFor(() => expect(document.querySelector('#root [role="alert"]')).not.toBeNull());
    expect(document.querySelector('[data-static-shell]')).toBeNull();
  });
});
