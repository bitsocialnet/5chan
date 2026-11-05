import assert from 'node:assert/strict';
import test from 'node:test';
import { createTranslationPrefetchTags, TRANSLATION_PREFETCH_DATA_ID, TRANSLATION_PREFETCH_SCRIPT } from '../vite-translation-prefetch.mjs';

const OPTIONS = {
  storageKey: '5chan-interface-language',
  defaultLanguage: 'en',
  languages: ['de', 'en', 'zh-CN'],
  loadPath: './translations/{{lng}}/{{ns}}.json',
  namespace: 'default',
};

const runScript = (storage = {}) => {
  const window = {};
  const requests = [];
  const document = { getElementById: (id) => (id === TRANSLATION_PREFETCH_DATA_ID ? { textContent: JSON.stringify(OPTIONS) } : null) };
  const localStorage = { getItem: (key) => storage[key] ?? null };
  const fetch = (url) => {
    requests.push(url);
    return Promise.resolve(`response for ${url}`);
  };
  new Function('window', 'document', 'localStorage', 'fetch', TRANSLATION_PREFETCH_SCRIPT)(window, document, localStorage, fetch);
  return { prefetch: window.__FIVECHAN_TRANSLATION_PREFETCH__, requests };
};

test('puts the settings block before the script, first in <head>', () => {
  const [data, script] = createTranslationPrefetchTags(OPTIONS);
  assert.deepEqual(data.attrs, { type: 'application/json', id: TRANSLATION_PREFETCH_DATA_ID });
  assert.deepEqual(JSON.parse(data.children), OPTIONS);
  assert.equal(script.children, TRANSLATION_PREFETCH_SCRIPT);
  assert.deepEqual([data.injectTo, script.injectTo], ['head-prepend', 'head-prepend']);
});

test('requests the saved language and hands the response to the app by URL', async () => {
  for (const [language, url] of [
    ['de', './translations/de/default.json'],
    ['zh-CN', './translations/zh-CN/default.json'],
  ]) {
    const { prefetch, requests } = runScript({ '5chan-interface-language': language });
    assert.deepEqual(requests, [url], language);
    assert.equal(prefetch.url, url, language);
    assert.equal(await prefetch.response, `response for ${url}`, language);
  }
});

test('requests nothing for English, no saved language, or a language the app does not ship', () => {
  for (const storage of [{}, { '5chan-interface-language': 'en' }, { '5chan-interface-language': 'xx' }, { '5chan-interface-language': '../secrets' }]) {
    assert.deepEqual(runScript(storage), { prefetch: undefined, requests: [] }, JSON.stringify(storage));
  }
});

test('leaves the request to the app when storage cannot be read', () => {
  const window = {};
  const localStorage = {
    getItem: () => {
      throw new Error('SecurityError');
    },
  };
  const document = { getElementById: () => ({ textContent: JSON.stringify(OPTIONS) }) };
  new Function('window', 'document', 'localStorage', 'fetch', TRANSLATION_PREFETCH_SCRIPT)(window, document, localStorage, () => assert.fail('fetched'));
  assert.equal(window.__FIVECHAN_TRANSLATION_PREFETCH__, undefined);
});
