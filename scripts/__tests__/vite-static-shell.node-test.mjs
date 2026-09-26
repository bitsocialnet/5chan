import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { STATIC_SHELL_ATTRIBUTE, injectStaticShell, inlineStartupStylesheets } from '../vite-static-shell.mjs';

const ATTRIBUTE = 'data-fivechan-app-preload';

test('inlines startup stylesheets in place and keeps a disabled link for the runtime helper', () => {
  const html = [
    `<link rel="modulepreload" crossorigin href="./assets/app-A.js" ${ATTRIBUTE}>`,
    `<link rel="preload" as="style" crossorigin href="./assets/app-B.css" ${ATTRIBUTE}>`,
    '<link rel="stylesheet" href="./assets/other.css">',
  ].join('');
  const css = '.a{background:url(../assets/buttons/x.png)}.b{background:url("data:image/png;base64,AA")}.c{background:url(/abs.png)}';
  const output = inlineStartupStylesheets(html, ATTRIBUTE, './', (fileName) => {
    assert.equal(fileName, 'assets/app-B.css');
    return css;
  });
  assert.equal(
    output,
    [
      `<link rel="modulepreload" crossorigin href="./assets/app-A.js" ${ATTRIBUTE}>`,
      '<style>.a{background:url(assets/buttons/x.png)}.b{background:url("data:image/png;base64,AA")}.c{background:url(/abs.png)}</style>',
      `<link rel="stylesheet" crossorigin href="./assets/app-B.css" ${ATTRIBUTE} disabled>`,
      '<link rel="stylesheet" href="./assets/other.css">',
    ].join(''),
  );
  assert.throws(() => inlineStartupStylesheets(html, ATTRIBUTE, './', () => '</style><script>'), /cannot be inlined/);
});

test('adds the shell templates and insertion script after an empty root', () => {
  const output = injectStaticShell('<body><div id="root"></div></body>', { home: '<div class="app">shell</div>' });
  assert.match(output, /<div id="root"><\/div><template id="static-shell-home"><div class="app">shell<\/div><\/template><script>/);
  assert.throws(() => injectStaticShell('<body><div id="root">x</div></body>', {}), /no empty/);
});

// What the build's render saves on its own, as zustand's persist middleware does on every first visit.
const SAVED_INTRODUCTION = '{"state":{"showIntroduction":true},"version":0}';

const loadWithShell = ({ hash = '', storage = {}, globals = {} } = {}) => {
  const html = injectStaticShell(
    '<!doctype html><html><body><div id="root"></div></body></html>',
    { home: '<div class="app">shell</div>' },
    { 'homepage-introduction': SAVED_INTRODUCTION, 'unrelated-store': '{}' },
  );
  const dom = new JSDOM(html, { url: `https://5chan.test/${hash}`, runScripts: 'outside-only' });
  for (const [key, value] of Object.entries(storage)) dom.window.localStorage.setItem(key, value);
  Object.assign(dom.window, globals);
  // Run the inline script as the parser would, now that storage is seeded.
  dom.window.eval(dom.window.document.querySelector('body > script').textContent);
  const root = dom.window.document.getElementById('root');
  return { shown: !!root.firstElementChild?.hasAttribute(STATIC_SHELL_ATTRIBUTE), bodyClass: dom.window.document.body.className };
};

test('shows the shell on a first visit to the home page', () => {
  assert.deepEqual(loadWithShell(), { shown: true, bodyClass: 'yotsuba' });
  assert.equal(loadWithShell({ hash: '#/' }).shown, true);
  assert.equal(loadWithShell({ storage: { '5chan-interface-language': 'en' } }).shown, true);
});

test('shows the shell on a return visit that only has the preferences the app saved itself', () => {
  assert.equal(loadWithShell({ storage: { 'homepage-introduction': SAVED_INTRODUCTION, 'unrelated-store': '{"changed":true}' } }).shown, true);
});

test('skips the shell when the first frame would differ', () => {
  assert.equal(loadWithShell({ hash: '#/biz' }).shown, false);
  assert.equal(loadWithShell({ storage: { '5chan-interface-language': 'de' } }).shown, false);
  assert.equal(loadWithShell({ storage: { 'homepage-introduction': '{"state":{"showIntroduction":false},"version":0}' } }).shown, false);
  assert.equal(loadWithShell({ storage: { '5chan-boards-filter': 'worksafe' } }).shown, false);
  assert.equal(loadWithShell({ globals: { isElectron: true } }).shown, false);
  assert.equal(loadWithShell({ globals: { androidBridge: {} } }).shown, false);
});
