// Makes index.html paint what React's first commit will show, before the startup JavaScript has
// downloaded (several seconds on a slow phone).
//
// Theme: an inline script at the top of <body> gives it the theme class useTheme would apply on the
// first commit, from the route, the saved themes and each board's SFW/NSFW category. The dev server
// injects it too, with links to the startup stylesheets that Vite otherwise injects from JavaScript.
//
// Frames (build only): scripts/static-shell/render.mjs renders the real App (src/static-shell.tsx) in
// jsdom for the home page and for every directory board's index page at desktop and mobile width. A
// second inline script inserts the matching frame before first paint, and React replaces it on its
// first commit. It only inserts one when that commit will render the same frame: the web runtime
// (Home renders Electron and Android variants), an English UI, no seasonal theme, and no preference
// below saved with a value other than the one the app saves on its own. Everyone else sees exactly
// what they saw before. A new saved preference that changes one of these first frames belongs in
// HOME_PREFERENCE_KEYS or BOARD_PREFERENCE_KEYS.
//
// Both inline scripts' hashes must be listed in vercel.json's script-src (verified at build time). They
// read their data from JSON blocks, which browsers do not execute, so data changes keep the hashes.
import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

export const STATIC_SHELL_ATTRIBUTE = 'data-static-shell';
// The board header renders this in place of the banner, which the script picks when it inserts a
// frame and hands to React through window.__FIVECHAN_SHELL_BANNER__ (src/lib/static-shell-banner.ts).
export const BANNER_PLACEHOLDER = '__FIVECHAN_SHELL_BANNER__';
const THEME_DATA_ID = 'fivechan-theme-data';
const SHELL_DATA_ID = 'static-shell-data';
const BOARD_WIDTHS = { desktop: 1024, mobile: 375 };

const HOME_PREFERENCE_KEYS = [
  'homepage-introduction',
  '5chan-homepage-stats-scope',
  '5chan-boards-filter',
  '5chan-boards-use-catalog',
  'showWorksafeContentOnly',
  'showNsfwContentOnly',
  '5chan-frames',
];

const BOARD_PREFERENCE_KEYS = [
  'feed-view-settings-store',
  'blotter-visibility',
  '5chan-frames',
  '5chan-boardsbar-directories-visible',
  '5chan-topbar-directories-visible',
  '5chan-boardsbar-subscriptions-visible',
  '5chan-topbar-subscriptions-visible',
];

// Values a visitor can have saved without changing the preference, besides what the build's render
// saves. zustand 4's persist middleware saved these stores with their defaults while hydrating on every
// visit; zustand 5 saves them only when they change, so visitors from before the upgrade still carry
// these values, which render the same first frames.
const PREVIOUSLY_SAVED_DEFAULTS = {
  'homepage-introduction': ['{"state":{"showIntroduction":true},"version":0}'],
  'feed-view-settings-store': ['{"state":{"enableInfiniteScroll":false},"version":0}'],
  'blotter-visibility': ['{"state":{"isHidden":false},"version":0}'],
};

