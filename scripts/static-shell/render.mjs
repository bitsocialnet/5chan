// Renders src/static-shell.tsx for every requested frame and prints { variants, boards, storage } as JSON.
// It runs in its own process because it installs jsdom browser globals, which must not leak
// into the Vite build that invokes it (scripts/vite-static-shell.mjs).
import dgram from 'node:dgram';
import { mkdtemp, rm } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { createServer, loadConfigFromFile } from 'vite';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const plan = JSON.parse(process.argv[2] || '{}');
const variants = plan.variants ?? {};

const dom = new JSDOM('<!doctype html><html><head></head><body><div id="root"></div></body></html>', { url: 'http://localhost/#/', pretendToBeVisual: true });
for (const key of Object.getOwnPropertyNames(dom.window)) {
  if (!(key in globalThis)) globalThis[key] = dom.window[key];
}
for (const key of ['window', 'self', 'document', 'navigator', 'location', 'localStorage', 'sessionStorage']) {
  Object.defineProperty(globalThis, key, { value: key === 'window' || key === 'self' ? dom.window : dom.window[key], configurable: true, writable: true });
}
// Seasonal themes (Oct 31, Dec 24-25) change first frames, and the inline script skips the frames on
// those dates, so the frames must show every other day: on those dates the build renders 3 days earlier.
const isSeasonal = (date) => (date.getMonth() === 9 && date.getDate() === 31) || (date.getMonth() === 11 && (date.getDate() === 24 || date.getDate() === 25));
if (isSeasonal(new Date())) {
  const RealDate = Date;
  const offset = 3 * 24 * 60 * 60 * 1000;
  globalThis.Date = class extends RealDate {
    constructor(...args) {
      super(...(args.length ? args : [RealDate.now() - offset]));
    }
    static now() {
      return RealDate.now() - offset;
    }
  };
}
// React's first commit in the browser happens before bitsocial-react-hooks has loaded or generated an
// account. The library skips its import-time account initialization when this flag is set, so the
// shell keeps that empty state instead of baking a build-time account into index.html.
dom.window.BITSOCIAL_REACT_HOOKS_ACCOUNTS_STORE_INITIALIZED_ONCE = true;

// App modules log on import (notification setup, deprecation notices); only the JSON result belongs on stdout.
const write = process.stdout.write.bind(process.stdout);
console.log = console.info = console.warn = console.debug = () => {};
process.on('unhandledRejection', () => {
  // Storage-backed stores start async initialization on import; jsdom has no IndexedDB and the render does not need it.
});

// The browser build aliases Node built-ins to polyfills; under Node the built-ins work natively.
const { config } = await loadConfigFromFile({ command: 'serve', mode: 'production' }, path.join(packageRoot, 'vite.config.js'));
const nodeBuiltins = new Set(['stream', 'crypto', 'buffer', 'events', 'process', 'util/', 'util', 'assert', 'node-fetch']);
const isAppAlias = (find) => !(typeof find === 'string' && (find.startsWith('node:') || nodeBuiltins.has(find)));
// The build runs several renders at once, and a dev server in the same checkout keeps its optimized
// dependencies in node_modules/.vite, so each render keeps Vite's cache, and the peer client's .pkc
// storage (created in the working directory), in a directory of its own.
const cacheDir = await mkdtemp(path.join(os.tmpdir(), 'fivechan-static-shell-'));
const server = await createServer({
  configFile: false,
  root: packageRoot,
  cacheDir,
  mode: 'production',
  plugins: [(await import('@vitejs/plugin-react')).default()],
  resolve: { alias: Object.fromEntries(Object.entries(config.resolve.alias).filter(([find]) => isAppAlias(find))) },
  define: config.define,
  css: config.css,
  server: { middlewareMode: true, hmr: false, watch: null, ws: false },
  appType: 'custom',
  logLevel: 'error',
  optimizeDeps: { noDiscovery: true, include: [] },
});
// Frames must show what a first visit renders before any peer or network data arrives, and one
// render must not change the next. Once the app loads, outgoing connections are left pending forever.
process.chdir(cacheDir);
let blockedConnections = 0;
net.Socket.prototype.connect = function () {
  blockedConnections += 1;
  return this;
};
dgram.Socket.prototype.send = () => {};
try {
  const { renderStaticShell } = await server.ssrLoadModule('/src/static-shell.tsx');
  const rendered = {};
  for (const [name, variant] of Object.entries(variants)) rendered[name] = (await renderStaticShell(variant)).html;
  // `boards: { widths: { name: width }, banner }` renders every directory board's index page at each
  // width; `addresses: true` renders each candidate board address. Both record the theme category
  // React's first commit gives the board, to check against getBoardThemeCategories. A board's peer work
  // from one render would leak into the next render of the same board, so the build renders each width
  // in its own process.
  let boards;
  if (plan.boards || plan.addresses) {
    const { getBoardThemeCategories } = await server.ssrLoadModule('/src/lib/utils/board-theme-categories.ts');
    const { DEFAULT_THEMES } = await server.ssrLoadModule('/src/constants/themes.ts');
    const { MOBILE_BREAKPOINT_WIDTH } = await server.ssrLoadModule('/src/hooks/use-window-width.ts');
    const { BANNERS } = await server.ssrLoadModule('/src/generated/asset-manifest.ts');
    const categoryOf = (bodyClass) => Object.keys(DEFAULT_THEMES).find((category) => DEFAULT_THEMES[category] === bodyClass) ?? null;
    const expected = getBoardThemeCategories();
    boards = { banners: BANNERS, defaultThemes: DEFAULT_THEMES, mobileBreakpointWidth: MOBILE_BREAKPOINT_WIDTH, expected, codes: {}, addresses: {} };
    if (plan.boards) {
      for (const code of Object.keys(expected.codes)) {
        const frames = {};
        let category;
        for (const [name, width] of Object.entries(plan.boards.widths)) {
          const { html, bodyClass, selects } = await renderStaticShell({ hash: `#/${code}`, width, banner: plan.boards.banner });
          frames[name] = { html, bodyClass, selects };
          category ??= categoryOf(bodyClass);
        }
        boards.codes[code] = { category, frames };
      }
    }
    if (plan.addresses) {
      for (const address of Object.keys(expected.addresses)) boards.addresses[address] = categoryOf((await renderStaticShell({ hash: `#/${address}` })).bodyClass);
    }
  }
  // Stores that persist while hydrating have now saved their defaults, as they do on a first visit.
  const storage = {};
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    storage[key] = localStorage.getItem(key);
  }
  if (process.env.STATIC_SHELL_DEBUG) process.stderr.write(`static shell: ${blockedConnections} connections blocked\n`);
  // A large result outlives a synchronous exit on a pipe, so exit once it is flushed.
  await new Promise((resolve) => write(JSON.stringify({ variants: rendered, boards, storage }), resolve));
} finally {
  await server.close();
  // Windows can neither remove the working directory nor files the peer client still holds open.
  // The directory is in the OS temp directory, so a failed cleanup must not fail the render.
  process.chdir(packageRoot);
  await rm(cacheDir, { recursive: true, force: true, maxRetries: 3 }).catch(() => {});
}
process.exit(0);
