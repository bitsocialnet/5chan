import type { Comment, RepliesPages } from '@bitsocial/bitsocial-react-hooks';
import { commentsStore, repliesPagesStore, repliesStore } from '../bitsocial-internals/stores';
import { localForageLru } from '../bitsocial-internals/utils';

const commentsDatabase = localForageLru.createInstance({ name: 'bitsocialReactHooks-comments' });
const repliesPagesDatabase = localForageLru.createInstance({ name: 'bitsocialReactHooks-repliesPages' });

const getReplyPageSortTypes = (comment: Comment): string[] => {
  const pageCids = comment.replies?.pageCids && typeof comment.replies.pageCids === 'object' ? comment.replies.pageCids : {};
  const pages = comment.replies?.pages && typeof comment.replies.pages === 'object' ? comment.replies.pages : {};
  return [...new Set([...Object.keys(pageCids), ...Object.keys(pages)])];
};

const getPersistedReplyPageStartCids = (comment: Comment, sortType: string): string[] => {
  const pageCids = new Set<string>();
  const firstPageCid = comment.replies?.pageCids?.[sortType];
  const preloadedNextCid = comment.replies?.pages?.[sortType]?.nextCid;

  if (typeof firstPageCid === 'string') pageCids.add(firstPageCid);
  if (typeof preloadedNextCid === 'string') pageCids.add(preloadedNextCid);

  return [...pageCids];
};

const collectReplyPageCids = (comment: Comment, repliesPages: RepliesPages): string[] => {
  const pageCids = new Set<string>();

  for (const sortType of getReplyPageSortTypes(comment)) {
    for (const startPageCid of getPersistedReplyPageStartCids(comment, sortType)) {
      let pageCid: string | undefined = startPageCid;
      while (pageCid && !pageCids.has(pageCid)) {
        pageCids.add(pageCid);
        pageCid = repliesPages[pageCid]?.nextCid;
      }
    }
  }

  return [...pageCids];
};

const removeReplyPagesFromStore = (pageCids: string[]) => {
  repliesPagesStore.setState((state) => {
    const repliesPages = { ...state.repliesPages };
    const comments = { ...state.comments };
    let changed = false;

    for (const pageCid of pageCids) {
      const page = repliesPages[pageCid];
      if (!page) continue;

      for (const comment of page.comments || []) {
        if (comment?.cid && comments[comment.cid]) {
          delete comments[comment.cid];
        }
      }

      delete repliesPages[pageCid];
      changed = true;
    }

    return changed ? { repliesPages, comments } : {};
  });
};

export const evictThreadRefreshCaches = async (comments: Array<Comment | undefined>) => {
  const commentsToRefresh = comments.filter((comment): comment is Comment => Boolean(comment?.cid));
  if (commentsToRefresh.length === 0) return;

  const commentCids = [...new Set(commentsToRefresh.map((comment) => comment.cid as string))];
  const currentReplyPages = repliesPagesStore.getState().repliesPages;
  const replyPageCids = [...new Set(commentsToRefresh.flatMap((comment) => collectReplyPageCids(comment, currentReplyPages)))];

  removeReplyPagesFromStore(replyPageCids);

  await Promise.all([
    ...commentCids.map((commentCid) => commentsDatabase.removeItem(commentCid)),
    ...replyPageCids.map((pageCid) => repliesPagesDatabase.removeItem(pageCid)),
  ]);
};

// The replies store only recomputes a feed when a post's first reply page or page cids change, so
// replies appended to a single preloaded page need an explicit recompute. Unlike a feed reset,
// this keeps the rendered replies and only appends new ones.
export const syncThreadRepliesFeeds = () => {
  repliesStore.getState().updateFeeds();
};

export type CommentRefreshOutcome = 'updated' | 'unchanged' | 'failed';

const THREAD_REFRESH_SUBSCRIBER_ID = 'thread-refresh';

/**
 * Runs one refresh cycle of a thread comment and reports how it ended. The hooks' refresh() only
 * settles on a newer CommentUpdate, but pkc-js reports an unchanged one as 'waiting-retry', so a
 * quiet thread would never settle and a later update would reach the thread without a refresh.
 * An unchanged cycle therefore stops the one-shot update.
 */
export const refreshCommentOnce = (commentCid: string, refresh: () => Promise<void>): Promise<CommentRefreshOutcome> =>
  new Promise((resolve) => {
    const initialErrorCount = commentsStore.getState().errors[commentCid]?.length ?? 0;
    let fetchedUpdate = false;
    let settled = false;

    const settle = (outcome: CommentRefreshOutcome) => {
      if (settled) return;
      settled = true;
      unsubscribe();
      if (outcome === 'unchanged') {
        void commentsStore.getState().stopCommentAutoUpdate(commentCid, THREAD_REFRESH_SUBSCRIBER_ID);
      }
      resolve(outcome);
    };

    const unsubscribe = commentsStore.subscribe((state) => {
      const updatingState = state.comments[commentCid]?.updatingState;
      if (updatingState === 'fetching-update-ipfs') {
        fetchedUpdate = true;
      } else if (updatingState === 'waiting-retry' && fetchedUpdate) {
        const failed = (state.errors[commentCid]?.length ?? 0) > initialErrorCount;
        settle(failed ? 'failed' : 'unchanged');
      }
    });

    refresh().then(
      () => settle('updated'),
      (error) => {
        console.error('Failed to refresh thread comments:', error);
        settle('failed');
      },
    );
  });