// Mirrors useTheme on React's first commit: the home page and rules are yotsuba, an enabled seasonal
// theme wins elsewhere, multiboard views use the NSFW theme, and a board uses the theme of its category
// in the bundled directory (live community data can only change it after the first commit).
const THEME_SCRIPT = `(function () {
  try {
    var read = function (key) {
      try {
        return JSON.parse(localStorage.getItem(key));
      } catch (error) {
        return null;
      }
    };
    var data = JSON.parse(document.getElementById('${THEME_DATA_ID}').textContent);
    // React Router's pathname: the hash route up to its query or a nested fragment. index.tsx first
    // turns a legacy %23 settings or catalog-search fragment into a query (canonicalizeNestedHashRoute).
    var route = location.hash.replace(/^#/, '').split('#')[0];
    var legacy = /^([^?]*?)%23(.*)$/i.exec(route);
    var path = (legacy && ((/\\/settings$/.test(legacy[1]) && /^[a-z0-9-]+-settings$/i.test(legacy[2])) || (/\\/catalog(\\/settings)?$/.test(legacy[1]) && /(^|&)s(=|&|$)/.test(legacy[2]))) ? legacy[1] : route.split('?')[0]) || '/';
    var theme = 'yotsuba';
    if (path !== '/' && path.indexOf('/rules') !== 0) {
      var saved = read('5chan-themes') || {};
      var themeFor = function (category) {
        return typeof saved[category] === 'string' && saved[category] ? saved[category] : data.defaults[category];
      };
      var today = new Date();
      var special = today.getMonth() === 11 && (today.getDate() === 24 || today.getDate() === 25) ? 'tomorrow' : today.getMonth() === 9 && today.getDate() === 31 ? 'spooky' : null;
      var specialState = special && read('Special-theme-storage');
      var searchPath = path.replace(/\\/+$/, '').replace(/\\/settings$/, '');
      var segments = path.split('/');
      var segment = segments[1];
      var community = null;
      if (specialState && specialState.state && specialState.state.isEnabled) theme = special;
      else if (path.indexOf('/all') === 0 || /^\\/subs(\\/catalog)?(\\/settings)?$/.test(path) || path === '/mod' || path.indexOf('/mod/') === 0 || /^\\/search(\\/catalog|\\/directory)?$/.test(searchPath)) theme = themeFor('nsfw');
      else {
        // Only these exact paths are static pages; React Router matches any other path, like
        // /faq/2, as /:boardIdentifier/:pageNumber. Other /subs/ and /search/ paths redirect.
        var staticPage = ['/faq', '/pass', '/blotter', '/settings/account-data', '/directory', '/directory/settings', '/not-allowed', '/not-found'].indexOf(path.replace(/\\/+$/, '')) !== -1;
        if (segment === 'pending' && segments[2]) {
          var routeState = history.state && history.state.usr;
          community = routeState && routeState.pendingPost && routeState.pendingPost.communityAddress;
        } else if (!staticPage && segment !== 'subs' && segment !== 'search') {
          community = segment && decodeURIComponent(segment);
        }
        if (typeof community === 'string' && community) theme = themeFor(data.nsfw.indexOf(community) === -1 ? 'sfw' : 'nsfw');
      }
    }
    // This runs in the document head: the class goes on the body element as the parser inserts it,
    // in the same task, so no frame renders without it.
    var apply = function () {
      if (!document.body) return false;
      document.body.classList.add(theme);
      return true;
    };
    if (!apply()) {
      var observer = new MutationObserver(function () {
        if (apply()) observer.disconnect();
      });
      observer.observe(document.documentElement, { childList: true });
    }
  } catch (error) {
    // The app applies the theme on its first commit.
  }
})();`;

const SHELL_SCRIPT = `(function () {
  try {
    // Electron's preload and Capacitor's Android bridge are both in place before page scripts run.
    if (window.isElectron || (window.electronApi && window.electronApi.isElectron) || window.androidBridge) return;
    var language = localStorage.getItem('5chan-interface-language');
    if (language && !/^en(-|$)/i.test(language)) return;
    var data = JSON.parse(document.getElementById('${SHELL_DATA_ID}').textContent);
    // Each key maps to the values it can hold without the visitor changing it; no saved value always matches.
    var unchanged = function (savedDefaults) {
      for (var key in savedDefaults) {
        var value = localStorage.getItem(key);
        if (value !== null && savedDefaults[key].indexOf(value) === -1) return false;
      }
      return true;
    };
    var insert = function (root) {
      try {
        if (root.firstChild) return;
        var hash = location.hash;
        if (!hash || hash === '#' || hash === '#/') {
          var template = document.getElementById('static-shell-home');
          if (!template || !unchanged(data.home)) return;
          root.appendChild(template.content.cloneNode(true));
        } else {
          var boards = data.boards;
          var match = /^#\\/([^/?#]+)$/.exec(hash);
          var code = match && match[1];
          var values = code && Object.prototype.hasOwnProperty.call(boards.codes, code) && boards.codes[code];
          var today = new Date();
          var seasonal = (today.getMonth() === 11 && (today.getDate() === 24 || today.getDate() === 25)) || (today.getMonth() === 9 && today.getDate() === 31);
          // The theme script, which runs first, set the theme React's first commit applies.
          var theme = document.body.className;
          if (!values || seasonal || !theme || !unchanged(boards.preferences)) return;
          var frame = boards.frames[window.innerWidth < boards.mobileBreakpointWidth ? 'mobile' : 'desktop'];
          var html = frame.segments[0];
          for (var index = 0; index < frame.slots.length; index += 1) {
            var slot = frame.slots[index];
            html += (typeof slot === 'number' ? values[slot] : slot.split('\\u0000').join(code)) + frame.segments[index + 1];
          }
          var banner = boards.banners[Math.floor(Math.random() * boards.banners.length)];
          root.innerHTML = html.split(boards.bannerPlaceholder).join(banner);
          window.__FIVECHAN_SHELL_BANNER__ = banner;
          // React sets a select element's value as a property, not markup.
          var selects = root.getElementsByTagName('select');
          for (var selectIndex = 0; selectIndex < frame.selects.length; selectIndex += 1) selects[selectIndex].value = frame.selects[selectIndex] === 'theme' ? theme : code;
        }
        root.firstElementChild.setAttribute('${STATIC_SHELL_ATTRIBUTE}', '');
      } catch (error) {
        // Without the shell the page loads exactly as it did before.
        root.textContent = '';
      }
    };
    // This runs in the document head: the frame goes into #root as the parser inserts it, before any
    // frame renders.
    var root = document.getElementById('root');
    if (root) insert(root);
    else {
      var observer = new MutationObserver(function () {
        var element = document.getElementById('root');
        if (!element) return;
        observer.disconnect();
        insert(element);
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
    }
  } catch (error) {
    // Without the shell the page loads exactly as it did before.
  }
})();`;

