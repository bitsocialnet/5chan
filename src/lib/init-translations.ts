import i18next from 'i18next';
import HttpBackend from 'i18next-http-backend';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';
import en from '../../public/translations/en/default.json';
import { DEFAULT_INTERFACE_LANGUAGE, INTERFACE_LANGUAGE_STORAGE_KEY, SUPPORTED_INTERFACE_LANGUAGES } from './constants';

const loadPath = `./translations/{{lng}}/{{ns}}.json`;

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

    ns: ['default'],
    defaultNS: 'default',

    // English ships with the app. Every language falls back to it, so it always loads, and the first
    // render waits for the interface strings: fetched, they would cost a round trip after the app's
    // code has run, as the file must be revalidated. Other languages load through the backend.
    resources: { [DEFAULT_INTERFACE_LANGUAGE]: { default: en } },
    partialBundledLanguages: true,
    backend: { loadPath },
  });
