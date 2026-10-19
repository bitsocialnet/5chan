// Preload the dynamically imported startup chunk graphs from index.html.
//
// src/bootstrap.ts imports src/index.tsx, which imports the app after configuring polyfills
// and P2P client options. Vite only writes HTML preload tags for bootstrap's static imports.
// Preload both deferred graphs so index-only dependencies and global/theme CSS are discovered
// alongside the app chunks. Preloading fetches them without changing their execution order.
//
// The stylesheets of the app's lazy chunks are linked too (see collectLazyStylesheets), and the
// board routes' chunks are preloaded on the routes that render them (see ROUTE_PRELOAD_SCRIPT).

export const APP_PRELOAD_ATTRIBUTE = 'data-fivechan-app-preload';
export const ROUTE_PRELOAD_DATA_ID = 'fivechan-route-preload';

// src/app.tsx loads src/board-routes.tsx on demand, and on the routes that render it, index.tsx imports
// it with the app (src/app-with-board-routes.ts) before the first render. This script starts those
// downloads with the startup files instead of after the app's code has run. It runs on every route but the home page and the pages outside the
// board layout; on any other path it can only download a chunk the app warms after startup anyway.
// index.tsx reads the attribute it sets on each link. Its hash is listed in vercel.json's script-src,
// so the file list lives in a JSON block.
export const ROUTE_PRELOAD_SCRIPT = `(function () {
  try {
    var path = location.hash.replace(/^#/, '').split(/[?#]/)[0].replace(/\\/+$/, '') || '/';
    if (path === '/' || /^\\/(faq|pass|rules|blotter|settings\\/account-data|not-allowed|not-found)$/.test(path) || /^\\/rules\\//.test(path) || /\\/board-settings$/.test(path)) return;
    var files = JSON.parse(document.getElementById('${ROUTE_PRELOAD_DATA_ID}').textContent);
    for (var index = 0; index < files.length; index += 1) {
      var link = document.createElement('link');
      link.rel = 'modulepreload';
      link.crossOrigin = '';
      link.href = files[index];
      link.setAttribute('data-${ROUTE_PRELOAD_DATA_ID}', '');
      document.head.appendChild(link);
    }
  } catch (error) {
    // index.tsx still loads the route's modules before the first render.
  }
})();`;

const toPosix = (filePath) => filePath.replaceAll('\\', '/');

export function findChunkByFacade(bundle, facadeSuffix) {
  return Object.values(bundle).find(
    (output) => output.type === 'chunk' && typeof output.facadeModuleId === 'string' && toPosix(output.facadeModuleId).endsWith(facadeSuffix),
  );
}

// Same traversal and order as Vite's own dynamic-import dependency list (vite:build-import-analysis),
// so the injected stylesheets keep the cascade order the runtime helper would have produced.
export function collectDynamicEntryDependencies(bundle, entryFileName, { ownerFileName } = {}) {
  const dependencies = new Set();
  const analyzed = new Set();
  const addDependencies = (fileName) => {
    if (fileName === ownerFileName || analyzed.has(fileName)) {
      return;
    }
    analyzed.add(fileName);
    const output = bundle[fileName];
    if (!output) {
      return;
    }
    dependencies.add(output.fileName);
    if (output.type === 'chunk') {
      output.imports.forEach(addDependencies);
      output.viteMetadata?.importedCss?.forEach((cssFileName) => dependencies.add(cssFileName));
    }
  };
  addDependencies(entryFileName);
  return [...dependencies];
}

