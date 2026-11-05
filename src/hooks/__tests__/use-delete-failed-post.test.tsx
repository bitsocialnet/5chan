import * as React from 'react';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useDeleteFailedPost, { getFailedPostRetryPublishOptions } from '../use-delete-failed-post';
import useChallengesStore from '../../stores/use-challenges-store';
import useFailedPostRetryStore from '../../stores/use-failed-post-retry-store';
import useTripcodeStore from '../../stores/use-tripcode-store';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const act = (React as { act?: (cb: () => void | Promise<void>) => void | Promise<void> }).act as (cb: () => void | Promise<void>) => void | Promise<void>;

const testState = vi.hoisted(() => ({
  abandonPublishMock: vi.fn(async () => undefined),
  alertChallengeVerificationFailedMock: vi.fn(),
  alertMock: vi.fn(),
  deleteCommentMock: vi.fn(async (_targetComment: string | number) => undefined),
  lastPublishOptions: undefined as Record<string, any> | undefined,
  navigateMock: vi.fn(),
  publishCommentMock: vi.fn(async () => undefined),
  publishIndex: undefined as number | undefined,
  signTripcodeMock: vi.fn(),
}));

vi.mock('../use-sign-tripcode', () => ({ default: () => testState.signTripcodeMock }));

vi.mock('react-router-dom', () => ({
  useNavigate: () => testState.navigateMock,
}));

vi.mock('@bitsocial/bitsocial-react-hooks', () => ({
  deleteComment: (targetComment: string | number) => testState.deleteCommentMock(targetComment),
  usePublishComment: (options: Record<string, any> | undefined) => {
    testState.lastPublishOptions = options;
    return {
      abandonPublish: testState.abandonPublishMock,
      index: testState.publishIndex,
      publishComment: testState.publishCommentMock,
    };
  },
}));

vi.mock('../../lib/utils/challenge-utils', () => ({
  alertChallengeVerificationFailed: (...args: any[]) => testState.alertChallengeVerificationFailedMock(...args),
  redactGeneratedFortuneFromChallenge: (challenge: unknown) => challenge,
}));

let container: HTMLDivElement;
let latestValue: ReturnType<typeof useDeleteFailedPost>;
let root: Root;

const failedPost = {
  accountId: 'account-1',
  author: {
    address: '0x123',
    displayName: 'Alice',
    shortAddress: '0x1234',
  },
  cid: 'failed-cid',
  clients: { ipfs: { gateway: { state: 'failed' } } },
  communityAddress: 'music.eth',
  content: 'retry me',
  depth: 1,
  error: new Error('boom'),
  errors: [new Error('boom')],
  index: 7,
  link: 'https://example.com/file.png',
  parentCid: 'parent-1',
  postCid: 'post-1',
  publishingState: 'failed',
  quotedCids: ['quoted-1'],
  shortCommunityAddress: 'music…eth',
  spoiler: true,
  state: 'failed',
  timestamp: 1_735_689_600,
  title: 'Hello',
};

const HookHarness = ({ deleteRedirectPath, post }: { deleteRedirectPath?: string; post: typeof failedPost }) => {
  latestValue = useDeleteFailedPost(post, deleteRedirectPath);
  return null;
};

const renderHook = (post = failedPost, deleteRedirectPath?: string) => {
  act(() => {
    root.render(createElement(HookHarness, { deleteRedirectPath, post }));
  });
};

