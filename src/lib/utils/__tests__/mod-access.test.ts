import { describe, expect, it } from 'vitest';
import { canAccessBoardModQueue, hasModQueueAccessRole } from '../mod-access';

describe('hasModQueueAccessRole', () => {
  it('accepts board moderation roles', () => {
    expect(hasModQueueAccessRole('owner')).toBe(true);
    expect(hasModQueueAccessRole('admin')).toBe(true);
    expect(hasModQueueAccessRole('moderator')).toBe(true);
  });

  it('rejects missing and unrelated roles', () => {
    expect(hasModQueueAccessRole(undefined)).toBe(false);
    expect(hasModQueueAccessRole('viewer')).toBe(false);
  });
});

describe('canAccessBoardModQueue', () => {
  it('allows access when the current board role is moderator even without cached board membership', () => {
    expect(
      canAccessBoardModQueue({
        boardAddress: '12D3KooWNFgjQWX2EUEs7pixdjkWSLh21EZ9NeYnV8iMaCyYhLGJ',
        accountCommunityAddresses: [],
        accountRole: 'moderator',
      }),
    ).toBe(true);
  });

  it('allows access when the cached moderated board matches by alias', () => {
    expect(
      canAccessBoardModQueue({
        boardAddress: 'music-posting.eth',
        accountCommunityAddresses: ['music-posting.bso'],
      }),
    ).toBe(true);
  });

  it('rejects access when neither the role nor moderated board list matches', () => {
    expect(
      canAccessBoardModQueue({
        boardAddress: 'music-posting.eth',
        accountCommunityAddresses: ['tech-posting.eth'],
      }),
    ).toBe(false);
  });
});
