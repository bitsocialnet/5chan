import * as React from 'react';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { decodeCommentCidCommunityAddress, useCommentCidPayload } from '../use-comment-cid-payload';
import { accountsStore } from '../../lib/bitsocial-internals/stores';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const act = (React as { act?: (cb: () => void | Promise<void>) => void | Promise<void> }).act as (cb: () => void | Promise<void>) => void | Promise<void>;

vi.mock('../../lib/bitsocial-internals/stores', async () => {
  const { create } = await import('zustand');
  return {
    accountsStore: create(() => ({ accounts: {}, activeAccountId: undefined, accountsComments: {}, accountsCommentsReplies: {} })),
  };
});

const setAccount = (account: { pkc?: { fetchCid: ReturnType<typeof vi.fn> }; name?: string } | undefined) =>
  accountsStore.setState({ accounts: account ? { 'account-1': account } : {}, activeAccountId: account ? 'account-1' : undefined });

let container: HTMLDivElement;
let latestSnapshot: ReturnType<typeof useCommentCidPayload> | undefined;
let root: Root;

const HookHarness = ({ cid }: { cid?: string }) => {
  latestSnapshot = useCommentCidPayload(cid);
  return null;
};

const renderCid = async (cid?: string) => {
  await act(async () => {
    root.render(createElement(HookHarness, { cid }));
  });
};

