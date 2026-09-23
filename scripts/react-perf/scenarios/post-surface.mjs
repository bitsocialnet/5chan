import assert from 'node:assert/strict';

const COUNT = 80;
const SEED = 123;
const DISTANCE = 1200;
const STEP = 200;
const ROW_SELECTOR = '[data-item-index]';
const settle = (page) => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

// These are capture smoke limits, not calibrated regression thresholds. Component
// names select the runner's readiness check; zero committed updates is valid after
// an unrelated store update has been isolated from the rendered rows.
const budget = (scroll) => ({
  components: Object.fromEntries(
    ['PostDesktop', 'PostMobile', 'ReplyDesktop', 'ReplyMobile', 'CatalogRow', 'CatalogPost', 'PostMenuDesktop', 'PostMenuMobile'].map((name) => [
      name,
      { maxUpdates: scroll ? 1000 : 500 },
    ]),
  ),
  maxCommits: scroll ? 160 : 80,
  maxRenderMs: scroll ? 5000 : 3000,
  maxActionMs: scroll ? 20000 : 10000,
});

const geometry = (page) =>
  page.evaluate((selector) => {
    const rows = Array.from(document.querySelectorAll(selector), (element) => {
      const rect = element.getBoundingClientRect();
      const text = element.textContent || '';
      let textHash = 2166136261;
      for (let index = 0; index < text.length; index += 1) textHash = Math.imul(textHash ^ text.charCodeAt(index), 16777619);
      return {
        index: Number(element.getAttribute('data-item-index')),
        top: rect.top,
        height: rect.height,
        textLength: text.length,
        textHash: textHash >>> 0,
        visible: rect.bottom > 0 && rect.top < innerHeight && rect.width > 0 && rect.height > 0,
      };
    });
    return {
      scrollY,
      scrollHeight: document.documentElement.scrollHeight,
      viewport: { width: innerWidth, height: innerHeight },
      renderedRows: rows.length,
      visiblePopulatedRows: rows.filter((row) => row.visible && row.textLength > 0).length,
      rows,
    };
  }, ROW_SELECTOR);

function assertPopulated(state) {
  assert.ok(state.renderedRows > 0 && state.visiblePopulatedRows > 0, 'Capture must contain visible populated virtualized rows');
}

async function restoreAccountState(page) {
  await page.evaluate(() => {
    const state = window.__POST_SURFACE_PERF__;
    if (!state?.restore) return;
    state.store.setState(state.restore);
    state.restore = null;
  });
  await settle(page);
}

async function measureAccountUpdate(page, measure, field, surface) {
  let evidence;
  try {
    const phase = await measure(
      `unrelated-account-${field}-update`,
      async () => {
        const before = await geometry(page);
        assertPopulated(before);
        const mutation = await page.evaluate((field) => {
          const capture = window.__POST_SURFACE_PERF__;
          const state = capture.store.getState();
          const id = state.activeAccountId;
          const account = state.accounts[id];
          if (!account || capture.restore) throw new Error('Account update requires an initialized account and no pending restoration');
          if (field === 'notifications') {
            const cid = 'react-perf-unrelated-notification';
            const original = state.accountsCommentsReplies[id];
            if (!original || Object.hasOwn(original, cid)) throw new Error('Expected initialized notification state without a capture fixture');
            capture.restore = { accountsCommentsReplies: state.accountsCommentsReplies };
            capture.store.setState({
              accountsCommentsReplies: {
                ...state.accountsCommentsReplies,
                [id]: {
                  ...original,
                  [cid]: {
                    cid,
                    parentCid: 'react-perf-unrelated-parent',
                    postCid: 'react-perf-unrelated-thread',
                    communityAddress: 'react-perf-unrelated.eth',
                    author: { address: 'react-perf-unrelated-author' },
                    content: 'Unrelated read notification for an in-memory subscription capture.',
                    timestamp: 1700000000,
                    markedAsRead: true,
                  },
                },
              },
            });
            return { field: 'accountsCommentsReplies', addedReadNotifications: 1, accountObjectPreserved: capture.store.getState().accounts[id] === account };
          }
          if (!account.pkcOptions || typeof account.pkcOptions !== 'object') throw new Error('Expected initialized account protocol options');
          // Equivalent option values model a replaced account record without
          // recreating the protocol client or changing any transport setting.
          capture.restore = { accounts: state.accounts };
          capture.store.setState({ accounts: { ...state.accounts, [id]: { ...account, pkcOptions: { ...account.pkcOptions } } } });
          return {
            field: 'accounts[activeAccountId].pkcOptions',
            equivalentValues: true,
            protocolClientPreserved: capture.store.getState().accounts[id].pkc === account.pkc,
          };
        }, field);
        await settle(page);
        const after = await geometry(page);
        assertPopulated(after);
        assert.deepEqual(after, before, 'Unrelated account updates must preserve rendered content and geometry');
        evidence = { mutation, before, after };
      },
      { ...budget(false), ...(surface === 'catalog' ? { maxCommits: 0 } : {}) },
    );
    phase.evidence = evidence;
  } finally {
    await restoreAccountState(page);
  }
}

