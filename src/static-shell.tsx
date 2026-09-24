// Build-time render of the home page's first frame (see scripts/vite-static-shell.mjs). index.html
// shows it while the app's JavaScript downloads, and React replaces it on its first commit. It
// renders the real App in jsdom before accounts or peer content have loaded, which is also all that
// React's first commit can show, so the handoff does not move anything.
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '../public/translations/en/default.json';
import App from './app';

export const renderStaticShell = async (): Promise<string> => {
  if (!i18next.isInitialized) {
    await i18next.use(initReactI18next).init({
      lng: 'en',
      fallbackLng: 'en',
      ns: ['default'],
      defaultNS: 'default',
      resources: { en: { default: en } },
      showSupportNotice: false,
    });
  }
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  // The observer runs as a microtask right after React's first commit, before passive effects,
  // which is the frame a browser paints for this render.
  const html = await new Promise<string>((resolve) => {
    const observer = new MutationObserver(() => {
      observer.disconnect();
      resolve(container.innerHTML);
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
  return html;
};