const flushEffects = async (count = 4) => {
  for (let i = 0; i < count; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
};

describe('useDeleteFailedPost', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testState.lastPublishOptions = undefined;
    testState.publishIndex = undefined;
    vi.stubGlobal('alert', testState.alertMock);
    useChallengesStore.setState({ challenges: [] });
    useFailedPostRetryStore.setState({ retryingAccountCommentIndex: null });

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    renderHook();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it('extracts retry-safe publish options from a failed comment', () => {
    expect(getFailedPostRetryPublishOptions(failedPost)).toEqual({
      author: {
        address: '0x123',
        displayName: 'Alice',
      },
      communityAddress: 'music.eth',
      content: 'retry me',
      link: 'https://example.com/file.png',
      parentCid: 'parent-1',
      postCid: 'post-1',
      quotedCids: ['quoted-1'],
      spoiler: true,
      title: 'Hello',
    });
  });

  it('deletes the failed row and republishes with the stored publish payload', async () => {
    expect(testState.lastPublishOptions).toMatchObject({
      author: {
        address: '0x123',
        displayName: 'Alice',
      },
      communityAddress: 'music.eth',
      content: 'retry me',
      link: 'https://example.com/file.png',
      parentCid: 'parent-1',
      postCid: 'post-1',
      quotedCids: ['quoted-1'],
      spoiler: true,
      title: 'Hello',
    });
    expect(typeof testState.lastPublishOptions?.onChallenge).toBe('function');
    expect(typeof testState.lastPublishOptions?.onChallengeVerification).toBe('function');
    expect(typeof testState.lastPublishOptions?.onError).toBe('function');

    await act(async () => {
      await latestValue.onRetryFailedPost();
    });

    expect(testState.deleteCommentMock).toHaveBeenCalledWith('failed-cid');
    expect(testState.publishCommentMock).toHaveBeenCalledTimes(1);
  });

  // A proof-shaped name: a normal tripcode's 43-character key and 86-character signature.
  const getProofName = (publicKey: string, signature: string) => `Alice#tc1:n${publicKey.repeat(43)}${signature.repeat(86)}`;
  const tripcodePost = { ...failedPost, author: { ...failedPost.author, displayName: getProofName('A', 'B') } };

  const signRetryAs = (displayName: string) => {
    let signedFrom: Record<string, unknown> | undefined;
    testState.signTripcodeMock.mockImplementation(async ({ readOptions, writeOptions }) => {
      signedFrom = readOptions();
      writeOptions({ ...signedFrom, displayName, timestamp: 1_800_000_000 });
      return true;
    });
    return () => signedFrom;
  };

  const retryTripcodePost = async (tripcodeInput: string | undefined) => {
    useTripcodeStore.setState({ inputs: tripcodeInput ? { 'account-1': tripcodeInput } : {} });
    renderHook(tripcodePost);
    await act(async () => {
      await latestValue.onRetryFailedPost();
    });
    await flushEffects();
    useTripcodeStore.setState({ inputs: {} });
  };

  it('signs a tripcode post again for its retry, which publishes with a new timestamp', async () => {
    expect(getFailedPostRetryPublishOptions(tripcodePost)?.author).toEqual({ address: '0x123', displayName: 'Alice' });
    const getSignedFrom = signRetryAs(getProofName('A', 'C'));

    await retryTripcodePost('#hunter2');

    expect(testState.signTripcodeMock).toHaveBeenCalledWith(expect.objectContaining({ secret: { normal: 'hunter2' } }));
    expect(getSignedFrom()).toMatchObject({ author: { address: '0x123', displayName: 'Alice' } });
    expect(testState.publishCommentMock).toHaveBeenCalledTimes(1);
    expect(testState.lastPublishOptions).toMatchObject({ author: { displayName: getProofName('A', 'C') }, timestamp: 1_800_000_000 });
  });

  it("does not retry a tripcode post once the name field no longer holds the post's tripcode", async () => {
    // The field was cleared: the post would be republished without the trip it showed.
    await retryTripcodePost(undefined);

    expect(testState.signTripcodeMock).not.toHaveBeenCalled();
    expect(testState.publishCommentMock).not.toHaveBeenCalled();
    expect(testState.alertMock).toHaveBeenCalledTimes(1);

    // The field holds another tripcode: the post would be republished under a different trip.
    signRetryAs(getProofName('D', 'C'));
    await retryTripcodePost('#other');

    expect(testState.signTripcodeMock).toHaveBeenCalledTimes(1);
    expect(testState.deleteCommentMock).not.toHaveBeenCalled();
    expect(testState.publishCommentMock).not.toHaveBeenCalled();
    expect(testState.alertMock).toHaveBeenCalledTimes(2);
    expect(latestValue.isRetryingFailedPost).toBe(false);
  });

  it('redirects retry publishes to the new pending row', async () => {
    testState.publishCommentMock.mockImplementationOnce(async () => {
      testState.publishIndex = 12;
    });

    await act(async () => {
      await latestValue.onRetryFailedPost();
    });
    renderHook();
    await flushEffects();

    expect(testState.navigateMock).toHaveBeenCalledWith('/pending/12', { replace: true });
  });

  it('flags the failed row as mid-retry while republishing and clears it after the redirect', async () => {
    let flaggedIndexDuringPublish: number | null = null;
    testState.publishCommentMock.mockImplementationOnce(async () => {
      flaggedIndexDuringPublish = useFailedPostRetryStore.getState().retryingAccountCommentIndex;
      testState.publishIndex = 12;
    });

    await act(async () => {
      await latestValue.onRetryFailedPost();
    });

    // The pending view reads this flag to avoid redirecting away during the delete/republish gap.
    expect(flaggedIndexDuringPublish).toBe(failedPost.index);

    renderHook();
    await flushEffects();

    expect(testState.navigateMock).toHaveBeenCalledWith('/pending/12', { replace: true });
    expect(useFailedPostRetryStore.getState().retryingAccountCommentIndex).toBeNull();
  });

  it('clears the mid-retry flag when republishing throws', async () => {
    testState.publishCommentMock.mockImplementationOnce(async () => {
      throw new Error('offline');
    });

    await act(async () => {
      await latestValue.onRetryFailedPost();
    });

    expect(useFailedPostRetryStore.getState().retryingAccountCommentIndex).toBeNull();
  });

  it('redirects after deleting a failed post when a redirect path is provided', async () => {
    renderHook(failedPost, '/mu');

    await act(async () => {
      await latestValue.onDeleteFailedPost();
    });

    expect(testState.deleteCommentMock).toHaveBeenCalledWith('failed-cid');
    expect(testState.navigateMock).toHaveBeenCalledWith('/mu', { replace: true });
  });

  it('routes retry challenges through the challenge store and preserves abandon behavior', async () => {
    await act(async () => {
      await testState.lastPublishOptions?.onChallenge('captcha', 'nonce');
    });

    const challenges = useChallengesStore.getState().challenges;
    expect(challenges).toHaveLength(1);
    expect(challenges[0]?.challenge).toEqual(['captcha', 'nonce']);

    await act(async () => {
      await useChallengesStore.getState().abandonCurrentChallenge();
    });

    expect(testState.abandonPublishMock).toHaveBeenCalledTimes(1);
  });

  it('clears the mid-retry flag when the republish challenge is abandoned', async () => {
    useFailedPostRetryStore.setState({ retryingAccountCommentIndex: failedPost.index });

    await act(async () => {
      await testState.lastPublishOptions?.onChallenge('captcha', 'nonce');
    });

    await act(async () => {
      await useChallengesStore.getState().abandonCurrentChallenge();
    });

    expect(testState.abandonPublishMock).toHaveBeenCalledTimes(1);
    expect(useFailedPostRetryStore.getState().retryingAccountCommentIndex).toBeNull();
  });
});
