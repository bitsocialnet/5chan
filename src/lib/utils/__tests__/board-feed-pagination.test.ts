import { describe, it, expect } from 'vitest';
import { computeGuiPostsPerPage, getBoardFeedPageSizeConstants, getPageSlice } from '../board-feed-pagination';

describe('computeGuiPostsPerPage', () => {
  it('uses community.features.postsPerPage when valid numeric > 0', () => {
    expect(computeGuiPostsPerPage({ features: { postsPerPage: 15 } })).toBe(15);
    expect(computeGuiPostsPerPage({ features: { postsPerPage: 20 } })).toBe(20);
    expect(computeGuiPostsPerPage({ features: { postsPerPage: 1 } })).toBe(1);
    expect(computeGuiPostsPerPage({ features: { postsPerPage: 100 } })).toBe(100);
  });

  it('falls back to 15 when postsPerPage is missing, invalid, or non-positive', () => {
    expect(computeGuiPostsPerPage(undefined)).toBe(15);
    expect(computeGuiPostsPerPage(null)).toBe(15);
    expect(computeGuiPostsPerPage({})).toBe(15);
    expect(computeGuiPostsPerPage({ features: {} })).toBe(15);
    expect(computeGuiPostsPerPage({ features: { postsPerPage: 0 } })).toBe(15);
    expect(computeGuiPostsPerPage({ features: { postsPerPage: -1 } })).toBe(15);
    expect(computeGuiPostsPerPage({ features: { postsPerPage: NaN } })).toBe(15);
    expect(computeGuiPostsPerPage({ features: { postsPerPage: Infinity } })).toBe(15);
    expect(computeGuiPostsPerPage({ features: { postsPerPage: '15' as unknown as number } })).toBe(15);
    expect(computeGuiPostsPerPage({ features: { postsPerPage: 15.7 } })).toBe(15);
  });
});

describe('getBoardFeedPageSizeConstants', () => {
  it('directory page size 15 -> pagination feed size 150, 10-page cap', () => {
    const c = getBoardFeedPageSizeConstants(15);
    expect(c.guiPostsPerPage).toBe(15);
    expect(c.maxGuiPages).toBe(10);
    expect(c.paginationFeedPostsPerPage).toBe(150);
    expect(c.infiniteFeedPostsPerPage).toBe(15);
  });

  it('directory page size 20 -> pagination feed size 200', () => {
    const c = getBoardFeedPageSizeConstants(20);
    expect(c.guiPostsPerPage).toBe(20);
    expect(c.maxGuiPages).toBe(10);
    expect(c.paginationFeedPostsPerPage).toBe(200);
    expect(c.infiniteFeedPostsPerPage).toBe(20);
  });
});

describe('getPageSlice', () => {
  const guiPostsPerPage = 15;
  const maxGuiPages = 10;

  it('returns correct slice for page 1', () => {
    const items = Array.from({ length: 200 }, (_, i) => i);
    const slice = getPageSlice(items, 1, guiPostsPerPage, maxGuiPages);
    expect(slice).toHaveLength(15);
    expect(slice[0]).toBe(0);
    expect(slice[14]).toBe(14);
  });

  it('returns correct slice for middle page', () => {
    const items = Array.from({ length: 200 }, (_, i) => i);
    const slice = getPageSlice(items, 5, guiPostsPerPage, maxGuiPages);
    expect(slice).toHaveLength(15);
    expect(slice[0]).toBe(60);
    expect(slice[14]).toBe(74);
  });

  it('returns correct slice for last page', () => {
    const items = Array.from({ length: 200 }, (_, i) => i);
    const slice = getPageSlice(items, 10, guiPostsPerPage, maxGuiPages);
    expect(slice).toHaveLength(15);
    expect(slice[0]).toBe(135);
    expect(slice[14]).toBe(149);
  });

  it('returns partial slice when total items do not fill last page', () => {
    const items = Array.from({ length: 37 }, (_, i) => i);
    const slice = getPageSlice(items, 3, guiPostsPerPage, maxGuiPages);
    expect(slice).toHaveLength(7);
    expect(slice[0]).toBe(30);
    expect(slice[6]).toBe(36);
  });

  it('clamps page when total items shrink (requested page beyond valid range)', () => {
    const items = Array.from({ length: 20 }, (_, i) => i); // only 2 pages of 15
    const slice = getPageSlice(items, 10, guiPostsPerPage, maxGuiPages);
    expect(slice).toHaveLength(5); // page 2 has 5 items (15-19)
    expect(slice[0]).toBe(15);
    expect(slice[4]).toBe(19);
  });

  it('clamps page 1 when requesting page 0 or negative', () => {
    const items = Array.from({ length: 50 }, (_, i) => i);
    const slice0 = getPageSlice(items, 0, guiPostsPerPage, maxGuiPages);
    const sliceNeg = getPageSlice(items, -1, guiPostsPerPage, maxGuiPages);
    expect(slice0).toEqual(getPageSlice(items, 1, guiPostsPerPage, maxGuiPages));
    expect(sliceNeg).toEqual(getPageSlice(items, 1, guiPostsPerPage, maxGuiPages));
  });

  it('returns empty array when guiPostsPerPage or maxGuiPages is 0', () => {
    const items = [1, 2, 3];
    expect(getPageSlice(items, 1, 0, 10)).toEqual([]);
    expect(getPageSlice(items, 1, 15, 0)).toEqual([]);
  });

  it('returns empty array when items is empty', () => {
    expect(getPageSlice([], 1, guiPostsPerPage, maxGuiPages)).toEqual([]);
  });
});
