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

void start();
