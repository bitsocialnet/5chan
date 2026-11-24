import getShortAddress from '../get-short-address';
import { toReadableSearchString } from './search-string-utils';

// A board category is one heading of the home page's board list. /all?c=<slug> narrows the /all
// multiboard to that category's directory boards. /all?c=g,sci,music-posting.bso narrows it to a list of
// boards the viewer picked (directory codes, or addresses for boards outside the directories), and
// /all?c=@<id> to a multiboard the viewer saved under a name in their account.
export interface BoardCategory {
  slug: string;
  name: string;
  nsfw?: boolean;
  directoryCodes: string[];
  /** Boards outside the directories, by address. */
  addresses?: string[];
  /** Read from a list of boards in the URL rather than one of BOARD_CATEGORIES. */
  custom?: boolean;
  /** The id of the saved multiboard it shows. */
  savedId?: string;
  /** A saved multiboard's link that this account has no multiboard for (another account or device, or deleted). */
  missing?: boolean;
}

/** A multiboard saved in the account (account.multiboards). Each board is a directory code or a board address. */
export interface SavedMultiboard {
  id: string;
  name: string;
  boards: string[];
}

const isSavedMultiboard = (value: unknown): value is SavedMultiboard => {
  const multiboard = value as Partial<SavedMultiboard> | null;
  return (
    !!multiboard &&
    typeof multiboard.id === 'string' &&
    multiboard.id !== '' &&
    typeof multiboard.name === 'string' &&
    Array.isArray(multiboard.boards) &&
    multiboard.boards.every((board) => typeof board === 'string')
  );
};

/** The saved multiboards in an account's multiboards field, skipping malformed entries. */
export const getSavedMultiboards = (multiboards: unknown): SavedMultiboard[] => (Array.isArray(multiboards) ? multiboards.filter(isSavedMultiboard) : []);

export interface BoardList {
  codes: string[];
  addresses: string[];
}

export const BOARD_CATEGORY_QUERY_PARAM = 'c';

const SAVED_MULTIBOARD_PREFIX = '@';
const BOARD_LIST_SEPARATOR = ',';
const BOARD_CODE_PATTERN = /^[a-z0-9]+$/;
const BOARD_ADDRESS_PATTERN = /^[A-Za-z0-9][A-Za-z0-9.-]*$/;
// An address is a domain (music-posting.bso) or a public key: never as short and dot-free as a board code.
const isBoardAddress = (entry: string) => entry.includes('.') || entry.length >= 20;

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

/** The boards in a list like "g,sci,/diy/,music-posting.bso": codes lowercased with slashes stripped, addresses as written, invalid entries and repeats dropped, order kept. */
export const parseBoardList = (value: string): BoardList => {
  const codes = new Set<string>();
  const addresses = new Set<string>();
  for (const rawEntry of value.split(BOARD_LIST_SEPARATOR)) {
    const entry = rawEntry.trim().replace(/^\/+|\/+$/g, '');
    if (isBoardAddress(entry)) {
      if (BOARD_ADDRESS_PATTERN.test(entry)) addresses.add(entry);
    } else if (BOARD_CODE_PATTERN.test(entry.toLowerCase())) {
      codes.add(entry.toLowerCase());
    }
  }
  return { codes: [...codes], addresses: [...addresses] };
};

/** A board as a list shows it: /code/, or its address shortened like the boards bar shows subscriptions. */
export const getBoardListEntryLabel = (board: string): string => (isBoardAddress(board) ? getShortAddress(board) || board : `/${board}/`);

/** The multiboard for a picked list of boards; its slug is the canonical ?c= value. */
export const getCustomBoardCategory = ({ codes, addresses }: BoardList): BoardCategory | undefined => {
  const boards = [...codes, ...addresses];
  return boards.length > 0
    ? { slug: boards.join(BOARD_LIST_SEPARATOR), name: boards.map(getBoardListEntryLabel).join('+'), directoryCodes: codes, addresses, custom: true }
    : undefined;
};

export const getSavedMultiboardSlug = (id: string): string => `${SAVED_MULTIBOARD_PREFIX}${id}`;

const getSavedMultiboardCategory = (multiboard: SavedMultiboard): BoardCategory => {
  const { codes, addresses } = parseBoardList(multiboard.boards.join(BOARD_LIST_SEPARATOR));
  return { slug: getSavedMultiboardSlug(multiboard.id), name: multiboard.name, directoryCodes: codes, addresses, savedId: multiboard.id };
};

/** A category's boards as a list entry each: its codes, then its addresses. */
export const getBoardCategoryBoards = (category: BoardCategory): string[] => [...category.directoryCodes, ...(category.addresses ?? [])];

// Codes are checked against the loaded directories where boards are listed, not here: boards published to
// bitsocialnet/lists after a release still work, and a code with no directory simply contributes no boards.
// A saved multiboard resolves against the account's saved multiboards; without them (another device, or
// once deleted) its slug still names a category, with no boards, so feed keys and selects stay stable.
export const getBoardCategory = (slug: string | null | undefined, savedMultiboards?: readonly SavedMultiboard[]): BoardCategory | undefined => {
  if (!slug) return undefined;
  if (slug.startsWith(SAVED_MULTIBOARD_PREFIX)) {
    const id = slug.slice(SAVED_MULTIBOARD_PREFIX.length);
    if (!id) return undefined;
    const multiboard = savedMultiboards?.find((saved) => saved.id === id);
    return multiboard ? getSavedMultiboardCategory(multiboard) : { slug, name: 'Unknown Multiboard', directoryCodes: [], addresses: [], savedId: id, missing: true };
  }
  return BOARD_CATEGORIES.find((category) => category.slug === slug) ?? getCustomBoardCategory(parseBoardList(slug));
};

export const getBoardCategoryFromSearch = (search: string, savedMultiboards?: readonly SavedMultiboard[]): BoardCategory | undefined =>
  getBoardCategory(new URLSearchParams(search).get(BOARD_CATEGORY_QUERY_PARAM), savedMultiboards);

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
