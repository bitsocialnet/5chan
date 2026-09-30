import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { BANNER_PLACEHOLDER, STATIC_SHELL_ATTRIBUTE, assembleBoardFrame, buildBoardFrames, injectStaticShell, injectThemeScript, inlineStartupStylesheets } from '../vite-static-shell.mjs';

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

// A board frame as the build renders it: code links, a board select, the banner (desktop only), the
// title, the directory winner line and the style select.
const renderBoard = (code, title, winner, { width = 'desktop', nsfw = false } = {}) => ({
  html: [
    `<div class="app"><a href="#/${code}/settings">Settings</a><select><option value="${code}">/${code}/</option></select>`,
    width === 'desktop' ? `<img alt="" src="${BANNER_PLACEHOLDER}">` : '<div class="mobile">[Bottom]</div>',
    `<div class="title">${title}</div><span title="Resolves /${code}/.">Current /${code}/ winner: ${winner}</span>`,
    `<a href="#/${code}">1</a><select><option value="yotsuba">Yotsuba</option><option value="yotsuba-b">Yotsuba B</option><option value="tomorrow">Tomorrow</option></select></div>`,
  ].join(''),
  bodyClass: nsfw ? 'yotsuba' : 'yotsuba-b',
  selects: [code, nsfw ? 'yotsuba' : 'yotsuba-b'],
});

const boardRenders = (code, title, winner, options) => ({
  frames: { desktop: renderBoard(code, title, winner, options), mobile: renderBoard(code, title, winner, { ...options, width: 'mobile' }) },
});

const BOARD_RENDERS = {
  biz: boardRenders('biz', '/biz/ - Business &amp; Finance', 'bizraelis.bso'),
  b: boardRenders('b', '/b/ - Random', 'random-nsfw.bso', { nsfw: true }),
  g: boardRenders('g', '/g/ - Technology', 'technology-posting.bso'),
  // Another shape, like the flash board's table.
  f: { frames: { ...boardRenders('f', '/f/ - Flash', 'flash-posting.bso').frames, desktop: { html: '<table></table>', bodyClass: 'yotsuba', selects: [] } } },
};

test('builds one template per width that rebuilds every board of the common shape', () => {
  const { frames, codes, excluded } = buildBoardFrames(BOARD_RENDERS);
  assert.deepEqual(excluded, ['f']);
  // Only the title and the winner line are stored per board; code links share one pattern.
  assert.deepEqual(codes.biz, ['/biz/ - Business &amp; Finance', 'Current /biz/ winner: bizraelis.bso']);
  assert.ok(frames.desktop.slots.includes('#/\u0000/settings'));
  assert.deepEqual(frames.mobile.selects, ['code', 'theme']);
  for (const code of ['biz', 'b', 'g']) {
    for (const width of ['desktop', 'mobile']) assert.equal(assembleBoardFrame(frames[width], code, codes[code]), BOARD_RENDERS[code].frames[width].html);
  }
});

const CATEGORIES = { codes: { biz: 'sfw', b: 'nsfw', g: 'sfw' }, addresses: { 'random-nsfw.bso': 'nsfw', 'bizraelis.bso': 'sfw' } };
const DEFAULT_THEMES = { nsfw: 'yotsuba', sfw: 'yotsuba-b' };
const BANNERS = ['assets/banners/banner-1.jpg', 'assets/banners/banner-2.jpg'];

// What the build's render saves on its own, as zustand's persist middleware does on every first visit.
const SAVED_INTRODUCTION = '{"state":{"showIntroduction":true},"version":0}';
const SAVED_FEED_VIEW = '{"state":{"enableInfiniteScroll":false},"version":0}';

const buildHtml = () => {
  const { frames, codes } = buildBoardFrames(BOARD_RENDERS);
  return injectStaticShell(injectThemeScript('<!doctype html><html><head></head><body><div id="root"></div></body></html>', CATEGORIES, DEFAULT_THEMES), {
    home: '<div class="app">shell</div>',
    boards: { mobileBreakpointWidth: 640, banners: BANNERS, bannerPlaceholder: BANNER_PLACEHOLDER, frames, codes },
    storage: { 'homepage-introduction': SAVED_INTRODUCTION, 'feed-view-settings-store': SAVED_FEED_VIEW, 'unrelated-store': '{}' },
  });
};

