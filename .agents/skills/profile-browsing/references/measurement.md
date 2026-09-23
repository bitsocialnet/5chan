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

## Automated React evidence

The configured `perf:check` scenarios run three samples at 4x CPU by default. `perf:record` defaults to one sample at normal CPU; pass explicit `--cpu` and `--samples` for a comparable before/after study. Use `--target`, `--scenario`, `--url`, and `--output` to select the flow, reuse an instrumented server, or choose artifact storage. Output includes JSON and native Chrome performance traces. The runner waits for observable scenario readiness and a bounded quiet period for the targeted components before each phase; this does not imply global quiescence. It resets the collector, records all commits during the action, and checks the phase against its budgets.

```bash
corepack yarn perf:check --scenario crypto-address-draft
corepack yarn perf:record --scenario crypto-address-draft --cpu 4 --samples 3
corepack yarn doctor:check --base HEAD
```

The runner owns its browser/server cleanup and coordinates the shared browser resource lock. Do not launch it while a manual browser session is owned elsewhere; defer on contention. `perf:install` installs the pinned browser once. `perf:test` validates collector compatibility and deliberately exercises failure cases; run it after React, Bippy, or collector changes.

### Collector and timing semantics

Development and explicit profiling builds load `scripts/react-perf/collector.mjs` before ReactDOM. `window.__REACT_PERF__.reset()` starts a bounded phase; `.snapshot()` returns schema-versioned evidence with instance/commit identity, lifecycle phase, and overflow/unavailable counters. Preserve React DevTools' hook. Count committed updates; StrictMode function replays and aborted render attempts are not additional committed updates. Same-named components remain distinct instances. Missing instrumentation or dropped events must fail a check, never become a zero-count success.

The app's root `<Profiler>` feeds `onProfilerRender` so timings are actual subtree render durations. These are not per-component self times; do not sum ancestor/descendant spans to claim total CPU cost. Use the native trace for effects, cascading updates, and the phase's main-thread work. Neither Bippy counts nor Doctor's runtime JSON establish that a render was avoidable.

Normal production builds exclude both the collector and Profiler wrapper. For optimized React timing use `yarn build:profile` then `yarn preview:profile`, and pass that origin via `--url`. This separate `build-profile/` uses `react-dom/profiling`, preserves component names and sourcemaps, and disables PWA registration. Regular production previews remain appropriate for page-level timing only. Record capture/build overhead and retain equivalent settings in comparisons.

### Covered scenarios and budgets

5chan covers unsaved crypto-address typing/clearing, an interface checkbox toggle, and the existing populated catalog benchmark. Settings scenarios use `/#/subs/settings` with a fresh, empty subscription list and wait for its empty-state message, isolating live all-feed footer updates; the separate catalog scenario supplies populated-content coverage. The catalog fixture exercises real CatalogRow/virtualizer components with seeded content and intercepted fixture media; it is not evidence of live peer transport latency. The typing scenarios require exactly five committed local updates for five keystrokes and one for clearing. The catalog bounds runaway commits and requires populated output; its detailed instance counts stay in the report.

`scripts/react-perf/config.mjs` owns the budgets. Exact component-update limits reflect each tested state change; timing caps are generous smoke limits rather than calibrated performance targets. Diagnose any failing sample from its trace and component/commit data before changing a limit. Establish tighter latency/render budgets from repeated baselines with fixed content and throttling.

Return scenario/action, URL, build type, viewport/browser/CPU, sample count, lifecycle/instance and commit counts, root render duration, action latency, dropped/unavailable data, budget results, and JSON/trace paths. For a visible component's source, use `inspect-elements` and the retained `__ELEMENT_SOURCE__` helper in a development build.
