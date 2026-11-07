import * as React from 'react';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import usePublishPost from '../use-publish-post';
import { startPostingAnalytics } from '../../lib/posting-analytics';
import useChallengesStore from '../../stores/use-challenges-store';
import usePublishPostStore, { createPublishPostStore } from '../../stores/use-publish-post-store';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const act = (React as { act?: (cb: () => void | Promise<void>) => void | Promise<void> }).act as (cb: () => void | Promise<void>) => void | Promise<void>;

const testState = vi.hoisted(() => ({
  abandonNavigationMock: vi.fn(),
  analyticsMock: vi.fn(),
  abandonPublishMock: vi.fn(async () => undefined),
  index: 12,
  lastPublishOptions: undefined as Record<string, any> | undefined,
  publishAuthorBlockedReason: undefined as 'resolving' | 'unresolved' | 'mismatch' | undefined,
  publishCommentMock: vi.fn(),
  duplicateMediaRejectedMock: vi.fn(),
  publishAcceptedMock: vi.fn(),
  publishErrorNavigationMock: vi.fn(),
  pendingPostNavigationMock: vi.fn(),
  signTripcodeMock: vi.fn(),
}));

vi.mock('../use-sign-tripcode', () => ({ default: () => testState.signTripcodeMock }));

vi.mock('../../lib/analytics', () => ({ trackPostingEvent: (...args: unknown[]) => testState.analyticsMock(...args) }));

vi.mock('@bitsocial/bitsocial-react-hooks', () => ({
  usePublishComment: (options: Record<string, any>) => {
    testState.lastPublishOptions = options;
    return {
      abandonPublish: testState.abandonPublishMock,
      index: testState.index,
      publishComment: testState.publishCommentMock,
    };
  },
}));

vi.mock('../use-publish-author-domain-guard', () => ({
  __esModule: true,
  default: () => ({
    blockedReason: testState.publishAuthorBlockedReason,
  }),
  getPublishAuthorDomainErrorMessage: (reason: string) => `blocked:${reason}`,
}));

let container: HTMLDivElement;
let latestValue: ReturnType<typeof usePublishPost>;
let root: Root;

const HookHarness = () => {
  latestValue = usePublishPost({
    communityAddress: 'music.eth',
    onAbandonPost: testState.abandonNavigationMock,
    onDuplicateMediaRejected: testState.duplicateMediaRejectedMock,
    onPublishAccepted: testState.publishAcceptedMock,
    onPublishError: testState.publishErrorNavigationMock,
    onPendingPost: testState.pendingPostNavigationMock,
  });
  return null;
};

const renderHook = () => {
  act(() => {
    root.render(createElement(HookHarness));
  });
};

