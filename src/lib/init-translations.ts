import i18next from 'i18next';
import HttpBackend from 'i18next-http-backend';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';
import en from '../../public/translations/en/default.json';
import {
  DEFAULT_INTERFACE_LANGUAGE,
  INTERFACE_LANGUAGE_STORAGE_KEY,
  INTERFACE_TRANSLATIONS_LOAD_PATH,
  INTERFACE_TRANSLATIONS_NAMESPACE,
  SUPPORTED_INTERFACE_LANGUAGES,
} from './constants';

declare global {
  interface Window {
    // The request index.html starts for the saved language's strings (scripts/vite-translation-prefetch.mjs).
    __FIVECHAN_TRANSLATION_PREFETCH__?: { url: string; response: Promise<Response> };
  }
}

/** The response to the request index.html started for this URL, which only the first request takes over. */
const takePrefetchedTranslations = (url: string): Promise<Response> | undefined => {
  const prefetch = window.__FIVECHAN_TRANSLATION_PREFETCH__;
  if (prefetch?.url !== url) return undefined;
  delete window.__FIVECHAN_TRANSLATION_PREFETCH__;
  return prefetch.response;
};

i18next
  .use(HttpBackend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: DEFAULT_INTERFACE_LANGUAGE,
    supportedLngs: [...SUPPORTED_INTERFACE_LANGUAGES],
    detection: {
      order: ['localStorage'],
      caches: ['localStorage'],
      lookupLocalStorage: INTERFACE_LANGUAGE_STORAGE_KEY,
    },

    ns: [INTERFACE_TRANSLATIONS_NAMESPACE],
    defaultNS: INTERFACE_TRANSLATIONS_NAMESPACE,

    // English ships with the app. Every language falls back to it, so it always loads, and the first
    // render waits for the interface strings: fetched, they would cost a round trip after the app's
    // code has run, as the file must be revalidated. Other languages load through the backend, which
    // takes over the request index.html started for the saved language; any other request it fetches.
    resources: { [DEFAULT_INTERFACE_LANGUAGE]: { default: en } },
    partialBundledLanguages: true,
    backend: { loadPath: INTERFACE_TRANSLATIONS_LOAD_PATH, alternateFetch: (url: string) => takePrefetchedTranslations(url) },
  });
