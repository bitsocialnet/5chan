---
name: profile-browsing
description: Measure 5chan loading, navigation, or interaction performance and investigate observed bottlenecks.
---

<!-- Generated from .agents/skills/profile-browsing/SKILL.md; run yarn ai-workflow:sync. -->

# Browsing performance

Define the affected route/interaction and the symptom or comparison to establish. Use current routes in `src/app.tsx`, hash URLs from `src/index.tsx`, and real populated content; do not assume example boards or community addresses are available.

Reuse a compatible server in this worktree. If one is needed, the task owner starts it in an owned terminal, records its process/session, and stops only that server afterward. A profiling child does not manage servers. Other tasks may have valid Vite processes.

Keep one browser active machine-wide. Use `./scripts/pw-session.sh` for Playwright; React Doctor manages its own isolated Chrome and must run in a separate, serialized pass as described in the measurement reference. Use the `playwright-cli` skill for session lifecycle and affected-flow coverage. Browser work and other heavy checks remain serialized. Profile a small flow directly; delegate a substantial independent route set to `profiler` only when useful, with a supplied URL, unique session name, criteria, and evidence to return. Wait for its browser cleanup before another browser task starts.

Run `corepack yarn doctor --scope changed --base <base> --blocking none --no-parallel` for code diagnostics when investigating React performance. Use the actual task base (`HEAD` for current uncommitted work). For runtime evidence, use browser measurements and React Doctor's `doctor:scan` command as described in the measurement reference. Treat diagnostics as leads, not proof of observed latency.

Read [measurement guidance](references/measurement.md) for browser observers, document-versus-hash timing, and this checkout's React evidence. Capture only what resolves the performance question; do not add instrumentation or new app tooling to satisfy a reporting template.

Compare the same narrow flow before/after with equivalent throttle, viewport, content, and capture settings. Report URLs, methods, observed cost, evidence paths, and unavailable metrics. Separate symptoms from inferred causes; cheap rerenders alone do not justify an optimization. Close the exact session on every exit path and leave preexisting servers/profiles untouched.