// Keeps JSON inside <script> from ending the element early: the parser only looks for `</` and `<!--`.
const toScriptJson = (value) => JSON.stringify(value).replaceAll('</', '<\\/').replaceAll('<!--', '<\\u0021--');

// Vite injects stylesheets from JavaScript in dev, after first paint; linking the startup ones as well
// lets the theme class paint. The injected copies of the same rules follow and win.
const DEV_STYLESHEETS = '<link rel="stylesheet" href="/src/index.css"><link rel="stylesheet" href="/src/themes.css">';

// Both inline scripts run at the end of <head>, the theme script first: the frame script reads the
// class it sets. Neither depends on the parser reaching a later point of <body> before a frame renders.
export function injectThemeScript(html, categories, defaultThemes) {
  if (!html.includes('</head>')) throw new Error('static shell: index.html has no </head>');
  const nsfw = [...Object.entries(categories.codes), ...Object.entries(categories.addresses)].filter(([, category]) => category === 'nsfw').map(([identifier]) => identifier);
  const data = toScriptJson({ defaults: defaultThemes, nsfw });
  return html.replace('</head>', () => `<script type="application/json" id="${THEME_DATA_ID}">${data}</script><script>${THEME_SCRIPT}</script></head>`);
}

// Relative url() references in a stylesheet resolve against its own directory; once inlined they
// resolve against the document, so rewrite them to the same files.
const rebaseCssUrls = (css, stylesheetDirectory) =>
  css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (match, quote, url) =>
    /^(?:[a-z]+:|\/|#)/i.test(url) ? match : `url(${quote}${path.posix.normalize(path.posix.join(stylesheetDirectory, url))}${quote})`,
  );

// The shell needs its styles for the first paint. Fetching the startup stylesheets would make that
// paint wait for them behind the startup JavaScript, so their rules are inlined in the same order.
// Each keeps a disabled <link> with its URL: disabled stylesheets are not fetched, and Vite's runtime
// helper skips inserting a stylesheet that is already linked, so the file is never loaded twice.
export function inlineStartupStylesheets(html, preloadAttribute, base, readAsset) {
  return html.replace(new RegExp(`<link\\b[^>]*\\s${preloadAttribute}\\b[^>]*>`, 'g'), (tag) => {
    if (!/\brel="preload" as="style"/.test(tag)) return tag;
    const href = tag.match(/\bhref="([^"]+)"/)?.[1];
    if (!href?.startsWith(base)) throw new Error(`static shell: unexpected stylesheet URL ${href}`);
    const fileName = href.slice(base.length);
    const css = rebaseCssUrls(readAsset(fileName), path.posix.dirname(fileName));
    if (css.includes('</style')) throw new Error(`static shell: ${fileName} cannot be inlined`);
    return `<style>${css}</style>${tag.replace(/\brel="preload" as="style"/, 'rel="stylesheet"').replace(/>$/, ' disabled>')}`;
  });
}

// Splits markup into tag delimiters, quotes and the text between them, so each attribute value and
// text node is one token.
const tokenize = (html) => html.match(/[<>"]|[^<>"]+/g) ?? [];
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// A value that only differs between boards by the board code, alone or as a path segment like
// #/biz/catalog, is kept once with the code replaced by \u0000.
const codePattern = (value, code) => (value === code ? '\u0000' : value.replace(new RegExp(`(?<=/)${escapeRegExp(code)}(?=/|$)`, 'g'), '\u0000'));

