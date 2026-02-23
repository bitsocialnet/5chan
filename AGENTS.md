# AGENTS.md

## Purpose

This file defines the always-on rules for AI agents working on 5chan.
Use this as the default policy. Load linked playbooks only when their trigger condition applies.

## Project Overview

5chan is a serverless, adminless, decentralized 4chan alternative built on the Bitsocial protocol.

## Instruction Priority

- **MUST** rules are mandatory.
- **SHOULD** rules are strong defaults unless task context requires a different choice.
- If guidance conflicts, prefer: user request > MUST > SHOULD > playbooks.

## Task Router (Read First)

| Situation | Required action |
|---|---|
| React UI logic changed (`src/components`, `src/views`, `src/hooks`, UI stores) | Follow React architecture rules below and run `yarn doctor` |
| `package.json` changed | Run `yarn install` to keep `yarn.lock` in sync |
| Translation key/value changed | Use `/Users/Tommaso/Desktop/bitsocial/5chan/docs/agent-playbooks/translations.md` |
| Bug report in a specific file/line | Start with git history scan from `/Users/Tommaso/Desktop/bitsocial/5chan/docs/agent-playbooks/bug-investigation.md` before editing |
| `CHANGELOG.md` or package version changed | Run `yarn blotter:check`; if needed add a concise release one-liner |
| UI/visual behavior changed | Verify in browser with `playwright-cli`; test desktop and mobile viewport |
| GitHub operation needed | Use `gh` CLI, not GitHub MCP |
| User asks for commit/issue phrasing | Use `/Users/Tommaso/Desktop/bitsocial/5chan/docs/agent-playbooks/commit-issue-format.md` |

## Stack

- React 19 + TypeScript
- Zustand for shared state
- React Router v6
- Vite
- plebbit-react-hooks
- i18next
- yarn
- oxlint
- oxfmt
- tsgo

## Project Structure

```text
src/
├── components/   # Reusable UI components
├── views/        # Page-level route views
├── hooks/        # Custom hooks
├── stores/       # Zustand stores
├── lib/          # Utilities/helpers
└── data/         # Static data
```

## Core MUST Rules

### Package and Dependency Rules

- Use `yarn`, never `npm`.
- Pin exact dependency versions (`package@x.y.z`), never `^` or `~`.
- Keep lockfile synchronized when dependency manifests change.

### React Architecture Rules

- Do not use `useState` for shared/global state. Use Zustand stores in `src/stores/`.
- Do not use `useEffect` for data fetching. Use `plebbit-react-hooks`.
- Do not sync derived state with effects. Compute during render.
- Avoid copy-paste logic across components. Extract custom hooks in `src/hooks/`.
- Avoid boolean flag soup for complex flows; model state clearly in Zustand.
- Use React Router for navigation; no manual history manipulation.

### Code Organization Rules

- Keep components focused; split large components.
- Follow DRY: shared UI in `src/components/`, shared logic in `src/hooks/`.
- Add comments for complex/non-obvious code; skip obvious comments.

### Bug Investigation Rules

- For bug reports tied to a specific file/line, check relevant git history before any fix.
- Minimum sequence: `git log --oneline` or `git blame` first, then scoped `git show` for relevant commits.
- Full workflow: `/Users/Tommaso/Desktop/bitsocial/5chan/docs/agent-playbooks/bug-investigation.md`.

### Verification Rules

- Never mark work complete without verification.
- After code changes, run: `yarn build`, `yarn lint`, `yarn type-check`.
- After React UI logic changes, run: `yarn doctor`.
- Treat React Doctor output as actionable guidance; prioritize `error` then `warning`.
- For UI/visual changes, verify with `playwright-cli` on desktop and mobile viewport.
- If verification fails, fix and re-run until passing.

### Tooling Constraints

- Use `gh` CLI for GitHub work (issues, PRs, actions, dependabot, projects, search).
- Do not use GitHub MCP.
- Do not use browser MCP servers (cursor-ide-browser, playwright-mcp, chrome MCP, etc.).
- Use `playwright-cli` for browser automation.
- If many MCP tools are present in context, warn user and suggest disabling unused MCPs.

### Project Maintenance Rules

- If `CHANGELOG.md` or package version changes, run `yarn blotter:check`.
- If blotter check fails for missing release coverage, add a concise one-line release entry.
- Ignore manual entries for release coverage logic.
- Use `yarn blotter` / `yarn blotter:manual` for manual dev messages.

### Security and Boundaries

- Never commit secrets or API keys.
- Test responsive behavior on mobile viewport.

## Core SHOULD Rules

- Keep context lean: delegate heavy/verbose tasks to subprocesses when available.
- For complex work, parallelize independent checks.
- When proposing or implementing meaningful code changes, include both:
  - a Conventional Commit title suggestion
  - a short GitHub issue suggestion
  Use the format playbook: `/Users/Tommaso/Desktop/bitsocial/5chan/docs/agent-playbooks/commit-issue-format.md`.
- When stuck on a bug, search the web for recent fixes/workarounds.
- After user corrections, identify root cause and apply the lesson in subsequent steps.

## Common Commands

```bash
yarn install
yarn start
yarn build
yarn test
yarn prettier
yarn electron
yarn doctor
yarn doctor:score
yarn doctor:verbose
```

## Playbooks (Load On Demand)

Use these only when relevant to the active task:

- Hooks setup and scripts: `/Users/Tommaso/Desktop/bitsocial/5chan/docs/agent-playbooks/hooks-setup.md`
- Translations workflow: `/Users/Tommaso/Desktop/bitsocial/5chan/docs/agent-playbooks/translations.md`
- Commit/issue output format: `/Users/Tommaso/Desktop/bitsocial/5chan/docs/agent-playbooks/commit-issue-format.md`
- Skills/tools setup and MCP rationale: `/Users/Tommaso/Desktop/bitsocial/5chan/docs/agent-playbooks/skills-and-tools.md`
- Bug investigation workflow: `/Users/Tommaso/Desktop/bitsocial/5chan/docs/agent-playbooks/bug-investigation.md`
