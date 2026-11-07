import * as React from 'react';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import usePublishReply from '../use-publish-reply';
import { startPostingAnalytics } from '../../lib/posting-analytics';
import useChallengesStore from '../../stores/use-challenges-store';
import usePostNumberStore from '../../stores/use-post-number-store';
import usePublishReplyStore from '../../stores/use-publish-reply-store';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const act = (React as { act?: (cb: () => void | Promise<void>) => void | Promise<void> }).act as (cb: () => void | Promise<void>) => void | Promise<void>;

const testState = vi.hoisted(() => ({
  account: { id: 'account-1' } as Record<string, any>,
  analyticsMock: vi.fn(),
  abandonPublishMock: vi.fn(async () => undefined),
  directories: [] as Array<Record<string, unknown>>,
  index: 7,
  lastPublishOptions: undefined as Record<string, any> | undefined,
  publishAuthorBlockedReason: undefined as 'resolving' | 'unresolved' | 'mismatch' | undefined,
  publishCommentMock: vi.fn(),
  resolveExternalQuoteTargetMock: vi.fn(),
  signTripcodeMock: vi.fn(),
}));

vi.mock('../use-sign-tripcode', () => ({ default: () => testState.signTripcodeMock }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => (options ? `${key}:${JSON.stringify(options)}` : key),
  }),
}));

vi.mock('../../lib/analytics', () => ({ trackPostingEvent: (...args: unknown[]) => testState.analyticsMock(...args) }));

vi.mock('@bitsocial/bitsocial-react-hooks', () => ({
  useAccount: () => testState.account,
  usePublishComment: (options: Record<string, any>) => {
    testState.lastPublishOptions = options;
    return {
      abandonPublish: testState.abandonPublishMock,
      index: testState.index,
      publishComment: testState.publishCommentMock,
    };
  },
}));

vi.mock('../../hooks/use-directories', () => ({
  useDirectories: () => testState.directories,
  normalizeBoardAddress: (address?: string) => address?.replace(/(\.bso|\.eth)$/u, ''),
}));

vi.mock('../../lib/utils/external-quote-resolver', () => ({
  resolveExternalQuoteTarget: (...args: any[]) => testState.resolveExternalQuoteTargetMock(...args),
}));

vi.mock('../use-publish-author-domain-guard', () => ({
  __esModule: true,
  default: () => ({
    blockedReason: testState.publishAuthorBlockedReason,
  }),
  getPublishAuthorDomainErrorMessage: (reason: string) => `blocked:${reason}`,
}));

let container: HTMLDivElement;
let latestValue: ReturnType<typeof usePublishReply>;
let root: Root;

const HookHarness = () => {
  latestValue = usePublishReply({ cid: 'parent-cid', communityAddress: 'music.eth' });
  return null;
};

const renderHook = () => {
  act(() => {
    root.render(createElement(HookHarness));
  });
};

