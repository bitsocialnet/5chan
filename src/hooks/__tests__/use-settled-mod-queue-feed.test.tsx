import * as React from 'react';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Comment } from '@bitsocial/bitsocial-react-hooks';
import useSettledModQueueFeed from '../use-settled-mod-queue-feed';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const act = (React as { act?: (cb: () => void | Promise<void>) => void | Promise<void> }).act as (cb: () => void | Promise<void>) => void | Promise<void>;

interface HarnessProps {
  feed: Comment[];
  feedState: string;
  scopeKey: string;
}

let container: HTMLDivElement;
let latestFeed: Comment[];
let root: Root;

const HookHarness = ({ feed, feedState, scopeKey }: HarnessProps) => {
  latestFeed = useSettledModQueueFeed(feed, feedState, scopeKey);
  return null;
};

const renderHook = (props: HarnessProps) => {
  act(() => {
    root.render(createElement(HookHarness, props));
  });
};

const settledFeed = [{ cid: 'a' }, { cid: 'b' }] as Comment[];

describe('useSettledModQueueFeed', () => {
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('keeps the last settled feed while a refresh rebuilds it', () => {
    renderHook({ feed: settledFeed, feedState: 'succeeded', scopeKey: 'queue' });
    renderHook({ feed: [], feedState: 'fetching', scopeKey: 'queue' });

    expect(latestFeed).toBe(settledFeed);
  });

  it('switches to the newest settled feed', () => {
    const refreshedFeed = [{ cid: 'c' }] as Comment[];
    renderHook({ feed: settledFeed, feedState: 'succeeded', scopeKey: 'queue' });
    renderHook({ feed: refreshedFeed, feedState: 'succeeded', scopeKey: 'queue' });
    renderHook({ feed: [], feedState: 'fetching', scopeKey: 'queue' });

    expect(latestFeed).toBe(refreshedFeed);
  });

  it('does not carry a settled feed into another scope', () => {
    const otherScopeFeed = [] as Comment[];
    renderHook({ feed: settledFeed, feedState: 'succeeded', scopeKey: 'queue' });
    renderHook({ feed: otherScopeFeed, feedState: 'fetching', scopeKey: 'other-queue' });

    expect(latestFeed).toBe(otherScopeFeed);
  });
});
