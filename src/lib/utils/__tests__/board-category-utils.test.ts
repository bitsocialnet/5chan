import { describe, expect, it } from 'vitest';
import { BOARD_CATEGORIES, filterByBoardCategory, getBoardCategory, getBoardCategoryFromSearch, getSearchWithBoardCategory } from '../board-category-utils';

describe('board-category-utils', () => {
  it('puts each directory code in one category only', () => {
    const codes = BOARD_CATEGORIES.flatMap((category) => category.directoryCodes);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('reads the category from the search string and ignores unknown slugs', () => {
    expect(getBoardCategoryFromSearch('?t=1w&c=video-games')?.name).toBe('Video Games');
    expect(getBoardCategoryFromSearch('?c=nope')).toBeUndefined();
    expect(getBoardCategoryFromSearch('')).toBeUndefined();
  });

  it('sets and removes the category while keeping other parameters', () => {
    expect(getSearchWithBoardCategory('?t=1w', 'creative')).toBe('?t=1w&c=creative');
    expect(getSearchWithBoardCategory('?t=1w&c=creative', undefined)).toBe('?t=1w');
    expect(getSearchWithBoardCategory('?c=creative', undefined)).toBe('');
  });

  it("keeps a category's boards in the category's order and everything without a category", () => {
    const boards = [{ code: 'vst' }, { code: 'a' }, { code: null }, { code: 'v' }];
    const getCode = (board: { code: string | null }) => board.code;

    expect(filterByBoardCategory(boards, getBoardCategory('video-games'), getCode)).toEqual([{ code: 'v' }, { code: 'vst' }]);
    expect(filterByBoardCategory(boards, undefined, getCode)).toBe(boards);
  });
});
