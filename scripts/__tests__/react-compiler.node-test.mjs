import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer, loadConfigFromFile } from 'vite';
import { parseSync, traverse } from '@babel/core';

test('the app Vite configuration preserves React Compiler behavior', { timeout: 30_000 }, async (t) => {
  const configFile = fileURLToPath(new URL('../../vite.config.js', import.meta.url));
  const root = dirname(configFile);
  const cacheDir = mkdtempSync(join(tmpdir(), '5chan-react-compiler-'));
  const environment = new Map(['VITE_APP_VERSION', 'VITE_COMMIT_REF', 'VITE_LATEST_RELEASE_COMMIT_REF'].map((key) => [key, process.env[key]]));
  let server;
  t.after(async () => {
    await server?.close();
    rmSync(cacheDir, { recursive: true, force: true });
    for (const [key, value] of environment) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  // Keep metadata resolution offline, including shallow CI checkouts without release tags.
  process.env.VITE_COMMIT_REF = 'compiler-test';
  process.env.VITE_LATEST_RELEASE_COMMIT_REF = 'compiler-test';
  const loaded = await loadConfigFromFile({ command: 'serve', mode: 'development' }, configFile, root);
  assert.ok(loaded, `Could not load ${configFile}`);
  server = await createServer({
    ...loaded.config,
    configFile: false,
    root,
    cacheDir,
    server: { ...loaded.config.server, middlewareMode: true, hmr: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] },
  });

  const sourcePath = '/src/components/loading-ellipsis/loading-ellipsis.tsx';
  t.diagnostic(`Transforming ${sourcePath} with ${configFile}`);
  const transformed = await server.transformRequest(sourcePath);
  assert.ok(transformed, `Vite did not transform ${sourcePath}`);
  assert.match(transformed.code, /compiler-runtime/, 'React Compiler must inject its runtime');
  assert.match(transformed.code, /react\.memo_cache_sentinel/, 'React Compiler must emit memo caches for the component');

  // Vitest normally runs without React Compiler. Check the actual app transform:
  // memoizing a bound store hook would skip React hooks on subsequent renders.
  for (const [path, expectedCalls] of [
    ['/src/hooks/use-prune-hidden-catalog-threads.ts', 2],
    ['/src/hooks/use-state-string.ts', 1],
    ['/src/hooks/use-communities-stats.ts', 2],
    ['/src/views/board/board.tsx', 1],
  ]) {
    await t.test(`store subscriptions stay unconditional in ${path}`, async () => {
      const result = await server.transformRequest(path);
      assert.ok(result, `Vite did not transform ${path}`);
      const ast = parseSync(result.code, { configFile: false, babelrc: false });
      const storeHooks = new Set();
      traverse(ast, {
        ImportDeclaration(importPath) {
          if (importPath.node.source.value.includes('bitsocial-internals/stores')) {
            for (const specifier of importPath.node.specifiers) {
              storeHooks.add(specifier.local.name);
            }
          }
        },
      });
      let calls = 0;
      traverse(ast, {
        CallExpression(callPath) {
          if (callPath.node.callee.type !== 'Identifier' || !storeHooks.has(callPath.node.callee.name)) return;
          calls++;
          const statement = callPath.getStatementParent();
          assert.ok(
            statement.parentPath.isBlockStatement() && statement.parentPath.parentPath.isFunction(),
            `${callPath.node.callee.name} must run unconditionally in the compiled component or hook`,
          );
        },
      });
      assert.equal(calls, expectedCalls, 'Check every expected bound store hook call');
    });
  }
});
