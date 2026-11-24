import { describe, expect, it } from 'vitest';
import {
  BOARD_CATEGORIES,
  filterByBoardCategory,
  getBoardCategory,
  getBoardCategoryFromSearch,
  getBoardListEntryLabel,
  getSearchWithBoardCategory,
  parseBoardList,
} from '../board-category-utils';
import { getBoardCategoryCommunities } from '../board-category-communities';

describe('board-category-utils', () => {
  it('puts each directory code in one category only', () => {
    const codes = BOARD_CATEGORIES.flatMap((category) => category.directoryCodes);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('reads the category from the search string and ignores unknown slugs', () => {
    expect(getBoardCategoryFromSearch('?t=1w&c=video-games')?.name).toBe('Video Games');
    expect(getBoardCategoryFromSearch('?c=video-game')).toBeUndefined();
    expect(getBoardCategoryFromSearch('?c=,')).toBeUndefined();
    expect(getBoardCategoryFromSearch('')).toBeUndefined();
  });

  it('reads any other value as a list of board codes and addresses', () => {
    expect(parseBoardList(' G, sci,/diy/,sci,,bad code,x-y,music-posting.bso,12D3KooWKYshRmexampleexample')).toEqual({
      codes: ['g', 'sci', 'diy'],
      addresses: ['music-posting.bso', '12D3KooWKYshRmexampleexample'],
    });
    expect(getBoardCategoryFromSearch('?c=g,sci,diy')).toEqual({
      slug: 'g,sci,diy',
      name: '/g/+/sci/+/diy/',
      directoryCodes: ['g', 'sci', 'diy'],
      addresses: [],
      custom: true,
    });
    expect(getBoardCategoryFromSearch('?c=g,music-posting.bso')?.name).toBe('/g/+music-posting.bso');
    expect(getBoardCategoryFromSearch('?c=g%2CSCI')?.slug).toBe('g,sci');
    // Category slugs win over a code of the same spelling.
    expect(getBoardCategory('misc')?.custom).toBeUndefined();
  });

  it('labels a list entry as a code or a shortened address', () => {
    expect(getBoardListEntryLabel('g')).toBe('/g/');
    expect(getBoardListEntryLabel('music-posting.bso')).toBe('music-posting.bso');
    expect(getBoardListEntryLabel('12D3KooWKYshRmexampleexample')).toBe('KYshRmexampl');
  });

  it("reads a saved multiboard from the account's list, and still names one the account does not have", () => {
    const saved = [{ id: 'tech', name: 'Tech', boards: ['g', 'music-posting.bso', 'sci'] }];

    expect(getBoardCategoryFromSearch('?c=@tech', saved)).toEqual({
      slug: '@tech',
      name: 'Tech',
      directoryCodes: ['g', 'sci'],
      addresses: ['music-posting.bso'],
      savedId: 'tech',
    });
    expect(getBoardCategory('@gone', saved)).toEqual({ slug: '@gone', name: 'Unknown Multiboard', directoryCodes: [], addresses: [], savedId: 'gone', missing: true });
    expect(getBoardCategory('@')).toBeUndefined();
  });

  it('lists the directory boards of a category, then the boards it names by address', () => {
    const directories = [
      { address: 'tech.bso', title: '/g/ - Technology' },
      { address: 'science.bso', title: '/sci/ - Science & Math' },
    ];
    const category = getBoardCategory('sci,g,science.bso,music-posting.bso');

    expect(getBoardCategoryCommunities(directories, category)).toEqual([
      { address: 'science.bso', title: '/sci/ - Science & Math' },
      { address: 'tech.bso', title: '/g/ - Technology' },
      { address: 'music-posting.bso', title: 'music-posting.bso' },
    ]);
    expect(getBoardCategoryCommunities(directories, undefined)).toBe(directories);
  });

  it('sets and removes the category while keeping other parameters', () => {
    expect(getSearchWithBoardCategory('?t=1w', 'creative')).toBe('?t=1w&c=creative');
    expect(getSearchWithBoardCategory('?t=1w&c=creative', undefined)).toBe('?t=1w');
    expect(getSearchWithBoardCategory('?c=creative', undefined)).toBe('');
    expect(getSearchWithBoardCategory('?t=1w', 'g,sci')).toBe('?t=1w&c=g,sci');
    expect(getSearchWithBoardCategory('', '@tech')).toBe('?c=@tech');
  });

  it("keeps a category's boards in the category's order and everything without a category", () => {
    const boards = [{ code: 'vst' }, { code: 'a' }, { code: null }, { code: 'v' }];
    const getCode = (board: { code: string | null }) => board.code;

    expect(filterByBoardCategory(boards, getBoardCategory('video-games'), getCode)).toEqual([{ code: 'v' }, { code: 'vst' }]);
    expect(filterByBoardCategory(boards, undefined, getCode)).toBe(boards);
    expect(filterByBoardCategory(boards, getBoardCategory('vst,nope,v'), getCode)).toEqual([{ code: 'vst' }, { code: 'v' }]);
  });
});
