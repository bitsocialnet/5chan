import type { IndexedBoard } from '../search-indexer';
import type { SpecialBoard } from '../special-boards';
import type { DirectoryCommunity, DirectoryList } from './directory-list-utils';
import { isBoardAddressShape, normalizeBoardAddress } from './directory-list-lookup-utils';

/** A board the search knows about, merged from every list that names its address. */
export interface BoardSearchResult {
  address: string;
  /** Set only for the board currently serving a directory code, so the row can link to /code/. */
  directoryCode?: string;
  /** The indexer's post count, which only breaks ranking ties; it is not the board's real size. */
  indexedPostCount?: number;
  /** The query named this board's code or address outright, so it is pinned to the top. */
  exact: boolean;
  nsfw: boolean;
  publicKey?: string;
  /** The board name without its code: "/mu/ - Music" gives "Music". */
  title?: string;
  /**
   * No list carries the address the query spelled out, but the row still offers to open it:
   * unlisted boards are reachable through the search bar, as they always were.
   */
  unlisted?: boolean;
}

export interface BoardSearchSources {
  /** Candidate boards of every directory, most of which are not the one serving the code. */
  candidates?: DirectoryList[];
  /** The board currently serving each directory code, with the code and the curated title. */
  directories?: DirectoryCommunity[];
  /** The indexer's list, which can name boards none of 5chan's lists carry. */
  indexed?: IndexedBoard[];
  specialBoards?: SpecialBoard[];
  /** The account's own subscriptions, so a board only this person follows is findable. */
  subscriptions?: string[];
}

type MergedBoard = Omit<BoardSearchResult, 'exact' | 'nsfw' | 'unlisted'> & {
  /** Indexer descriptions are searched but never shown; the rows stay as compact as a directory's. */
  description?: string;
  /** Undeclared until a list says so; the first list to declare it wins, so a curated verdict beats a crawled one. */
  nsfw?: boolean;
};

const ADDRESS_SUFFIX = /\.(?:bso|eth|sol)$/i;
/** Board public keys are base58btc peer ids. */
const BOARD_PUBLIC_KEY = /^12D3Koo[1-9A-HJ-NP-Za-km-z]{40,}$/;
const DIRECTORY_TITLE = /^\/[^/]+\/\s*-\s*(.+)$/;

/**
 * Case-insensitive dedupe key that treats a board's .bso and .eth aliases as one board, the way
 * `normalizeBoardAddress` does everywhere else. A .sol name is a different board from the same
 * name under .bso, so it keeps its suffix.
 */
const getAddressKey = (address: string): string => normalizeBoardAddress(address.trim().toLowerCase());

/** "/mu/ - Music" -> "Music"; a title with no code part is kept whole. */
const getBoardTitle = (title: string | null | undefined): string | undefined => {
  const trimmed = title?.trim();
  if (!trimmed) return undefined;
  return trimmed.match(DIRECTORY_TITLE)?.[1]?.trim() || trimmed;
};

const withField = <T>(current: T | undefined, incoming: T | undefined): T | undefined => current ?? incoming;

/** A list can name a board by its peer id instead of its address; that is the same board. */
const getPublicKey = (entry: MergedBoard): string | undefined => entry.publicKey ?? (BOARD_PUBLIC_KEY.test(entry.address) ? entry.address : undefined);

/** Two records of one board; the one serving a directory keeps its address, as that is what /code/ resolves to. */
const combine = (current: MergedBoard, incoming: MergedBoard): MergedBoard => {
  const [first, second] = !current.directoryCode && incoming.directoryCode ? [incoming, current] : [current, incoming];
  return {
    address: first.address,
    description: withField(first.description, second.description),
    directoryCode: withField(first.directoryCode, second.directoryCode),
    indexedPostCount: withField(first.indexedPostCount, second.indexedPostCount),
    nsfw: withField(first.nsfw, second.nsfw),
    publicKey: withField(first.publicKey, second.publicKey),
    title: withField(first.title, second.title),
  };
};

const mergeInto = (merged: Map<string, MergedBoard>, keysByPublicKey: Map<string, string>, entry: MergedBoard): void => {
  const addressKey = getAddressKey(entry.address);
  if (!addressKey) return;
  const publicKey = getPublicKey(entry);
  const key = (publicKey && keysByPublicKey.get(publicKey)) || addressKey;
  if (publicKey) keysByPublicKey.set(publicKey, key);

  // Stored with the key it was derived from, so a later exact peer-id query still finds it.
  let combined = publicKey ? { ...entry, publicKey } : entry;
  // The public key just connected this address to a row kept under another alias: fold in the
  // address-only row that alias had, so the board does not show twice.
  if (key !== addressKey) {
    const orphan = merged.get(addressKey);
    if (orphan) {
      merged.delete(addressKey);
      combined = combine(orphan, combined);
    }
  }

  const existing = merged.get(key);
  merged.set(key, existing ? combine(existing, combined) : combined);
};

/**
 * Every board the search can name, deduped by address. 5chan's own lists are merged before the
 * indexer's so the directory code, curated title and nsfw flag win over what was crawled.
 */
