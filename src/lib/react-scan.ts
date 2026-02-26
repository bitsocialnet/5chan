if (import.meta.env.DEV) {
  import('react-scan').then(({ scan, getReport }) => {
    scan({
      enabled: true,
      showToolbar: !(window as any).__PROFILING__,
    });
    (window as any).__getReactScanReport = getReport;
  });
}
