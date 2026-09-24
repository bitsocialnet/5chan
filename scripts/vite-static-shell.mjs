// Puts a static copy of the home page's first frame into build/index.html so a first visit paints
// the page while the startup JavaScript is still downloading (several seconds on a slow phone).
//
// scripts/static-shell/render.mjs renders the real App (src/static-shell.tsx) in jsdom. The result
// goes into a <template>; a small inline script inserts it before first paint, and React replaces it
// on its first commit. The script only inserts it when that commit will render the same frame: the
// web runtime (Home renders Electron and Android variants), the home route (always the yotsuba theme,
// no viewport-specific markup), an English UI, and none of the saved home preferences below. Everyone
// else sees exactly what they saw before. A new saved preference that changes the home page's first
// frame belongs in HOME_PREFERENCE_KEYS.
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const STATIC_SHELL_ATTRIBUTE = 'data-static-shell';

const HOME_PREFERENCE_KEYS = [
  'homepage-introduction',
  '5chan-homepage-stats-scope',
  '5chan-boards-filter',
  '5chan-boards-use-catalog',
  'showWorksafeContentOnly',
  'showNsfwContentOnly',
  '5chan-frames',
];

// The inline script's hash must be listed in vercel.json's script-src (verified at build time).
const insertShellScript = `(function () {
  try {
    // Electron's preload and Capacitor's Android bridge are both in place before page scripts run.
    if (window.isElectron || (window.electronApi && window.electronApi.isElectron) || window.androidBridge) return;
    if (location.hash && location.hash !== '#' && location.hash !== '#/') return;
    var language = localStorage.getItem('5chan-interface-language');
    if (language && !/^en(-|$)/i.test(language)) return;
    var keys = ${JSON.stringify(HOME_PREFERENCE_KEYS)};
    for (var i = 0; i < keys.length; i++) if (localStorage.getItem(keys[i]) !== null) return;
    var root = document.getElementById('root');
    var template = document.getElementById('static-shell-home');
    if (!root || !template || root.firstChild) return;
    root.appendChild(template.content.cloneNode(true));
    root.firstElementChild.setAttribute('${STATIC_SHELL_ATTRIBUTE}', '');
    document.body.classList.add('yotsuba');
  } catch (error) {
    // Without the shell the page loads exactly as it did before.
  }
})();`;

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

export function injectStaticShell(html, variants) {
  if (!html.includes('<div id="root"></div>')) throw new Error('static shell: index.html has no empty <div id="root"></div>');
  const templates = Object.entries(variants)
    .map(([name, markup]) => `<template id="static-shell-${name}">${markup}</template>`)
    .join('');
  // A replacer function keeps `$` sequences in the rendered markup literal.
  return html.replace('<div id="root"></div>', () => `<div id="root"></div>${templates}<script>${insertShellScript}</script>`);
}

export function staticShellPlugin({ preloadAttribute }) {
  const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  let base = '/';
  return {
    name: 'fivechan-static-shell',
    apply: 'build',
    // After vite:build-html has emitted index.html with every plugin's tags.
    enforce: 'post',
    configResolved(config) {
      base = config.base;
    },
    generateBundle(_, bundle) {
      const index = bundle['index.html'];
      if (!index || index.type !== 'asset') return;
      const output = execFileSync(process.execPath, [path.join(packageRoot, 'scripts/static-shell/render.mjs'), JSON.stringify({ home: {} })], {
        cwd: packageRoot,
        encoding: 'utf8',
        maxBuffer: 16 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'inherit'],
      });
      const { variants } = JSON.parse(output);
      const readAsset = (fileName) => {
        const asset = bundle[fileName];
        if (!asset || asset.type !== 'asset') throw new Error(`static shell: ${fileName} is not in the bundle`);
        return String(asset.source);
      };
      index.source = injectStaticShell(inlineStartupStylesheets(String(index.source), preloadAttribute, base, readAsset), variants);
    },
  };
}