describe('usePublishPost', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testState.index = 12;
    testState.lastPublishOptions = undefined;
    testState.publishAuthorBlockedReason = undefined;
    useChallengesStore.setState({ challenges: [] });
    usePublishPostStore.getState().resetPublishPostStore();

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    renderHook();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('keeps analytics attached to the submitted attempt after the form unmounts', async () => {
    const attempt = startPostingAnalytics({ kind: 'thread' });
    await act(async () => {
      latestValue.publishPost({ content: 'private draft' }, attempt);
    });
    const callbacks = testState.lastPublishOptions;
    expect(callbacks).not.toHaveProperty('analyticsAttempt');
    await act(async () => {
      root.render(null);
    });
    await callbacks?.onChallengeVerification?.({ challengeSuccess: false, reason: 'rejected' }, { communityAddress: 'music.eth' });
    await callbacks?.onChallengeVerification?.({ challengeSuccess: false, reason: 'rejected' }, { communityAddress: 'music.eth' });
    expect(testState.analyticsMock.mock.calls).toEqual([['post_challenge_failed', { kind: 'thread' }]]);
  });

  it('sends nothing when the board accepts the post', async () => {
    const attempt = startPostingAnalytics({ kind: 'thread' });
    await act(async () => {
      latestValue.publishPost({ content: 'private draft' }, attempt);
    });
    await testState.lastPublishOptions?.onChallengeVerification?.({ challengeSuccess: true }, { communityAddress: 'music.eth' });
    expect(testState.analyticsMock).not.toHaveBeenCalled();
  });

  it('counts explicit challenge cancellation once', async () => {
    const attempt = startPostingAnalytics({ kind: 'thread' });
    await act(async () => {
      latestValue.publishPost({ content: 'draft' }, attempt);
    });
    await act(async () => {
      await testState.lastPublishOptions?.onChallenge?.('captcha', 'nonce');
      await useChallengesStore.getState().abandonCurrentChallenge();
    });
    expect(testState.analyticsMock.mock.calls.map(([event]) => event)).toEqual(['post_cancelled']);
  });

  it('publishes a tripcode post with the proof signed over its final options', async () => {
    let signedFrom: Record<string, unknown> | undefined;
    testState.signTripcodeMock.mockImplementation(async ({ readOptions, writeOptions }: { readOptions: () => any; writeOptions: (options: any) => void }) => {
      signedFrom = readOptions();
      writeOptions({ ...signedFrom, displayName: 'Anon#tc1:proof', timestamp: 1_800_000_000 });
      return true;
    });
    await act(async () => {
      latestValue.publishPost({ content: 'trip thread', displayName: 'Anon', title: 'subject' } as never, undefined, { normal: 'hunter2' });
    });

    expect(testState.signTripcodeMock).toHaveBeenCalledWith(expect.objectContaining({ secret: { normal: 'hunter2' } }));
    expect(signedFrom).toMatchObject({ author: { displayName: 'Anon' }, communityAddress: 'music.eth', content: 'trip thread', title: 'subject' });
    expect(testState.publishCommentMock).toHaveBeenCalledTimes(1);
    expect(testState.lastPublishOptions).toMatchObject({ author: { displayName: 'Anon#tc1:proof' }, timestamp: 1_800_000_000, content: 'trip thread' });
    expect(JSON.stringify(testState.lastPublishOptions)).not.toContain('hunter2');
  });

  it('signs a tripcode post again before each republish after a wrong challenge answer, until the board accepts it', async () => {
    // A proof-shaped name: a normal tripcode's 43-character key and 86-character signature.
    const getProofName = (signature: string) => `Anon#tc1:n${'A'.repeat(43)}${signature.repeat(86)}`;
    const signedFrom: Array<Record<string, any>> = [];
    testState.signTripcodeMock.mockImplementation(async ({ readOptions, writeOptions }: { readOptions: () => any; writeOptions: (options: any) => void }) => {
      const options = readOptions();
      signedFrom.push(options);
      writeOptions({ ...options, displayName: getProofName(String(signedFrom.length)), timestamp: 1_800_000_000 + signedFrom.length });
      return true;
    });
    await act(async () => {
      latestValue.publishPost({ content: 'trip thread', displayName: 'Anon' } as never, undefined, { normal: 'hunter2' });
    });
    const callbacks = testState.lastPublishOptions as Record<string, any>;
    expect(callbacks.author.displayName).toBe(getProofName('1'));

    // The form closes once the post is pending, before any answer to its challenge.
    act(() => root.unmount());
    const published = { communityAddress: 'music.eth', content: 'trip thread', author: { displayName: getProofName('1') }, timestamp: 1_800_000_060 };
    const republished = await callbacks.onBeforeRepublish(published);

    expect(testState.signTripcodeMock).toHaveBeenCalledTimes(2);
    expect(testState.signTripcodeMock).toHaveBeenLastCalledWith(expect.objectContaining({ secret: { normal: 'hunter2' } }));
    expect(signedFrom[1]).toEqual({ ...published, author: { displayName: 'Anon' } });
    expect(republished).toEqual({ ...published, author: { displayName: getProofName('2') }, timestamp: 1_800_000_002 });

    // Accepted: a later republish of the same proof keeps it, and the password is no longer kept.
    await callbacks.onChallengeVerification({ challengeSuccess: true }, { author: { displayName: getProofName('2') } });
    await expect(callbacks.onBeforeRepublish(republished)).resolves.toBe(republished);
    expect(testState.signTripcodeMock).toHaveBeenCalledTimes(2);
    root = createRoot(container);
  });

  it('leaves the republish of a post without a tripcode to the hooks', async () => {
    await act(async () => {
      latestValue.publishPost({ content: 'plain thread', displayName: 'Anon' } as never);
    });

    expect(testState.publishCommentMock).toHaveBeenCalledTimes(1);
    expect(testState.lastPublishOptions).toMatchObject({ author: { displayName: 'Anon' } });
    expect(testState.lastPublishOptions).not.toHaveProperty('onBeforeRepublish');
  });

  it('does not publish a tripcode post whose proof cannot be signed', async () => {
    testState.signTripcodeMock.mockRejectedValue(new Error('error: tripcode_sign_failed'));
    await act(async () => {
      latestValue.publishPost({ content: 'trip thread', displayName: 'Anon' } as never, undefined, { normal: 'hunter2' });
    });

    expect(testState.publishCommentMock).not.toHaveBeenCalled();
    expect(latestValue.publishPostError).toBe('error: tripcode_sign_failed');
    expect(testState.publishErrorNavigationMock).toHaveBeenCalledWith(new Error('error: tripcode_sign_failed'));
  });

  it('drops a tripcode post whose form closes while it is signed, leaving the reset store empty', async () => {
    let finishSigning: () => void = () => {};
    testState.signTripcodeMock.mockImplementation(async ({ isActive, readOptions, writeOptions }) => {
      await new Promise<void>((resolve) => {
        finishSigning = resolve;
      });
      if (!isActive()) return false;
      writeOptions({ ...readOptions(), displayName: 'Anon#tc1:proof', timestamp: 1 });
      return true;
    });
    await act(async () => {
      latestValue.publishPost({ content: 'abandoned', displayName: 'Anon', title: 'old subject' } as never, undefined, { normal: 'hunter2' });
    });

    act(() => root.unmount());
    usePublishPostStore.getState().resetPublishPostStore();
    await act(async () => {
      finishSigning();
    });

    expect(usePublishPostStore.getState().title).toBeUndefined();
    expect(testState.publishCommentMock).not.toHaveBeenCalled();
    root = createRoot(container);
  });

  it("keeps a publish given its own store out of the post form's shared store", async () => {
    const ownStore = createPublishPostStore();
    let ownValue: ReturnType<typeof usePublishPost> | undefined;
    const OwnStoreHarness = () => {
      ownValue = usePublishPost({ communityAddress: 'music.eth', publishPostStore: ownStore });
      return null;
    };
    act(() => {
      root.render(createElement(OwnStoreHarness));
    });

    await act(async () => {
      ownValue?.publishPost({ content: 'background thread', link: 'https://forgeimg.net/abc/file.png', spoiler: true, title: 'subject' } as never);
    });

    expect(testState.publishCommentMock).toHaveBeenCalledTimes(1);
    expect(ownStore.getState()).toMatchObject({ content: 'background thread', link: 'https://forgeimg.net/abc/file.png', spoiler: true, title: 'subject' });
    expect(usePublishPostStore.getState()).toMatchObject({ content: undefined, link: undefined, spoiler: undefined, title: undefined });
  });

  it('sanitizes publish options into portable store state and exposes the publish action', async () => {
    await act(async () => {
      latestValue.setPublishPostOptions({
        author: { displayName: 'Alice' },
        content: '',
        link: '',
        spoiler: true,
        title: 'Hello world',
      } as never);
    });

    expect(latestValue.postIndex).toBe(12);
    expect(typeof latestValue.publishPost).toBe('function');
    expect(latestValue.publishPostOptions).toMatchObject({
      author: { displayName: 'Alice' },
      communityAddress: 'music.eth',
      content: undefined,
      link: undefined,
      spoiler: true,
      title: 'Hello world',
    });
    expect(typeof latestValue.publishPostOptions.onChallengeVerification).toBe('function');
    expect(typeof latestValue.publishPostOptions.onError).toBe('function');
  });

  it('routes publish challenges through the challenge store and abandons the current publish when requested', async () => {
    await act(async () => {
      latestValue.setPublishPostOptions({
        content: 'Thread body',
      } as never);
    });

    expect(typeof testState.lastPublishOptions?.onChallenge).toBe('function');

    await act(async () => {
      await testState.lastPublishOptions?.onChallenge('captcha', 'nonce');
    });

    const challenges = useChallengesStore.getState().challenges;
    expect(challenges).toHaveLength(1);
    expect(challenges[0]?.challenge).toEqual(['captcha', 'nonce']);

    await act(async () => {
      await useChallengesStore.getState().abandonCurrentChallenge();
    });

    expect(testState.abandonNavigationMock).toHaveBeenCalledTimes(1);
    expect(testState.abandonPublishMock).toHaveBeenCalledTimes(1);
    expect(testState.abandonNavigationMock.mock.invocationCallOrder[0]).toBeLessThan(testState.abandonPublishMock.mock.invocationCallOrder[0]);

    await act(async () => {
      latestValue.resetPublishPostOptions();
    });

    expect(latestValue.publishPostOptions).toEqual({});
  });

  it('forwards pending comments before the index state update is rendered', async () => {
    const pendingPost = { communityAddress: 'music.eth', content: 'Thread body', index: 12 };

    await act(async () => {
      await testState.lastPublishOptions?.onPendingComment?.(12, pendingPost);
    });

    expect(testState.pendingPostNavigationMock).toHaveBeenCalledWith(12, pendingPost);
  });

  it('handles optimistic navigation before forwarding publish errors', async () => {
    const existingOnError = vi.fn();
    const error = new Error('publish failed');
    usePublishPostStore.setState({ publishCommentOptions: { onError: existingOnError } });
    renderHook();

    await act(async () => {
      testState.lastPublishOptions?.onError?.(error);
    });

    expect(testState.publishErrorNavigationMock).toHaveBeenCalledWith(error);
    expect(existingOnError).toHaveBeenCalledWith(error);
    expect(testState.publishErrorNavigationMock.mock.invocationCallOrder[0]).toBeLessThan(existingOnError.mock.invocationCallOrder[0]);
  });

  it('abandons duplicate media publications and reports the error without showing the generic challenge alert', async () => {
    const existingOnChallengeVerification = vi.fn();
    usePublishPostStore.setState({ publishCommentOptions: { onChallengeVerification: existingOnChallengeVerification } });
    renderHook();

    await act(async () => {
      await testState.lastPublishOptions?.onChallengeVerification?.(
        {
          challengeErrors: {
            allow: 'This media was already posted recently.',
            review: 'This media was already posted recently.',
          },
          challengeSuccess: false,
        },
        { communityAddress: 'music.eth' },
      );
    });

    expect(testState.duplicateMediaRejectedMock).toHaveBeenCalledWith('This media was already posted recently.');
    expect(testState.abandonNavigationMock).toHaveBeenCalledTimes(1);
    expect(testState.abandonPublishMock).toHaveBeenCalledTimes(1);
    expect(existingOnChallengeVerification).not.toHaveBeenCalled();
  });

  it('clears the preserved draft on successful challenge verification and forwards the verification', async () => {
    const existingOnChallengeVerification = vi.fn();
    const verification = { challengeSuccess: true };
    const comment = { communityAddress: 'music.eth' };
    usePublishPostStore.setState({ publishCommentOptions: { onChallengeVerification: existingOnChallengeVerification } });
    renderHook();

    await act(async () => {
      await testState.lastPublishOptions?.onChallengeVerification?.(verification, comment);
    });

    expect(testState.publishAcceptedMock).toHaveBeenCalledTimes(1);
    expect(existingOnChallengeVerification).toHaveBeenCalledWith(verification, comment);
    expect(testState.abandonPublishMock).not.toHaveBeenCalled();
  });

  it('blocks publish when the active account address is a domain that is not verified yet', async () => {
    testState.publishAuthorBlockedReason = 'unresolved';
    renderHook();

    await act(async () => {
      latestValue.publishPost();
    });

    expect(latestValue.publishPostError).toBe('blocked:unresolved');
    expect(testState.publishErrorNavigationMock).toHaveBeenCalledWith(new Error('blocked:unresolved'));
    expect(testState.publishCommentMock).not.toHaveBeenCalled();
  });

  it('clears the publish error as soon as the post content changes', async () => {
    testState.publishAuthorBlockedReason = 'unresolved';
    renderHook();

    await act(async () => {
      latestValue.publishPost();
    });
    expect(latestValue.publishPostError).toBe('blocked:unresolved');

    act(() => {
      usePublishPostStore.setState({ content: 'edited content' });
    });

    expect(latestValue.publishPostError).toBeNull();
  });

  it('publishes after synchronizing one-shot publish options', async () => {
    await act(async () => {
      latestValue.setPublishPostOptions({
        content: 'Old body',
      } as never);
    });

    await act(async () => {
      latestValue.publishPost({
        content: 'Fresh body',
      } as never);
      await Promise.resolve();
    });

    expect(testState.lastPublishOptions?.content).toBe('Fresh body');
    expect(testState.publishCommentMock).toHaveBeenCalledTimes(1);
  });

  it('keeps a one-shot publish pending and ignores duplicate publish calls until it settles', async () => {
    let resolvePublish: () => void = () => {};
    const publishPromise = new Promise<void>((resolve) => {
      resolvePublish = resolve;
    });
    testState.publishCommentMock.mockReturnValue(publishPromise);

    let firstPublish: Promise<void> | undefined;
    let secondPublish: Promise<void> | undefined;

    await act(async () => {
      firstPublish = latestValue.publishPost({
        content: 'Fresh body',
      } as never);
      secondPublish = latestValue.publishPost({
        content: 'Duplicate body',
      } as never);
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(firstPublish).toBe(secondPublish);
    expect(testState.lastPublishOptions?.content).toBe('Fresh body');
    expect(testState.publishCommentMock).toHaveBeenCalledTimes(1);

    let isSettled = false;
    firstPublish?.then(() => {
      isSettled = true;
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(isSettled).toBe(false);

    await act(async () => {
      resolvePublish();
      await publishPromise;
      await firstPublish;
    });

    expect(isSettled).toBe(true);
  });

  it('clears stale flag data from one-shot publish options', async () => {
    await act(async () => {
      latestValue.setPublishPostOptions({
        content: 'Flag body',
        challengeRequest: {
          challengeAnswers: ['bitsocial-flags:5chan:flag:country:auto'],
        },
        flairs: [{ text: 'flag:country:auto', type: 'country', code: 'auto' }],
      } as never);
    });

    await act(async () => {
      latestValue.publishPost({
        content: 'Plain body',
        challengeRequest: undefined,
        flairs: undefined,
      } as never);
      await Promise.resolve();
    });

    expect(testState.lastPublishOptions?.content).toBe('Plain body');
    expect(testState.lastPublishOptions?.challengeRequest).toBeUndefined();
    expect(testState.lastPublishOptions?.flairs).toBeUndefined();
    expect(testState.publishCommentMock).toHaveBeenCalledTimes(1);
  });
});
