import assert from 'node:assert/strict';
import populatedBoard from './scenarios/populated-board.mjs';
import populatedCatalog from './scenarios/populated-catalog.mjs';
import populatedReplies from './scenarios/populated-replies.mjs';
import replyDraft from './scenarios/reply-draft.mjs';

const settle = (page) => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

const prepare = async ({ page }) => {
  await page.addInitScript(() => {
    window.__PROFILING__ = true;
    localStorage.setItem('5chan-interface-language', 'en');
  });
};

// Count limits model the state changes in each action. Timing limits are deliberately generous
// smoke limits at 4x CPU, not latency targets; calibrate only against repeatable recorded evidence.
const inputBudget = (updates) => ({
  components: { CryptoAddressSettingContent: { minUpdates: updates, maxUpdates: updates } },
  maxCommits: 30,
  maxRenderMs: 1000,
  maxActionMs: 5000,
});

export default {
  targets: [
    {
      name: 'app',
      server: {
        command: ['corepack', 'yarn', 'exec', 'vite', '--host', '127.0.0.1', '--port', '{port}', '--strictPort'],
        env: { REACT_PERF_RUN: '1', PORTLESS: '0', BROWSER: 'none' },
      },
      scenarios: [
        populatedBoard,
        populatedCatalog,
        populatedReplies,
        replyDraft,
        {
          name: 'crypto-address-draft',
          path: '/#/subs/settings',
          prepare,
          async run({ page, measure }) {
            await page.locator('dialog[open]').waitFor();
            // Fresh accounts have no subscriptions: avoid live all-board lifecycle
            // updates behind the modal while exercising the same real controls.
            await page.getByText('You have not subscribed to any board yet.', { exact: true }).waitFor();
            const input = page.getByRole('textbox', { name: 'Crypto address', exact: true });
            if (!(await input.isVisible())) await page.locator('#account-settings > button').click();
            await input.waitFor();
            // The account selector is populated after local account initialization.
            await page.waitForFunction(() => {
              const accountSection = document.querySelector('#account-settings')?.nextElementSibling;
              return Boolean(accountSection?.querySelector('select option')?.value);
            });
            await input.fill('');
            await settle(page);
            await measure(
              'type-five-characters',
              async () => {
                await input.pressSequentially('Alice');
                assert.equal(await input.inputValue(), 'Alice');
              },
              inputBudget(5),
            );
            await measure(
              'clear-draft',
              async () => {
                await input.fill('');
                assert.equal(await input.inputValue(), '');
              },
              inputBudget(1),
            );
          },
        },
        {
          name: 'interface-checkbox',
          path: '/#/subs/settings',
          prepare,
          async run({ page, measure }) {
            await page.locator('dialog[open]').waitFor();
            // Fresh accounts have no subscriptions: avoid live all-board lifecycle
            // updates behind the modal while exercising the same real controls.
            await page.getByText('You have not subscribed to any board yet.', { exact: true }).waitFor();
            const checkbox = page.getByRole('checkbox', { name: /fit expanded images to screen/i });
            if (!(await checkbox.isVisible())) await page.locator('#interface-settings > button').click();
            await checkbox.waitFor();
            const initial = await checkbox.isChecked();
            await settle(page);
            const budget = {
              components: { InterfaceSettings: { minUpdates: 1, maxUpdates: 1 } },
              maxCommits: 30,
              maxRenderMs: 1000,
              maxActionMs: 5000,
            };
            await measure(
              'toggle-setting',
              async () => {
                await checkbox.setChecked(!initial);
                assert.equal(await checkbox.isChecked(), !initial);
              },
              budget,
            );
            await measure(
              'restore-setting',
              async () => {
                await checkbox.setChecked(initial);
                assert.equal(await checkbox.isChecked(), initial);
              },
              budget,
            );
          },
        },
        {
          name: 'populated-catalog-scroll',
          path: '/?e2e=pretext-benchmark&surface=catalog&variant=production&mode=dom&count=80&seed=123',
          async prepare(context) {
            await prepare(context);
            // Existing benchmark fixtures use example.com media. Serve deterministic local bytes.
            await context.page.route('https://example.com/**', (route) =>
              route.fulfill({
                status: 200,
                contentType: 'image/svg+xml',
                body: '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="120"><rect width="160" height="120" fill="#777"/></svg>',
              }),
            );
          },
          async run({ page, measure }) {
            await page.waitForFunction(() => typeof window.__PRETEXT_BENCH__?.runScenario === 'function');
            await page.locator('[data-pretext-height]').first().waitFor();
            // Account creation updates every mounted post's hide/menu controls.
            // Finish initialization before capturing a warmed scroll traversal.
            await page.waitForFunction(async () => {
              const { accountsStore } = await import('/src/lib/bitsocial-internals/stores.ts');
              const state = accountsStore.getState();
              return (
                !window.BITSOCIAL_REACT_HOOKS_ACCOUNTS_STORE_INITIALIZING &&
                state.accountIds.includes(state.activeAccountId) &&
                Boolean(state.accounts[state.activeAccountId] && state.accountsCommentsReplies[state.activeAccountId])
              );
            });
            // Warm the existing real CatalogRow/virtualizer path before measuring another traversal.
            const warmup = await page.evaluate(() => window.__PRETEXT_BENCH__.runScenario());
            assert.ok(warmup.itemCount > 0 && warmup.renderedItems > 0, 'Catalog fixture must contain rendered content');
            await settle(page);
            await measure(
              'scroll-populated-catalog',
              async () => {
                const result = await page.evaluate(() => window.__PRETEXT_BENCH__.runScenario());
                assert.equal(result.surface, 'catalog');
                assert.equal(result.variant, 'production');
                assert.ok(result.itemCount > 0 && result.renderedItems > 0, 'Scrolling must retain populated catalog rows');
              },
              {
                components: {
                  Harness: { minUpdates: 1, maxUpdates: 1 },
                  // Three fixed-fixture samples mounted/updated 73 menus and
                  // mounted 20 media components with 40 updates. Allow viewport
                  // variation up to the 80-post fixture, not repeated row churn.
                  PostMenuDesktop: { minMounts: 1, maxMounts: 80, maxUpdates: 80 },
                  CatalogPostMedia: { minMounts: 1, maxMounts: 24, maxUpdates: 48 },
                },
                // Virtualization mounts rows on demand. This bounds runaway commits, while JSON/trace
                // retain per-instance evidence; local input scenarios provide exact update gates.
                maxCommits: 160,
                maxRenderMs: 3000,
                maxActionMs: 20000,
              },
            );
          },
        },
      ],
    },
  ],
};
