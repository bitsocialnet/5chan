import { spawn } from 'node:child_process';
import { join } from 'node:path';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';

const PAGE_TIMEOUT_MS = 30_000;
const SERVER_TIMEOUT_MS = 60_000;
const HARNESS_URL =
  process.env.THREAD_AUTO_UPDATE_E2E_URL ||
  `http://${process.env.THREAD_AUTO_UPDATE_E2E_HOST || '127.0.0.1'}:${process.env.THREAD_AUTO_UPDATE_E2E_PORT || '4174'}/?e2e=thread-auto-update`;
const harnessOrigin = new URL(HARNESS_URL);
const DEV_HOST = harnessOrigin.hostname;
const DEV_PORT = harnessOrigin.port || (harnessOrigin.protocol === 'https:' ? '443' : '80');
const shouldStartDevServer = process.argv.includes('--start-dev');
const viteCommand = process.platform === 'win32' ? 'vite.cmd' : 'vite';
const viteBin = join(process.cwd(), 'node_modules', '.bin', viteCommand);

const scenarios = [
  {
    name: 'desktop',
    replySelector: '[class*="replyDesktop"]',
    markedBoxSelector: '[class*="replyDesktop"] > [class*="reply"]',
    contextOptions: {
      viewport: { width: 1440, height: 960 },
    },
  },
  {
    name: 'mobile',
    replySelector: '[class*="replyMobile"]',
    markedBoxSelector: '[class*="replyMobile"] [class*="replyContainer"]',
    contextOptions: {
      viewport: { width: 375, height: 812 },
      isMobile: true,
      hasTouch: true,
    },
  },
];
// The harness refresh takes 300ms and the updater waits 500ms for replies to render.
const UPDATE_SETTLE_MS = 800;

let devServerProcess = null;
let devServerShutdownRequested = false;

const cleanupDevServer = async () => {
  if (!devServerProcess || devServerProcess.exitCode !== null || devServerProcess.killed) {
    return;
  }

  devServerShutdownRequested = true;
  devServerProcess.kill('SIGTERM');

  const exited = await Promise.race([
    new Promise((resolve) => {
      devServerProcess?.once('exit', () => resolve(true));
    }),
    delay(5_000).then(() => false),
  ]);

  if (!exited && devServerProcess && devServerProcess.exitCode === null && !devServerProcess.killed) {
    devServerProcess.kill('SIGKILL');
  }
};

const registerSignalHandlers = () => {
  const handleSignal = async (signal) => {
    await cleanupDevServer();
    process.exit(signal === 'SIGINT' ? 130 : 143);
  };

  process.once('SIGINT', handleSignal);
  process.once('SIGTERM', handleSignal);
};

const startDevServer = async () => {
  devServerProcess = spawn(viteBin, ['--host', DEV_HOST, '--port', DEV_PORT, '--strictPort'], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
  });

  if (!devServerProcess.pid) {
    throw new Error('Failed to start the dev server');
  }

  devServerProcess.once('exit', (code) => {
    if (!devServerShutdownRequested && code !== 0 && code !== null) {
      console.error(`Dev server exited early with code ${code}`);
    }
  });
};

const waitForServer = async (timeoutMs = SERVER_TIMEOUT_MS) => {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(HARNESS_URL, { redirect: 'manual' });
      if (response.ok || response.status === 304) {
        return;
      }
    } catch {
      // Keep polling until timeout.
    }

    await delay(500);
  }

  throw new Error(`Timed out waiting for ${HARNESS_URL}`);
};

const getStatusText = (page) => page.evaluate(() => document.querySelector('[data-testid="thread-update-status"]')?.textContent?.trim() ?? '');

const expectStatus = async (page, scenario, expected) => {
  try {
    await page.waitForFunction((text) => (document.querySelector('[data-testid="thread-update-status"]')?.textContent?.trim() ?? '') === text, expected, {
      timeout: 5_000,
    });
  } catch {
    throw new Error(`[${scenario.name}] expected status "${expected}", got "${await getStatusText(page)}"`);
  }
};

