// Deterministic ratchet on what a first visit downloads before the app renders: index.html itself
// (with its inlined startup CSS and static shell) plus the files it loads, which is the entry script
// and the preload tags written by scripts/vite-app-preload.mjs for the deferred index and app graphs,
// and the board routes' chunks it preloads on those routes: the gate covers a board's first visit.
// Disabled stylesheet links (inlined, never fetched) are skipped. Images, icons, and the manifest are
// not counted: they do not block the first paint or commit. Raw bytes are the gate because gzip
// output varies with the zlib version; gzip is reported for context.
//
// The board directory data the build syncs from bitsocialnet/lists is measured and limited apart from
// the app's code: it reaches a first visit as its own chunk (see directory-data.mjs) and as each
// board's values in the static shell's data block in index.html. The code ceilings gate the rest, so
// a code change is judged only on what it adds, and the board list growing never fails one: an
// oversized directory data only warns, unless --check-directory-data is passed.
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { ROUTE_PRELOAD_DATA_ID } from '../vite-app-preload.mjs';
import { SHELL_DATA_ID, toScriptJson } from '../vite-static-shell.mjs';
import { DIRECTORY_DATA_CHUNK_NAME } from './directory-data.mjs';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const budgetFile = path.join(path.dirname(fileURLToPath(import.meta.url)), 'startup-bytes-budget.json');
const args = process.argv.slice(2);
const update = args.includes('--update');
const checkDirectoryData = args.includes('--check-directory-data');
const buildIndex = args.indexOf('--build');
const buildDir = path.resolve(packageRoot, buildIndex === -1 ? 'build' : args[buildIndex + 1]);
if (args.includes('--help')) {
  console.log(
    'perf:startup-bytes [--build DIR] [--update] [--check-directory-data]\nFails when the app code among the startup assets referenced by DIR/index.html exceeds the checked-in ceiling.\nThe board directory data synced from bitsocialnet/lists is reported against its own limit and only warns; --check-directory-data fails on it too.\n--update lowers the ceilings and the data limit to the current sizes; it never raises them. Raise one by editing startup-bytes-budget.json in the same change, with the reason.',
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

const directoryDataChunkPattern = new RegExp(`(?:^|/)${DIRECTORY_DATA_CHUNK_NAME}-[\\w-]+\\.js$`);
const assetFiles = await readdir(path.join(buildDir, 'assets')).catch(() => []);
if (!assetFiles.some((fileName) => directoryDataChunkPattern.test(fileName))) {
  console.error(
    `No ${DIRECTORY_DATA_CHUNK_NAME} chunk in ${path.relative(packageRoot, buildDir)}/assets: the codeSplitting group in vite.config.js no longer matches the directory data, so it would count as app code.`,
  );
  process.exit(1);
}
// Each board's values in the static shell's data block (its title, winner line and the like), as
// index.html writes them. The frame templates they fill are app code.
const shellDataJson = html.match(new RegExp(`<script type="application/json" id="${SHELL_DATA_ID}">([\\s\\S]*?)</script>`))?.[1];
const boardValuesBytes = shellDataJson ? Buffer.byteLength(toScriptJson(JSON.parse(shellDataJson).boards?.codes ?? {})) : 0;
if (!shellDataJson) console.warn(`No static shell data block (#${SHELL_DATA_ID}) in index.html; no board values counted.`);

const totals = {};
const codeTotals = {};
const directoryData = {};
for (const [name, files] of [
  ['home', homeFiles],
  ['board', boardFiles],
]) {
  const sizes = [htmlSize, ...(await Promise.all(files.map(sizeOf)))];
  totals[name] = sizes.reduce((sum, { raw }) => sum + raw, 0);
  const gzip = sizes.reduce((sum, size) => sum + size.gzip, 0);
  const chunkBytes = sizes.filter(({ href }) => directoryDataChunkPattern.test(href)).reduce((sum, { raw }) => sum + raw, 0);
  directoryData[name] = { chunkBytes, boardValuesBytes, total: chunkBytes + boardValuesBytes };
  codeTotals[name] = totals[name] - directoryData[name].total;
  console.log(
    `Startup assets of a first ${name} visit, ${path.relative(packageRoot, buildDir)}/index.html: index.html + ${files.length} files, ${kb(totals[name])} raw, ${kb(gzip)} gzip`,
  );
  for (const { href, raw, gzip: fileGzip } of sizes.sort((a, b) => b.raw - a.raw).slice(0, 8))
    console.log(`  ${kb(raw).padStart(10)} raw ${kb(fileGzip).padStart(10)} gzip  ${href}`);
  console.log(
    `  of which ${directoryData[name].total} bytes are directory data (${chunkBytes} in the ${DIRECTORY_DATA_CHUNK_NAME} chunk, ${boardValuesBytes} of board values in index.html) and ${codeTotals[name]} are app code`,
  );
}
if (!routePreloads.length) console.warn('No board route preloads in index.html (scripts/vite-app-preload.mjs); both totals are the home page.');
// A first board visit downloads everything the home page does, so its directory data is the most a visit carries.
const directoryDataBytes = Math.max(directoryData.home.total, directoryData.board.total);

let budget;
try {
  budget = JSON.parse(await readFile(budgetFile, 'utf8'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
// maxRawBytes gates the app code of a first board visit (home's files plus the board routes it
// preloads), and maxHomeRawBytes the home page alone, which does not download the board routes.
// maxDirectoryDataRawBytes limits the directory data on its own.
const ceilings = [
  ['board', 'maxRawBytes'],
  ['home', 'maxHomeRawBytes'],
];
const dataKey = 'maxDirectoryDataRawBytes';
const budgetPath = path.relative(packageRoot, budgetFile);
if (update) {
  const next = { ...budget };
  for (const [name, key] of ceilings) {
    if (budget?.[key] !== undefined && codeTotals[name] >= budget[key]) console.log(`${name} ceiling unchanged at ${budget[key]} bytes (current ${codeTotals[name]}).`);
    else {
      next[key] = codeTotals[name];
      console.log(`${name} ceiling lowered to ${codeTotals[name]} bytes.`);
    }
  }
  if (budget?.[dataKey] !== undefined && directoryDataBytes >= budget[dataKey])
    console.log(`Directory data limit unchanged at ${budget[dataKey]} bytes (current ${directoryDataBytes}).`);
  else {
    next[dataKey] = directoryDataBytes;
    console.log(`Directory data limit lowered to ${directoryDataBytes} bytes.`);
  }
  await writeFile(budgetFile, `${JSON.stringify(next, null, 2)}\n`);
} else if (!budget || [...ceilings.map(([, key]) => key), dataKey].some((key) => budget[key] === undefined)) {
  console.error(`Missing ceilings in ${budgetPath}; run with --update to create them.`);
  process.exitCode = 1;
} else {
  // An optional allowance covers app code that varies with the synced directory data rather than
  // with the repository; allowanceReason says what it is.
  const allowance = budget.allowanceBytes || 0;
  const allowanceNote = allowance ? ` plus a ${allowance}-byte allowance (${budget.allowanceReason})` : '';
  for (const [name, key] of ceilings) {
    const rawBytes = codeTotals[name];
    if (rawBytes > budget[key] + allowance) {
      console.error(
        `App code in the startup assets of a first ${name} visit grew to ${rawBytes} bytes, over the ${budget[key]}-byte ceiling${allowanceNote} (+${rawBytes - budget[key]}). Load the new code after the first render (lazy import), or raise ${key} in ${budgetPath} with the reason.`,
      );
      process.exitCode = 1;
    } else {
      console.log(
        `${name}: app code within the ${budget[key]}-byte ceiling${allowanceNote}: ${rawBytes} bytes. Run with --update to lower the ceiling when this shrinks.`,
      );
    }
  }
  const growth = directoryDataBytes - budget[dataKey];
  const dataSummary = `Directory data from bitsocialnet/lists: ${directoryDataBytes} bytes on a first visit (${directoryData.board.chunkBytes} in the ${DIRECTORY_DATA_CHUNK_NAME} chunk, ${boardValuesBytes} of board values in index.html), ${growth >= 0 ? '+' : ''}${growth} since its ${budget[dataKey]}-byte limit was set`;
  if (growth > 0) {
    const consequence = checkDirectoryData
      ? 'Failing because --check-directory-data was passed.'
      : 'This does not fail the check: the build syncs the data, and it is not judged with the code.';
    (checkDirectoryData ? console.error : console.warn)(
      `${dataSummary}, over its limit. ${consequence} Raise ${dataKey} in ${budgetPath} with the reason once the growth is expected.`,
    );
    if (checkDirectoryData) process.exitCode = 1;
  } else {
    console.log(`${dataSummary}. Run with --update to lower the limit when this shrinks.`);
  }
}
