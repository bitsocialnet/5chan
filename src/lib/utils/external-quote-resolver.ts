import type { Comment } from '@bitsocial/bitsocial-react-hooks';
import { feedsStore, repliesStore, feedOptionsToFeedName, communitiesPagesStore, communitiesStore } from '../bitsocial-internals/stores';
import { getBoardSortType } from './board-sort-utils';
import type { DirectoryCommunity } from './directory-list-utils';
import type { ExternalQuoteReference, ExternalQuoteSearchStatus } from './external-quote-utils';
import { getExternalQuoteBoardAddress, getExternalQuoteBoardLabel } from './external-quote-utils';
import { getCommentCommunityAddress } from './comment-utils';
import { getBoardPath } from './route-utils';

const BOARD_SEARCH_POSTS_PER_PAGE = 25;
// The thread view's reply sort, so the search reads pages every 5chan board publishes.
const THREAD_REPLIES_SORT_TYPE = 'old';
const THREAD_SEARCH_REPLIES_PER_PAGE = 25;
const WAIT_FOR_STORE_TIMEOUT_MS = 30000;
const WAIT_FOR_STORE_INTERVAL_MS = 100;

type ResolverAccount = {
  id?: string;
  [key: string]: unknown;
};

/** Post-number registry the resolver reads and writes; `usePostNumberStore` satisfies it structurally. */
export interface PostNumberRegistry {
  getState: () => { numberToCid: Record<string, Record<number, string>>; registerComments: (comments: Comment[]) => void };
}