// The same assembly as the inline script.
export const assembleBoardFrame = (frame, code, values) =>
  frame.slots.reduce((html, slot, index) => html + (typeof slot === 'number' ? values[slot] : slot.split('\u0000').join(code)) + frame.segments[index + 1], frame.segments[0]);

// `renders` maps each board code to its rendered frames by width name ({ html, bodyClass, selects }).
// Boards share one template per width: tokens that differ between boards become slots, filled from a
// shared code pattern or from the board's own values. A board whose markup has another shape (the
// flash board renders a table) or whose selects hold other values keeps no frame.
export function buildBoardFrames(renders) {
  const widths = Object.keys(Object.values(renders)[0]?.frames ?? {});
  const tokens = Object.fromEntries(Object.entries(renders).map(([code, board]) => [code, Object.fromEntries(widths.map((width) => [width, tokenize(board.frames[width].html)]))]));
  const selectKind = (value, frame, code) => (value === frame.bodyClass ? 'theme' : value === code ? 'code' : null);
  let codes = Object.keys(renders);
  const selects = {};
  for (const width of widths) {
    const lengths = new Map();
    for (const code of codes) lengths.set(tokens[code][width].length, (lengths.get(tokens[code][width].length) ?? 0) + 1);
    const commonLength = [...lengths].sort((a, b) => b[1] - a[1])[0]?.[0];
    codes = codes.filter((code) => tokens[code][width].length === commonLength);
    const first = codes[0] && renders[codes[0]].frames[width];
    selects[width] = first ? first.selects.map((value) => selectKind(value, first, codes[0])) : [];
    codes = codes.filter((code) => {
      const frame = renders[code].frames[width];
      return frame.selects.length === selects[width].length && frame.selects.every((value, index) => selects[width][index] && selectKind(value, frame, code) === selects[width][index]);
    });
  }

  const values = Object.fromEntries(codes.map((code) => [code, []]));
  const groups = new Map();
  const frames = {};
  for (const width of widths) {
    const segments = [''];
    const slots = [];
    const base = codes.length ? tokens[codes[0]][width] : [];
    for (let index = 0; index < base.length; index += 1) {
      const column = codes.map((code) => tokens[code][width][index]);
      if (column.every((token) => token === base[index])) {
        segments[segments.length - 1] += base[index];
        continue;
      }
      const patterns = codes.map((code, row) => codePattern(column[row], code));
      if (patterns.every((pattern) => pattern === patterns[0])) slots.push(patterns[0]);
      else {
        const key = JSON.stringify(column);
        if (!groups.has(key)) {
          groups.set(key, groups.size);
          codes.forEach((code, row) => values[code].push(column[row]));
        }
        slots.push(groups.get(key));
      }
      segments.push('');
    }
    frames[width] = { segments, slots, selects: selects[width] };
  }
  for (const code of codes) {
    for (const width of widths) {
      if (assembleBoardFrame(frames[width], code, values[code]) !== renders[code].frames[width].html) throw new Error(`static shell: the ${width} template does not rebuild /${code}/`);
    }
  }
  return { frames, codes: values, excluded: Object.keys(renders).filter((code) => !(code in values)) };
}

// `renders.storage` is what localStorage held after the build rendered the shells.
export function injectStaticShell(html, { home, boards, storage = {} }) {
  if (!html.includes('<div id="root"></div>')) throw new Error('static shell: index.html has no empty <div id="root"></div>');
  const defaultsOf = (keys) =>
    Object.fromEntries(keys.map((key) => [key, [...new Set([storage[key], ...(PREVIOUSLY_SAVED_DEFAULTS[key] ?? [])].filter((value) => typeof value === 'string'))]]));
  const data = toScriptJson({ home: defaultsOf(HOME_PREFERENCE_KEYS), boards: { ...boards, preferences: defaultsOf(BOARD_PREFERENCE_KEYS) } });
  if (!html.includes(`id="${THEME_DATA_ID}"`)) throw new Error('static shell: inject the theme script first; the frame script reads its class');
  // A replacer function keeps `$` sequences in the rendered markup literal.
  return html.replace(
    '</head>',
    () => `<template id="static-shell-home">${home}</template><script type="application/json" id="${SHELL_DATA_ID}">${data}</script><script>${SHELL_SCRIPT}</script></head>`,
  );
}

