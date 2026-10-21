// Start the home page's stats provider request from index.html.
//
// The popular threads and stats boxes read one snapshot from the first stats provider. Requested when
// the boxes first render, it arrived after the home page was on screen. This script starts it while
// the app's code downloads, and src/lib/stats-provider-snapshot.ts takes over the response. It skips
// every route but the home page, and visitors who chose pure P2P stats, who must not contact a
// provider. Its hash is listed in vercel.json's script-src, so its settings live in a JSON block.

export const STATS_PREFETCH_DATA_ID = 'fivechan-stats-prefetch';

export const STATS_PREFETCH_SCRIPT = `(function () {
  try {
    var path = location.hash.replace(/^#/, '').split(/[?#]/)[0].replace(/\\/+$/, '') || '/';
    if (path !== '/') return;
    var data = JSON.parse(document.getElementById('${STATS_PREFETCH_DATA_ID}').textContent);
    if (localStorage.getItem(data.pureP2PStorageKey) === 'true') return;
    var response = fetch(data.url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(data.timeoutMs) });
    // The app handles a failed request; this only keeps it from being reported as unhandled.
    response.catch(function () {});
    window.__FIVECHAN_STATS_PREFETCH__ = { url: data.url, response: response };
  } catch (error) {
    // The app requests the snapshot when the boxes render.
  }
})();`;

export function createStatsProviderPrefetchTags({ url, timeoutMs, pureP2PStorageKey }) {
  // First in <head>, so the request starts before the parser reaches the app's startup files.
  return [
    {
      tag: 'script',
      attrs: { type: 'application/json', id: STATS_PREFETCH_DATA_ID },
      children: JSON.stringify({ url, timeoutMs, pureP2PStorageKey }),
      injectTo: 'head-prepend',
    },
    { tag: 'script', children: STATS_PREFETCH_SCRIPT, injectTo: 'head-prepend' },
  ];
}

export function statsProviderPrefetchPlugin(options) {
  return {
    name: 'fivechan-stats-provider-prefetch',
    transformIndexHtml: () => createStatsProviderPrefetchTags(options),
  };
}