const expectEqual = (scenario, label, actual, expected) => {
  if (actual !== expected) {
    throw new Error(`[${scenario.name}] expected ${label} to be ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
};

const readThreadState = (page, { markedBoxSelector, replySelector }) =>
  page.evaluate(
    ({ markedBoxSelector, replySelector }) => {
      const marker = document.querySelector('[class*="newPostsMarker"]');
      const markedReply = marker?.querySelector('[data-cid]');
      const markedBox = marker?.querySelector(markedBoxSelector);
      const favicon = document.querySelector('link[rel="icon"][sizes="16x16"]');
      return {
        favicon: favicon?.getAttribute('href') ?? '',
        markerCount: document.querySelectorAll('[class*="newPostsMarker"]').length,
        markedReplyCid: markedReply?.getAttribute('data-cid') ?? null,
        markerShadow: markedBox ? getComputedStyle(markedBox).boxShadow : null,
        renderedReplies: document.querySelectorAll(replySelector).length,
        title: document.title,
      };
    },
    { markedBoxSelector, replySelector },
  );

const runScenario = async (browser, scenario) => {
  const context = await browser.newContext(scenario.contextOptions);
  const page = await context.newPage();
  const pageErrors = [];
  const consoleErrors = [];

  page.on('pageerror', (error) => pageErrors.push(error));
  page.on('crash', () => pageErrors.push(new Error('Page crashed')));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });

  try {
    await page.clock.install();
    await page.goto(HARNESS_URL, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT_MS });
    await page.getByRole('heading', { name: 'Thread Auto Update E2E' }).waitFor({ timeout: PAGE_TIMEOUT_MS });
    await page.waitForFunction((selector) => document.querySelectorAll(selector).length === 30, scenario.replySelector, { timeout: PAGE_TIMEOUT_MS });
    // Translations load over HTTP; wait for the translated Update label.
    const controls = page.getByTestId('thread-controls');
    const autoCheckbox = controls.getByRole('checkbox', { exact: true, name: 'Auto' });
    const updateButton = controls.getByRole('button', { exact: true, name: 'Update' });
    await updateButton.waitFor({ timeout: PAGE_TIMEOUT_MS });
    const harness = (method, ...args) => page.evaluate(({ method, args }) => window.__THREAD_AUTO_UPDATE_E2E__[method](...args), { method, args });

    if (await autoCheckbox.isChecked()) {
      throw new Error(`[${scenario.name}] Auto should default to unchecked`);
    }
    await expectStatus(page, scenario, '');

    // Without Auto, new server replies stay hidden and nothing is fetched.
    await harness('addReplies', 2);
    await page.clock.runFor(30_000);
    expectEqual(scenario, 'rendered replies without Auto', (await readThreadState(page, scenario)).renderedReplies, 30);
    expectEqual(scenario, 'refreshes without Auto', await harness('getRefreshCount'), 0);

    // A manual update reports its result and leaves no unread marker.
    await updateButton.click();
    await expectStatus(page, scenario, 'Updating...');
    await page.clock.runFor(UPDATE_SETTLE_MS);
    await expectStatus(page, scenario, '2 new posts');
    let state = await readThreadState(page, scenario);
    expectEqual(scenario, 'rendered replies after Update', state.renderedReplies, 32);
    expectEqual(scenario, 'markers after Update', state.markerCount, 0);
    expectEqual(scenario, 'title after Update', state.title, 'Thread Auto Update E2E');

    // Auto counts down from 10.
    await page.evaluate(() => window.scrollTo(0, 0));
    await autoCheckbox.check();
    await expectStatus(page, scenario, '10');
    await page.clock.runFor(1_000);
    await expectStatus(page, scenario, '9');

    // New replies from an automatic update get the red line, the title count, and the favicon.
    await harness('addReplies', 3);
    await page.clock.runFor(9_000);
    await expectStatus(page, scenario, 'Updating...');
    await page.clock.runFor(UPDATE_SETTLE_MS);
    await expectStatus(page, scenario, '10');
    state = await readThreadState(page, scenario);
    expectEqual(scenario, 'rendered replies after Auto', state.renderedReplies, 35);
    expectEqual(scenario, 'markers after Auto', state.markerCount, 1);
    expectEqual(scenario, 'marked reply', state.markedReplyCid, 'reply-32');
    expectEqual(scenario, 'marker line', state.markerShadow, 'rgb(255, 0, 0) 0px 3px 0px 0px');
    expectEqual(scenario, 'title after Auto', state.title, '(3) Thread Auto Update E2E');
    if (!state.favicon.includes('favicon-newposts.ico')) {
      throw new Error(`[${scenario.name}] expected the new posts favicon, got ${state.favicon}`);
    }

    // An empty update waits one step longer.
    await page.clock.runFor(10_000);
    await expectStatus(page, scenario, 'Updating...');
    await page.clock.runFor(UPDATE_SETTLE_MS);
    await expectStatus(page, scenario, '15');

    // Reaching the bottom marks everything read.
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForFunction(() => !document.querySelector('[class*="newPostsMarker"]'), undefined, { timeout: 5_000 });
    state = await readThreadState(page, scenario);
    expectEqual(scenario, 'title after reading', state.title, 'Thread Auto Update E2E');
    if (!state.favicon.startsWith('/favicon.ico')) {
      throw new Error(`[${scenario.name}] expected the default favicon after reading, got ${state.favicon}`);
    }

    // Unchecking Auto stops updates again.
    await autoCheckbox.uncheck();
    await expectStatus(page, scenario, '');
    const refreshCount = await harness('getRefreshCount');
    await harness('addReplies', 1);
    await page.clock.runFor(60_000);
    expectEqual(scenario, 'rendered replies after unchecking Auto', (await readThreadState(page, scenario)).renderedReplies, 35);
    expectEqual(scenario, 'refreshes after unchecking Auto', await harness('getRefreshCount'), refreshCount);

    // A failed refresh reads as a connection error in red.
    await harness('setRefreshFails', true);
    await updateButton.click();
    await page.clock.runFor(UPDATE_SETTLE_MS);
    await expectStatus(page, scenario, 'Connection Error');
    const errorColor = await page.evaluate(() => getComputedStyle(document.querySelector('[data-testid="thread-update-status"] span')).color);
    expectEqual(scenario, 'connection error color', errorColor, 'rgb(255, 0, 0)');

    if (pageErrors.length > 0) {
      throw new Error(`[${scenario.name}] page errors:\n${pageErrors.map((error) => error.stack || error.message).join('\n\n')}`);
    }

    if (consoleErrors.length > 0) {
      throw new Error(`[${scenario.name}] console errors:\n${consoleErrors.join('\n\n')}`);
    }
  } finally {
    await context.close();
  }
};

const main = async () => {
  registerSignalHandlers();

  try {
    if (shouldStartDevServer) {
      const hasExistingServer = await waitForServer(3_000)
        .then(() => true)
        .catch(() => false);
      if (!hasExistingServer) await startDevServer();
      await waitForServer();
    }

    const browser = await chromium.launch({ headless: true });
    try {
      for (const scenario of scenarios) {
        console.log(`Running thread auto update e2e for ${scenario.name}...`);
        await runScenario(browser, scenario);
      }
    } finally {
      await browser.close();
    }

    console.log('Thread auto update e2e passed.');
  } finally {
    await cleanupDevServer();
  }
};

await main();
