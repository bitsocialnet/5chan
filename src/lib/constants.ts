/** Max replies loaded per page from useReplies. Threads with > this use Virtuoso. */
export const REPLIES_PER_PAGE = 500;

/** Number of replies shown in preview mode on board/listing views. */
export const BOARD_REPLIES_PREVIEW_VISIBLE_COUNT = 5;

/** Number of replies fetched for preview mode on board/listing views. */
export const BOARD_REPLIES_PREVIEW_FETCH_SIZE = 25;

/** 5chan ships in English by default; users must opt into other languages manually. */
export const DEFAULT_INTERFACE_LANGUAGE = 'en';

/** Persist only deliberate in-app language selections, never OS/browser auto-detection. */
export const INTERFACE_LANGUAGE_STORAGE_KEY = '5chan-interface-language';

export const SUPPORTED_INTERFACE_LANGUAGES = [
  'ar',
  'bn',
  'cs',
  'da',
  'de',
  'el',
  'en',
  'es',
  'fa',
  'fi',
  'fil',
  'fr',
  'he',
  'hi',
  'hu',
  'id',
  'it',
  'ja',
  'ko',
  'mr',
  'nl',
  'no',
  'pl',
  'pt',
  'ro',
  'ru',
  'sq',
  'sv',
  'te',
  'th',
  'tr',
  'uk',
  'ur',
  'vi',
  'zh',
] as const;