const load = ({ hash = '', storage = {}, globals = {}, width = 1280, date, historyState } = {}) => {
  const dom = new JSDOM(buildHtml(), { url: `https://5chan.test/${hash}`, runScripts: 'outside-only' });
  for (const [key, value] of Object.entries(storage)) dom.window.localStorage.setItem(key, value);
  Object.assign(dom.window, globals);
  Object.defineProperty(dom.window, 'innerWidth', { configurable: true, value: width });
  if (historyState) dom.window.history.replaceState(historyState, '');
  if (date) {
    const RealDate = dom.window.Date;
    dom.window.Date = class extends RealDate {
      constructor(...args) {
        super(...(args.length ? args : [date]));
      }
    };
  }
  // Run the inline scripts in document order, as the parser would, now that storage is seeded.
  for (const script of dom.window.document.querySelectorAll('script:not([type])')) dom.window.eval(script.textContent);
  const root = dom.window.document.getElementById('root');
  return {
    shown: !!root.firstElementChild?.hasAttribute(STATIC_SHELL_ATTRIBUTE),
    bodyClass: dom.window.document.body.className,
    html: root.innerHTML,
    selects: [...root.querySelectorAll('select')].map((select) => select.value),
    banner: dom.window.__FIVECHAN_SHELL_BANNER__,
  };
};

test('applies the theme React applies on its first commit', () => {
  assert.equal(load().bodyClass, 'yotsuba');
  assert.equal(load({ hash: '#/rules' }).bodyClass, 'yotsuba');
  for (const hash of ['#/faq', '#/faq/', '#/directory/settings', '#/not-found', '#/subs/unknown', '#/search/unknown']) assert.equal(load({ hash }).bodyClass, 'yotsuba', hash);
  // Other paths under a static page's name are board routes to React Router.
  for (const hash of ['#/faq/2', '#/pass/settings', '#/pending', '#/settings']) assert.equal(load({ hash }).bodyClass, 'yotsuba-b', hash);
  assert.equal(load({ hash: '#/biz' }).bodyClass, 'yotsuba-b');
  assert.equal(load({ hash: '#/biz/thread/Qm1' }).bodyClass, 'yotsuba-b');
  assert.equal(load({ hash: '#/b/catalog?sort=active' }).bodyClass, 'yotsuba');
  // Nested fragments: React Router's pathname ends at `#`, and index.tsx moves legacy %23 settings and
  // catalog-search fragments into the query first.
  const savedNsfw = { '5chan-themes': '{"nsfw":"tomorrow","sfw":"yotsuba-b"}' };
  for (const hash of ['#/subs/catalog#s=anime', '#/subs/settings%23subscriptions-settings', '#/subs/catalog%23s=anime', '#/search/settings%23display-settings'])
    assert.equal(load({ hash, storage: savedNsfw }).bodyClass, 'tomorrow', hash);
  assert.equal(load({ hash: '#/b%23x', storage: savedNsfw }).bodyClass, 'yotsuba-b');
  assert.equal(load({ hash: '#/random-nsfw.bso' }).bodyClass, 'yotsuba');
  assert.equal(load({ hash: '#/unknown.bso' }).bodyClass, 'yotsuba-b');
  assert.equal(load({ hash: '#/pending/0', historyState: { usr: { pendingPost: { communityAddress: 'random-nsfw.bso' } } } }).bodyClass, 'yotsuba');
  for (const hash of ['#/all', '#/subs', '#/subs/catalog/settings', '#/mod', '#/mod/queue', '#/search/', '#/search/catalog']) assert.equal(load({ hash }).bodyClass, 'yotsuba', hash);
  const themes = '{"nsfw":"tomorrow","sfw":"burichan"}';
  assert.equal(load({ hash: '#/all', storage: { '5chan-themes': themes } }).bodyClass, 'tomorrow');
  assert.equal(load({ hash: '#/biz', storage: { '5chan-themes': themes } }).bodyClass, 'burichan');
  assert.equal(load({ hash: '#/biz', storage: { '5chan-themes': 'not json' } }).bodyClass, 'yotsuba-b');
  // An enabled seasonal theme wins everywhere but the home page and rules, and only on its date.
  const halloween = { date: '2026-10-31T12:00:00', storage: { 'Special-theme-storage': '{"state":{"isEnabled":true},"version":0}' } };
  assert.equal(load({ ...halloween, hash: '#/biz' }).bodyClass, 'spooky');
  assert.equal(load({ ...halloween, hash: '#/' }).bodyClass, 'yotsuba');
  assert.equal(load({ ...halloween, hash: '#/biz', date: '2026-11-01T12:00:00' }).bodyClass, 'yotsuba-b');
});