describe('useCommentCidPayload', () => {
  beforeEach(() => {
    latestSnapshot = undefined;
    setAccount(undefined);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('decodes the community name from a fetched CID wrapper', () => {
    expect(
      decodeCommentCidCommunityAddress('comment-cid', {
        content: JSON.stringify({
          communityName: 'business-and-finance.bso',
          communityPublicKey: 'community-key',
          content: 'thread body',
        }),
      }),
    ).toBe('business-and-finance.bso');
  });

  it('falls back to the community public key for unnamed communities', () => {
    const encoded = new TextEncoder().encode(JSON.stringify({ communityPublicKey: 'community-key', content: 'thread body' }));

    expect(decodeCommentCidCommunityAddress('comment-cid', { content: encoded })).toBe('community-key');
  });

  it('accepts an already decoded comment payload', () => {
    expect(decodeCommentCidCommunityAddress('comment-cid', { communityName: 'outdoors.bso', content: 'thread body' })).toBe('outdoors.bso');
  });

  it('rejects CID payloads without a community identifier', () => {
    expect(() => decodeCommentCidCommunityAddress('comment-cid', { content: JSON.stringify({ content: 'thread body' }) })).toThrow(
      "CID 'comment-cid' did not contain a community identifier",
    );
  });

  it('fetches the immutable CID once and publishes its community address', async () => {
    const fetchCid = vi.fn().mockResolvedValue({
      content: JSON.stringify({ communityName: 'videogames-strategy.bso', content: 'thread body' }),
    });
    setAccount({ pkc: { fetchCid } });

    await act(async () => {
      root.render(createElement(React.Fragment, null, createElement(HookHarness, { cid: 'comment-cid' }), createElement(HookHarness, { cid: 'comment-cid' })));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchCid).toHaveBeenCalledOnce();
    expect(fetchCid).toHaveBeenCalledWith({ cid: 'comment-cid' });
    expect(latestSnapshot).toEqual({ communityAddress: 'videogames-strategy.bso', state: 'succeeded' });
  });

  it('reuses the successful snapshot immediately after unmounting and revisiting a thread', async () => {
    const fetchCid = vi.fn().mockResolvedValue({ communityName: 'music.bso' });
    setAccount({ pkc: { fetchCid } });
    await renderCid('thread-cid');
    const successfulSnapshot = latestSnapshot;
    await act(async () => root.render(null));
    await renderCid('thread-cid');

    expect(fetchCid).toHaveBeenCalledOnce();
    expect(latestSnapshot).toBe(successfulSnapshot);
    expect(latestSnapshot?.state).toBe('succeeded');
  });

  it('keeps a pending request shared when its original subscriber leaves and another arrives', async () => {
    let resolveFetch!: (value: unknown) => void;
    const fetchCid = vi.fn().mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve;
      }),
    );
    setAccount({ pkc: { fetchCid } });
    await renderCid('pending-cid');
    await act(async () => root.render(null));
    await renderCid('pending-cid');

    expect(fetchCid).toHaveBeenCalledOnce();
    expect(latestSnapshot?.state).toBe('fetching');
    await act(async () => resolveFetch({ communityName: 'music.bso' }));
    expect(latestSnapshot).toEqual({ communityAddress: 'music.bso', state: 'succeeded' });
  });

  it('retains a successful request that finishes after all subscribers leave', async () => {
    let resolveFetch!: (value: unknown) => void;
    const fetchCid = vi.fn().mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve;
      }),
    );
    setAccount({ pkc: { fetchCid } });
    await renderCid('pending-cid');
    await act(async () => root.render(null));
    await act(async () => resolveFetch({ communityName: 'music.bso' }));
    await renderCid('pending-cid');

    expect(fetchCid).toHaveBeenCalledOnce();
    expect(latestSnapshot).toEqual({ communityAddress: 'music.bso', state: 'succeeded' });
  });

  it('retries a failed lookup after its last subscriber leaves', async () => {
    const fetchCid = vi.fn().mockRejectedValueOnce(new Error('temporary failure')).mockResolvedValueOnce({ communityName: 'music.bso' });
    setAccount({ pkc: { fetchCid } });
    await renderCid('retry-cid');
    expect(latestSnapshot?.state).toBe('failed');
    await act(async () => root.render(null));
    await renderCid('retry-cid');

    expect(fetchCid).toHaveBeenCalledTimes(2);
    expect(latestSnapshot).toEqual({ communityAddress: 'music.bso', state: 'succeeded' });
  });

  it('isolates cached results by client and stays idle without a client or CID', async () => {
    const firstClient = { fetchCid: vi.fn().mockResolvedValue({ communityName: 'first.bso' }) };
    const secondClient = { fetchCid: vi.fn().mockResolvedValue({ communityName: 'second.bso' }) };
    setAccount({ pkc: firstClient });
    await renderCid();
    expect(latestSnapshot).toEqual({ state: 'idle' });
    expect(firstClient.fetchCid).not.toHaveBeenCalled();
    await renderCid('shared-cid');
    expect(latestSnapshot?.communityAddress).toBe('first.bso');

    await act(async () => setAccount({ pkc: secondClient }));
    expect(latestSnapshot?.communityAddress).toBe('second.bso');
    await act(async () => setAccount(undefined));
    expect(latestSnapshot).toEqual({ state: 'idle' });
    await act(async () => setAccount({ pkc: firstClient }));
    expect(latestSnapshot?.communityAddress).toBe('first.bso');
    expect(firstClient.fetchCid).toHaveBeenCalledOnce();
    expect(secondClient.fetchCid).toHaveBeenCalledOnce();
  });

  it('bounds inactive successes and retains recently revisited threads', async () => {
    const fetchCid = vi.fn().mockResolvedValue({ communityName: 'music.bso' });
    setAccount({ pkc: { fetchCid } });
    for (let index = 0; index < 100; index++) await renderCid(`thread-${index}`);
    await renderCid('thread-0');
    await renderCid('thread-100');
    await renderCid('thread-0');
    expect(fetchCid).toHaveBeenCalledTimes(101);

    await renderCid('thread-1');
    expect(fetchCid).toHaveBeenCalledTimes(102);
  });

  it('does not commit or refetch when account metadata, comments, or notifications change', async () => {
    const pkc = { fetchCid: vi.fn().mockResolvedValue({ communityName: 'music.bso' }) };
    setAccount({ pkc });
    const onRender = vi.fn();
    await act(async () =>
      root.render(
        <React.Profiler id='payload' onRender={onRender}>
          <HookHarness cid='thread' />
        </React.Profiler>,
      ),
    );
    expect(latestSnapshot?.state).toBe('succeeded');
    onRender.mockClear();

    await act(async () => {
      setAccount({ pkc, name: 'renamed' });
      accountsStore.setState({
        accountsComments: { 'account-1': [{ cid: 'own-comment', index: 0, accountId: 'account-1' }] },
        accountsCommentsReplies: { 'account-1': { notification: { markedAsRead: false } } },
      });
    });
    expect(onRender).not.toHaveBeenCalled();
    expect(pkc.fetchCid).toHaveBeenCalledOnce();
  });

  it('updates for account arrival and client switching without committing an old pending result', async () => {
    let resolveFirst!: (value: unknown) => void;
    const firstClient = {
      fetchCid: vi.fn().mockReturnValue(
        new Promise((resolve) => {
          resolveFirst = resolve;
        }),
      ),
    };
    const secondClient = { fetchCid: vi.fn().mockResolvedValue({ communityName: 'second.bso' }) };
    await renderCid('thread');
    expect(latestSnapshot?.state).toBe('idle');
    await act(async () => setAccount({ pkc: firstClient }));
    expect(latestSnapshot?.state).toBe('fetching');

    await act(async () =>
      accountsStore.setState((state) => ({
        activeAccountId: 'account-2',
        accounts: { ...state.accounts, 'account-2': { pkc: secondClient } },
      })),
    );
    expect(latestSnapshot).toEqual({ state: 'succeeded', communityAddress: 'second.bso' });
    await act(async () => resolveFirst({ communityName: 'first.bso' }));
    expect(latestSnapshot).toEqual({ state: 'succeeded', communityAddress: 'second.bso' });

    await act(async () => accountsStore.setState({ activeAccountId: 'account-1' }));
    expect(latestSnapshot).toEqual({ state: 'succeeded', communityAddress: 'first.bso' });
    expect(firstClient.fetchCid).toHaveBeenCalledOnce();
    expect(secondClient.fetchCid).toHaveBeenCalledOnce();
  });
});
