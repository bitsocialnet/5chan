import assert from 'node:assert/strict';
import test from 'node:test';
import {
  APP_PRELOAD_ATTRIBUTE,
  collectDynamicEntryDependencies,
  collectLazyStylesheets,
  createDynamicEntryPreloadTags,
  dynamicEntryPreloadPlugin,
  ROUTE_PRELOAD_DATA_ID,
  ROUTE_PRELOAD_SCRIPT,
} from '../vite-app-preload.mjs';

const chunk = (fileName, { facadeModuleId, imports = [], dynamicImports = [], importedCss = [] } = {}) => ({
  type: 'chunk',
  fileName,
  facadeModuleId,
  imports,
  dynamicImports,
  viteMetadata: { importedCss: new Set(importedCss), importedAssets: new Set() },
});

const createBundle = () => ({
  'assets/index-AAAAAAAA.js': chunk('assets/index-AAAAAAAA.js', {
    facadeModuleId: '/repo/src/index.tsx',
    imports: ['assets/vendor-BBBBBBBB.js'],
    dynamicImports: ['assets/app-CCCCCCCC.js'],
    importedCss: ['assets/index-DDDDDDDD.css'],
  }),
  'assets/vendor-BBBBBBBB.js': chunk('assets/vendor-BBBBBBBB.js'),
  'assets/app-CCCCCCCC.js': chunk('assets/app-CCCCCCCC.js', {
    facadeModuleId: '/repo/src/app.tsx',
    imports: ['assets/vendor-BBBBBBBB.js', 'assets/index-AAAAAAAA.js', 'assets/hooks-EEEEEEEE.js', 'assets/posts-FFFFFFFF.js'],
    dynamicImports: ['assets/reply-modal-GGGGGGGG.js'],
    importedCss: ['assets/app-HHHHHHHH.css'],
  }),
  'assets/hooks-EEEEEEEE.js': chunk('assets/hooks-EEEEEEEE.js', { imports: ['assets/crypto-IIIIIIII.js'], dynamicImports: ['assets/pkc-js-JJJJJJJJ.js'] }),
  'assets/crypto-IIIIIIII.js': chunk('assets/crypto-IIIIIIII.js'),
  'assets/posts-FFFFFFFF.js': chunk('assets/posts-FFFFFFFF.js', { imports: ['assets/crypto-IIIIIIII.js'], importedCss: ['assets/posts-KKKKKKKK.css'] }),
  'assets/reply-modal-GGGGGGGG.js': chunk('assets/reply-modal-GGGGGGGG.js', { importedCss: ['assets/reply-modal-LLLLLLLL.css'] }),
  'assets/pkc-js-JJJJJJJJ.js': chunk('assets/pkc-js-JJJJJJJJ.js'),
  'assets/app-HHHHHHHH.css': { type: 'asset', fileName: 'assets/app-HHHHHHHH.css' },
});

const html = `<head><script type="module" crossorigin src="./assets/index-AAAAAAAA.js"></script><link rel="modulepreload" crossorigin href="./assets/vendor-BBBBBBBB.js"><link rel="stylesheet" crossorigin href="./assets/index-DDDDDDDD.css"></head>`;

const createBootstrapBundle = () => {
  const bundle = createBundle();
  bundle['assets/bootstrap-MMMMMMMM.js'] = chunk('assets/bootstrap-MMMMMMMM.js', {
    facadeModuleId: '/repo/src/bootstrap.ts',
    imports: ['assets/vendor-BBBBBBBB.js'],
    dynamicImports: ['assets/index-AAAAAAAA.js'],
  });
  bundle['assets/index-AAAAAAAA.js'].imports.push('assets/polyfills-NNNNNNNN.js');
  bundle['assets/polyfills-NNNNNNNN.js'] = chunk('assets/polyfills-NNNNNNNN.js');
  return bundle;
};

test('preloads bootstrap -> index -> app, including index-only dependencies and theme CSS', () => {
  for (const base of ['./', '/nested/']) {
    const bootstrapHtml = `<head><script type="module" crossorigin src="${base}assets/bootstrap-MMMMMMMM.js"></script><link rel="modulepreload" crossorigin href="${base}assets/vendor-BBBBBBBB.js"></head>`;
    const plugin = dynamicEntryPreloadPlugin({ routeFacadeSuffix: null });
    plugin.configResolved({ base });
    const tags = plugin.transformIndexHtml.handler(bootstrapHtml, { bundle: createBootstrapBundle() });
    assert.deepEqual(
      tags.map((tag) => [tag.attrs.rel, tag.attrs.href]),
      [
        ['modulepreload', `${base}assets/index-AAAAAAAA.js`],
        ['modulepreload', `${base}assets/polyfills-NNNNNNNN.js`],
        ['preload', `${base}assets/index-DDDDDDDD.css`],
        ['modulepreload', `${base}assets/app-CCCCCCCC.js`],
        ['modulepreload', `${base}assets/hooks-EEEEEEEE.js`],
        ['modulepreload', `${base}assets/crypto-IIIIIIII.js`],
        ['modulepreload', `${base}assets/posts-FFFFFFFF.js`],
        ['preload', `${base}assets/posts-KKKKKKKK.css`],
        ['preload', `${base}assets/app-HHHHHHHH.css`],
        ['preload', `${base}assets/reply-modal-LLLLLLLL.css`],
      ],
    );
    assert.equal(new Set(tags.map((tag) => tag.attrs.href)).size, tags.length);
    assert.ok(tags.every((tag) => tag.attrs.rel !== 'stylesheet'));
  }
});

