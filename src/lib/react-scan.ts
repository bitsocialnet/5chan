if (import.meta.env.DEV) {
  const { scan, getReport } = await import('react-scan');
  scan({
    enabled: true,
    showToolbar: !(window as any).__PROFILING__,
    playSound: !(window as any).__PROFILING__,
    report: true,
  });
  (window as any).__getReactScanReport = getReport;
}
