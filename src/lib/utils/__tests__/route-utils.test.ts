import { describe, it, expect } from 'vitest';
import { isFeedRoute, normalizeMultiboardFeedPath } from '../route-utils';

describe('normalizeMultiboardFeedPath', () => {
  it('normalizes /all/3 -> /all', () => {
    expect(normalizeMultiboardFeedPath('/all/3')).toBe('/all');
  });

  it('normalizes /subs/2/settings -> /subs/settings', () => {
    expect(normalizeMultiboardFeedPath('/subs/2/settings')).toBe('/subs/settings');
  });

  it('normalizes /mod/catalog/4 -> /mod/catalog', () => {
    expect(normalizeMultiboardFeedPath('/mod/catalog/4')).toBe('/mod/catalog');
  });

  it('leaves non-multiboard paths unchanged', () => {
    expect(normalizeMultiboardFeedPath('/biz')).toBe('/biz');
    expect(normalizeMultiboardFeedPath('/biz/3')).toBe('/biz/3');
    expect(normalizeMultiboardFeedPath('/biz/catalog/4')).toBe('/biz/catalog/4');
    expect(normalizeMultiboardFeedPath('/pending/0')).toBe('/pending/0');
    expect(normalizeMultiboardFeedPath('/')).toBe('/');
  });
});

describe('isFeedRoute', () => {
  it('returns true for canonical multiboard paths', () => {
    expect(isFeedRoute('/all')).toBe(true);
    expect(isFeedRoute('/all/catalog')).toBe(true);
    expect(isFeedRoute('/subs')).toBe(true);
    expect(isFeedRoute('/subs/catalog')).toBe(true);
    expect(isFeedRoute('/mod')).toBe(true);
    expect(isFeedRoute('/mod/catalog')).toBe(true);
    expect(isFeedRoute('/all/3')).toBe(true);
    expect(isFeedRoute('/subs/2')).toBe(true);
    expect(isFeedRoute('/mod/catalog/4')).toBe(true);
  });

  it('returns false for time-filter paths', () => {
    expect(isFeedRoute('/all/24h')).toBe(false);
    expect(isFeedRoute('/subs/catalog/1w')).toBe(false);
    expect(isFeedRoute('/all/1w/3')).toBe(false);
  });
});