describe('usePublishReply', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testState.account = { id: 'account-1' };
    testState.directories = [];
    testState.index = 7;
    testState.lastPublishOptions = undefined;
    testState.publishAuthorBlockedReason = undefined;
    useChallengesStore.setState({ challenges: [] });
    // 'quoted-cid' (post #12) lives under the reply's own thread (postCid falls back to 'parent-cid').
    usePostNumberStore.setState({ cidToNumber: {}, numberToCid: { 'music.eth': { 12: 'quoted-cid' } }, cidToPostCid: { 'quoted-cid': 'parent-cid' } });
    usePublishReplyStore.setState({
      author: {},
      challengeRequest: {},
      content: {},
      displayName: {},
      flairs: {},
      link: {},
      publishCommentOptions: {},
      spoiler: {},
    });

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
    const attempt = startPostingAnalytics({ kind: 'reply' });
    await act(async () => {
      latestValue.publishReply({ content: 'private draft' }, attempt);
    });
    const callbacks = testState.lastPublishOptions;
    expect(callbacks).not.toHaveProperty('analyticsAttempt');
    await act(async () => {
      root.render(null);
    });
    await callbacks?.onChallengeVerification?.({ challengeSuccess: false, reason: 'rejected' }, { communityAddress: 'music.eth' });
    await callbacks?.onChallengeVerification?.({ challengeSuccess: false, reason: 'rejected' }, { communityAddress: 'music.eth' });
    expect(testState.analyticsMock.mock.calls).toEqual([['post_challenge_failed', { kind: 'reply' }]]);
  });

  it('sends nothing when the board accepts the post', async () => {
    const attempt = startPostingAnalytics({ kind: 'reply' });
    await act(async () => {
      latestValue.publishReply({ content: 'private draft' }, attempt);
    });
    await testState.lastPublishOptions?.onChallengeVerification?.({ challengeSuccess: true }, { communityAddress: 'music.eth' });
    expect(testState.analyticsMock).not.toHaveBeenCalled();
  });

  it('counts explicit challenge cancellation once', async () => {
    const attempt = startPostingAnalytics({ kind: 'reply' });
    await act(async () => {
      latestValue.publishReply({ content: 'draft' }, attempt);
    });
    await act(async () => {
      await testState.lastPublishOptions?.onChallenge?.('captcha', 'nonce');
      await useChallengesStore.getState().abandonCurrentChallenge();
    });
    expect(testState.analyticsMock.mock.calls.map(([event]) => event)).toEqual(['post_cancelled']);
  });

  it('builds reply publish options with derived quoted cids and exposes the publish action', async () => {
    await act(async () => {
      latestValue.setPublishReplyOptions({
        author: { displayName: 'Bob' },
        content: 'Replying to >>12',
        link: '',
        spoiler: true,
      } as never);
    });

    expect(latestValue.replyIndex).toBe(7);
    expect(typeof latestValue.publishReply).toBe('function');
    expect(testState.lastPublishOptions).toMatchObject({
      author: { displayName: 'Bob' },
      communityAddress: 'music.eth',
      content: 'Replying to >>12',
      link: undefined,
      parentCid: 'parent-cid',
      postCid: 'parent-cid',
      quotedCids: ['quoted-cid'],
      spoiler: true,
    });
  });

  it('drops cross-thread quoted cids so the protocol does not reject the publish', async () => {
    // Post #12 resolves to a comment that lives under a different thread; quoting it must not be
    // published as a quotedCid (ERR_QUOTED_CID_NOT_UNDER_POST), even though the >>12 text stays.
    usePostNumberStore.setState({ cidToPostCid: { 'quoted-cid': 'another-thread-cid' } });

    await act(async () => {
      latestValue.setPublishReplyOptions({
        content: 'Replying to >>12',
      } as never);
    });

    expect(testState.lastPublishOptions).toMatchObject({
      content: 'Replying to >>12',
      parentCid: 'parent-cid',
      postCid: 'parent-cid',
    });
    expect(testState.lastPublishOptions?.quotedCids).toBeUndefined();
  });

  it('drops cross-thread cids that arrive via stored publish options, keeping same-thread ones', async () => {
    // Defense in depth: even quotedCids carried on the stored publish options must be filtered to
    // the reply's own thread before publishing, never bypassing the same-thread guard.
    await act(async () => {
      usePostNumberStore.setState({ cidToPostCid: { 'quoted-cid': 'parent-cid', 'foreign-cid': 'other-thread-cid' } });
      usePublishReplyStore.setState({
        publishCommentOptions: {
          'parent-cid': { content: 'body', parentCid: 'parent-cid', postCid: 'parent-cid', quotedCids: ['quoted-cid', 'foreign-cid'] },
        },
      });
    });

    expect(testState.lastPublishOptions?.quotedCids).toEqual(['quoted-cid']);
  });

  it('resolves same-board external quote references before triggering publish', async () => {
    testState.resolveExternalQuoteTargetMock.mockResolvedValue({
      cid: 'external-cid',
      route: '/music/thread/external-cid',
      communityAddress: 'music.eth',
    });
    // The resolver registers whatever it finds; here #44 turns out to be an unloaded reply under
    // this same thread, so its cid is allowed in the published quotedCids.
    usePostNumberStore.setState({ cidToPostCid: { 'quoted-cid': 'parent-cid', 'external-cid': 'parent-cid' } });

    await act(async () => {
      latestValue.setPublishReplyOptions({
        content: 'Replying to >>44',
      } as never);
    });

    await act(async () => {
      latestValue.publishReply();
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 0));
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(testState.resolveExternalQuoteTargetMock).toHaveBeenCalledTimes(1);
    expect(testState.lastPublishOptions?.quotedCids).toEqual(['external-cid']);
    expect(testState.publishCommentMock).toHaveBeenCalledTimes(1);
  });

  it('does not resolve cross-board numeric quotes before publish', async () => {
    await act(async () => {
      latestValue.setPublishReplyOptions({
        content: 'Replying to >>>/fit/44',
      } as never);
    });

    await act(async () => {
      latestValue.publishReply();
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 0));
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(testState.resolveExternalQuoteTargetMock).not.toHaveBeenCalled();
    expect(testState.lastPublishOptions?.quotedCids).toBeUndefined();
    expect(testState.publishCommentMock).toHaveBeenCalledTimes(1);
  });

  it('publishes after synchronizing one-shot reply options', async () => {
    await act(async () => {
      latestValue.setPublishReplyOptions({
        content: 'Old reply',
      } as never);
    });

    await act(async () => {
      latestValue.publishReply({
        content: 'Fresh reply',
      } as never);
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 0));
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(testState.lastPublishOptions?.content).toBe('Fresh reply');
    expect(testState.publishCommentMock).toHaveBeenCalledTimes(1);
  });

  it('publishes a tripcode reply with the proof signed over its final options', async () => {
    let signedFrom: Record<string, unknown> | undefined;
    testState.signTripcodeMock.mockImplementation(async ({ readOptions, writeOptions }: { readOptions: () => any; writeOptions: (options: any) => void }) => {
      signedFrom = readOptions();
      writeOptions({ ...signedFrom, displayName: 'Anon#tc1:proof', timestamp: 1_800_000_000 });
      return true;
    });
    await act(async () => {
      latestValue.publishReply({ content: 'Trip reply', displayName: 'Anon' } as never, undefined, { secure: 'hunter2' });
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(testState.signTripcodeMock).toHaveBeenCalledWith(expect.objectContaining({ secret: { secure: 'hunter2' } }));
    expect(signedFrom).toMatchObject({ author: { displayName: 'Anon' }, content: 'Trip reply', parentCid: 'parent-cid', postCid: 'parent-cid' });
    expect(testState.publishCommentMock).toHaveBeenCalledTimes(1);
    expect(testState.lastPublishOptions).toMatchObject({ author: { displayName: 'Anon#tc1:proof' }, timestamp: 1_800_000_000, content: 'Trip reply' });
    expect(JSON.stringify(testState.lastPublishOptions)).not.toContain('hunter2');
  });

  it('signs a tripcode reply again before its republish after a wrong challenge answer', async () => {
    // A proof-shaped name: a secure tripcode's 43-character key and 86-character signature.
    const getProofName = (signature: string) => `Anon#tc1:s${'A'.repeat(43)}${signature.repeat(86)}`;
    const signedFrom: Array<Record<string, any>> = [];
    testState.signTripcodeMock.mockImplementation(async ({ readOptions, writeOptions }: { readOptions: () => any; writeOptions: (options: any) => void }) => {
      const options = readOptions();
      signedFrom.push(options);
      writeOptions({ ...options, displayName: getProofName(String(signedFrom.length)), timestamp: 1_800_000_000 + signedFrom.length });
      return true;
    });
    await act(async () => {
      latestValue.publishReply({ content: 'Trip reply', displayName: 'Anon' } as never, undefined, { secure: 'hunter2' });
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const callbacks = testState.lastPublishOptions as Record<string, any>;
    expect(callbacks.author.displayName).toBe(getProofName('1'));

    const published = {
      communityAddress: 'music.eth',
      parentCid: 'parent-cid',
      postCid: 'parent-cid',
      content: 'Trip reply',
      author: { displayName: getProofName('1') },
      timestamp: 1_800_000_060,
    };
    const republished = await callbacks.onBeforeRepublish(published);

    expect(testState.signTripcodeMock).toHaveBeenLastCalledWith(expect.objectContaining({ secret: { secure: 'hunter2' } }));
    expect(signedFrom[1]).toEqual({ ...published, author: { displayName: 'Anon' } });
    expect(republished).toEqual({ ...published, author: { displayName: getProofName('2') }, timestamp: 1_800_000_002 });

    await callbacks.onChallengeVerification({ challengeSuccess: true }, { author: { displayName: getProofName('2') } });
    await expect(callbacks.onBeforeRepublish(republished)).resolves.toBe(republished);
    expect(testState.signTripcodeMock).toHaveBeenCalledTimes(2);
  });

  it("drops a tripcode reply's password when its publish fails or is abandoned", async () => {
    const proofName = `Anon#tc1:s${'A'.repeat(43)}${'B'.repeat(86)}`;
    testState.signTripcodeMock.mockImplementation(async ({ readOptions, writeOptions }: { readOptions: () => any; writeOptions: (options: any) => void }) => {
      writeOptions({ ...readOptions(), displayName: proofName, timestamp: 1_800_000_001 });
      return true;
    });
    const published = {
      communityAddress: 'music.eth',
      parentCid: 'parent-cid',
      postCid: 'parent-cid',
      content: 'Trip reply',
      author: { displayName: proofName },
      timestamp: 1_800_000_060,
    };
    const publishTripcodeReply = async () => {
      await act(async () => {
        latestValue.publishReply({ content: 'Trip reply', displayName: 'Anon' } as never, undefined, { secure: 'hunter2' });
        await new Promise((resolve) => setTimeout(resolve, 0));
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      return testState.lastPublishOptions as Record<string, any>;
    };

    const failed = await publishTripcodeReply();
    failed.onError(new Error('publish failed'));
    await expect(failed.onBeforeRepublish(published)).resolves.toBe(published);

    const abandoned = await publishTripcodeReply();
    await act(async () => {
      await abandoned.onChallenge('captcha', 'nonce');
      await useChallengesStore.getState().abandonCurrentChallenge();
    });
    await expect(abandoned.onBeforeRepublish(published)).resolves.toBe(published);
    expect(testState.signTripcodeMock).toHaveBeenCalledTimes(2);
  });

  it('leaves the republish of a reply without a tripcode to the hooks', async () => {
    await act(async () => {
      latestValue.publishReply({ content: 'Plain reply', displayName: 'Anon' } as never);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(testState.publishCommentMock).toHaveBeenCalledTimes(1);
    expect(testState.lastPublishOptions).not.toHaveProperty('onBeforeRepublish');
  });

  it('keeps a one-shot reply pending and ignores duplicate publish calls until it settles', async () => {
    let resolvePublish: () => void = () => {};
    const publishPromise = new Promise<void>((resolve) => {
      resolvePublish = resolve;
    });
    testState.publishCommentMock.mockReturnValue(publishPromise);

    let firstPublish: Promise<void> | undefined;
    let secondPublish: Promise<void> | undefined;

    await act(async () => {
      firstPublish = latestValue.publishReply({
        content: 'Fresh reply',
      } as never);
      secondPublish = latestValue.publishReply({
        content: 'Duplicate reply',
      } as never);
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 0));
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(firstPublish).toBe(secondPublish);
    expect(testState.lastPublishOptions?.content).toBe('Fresh reply');
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

  it('clears stale flag data from one-shot reply options', async () => {
    await act(async () => {
      latestValue.setPublishReplyOptions({
        content: 'Flag reply',
        challengeRequest: {
          challengeAnswers: ['bitsocial-flags:5chan:flag:country:auto'],
        },
        flairs: [{ text: 'flag:country:auto', type: 'country', code: 'auto' }],
      } as never);
    });

    await act(async () => {
      latestValue.publishReply({
        content: 'Plain reply',
        challengeRequest: undefined,
        flairs: undefined,
      } as never);
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 0));
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(testState.lastPublishOptions?.content).toBe('Plain reply');
    expect(testState.lastPublishOptions?.challengeRequest).toBeUndefined();
    expect(testState.lastPublishOptions?.flairs).toBeUndefined();
    expect(testState.publishCommentMock).toHaveBeenCalledTimes(1);
  });

  it('blocks publish when a same-board external quote cannot be resolved', async () => {
    testState.resolveExternalQuoteTargetMock.mockResolvedValue(null);

    await act(async () => {
      latestValue.setPublishReplyOptions({
        content: 'Replying to >>44',
      } as never);
    });

    await act(async () => {
      latestValue.publishReply();
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(latestValue.publishReplyError).toContain('external_quote_publish_missing');
    expect(testState.publishCommentMock).not.toHaveBeenCalled();
  });

  it('blocks publish when the active account address is a domain that is not verified yet', async () => {
    testState.publishAuthorBlockedReason = 'unresolved';
    renderHook();

    await act(async () => {
      latestValue.publishReply();
      await Promise.resolve();
    });

    expect(latestValue.publishReplyError).toBe('blocked:unresolved');
    expect(testState.publishCommentMock).not.toHaveBeenCalled();
  });

  it('clears the publish error as soon as the reply content changes', async () => {
    testState.publishAuthorBlockedReason = 'unresolved';
    renderHook();

    await act(async () => {
      latestValue.publishReply();
      await Promise.resolve();
    });
    expect(latestValue.publishReplyError).toBe('blocked:unresolved');

    act(() => {
      usePublishReplyStore.setState({ content: { 'parent-cid': 'edited reply' } });
    });

    expect(latestValue.publishReplyError).toBeNull();
  });

  it('queues reply challenges and clears the scoped reply store on reset', async () => {
    await act(async () => {
      latestValue.setPublishReplyOptions({
        content: 'Body',
      } as never);
    });

    expect(typeof testState.lastPublishOptions?.onChallenge).toBe('function');

    await act(async () => {
      await testState.lastPublishOptions?.onChallenge('captcha');
    });

    expect(useChallengesStore.getState().challenges).toHaveLength(1);

    await act(async () => {
      await useChallengesStore.getState().abandonCurrentChallenge();
    });

    expect(testState.abandonPublishMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      latestValue.resetPublishReplyOptions();
    });

    expect(usePublishReplyStore.getState().publishCommentOptions['parent-cid']).toBeUndefined();
  });
});
