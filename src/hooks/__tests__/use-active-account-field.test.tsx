import * as React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { accountsStore } from '../../lib/bitsocial-internals/stores';
import { useActiveAccountField } from '../use-active-account-field';
import useAuthorPrivileges from '../use-author-privileges';
import { useBoardSearch } from '../use-board-search';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const act = React.act;

vi.mock('../../lib/bitsocial-internals/stores', async () => {
  const { create } = await import('zustand');
  return {
    accountsStore: create(() => ({ accounts: {}, activeAccountId: undefined, accountsComments: {}, accountsCommentsReplies: {} })),
  };
});

vi.mock('../use-stable-community', () => {
  const community = { roles: { first: { role: 'moderator' }, second: { role: 'member' } } };
  return { useCommunityField: (_address: string, selector: (value: typeof community) => unknown) => selector(community) };
});

vi.mock('../use-directories', () => {
  const directories: unknown[] = [];
  return { useDirectories: () => directories };
});

vi.mock('../use-indexed-boards', () => {
  const state = { boards: [], loading: false };
  return { useIndexedBoards: () => state };
});

vi.mock('../../lib/utils/route-utils', () => ({ getBoardPath: (address: string) => address }));

let container: HTMLDivElement;
let root: Root;
let latestAddress: string | undefined;
let latestPrivileges: ReturnType<typeof useAuthorPrivileges>;
let latestBoards: ReturnType<typeof useBoardSearch>;

const HookHarness = () => {
  latestAddress = useActiveAccountField((account) => account?.author?.address);
  latestPrivileges = useAuthorPrivileges({ commentAuthorAddress: 'first', communityAddress: 'test.bso' });
  latestBoards = useBoardSearch('subscription-probe', null);
  return null;
};

describe('active account field subscriptions', () => {
  beforeEach(() => {
    accountsStore.setState({ activeAccountId: undefined, accounts: {}, accountsComments: {}, accountsCommentsReplies: {} });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('keeps author privileges and board search idle for unrelated account and notification changes', async () => {
    const firstAccount = { author: { address: 'first' }, subscriptions: ['subscription-probe-first.bso'] };
    accountsStore.setState({ activeAccountId: 'first', accounts: { first: firstAccount } });
    const onRender = vi.fn();
    await act(async () =>
      root.render(
        <React.Profiler id='account-fields' onRender={onRender}>
          <HookHarness />
        </React.Profiler>,
      ),
    );
    expect(latestPrivileges.isAccountMod).toBe(true);
    expect(latestPrivileges.isAccountCommentAuthor).toBe(true);
    expect(latestBoards.boards.map((board) => board.address)).toContain('subscription-probe-first.bso');
    const initialBoards = latestBoards.boards;
    onRender.mockClear();

    await act(async () =>
      accountsStore.setState((state) => ({
        accounts: {
          ...state.accounts,
          first: { ...firstAccount, name: 'renamed', author: { ...firstAccount.author, displayName: 'updated' }, blockedCids: { other: true } },
          inactive: { author: { address: 'inactive' }, subscriptions: ['subscription-probe-inactive.bso'] },
        },
        accountsComments: { first: [{ cid: 'own-comment', index: 0, accountId: 'first' }] },
        accountsCommentsReplies: { first: { notification: { markedAsRead: false } } },
      })),
    );
    expect(onRender).not.toHaveBeenCalled();
    expect(latestBoards.boards).toBe(initialBoards);

    await act(async () =>
      accountsStore.setState((state) => ({
        accounts: { ...state.accounts, first: { ...state.accounts.first, subscriptions: ['subscription-probe-updated.bso'] } },
      })),
    );
    expect(onRender).toHaveBeenCalledOnce();
    expect(latestBoards.boards.map((board) => board.address)).toContain('subscription-probe-updated.bso');
    expect(latestBoards.boards.map((board) => board.address)).not.toContain('subscription-probe-first.bso');
    expect(latestPrivileges.isAccountMod).toBe(true);
  });

  it('follows account initialization, identity edits, switching, and removal reactively', async () => {
    await act(async () => root.render(<HookHarness />));
    expect(latestAddress).toBeUndefined();
    expect(latestPrivileges.isAccountMod).toBe(false);

    await act(async () => accountsStore.setState({ activeAccountId: 'first' }));
    expect(latestAddress).toBeUndefined();
    await act(async () => accountsStore.setState({ accounts: { first: { author: { address: 'first' }, subscriptions: ['subscription-probe-first.bso'] } } }));
    expect(latestAddress).toBe('first');
    expect(latestPrivileges.isAccountMod).toBe(true);

    await act(async () => accountsStore.setState((state) => ({ accounts: { first: { ...state.accounts.first, author: { address: 'second' } } } })));
    expect(latestAddress).toBe('second');
    expect(latestPrivileges.isAccountMod).toBe(false);
    expect(latestPrivileges.isAccountCommentAuthor).toBe(false);

    await act(async () =>
      accountsStore.setState((state) => ({
        activeAccountId: 'second',
        accounts: { ...state.accounts, second: { author: { address: 'first' }, subscriptions: ['subscription-probe-second.bso'] } },
      })),
    );
    expect(latestAddress).toBe('first');
    expect(latestPrivileges.isAccountMod).toBe(true);
    expect(latestBoards.boards.map((board) => board.address)).toContain('subscription-probe-second.bso');
    expect(latestBoards.boards.map((board) => board.address)).not.toContain('subscription-probe-first.bso');

    await act(async () => accountsStore.setState({ accounts: {} }));
    expect(latestAddress).toBeUndefined();
    expect(latestPrivileges.isAccountMod).toBe(false);
    expect(latestBoards.boards.map((board) => board.address)).not.toContain('subscription-probe-second.bso');
  });
});
