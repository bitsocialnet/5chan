import assert from 'node:assert/strict';
import test from 'node:test';
import { APP_PRELOAD_ATTRIBUTE, collectDynamicEntryDependencies, createDynamicEntryPreloadTags, dynamicEntryPreloadPlugin } from '../vite-app-preload.mjs';

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

test('returns nothing when the app chunk is missing from the bundle', () => {
  const bundle = createBundle();
  delete bundle['assets/app-CCCCCCCC.js'];
  assert.deepEqual(createDynamicEntryPreloadTags({ bundle, html, base: './', entryFacadeSuffix: '/src/app.tsx', ownerFacadeSuffix: '/src/index.tsx' }), []);
});

test('the plugin only transforms build HTML that carries a bundle', () => {
  const plugin = dynamicEntryPreloadPlugin();
  assert.equal(plugin.apply, 'build');
  plugin.configResolved({ base: '/' });
  assert.equal(plugin.transformIndexHtml.handler(html, {}), undefined);
  const tags = plugin.transformIndexHtml.handler(html, { bundle: createBundle() });
  assert.equal(tags[0].attrs.href, '/assets/app-CCCCCCCC.js');
});
