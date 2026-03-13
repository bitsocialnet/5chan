# Known Surprises

This file tracks repository-specific confusion points that caused agent mistakes.

## Entry Criteria

Add an entry only if all are true:

- It is specific to this repository (not generic advice).
- It is likely to recur for future agents.
- It has a concrete mitigation that can be followed.

If uncertain, ask the developer before adding an entry.

## Entry Template

```md
### [Short title]

- **Date:** YYYY-MM-DD
- **Observed by:** agent name or contributor
- **Context:** where/when it happened
- **What was surprising:** concrete unexpected behavior
- **Impact:** what went wrong or could go wrong
- **Mitigation:** exact step future agents should take
- **Status:** confirmed | superseded
```

## Entries

### Vitest changed runs need Node web storage disabled

- **Date:** 2026-03-13
- **Observed by:** Codex
- **Context:** Evaluating Vitest 4.1 `--changed`, targeted file runs, and `--detectAsyncLeaks` after the Vite 8 / Vitest 4.1 upgrade
- **What was surprising:** On Node 22, some Vitest worker runs print `--localstorage-file was provided without a valid path` and replace jsdom `localStorage` with a broken object, so targeted store and jsdom tests fail even though the full suite passes.
- **Impact:** Agents may think Vitest 4.1 changed runs are incompatible with this repo, or chase fake regressions like `localStorage.clear/removeItem/setItem is not a function`.
- **Mitigation:** For Vitest targeted runs that use `--changed`, coverage-on-changed, or async leak detection, run with `NODE_OPTIONS=--no-webstorage` so jsdom keeps control of `localStorage`.
- **Status:** confirmed

### Portless breaks Windows installs

- **Date:** 2026-03-04
- **Observed by:** Codex
- **Context:** GitHub Actions `Test Windows` dependency install on `windows-2022`
- **What was surprising:** `portless@0.5.2` is a local dev-only tool, but keeping it in `devDependencies` makes `yarn install` fail on Windows because the package declares `win32` unsupported.
- **Impact:** Windows CI fails before build steps run, even though the app does not need `portless` there.
- **Mitigation:** Keep `portless` in `optionalDependencies` and make `yarn start` fall back to direct `vite` startup when `portless` is unavailable.
- **Status:** confirmed

### Do not add plebbit-js directly for Electron RPC

- **Date:** 2026-03-07
- **Observed by:** Codex
- **Context:** Adding `knip` exposed `electron/start-plebbit-rpc.js` importing `@plebbit/plebbit-js/rpc` as an unlisted dependency.
- **What was surprising:** Even though that file imports `@plebbit/plebbit-js` directly, repository policy is to depend only on `@bitsocialnet/bitsocial-react-hooks` and use its transitive copy of `plebbit-js`.
- **Impact:** Agents may “fix” the unlisted import by adding `@plebbit/plebbit-js` to `package.json`, which violates project policy.
- **Mitigation:** Do not add `@plebbit/plebbit-js` to `package.json` for this repo. If `knip` flags `electron/start-plebbit-rpc.js`, handle it with a targeted `ignoreIssues` entry instead.
- **Status:** confirmed
