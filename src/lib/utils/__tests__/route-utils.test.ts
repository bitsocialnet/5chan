import { describe, it, expect } from 'vitest';
import { isBoardModRoute, isFeedRoute, isLegacyBoardModQueueRoute, isModQueueRoute, isValidBoardModRoute, normalizeMultiboardFeedPath } from '../route-utils';

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

  it('returns false for board-scoped mod namespace paths', () => {
    expect(isFeedRoute('/biz/mod')).toBe(false);
    expect(isFeedRoute('/biz/mod/queue')).toBe(false);
  });
});

describe('board mod routes', () => {
  it('recognizes canonical mod queue routes', () => {
    expect(isModQueueRoute('/mod/queue')).toBe(true);
    expect(isModQueueRoute('/biz/mod/queue')).toBe(true);
    expect(isModQueueRoute('/biz/mod/queue/settings')).toBe(true);
  });

  it('does not recognize legacy board modqueue routes', () => {
    expect(isModQueueRoute('/biz/modqueue')).toBe(false);
  });

  it('recognizes legacy board modqueue routes for rejection', () => {
    expect(isLegacyBoardModQueueRoute('/biz/modqueue')).toBe(true);
    expect(isLegacyBoardModQueueRoute('/biz/modqueue/settings')).toBe(true);
    expect(isLegacyBoardModQueueRoute('/biz/mod/queue')).toBe(false);
  });

  it('recognizes board mod namespace paths', () => {
    expect(isBoardModRoute('/biz/mod')).toBe(true);
    expect(isBoardModRoute('/biz/mod/queue')).toBe(true);
    expect(isBoardModRoute('/mod/queue')).toBe(false);
  });

  it('validates allowed board mod routes', () => {
    expect(isValidBoardModRoute('/biz/mod/queue')).toBe(true);
    expect(isValidBoardModRoute('/biz/mod/queue/settings')).toBe(true);
    expect(isValidBoardModRoute('/biz/mod')).toBe(false);
    expect(isValidBoardModRoute('/biz/mod/log')).toBe(false);
    expect(isValidBoardModRoute('/biz/modqueue')).toBe(false);
  });
});
