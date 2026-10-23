import * as React from 'react';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Comment } from '@bitsocial/bitsocial-react-hooks';
import useHide, { useHiddenCids, useIsImageFiltered } from '../use-hide';
import { accountsStore } from '../../lib/bitsocial-internals/stores';
import { FORGE_IMAGES_MEDIA_ORIGIN } from '../../lib/forge-images-config';
import useHiddenCatalogThreadsStore from '../../stores/use-hidden-catalog-threads-store';
import useImageFiltersStore from '../../stores/use-image-filters-store';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const act = (React as { act?: (cb: () => void | Promise<void>) => void | Promise<void> }).act as (cb: () => void | Promise<void>) => void | Promise<void>;

const testState = vi.hoisted(() => ({
  blockCidMock: vi.fn(),
  unblockCidMock: vi.fn(),
}));

vi.mock('../../lib/bitsocial-internals/stores', async () => {
  const { create } = await import('zustand');
  return {
    accountsStore: create(() => ({
      accounts: {},
      activeAccountId: 'account-1',
      accountsComments: {},
      commentCidsToAccountsComments: {},
      accountsCommentsReplies: {},
      accountsActions: {
        blockCid: testState.blockCidMock,
        unblockCid: testState.unblockCidMock,
      },
    })),
  };
});

type TestAccount = {
  id: string;
  author?: { address: string };
  blockedCids: Record<string, boolean>;
  name?: string;
};

const FILTERED_SHA256 = '2aa4fa20701cdd6d8d56046069001186b5267e3ee7d0ef618ad2f4a683723e11';
const FILTERED_LINK = `${FORGE_IMAGES_MEDIA_ORIGIN}/${FILTERED_SHA256}/spam.png`;
const HASHED_LINK = 'https://files.catbox.moe/8ten4y.png';
const resetImageFilters = () => useImageFiltersStore.setState({ imageFilters: '', filterKeys: new Set(), matchedLinks: {}, shownCids: {}, quickFilterNotice: null });

const getAccount = () => accountsStore.getState().accounts['account-1'] as TestAccount;
const setAccount = (account: TestAccount) => accountsStore.setState((state) => ({ accounts: { ...state.accounts, 'account-1': account } }));

const HideButton = ({
  cid,
  comment,
}: {
  cid: string;
  comment?: { cid: string; communityAddress?: string; postCid?: string; link?: string; author?: { address: string } };
}) => {
  const { hide, hidden, state, error, errors, unhide } = useHide({ cid, comment });
  return (
    <div data-state={state} data-error-count={errors.length} data-error={String(error)}>
      <button data-hidden={hidden ? 'true' : 'false'} data-testid='hide' type='button' onClick={hide}>
        hide {cid}
      </button>
      <button data-hidden={hidden ? 'true' : 'false'} data-testid='unhide' type='button' onClick={unhide}>
        unhide {cid}
      </button>
    </div>
  );
};

let container: HTMLDivElement;
let root: Root;

