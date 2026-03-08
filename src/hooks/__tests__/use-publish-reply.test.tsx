import * as React from 'react';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import usePublishReply from '../use-publish-reply';
import useChallengesStore from '../../stores/use-challenges-store';
import usePostNumberStore from '../../stores/use-post-number-store';
import usePublishReplyStore from '../../stores/use-publish-reply-store';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const act = (React as { act?: (cb: () => void | Promise<void>) => void | Promise<void> }).act as (cb: () => void | Promise<void>) => void | Promise<void>;

const testState = vi.hoisted(() => ({
  abandonPublishMock: vi.fn(async () => undefined),
  index: 7,
  lastPublishOptions: undefined as Record<string, any> | undefined,
  publishCommentMock: vi.fn(),
}));

vi.mock('@bitsocialhq/bitsocial-react-hooks', () => ({
  usePublishComment: (options: Record<string, any>) => {
    testState.lastPublishOptions = options;
    return {
      abandonPublish: testState.abandonPublishMock,
      index: testState.index,
      publishComment: testState.publishCommentMock,
    };
  },
}));

let container: HTMLDivElement;
let latestValue: ReturnType<typeof usePublishReply>;
let root: Root;

const HookHarness = () => {
  latestValue = usePublishReply({ cid: 'parent-cid', subplebbitAddress: 'music.eth' });
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
    testState.index = 7;
    testState.lastPublishOptions = undefined;
    useChallengesStore.setState({ challenges: [] });
    usePostNumberStore.setState({ cidToNumber: {}, numberToCid: { 'music.eth': { 12: 'quoted-cid' } } });
    usePublishReplyStore.setState({
      author: {},
      content: {},
      displayName: {},
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
    expect(latestValue.publishReply).toBe(testState.publishCommentMock);
    expect(testState.lastPublishOptions).toMatchObject({
      author: { displayName: 'Bob' },
      content: 'Replying to >>12',
      link: undefined,
      parentCid: 'parent-cid',
      postCid: 'parent-cid',
      quotedCids: ['quoted-cid'],
      spoiler: true,
      subplebbitAddress: 'music.eth',
    });
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