test('collects the static graph of the app chunk in Vite dependency order, skipping dynamic imports', () => {
  const files = collectDynamicEntryDependencies(createBundle(), 'assets/app-CCCCCCCC.js', { ownerFileName: 'assets/index-AAAAAAAA.js' });
  assert.deepEqual(files, [
    'assets/app-CCCCCCCC.js',
    'assets/vendor-BBBBBBBB.js',
    'assets/hooks-EEEEEEEE.js',
    'assets/crypto-IIIIIIII.js',
    'assets/posts-FFFFFFFF.js',
    'assets/posts-KKKKKKKK.css',
    'assets/app-HHHHHHHH.css',
  ]);
});

test('handles circular static imports and missing dependency chunks without adding lazy imports', () => {
  const bundle = createBundle();
  bundle['assets/crypto-IIIIIIII.js'].imports.push('assets/hooks-EEEEEEEE.js', 'assets/missing-OOOOOOOO.js');
  assert.deepEqual(
    collectDynamicEntryDependencies(bundle, 'assets/app-CCCCCCCC.js', { ownerFileName: 'assets/index-AAAAAAAA.js' }),
    collectDynamicEntryDependencies(createBundle(), 'assets/app-CCCCCCCC.js', { ownerFileName: 'assets/index-AAAAAAAA.js' }),
  );
});

test('links the stylesheets of lazily imported chunks after their imports and before their own lazy chunks', () => {
  const bundle = createBundle();
  bundle['assets/reply-modal-GGGGGGGG.js'].imports.push('assets/posts-FFFFFFFF.js', 'assets/editor-PPPPPPPP.js');
  bundle['assets/reply-modal-GGGGGGGG.js'].dynamicImports.push('assets/emoji-QQQQQQQQ.js', 'assets/app-CCCCCCCC.js');
  bundle['assets/editor-PPPPPPPP.js'] = chunk('assets/editor-PPPPPPPP.js', { importedCss: ['assets/editor-RRRRRRRR.css'] });
  bundle['assets/emoji-QQQQQQQQ.js'] = chunk('assets/emoji-QQQQQQQQ.js', { importedCss: ['assets/emoji-SSSSSSSS.css'] });
  const startupFiles = new Set([
    ...collectDynamicEntryDependencies(bundle, 'assets/index-AAAAAAAA.js'),
    ...collectDynamicEntryDependencies(bundle, 'assets/app-CCCCCCCC.js', { ownerFileName: 'assets/index-AAAAAAAA.js' }),
  ]);
  // The index and posts stylesheets are startup stylesheets already; JavaScript chunks are not collected.
  // The emoji chunk loads only after the reply modal's module runs, so its rules come after the modal's.
  assert.deepEqual(collectLazyStylesheets(bundle, 'assets/app-CCCCCCCC.js', startupFiles), [
    'assets/editor-RRRRRRRR.css',
    'assets/reply-modal-LLLLLLLL.css',
    'assets/emoji-SSSSSSSS.css',
  ]);
});

test('emits preload tags only for files the HTML does not already reference', () => {
  const tags = createDynamicEntryPreloadTags({ bundle: createBundle(), html, base: './', entryFacadeSuffix: '/src/app.tsx', ownerFacadeSuffix: '/src/index.tsx' });
  assert.deepEqual(
    tags.map((tag) => [tag.attrs.rel, tag.attrs.href]),
    [
      ['modulepreload', './assets/app-CCCCCCCC.js'],
      ['modulepreload', './assets/hooks-EEEEEEEE.js'],
      ['modulepreload', './assets/crypto-IIIIIIII.js'],
      ['modulepreload', './assets/posts-FFFFFFFF.js'],
      ['preload', './assets/posts-KKKKKKKK.css'],
      ['preload', './assets/app-HHHHHHHH.css'],
      ['preload', './assets/reply-modal-LLLLLLLL.css'],
    ],
  );
  for (const tag of tags) {
    assert.equal(tag.tag, 'link');
    assert.equal(tag.injectTo, 'head');
    // Module scripts and the runtime-inserted stylesheets are fetched with CORS, so the preloads must match.
    assert.equal(tag.attrs.crossorigin, true);
    assert.equal(tag.attrs[APP_PRELOAD_ATTRIBUTE], true);
    if (tag.attrs.rel === 'preload') assert.equal(tag.attrs.as, 'style');
  }
});

