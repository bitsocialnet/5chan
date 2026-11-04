#!/usr/bin/env node

/*
  Syncs Android release metadata from package.json during release prep.

  F-Droid's update checker reads versionCode/versionName as literals from each tagged source tree, so
  android/app/build.gradle keeps them as literals (its Gradle guard fails the build when they drift from
  package.json). The fastlane changelog is F-Droid's "What's new" text, taken from the blotter release
  entry, so run this after `node scripts/update-blotter.js release`.
*/

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GRADLE_PATH = path.join(ROOT, 'android', 'app', 'build.gradle');
const BLOTTER_PATH = path.join(ROOT, 'src', 'data', '5chan-blotter.json');
const CHANGELOGS_DIR = path.join(ROOT, 'fastlane', 'metadata', 'android', 'en-US', 'changelogs');

const VERSION_CODE_LINE = /^(\s*)versionCode \d+$/m;
const VERSION_NAME_LINE = /^(\s*)versionName "[^"]*"$/m;

// Same formula as versionNameToCode in android/app/build.gradle.
export function versionNameToCode(versionName) {
  const parts = versionName
    .replace(/^v/, '')
    .split('-')[0]
    .split('.')
    .map((part) => (/^\d+$/.test(part) ? Number(part) : 0));
  while (parts.length < 3) parts.push(0);
  return parts[0] * 10000 + parts[1] * 100 + parts[2];
}

export function syncGradleVersion(gradle, versionName, versionCode) {
  if (!VERSION_CODE_LINE.test(gradle) || !VERSION_NAME_LINE.test(gradle)) {
    throw new Error('android/app/build.gradle has no literal `versionCode <number>` and `versionName "<name>"` lines.');
  }
  return gradle.replace(VERSION_CODE_LINE, `$1versionCode ${versionCode}`).replace(VERSION_NAME_LINE, `$1versionName "${versionName}"`);
}

export function releaseNotesFromBlotter(entries, version) {
  const entry = entries.find((e) => e.kind === 'release' && e.version === version);
  return entry ? entry.message.replace(/^v[\d.]+: /, '').trim() : null;
}

function main() {
  const version = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
  const versionCode = versionNameToCode(version);

  const gradle = readFileSync(GRADLE_PATH, 'utf8');
  const synced = syncGradleVersion(gradle, version, versionCode);
  if (synced !== gradle) writeFileSync(GRADLE_PATH, synced);
  console.log(`${path.relative(ROOT, GRADLE_PATH)}: versionName ${version}, versionCode ${versionCode}`);

  const entries = existsSync(BLOTTER_PATH) ? JSON.parse(readFileSync(BLOTTER_PATH, 'utf8')).entries : [];
  const notes = releaseNotesFromBlotter(entries, version);
  const changelogPath = path.join(CHANGELOGS_DIR, `${versionCode}.txt`);
  if (!notes) {
    console.warn(`No blotter release entry for v${version}; skipped ${path.relative(ROOT, changelogPath)}.`);
    return;
  }
  mkdirSync(CHANGELOGS_DIR, { recursive: true });
  writeFileSync(changelogPath, `${notes}\n`);
  console.log(`${path.relative(ROOT, changelogPath)}: ${notes}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
