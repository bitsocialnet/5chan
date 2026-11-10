import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { setTimeout } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const startDev = fileURLToPath(new URL('../start-dev.js', import.meta.url));

const isRunning = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

async function waitUntil(predicate, description) {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    if (predicate()) return;
    await setTimeout(10);
  }
  assert.fail(`Timed out waiting for ${description}`);
}

// With PORTLESS=0, `yarn start` runs `node_modules/.bin/vite` from its working directory; here
// that is a stand-in which records its PID and serves until it is signalled.
for (const signal of ['SIGTERM', 'SIGINT']) {
  test(`${signal} sent to the yarn start launcher alone also stops its server`, { timeout: 30_000 }, async (t) => {
    const root = mkdtempSync(path.join(tmpdir(), 'local-server-utils-test-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const pidFile = path.join(root, 'server.pid');
    const fakeVite = path.join(root, 'fake-vite.mjs');
    writeFileSync(fakeVite, `import { writeFileSync } from 'node:fs';\nwriteFileSync(${JSON.stringify(pidFile)}, String(process.pid));\nsetInterval(() => {}, 1000);\n`);
    mkdirSync(path.join(root, 'node_modules', '.bin'), { recursive: true });
    writeFileSync(path.join(root, 'node_modules', '.bin', 'vite'), `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(fakeVite)} "$@"\n`, {
      mode: 0o755,
    });
    const probe = createServer().listen(0);
    await once(probe, 'listening');
    const { port } = probe.address();
    probe.close();
    await once(probe, 'close');

    const launcher = spawn(process.execPath, [startDev], {
      cwd: root,
      env: { ...process.env, PORTLESS: '0', PORT: String(port), BROWSER: 'none' },
      stdio: 'ignore',
    });
    const exited = once(launcher, 'exit');
    t.after(() => launcher.kill('SIGKILL'));
    await waitUntil(() => existsSync(pidFile) && readFileSync(pidFile, 'utf8'), 'the server to start');
    const pid = Number(readFileSync(pidFile, 'utf8'));
    t.after(() => {
      if (isRunning(pid)) process.kill(pid, 'SIGKILL');
    });

    launcher.kill(signal);
    const [, launcherSignal] = await exited;
    for (let attempt = 0; attempt < 100 && isRunning(pid); attempt += 1) await setTimeout(20);
    // An orphaned server keeps serving and keeps its Portless route, so the next start gets a `-2` name.
    assert.equal(isRunning(pid), false);
    assert.equal(launcherSignal, signal);
  });
}