const execFileAsync = promisify(execFile);

// Every theme category the renders observed must match getBoardThemeCategories, which the theme
// script and the dev server use.
const verifyThemeCategories = (expected, observed) => {
  const mismatches = Object.entries(observed)
    .filter(([identifier, category]) => category !== expected[identifier])
    .map(([identifier, category]) => `${identifier} renders ${category ?? 'another theme'}, expected ${expected[identifier]}`);
  if (mismatches.length) throw new Error(`static shell: getBoardThemeCategories disagrees with useTheme: ${mismatches.join('; ')}`);
};

export function staticShellPlugin({ preloadAttribute }) {
  const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  let base = '/';
  let command;
  let devServer;
  const render = async (plan) => {
    try {
      const { stdout } = await execFileAsync(process.execPath, [path.join(packageRoot, 'scripts/static-shell/render.mjs'), JSON.stringify(plan)], {
        cwd: packageRoot,
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
      });
      return JSON.parse(stdout);
    } catch (error) {
      // Vite reports a later plugin's error (the PWA build's missing index.html) instead of this one.
      process.stderr.write(`static shell: render ${JSON.stringify(plan).slice(0, 120)} failed: ${error.stack}\n${String(error.stderr ?? '').slice(-4000)}\n`);
      throw error;
    }
  };
  return {
    name: 'fivechan-static-shell',
    // After vite:build-html has emitted index.html with every plugin's tags.
    enforce: 'post',
    configResolved(config) {
      base = config.base;
      command = config.command;
    },
    configureServer(server) {
      devServer = server;
    },
    async transformIndexHtml(html) {
      if (command !== 'serve' || !devServer) return html;
      try {
        const { getBoardThemeCategories } = await devServer.ssrLoadModule('/src/lib/utils/board-theme-categories.ts');
        const { DEFAULT_THEMES } = await devServer.ssrLoadModule('/src/constants/themes.ts');
        return injectThemeScript(html.replace('</head>', () => `${DEV_STYLESHEETS}</head>`), getBoardThemeCategories(), DEFAULT_THEMES);
      } catch (error) {
        // The app still applies the theme on its first commit.
        devServer.config.logger.warn(`static shell: dev theme script skipped: ${error.message}`);
        return html;
      }
    },
    async generateBundle(_, bundle) {
      const index = bundle['index.html'];
      if (!index || index.type !== 'asset') return;
      // A board's peer work from one render leaks into the next render of the same board, so each
      // width renders in its own process.
      const [homeRender, ...widthRenders] = await Promise.all([
        render({ variants: { home: {} }, addresses: true }),
        ...Object.entries(BOARD_WIDTHS).map(([name, width]) => render({ boards: { widths: { [name]: width }, banner: BANNER_PLACEHOLDER } })),
      ]);
      const { expected, banners, defaultThemes, mobileBreakpointWidth } = homeRender.boards;
      const codeRenders = {};
      for (const { boards } of widthRenders) {
        verifyThemeCategories(expected.codes, Object.fromEntries(Object.entries(boards.codes).map(([code, board]) => [code, board.category])));
        for (const [code, board] of Object.entries(boards.codes)) codeRenders[code] = { frames: { ...codeRenders[code]?.frames, ...board.frames } };
      }
      verifyThemeCategories(expected.addresses, homeRender.boards.addresses);
      const { frames, codes, excluded } = buildBoardFrames(codeRenders);
      if (!Object.keys(codes).length) throw new Error('static shell: no directory board matches the shared board template');
      // Boards whose first frame has another shape load without a frame; a new one here is worth a look.
      if (excluded.length) this.warn(`static shell: no board frame for ${excluded.map((code) => `/${code}/`).join(', ')}`);
      const readAsset = (fileName) => {
        const asset = bundle[fileName];
        if (!asset || asset.type !== 'asset') throw new Error(`static shell: ${fileName} is not in the bundle`);
        return String(asset.source);
      };
      const boards = { mobileBreakpointWidth, banners, bannerPlaceholder: BANNER_PLACEHOLDER, frames, codes };
      const html = injectThemeScript(inlineStartupStylesheets(String(index.source), preloadAttribute, base, readAsset), expected, defaultThemes);
      index.source = injectStaticShell(html, { home: homeRender.variants.home, boards, storage: homeRender.storage });
    },
  };
}
