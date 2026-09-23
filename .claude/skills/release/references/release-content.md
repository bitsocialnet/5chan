# Release text and blotter wording

Use `oneLinerDescription` in `scripts/release-body.js` for the release body.

Rules:
- Start with "This version..." or "This release..."
- One sentence, no bullets
- Lead with the biggest features/fixes, group minor ones
- Plain language (user-facing)
- End with a period

Good examples:
- "This version adds backlinks for quoted posts, a copy user ID menu item, and clearer reply previews."
- "This release adds pseudonymity mode support per-reply and fixes timezone display issues."

## Blotter message

This is a **separate, shorter** summary used for the in-app blotter banner. **The blotter is read by end users — non-developers — so every highlight must be understandable to someone who has never seen the code.** This rule is non-negotiable even for internal/infrastructure changes that make it into the blotter.

Format rules:
- Comma-separated key highlights, each a short plain-English phrase (not a full sentence)
- Omit "This version..." prefix — the blotter script prepends `vX.Y.Z: ` automatically
- Aim for ~45–70 characters after the version prefix
- **Only genuinely novel or noteworthy items** — things a user would find interesting or exciting
- Skip regression fixes (restoring something that previously worked), routine bug fixes, invisible security/stability work, minor z-index/modal/layout tweaks, test improvements, CI changes, and anything that isn't a new capability or a significant user-facing improvement
- If something was already a known feature and just got fixed/restored, it does not belong in the blotter
- Fewer strong items beat many weak items; 1–3 highlights is ideal
- If there are no genuinely interesting user-facing changes, do not invent filler highlights
- Lead with the most impressive item

Plain-English rules (apply always, no matter what):
- Write for a user who has never read the code. Each highlight must be self-explanatory to a non-dev reader of 5chan.
- No internal library or module names (e.g. "Pretext", "Zustand", "portless", "Vite", "oxlint"). Translate into the user-visible effect.
- No dev shorthand: avoid "perf", "deps", "refactor", "impl", "selector", "reducer", "hook", "a11y", "i18n", "DX", "CI", "CD", "lint", "typecheck".
- No codebase-only identifiers, file paths, component names, or PR numbers.
- Prefer the user-visible *outcome* over the mechanism. Example: "compact account history" (describes the code) → "performant account history" (describes what the user gets).
- Phrases must read as natural plain English. If a highlight needs a developer to explain it, rewrite it.
- Avoid broad maintenance labels like "security fixes", "bug fixes", or "stability fixes"; they are usually invisible, redundant, and dull. Only mention security or stability work when the user can perceive the outcome, and phrase it as that outcome.
- Okay to name concrete user-visible features/areas: "Board pagination", "Video auto-unmute setting", "File upload improvements", "Archive page", "Spoiler tags", "Catalog search".

Good examples (the part **you** write, without the `vX.Y.Z:` prefix):
- "Board pagination, file upload improvements, mod queue redesign, catalog sorting"
- "Video auto-unmute setting, platform info on homepage, faster board previews"
- "In-app desktop updates, opt-in thread auto-refresh, performant account history"
- "Quote references in replies, post backlinks"

Bad examples (and why):
- "Pretext feed sizing" — names an internal library; user has no idea what this is.
- "Mobile scroll perf" — "perf" is dev shorthand; say "smoother mobile scrolling".
- "Compact account history" — describes the implementation; "performant account history" describes what the user gets.
- "Refactor memoized selectors" — three dev terms in a row; rewrite or drop.
- "Security fixes" — generic maintenance label; invisible to regular users and not interesting to read.

Pass the blotter message, rather than the longer release-body sentence, to `scripts/update-blotter.js release --message`.
