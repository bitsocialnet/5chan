import { toReadableSearchString } from './search-string-utils';

// A board category is one heading of the home page's board list. /all?c=<slug> narrows the /all
// multiboard to that category's directory boards. /all?c=g,sci,diy narrows it to a list of boards the
// viewer picked, so any set of boards is one bookmark.
export interface BoardCategory {
  slug: string;
  name: string;
  nsfw?: boolean;
  directoryCodes: string[];
  /** Read from a list of board codes in the URL rather than one of BOARD_CATEGORIES. */
  custom?: boolean;
}

export const BOARD_CATEGORY_QUERY_PARAM = 'c';

const CUSTOM_BOARD_LIST_SEPARATOR = ',';
const BOARD_CODE_PATTERN = /^[a-z0-9]+$/;

// Order and membership follow the home page's board list.
export const BOARD_CATEGORIES: BoardCategory[] = [
  { slug: 'japanese-culture', name: 'Japanese Culture', directoryCodes: ['a', 'c', 'w', 'm', 'cgl', 'cm', 'f', 'n', 'jp', 'vt'] },
  { slug: 'video-games', name: 'Video Games', directoryCodes: ['v', 'vg', 'vm', 'vmg', 'vp', 'vr', 'vrpg', 'vst'] },
  {
    slug: 'interests',
    name: 'Interests',
    directoryCodes: ['co', 'g', 'tv', 'k', 'o', 'an', 'tg', 'sp', 'xs', 'pw', 'sci', 'his', 'int', 'out', 'toy'],
  },
  {
    slug: 'creative',
    name: 'Creative',
    directoryCodes: ['i', 'po', 'p', 'ck', 'ic', 'wg', 'lit', 'mu', 'fa', '3', 'gd', 'diy', 'wsg', 'qst', 'oc'],
  },
  { slug: 'other', name: 'Other', directoryCodes: ['biz', 'trv', 'fit', 'x', 'adv', 'lgbt', 'mlp', 'news', 'wsr', 'vip', 'q'] },
  { slug: 'misc', name: 'Misc.', nsfw: true, directoryCodes: ['b', 'r9k', 'pol', 'bant', 'soc', 's5s'] },
  { slug: 'adult', name: 'Adult', nsfw: true, directoryCodes: ['s', 'hc', 'hm', 'h', 'e', 'u', 'd', 'y', 't', 'hr', 'gif', 'aco', 'r'] },
];

/** Board codes from a list like "g,sci,/diy/": lowercased, slashes stripped, invalid entries and repeats dropped, order kept. */
export const parseBoardCodeList = (value: string): string[] => [
  ...new Set(
    value
      .split(CUSTOM_BOARD_LIST_SEPARATOR)
      .map((code) =>
        code
          .trim()
          .replace(/^\/+|\/+$/g, '')
          .toLowerCase(),
      )
      .filter((code) => BOARD_CODE_PATTERN.test(code)),
  ),
];

/** The multiboard for a picked list of board codes; its slug is the canonical ?c= value. */
export const getCustomBoardCategory = (codes: string[]): BoardCategory | undefined =>
  codes.length > 0 ? { slug: codes.join(CUSTOM_BOARD_LIST_SEPARATOR), name: codes.map((code) => `/${code}/`).join('+'), directoryCodes: codes, custom: true } : undefined;

// Codes are checked against the loaded directories where boards are listed, not here: boards published to
// bitsocialnet/lists after a release still work, and a code with no directory simply contributes no boards.
export const getBoardCategory = (slug: string | null | undefined): BoardCategory | undefined =>
  slug ? (BOARD_CATEGORIES.find((category) => category.slug === slug) ?? getCustomBoardCategory(parseBoardCodeList(slug))) : undefined;

export const getBoardCategoryFromSearch = (search: string): BoardCategory | undefined => getBoardCategory(new URLSearchParams(search).get(BOARD_CATEGORY_QUERY_PARAM));

/** The search string with the category set, or removed when no slug is given. Other parameters are kept. */
export const getSearchWithBoardCategory = (search: string, slug: string | undefined): string => {
  const params = new URLSearchParams(search);
  if (slug) {
    params.set(BOARD_CATEGORY_QUERY_PARAM, slug);
  } else {
    params.delete(BOARD_CATEGORY_QUERY_PARAM);
  }
  const nextSearch = toReadableSearchString(params);
  return nextSearch ? `?${nextSearch}` : '';
};

/** Keep the category's boards, in the category's own order. Entries without a known code are dropped. */
export const filterByBoardCategory = <T>(items: T[], category: BoardCategory | undefined, getCode: (item: T) => string | null | undefined): T[] => {
  if (!category) return items;
  const order = new Map(category.directoryCodes.map((code, index) => [code, index]));
  return items.filter((item) => order.has(getCode(item) ?? '')).sort((a, b) => (order.get(getCode(a) ?? '') ?? 0) - (order.get(getCode(b) ?? '') ?? 0));
};
