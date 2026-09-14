# Measure the affected flow

Use the task's URL, selected browser, real routes/content, and owned session. For a loading or interaction performance issue, include a Chromium low-spec pass with `./scripts/pw-throttle.sh <session> mid` (or the assigned profile). Apply it before measurement; Firefox/WebKit do not support this CDP helper. Record viewport, browser, throttle, cache state, dev/production build, and capture overhead so before/after samples are comparable.

## Browser evidence

Use existing evidence first. When timings alone cannot identify the affected phase, this small observer can be loaded before the app. Open `about:blank` with the wrapper, then run the function below through `playwright-cli -s=<session> run-code --filename=<task-owned-file>`. It needs a new document load to take effect; a hash-only transition does not run init scripts again.

```javascript
async page => {
  await page.addInitScript(() => {
    window.__PROFILING__ = true;
    window.__PROFILE__ = { longTasks: [], shifts: [], lcp: null, supported: [] };
    const observe = (type, collect) => {
      if (!PerformanceObserver.supportedEntryTypes.includes(type)) return;
      window.__PROFILE__.supported.push(type);
      new PerformanceObserver(list => list.getEntries().forEach(collect)).observe({ type, buffered: true });
    };
    observe("longtask", e => window.__PROFILE__.longTasks.push({ start: e.startTime, duration: e.duration }));
    observe("layout-shift", e => {
      if (!e.hadRecentInput) window.__PROFILE__.shifts.push({ start: e.startTime, value: e.value });
    });
    observe("largest-contentful-paint", e => { window.__PROFILE__.lcp = e.startTime; });
  });
}
```

`__PROFILING__` suppresses the app's Agentation toolbar. Preserve the installed React DevTools hook; do not replace or wrap it merely to count commits. Unsupported observer types are unavailable measurements, not zero values.

- **Document load:** navigate to the full hash URL, explicitly reloading if the preceding navigation changed only the hash. Read `performance.getEntriesByType("navigation")` and measure when the actual feed/control becomes ready. The document load event can finish before peer content arrives; a reload is not automatically a cold-cache test.
- **Hash transition or interaction:** mark phase start, perform the action, wait for its observable completion, then mark phase end in the same document. Put those operations in one `run-code` invocation to avoid including idle time between CLI calls. Do not compare marks across reloads.
- **Scroll or repeated interaction:** capture phase start/end timestamps and filter long tasks/shifts to that interval. Hash routing retains counters; do not sum cumulative data again for each route. Collect results before a document reload discards them.

```bash
playwright-cli -s=profile-task eval '() => performance.getEntriesByType("navigation").map(n => ({ loadMs: n.loadEventEnd, domMs: n.domContentLoadedEventEnd }))'
playwright-cli -s=profile-task eval '() => window.__PROFILE__'
playwright-cli -s=profile-task console error
```

Raw layout-shift events, even with recent-input events excluded, are not the complete CLS session-window calculation. LCP describes a document load, not each hash navigation. Long tasks show main-thread stalls without identifying their cause. Treat all counts and thresholds as triage evidence; establish measured cost before recommending memoization or refactoring.

Use a [Playwright trace](../../playwright-cli/references/tracing.md) to correlate actions with requests/DOM state when useful; it is not a CPU sampling profile. Record missing peer content, dynamic tooling readiness, background activity, and instrumentation overhead as limitations.

## React diagnostics and runtime traces

Run `corepack yarn doctor --scope changed --base <base> --blocking none --no-parallel` for static diagnostics on the actual task diff. Use `HEAD` while changes are uncommitted, or the task's starting commit after committing. Use `--scope full` for a deliberate full baseline. Fix relevant new findings; do not chase a score or suppress unrelated rules to clear the report.

For a React runtime trace, inspect `corepack yarn doctor:scan --help`, then supply the running app's full hash URL explicitly. React Doctor records Chrome performance and React render evidence; static diagnostics alone do not measure runtime cost.

```bash
corepack yarn doctor:scan 'http://localhost:5173/#/all' --format json
```

Substitute the actual app URL. The task owner coordinates this serialized browser pass: close owned Playwright sessions first and check `./scripts/pw-session.sh status`; defer when another task holds the browser slot. React Doctor manages its own temporary isolated Chrome profile, so it is the exception to the Playwright session wrapper. Do not run another browser or heavy check until the scan exits. Use an interactive terminal, perform the scoped interaction, then press Enter to stop (the command caps recording at five minutes). Confirm its browser closes before the next browser task. Prefer a production preview for representative timing without dev inspectors.

`--cdp <endpoint>` is optional for an explicitly task-owned dedicated Chrome debugging profile. It requires no nonblank tabs and leaves the attached browser running afterward; retain ownership and close that exact browser yourself. Do not attach to a personal browser.
Capture the specific route/interaction, stop the recording when it completes, and retain the returned trace and summary paths. Record build mode, tooling overhead, and missing content. For automated observer measurements, set `window.__PROFILING__ = true` before app navigation to suppress Agentation; a separate Doctor scan must account for any visible toolbar in its capture. Component render counts are supporting evidence, not proof of a bottleneck. To resolve a visible component to source, use `inspect-elements` and its retained `__ELEMENT_SOURCE__` helper.
