import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { setTimeout } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const e2eScript = fileURLToPath(new URL('../run-thread-auto-update-e2e.mjs', import.meta.url));

const isRunning = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

// With --start-dev the runner starts `node_modules/.bin/vite` from its working directory, then
// takes a browser through that repository's scripts/pw-session.sh. Here the dev server is a
// stand-in that ignores SIGTERM, and the wrapper reports a busy slot so no browser starts.
test('a dev server that ignores SIGTERM is force-killed', { timeout: 60_000 }, async (t) => {
  const root = mkdtempSync(path.join(tmpdir(), 'thread-auto-update-e2e-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  execFileSync('git', ['init', '--quiet', root]);
  mkdirSync(path.join(root, 'scripts'));
  writeFileSync(path.join(root, 'scripts', 'pw-session.sh'), 'exit 75\n');
  const pidFile = path.join(root, 'dev-server.pid');
  const fakeVite = path.join(root, 'fake-vite.mjs');
  writeFileSync(
    fakeVite,
    `import { writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
writeFileSync(${JSON.stringify(pidFile)}, String(process.pid));
process.on('SIGTERM', () => {});
createServer((request, response) => response.end('harness')).listen(Number(process.env.THREAD_AUTO_UPDATE_E2E_PORT), '127.0.0.1');
`,
  );
  mkdirSync(path.join(root, 'node_modules', '.bin'), { recursive: true });
  writeFileSync(path.join(root, 'node_modules', '.bin', 'vite'), `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(fakeVite)} "$@"\n`, {
    mode: 0o755,
  });
  const probe = createServer().listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const { port } = probe.address();
  probe.close();
  await once(probe, 'close');

  const child = spawn(process.execPath, [e2eScript, '--start-dev'], {
    cwd: root,
    env: { ...process.env, THREAD_AUTO_UPDATE_E2E_HOST: '127.0.0.1', THREAD_AUTO_UPDATE_E2E_PORT: String(port) },
  });
  let output = '';
  child.stdout.on('data', (chunk) => {
    output += chunk;
  });
  child.stderr.on('data', (chunk) => {
    output += chunk;
  });
  // Resolves on exit rather than close: a dev server left running keeps the inherited output pipes open.
  const [code] = await once(child, 'exit');
  const pid = Number(readFileSync(pidFile, 'utf8'));
  t.after(() => {
    if (isRunning(pid)) process.kill(pid, 'SIGKILL');
  });
  assert.notEqual(code, 0);
  assert.match(output, /Browser slot busy/);
  for (let attempt = 0; attempt < 100 && isRunning(pid); attempt += 1) await setTimeout(20);
  assert.equal(isRunning(pid), false);
});
