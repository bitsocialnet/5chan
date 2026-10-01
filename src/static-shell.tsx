// Build-time render of first frames (see scripts/vite-static-shell.mjs): the home page, and each
// directory board's index page at desktop and mobile width. index.html shows the matching frame while
// the app's JavaScript downloads, and React replaces it on its first commit. It renders the real App
// in jsdom before accounts or peer content have loaded, which is also all that React's first commit
// can show, so the handoff does not move anything.
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '../public/translations/en/default.json';
import App from './app';
import { MOBILE_BREAKPOINT_WIDTH, useIsMobileBreakpoint } from './hooks/use-window-width';
import useFeedCacheStore from './stores/use-feed-cache-store';
import { communitiesPagesStore, communitiesStore, feedsStore, repliesPagesStore, repliesStore } from './lib/bitsocial-internals/stores';

export interface StaticShellVariant {
  hash?: string;
  width?: number;
  // Rendered in place of the banner the static frame picks at load time.
  banner?: string;
}

export interface StaticShellRender {
  html: string;
  // The theme class the app applied during its first commit.
  bodyClass: string;
  // Values React gave each <select>, which set a DOM property rather than markup.
  selects: string[];
}

// use-window-width only follows resizes while something subscribes to it, so a probe stays mounted.
const ViewportProbe = () => String(useIsMobileBreakpoint());
let viewportProbe: HTMLElement | undefined;

// A visitor's first commit starts with empty feed and peer data. Earlier renders in this process fill
// these stores from their effects, so each render starts from the state they had before the first one.
const dataStores = [useFeedCacheStore, communitiesStore, communitiesPagesStore, feedsStore, repliesStore, repliesPagesStore];
let initialDataStates: unknown[] | undefined;

const resetDataStores = () => {
  initialDataStates ??= dataStores.map((store) => store.getState());
  dataStores.forEach((store, index) => store.setState(initialDataStates![index] as never, true));
};

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));

const setViewportWidth = async (width: number) => {
  if (!viewportProbe) {
    viewportProbe = document.createElement('div');
    createRoot(viewportProbe).render(<ViewportProbe />);
    await nextFrame();
  }
  if (window.innerWidth !== width) {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
    window.dispatchEvent(new window.Event('resize'));
    await nextFrame();
    await nextFrame();
  }
  if (viewportProbe.textContent !== String(width < MOBILE_BREAKPOINT_WIDTH)) throw new Error(`static shell: viewport width ${width} did not reach the app`);
};

export const renderStaticShell = async ({ hash = '#/', width = 1024, banner }: StaticShellVariant = {}): Promise<StaticShellRender> => {
  if (!i18next.isInitialized) {
    await i18next.use(initReactI18next).init({
      lng: 'en',
      fallbackLng: 'en',
      ns: ['default'],
      defaultNS: 'default',
      resources: { en: { default: en } },
    });
  }
  await setViewportWidth(width);
  resetDataStores();
  window.location.hash = hash;
  document.body.className = '';
  if (banner) window.__FIVECHAN_SHELL_BANNER__ = banner;
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  // The observer runs as a microtask right after React's first commit, after its layout effects
  // (which set the theme class) and before passive effects: the frame a browser paints for this render.
  const rendered = await new Promise<StaticShellRender>((resolve) => {
    const observer = new MutationObserver(() => {
      observer.disconnect();
      resolve({ html: container.innerHTML, bodyClass: document.body.className, selects: [...container.querySelectorAll('select')].map((select) => select.value) });
    });
    observer.observe(container, { childList: true });
    root.render(
      <HashRouter useTransitions={false}>
        <App />
      </HashRouter>,
    );
  });
  await new Promise((resolve) => setTimeout(resolve));
  root.unmount();
  container.remove();
  delete window.__FIVECHAN_SHELL_BANNER__;
  return rendered;
};
