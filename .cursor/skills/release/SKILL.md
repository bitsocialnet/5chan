---
name: release
description: Automate a full 5chan release — analyze commits, update release body and blotter, bump version, generate changelog, commit, tag, and push. Use when the user says "release", "new version", "cut a release", "prepare release", or provides a version number to ship.
---

# Release

End-to-end release automation for 5chan.

## Usage

The user provides a version bump (`patch`, `minor`, `major`, or explicit `x.y.z`).
If omitted, ask which bump level they want.

## Workflow

Copy this checklist and track progress:

```
Release Progress:
- [ ] Step 1: Analyze commits
- [ ] Step 2: Write release body (longer sentence)
- [ ] Step 3: Write blotter message (concise keywords)
- [ ] Step 4: Bump version in package.json
- [ ] Step 5: Generate changelog
- [ ] Step 6: Update blotter file
- [ ] Step 7: Verify blotter
- [ ] Step 8: Commit, tag, push
```

### Step 1 — Analyze commits

```bash
git tag --sort=-creatordate | head -1
```

Then list commits since that tag:

```bash
git log --oneline <tag>..HEAD
```

If there are no new commits, stop — nothing to release.

Categorize by Conventional Commits prefix (`feat:`, `fix:`, `perf:`, `refactor:`, `chore:`, etc.).

### Step 2 — Write the release body one-liner

Edit `oneLinerDescription` in `scripts/release-body.js` (around line 105).

Rules:
- Start with "This version..." or "This release..."
- One sentence, no bullets
- Lead with the biggest features/fixes, group minor ones
- Plain language (user-facing)
- End with a period

Good examples:
- "This version adds backlinks for quoted posts, a copy user ID menu item, and several bug fixes."
- "This release adds pseudonymity mode support per-reply and fixes timezone display issues."

### Step 3 — Write the blotter message

This is a **separate, shorter** summary used for the in-app blotter banner.

Rules:
- Comma-separated key highlights, no full sentence
- Omit "This version..." prefix — the blotter script prepends `vX.Y.Z: ` automatically
- Aim for ~60–80 characters after the version prefix
- Only include changes that are interesting or exciting to users — novel features, important fixes
- Skip mundane/routine items (minor UI tweaks, footers, small layout changes, test improvements)
- Fewer strong items beat many weak items; 3–5 highlights is ideal

Good examples (the part **you** write, without the `vX.Y.Z:` prefix):
- "Board pagination, multi-provider uploads, mod queue redesign, catalog sorting"
- "Syncs board dirs from GitHub, macOS icon, reply perf"
- "Quote links, backlinks, pseudonymityMode, release artifacts"

Save this string — you will pass it to the blotter script in Step 6.

### Step 4 — Bump version

Read `package.json`, compute the new version from the bump level, and update the `"version"` field.

| Bump | Effect |
|------|--------|
| `patch` | `0.6.7` → `0.6.8` |
| `minor` | `0.6.7` → `0.7.0` |
| `major` | `0.6.7` → `1.0.0` |
| `x.y.z` | Set exactly |

### Step 5 — Generate changelog

```bash
yarn changelog
```

This regenerates `CHANGELOG.md` from conventional commits.

### Step 6 — Update blotter

Pass the **blotter message from Step 3** (not the release body):

```bash
node scripts/update-blotter.js release --message "<blotter message>"
```

### Step 7 — Verify blotter

```bash
node scripts/update-blotter.js check
```

If it fails, fix the issue and re-run.

### Step 8 — Commit, tag, push

```bash
git add -A
git commit -m "chore(release): v<version>"
git push
git tag v<version>
git push --tags
```

GitHub Actions triggers on the pushed tag to build release artifacts.

## Dry-run mode

If the user says "dry run" or "preview", execute Steps 1–7 but **skip Step 8** (git operations). Print a summary of what would be committed so the user can review.
