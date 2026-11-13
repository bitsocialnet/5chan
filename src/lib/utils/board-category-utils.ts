// A board category is one heading of the home page's board list. /all?c=<slug> narrows the /all
// multiboard to that category's directory boards.
export interface BoardCategory {
  slug: string;
  name: string;
  nsfw?: boolean;
  directoryCodes: string[];
}

export const BOARD_CATEGORY_QUERY_PARAM = 'c';

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

export const getBoardCategory = (slug: string | null | undefined): BoardCategory | undefined =>
  slug ? BOARD_CATEGORIES.find((category) => category.slug === slug) : undefined;

export const getBoardCategoryFromSearch = (search: string): BoardCategory | undefined => getBoardCategory(new URLSearchParams(search).get(BOARD_CATEGORY_QUERY_PARAM));

/** The search string with the category set, or removed when no slug is given. Other parameters are kept. */
export const getSearchWithBoardCategory = (search: string, slug: string | undefined): string => {
  const params = new URLSearchParams(search);
  if (slug) {
    params.set(BOARD_CATEGORY_QUERY_PARAM, slug);
  } else {
    params.delete(BOARD_CATEGORY_QUERY_PARAM);
  }
  const nextSearch = params.toString();
  return nextSearch ? `?${nextSearch}` : '';
};

/** Keep the category's boards, in the category's own order. Entries without a known code are dropped. */
export const filterByBoardCategory = <T>(items: T[], category: BoardCategory | undefined, getCode: (item: T) => string | null | undefined): T[] => {
  if (!category) return items;
  const order = new Map(category.directoryCodes.map((code, index) => [code, index]));
  return items.filter((item) => order.has(getCode(item) ?? '')).sort((a, b) => (order.get(getCode(a) ?? '') ?? 0) - (order.get(getCode(b) ?? '') ?? 0));
};
