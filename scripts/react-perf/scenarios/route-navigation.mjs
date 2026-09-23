import assert from 'node:assert/strict';

// Broad route-shell coverage complements the deterministic populated post fixtures.
// Live peer-backed pages can remain loading; record that state rather than treating it as loaded content.
const routes = [
  ['home', '/', 'Home'],
  ['faq', '/faq', 'FAQ'],
  ['rules', '/rules', 'Rules'],
  ['pass', '/pass', 'Pass'],
  ['blotter', '/blotter', 'Blotter'],
  ['subscriptions', '/subs', 'Board'],
  ['subscriptions-catalog', '/subs/catalog', 'Catalog'],
  ['moderated-feed', '/mod', 'Board'],
  ['moderated-catalog', '/mod/catalog', 'Catalog'],
  ['moderation-queue', '/mod/queue', 'ModEmptyState'],
  ['search-posts', '/search', 'Search'],
  ['search-catalog', '/search/catalog', 'Search'],
  ['search-directory', '/search/directory', 'SearchDirectory'],
  ['all-feed', '/all', 'Board'],
  ['all-catalog', '/all/catalog', 'Catalog'],
  ['board', '/g', 'Board'],
  ['board-catalog', '/g/catalog', 'Catalog'],
  ['archive', '/g/archive', 'Archive'],
  ['directory', '/g/directory', 'Directory'],
  ['pending-empty', '/pending/0', 'PendingPost'],
  ['not-allowed', '/not-allowed', 'NotAllowed'],
  ['not-found', '/not-found', 'NotFound'],
  ['account-editor-warning', '/settings/account-data', 'AccountDataEditor'],
];

// Keep traced sweeps bounded; each group starts in a fresh browser context.
export const createRouteNavigationScenario = (group) => ({
  name: `route-family-navigation-${group + 1}`,
  path: '/#/subs',
  async prepare({ page }) {
    await page.addInitScript(() => localStorage.setItem('5chan-interface-language', 'en'));
  },
  async run({ page, origin, measure }) {
    await page.getByText('You have not subscribed to any board yet.', { exact: true }).waitFor();
    for (const [name, route, component] of routes.slice(group * 8, (group + 1) * 8)) {
      const phase = await measure(
        `navigate-${name}`,
        async () => {
          await page.goto(`${origin}/#${route}`);
          await page.waitForFunction((expected) => window.__REACT_PERF__.snapshot().events.some((event) => event.name === expected), component);
          assert.ok(await page.locator('#root').count());
        },
        { components: { [component]: { maxUpdates: 500 } }, maxCommits: 500, maxRenderMs: 20000, maxActionMs: 30000 },
      );
      phase.evidence = await page.evaluate(() => ({
        hash: location.hash,
        text: document.querySelector('#root')?.innerText?.slice(0, 1600),
        threadLinks: document.querySelectorAll('a[href*="/thread/"]').length,
        visibleThreadLinks: Array.from(document.querySelectorAll('a[href*="/thread/"]')).filter((link) => {
          const rect = link.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight;
        }).length,
        documentHeight: document.documentElement.scrollHeight,
        coverage: 'route mount; live peer content may still be loading; account editor warning only; moderation/pending empty states',
      }));
    }
  },
});

export default createRouteNavigationScenario(0);
