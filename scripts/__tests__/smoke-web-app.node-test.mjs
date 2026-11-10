import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { setTimeout } from 'node:timers/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

const smokeScript = fileURLToPath(new URL('../smoke-web-app.js', import.meta.url));

// The smoke runner starts `node_modules/.bin/vite preview` from its working directory and
// launches Chrome through `playwright`. The fixture's vite is a stand-in whose behaviour the
// test selects, and `playwright` resolves to a stub whose launch fails, so no browser starts.
function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), 'smoke-web-app-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, 'build'));
  writeFileSync(path.join(root, 'build', 'index.html'), '<!doctype html>');
  const pidFile = path.join(root, 'preview.pid');
  const fakeVite = path.join(root, 'fake-vite.mjs');
  writeFileSync(
    fakeVite,
    `import { writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
writeFileSync(${JSON.stringify(pidFile)}, String(process.pid));
if (process.env.FAKE_PREVIEW === 'exit') process.exit(1);
process.on('SIGTERM', () => {});
createServer((request, response) => response.end('preview')).listen(Number(process.env.FAKE_PREVIEW_PORT), '127.0.0.1');
`,
  );
  mkdirSync(path.join(root, 'node_modules', '.bin'), { recursive: true });
  writeFileSync(path.join(root, 'node_modules', '.bin', 'vite'), `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(fakeVite)} "$@"\n`, {
    mode: 0o755,
  });
  const playwright = `data:text/javascript,${encodeURIComponent(
    "export const devices = { 'Pixel 7': {} }; export const chromium = { launch: async () => { throw new Error('browser launch reached'); } };",
  )}`;
  const hooks = path.join(root, 'stub-playwright.mjs');
  writeFileSync(
    hooks,
    `import { registerHooks } from 'node:module';
registerHooks({
  resolve: (specifier, context, nextResolve) => (specifier === 'playwright' ? { url: ${JSON.stringify(playwright)}, shortCircuit: true } : nextResolve(specifier, context)),
});
`,
  );
  return { root, pidFile, hooks };
}

async function freePort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  server.close();
  await once(server, 'close');
  return port;
}

// Resolves on exit rather than close: a preview left running keeps the inherited output pipes open.
async function runSmoke({ root, hooks }, port, mode) {
  const startedAt = Date.now();
  const child = spawn(process.execPath, ['--import', pathToFileURL(hooks).href, smokeScript, '--start-preview'], {
    cwd: root,
    env: { ...process.env, SMOKE_BASE_URL: `http://127.0.0.1:${port}/#/`, FAKE_PREVIEW: mode, FAKE_PREVIEW_PORT: String(port) },
  });
  let output = '';
  child.stdout.on('data', (chunk) => {
    output += chunk;
  });
  child.stderr.on('data', (chunk) => {
    output += chunk;
  });
  const [code] = await once(child, 'exit');
  return { code, output, seconds: (Date.now() - startedAt) / 1000 };
}

const isRunning = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

test('a preview that exits before it is ready fails the run right away', { timeout: 60_000 }, async (t) => {
  const context = fixture(t);
  const result = await runSmoke(context, await freePort(), 'exit');
  assert.notEqual(result.code, 0);
  assert.match(result.output, /Vite preview stopped \(exit code 1\) before http:\/\/127\.0\.0\.1:\d+\/ was ready/);
  assert.ok(result.seconds < 15, `took ${result.seconds}s`);
});

test('a server already answering at the preview URL is refused instead of tested', { timeout: 60_000 }, async (t) => {
  const context = fixture(t);
  const port = await freePort();
  const foreign = createServer((request, response) => response.end('another checkout'));
  foreign.listen(port, '127.0.0.1');
  await once(foreign, 'listening');
  t.after(() => foreign.close());
  const result = await runSmoke(context, port, 'exit');
  assert.notEqual(result.code, 0);
  assert.doesNotMatch(result.output, /browser launch reached/);
  assert.match(result.output, /already responds/);
  assert.equal(existsSync(context.pidFile), false);
});

test('a preview that ignores SIGTERM is force-killed', { timeout: 60_000 }, async (t) => {
  const context = fixture(t);
  const result = await runSmoke(context, await freePort(), 'serve');
  const pid = Number(readFileSync(context.pidFile, 'utf8'));
  t.after(() => {
    if (isRunning(pid)) process.kill(pid, 'SIGKILL');
  });
  assert.match(result.output, /browser launch reached/);
  for (let attempt = 0; attempt < 100 && isRunning(pid); attempt += 1) await setTimeout(20);
  assert.equal(isRunning(pid), false);
});
