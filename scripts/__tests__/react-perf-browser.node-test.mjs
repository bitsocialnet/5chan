import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { setTimeout } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

// withBrowser takes its browser through the repository's scripts/pw-session.sh and
// connects with the driver bundled by @playwright/cli. The fixture repository's
// wrapper only records its calls (and holds `open` while the hold file exists), and
// the driver is replaced by a fake browser whose close() fails the running callback,
// as disconnecting a real CDP client does. With `finishesWithoutBrowser`, the callback
// instead waits while the run-hold file exists without touching the browser, as a run
// does while it stops its app server.
function fixture(t, { finishesWithoutBrowser = false } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'react-perf-browser-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  execFileSync('git', ['init', '--quiet', root]);
  mkdirSync(path.join(root, 'scripts'));
  const calls = path.join(root, 'wrapper-calls.log');
  const hold = path.join(root, 'hold-open');
  const runHold = path.join(root, 'hold-run');
  writeFileSync(
    path.join(root, 'scripts', 'pw-session.sh'),
    `printf '%s\\n' "$1 $2" >>${JSON.stringify(calls)}
if [ "$1" = open ]; then while [ -e ${JSON.stringify(hold)} ]; do sleep 0.05; done; fi
exit 0
`,
  );
  const driver = path.join(root, 'fake-playwright.cjs');
  writeFileSync(
    driver,
    `exports.chromium = {
  connectOverCDP: async () => {
    // Stands in for the CDP socket, which keeps a connected process alive.
    const connection = setInterval(() => {}, 1000);
    let disconnect;
    const disconnected = new Promise((_, reject) => { disconnect = reject; });
    disconnected.catch(() => {});
    return {
      disconnected,
      close: async () => {
        clearInterval(connection);
        disconnect(new Error('Browser has been closed'));
      },
    };
  },
};
`,
  );
  const afterStart = finishesWithoutBrowser ? `while (existsSync(${JSON.stringify(runHold)})) await setTimeout(50);` : 'await browser.disconnected;';
  const script = `
import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { setTimeout } from 'node:timers/promises';
registerHooks({
  resolve: (specifier, context, nextResolve) =>
    specifier === 'playwright' ? { url: ${JSON.stringify(pathToFileURL(driver).href)}, shortCircuit: true } : nextResolve(specifier, context),
});
const { withBrowser } = await import(${JSON.stringify(new URL('../react-perf/browser.mjs', import.meta.url).href)});
await withBrowser(${JSON.stringify(root)}, false, async (browser) => {
  console.log('running');
  ${afterStart}
});
`;
  return { calls, hold, runHold, script };
}

function launch(t, script) {
  const child = spawn(process.execPath, ['--input-type=module', '-e', script]);
  t.after(() => child.kill('SIGKILL'));
  let output = '';
  child.stdout.on('data', (chunk) => {
    output += chunk;
  });
  child.stderr.on('data', (chunk) => {
    output += chunk;
  });
  const completed = new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code, signal) => resolve({ code, signal, output }));
  });
  return { child, completed, output: () => output };
}

async function waitUntil(predicate, description) {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    if (predicate()) return;
    await setTimeout(10);
  }
  assert.fail(`Timed out waiting for ${description}`);
}

const wrapperCalls = (calls) => readFileSync(calls, 'utf8').trim().split('\n');

// SIGHUP comes from a closed terminal, or from agent:verify forwarding one to its command.
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  test(`${signal} during a run still closes the exact browser session`, async (t) => {
    const { calls, script } = fixture(t);
    const run = launch(t, script);
    await waitUntil(() => run.output().includes('running'), 'the browser callback');
    run.child.kill(signal);
    const result = await run.completed;
    const [opened, closed, ...rest] = wrapperCalls(calls);
    assert.match(opened, /^open perf-\d+-/);
    // Without this close the pw-session browser outlives the process and keeps the machine-wide slot.
    assert.equal(closed, opened.replace('open', 'close'));
    assert.deepEqual(rest, []);
    assert.notEqual(result.code, 0);
    assert.match(result.output, new RegExp(`${signal}: closing browser session perf-`));
  });
}

test('a hangup after the terminal is gone still closes the exact browser session', async (t) => {
  const { calls, script } = fixture(t);
  const run = launch(t, script);
  await waitUntil(() => run.output().includes('running'), 'the browser callback');
  // A closed terminal fails every later write, as a pipe without a reader does here.
  run.child.stderr.destroy();
  run.child.kill('SIGHUP');
  await run.completed;
  const [opened, closed] = wrapperCalls(calls);
  assert.equal(closed, opened.replace('open', 'close'));
});

test('a signal while the browser is opening skips the run and closes the session', async (t) => {
  const { calls, hold, script } = fixture(t);
  writeFileSync(hold, '');
  const run = launch(t, script);
  await waitUntil(() => existsSync(calls), 'the wrapper open');
  run.child.kill('SIGTERM');
  await waitUntil(() => run.output().includes('closing browser session'), 'the signal handler');
  rmSync(hold);
  const result = await run.completed;
  const [opened, closed] = wrapperCalls(calls);
  assert.equal(closed, opened.replace('open', 'close'));
  assert.doesNotMatch(result.output, /running/);
  assert.notEqual(result.code, 0);
  assert.match(result.output, /Interrupted by SIGTERM/);
});

test('a signal after the run stopped using the browser still fails the run', async (t) => {
  const { calls, runHold, script } = fixture(t, { finishesWithoutBrowser: true });
  writeFileSync(runHold, '');
  const run = launch(t, script);
  await waitUntil(() => run.output().includes('running'), 'the browser callback');
  run.child.kill('SIGINT');
  await waitUntil(() => run.output().includes('closing browser session'), 'the signal handler');
  rmSync(runHold);
  const result = await run.completed;
  const [opened, closed] = wrapperCalls(calls);
  assert.equal(closed, opened.replace('open', 'close'));
  assert.notEqual(result.code, 0);
  assert.match(result.output, /Interrupted by SIGINT/);
});
