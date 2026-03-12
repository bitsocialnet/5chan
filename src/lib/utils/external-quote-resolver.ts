import type { Comment } from '@bitsocialnet/bitsocial-react-hooks';
import feedsStore from '@bitsocialnet/bitsocial-react-hooks/dist/stores/feeds';
import repliesStore, { feedOptionsToFeedName } from '@bitsocialnet/bitsocial-react-hooks/dist/stores/replies';
import subplebbitsPagesStore from '@bitsocialnet/bitsocial-react-hooks/dist/stores/subplebbits-pages';
import type { DirectoryCommunity } from '../../hooks/use-directories';
import usePostNumberStore from '../../stores/use-post-number-store';
import type { ExternalQuoteReference, ExternalQuoteSearchStatus } from './external-quote-utils';
import { getExternalQuoteBoardAddress, getExternalQuoteBoardLabel } from './external-quote-utils';
import { getBoardPath } from './route-utils';

const BOARD_FEED_SORT_TYPE = 'new';
const BOARD_SEARCH_POSTS_PER_PAGE = 25;
const THREAD_REPLIES_SORT_TYPE = 'best';
const THREAD_SEARCH_REPLIES_PER_PAGE = 25;
const WAIT_FOR_STORE_TIMEOUT_MS = 30000;
const WAIT_FOR_STORE_INTERVAL_MS = 100;

type ResolverAccount = {
  id?: string;
  [key: string]: unknown;
};

type ResolvedExternalQuoteTarget = {
  boardPath: string;
  cid: string;
  comment?: Comment;
  isUnavailable: boolean;
  route: string;
  subplebbitAddress: string;
};

const waitFor = async <T>(callback: () => T | undefined | false, timeoutMs = WAIT_FOR_STORE_TIMEOUT_MS) => {
  const startedAt = Date.now();

  while (Date.now() - startedAt <= timeoutMs) {
    const result = callback();
    if (result) {
      return result;
    }

    await new Promise((resolve) => window.setTimeout(resolve, WAIT_FOR_STORE_INTERVAL_MS));
  }

  throw new Error('Timed out while resolving external quote');
};

const isUnavailableComment = (
  comment?: {
    commentModeration?: {
      purged?: boolean;
    };
    deleted?: boolean;
    removed?: boolean;
  } | null,
) => Boolean(comment?.deleted || comment?.removed || comment?.commentModeration?.purged);

const getBoardFeedName = (accountId: string, subplebbitAddress: string) =>
  `external-quote-board-${accountId}-${subplebbitAddress}-${BOARD_FEED_SORT_TYPE}-${BOARD_SEARCH_POSTS_PER_PAGE}`;

const getCachedComment = (cid?: string) => (cid ? subplebbitsPagesStore.getState().comments[cid] : undefined);

const findLoadedCommentByNumber = ({ number, subplebbitAddress }: { number: number; subplebbitAddress: string }) => {
  const comments = Object.values(subplebbitsPagesStore.getState().comments) as Array<Comment | undefined>;

  return comments.find((comment) => comment?.subplebbitAddress === subplebbitAddress && comment?.number === number && comment?.cid);
};

const buildResolvedTarget = ({
  cid,
  comment,
  directories,
  subplebbitAddress,
}: {
  cid: string;
  comment?: Comment;
  directories: DirectoryCommunity[];
  subplebbitAddress: string;
}): ResolvedExternalQuoteTarget => {
  const boardPath = getBoardPath(subplebbitAddress, directories);
  return {
    boardPath,
    cid,
    comment,
    isUnavailable: isUnavailableComment(comment),
    route: `/${boardPath}/thread/${cid}`,
    subplebbitAddress,
  };
};

const registerComments = (comments: Comment[]) => {
  if (!comments.length) {
    return;
  }

  usePostNumberStore.getState().registerComments(comments);
};

