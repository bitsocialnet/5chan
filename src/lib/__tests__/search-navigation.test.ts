import { describe, expect, it } from 'vitest';
import { getSearchSubmitPath, MAX_SEARCH_QUERY_LENGTH } from '../search-navigation';

describe('getSearchSubmitPath', () => {
  it('searches ordinary terms', () => {
    expect(getSearchSubmitPath('old internet culture')).toBe('/search?q=old+internet+culture');
    expect(getSearchSubmitPath('  bitcoin  ')).toBe('/search?q=bitcoin');
  });

  it('searches a board code, name or address instead of opening the board', () => {
    // "lit" may be a word to find in posts; the results page lists /lit/ above them either way.
    expect(getSearchSubmitPath('lit')).toBe('/search?q=lit');
    expect(getSearchSubmitPath('/g/')).toBe('/search?q=%2Fg%2F');
    expect(getSearchSubmitPath('Music')).toBe('/search?q=Music');
    expect(getSearchSubmitPath('music-posting.bso')).toBe('/search?q=music-posting.bso');
    expect(getSearchSubmitPath('12D3KooWQdQ6TkVA1Xe9zzaFP6vXBgsLeMAewpLpLwbsAYKivnQy')).toBe('/search?q=12D3KooWQdQ6TkVA1Xe9zzaFP6vXBgsLeMAewpLpLwbsAYKivnQy');
  });

  it('caps the query at the search length limit', () => {
    const longQuery = 'a'.repeat(MAX_SEARCH_QUERY_LENGTH + 20);
    expect(getSearchSubmitPath(longQuery)).toBe(`/search?q=${'a'.repeat(MAX_SEARCH_QUERY_LENGTH)}`);
  });

  it('ignores empty input', () => {
    expect(getSearchSubmitPath('   ')).toBeNull();
    expect(getSearchSubmitPath('')).toBeNull();
  });
});
