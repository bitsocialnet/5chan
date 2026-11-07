import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetDirectoryVoteVisitsForTests, getDirectoryVoteVisits, recordDirectoryVoteVisits } from '../directory-vote-visits';

const STORAGE_KEY = '5chan-directory-vote-visits';

describe('directory vote visits', () => {
  beforeEach(() => __resetDirectoryVoteVisitsForTests());
  afterEach(() => vi.restoreAllMocks());

  it('keeps the latest visit to each directory', () => {
    recordDirectoryVoteVisits(['a', 'b'], 2_000);
    recordDirectoryVoteVisits(['a'], 1_000);
    recordDirectoryVoteVisits(['b'], 3_000);

    expect(getDirectoryVoteVisits()).toEqual({ a: 2_000, b: 3_000 });
  });

  it("merges into another tab's visits instead of overwriting them", () => {
    recordDirectoryVoteVisits(['a'], 1_000);
    // Another tab records a visit after this one last wrote.
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ a: 1_000, b: 5_000 }));

    recordDirectoryVoteVisits(['c'], 2_000);

    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')).toEqual({ a: 1_000, b: 5_000, c: 2_000 });
  });

  it('ignores a malformed stored value', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ a: 'yesterday', b: 4_000 }));
    expect(getDirectoryVoteVisits()).toEqual({ b: 4_000 });

    localStorage.setItem(STORAGE_KEY, 'not json');
    expect(getDirectoryVoteVisits()).toEqual({});
  });

  it('keeps visits for the session when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });

    recordDirectoryVoteVisits(['a'], 1_000);

    expect(getDirectoryVoteVisits()).toEqual({ a: 1_000 });
  });
});
