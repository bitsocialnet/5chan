import * as React from 'react';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useQuotedByMap from '../use-quoted-by-map';
import usePostNumberStore from '../../stores/use-post-number-store';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const act = (React as { act?: (cb: () => void | Promise<void>) => void | Promise<void> }).act as (cb: () => void | Promise<void>) => void | Promise<void>;

const testState = vi.hoisted(() => ({
  replies: [] as Array<Record<string, unknown>>,
}));

vi.mock('@bitsocialnet/bitsocial-react-hooks', () => ({}));

let container: HTMLDivElement;
let latestValue: ReturnType<typeof useQuotedByMap>;
let root: Root;

const HookHarness = () => {
  latestValue = useQuotedByMap(testState.replies as never, 'music.eth');
  return null;
};

const renderHook = () => {
  act(() => {
    root.render(createElement(HookHarness));
  });
};

describe('useQuotedByMap', () => {
  beforeEach(() => {
    testState.replies = [];
    usePostNumberStore.setState({
      cidToNumber: { 'op-cid': 1 },
      numberToCid: { 'music.eth': { 1: 'op-cid' } },
    });

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('refreshes mapped replies when a published account reply later gains its post number', () => {
    testState.replies = [
      {
        cid: 'reply-cid',
        content: 'replying to >>1',
        state: 'succeeded',
        subplebbitAddress: 'music.eth',
      },
    ];

    renderHook();

    expect(latestValue.get('op-cid')?.[0]?.number).toBeUndefined();

    testState.replies = [
      {
        ...testState.replies[0],
        number: 42,
      },
    ];

    renderHook();

    expect(latestValue.get('op-cid')?.[0]?.number).toBe(42);
  });
});
