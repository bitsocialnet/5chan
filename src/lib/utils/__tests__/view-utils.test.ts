import { describe, expect, it } from 'vitest';
import {
  isAllView,
  isBoardView,
  isCatalogView,
  isHomeView,
  isModQueueView,
  isModView,
  isNotFoundView,
  isPendingPostView,
  isPostPageView,
  isSettingsView,
  isSubscriptionsView,
} from '../view-utils';

describe('view-utils', () => {
  it('classifies aggregate routes and special app views', () => {
    expect(isAllView('/all')).toBe(true);
    expect(isHomeView('/')).toBe(true);
    expect(isModView('/mod/queue')).toBe(true);
    expect(isModQueueView('/music.eth/mod/queue')).toBe(true);
    expect(isSubscriptionsView('/subs/catalog/settings', {})).toBe(true);
    expect(isPendingPostView('/pending/42/settings', { accountCommentIndex: '42' })).toBe(true);
  });

  it('detects board, catalog, post, and settings routes using board params', () => {
    const params = {
      boardIdentifier: 'music.eth',
      commentCid: 'cid-123',
      accountCommentIndex: '42',
    };

    expect(isBoardView('/music.eth', params)).toBe(true);
    expect(isBoardView('/all', params)).toBe(false);
    expect(isCatalogView('/music.eth/catalog', params)).toBe(true);
    expect(isPostPageView('/music.eth/thread/cid-123', params)).toBe(true);
    expect(isSettingsView('/music.eth/thread/cid-123/settings', params)).toBe(true);
  });

  it('supports deprecated subplebbitAddress params and marks unknown routes as not found', () => {
    const params = {
      subplebbitAddress: 'emoji-🎵.eth',
      commentCid: 'cid-123',
    };

    expect(isBoardView('/emoji-%F0%9F%8E%B5.eth', params)).toBe(true);
    expect(isCatalogView('/emoji-%F0%9F%8E%B5.eth/catalog/settings', params)).toBe(true);
    expect(isPostPageView('/emoji-%F0%9F%8E%B5.eth/thread/cid-123', params)).toBe(true);
    expect(isNotFoundView('/definitely-not-a-route', params)).toBe(true);
    expect(isNotFoundView('/emoji-%F0%9F%8E%B5.eth/thread/cid-123', params)).toBe(false);
  });
});