test('lists the board routes chunk graph for the route preload script, without startup files or stylesheets', () => {
  const bundle = createBundle();
  bundle['assets/app-CCCCCCCC.js'].dynamicImports.push('assets/board-routes-TTTTTTTT.js');
  bundle['assets/board-routes-TTTTTTTT.js'] = chunk('assets/board-routes-TTTTTTTT.js', {
    facadeModuleId: '/repo/src/board-routes.tsx',
    imports: ['assets/vendor-BBBBBBBB.js', 'assets/posts-FFFFFFFF.js', 'assets/virtuoso-UUUUUUUU.js'],
    importedCss: ['assets/board-routes-VVVVVVVV.css'],
  });
  bundle['assets/virtuoso-UUUUUUUU.js'] = chunk('assets/virtuoso-UUUUUUUU.js');
  const tags = createDynamicEntryPreloadTags({
    bundle,
    html,
    base: './',
    entryFacadeSuffix: '/src/app.tsx',
    ownerFacadeSuffix: '/src/index.tsx',
    routeFacadeSuffix: '/src/board-routes.tsx',
  });
  // Its stylesheet is linked with the other lazy stylesheets, never preloaded as a startup file.
  assert.ok(tags.some((tag) => tag.attrs?.href === './assets/board-routes-VVVVVVVV.css'));
  assert.ok(!tags.some((tag) => tag.attrs?.href === './assets/board-routes-TTTTTTTT.js'));
  const [data, script] = tags.slice(0, 2);
  assert.deepEqual(data.attrs, { type: 'application/json', id: ROUTE_PRELOAD_DATA_ID });
  assert.deepEqual(JSON.parse(data.children), ['./assets/board-routes-TTTTTTTT.js', './assets/virtuoso-UUUUUUUU.js']);
  assert.equal(script.children, ROUTE_PRELOAD_SCRIPT);
});

test('the route preload script preloads the board routes everywhere but the home page and the pages outside the board layout', () => {
  const preloadedFor = (hash) => {
    const appended = [];
    const document = {
      getElementById: (id) => (id === ROUTE_PRELOAD_DATA_ID ? { textContent: '["./assets/board-routes.js","./assets/post.js"]' } : null),
      createElement: () => ({
        setAttribute(name, value) {
          this[name] = value;
        },
      }),
      head: { appendChild: (link) => appended.push(link) },
    };
    new Function('location', 'document', ROUTE_PRELOAD_SCRIPT)({ hash }, document);
    return appended;
  };
  for (const hash of [
    '',
    '#',
    '#/',
    '#/faq',
    '#/rules',
    '#/rules/b',
    '#/blotter/',
    '#/pass',
    '#/settings/account-data',
    '#/not-found',
    '#/biz/board-settings',
    '#/?lang=de',
  ]) {
    assert.deepEqual(preloadedFor(hash), [], hash);
  }
  for (const hash of [
    '#/biz',
    '#/biz/',
    '#/biz/2',
    '#/biz/catalog',
    '#/biz/thread/Qm123',
    '#/biz/thread/Qm123#p1',
    '#/all?t=week',
    '#/subs',
    '#/pending/0',
    '#/faq/2',
    '#/biz/settings',
  ]) {
    assert.deepEqual(
      preloadedFor(hash).map((link) => [link.rel, link.crossOrigin, link.href, link['data-fivechan-route-preload']]),
      [
        ['modulepreload', '', './assets/board-routes.js', ''],
        ['modulepreload', '', './assets/post.js', ''],
      ],
      hash,
    );
  }
});

test('fails when the board routes entry is missing from the bundle', () => {
  assert.throws(
    () =>
      createDynamicEntryPreloadTags({
        bundle: createBundle(),
        html,
        base: './',
        entryFacadeSuffix: '/src/app.tsx',
        ownerFacadeSuffix: '/src/index.tsx',
        routeFacadeSuffix: '/src/app-with-board-routes.ts',
      }),
    /app-with-board-routes/,
  );
});

test('returns nothing when the app chunk is missing from the bundle', () => {
  const bundle = createBundle();
  delete bundle['assets/app-CCCCCCCC.js'];
  assert.deepEqual(createDynamicEntryPreloadTags({ bundle, html, base: './', entryFacadeSuffix: '/src/app.tsx', ownerFacadeSuffix: '/src/index.tsx' }), []);
});

test('the plugin only transforms build HTML that carries a bundle', () => {
  const plugin = dynamicEntryPreloadPlugin({ routeFacadeSuffix: null });
  assert.equal(plugin.apply, 'build');
  plugin.configResolved({ base: '/' });
  assert.equal(plugin.transformIndexHtml.handler(html, {}), undefined);
  const tags = plugin.transformIndexHtml.handler(html, { bundle: createBundle() });
  assert.equal(tags[0].attrs.href, '/assets/app-CCCCCCCC.js');
});
