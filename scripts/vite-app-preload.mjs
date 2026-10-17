// Preload the dynamically imported startup chunk graphs from index.html.
//
// src/bootstrap.ts imports src/index.tsx, which imports the app after configuring polyfills
// and P2P client options. Vite only writes HTML preload tags for bootstrap's static imports.
// Preload both deferred graphs so index-only dependencies and global/theme CSS are discovered
// alongside the app chunks. Preloading fetches them without changing their execution order.
//
// The stylesheets of the app's lazy chunks are linked too (see collectLazyStylesheets).

export const APP_PRELOAD_ATTRIBUTE = 'data-fivechan-app-preload';

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

export function createDynamicEntryPreloadTags({ bundle, html, base, entryFacadeSuffix, ownerFacadeSuffix }) {
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
  return (
    files
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
      }))
  );
}

export function dynamicEntryPreloadPlugin({ entryFacadeSuffix = '/src/app.tsx', ownerFacadeSuffix = '/src/index.tsx' } = {}) {
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
        return createDynamicEntryPreloadTags({ bundle: context.bundle, html, base, entryFacadeSuffix, ownerFacadeSuffix });
      },
    },
  };
}
