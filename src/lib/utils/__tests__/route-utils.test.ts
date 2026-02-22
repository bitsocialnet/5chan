import { describe, it, expect } from 'vitest';
import { normalizeMultiboardFeedPath } from '../route-utils';

describe('normalizeMultiboardFeedPath', () => {
  it('normalizes /all/3 -> /all', () => {
    expect(normalizeMultiboardFeedPath('/all/3')).toBe('/all');
  });

  it('normalizes /all/1w/3 -> /all/1w', () => {
    expect(normalizeMultiboardFeedPath('/all/1w/3')).toBe('/all/1w');
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
    expect(normalizeMultiboardFeedPath('/biz/1w/2')).toBe('/biz/1w/2');
    expect(normalizeMultiboardFeedPath('/biz/catalog/4')).toBe('/biz/catalog/4');
    expect(normalizeMultiboardFeedPath('/pending/0')).toBe('/pending/0');
    expect(normalizeMultiboardFeedPath('/')).toBe('/');
  });
});
