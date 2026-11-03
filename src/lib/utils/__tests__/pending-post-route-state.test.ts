import { describe, expect, it } from 'vitest';
import { getNonokoPendingAccountCommentIndex, getNonokoPendingRouteState, isNonokoRedirectState, NONOKO_REPLY_ROUTE_STATE } from '../pending-post-route-state';

describe('nonoko route state', () => {
  it('reads the nonoko pending account comment index from direct and wrapped route state', () => {
    expect(getNonokoPendingRouteState(7)).toEqual({ nonokoPendingAccountCommentIndex: 7 });
    expect(getNonokoPendingAccountCommentIndex({ nonokoPendingAccountCommentIndex: 7 })).toBe(7);
    expect(getNonokoPendingAccountCommentIndex({ usr: { nonokoPendingAccountCommentIndex: 8 } })).toBe(8);
    expect(getNonokoPendingAccountCommentIndex({ nonokoPendingAccountCommentIndex: -1 })).toBeUndefined();
    expect(getNonokoPendingAccountCommentIndex({ nonokoPendingAccountCommentIndex: '7' })).toBeUndefined();
  });

  it('recognizes the redirects of nonoko threads and replies only', () => {
    expect(isNonokoRedirectState(getNonokoPendingRouteState(0))).toBe(true);
    expect(isNonokoRedirectState(NONOKO_REPLY_ROUTE_STATE)).toBe(true);
    expect(isNonokoRedirectState({ boardPath: 'g' })).toBe(false);
    expect(isNonokoRedirectState(null)).toBe(false);
  });
});
