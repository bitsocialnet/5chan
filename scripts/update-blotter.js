#!/usr/bin/env node

/*
  Blotter maintenance CLI

  Path: src/data/5chan-blotter.json
  Shape: { "entries": BlotterEntry[] }
  BlotterEntry: id, kind (release|manual), timestamp (unix seconds), message;
               version required when kind=release.
  Release message format (strict): v{version}: {one-liner}

  Modes:
  - check      Validate blotter: required fields, timestamp-desc order,
               changelog coverage, release format.
  - release    Upsert release entry. Version from package.json (or --version).
               Date from CHANGELOG.md heading. One-liner from --message.
  - manual     Add manual entry. Message required, timestamp defaults to now.
  - interactive Interactive prompt for devs (yarn blotter).

  Usage:
    node scripts/update-blotter.js check
    node scripts/update-blotter.js release --message "One-liner description" [--version 0.6.6]
    node scripts/update-blotter.js manual --message "Manual dev message" [--timestamp 1739721600]
    node scripts/update-blotter.js [interactive]

  Release coverage ignores manual entries.
*/

import fs from 'fs/promises';
import { readFileSync } from 'fs';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const BLOTTER_PATH = path.join(ROOT, 'src', 'data', '5chan-blotter.json');
const CHANGELOG_PATH = path.join(ROOT, 'CHANGELOG.md');
const PACKAGE_JSON_PATH = path.join(ROOT, 'package.json');

const RELEASE_PREFIX_RE = /^v[\d.]+: .+$/;

function parseArgs(argv) {
  const out = { flags: new Set(), positional: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = i + 1 < argv.length ? argv[i + 1] : undefined;
    if (arg.startsWith('--')) {
      const key = arg;
      let value;
      if (next && !next.startsWith('--')) {
        value = next;
        i++;
      }
      out[key] = value ?? '';
    } else {
      out.positional.push(arg);
    }
  }
  return out;
}

function usage(exitCode = 1, msg) {
  if (msg) console.error(msg);
  console.error(`
Blotter maintenance CLI

  yarn blotter                  Interactive mode
  yarn blotter:check            Validate (non-mutating)
  yarn blotter:release --message "One-liner" [--version X.Y.Z]
  yarn blotter:manual --message "Message" [--timestamp unix]

Path: src/data/5chan-blotter.json
Release format: v{version}: {one-liner}
`);
  process.exit(exitCode);
}

