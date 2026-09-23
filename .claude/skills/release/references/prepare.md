# Prepare a 5chan release

Inspect the current version, applicable prior release tag, and unreleased commits. Preserve unrelated edits and use the requested version or bump; ask only when the version choice remains materially ambiguous. If no unreleased work exists, report that before generating a release.

Read [release text and blotter wording](release-content.md) when composing either message. The longer release-body sentence and short in-app blotter serve different surfaces. A preview shows their proposed text and file changes without applying them.

For authorized preparation:

- Update `oneLinerDescription` in `scripts/release-body.js` and the version in `package.json`.
- Run `corepack yarn install` to synchronize `yarn.lock`, then `corepack yarn changelog` to regenerate `CHANGELOG.md`.
- Upsert the short message in `src/data/5chan-blotter.json` through the existing script:

```bash
node scripts/update-blotter.js release --message 'USER-FACING HIGHLIGHTS'
corepack yarn blotter:check
```

Use proper shell quoting for the actual message. The script reads the version from `package.json` and release date from `CHANGELOG.md`; preserve that ordering. Manual blotter entries do not satisfy release coverage. Resolve a validation failure from its evidence, and never invent filler highlights merely to satisfy coverage.

Inspect the generated diff and follow `docs/agent-playbooks/verification.md` for final checks and required LLM context generation. Do not stage build output. Release signing/build publication is handled by `.github/workflows/release.yml`; never copy signing secrets into local instructions or logs.
