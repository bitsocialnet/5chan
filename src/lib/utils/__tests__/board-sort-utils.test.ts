import { describe, expect, it } from 'vitest';
import { getBoardSortType, isBoardMissingSortType } from '../board-sort-utils';

const makePageSorts = (sortTypes: string[]) => ({ posts: Object.fromEntries(sortTypes.map((sortType) => [sortType, { name: sortType }])) });

// A board whose posts overflow the preloaded page, so only the published sorts are available.
const makeLargeBoard = (sortTypes: string[], pageSorts: object | null = makePageSorts(sortTypes)) => ({
  updatedAt: 1,
  ...(pageSorts ? { pageSorts } : {}),
  posts: {
    pages: { [sortTypes[0]]: { comments: [{ cid: 'post' }], nextCid: 'next' } },
    pageCids: Object.fromEntries(sortTypes.map((sortType) => [sortType, `${sortType}-cid`])),
  },
});

// A board whose posts all fit in its preloaded page, which the client can re-sort into other sorts.
const makeSmallBoard = (sortType: string) => ({
  updatedAt: 1,
  pageSorts: makePageSorts([sortType]),
  posts: { pages: { [sortType]: { comments: [{ cid: 'post' }] } } },
});

describe('board-sort-utils', () => {
  it('prefers bump order and otherwise follows the board default sort', () => {
    expect(getBoardSortType(makeLargeBoard(['hot', 'new', 'active']))).toBe('active');
    expect(getBoardSortType(makeLargeBoard(['hot', 'new']))).toBe('hot');
    expect(getBoardSortType(makeLargeBoard(['new']))).toBe('new');
    // unconfigured boards publish every built-in sort
    expect(getBoardSortType(makeLargeBoard(['hot', 'active'], null))).toBe('active');
    expect(getBoardSortType(undefined)).toBe('active');
  });

  it('keeps the board default sort while the board fits in its preloaded page', () => {
    expect(getBoardSortType(makeSmallBoard('hot'))).toBe('hot');
    // a configured board with no threads yet
    expect(getBoardSortType({ pageSorts: makePageSorts(['new']), posts: { pages: {}, pageCids: {} } })).toBe('new');
  });

  it('flags only loaded boards with threads that lack the sort', () => {
    expect(isBoardMissingSortType(makeLargeBoard(['hot']), 'active')).toBe(true);
    expect(isBoardMissingSortType(makeLargeBoard(['hot', 'active']), 'active')).toBe(false);
    // the client still computes bump order from a single preloaded page
    expect(isBoardMissingSortType(makeSmallBoard('hot'), 'active')).toBe(false);
    expect(isBoardMissingSortType(makeLargeBoard(['hot'], null), 'active')).toBe(false);
    expect(isBoardMissingSortType(undefined, 'active')).toBe(false);
    expect(isBoardMissingSortType({ pageSorts: makePageSorts(['hot']), posts: { pages: {}, pageCids: {} } }, 'active')).toBe(false);
  });
});
