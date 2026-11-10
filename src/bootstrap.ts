import { isDownloadFailure } from './lib/download-failures';

// Instrument before importing ReactDOM, the app, or development inspectors.
// The guarded import and Profiler boundary are eliminated from ordinary production builds.
const start = async () => {
  if (import.meta.env.DEV || import.meta.env.MODE === 'profiling') {
    const { installCollector } = await import('../scripts/react-perf/collector.mjs');
    const collector = await installCollector({ buildType: import.meta.env.DEV ? 'development' : 'profiling' });
    import.meta.hot?.dispose(() => collector?.dispose());
  }

  if (import.meta.env.DEV) {
    void import('./lib/dev-tools');
  }

  await import('./index');
};

// When index.tsx or a module it imports, such as React, fails to download, nothing would replace the
// static frame or run it. Without React or the translations, which come with that download, a plain
// reload in English takes its place, like index.html's noscript message. Other errors reach the console
// as before; index.tsx reports a failed download of the app itself.
const showDownloadFailure = () => {
  const refresh = document.createElement('button');
  refresh.type = 'button';
  refresh.textContent = 'Refresh';
  refresh.style.cssText = 'appearance: none; padding: 0; border: 0; background: transparent; color: var(--post-link-text-color); cursor: pointer; font: inherit';
  refresh.addEventListener('click', () => window.location.reload());
  const alert = document.createElement('div');
  alert.setAttribute('role', 'alert');
  alert.style.cssText = 'color: red; margin: 12px 5px; text-align: center';
  alert.append('Connection Error [', refresh, ']');
  document.getElementById('root')?.replaceChildren(alert);
};

void start().catch((error: unknown) => {
  if (!isDownloadFailure(error)) throw error;
  showDownloadFailure();
});
