import { describe, expect, it } from 'vitest';
import { findDirectoryByAddress, getFallbackDirectoriesData, getFallbackDirectoryDefaults } from '../directories';
import { normalizeBoardAddress } from '../directory-list-lookup-utils';

describe('directories', () => {
  it('normalizes aliases and finds matching directories by exact or alias address', () => {
    const communities = [
      {
        address: 'music-posting.bso',
        name: 'music-posting.bso',
        publicKey: '12D3KooWQdQ6TkVA1Xe9zzaFP6vXBgsLeMAewpLpLwbsAYKivnQy',
        title: '/mu/ - Music',
      },
      { address: 'business.eth', title: '/biz/ - Business & Finance' },
    ];

    expect(normalizeBoardAddress('music-posting.eth')).toBe('music-posting');
    expect(normalizeBoardAddress('business.bso')).toBe('business');
    expect(normalizeBoardAddress('business.xyz')).toBe('business.xyz');

    expect(findDirectoryByAddress(communities, 'music-posting.bso')?.address).toBe('music-posting.bso');
    expect(findDirectoryByAddress(communities, 'music-posting.eth')?.address).toBe('music-posting.bso');
    expect(findDirectoryByAddress(communities, '12D3KooWQdQ6TkVA1Xe9zzaFP6vXBgsLeMAewpLpLwbsAYKivnQy')?.address).toBe('music-posting.bso');
    expect(findDirectoryByAddress([], '12D3KooWNFgjQWX2EUEs7pixdjkWSLh21EZ9NeYnV8iMaCyYhLGJ')).toBeUndefined();
    expect(findDirectoryByAddress(communities, undefined)).toBeUndefined();
  });

  // Guards the vendored JSON glob path: a wrong path yields an empty fallback with no compile error.
  it('builds non-empty fallback directories and defaults from the vendored lists', () => {
    expect(getFallbackDirectoriesData().communities.length).toBeGreaterThan(0);
    expect(Object.keys(getFallbackDirectoryDefaults().directories).length).toBeGreaterThan(0);
  });
});