async function loadBlotter() {
  try {
    const text = await fs.readFile(BLOTTER_PATH, 'utf8');
    const data = JSON.parse(text);
    let entries;
    if (data && typeof data.entries === 'object' && Array.isArray(data.entries)) {
      entries = data.entries;
    } else if (Array.isArray(data)) {
      entries = data;
    } else {
      throw new Error('Blotter must be { entries: BlotterEntry[] }');
    }
    return entries;
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

async function writeBlotter(entries) {
  const sorted = [...entries].sort((a, b) => b.timestamp - a.timestamp);
  const payload = { entries: sorted };
  const json = JSON.stringify(payload, null, 2) + '\n';
  await fs.mkdir(path.dirname(BLOTTER_PATH), { recursive: true });
  await fs.writeFile(BLOTTER_PATH, json, 'utf8');
}

function getPackageVersion() {
  const pkg = JSON.parse(readFileSync(PACKAGE_JSON_PATH, 'utf8'));
  return pkg.version;
}

async function getChangelogVersions() {
  const text = await fs.readFile(CHANGELOG_PATH, 'utf8');
  const re = /#+ \[([^\]]+)\].*?\((\d{4}-\d{2}-\d{2})\)/g;
  const versions = [];
  let m;
  while ((m = re.exec(text))) {
    versions.push({ version: m[1], date: m[2] });
  }
  return versions;
}

function getReleaseDateForVersion(versions, version) {
  const found = versions.find((v) => v.version === version);
  return found ? found.date : null;
}

function dateToUnix(dateStr) {
  const d = new Date(dateStr + 'T12:00:00Z');
  return Math.floor(d.getTime() / 1000);
}

function runCheck(entries) {
  const errors = [];
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (typeof e.id !== 'string' || !e.id.trim()) {
      errors.push(`Entry ${i}: missing or invalid id`);
    }
    if (e.kind !== 'release' && e.kind !== 'manual') {
      errors.push(`Entry ${i}: kind must be "release" or "manual"`);
    }
    if (typeof e.timestamp !== 'number' || typeof e.message !== 'string') {
      errors.push(`Entry ${i}: missing timestamp or message`);
    }
    if (e.kind === 'release') {
      if (typeof e.version !== 'string' || !e.version.trim()) {
        errors.push(`Entry ${i}: release requires version field`);
      } else if (!RELEASE_PREFIX_RE.test(e.message)) {
        errors.push(`Entry ${i}: release message must match "vX.Y.Z: one-liner"`);
      }
    }
    if (i > 0 && entries[i - 1].timestamp < e.timestamp) {
      errors.push(`Entry ${i}: must be ordered timestamp-desc`);
    }
  }
  return errors;
}

async function runChangelogCoverageCheck(entries) {
  const releaseEntries = entries.filter((e) => e.kind === 'release');
  const releaseVersions = new Set();
  for (const e of releaseEntries) {
    const v = e.version || (e.message && e.message.match(/^v([\d.]+):/)?.[1]);
    if (v) releaseVersions.add(v);
  }
  const changelogVersions = await getChangelogVersions();
  const missing = changelogVersions.filter((v) => !releaseVersions.has(v.version)).map((v) => v.version);
  return missing;
}

async function modeCheck() {
  const entries = await loadBlotter();
  const errors = runCheck(entries);
  if (errors.length) {
    errors.forEach((e) => console.error(`Error: ${e}`));
    process.exit(1);
  }
  const missingVersions = await runChangelogCoverageCheck(entries);
  if (missingVersions.length) {
    console.error(`Changelog versions missing release entries: ${missingVersions.join(', ')}`);
    process.exit(1);
  }
  console.log('Blotter check passed.');
}

function formatReleaseMessage(version, oneLiner) {
  const trimmed = (oneLiner || '').trim();
  if (!trimmed) throw new Error('Release message (one-liner) is required');
  return `v${version}: ${trimmed}`;
}

async function modeRelease(args) {
  const message = args['--message'];
  const versionArg = args['--version'];

  const version = versionArg || getPackageVersion();
  const changelogVersions = await getChangelogVersions();
  const releaseDate = getReleaseDateForVersion(changelogVersions, version);
  if (!releaseDate) {
    console.error(`Version ${version} not found in CHANGELOG.md headings.`);
    process.exit(1);
  }

  if (!message) {
    console.error('--message is required for release mode');
    process.exit(1);
  }

  const timestamp = dateToUnix(releaseDate);
  const fullMessage = formatReleaseMessage(version, message);
  const entries = await loadBlotter();
  const id = `release-${version}`;
  const existingIdx = entries.findIndex((e) => e.kind === 'release' && (e.version === version || e.id === id));
  const newEntry = { id, kind: 'release', timestamp, message: fullMessage, version };
  let updated;
  if (existingIdx >= 0) {
    updated = [...entries];
    updated[existingIdx] = newEntry;
  } else {
    updated = [newEntry, ...entries];
  }
  await writeBlotter(updated);
  console.log(existingIdx >= 0 ? `Updated release entry for v${version}` : `Added release entry for v${version}`);
}

async function modeManual(args) {
  const message = args['--message'];
  const tsArg = args['--timestamp'];

  if (!message || !message.trim()) {
    console.error('--message is required for manual mode');
    process.exit(1);
  }

  const timestamp = tsArg ? parseInt(tsArg, 10) : Math.floor(Date.now() / 1000);
  if (Number.isNaN(timestamp)) {
    console.error('--timestamp must be a valid Unix timestamp');
    process.exit(1);
  }

  const entries = await loadBlotter();
  const id = `manual-${timestamp}`;
  const newEntry = { id, timestamp, message: message.trim(), kind: 'manual' };
  const updated = [newEntry, ...entries];
  await writeBlotter(updated);
  console.log('Added manual entry.');
}

async function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer?.trim() ?? '');
    });
  });
}

async function modeInteractive() {
  console.log('Blotter interactive mode');
  console.log('  1) Add manual entry');
  console.log('  2) Add/update release entry');
  console.log('  3) Run check only');
  const choice = await prompt('Choice [1-3]: ');
  if (choice === '1') {
    const message = await prompt('Message: ');
    if (!message) {
      console.error('Message is required');
      process.exit(1);
    }
    await modeManual({ '--message': message });
  } else if (choice === '2') {
    const version = getPackageVersion();
    const oneLiner = await prompt(`One-liner for v${version} [auto-from package.json]: `);
    if (!oneLiner) {
      console.error('One-liner is required');
      process.exit(1);
    }
    await modeRelease({ '--message': oneLiner, '--version': version });
  } else if (choice === '3') {
    await modeCheck();
  } else {
    console.error('Invalid choice');
    process.exit(1);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const mode = args.positional[0] || 'interactive';

  if (mode === 'check') {
    await modeCheck();
  } else if (mode === 'release') {
    await modeRelease(args);
  } else if (mode === 'manual') {
    await modeManual(args);
  } else if (mode === 'interactive' || !mode) {
    await modeInteractive();
  } else {
    usage(1, `Unknown mode: ${mode}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
