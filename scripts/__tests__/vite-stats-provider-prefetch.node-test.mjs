import assert from 'node:assert/strict';
import test from 'node:test';
import { createStatsProviderPrefetchTags, STATS_PREFETCH_DATA_ID, STATS_PREFETCH_SCRIPT } from '../vite-stats-provider-prefetch.mjs';

const URLS = ['https://stats.example/api/v1/5chan/stats', 'https://stats.example/api/v1/5chan/boards'];
const OPTIONS = { urls: URLS, timeoutMs: 15000, pureP2PStorageKey: '5chan-pure-p2p-stats' };

const runScript = (hash, storage = {}) => {
  const window = {};
  const requests = [];
  const document = { getElementById: (id) => (id === STATS_PREFETCH_DATA_ID ? { textContent: JSON.stringify(OPTIONS) } : null) };
  const localStorage = { getItem: (key) => storage[key] ?? null };
  const AbortSignal = { timeout: (ms) => ({ timeoutMs: ms }) };
  const fetch = (url, init) => {
    requests.push({ url, accept: init.headers.Accept, timeoutMs: init.signal.timeoutMs });
    return Promise.resolve(`response for ${url}`);
  };
  new Function('window', 'location', 'document', 'localStorage', 'AbortSignal', 'fetch', STATS_PREFETCH_SCRIPT)(
    window,
    { hash },
    document,
    localStorage,
    AbortSignal,
    fetch,
  );
  return { prefetch: window.__FIVECHAN_STATS_PREFETCH__, requests };
};

test('puts the settings block before the script, first in <head>', () => {
  const [data, script] = createStatsProviderPrefetchTags(OPTIONS);
  assert.deepEqual(data.attrs, { type: 'application/json', id: STATS_PREFETCH_DATA_ID });
  assert.deepEqual(JSON.parse(data.children), OPTIONS);
  assert.equal(script.children, STATS_PREFETCH_SCRIPT);
  assert.deepEqual([data.injectTo, script.injectTo], ['head-prepend', 'head-prepend']);
});

test('requests the snapshots on the home page and hands the responses to the app by URL', async () => {
  for (const hash of ['', '#', '#/', '#/?lang=de']) {
    const { prefetch, requests } = runScript(hash);
    assert.deepEqual(
      requests,
      URLS.map((url) => ({ url, accept: 'application/json', timeoutMs: OPTIONS.timeoutMs })),
      hash,
    );
    assert.deepEqual(Object.keys(prefetch), URLS, hash);
    for (const url of URLS) {
      assert.equal(await prefetch[url], `response for ${url}`, hash);
    }
  }
});

test('requests nothing on other routes or for visitors who chose pure P2P stats', () => {
  for (const hash of ['#/biz', '#/biz/catalog', '#/faq', '#/all']) {
    assert.deepEqual(runScript(hash), { prefetch: undefined, requests: [] }, hash);
  }
  assert.deepEqual(runScript('#/', { '5chan-pure-p2p-stats': 'true' }), { prefetch: undefined, requests: [] });
});
