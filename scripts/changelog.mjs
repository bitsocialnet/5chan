#!/usr/bin/env node

/*
  Prepends the latest release section to CHANGELOG.md.

  conventional-changelog only generates the release since the previous tag here. Regenerating every
  release (-r 0) would overwrite hand-edited history, and its own --infile mode joins the new section
  to the old file without the blank line used between releases. Rerunning for the same version
  replaces the top section instead of adding a duplicate.
*/

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RELEASE_HEADING = /^#{1,2} \[([^\]]+)\]/m;

export function mergeChangelogSection(section, existing) {
  const newVersion = section.match(RELEASE_HEADING)?.[1];
  if (!newVersion) throw new Error('Generated changelog section has no release heading.');

  let history = existing.replace(/^\s+/, '');
  if (history.match(RELEASE_HEADING)?.[1] === newVersion) {
    const firstHeading = history.match(RELEASE_HEADING);
    const rest = history.slice(firstHeading.index + firstHeading[0].length);
    const next = rest.match(RELEASE_HEADING);
    history = next ? rest.slice(next.index) : '';
  }

  const top = section.trim();
  return { version: newVersion, content: history ? `${top}\n\n${history}` : `${top}\n` };
}

function main() {
  const changelogPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'CHANGELOG.md');
  const result = spawnSync('conventional-changelog', ['-p', 'angular'], {
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || String(result.error ?? ''));
    process.exit(result.status ?? 1);
  }

  const { version, content } = mergeChangelogSection(result.stdout, readFileSync(changelogPath, 'utf8'));
  writeFileSync(changelogPath, content);
  console.log(`Wrote the ${version} section to ${path.relative(process.cwd(), changelogPath)}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