async function scrollPath(page, startY) {
  const points = [await geometry(page)];
  const offsets = [];
  for (let offset = STEP; offset <= DISTANCE; offset += STEP) offsets.push(offset);
  for (let offset = DISTANCE - STEP; offset >= 0; offset -= STEP) offsets.push(offset);
  const started = performance.now();
  for (const offset of offsets) {
    const targetY = startY + offset;
    await page.evaluate((top) => window.scrollTo({ top, behavior: 'instant' }), targetY);
    await settle(page);
    const point = await geometry(page);
    assert.ok(Math.abs(point.scrollY - targetY) <= 1, `Expected scroll offset ${targetY}, observed ${point.scrollY}; fixed-distance capture was clamped`);
    assertPopulated(point);
    points.push(point);
  }
  const traveledPx = points.slice(1).reduce((distance, point, index) => distance + Math.abs(point.scrollY - points[index].scrollY), 0);
  assert.equal(traveledPx, DISTANCE * 2, 'Capture must travel the same distance in every sample');
  return { requestedOneWayPx: DISTANCE, requestedStepPx: STEP, traveledPx, durationMs: performance.now() - started, points };
}

export function createPostSurfaceScenario(surface) {
  assert.ok(['board', 'catalog', 'replies'].includes(surface), `Unknown post surface: ${surface}`);
  return {
    name: `populated-${surface}-account-and-scroll`,
    // item-size matches the production desktop board, catalog, and reply defaults.
    path: `/?e2e=pretext-benchmark&surface=${surface}&variant=production&mode=item-size&count=${COUNT}&seed=${SEED}`,
    async prepare({ page }) {
      await page.addInitScript(() => {
        window.__PROFILING__ = true;
        localStorage.setItem('5chan-interface-language', 'en');
      });
      await page.route('https://example.com/**', (route) =>
        route.fulfill({
          status: 200,
          contentType: 'image/svg+xml',
          body: '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="120"><rect width="160" height="120" fill="#777"/></svg>',
        }),
      );
    },
    async run({ page, measure }) {
      await page.waitForFunction(() => typeof window.__PRETEXT_BENCH__?.runScenario === 'function');
      await page.locator(ROW_SELECTOR).first().waitFor();
      await page.evaluate(async () => {
        // This approved source adapter requires a Vite development server.
        const { accountsStore } = await import('/src/lib/bitsocial-internals/stores.ts');
        window.__POST_SURFACE_PERF__ = { store: accountsStore, restore: null };
        await document.fonts.ready;
      });
      try {
        await page.waitForFunction(() => {
          const state = window.__POST_SURFACE_PERF__.store.getState();
          return (
            !window.BITSOCIAL_REACT_HOOKS_ACCOUNTS_STORE_INITIALIZING &&
            state.accountIds.includes(state.activeAccountId) &&
            Boolean(state.accounts[state.activeAccountId] && state.accountsCommentsReplies[state.activeAccountId])
          );
        });
        const summary = await page.getByTestId('bench-summary').innerText();
        assert.ok(summary.includes(`surface: ${surface}`) && summary.includes('variant: production') && summary.includes('mode: item-size'));
        const startY = await page
          .locator(ROW_SELECTOR)
          .first()
          .evaluate((element) => Math.round(element.getBoundingClientRect().top + scrollY));
        await page.evaluate((top) => window.scrollTo({ top, behavior: 'instant' }), startY);
        await settle(page);
        // Warm exactly the path that will be measured, including fixture media and
        // row mounts; the harness's full variable-distance run is never invoked.
        await scrollPath(page, startY);
        await page.waitForFunction(() => Array.from(document.querySelectorAll('img')).every((image) => image.complete));
        await settle(page);
        const ready = await geometry(page);
        assertPopulated(ready);
        await measureAccountUpdate(page, measure, 'notifications', surface);
        await measureAccountUpdate(page, measure, 'options', surface);
        let scrollEvidence;
        const scrollPhase = await measure(
          `scroll-populated-${surface}-fixed-distance`,
          async () => {
            scrollEvidence = await scrollPath(page, startY);
          },
          budget(true),
        );
        scrollPhase.evidence = {
          fixture: { surface, variant: 'production', mode: 'item-size', count: COUNT, seed: SEED },
          ready,
          ...scrollEvidence,
          timingScope: 'Warm populated traversal including automation round trips, two animation frames and geometry reads per step; not input-to-paint latency.',
        };
      } finally {
        await restoreAccountState(page);
        await page.evaluate(() => delete window.__POST_SURFACE_PERF__);
      }
    },
  };
}