const waitForBoardFeedPage = async (feedName: string, previousLength: number, expectedPageNumber: number) =>
  waitFor(() => {
    const state = feedsStore.getState();
    const feed = state.loadedFeeds[feedName] ?? [];
    const hasMore = state.feedsHaveMore[feedName];
    const pageNumber = state.feedsOptions[feedName]?.pageNumber ?? 0;

    if (pageNumber < expectedPageNumber) {
      return false;
    }

    if (feed.length > previousLength || feed.length >= expectedPageNumber * BOARD_SEARCH_POSTS_PER_PAGE || hasMore === false) {
      return { feed, hasMore };
    }

    return false;
  });

const loadBoardThreads = async ({
  account,
  number,
  onStatus,
  quoteDisplay,
  subplebbitAddress,
  directories,
}: {
  account: ResolverAccount;
  directories: DirectoryCommunity[];
  number: number;
  onStatus?: (status: ExternalQuoteSearchStatus) => void;
  quoteDisplay: string;
  subplebbitAddress: string;
}) => {
  const accountId = account.id;
  if (!accountId) {
    throw new Error('Missing account id while resolving external quote');
  }

  const boardLabel = getExternalQuoteBoardLabel(
    {
      kind: 'same-board',
      number,
      raw: quoteDisplay,
      subplebbitAddress,
    },
    directories,
  );

  onStatus?.({
    phase: 'search-board',
    boardLabel,
    quoteDisplay,
  });

  const feedName = getBoardFeedName(accountId, subplebbitAddress);
  const feedState = feedsStore.getState();
  if (!feedState.feedsOptions[feedName]) {
    await feedState.addFeedToStore(feedName, [subplebbitAddress], BOARD_FEED_SORT_TYPE, account, false, BOARD_SEARCH_POSTS_PER_PAGE);
  }

  await waitForBoardFeedPage(feedName, 0, 1);

  while (true) {
    const state = feedsStore.getState();
    const feed = (state.loadedFeeds[feedName] ?? []) as Comment[];
    const hasMore = state.feedsHaveMore[feedName];
    const pageNumber = state.feedsOptions[feedName]?.pageNumber ?? 1;

    registerComments(feed);

    const matchingThread = feed.find((thread) => thread.number === number);
    if (matchingThread?.cid) {
      return {
        match: matchingThread,
        threads: feed,
      };
    }

    if (!hasMore) {
      return {
        match: undefined,
        threads: feed,
      };
    }

    const previousLength = feed.length;
    state.incrementFeedPageNumber(feedName);
    await waitForBoardFeedPage(feedName, previousLength, pageNumber + 1);
  }
};

const waitForRepliesPage = async (feedName: string, previousLength: number, expectedPageNumber: number) =>
  waitFor(() => {
    const state = repliesStore.getState();
    const replies = state.loadedFeeds[feedName] ?? [];
    const hasMore = state.feedsHaveMore[feedName];
    const pageNumber = state.feedsOptions[feedName]?.pageNumber ?? 0;

    if (pageNumber < expectedPageNumber) {
      return false;
    }

    if (replies.length > previousLength || replies.length >= expectedPageNumber * THREAD_SEARCH_REPLIES_PER_PAGE || hasMore === false) {
      return { hasMore, replies };
    }

    return false;
  });