export const mergeBoardSources = (sources: BoardSearchSources): MergedBoard[] => {
  const merged = new Map<string, MergedBoard>();
  const keysByPublicKey = new Map<string, string>();
  const add = (entry: MergedBoard) => {
    if (isBoardAddressShape(entry.address)) mergeInto(merged, keysByPublicKey, entry);
  };

  for (const directory of sources.directories ?? []) {
    add({
      address: directory.address,
      directoryCode: directory.directoryCode,
      nsfw: directory.nsfw,
      publicKey: directory.publicKey,
      title: getBoardTitle(directory.title),
    });
  }
  for (const board of sources.specialBoards ?? []) {
    add({ address: board.address, directoryCode: board.directoryCode, nsfw: board.nsfw, publicKey: board.publicKey, title: getBoardTitle(board.title) });
  }
  // A candidate that is not serving its directory keeps the directory's name but gets no code.
  for (const list of sources.candidates ?? []) {
    for (const board of list.boards) {
      add({ address: board.address, nsfw: board.nsfw, publicKey: board.publicKey, title: getBoardTitle(list.title) });
    }
  }
  for (const address of sources.subscriptions ?? []) {
    if (typeof address === 'string') add({ address: address.trim() });
  }
  for (const board of sources.indexed ?? []) {
    add({
      address: board.address,
      description: board.description ?? undefined,
      indexedPostCount: board.post_count,
      nsfw: board.nsfw === undefined ? undefined : board.nsfw === 1,
      title: getBoardTitle(board.title),
    });
  }

  return [...merged.values()];
};

/** Words of a text, so a term matches at word starts: "lit" finds "Literature", not "politically". */
const getWords = (text: string | undefined): string[] =>
  text
    ? text
        .toLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .filter(Boolean)
    : [];

/** The address without its alias suffix, so "bso" does not match every board. */
const getAddressWords = (address: string): string[] => getWords(normalizeBoardAddress(address).replace(ADDRESS_SUFFIX, ''));

/**
 * The distinct words of a query, split the way board text is, so a homepage title pasted whole
 * ("/biz/ - Business & Finance") is its words and not a dash and an ampersand nothing can match.
 * A typed address contributes its name only: "music.bso" still looks for "music".
 */
export const getBoardSearchTerms = (query: string): string[] => [...new Set(getWords(query.trim().replace(ADDRESS_SUFFIX, '')))];

const matchesWords = (words: string[], terms: string[]): boolean => terms.every((term) => words.some((word) => word.startsWith(term)));

const RANK_EXACT = 0;
const RANK_CODE = 1;
const RANK_TITLE = 2;
const RANK_ADDRESS = 3;
const RANK_DESCRIPTION = 4;

/**
 * Rank order, matching what the results show first: the exact code or address, then a code the
 * query starts, then a title match, then an address match, then a description-only match.
 * Ties break in favour of the board serving a directory over a candidate with the same name,
 * then on how much the indexer holds, then on address so the order is stable.
 */
const getMatchRank = (board: MergedBoard, query: { address: string; code: string | null }, terms: string[]): number | null => {
  const code = board.directoryCode?.toLowerCase();
  if (query.address && (getAddressKey(board.address) === query.address || board.publicKey === query.address)) return RANK_EXACT;
  if (query.code && code === query.code) return RANK_EXACT;
  if (terms.length === 0) return null;
  if (code && terms.length === 1 && code.startsWith(terms[0])) return RANK_CODE;

  const codeWords = code ? [code] : [];
  const titleWords = getWords(board.title);
  const addressWords = getAddressWords(board.address);
  const descriptionWords = getWords(board.description);
  // Every term has to land somewhere on the board, but not all on the same field: "music posting"
  // finds music-posting.bso through its title and its address together.
  const allWords = [...codeWords, ...titleWords, ...addressWords, ...descriptionWords];
  if (!matchesWords(allWords, terms)) return null;
  if (matchesWords([...codeWords, ...titleWords], terms)) return RANK_TITLE;
  if (matchesWords([...codeWords, ...titleWords, ...addressWords], terms)) return RANK_ADDRESS;
  return RANK_DESCRIPTION;
};

/** A raw address (name.bso, name.eth, name.sol or a peer id), which can be opened even when no list knows it. */
const isBoardAddressQuery = (value: string): boolean => isBoardAddressShape(value) && (ADDRESS_SUFFIX.test(value) || BOARD_PUBLIC_KEY.test(value));

/** The board matches for a query, ranked, with the exact code or address pinned first. */
export const searchBoards = (sources: BoardSearchSources, query: string): BoardSearchResult[] => {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const bareQuery = trimmed.replace(/^\/+|\/+$/g, '');
  const isAddressQuery = isBoardAddressQuery(bareQuery);
  // Case is kept for a peer id, whose base58 letters are significant; addresses are lowercased for comparison.
  // A suffixed name is an address, never a code: "mu.eth" is not /mu/.
  const exactQuery = {
    address: BOARD_PUBLIC_KEY.test(bareQuery) ? bareQuery : getAddressKey(bareQuery),
    code: isAddressQuery ? null : bareQuery.toLowerCase(),
  };
  const terms = getBoardSearchTerms(bareQuery);

  const matches: BoardSearchResult[] = mergeBoardSources(sources)
    .map((board) => ({ board, rank: getMatchRank(board, exactQuery, terms) }))
    .filter((entry): entry is { board: MergedBoard; rank: number } => entry.rank !== null)
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        Number(Boolean(b.board.directoryCode)) - Number(Boolean(a.board.directoryCode)) ||
        (b.board.indexedPostCount ?? 0) - (a.board.indexedPostCount ?? 0) ||
        a.board.address.localeCompare(b.board.address),
    )
    .map(({ board: { description: _description, ...board }, rank }) => ({ ...board, exact: rank === RANK_EXACT, nsfw: board.nsfw ?? false }));

  // The address that was typed is offered as spelled, above whatever its name resembles.
  if (isAddressQuery && !matches.some((board) => board.exact)) {
    matches.unshift({ address: bareQuery, exact: true, nsfw: false, unlisted: true });
  }

  return matches;
};
