import { beforeEach, describe, expect, it } from 'vitest';
import { clearStableLastVisitTimeFilterName, getSearchWithTimeFilter, getStableLastVisitTimeFilterName, LAST_VISIT_STORAGE_KEY } from '../time-filter-utils';

describe('last-visit time filter', () => {
  beforeEach(() => {
    clearStableLastVisitTimeFilterName();
    localStorage.removeItem(LAST_VISIT_STORAGE_KEY);
  });

  it('starts a first visit on the freshest full-day window', () => {
    expect(getStableLastVisitTimeFilterName()).toBe('24h');
  });
});

describe('getSearchWithTimeFilter', () => {
  it('keeps a custom board list readable when the time filter changes', () => {
    expect(getSearchWithTimeFilter('?c=g,sci', '1w')).toBe('?c=g,sci&t=1w');
  });
});
