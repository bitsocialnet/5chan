import assert from 'node:assert/strict';
import { waitForAccountReady } from './account-ready.mjs';

const settle = (page) => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const makePost = (archived) => ({
  archived: Number(archived),
  author_address: null,
  author_name: 'Anonymous',
  cid: archived ? 'search-fixture-archived' : 'search-fixture-active',
  community_address: 'search-fixture.bso',
  content: archived ? 'Preserved fixture discussion.' : 'Open fixture discussion.',
  deleted: 0,
  depth: 0,
  indexed_at: 1700000100,
  parent_cid: null,
  post_cid: archived ? 'search-fixture-archived' : 'search-fixture-active',
  removed: 0,
  reply_count: 0,
  timestamp: 1700000000,
  title: archived ? 'Archived fixture thread' : 'Active fixture thread',
});

const budget = {
  components: { Search: { minUpdates: 1, maxUpdates: 12 }, SearchResults: { minMounts: 1, maxUpdates: 12 } },
  maxCommits: 40,
  maxRenderMs: 1500,
  maxActionMs: 10000,
};

export default {
  name: 'search-post-status',
  path: '/#/search?q=fixture',
  async prepare({ page }) {
    await page.addInitScript(() => {
      window.__PROFILING__ = true;
      localStorage.setItem('5chan-interface-language', 'en');
    });
    await page.route('https://api.5archive.org/api/communities', (route) => route.fulfill({ json: { communities: [] } }));
    await page.route('https://api.5archive.org/api/search?*', (route) => {
      const params = new URL(route.request().url()).searchParams;
      const status = params.get('status');
      assert.ok(['active', 'archived', 'all'].includes(status), 'Every search must request an explicit status');
      const posts = [makePost(false), makePost(true)].filter((post) => status === 'all' || Boolean(post.archived) === (status === 'archived'));
      return route.fulfill({ json: { query: params.get('q'), page: 1, limit: 25, total: posts.length, posts } });
    });
  },
  async run({ page, measure }) {
    const select = page.locator('select[aria-label="Posts"]:visible').first();
    const activeThread = page.getByText('Active fixture thread', { exact: true }).first();
    const archivedThread = page.getByText('Archived fixture thread', { exact: true }).first();
    await activeThread.waitFor();
    await waitForAccountReady(page);
    assert.equal(await select.inputValue(), 'active');
    assert.equal(await archivedThread.count(), 0);
    await settle(page);

    for (const status of ['archived', 'all', 'active']) {
      await measure(
        `select-${status}`,
        async () => {
          await select.selectOption(status);
          await (status === 'archived' ? archivedThread : activeThread).waitFor();
          await settle(page);
          assert.equal(await select.inputValue(), status);
          assert.equal(await activeThread.count() > 0, status !== 'archived');
          assert.equal(await archivedThread.count() > 0, status !== 'active');
          const params = new URLSearchParams(new URL(page.url()).hash.split('?')[1]);
          assert.equal(params.get('status') ?? 'active', status);
          assert.equal(params.get('page'), null);
        },
        budget,
      );
    }
  },
};
