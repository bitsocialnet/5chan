import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import usePublishPostStore from '../use-publish-post-store';
import usePublishReplyStore from '../use-publish-reply-store';

type PublishPostInput = Parameters<ReturnType<typeof usePublishPostStore.getState>['setPublishPostStore']>[0];
type PublishReplyInput = Parameters<ReturnType<typeof usePublishReplyStore.getState>['setPublishReplyStore']>[0];

const testState = vi.hoisted(() => ({
  alertChallengeVerificationFailedMock: vi.fn(),
  alertMock: vi.fn(),
}));

vi.mock('../../lib/utils/challenge-utils', () => ({
  alertChallengeVerificationFailed: (challengeVerification: unknown, comment: unknown) => testState.alertChallengeVerificationFailedMock(challengeVerification, comment),
}));

describe('publish stores', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    testState.alertChallengeVerificationFailedMock.mockReset();
    testState.alertMock.mockReset();
    vi.stubGlobal('alert', testState.alertMock);
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    usePublishPostStore.getState().resetPublishPostStore();
    usePublishReplyStore.getState().resetPublishReplyStore('parent-1');
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    vi.unstubAllGlobals();
    usePublishPostStore.getState().resetPublishPostStore();
    usePublishReplyStore.getState().resetPublishReplyStore('parent-1');
  });

  it('usePublishPostStore derives display name, payload options, and resets cleanly', () => {
    const comment: PublishPostInput = {
      author: { address: '0x123', displayName: 'Author Name', role: 'mod' },
      content: 'post body',
      displayName: 'Poster Alias',
      link: 'https://example.com',
      spoiler: true,
      subplebbitAddress: 'music-posting.eth',
      title: 'Hello',
    };

    usePublishPostStore.getState().setPublishPostStore(comment);

    const state = usePublishPostStore.getState();
    expect(state.displayName).toBe('Poster Alias');
    expect(state.author).toEqual({ address: '0x123', role: 'mod', displayName: 'Poster Alias' });
    expect(state.publishCommentOptions.author).toEqual({ address: '0x123', role: 'mod', displayName: 'Poster Alias' });
    expect(state.publishCommentOptions.subplebbitAddress).toBe('music-posting.eth');
    expect(state.publishCommentOptions.title).toBe('Hello');

    state.publishCommentOptions.onChallengeVerification?.({} as never, comment);
    expect(testState.alertChallengeVerificationFailedMock).toHaveBeenCalledWith({}, comment);

    state.publishCommentOptions.onError?.(new Error('publish failed'));
    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(testState.alertMock).toHaveBeenCalledWith('publish failed');

    state.resetPublishPostStore();
    expect(usePublishPostStore.getState().publishCommentOptions).toEqual({});
    expect(usePublishPostStore.getState().title).toBeUndefined();
  });

  it('usePublishReplyStore stores reply data per parentCid and resets a single thread', () => {
    const comment: PublishReplyInput = {
      author: { address: '0x123', displayName: 'Author Name', role: 'mod' },
      content: 'reply body',
      displayName: 'Reply Alias',
      link: 'https://example.com/reply',
      parentCid: 'parent-1',
      spoiler: false,
      subplebbitAddress: 'music-posting.eth',
    };

    usePublishReplyStore.getState().setPublishReplyStore(comment);

    const state = usePublishReplyStore.getState();
    expect(state.displayName['parent-1']).toBe('Reply Alias');
    expect(state.author['parent-1']).toEqual({ address: '0x123', role: 'mod', displayName: 'Reply Alias' });
    expect(state.publishCommentOptions['parent-1']?.parentCid).toBe('parent-1');
    expect(state.publishCommentOptions['parent-1']?.postCid).toBe('parent-1');

    state.publishCommentOptions['parent-1']?.onChallengeVerification?.({ token: 'challenge' } as never, comment);
    expect(testState.alertChallengeVerificationFailedMock).toHaveBeenCalledWith({ token: 'challenge' }, comment);

    state.publishCommentOptions['parent-1']?.onError?.(new Error('reply failed'));
    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(testState.alertMock).toHaveBeenCalledWith('reply failed');

    state.resetPublishReplyStore('parent-1');
    expect(usePublishReplyStore.getState().publishCommentOptions['parent-1']).toBeUndefined();
    expect(usePublishReplyStore.getState().content['parent-1']).toBeUndefined();
  });
});