// The stylesheets of every chunk loaded lazily from `rootFileName` (the app's modals and secondary
// views, and what they import), each after the stylesheets of its own imports and before those of
// the chunks it imports lazily, as the runtime helper adds them. The helper appends a lazy chunk's
// stylesheets to <head> when the chunk loads, and while a stylesheet in <head> is loading, WebKit
// gives no style, and so no box, to any element that does not have one yet. Modals load during
// React's first commit and secondary views right after it, so in Safari the whole first frame
// stayed blank until those files downloaded. Linked from index.html, they are inlined by the static
// shell, and the helper skips a stylesheet that is already linked.
export function collectLazyStylesheets(bundle, rootFileName, startupFiles) {
  const stylesheets = new Set();
  const visited = new Set();
  const visit = (fileName) => {
    if (visited.has(fileName)) {
      return;
    }
    visited.add(fileName);
    const output = bundle[fileName];
    if (output?.type !== 'chunk') {
      return;
    }
    output.imports.forEach(visit);
    output.viteMetadata?.importedCss?.forEach((cssFileName) => {
      if (!startupFiles.has(cssFileName)) {
        stylesheets.add(cssFileName);
      }
    });
    output.dynamicImports.forEach(visit);
  };
  visit(rootFileName);
  return [...stylesheets];
}

export function createDynamicEntryPreloadTags({ bundle, html, base, entryFacadeSuffix, ownerFacadeSuffix, routeFacadeSuffix }) {
  const entry = findChunkByFacade(bundle, entryFacadeSuffix);
  if (!entry) {
    return [];
  }
  const owner = ownerFacadeSuffix ? findChunkByFacade(bundle, ownerFacadeSuffix) : undefined;
  const startupFiles = new Set([
    ...(owner ? collectDynamicEntryDependencies(bundle, owner.fileName) : []),
    ...collectDynamicEntryDependencies(bundle, entry.fileName, { ownerFileName: owner?.fileName }),
  ]);
  // After the startup stylesheets, which the runtime helper also inserts before any lazy chunk's.
  const files = [...startupFiles, ...collectLazyStylesheets(bundle, (owner ?? entry).fileName, startupFiles)];
  const tags = files
    // Bootstrap and any shared static dependencies already have Vite's HTML tags.
    .filter((fileName) => !html.includes(fileName))
    .map((fileName) => ({
      tag: 'link',
      // Stylesheets are `preload` rather than `stylesheet` tags: the static shell inlines each one and
      // leaves a disabled link, so the runtime helper never inserts it (see inlineStartupStylesheets).
      attrs: fileName.endsWith('.css')
        ? { rel: 'preload', as: 'style', crossorigin: true, href: `${base}${fileName}`, [APP_PRELOAD_ATTRIBUTE]: true }
        : { rel: 'modulepreload', crossorigin: true, href: `${base}${fileName}`, [APP_PRELOAD_ATTRIBUTE]: true },
      injectTo: 'head',
    }));
  if (!routeFacadeSuffix) {
    return tags;
  }
  const route = findChunkByFacade(bundle, routeFacadeSuffix);
  if (!route) {
    // Without it, board routes would load their modules only after the app's code has run.
    throw new Error(`app preload: no chunk for ${routeFacadeSuffix}, the board routes' entry`);
  }
  // Its stylesheets are among the lazy ones above.
  const routeFiles = collectDynamicEntryDependencies(bundle, route.fileName).filter(
    (fileName) => !startupFiles.has(fileName) && !fileName.endsWith('.css') && !html.includes(fileName),
  );
  // First, so the parser runs it before reaching the inlined stylesheets that follow.
  return [
    {
      tag: 'script',
      attrs: { type: 'application/json', id: ROUTE_PRELOAD_DATA_ID },
      children: JSON.stringify(routeFiles.map((fileName) => `${base}${fileName}`)),
      injectTo: 'head',
    },
    { tag: 'script', children: ROUTE_PRELOAD_SCRIPT, injectTo: 'head' },
    ...tags,
  ];
}

export function dynamicEntryPreloadPlugin({
  entryFacadeSuffix = '/src/app.tsx',
  ownerFacadeSuffix = '/src/index.tsx',
  routeFacadeSuffix = '/src/app-with-board-routes.ts',
} = {}) {
  let base = '/';
  return {
    name: 'fivechan-app-entry-preload',
    apply: 'build',
    configResolved(config) {
      base = config.base;
    },
    transformIndexHtml: {
      order: 'post',
      handler(html, context) {
        if (!context.bundle) {
          return;
        }
        return createDynamicEntryPreloadTags({ bundle: context.bundle, html, base, entryFacadeSuffix, ownerFacadeSuffix, routeFacadeSuffix });
      },
    },
  };
}
