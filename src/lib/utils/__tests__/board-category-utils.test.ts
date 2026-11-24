import { describe, expect, it } from 'vitest';
import {
  BOARD_CATEGORIES,
  filterByBoardCategory,
  getBoardCategory,
  getBoardCategoryFromSearch,
  getSearchWithBoardCategory,
  parseBoardCodeList,
} from '../board-category-utils';

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

  it('reads any other value as a list of board codes', () => {
    expect(parseBoardCodeList(' G, sci,/diy/,sci,,bad code,x-y')).toEqual(['g', 'sci', 'diy']);
    expect(getBoardCategoryFromSearch('?c=g,sci,diy')).toEqual({ slug: 'g,sci,diy', name: '/g/+/sci/+/diy/', directoryCodes: ['g', 'sci', 'diy'], custom: true });
    expect(getBoardCategoryFromSearch('?c=g%2CSCI')?.slug).toBe('g,sci');
    // Category slugs win over a code of the same spelling.
    expect(getBoardCategory('misc')?.custom).toBeUndefined();
  });

  it('sets and removes the category while keeping other parameters', () => {
    expect(getSearchWithBoardCategory('?t=1w', 'creative')).toBe('?t=1w&c=creative');
    expect(getSearchWithBoardCategory('?t=1w&c=creative', undefined)).toBe('?t=1w');
    expect(getSearchWithBoardCategory('?c=creative', undefined)).toBe('');
    expect(getSearchWithBoardCategory('?t=1w', 'g,sci')).toBe('?t=1w&c=g,sci');
  });

  it("keeps a category's boards in the category's order and everything without a category", () => {
    const boards = [{ code: 'vst' }, { code: 'a' }, { code: null }, { code: 'v' }];
    const getCode = (board: { code: string | null }) => board.code;

    expect(filterByBoardCategory(boards, getBoardCategory('video-games'), getCode)).toEqual([{ code: 'v' }, { code: 'vst' }]);
    expect(filterByBoardCategory(boards, undefined, getCode)).toBe(boards);
    expect(filterByBoardCategory(boards, getBoardCategory('vst,nope,v'), getCode)).toEqual([{ code: 'vst' }, { code: 'v' }]);
  });
});