describe('useHide', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    accountsStore.setState({ activeAccountId: 'account-1', accounts: {}, accountsComments: {}, accountsCommentsReplies: {}, commentCidsToAccountsComments: {} });
    setAccount({ id: 'account-1', blockedCids: {} });
    testState.blockCidMock.mockImplementation(async (cid: string) => {
      setAccount({ ...getAccount(), blockedCids: { ...getAccount().blockedCids, [cid]: true } });
    });
    testState.unblockCidMock.mockImplementation(async (cid: string) => {
      const blockedCids = { ...getAccount().blockedCids };
      delete blockedCids[cid];
      setAccount({ ...getAccount(), blockedCids });
    });
    useHiddenCatalogThreadsStore.setState({ hiddenCommentsByCid: {}, scopeHiddenThreadsCounts: {}, shownScopeKey: null });
    resetImageFilters();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    useHiddenCatalogThreadsStore.setState({ hiddenCommentsByCid: {}, scopeHiddenThreadsCounts: {}, shownScopeKey: null });
    resetImageFilters();
  });

  it('hides the current cid after a reused component rerenders for another post', async () => {
    await act(async () => {
      root.render(createElement(HideButton, { cid: 'first-thread' }));
    });
    await act(async () => {
      root.render(createElement(HideButton, { cid: 'second-thread' }));
    });
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="hide"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(testState.blockCidMock).toHaveBeenCalledTimes(1);
    expect(testState.blockCidMock).toHaveBeenCalledWith('second-thread');
    expect(getAccount().blockedCids).toEqual({ 'second-thread': true });
  });

  it('unhides the current cid and skips duplicate account writes', async () => {
    setAccount({ id: 'account-1', blockedCids: { 'hidden-thread': true } });

    await act(async () => {
      root.render(createElement(HideButton, { cid: 'hidden-thread' }));
    });

    expect(container.querySelector<HTMLButtonElement>('[data-testid="unhide"]')?.dataset.hidden).toBe('true');

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="hide"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      container.querySelector<HTMLButtonElement>('[data-testid="unhide"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(testState.blockCidMock).not.toHaveBeenCalled();
    expect(testState.unblockCidMock).toHaveBeenCalledWith('hidden-thread');
    expect(getAccount().blockedCids).toEqual({});
    expect(useHiddenCatalogThreadsStore.getState().hiddenCommentsByCid['hidden-thread']).toBeUndefined();
  });

  it('remembers the hidden comment so catalog counters can resolve it immediately', async () => {
    const comment = { cid: 'remembered-thread', communityAddress: 'music-posting.eth', postCid: 'remembered-thread' };

    await act(async () => {
      root.render(createElement(HideButton, { cid: 'remembered-thread', comment }));
    });
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="hide"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(useHiddenCatalogThreadsStore.getState().hiddenCommentsByCid['remembered-thread']).toEqual(comment);
  });

  it('does not commit for unrelated account updates or another CID, but responds to its CID and account switches', async () => {
    const onRender = vi.fn();
    await act(async () =>
      root.render(
        <React.Profiler id='hide' onRender={onRender}>
          <HideButton cid='thread' />
        </React.Profiler>,
      ),
    );
    onRender.mockClear();

    await act(async () => {
      setAccount({ ...getAccount(), name: 'renamed' });
      accountsStore.setState({
        accountsComments: { 'account-1': [{ cid: 'own-comment', index: 0, accountId: 'account-1' }] },
        accountsCommentsReplies: { 'account-1': { notification: { markedAsRead: false } } },
      });
      setAccount({ ...getAccount(), blockedCids: { other: true } });
    });
    expect(onRender).not.toHaveBeenCalled();
    expect(container.querySelector('[data-testid="hide"]')?.getAttribute('data-hidden')).toBe('false');

    await act(async () => setAccount({ ...getAccount(), blockedCids: { thread: true } }));
    expect(onRender).toHaveBeenCalledOnce();
    expect(container.querySelector('[data-testid="hide"]')?.getAttribute('data-hidden')).toBe('true');

    await act(async () =>
      accountsStore.setState((state) => ({
        activeAccountId: 'account-2',
        accounts: { ...state.accounts, 'account-2': { blockedCids: {} } },
      })),
    );
    expect(container.querySelector('[data-testid="hide"]')?.getAttribute('data-hidden')).toBe('false');
    expect(container.firstElementChild?.getAttribute('data-state')).toBe('ready');
    expect(onRender).toHaveBeenCalledTimes(2);
  });

  it('stays initializing until the account and CID exist', async () => {
    accountsStore.setState({ activeAccountId: undefined, accounts: {} });
    await act(async () => root.render(<HideButton cid='thread' />));
    expect(container.firstElementChild?.getAttribute('data-state')).toBe('initializing');

    await act(async () => accountsStore.setState({ activeAccountId: 'account-1' }));
    expect(container.firstElementChild?.getAttribute('data-state')).toBe('initializing');
    await act(async () => setAccount({ id: 'account-1', blockedCids: {} }));
    expect(container.firstElementChild?.getAttribute('data-state')).toBe('ready');
    await act(async () => root.render(<HideButton cid='' />));
    expect(container.firstElementChild?.getAttribute('data-state')).toBe('initializing');
    expect(container.firstElementChild?.getAttribute('data-error-count')).toBe('0');
    expect(container.firstElementChild?.getAttribute('data-error')).toBe('undefined');
  });

  it('subscribes hidden catalog filters to blocked CIDs without account metadata or notification commits', async () => {
    let hiddenCids: ReturnType<typeof useHiddenCids> | undefined;
    const HiddenCids = () => {
      hiddenCids = useHiddenCids();
      return null;
    };
    const onRender = vi.fn();
    await act(async () =>
      root.render(
        <React.Profiler id='hidden-cids' onRender={onRender}>
          <HiddenCids />
        </React.Profiler>,
      ),
    );
    const initial = hiddenCids;
    onRender.mockClear();
    await act(async () => {
      setAccount({ ...getAccount(), name: 'renamed' });
      accountsStore.setState({ accountsCommentsReplies: { 'account-1': { notification: { markedAsRead: false } } } });
    });
    expect(onRender).not.toHaveBeenCalled();
    expect(hiddenCids).toBe(initial);
    await act(async () => setAccount({ ...getAccount(), blockedCids: { thread: true } }));
    expect(hiddenCids).toEqual({ thread: true });
    expect(onRender).toHaveBeenCalledOnce();
  });

  it('forgets the remembered comment after a failed hide that did not update the account', async () => {
    const error = new Error('write failed');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    testState.blockCidMock.mockRejectedValue(error);
    const comment = { cid: 'failed-thread', communityAddress: 'music.bso' };
    try {
      await act(async () => root.render(<HideButton cid='failed-thread' comment={comment} />));
      await act(async () => {
        container.querySelector<HTMLButtonElement>('[data-testid="hide"]')?.click();
      });
      expect(useHiddenCatalogThreadsStore.getState().hiddenCommentsByCid['failed-thread']).toBeUndefined();
      expect(consoleError).toHaveBeenCalledWith('Failed to hide post', error);
      expect(container.firstElementChild?.getAttribute('data-error-count')).toBe('0');
    } finally {
      consoleError.mockRestore();
    }
  });

  it('hides a post whose file is on the image filter list until the viewer shows it, and hiding it again blocks it', async () => {
    useImageFiltersStore.getState().setImageFilters(FILTERED_SHA256);
    const comment = { cid: 'filtered-reply', link: FILTERED_LINK, author: { address: 'someone.bso' } };
    await act(async () => root.render(<HideButton cid='filtered-reply' comment={comment} />));
    const hideButton = () => container.querySelector<HTMLButtonElement>('[data-testid="hide"]');
    expect(hideButton()?.dataset.hidden).toBe('true');

    await act(async () => container.querySelector<HTMLButtonElement>('[data-testid="unhide"]')?.click());
    expect(hideButton()?.dataset.hidden).toBe('false');
    expect(testState.unblockCidMock).not.toHaveBeenCalled();
    expect(useImageFiltersStore.getState().imageFilters).toBe(FILTERED_SHA256);

    await act(async () => hideButton()?.click());
    expect(testState.blockCidMock).toHaveBeenCalledWith('filtered-reply');
    expect(useImageFiltersStore.getState().shownCids).toEqual({});
    expect(hideButton()?.dataset.hidden).toBe('true');
  });

  it('hides a post on another host once its image hashed to a listed hash', async () => {
    useImageFiltersStore.getState().setImageFilters(FILTERED_SHA256);
    const comment = { cid: 'rehosted-reply', link: HASHED_LINK, author: { address: 'someone.bso' } };
    await act(async () => root.render(<HideButton cid='rehosted-reply' comment={comment} />));
    const hideButton = () => container.querySelector<HTMLButtonElement>('[data-testid="hide"]');
    expect(hideButton()?.dataset.hidden).toBe('false');

    await act(async () => {
      useImageFiltersStore.setState({ matchedLinks: { [HASHED_LINK]: FILTERED_SHA256 } });
    });
    expect(hideButton()?.dataset.hidden).toBe('true');

    await act(async () => useImageFiltersStore.getState().setImageFilters(''));
    expect(hideButton()?.dataset.hidden).toBe('false');
  });

  it("never filters the viewer's own posts", async () => {
    setAccount({ ...getAccount(), author: { address: 'me.bso' } });
    useImageFiltersStore.getState().setImageFilters(FILTERED_SHA256);
    await act(async () => root.render(<HideButton cid='own-post' comment={{ cid: 'own-post', link: FILTERED_LINK, author: { address: 'me.bso' } }} />));

    expect(container.querySelector<HTMLButtonElement>('[data-testid="hide"]')?.dataset.hidden).toBe('false');
  });

  it("never filters the viewer's own posts on pseudonymous boards, where the author address is an alias", async () => {
    accountsStore.setState({ commentCidsToAccountsComments: { 'own-alias-post': { accountId: 'account-1', accountCommentIndex: 0 } } });
    useImageFiltersStore.getState().setImageFilters(FILTERED_SHA256);
    await act(async () =>
      root.render(<HideButton cid='own-alias-post' comment={{ cid: 'own-alias-post', link: FILTERED_LINK, author: { address: 'one-off-alias' } }} />),
    );

    expect(container.querySelector<HTMLButtonElement>('[data-testid="hide"]')?.dataset.hidden).toBe('false');
  });

  it('gives lists a predicate that leaves out filtered posts but keeps shown and own ones', async () => {
    setAccount({ ...getAccount(), author: { address: 'me.bso' } });
    useImageFiltersStore.getState().setImageFilters(`${FILTERED_SHA256}\nhttps://i.imgur.com/YpB7qfa.jpg`);
    useImageFiltersStore.setState({ matchedLinks: { [HASHED_LINK]: FILTERED_SHA256 } });
    useImageFiltersStore.getState().setPostShown('shown-thread', true);
    let isImageFiltered: ((comment: Comment) => boolean) | undefined;
    const Predicate = () => {
      isImageFiltered = useIsImageFiltered();
      return null;
    };
    await act(async () => root.render(<Predicate />));

    const thread = (cid: string, link: string, address = 'someone.bso') => ({ cid, link, author: { address } }) as Comment;
    expect(isImageFiltered?.(thread('forge-thread', FILTERED_LINK))).toBe(true);
    expect(isImageFiltered?.(thread('imgur-thread', 'https://i.imgur.com/YpB7qfa.jpg'))).toBe(true);
    expect(isImageFiltered?.(thread('other-thread', 'https://i.imgur.com/other.jpg'))).toBe(false);
    expect(isImageFiltered?.(thread('rehosted-thread', HASHED_LINK))).toBe(true);
    expect(isImageFiltered?.(thread('own-rehosted-thread', HASHED_LINK, 'me.bso'))).toBe(false);
    expect(isImageFiltered?.(thread('shown-thread', FILTERED_LINK))).toBe(false);
    expect(isImageFiltered?.(thread('own-thread', FILTERED_LINK, 'me.bso'))).toBe(false);
    await act(async () => accountsStore.setState({ commentCidsToAccountsComments: { 'alias-thread': { accountId: 'account-1', accountCommentIndex: 1 } } }));
    expect(isImageFiltered?.(thread('alias-thread', FILTERED_LINK, 'one-off-alias'))).toBe(false);
    expect(isImageFiltered?.({ index: 2, link: FILTERED_LINK, author: { address: 'one-off-alias' } } as Comment)).toBe(false);
  });
});
