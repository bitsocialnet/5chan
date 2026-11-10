import * as React from 'react';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import usePendingCommentModerationActions, { type UsePendingCommentModerationActionsOptions } from '../use-pending-comment-moderation-actions';
import { formatErrorForDisplay } from '../../lib/utils/error-utils';
import useChallengesStore from '../../stores/use-challenges-store';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const act = (React as { act?: (cb: () => void | Promise<void>) => void | Promise<void> }).act as (cb: () => void | Promise<void>) => void | Promise<void>;

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

// One controllable fake per publisher. usePublishCommentModeration is called
// twice (approve + reject); we route by the commentModeration.approved flag.
const testState = vi.hoisted(() => ({
  approve: { publish: vi.fn(async () => undefined), state: 'initializing' as string, error: undefined as unknown, options: undefined as Record<string, any> | undefined },
  reject: { publish: vi.fn(async () => undefined), state: 'initializing' as string, error: undefined as unknown, options: undefined as Record<string, any> | undefined },
}));

vi.mock('@bitsocial/bitsocial-react-hooks', () => ({
  usePublishCommentModeration: (options: Record<string, any>) => {
    const target = options?.commentModeration?.approved === true ? testState.approve : testState.reject;
    target.options = options;
    return {
      publishCommentModeration: target.publish,
      state: target.state,
      error: target.error,
    };
  },
}));

let latestValue: ReturnType<typeof usePendingCommentModerationActions>;
let container: HTMLDivElement;
let root: Root;
let harnessProps: Partial<UsePendingCommentModerationActionsOptions>;

const baseComment = { cid: 'cid-1' } as unknown as UsePendingCommentModerationActionsOptions['comment'];

const HookHarness = () => {
  latestValue = usePendingCommentModerationActions({
    comment: baseComment,
    commentCid: 'cid-1',
    communityAddress: 'board.eth',
    ...harnessProps,
  });
  return null;
};

const createDeferred = () => {
  let resolve: (() => void) | undefined;
  const promise = new Promise<undefined>((promiseResolve) => {
    resolve = () => promiseResolve(undefined);
  });
  return { promise, resolve: () => resolve?.() };
};

const renderHook = () => {
  act(() => {
    root.render(createElement(HookHarness));
  });
};

