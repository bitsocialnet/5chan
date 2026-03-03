#!/usr/bin/env node

/*
  Release automation script

  Automates: version bump → changelog → blotter → commit → push → tag → push tags.
  The GitHub Actions release workflow triggers on the pushed tag.

  Usage:
    yarn release patch --message "Short blotter one-liner"
    yarn release minor --message "Short blotter one-liner"
    yarn release major --message "Short blotter one-liner"
    yarn release 0.7.0 --message "Short blotter one-liner"

  Flags:
    --message, -m   Blotter one-liner (required). Becomes "vX.Y.Z: <message>" in blotter.
    --dry-run       Run everything except git commit/push/tag. Useful for preview.

  Prerequisites:
    - Update oneLinerDescription in scripts/release-body.js before running
      (manually or via the release-description agent skill).
    - Working tree should be clean (uncommitted changes will be included in the release commit).
*/

import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PACKAGE_PATH = path.join(ROOT, 'package.json');

function parseArgs(argv) {
  const result = { positional: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--message' || arg === '-m') {
      result.message = argv[++i];
    } else if (arg === '--dry-run') {
      result.dryRun = true;
    } else if (!arg.startsWith('-')) {
      result.positional.push(arg);
    }
  }
  return result;
}

function bumpVersion(current, bump) {
  const parts = current.split('.').map(Number);
  if (bump === 'patch') {
    parts[2]++;
  } else if (bump === 'minor') {
    parts[1]++;
    parts[2] = 0;
  } else if (bump === 'major') {
    parts[0]++;
    parts[1] = 0;
    parts[2] = 0;
  } else if (/^\d+\.\d+\.\d+$/.test(bump)) {
    return bump;
  } else {
    console.error(`Invalid version: ${bump}. Use patch, minor, major, or x.y.z`);
    process.exit(1);
  }
  return parts.join('.');
}

function run(cmd) {
  console.log(`  $ ${cmd}`);
  execSync(cmd, { cwd: ROOT, stdio: 'inherit' });
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const bump = args.positional[0];

  if (!bump) {
    console.error('Usage: yarn release <patch|minor|major|x.y.z> --message "Blotter one-liner"');
    process.exit(1);
  }
  if (!args.message) {
    console.error('--message (-m) is required. Provide a short blotter one-liner.');
    process.exit(1);
  }

  const pkg = JSON.parse(readFileSync(PACKAGE_PATH, 'utf8'));
  const oldVersion = pkg.version;
  const newVersion = bumpVersion(oldVersion, bump);

  console.log(`\n  Release: ${oldVersion} -> ${newVersion}\n`);

  // 1. Bump version in package.json
  pkg.version = newVersion;
  writeFileSync(PACKAGE_PATH, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
  console.log(`  [1/6] Bumped package.json to ${newVersion}`);

  // 2. Generate changelog
  run('yarn changelog');
  console.log(`  [2/6] Generated CHANGELOG.md`);

  // 3. Update blotter
  const escapedMessage = args.message.replace(/"/g, '\\"');
  run(`node scripts/update-blotter.js release --message "${escapedMessage}"`);
  console.log(`  [3/6] Added blotter entry`);

  // 4. Verify blotter
  run('node scripts/update-blotter.js check');
  console.log(`  [4/6] Blotter check passed`);

  if (args.dryRun) {
    console.log('\n  --dry-run: skipping git operations. Review changes, then run without --dry-run.\n');
    return;
  }

  // 5. Commit
  run('git add -A');
  run(`git commit -m "chore(release): v${newVersion}"`);
  console.log(`  [5/6] Committed`);

  // 6. Push, tag, push tags
  run('git push');
  run(`git tag v${newVersion}`);
  run('git push --tags');
  console.log(`  [6/6] Pushed and tagged v${newVersion}`);

  console.log(`\n  Release v${newVersion} complete. GitHub Actions will build artifacts.\n`);
}

main();
