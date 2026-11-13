import type { Comment, RepliesPages } from '@bitsocial/bitsocial-react-hooks';
import { repliesPagesStore } from '../bitsocial-internals/stores';
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

type RepliesPagesStoreEntries = { repliesPages: RepliesPages; comments: Record<string, Comment> };

const removeReplyPagesFromStore = (pageCids: string[]): RepliesPagesStoreEntries => {
  const removed: RepliesPagesStoreEntries = { repliesPages: {}, comments: {} };

  repliesPagesStore.setState((state) => {
    const repliesPages = { ...state.repliesPages };
    const comments = { ...state.comments };
    let changed = false;

    for (const pageCid of pageCids) {
      const page = repliesPages[pageCid];
      if (!page) continue;

      for (const comment of page.comments || []) {
        if (comment?.cid && comments[comment.cid]) {
          removed.comments[comment.cid] = comments[comment.cid];
          delete comments[comment.cid];
        }
      }

      removed.repliesPages[pageCid] = page;
      delete repliesPages[pageCid];
      changed = true;
    }

    return changed ? { repliesPages, comments } : {};
  });

  return removed;
};

// Entries the refresh stored again in the meantime are newer, so only missing ones come back.
const restoreReplyPagesToStore = (removed: RepliesPagesStoreEntries) => {
  repliesPagesStore.setState((state) => {
    const repliesPages = { ...state.repliesPages };
    const comments = { ...state.comments };
    let changed = false;

    for (const [pageCid, page] of Object.entries(removed.repliesPages)) {
      if (repliesPages[pageCid]) continue;
      repliesPages[pageCid] = page;
      changed = true;
    }

    for (const [commentCid, comment] of Object.entries(removed.comments)) {
      if (comments[commentCid]) continue;
      comments[commentCid] = comment;
      changed = true;
    }

    return changed ? { repliesPages, comments } : {};
  });
};

type PersistedEntry = { database: typeof commentsDatabase; key: string; value: unknown };

const isStored = (value: unknown) => value !== null && value !== undefined;

const readPersistedEntries = async (database: typeof commentsDatabase, keys: string[]): Promise<PersistedEntry[]> => {
  const entries = await Promise.all(keys.map(async (key) => ({ database, key, value: await database.getItem(key) })));
  return entries.filter((entry) => isStored(entry.value));
};

const restorePersistedEntry = async ({ database, key, value }: PersistedEntry) => {
  if (isStored(await database.getItem(key))) return;
  await database.setItem(key, value);
};

/**
 * Drops the thread's cached comment and reply pages so a manual Update reloads them. Resolves to a
 * function that puts back whatever is still missing, for when that Update fails or is abandoned.
 */
export const evictThreadRefreshCaches = async (comments: Array<Comment | undefined>): Promise<() => Promise<void>> => {
  const commentsToRefresh = comments.filter((comment): comment is Comment => Boolean(comment?.cid));
  if (commentsToRefresh.length === 0) return async () => {};

  const commentCids = [...new Set(commentsToRefresh.map((comment) => comment.cid as string))];
  const currentReplyPages = repliesPagesStore.getState().repliesPages;
  const replyPageCids = [...new Set(commentsToRefresh.flatMap((comment) => collectReplyPageCids(comment, currentReplyPages)))];

  const persistedEntries = [...(await readPersistedEntries(commentsDatabase, commentCids)), ...(await readPersistedEntries(repliesPagesDatabase, replyPageCids))];
  const removedStoreEntries = removeReplyPagesFromStore(replyPageCids);

  let restored = false;
  const restore = async () => {
    if (restored) return;
    restored = true;
    restoreReplyPagesToStore(removedStoreEntries);
    await Promise.all(persistedEntries.map(restorePersistedEntry));
  };

  const removals = await Promise.allSettled([
    ...commentCids.map((commentCid) => commentsDatabase.removeItem(commentCid)),
    ...replyPageCids.map((pageCid) => repliesPagesDatabase.removeItem(pageCid)),
  ]);
  const failedRemoval = removals.find((removal): removal is PromiseRejectedResult => removal.status === 'rejected');
  if (failedRemoval) {
    // A failed eviction gives the caller no restore function, so it puts back what it removed itself,
    // once every removal has finished.
    await restore().catch(() => {});
    throw failedRemoval.reason;
  }

  return restore;
};