describe('usePendingCommentModerationActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testState.approve.state = 'initializing';
    testState.approve.error = undefined;
    testState.approve.options = undefined;
    testState.reject.state = 'initializing';
    testState.reject.error = undefined;
    testState.reject.options = undefined;
    harnessProps = {};
    useChallengesStore.setState({ challenges: [] });
    window.confirm = vi.fn(() => true);

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    renderHook();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('publishes the approve moderation after confirmation', async () => {
    await act(async () => {
      await latestValue.handleApprove();
    });

    expect(window.confirm).toHaveBeenCalledTimes(1);
    expect(testState.approve.publish).toHaveBeenCalledTimes(1);
    expect(testState.reject.publish).not.toHaveBeenCalled();
    expect(testState.approve.options?.commentModeration).toEqual({ approved: true });
  });

  it('ignores rapid duplicate approve clicks while the publish is in flight', async () => {
    const pendingApprove = createDeferred();
    testState.approve.publish.mockReturnValueOnce(pendingApprove.promise);

    await act(async () => {
      const firstPublish = latestValue.handleApprove();
      const duplicatePublish = latestValue.handleApprove();
      await Promise.resolve();
      pendingApprove.resolve();
      await Promise.all([firstPublish, duplicatePublish]);
    });

    expect(window.confirm).toHaveBeenCalledTimes(1);
    expect(testState.approve.publish).toHaveBeenCalledTimes(1);
    expect(testState.reject.publish).not.toHaveBeenCalled();
  });

  it('publishes the reject moderation after confirmation', async () => {
    await act(async () => {
      await latestValue.handleReject();
    });

    expect(testState.reject.publish).toHaveBeenCalledTimes(1);
    expect(testState.approve.publish).not.toHaveBeenCalled();
    expect(testState.reject.options?.commentModeration).toEqual({ approved: false });
  });

  it('ignores rapid duplicate reject clicks while the publish is in flight', async () => {
    const pendingReject = createDeferred();
    testState.reject.publish.mockReturnValueOnce(pendingReject.promise);

    await act(async () => {
      const firstPublish = latestValue.handleReject();
      const duplicatePublish = latestValue.handleReject();
      await Promise.resolve();
      pendingReject.resolve();
      await Promise.all([firstPublish, duplicatePublish]);
    });

    expect(window.confirm).toHaveBeenCalledTimes(1);
    expect(testState.reject.publish).toHaveBeenCalledTimes(1);
    expect(testState.approve.publish).not.toHaveBeenCalled();
  });

  it('does not publish when the confirmation is cancelled', async () => {
    window.confirm = vi.fn(() => false);

    await act(async () => {
      await latestValue.handleApprove();
    });

    expect(window.confirm).toHaveBeenCalledTimes(1);
    expect(testState.approve.publish).not.toHaveBeenCalled();
  });

  it('runs only the success callback for the action that was taken', async () => {
    const onApproveSuccess = vi.fn();
    const onRejectSuccess = vi.fn();
    harnessProps = { onApproveSuccess, onRejectSuccess };
    renderHook();

    await act(async () => {
      await latestValue.handleApprove();
    });
    await act(async () => {
      await testState.approve.options?.onChallengeVerification({ challengeSuccess: true }, { cid: 'moderation' });
    });

    expect(onApproveSuccess).toHaveBeenCalledTimes(1);
    expect(onRejectSuccess).not.toHaveBeenCalled();
  });

  it('waits for a successful challenge verification before running the success callback', async () => {
    const onApproveSuccess = vi.fn();
    const onRejectSuccess = vi.fn();
    harnessProps = { onApproveSuccess, onRejectSuccess };
    renderHook();
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => undefined);

    // The publish action resolves as soon as the moderation is queued, before the community answers.
    await act(async () => {
      await latestValue.handleApprove();
    });
    expect(onApproveSuccess).not.toHaveBeenCalled();

    await act(async () => {
      await testState.approve.options?.onChallengeVerification({ challengeSuccess: false, reason: 'wrong answer' }, { cid: 'moderation' });
    });
    expect(onApproveSuccess).not.toHaveBeenCalled();

    await act(async () => {
      await latestValue.handleReject();
    });
    await act(async () => {
      await testState.reject.options?.onChallengeVerification({ challengeSuccess: true }, { cid: 'moderation' });
    });
    expect(onRejectSuccess).toHaveBeenCalledTimes(1);
    expect(onApproveSuccess).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it('lets the moderator act again after closing the moderation challenge', async () => {
    const onApproveSuccess = vi.fn();
    harnessProps = { onApproveSuccess };
    renderHook();

    await act(async () => {
      await latestValue.handleApprove();
    });
    testState.approve.state = 'waiting-challenge-answers';
    renderHook();
    expect(latestValue.isPublishing).toBe(true);

    await act(async () => {
      await testState.approve.options?.onChallenge({ challenges: [] }, { cid: 'moderation' });
    });
    await act(async () => {
      await useChallengesStore.getState().abandonCurrentChallenge();
    });

    expect(latestValue.isPublishing).toBe(false);
    expect(latestValue.status).toBeNull();
    expect(onApproveSuccess).not.toHaveBeenCalled();

    await act(async () => {
      await latestValue.handleApprove();
    });
    expect(testState.approve.publish).toHaveBeenCalledTimes(2);
    expect(latestValue.isPublishing).toBe(true);
  });

  it('reports a challenge answer that fails to publish as failed so the moderator can act again', async () => {
    const onApproveSuccess = vi.fn();
    harnessProps = { onApproveSuccess };
    renderHook();

    await act(async () => {
      await latestValue.handleApprove();
    });
    testState.approve.state = 'waiting-challenge-answers';
    await act(async () => {
      await testState.approve.options?.onChallenge({ challenges: [] }, { cid: 'moderation' });
    });
    // The challenge modal closes without abandoning when the answers are submitted. If they fail to
    // publish, only the hooks publishing state moves to 'failed': no onError or verification follows.
    act(() => useChallengesStore.getState().removeChallenge());
    testState.approve.state = 'failed';
    renderHook();

    expect(latestValue.isPublishing).toBe(false);
    expect(latestValue.status).toBe('failed');
    expect(onApproveSuccess).not.toHaveBeenCalled();

    // The retry is publishing even though the hooks state still says 'failed' until its own challenge arrives.
    await act(async () => {
      await latestValue.handleApprove();
    });
    expect(testState.approve.publish).toHaveBeenCalledTimes(2);
    expect(latestValue.isPublishing).toBe(true);
    expect(latestValue.status).toBeNull();
  });

  it('withholds the community address from the publishers when disabled', () => {
    harnessProps = { enabled: false };
    renderHook();

    expect(testState.approve.options?.communityAddress).toBeUndefined();
    expect(testState.reject.options?.communityAddress).toBeUndefined();
  });

  it('exposes failed status and the formatted error message for the failed action', async () => {
    await act(async () => {
      await latestValue.handleApprove();
    });

    const error = new Error('boom');
    testState.approve.state = 'failed';
    testState.approve.error = error;
    await act(async () => {
      testState.approve.options?.onError(error);
    });
    renderHook();

    expect(latestValue.status).toBe('failed');
    expect(latestValue.error).toBe(error);
    expect(latestValue.errorMessage).toBeTruthy();
    expect(latestValue.errorMessage).toBe(formatErrorForDisplay(error));
  });

  it('reports a publish that errors before any state change as failed instead of publishing', async () => {
    const error = new Error('cannot publish');
    // The hooks action catches its own error and reports it only through onError, without a publishing state.
    testState.approve.publish.mockImplementationOnce(async () => {
      testState.approve.error = error;
      testState.approve.options?.onError(error);
      return undefined;
    });
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await act(async () => {
      await latestValue.handleApprove();
    });

    expect(latestValue.isPublishing).toBe(false);
    expect(latestValue.status).toBe('failed');
    expect(latestValue.errorMessage).toBe(formatErrorForDisplay(error));
    consoleErrorSpy.mockRestore();
  });

  it('starts a fresh attempt when the moderator retries after a rejected approve', async () => {
    const onApproveSuccess = vi.fn();
    harnessProps = { onApproveSuccess };
    renderHook();
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => undefined);

    await act(async () => {
      await latestValue.handleApprove();
    });
    testState.approve.state = 'failed';
    await act(async () => {
      await testState.approve.options?.onChallengeVerification({ challengeSuccess: false, challengeErrors: { 0: 'wrong answer' } }, { cid: 'moderation' });
    });
    renderHook();

    expect(latestValue.status).toBe('failed');
    expect(latestValue.isPublishing).toBe(false);
    expect(latestValue.errorMessage).toContain('wrong answer');

    // The hooks publishing state still says 'failed' until the retry reaches the community.
    await act(async () => {
      await latestValue.handleApprove();
    });

    expect(testState.approve.publish).toHaveBeenCalledTimes(2);
    expect(latestValue.isPublishing).toBe(true);
    expect(latestValue.status).toBeNull();
    expect(latestValue.errorMessage).toBeUndefined();

    testState.approve.state = 'succeeded';
    await act(async () => {
      await testState.approve.options?.onChallengeVerification({ challengeSuccess: true }, { cid: 'moderation' });
    });
    renderHook();

    expect(latestValue.status).toBe('approved');
    expect(latestValue.isPublishing).toBe(false);
    expect(onApproveSuccess).toHaveBeenCalledTimes(1);
    alertSpy.mockRestore();
  });
});
