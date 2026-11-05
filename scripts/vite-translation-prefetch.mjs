// Start the saved interface language's strings from index.html.
//
// English ships with the app. Any other language's strings load through i18next-http-backend, and
// the first render waits for them. Requested once the app's code has run, they started a few
// milliseconds before the P2P libraries the app downloads next and shared a slow connection with
// them, arriving hundreds of milliseconds late. This script requests them while the app's code
// downloads, and src/lib/init-translations.ts hands the response to the backend. Its hash is listed
// in vercel.json's script-src, so its settings live in a JSON block.

export const TRANSLATION_PREFETCH_DATA_ID = 'fivechan-translation-prefetch';

export const TRANSLATION_PREFETCH_SCRIPT = `(function () {
  try {
    var data = JSON.parse(document.getElementById('${TRANSLATION_PREFETCH_DATA_ID}').textContent);
    var language = localStorage.getItem(data.storageKey);
    if (!language || language === data.defaultLanguage || data.languages.indexOf(language) === -1) return;
    var url = data.loadPath.replace('{{lng}}', language).replace('{{ns}}', data.namespace);
    var response = fetch(url);
    // The app handles a failed request; this only keeps it from being reported as unhandled.
    response.catch(function () {});
    window.__FIVECHAN_TRANSLATION_PREFETCH__ = { url: url, response: response };
  } catch (error) {
    // The app requests the strings when it starts.
  }
})();`;

export function createTranslationPrefetchTags({ storageKey, defaultLanguage, languages, loadPath, namespace }) {
  // First in <head>, so the request starts before the parser reaches the app's startup files.
  return [
    {
      tag: 'script',
      attrs: { type: 'application/json', id: TRANSLATION_PREFETCH_DATA_ID },
      children: JSON.stringify({ storageKey, defaultLanguage, languages, loadPath, namespace }),
      injectTo: 'head-prepend',
    },
    { tag: 'script', children: TRANSLATION_PREFETCH_SCRIPT, injectTo: 'head-prepend' },
  ];
}

export function translationPrefetchPlugin(options) {
  return {
    name: 'fivechan-translation-prefetch',
    transformIndexHtml: () => createTranslationPrefetchTags(options),
  };
}