type ResolvedExternalQuoteTarget = {
  boardPath: string;
  cid: string;
  comment?: Comment;
  isUnavailable: boolean;
  route: string;
  communityAddress: string;
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

const getBoardFeedName = (accountId: string, communityAddress: string, sortType: string) =>
  `external-quote-board-${accountId}-${communityAddress}-${sortType}-${BOARD_SEARCH_POSTS_PER_PAGE}`;

// A board configured with `settings.pages` may publish no sort but its own, so the search follows the
// sort the board view reads, which needs the board's record first.
const loadBoardSortType = async (communityAddress: string, account: ResolverAccount) => {
  const { addCommunityToStore, communities } = communitiesStore.getState();
  let loadError: unknown;
  if (!communities[communityAddress]) {
    addCommunityToStore(communityAddress, account).catch((error: unknown) => {
      loadError = error;
    });
  }
  const community = await waitFor(() => {
    if (loadError) throw loadError;
    return communitiesStore.getState().communities[communityAddress];
  });
  return getBoardSortType(community);
};

const getCachedComment = (cid?: string) => (cid ? communitiesPagesStore.getState().comments[cid] : undefined);

const findLoadedCommentByNumber = ({ number, communityAddress }: { number: number; communityAddress: string }) => {
  const comments = Object.values(communitiesPagesStore.getState().comments) as Array<Comment | undefined>;

  return comments.find((comment) => {
    const address = getCommentCommunityAddress(comment);
    return address === communityAddress && comment?.number === number && comment?.cid;
  });
};

const buildResolvedTarget = ({
  cid,
  comment,
  directories,
  communityAddress,
}: {
  cid: string;
  comment?: Comment;
  directories: DirectoryCommunity[];
  communityAddress: string;
}): ResolvedExternalQuoteTarget => {
  const boardPath = getBoardPath(communityAddress, directories);
  return {
    boardPath,
    cid,
    comment,
    isUnavailable: isUnavailableComment(comment),
    route: `/${boardPath}/thread/${cid}`,
    communityAddress,
  };
};

const registerComments = (postNumbers: PostNumberRegistry, comments: Comment[]) => {
  if (!comments.length) {
    return;
  }

  postNumbers.getState().registerComments(comments);
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
  postNumbers,
  quoteDisplay,
  communityAddress,
  directories,
}: {
  account: ResolverAccount;
  directories: DirectoryCommunity[];
  number: number;
  onStatus?: (status: ExternalQuoteSearchStatus) => void;
  postNumbers: PostNumberRegistry;
  quoteDisplay: string;
  communityAddress: string;
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
      communityAddress,
    },
    directories,
  );

  onStatus?.({
    phase: 'search-board',
    boardLabel,
    quoteDisplay,
  });

  const boardSortType = await loadBoardSortType(communityAddress, account);
  const feedName = getBoardFeedName(accountId, communityAddress, boardSortType);
  const feedState = feedsStore.getState();
  if (!feedState.feedsOptions[feedName]) {
    await feedState.addFeedToStore(feedName, [{ address: communityAddress }], [communityAddress], boardSortType, account, false, BOARD_SEARCH_POSTS_PER_PAGE);
  }

  await waitForBoardFeedPage(feedName, 0, 1);

  while (true) {
    const state = feedsStore.getState();
    const feed = (state.loadedFeeds[feedName] ?? []) as Comment[];
    const hasMore = state.feedsHaveMore[feedName];
    const pageNumber = state.feedsOptions[feedName]?.pageNumber ?? 1;

    registerComments(postNumbers, feed);

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
  postNumbers,
  quoteDisplay,
  communityAddress,
  threads,
}: {
  account: ResolverAccount;
  directories: DirectoryCommunity[];
  number: number;
  onStatus?: (status: ExternalQuoteSearchStatus) => void;
  postNumbers: PostNumberRegistry;
  quoteDisplay: string;
  communityAddress: string;
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
      communityAddress,
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

      registerComments(postNumbers, replies);

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
  postNumbers,
  reference,
}: {
  account?: ResolverAccount | null;
  directories: DirectoryCommunity[];
  onStatus?: (status: ExternalQuoteSearchStatus) => void;
  postNumbers: PostNumberRegistry;
  reference: ExternalQuoteReference;
}): Promise<ResolvedExternalQuoteTarget | null> => {
  if (!account?.id) {
    throw new Error('Missing active account while resolving external quote');
  }

  const targetCommunityAddress = getExternalQuoteBoardAddress(reference, directories);
  const quoteDisplay = reference.raw;
  const cachedCid = postNumbers.getState().numberToCid[targetCommunityAddress]?.[reference.number];
  if (cachedCid) {
    return buildResolvedTarget({
      cid: cachedCid,
      comment: getCachedComment(cachedCid),
      directories,
      communityAddress: targetCommunityAddress,
    });
  }

  const loadedComment = findLoadedCommentByNumber({
    number: reference.number,
    communityAddress: targetCommunityAddress,
  });
  if (loadedComment?.cid) {
    registerComments(postNumbers, [loadedComment]);
    return buildResolvedTarget({
      cid: loadedComment.cid,
      comment: loadedComment,
      directories,
      communityAddress: targetCommunityAddress,
    });
  }

  const { match: matchingThread, threads } = await loadBoardThreads({
    account,
    directories,
    number: reference.number,
    onStatus,
    postNumbers,
    quoteDisplay,
    communityAddress: targetCommunityAddress,
  });

  if (matchingThread?.cid) {
    registerComments(postNumbers, [matchingThread]);
    return buildResolvedTarget({
      cid: matchingThread.cid,
      comment: matchingThread,
      directories,
      communityAddress: targetCommunityAddress,
    });
  }

  const matchingReply = await searchThreadReplies({
    account,
    directories,
    number: reference.number,
    onStatus,
    postNumbers,
    quoteDisplay,
    communityAddress: targetCommunityAddress,
    threads,
  });

  if (!matchingReply?.cid) {
    return null;
  }

  registerComments(postNumbers, [matchingReply]);
  return buildResolvedTarget({
    cid: matchingReply.cid,
    comment: matchingReply,
    directories,
    communityAddress: targetCommunityAddress,
  });
};