const searchThreadReplies = async ({
  account,
  directories,
  number,
  onStatus,
  quoteDisplay,
  subplebbitAddress,
  threads,
}: {
  account: ResolverAccount;
  directories: DirectoryCommunity[];
  number: number;
  onStatus?: (status: ExternalQuoteSearchStatus) => void;
  quoteDisplay: string;
  subplebbitAddress: string;
  threads: Comment[];
}) => {
  const accountId = account.id;
  if (!accountId) {
    throw new Error('Missing account id while resolving external quote');
  }

  const boardLabel = getExternalQuoteBoardLabel(
    {
      kind: 'same-board',
      number,
      raw: quoteDisplay,
      subplebbitAddress,
    },
    directories,
  );

  const candidateThreads = threads.filter((thread) => thread?.cid && thread.replyCount !== 0);

  for (const [index, thread] of candidateThreads.entries()) {
    onStatus?.({
      phase: 'search-thread',
      boardLabel,
      currentThread: index + 1,
      quoteDisplay,
      totalThreads: candidateThreads.length,
    });

    const feedOptions = {
      accountId,
      commentCid: thread.cid,
      commentDepth: thread.depth,
      flat: true,
      postCid: thread.postCid ?? thread.cid,
      repliesPerPage: THREAD_SEARCH_REPLIES_PER_PAGE,
      sortType: THREAD_REPLIES_SORT_TYPE,
      streamPage: true,
    };
    const feedName = feedOptionsToFeedName(feedOptions);
    await repliesStore.getState().addFeedToStoreOrUpdateComment(thread, feedOptions);
    await waitForRepliesPage(feedName, 0, 1);

    while (true) {
      const state = repliesStore.getState();
      const replies = (state.loadedFeeds[feedName] ?? []) as Comment[];
      const hasMore = state.feedsHaveMore[feedName];
      const pageNumber = state.feedsOptions[feedName]?.pageNumber ?? 1;

      registerComments(replies);

      const matchingReply = replies.find((reply) => reply.number === number);
      if (matchingReply?.cid) {
        return matchingReply;
      }

      if (!hasMore) {
        break;
      }

      const previousLength = replies.length;
      state.incrementFeedPageNumber(feedName);
      await waitForRepliesPage(feedName, previousLength, pageNumber + 1);
    }
  }

  return undefined;
};

export const resolveExternalQuoteTarget = async ({
  account,
  directories,
  onStatus,
  reference,
}: {
  account?: ResolverAccount | null;
  directories: DirectoryCommunity[];
  onStatus?: (status: ExternalQuoteSearchStatus) => void;
  reference: ExternalQuoteReference;
}): Promise<ResolvedExternalQuoteTarget | null> => {
  if (!account?.id) {
    throw new Error('Missing active account while resolving external quote');
  }

  const targetSubplebbitAddress = getExternalQuoteBoardAddress(reference, directories);
  const quoteDisplay = reference.raw;
  const cachedCid = usePostNumberStore.getState().numberToCid[targetSubplebbitAddress]?.[reference.number];
  if (cachedCid) {
    return buildResolvedTarget({
      cid: cachedCid,
      comment: getCachedComment(cachedCid),
      directories,
      subplebbitAddress: targetSubplebbitAddress,
    });
  }

  const loadedComment = findLoadedCommentByNumber({
    number: reference.number,
    subplebbitAddress: targetSubplebbitAddress,
  });
  if (loadedComment?.cid) {
    registerComments([loadedComment]);
    return buildResolvedTarget({
      cid: loadedComment.cid,
      comment: loadedComment,
      directories,
      subplebbitAddress: targetSubplebbitAddress,
    });
  }

  const { match: matchingThread, threads } = await loadBoardThreads({
    account,
    directories,
    number: reference.number,
    onStatus,
    quoteDisplay,
    subplebbitAddress: targetSubplebbitAddress,
  });

  if (matchingThread?.cid) {
    registerComments([matchingThread]);
    return buildResolvedTarget({
      cid: matchingThread.cid,
      comment: matchingThread,
      directories,
      subplebbitAddress: targetSubplebbitAddress,
    });
  }

  const matchingReply = await searchThreadReplies({
    account,
    directories,
    number: reference.number,
    onStatus,
    quoteDisplay,
    subplebbitAddress: targetSubplebbitAddress,
    threads,
  });

  if (!matchingReply?.cid) {
    return null;
  }

  registerComments([matchingReply]);
  return buildResolvedTarget({
    cid: matchingReply.cid,
    comment: matchingReply,
    directories,
    subplebbitAddress: targetSubplebbitAddress,
  });
};
