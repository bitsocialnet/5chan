// Deterministic ratchet on what a first visit downloads before the app renders: index.html itself
// (with its inlined startup CSS and static shell) plus the files it loads, which is the entry script
// and the preload tags written by scripts/vite-app-preload.mjs for the deferred index and app graphs,
// and the board routes' chunks it preloads on those routes: the gate covers a board's first visit.
// Disabled stylesheet links (inlined, never fetched) are skipped. Images, icons, and the manifest are
// not counted: they do not block the first paint or commit. Raw bytes are the gate because gzip
// output varies with the zlib version; gzip is reported for context.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { ROUTE_PRELOAD_DATA_ID } from '../vite-app-preload.mjs';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const budgetFile = path.join(path.dirname(fileURLToPath(import.meta.url)), 'startup-bytes-budget.json');
const args = process.argv.slice(2);
const update = args.includes('--update');
const buildIndex = args.indexOf('--build');
const buildDir = path.resolve(packageRoot, buildIndex === -1 ? 'build' : args[buildIndex + 1]);
if (args.includes('--help')) {
  console.log(
    'perf:startup-bytes [--build DIR] [--update]\nFails when the startup assets referenced by DIR/index.html exceed the checked-in ceiling.\n--update lowers the ceiling to the current size; it never raises it. Raise it by editing startup-bytes-budget.json in the same change, with the reason.',
  );
  process.exit(0);
}

const html = await readFile(path.join(buildDir, 'index.html'), 'utf8');
const fetchedAsset = (tag) => {
  if (/^<link\b/.test(tag) && (!/\brel=["'](?:modulepreload|stylesheet|preload)["']/.test(tag) || /\sdisabled\b/.test(tag))) return undefined;
  const url = tag.match(/\b(?:src|href)=["']([^"']+\.(?:js|css))["']/)?.[1];
  return url && !/^[a-z]+:/i.test(url) ? url : undefined;
};
const routePreloads = JSON.parse(html.match(new RegExp(`<script type="application/json" id="${ROUTE_PRELOAD_DATA_ID}">([^<]*)</script>`))?.[1] ?? '[]');
const homeFiles = [...new Set([...html.matchAll(/<(?:script|link)\b[^>]*>/g)].map(([tag]) => fetchedAsset(tag)).filter(Boolean))];
const boardFiles = [...new Set([...homeFiles, ...routePreloads])];
const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;
const sizeOf = async (href) => {
  const content = await readFile(path.join(buildDir, href.replace(/^(\.\/|\/)/, '')));
  return { href, raw: content.length, gzip: gzipSync(content).length };
};
const htmlSize = { href: 'index.html', raw: Buffer.byteLength(html), gzip: gzipSync(html).length };
const totals = {};
for (const [name, files] of [
  ['home', homeFiles],
  ['board', boardFiles],
]) {
  const sizes = [htmlSize, ...(await Promise.all(files.map(sizeOf)))];
  totals[name] = sizes.reduce((sum, { raw }) => sum + raw, 0);
  const gzip = sizes.reduce((sum, size) => sum + size.gzip, 0);
  console.log(
    `Startup assets of a first ${name} visit, ${path.relative(packageRoot, buildDir)}/index.html: index.html + ${files.length} files, ${kb(totals[name])} raw, ${kb(gzip)} gzip`,
  );
  for (const { href, raw, gzip: fileGzip } of sizes.sort((a, b) => b.raw - a.raw).slice(0, 8))
    console.log(`  ${kb(raw).padStart(10)} raw ${kb(fileGzip).padStart(10)} gzip  ${href}`);
}
if (!routePreloads.length) console.warn('No board route preloads in index.html (scripts/vite-app-preload.mjs); both totals are the home page.');

let budget;
try {
  budget = JSON.parse(await readFile(budgetFile, 'utf8'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
// maxRawBytes gates a first board visit (home's files plus the board routes it preloads), and
// maxHomeRawBytes the home page alone, which does not download the board routes.
const ceilings = [
  ['board', 'maxRawBytes'],
  ['home', 'maxHomeRawBytes'],
];
if (update) {
  const next = { ...budget };
  for (const [name, key] of ceilings) {
    if (budget?.[key] !== undefined && totals[name] >= budget[key]) console.log(`${name} ceiling unchanged at ${budget[key]} bytes (current ${totals[name]}).`);
    else {
      next[key] = totals[name];
      console.log(`${name} ceiling lowered to ${totals[name]} bytes.`);
    }
  }
  await writeFile(budgetFile, `${JSON.stringify(next, null, 2)}\n`);
} else if (!budget || ceilings.some(([, key]) => budget[key] === undefined)) {
  console.error(`Missing ceilings in ${path.relative(packageRoot, budgetFile)}; run with --update to create them.`);
  process.exitCode = 1;
} else {
  // An optional allowance covers startup content the build fetches rather than the repository
  // pins; allowanceReason says what it is.
  const allowance = budget.allowanceBytes || 0;
  const allowanceNote = allowance ? ` plus a ${allowance}-byte allowance (${budget.allowanceReason})` : '';
  for (const [name, key] of ceilings) {
    const rawBytes = totals[name];
    if (rawBytes > budget[key] + allowance) {
      console.error(
        `Startup assets of a first ${name} visit grew to ${rawBytes} bytes, over the ${budget[key]}-byte ceiling${allowanceNote} (+${rawBytes - budget[key]}). Load the new code after the first render (lazy import), or raise ${key} in ${path.relative(packageRoot, budgetFile)} with the reason.`,
      );
      process.exitCode = 1;
    } else {
      console.log(`${name}: within the ${budget[key]}-byte ceiling${allowanceNote}: ${rawBytes} bytes. Run with --update to lower the ceiling when this shrinks.`);
    }
  }
}