test('shows the home frame on a first visit and on a return visit with only preferences the app saved itself', () => {
  assert.equal(load().shown, true);
  assert.equal(load({ hash: '#/' }).shown, true);
  assert.equal(load({ storage: { '5chan-interface-language': 'en' } }).shown, true);
  assert.equal(load({ storage: { 'homepage-introduction': SAVED_INTRODUCTION, 'unrelated-store': '{"changed":true}' } }).shown, true);
});

test('shows a directory board frame for the width, with the board and theme React selects', () => {
  const desktop = load({ hash: '#/biz', storage: { 'feed-view-settings-store': SAVED_FEED_VIEW } });
  assert.equal(desktop.shown, true);
  assert.match(desktop.html, /href="#\/biz\/settings"/);
  assert.match(desktop.html, /Current \/biz\/ winner: bizraelis.bso/);
  assert.ok(BANNERS.includes(desktop.banner));
  assert.ok(desktop.html.includes(`<img alt="" src="${desktop.banner}">`));
  assert.deepEqual(desktop.selects, ['biz', 'yotsuba-b']);

  const mobile = load({ hash: '#/b', width: 375, storage: { '5chan-themes': '{"nsfw":"tomorrow","sfw":"yotsuba-b"}' } });
  assert.equal(mobile.shown, true);
  assert.match(mobile.html, /\[Bottom\]/);
  assert.deepEqual(mobile.selects, ['b', 'tomorrow']);
});

test('skips the frame when the first frame would differ', () => {
  assert.equal(load({ storage: { '5chan-interface-language': 'de' } }).shown, false);
  assert.equal(load({ storage: { 'homepage-introduction': '{"state":{"showIntroduction":false},"version":0}' } }).shown, false);
  assert.equal(load({ storage: { '5chan-boards-filter': 'worksafe' } }).shown, false);
  assert.equal(load({ globals: { isElectron: true } }).shown, false);
  assert.equal(load({ globals: { androidBridge: {} } }).shown, false);
  for (const hash of ['#/biz/catalog', '#/biz/', '#/biz?q=1', '#/f', '#/unknown.bso', '#/faq']) assert.equal(load({ hash }).shown, false, hash);
  assert.equal(load({ hash: '#/biz', storage: { 'feed-view-settings-store': '{"state":{"enableInfiniteScroll":true},"version":0}' } }).shown, false);
  assert.equal(load({ hash: '#/biz', storage: { '5chan-boardsbar-directories-visible': '["biz"]' } }).shown, false);
  assert.equal(load({ hash: '#/biz', storage: { '5chan-interface-language': 'de' } }).shown, false);
  assert.equal(load({ hash: '#/biz', date: '2026-12-24T12:00:00' }).shown, false);
});

test('applies the theme and frame as the parser inserts <body> and #root, before they exist', async () => {
  const dom = new JSDOM(buildHtml(), { url: 'https://5chan.test/#/biz', runScripts: 'outside-only' });
  const { document } = dom.window;
  // The scripts run in <head>, before the parser has created <body>.
  document.body.remove();
  for (const script of document.querySelectorAll('script:not([type])')) dom.window.eval(script.textContent);
  const body = document.createElement('body');
  document.documentElement.appendChild(body);
  const root = document.createElement('div');
  root.id = 'root';
  body.appendChild(root);
  // Mutation observers run in the parser's task, before the browser renders a frame.
  await new Promise((resolve) => dom.window.queueMicrotask(resolve));
  assert.equal(body.className, 'yotsuba-b');
  assert.equal(root.firstElementChild?.hasAttribute(STATIC_SHELL_ATTRIBUTE), true);
  assert.match(root.innerHTML, /Current \/biz\/ winner/);
});

test('keeps JSON data from ending its script element early', () => {
  const withTheme = injectThemeScript('<html><head></head><body><div id="root"></div></body></html>', CATEGORIES, DEFAULT_THEMES);
  const html = injectStaticShell(withTheme, { home: '', boards: { codes: { x: ['</script><script>alert(1)</script>', '<!--'] } } });
  const dom = new JSDOM(html);
  const data = JSON.parse(dom.window.document.getElementById('static-shell-data').textContent);
  assert.deepEqual(data.boards.codes.x, ['</script><script>alert(1)</script>', '<!--']);
  assert.throws(() => injectStaticShell(withTheme.replace('<div id="root"></div>', '<div id="root">x</div>'), { home: '', boards: {} }), /no empty/);
  assert.throws(() => injectStaticShell('<html><head></head><body><div id="root"></div></body></html>', { home: '', boards: {} }), /theme script first/);
});
