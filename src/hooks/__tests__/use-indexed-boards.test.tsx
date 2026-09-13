import * as React from 'react';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetIndexedBoardsForTests, retryIndexedBoards, useIndexedBoards, type IndexedBoardsState } from '../use-indexed-boards';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const act = (React as { act?: (cb: () => void | Promise<void>) => void | Promise<void> }).act as (cb: () => void | Promise<void>) => void | Promise<void>;

const board = { address: 'music-posting.bso', description: null, nsfw: 0, post_count: 50, title: '/mu/ - Music' };

let latest: IndexedBoardsState | null = null;
let container: HTMLDivElement;
let root: Root;

const Harness = ({ providerId }: { providerId: string | null }) => {
  latest = useIndexedBoards(providerId);
  return null;
};

const render = async (providerId: string | null) => {
  await act(async () => {
    root.render(createElement(Harness, { providerId }));
    await Promise.resolve();
  });
};

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

describe('useIndexedBoards', () => {
  beforeEach(() => {
    __resetIndexedBoardsForTests();
    latest = null;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('asks the provider once, keeps its list for an hour, and stops loading', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let answer: (response: { ok: boolean; json: () => Promise<unknown> }) => void = () => {};
    const fetchMock = vi.fn().mockReturnValue(new Promise((resolve) => (answer = resolve)));
    vi.stubGlobal('fetch', fetchMock);

    await render(null);
    // The list is in flight until the provider answers.
    expect(latest?.loading).toBe(true);
    await act(async () => {
      answer({ ok: true, json: async () => ({ communities: [board] }) });
    });
    await flush();

    expect(latest).toEqual({ boards: [board], loading: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.5archive.org/api/communities');

    // A second subscriber within the hour reads the same list without another request.
    act(() => root.unmount());
    root = createRoot(container);
    await render(null);
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(latest?.boards).toEqual([board]);

    // The refresh button does not throw the answered list away.
    retryIndexedBoards(null);
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps the boards it has when every provider fails, and lets the refresh button ask again', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    vi.stubGlobal('fetch', fetchMock);

    await render(null);
    await flush();
    expect(latest).toEqual({ boards: [], loading: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Within the retry delay nothing is asked again on its own...
    act(() => root.unmount());
    root = createRoot(container);
    await render(null);
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // ...but the refresh button does, and the answer replaces the empty list.
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ communities: [board] }) });
    await act(async () => {
      retryIndexedBoards(null);
    });
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(latest?.boards).toEqual([board]);
  });

  it('reads a pinned indexer through its own list', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ communities: [board] }) });
    vi.stubGlobal('fetch', fetchMock);

    await render('5archive');
    await flush();
    expect(latest?.boards).toEqual([board]);

    // The automatic chain is a separate list, asked for on its own.
    await render(null);
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(latest?.boards).toEqual([board]);
  });
});
