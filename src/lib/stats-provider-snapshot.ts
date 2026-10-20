import type { Comment } from '@bitsocial/bitsocial-react-hooks';
import { getBoardTopThreads, getPopularThreadPool, toPopularPosts } from './popular-threads';
import { STATS_PROVIDERS, type StatsProvider } from './stats-providers';
import { isBoardAddressShape } from './utils/directory-list-lookup-utils';

// A provider is only worth waiting for while it is faster than loading the boards over P2P.
const PROVIDER_TIMEOUT_MS = 5_000;
// Providers rewrite their snapshot every minute or so; an older one means the provider stopped
// following the boards, and the boxes load them over P2P instead.
const MAX_SNAPSHOT_AGE_SECONDS = 60 * 60;
const BOARDS_PATH = 'api/v1/5chan/boards';

export type ProviderBoardStats = {
  allPostCount: number;
  allReplyCount: number;
  weekActiveUserCount: number;
};

export type ProviderThreadPayload = {
  cid: string;
  raw: {
    comment: Record<string, unknown>;
    commentUpdate: Record<string, unknown>;
  };
};

export type ProviderBoard = {
  stats: ProviderBoardStats | null;
  threads: ProviderThreadPayload[];
};

export type StatsProviderSnapshot = {
  boards: ReadonlyMap<string, ProviderBoard>;
  generatedAt: number;
  providerId: string;
};

export type ProviderBoardRef = {
  address: string;
  /** The board's key from 5chan's own directory data, never from the provider. */
  publicKey: string | undefined;
};

/**
 * Checks the signatures and the CID of a thread a provider sent, and that it belongs to the board it
 * was listed under: a provider must not be able to forge or relabel one.
 */
export type ProviderThreadVerifier = (thread: ProviderThreadPayload, board: ProviderBoardRef) => Promise<boolean>;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isNonNegativeInteger = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0;

const parseStats = (value: unknown): ProviderBoardStats | null => {
  if (!isRecord(value) || !isNonNegativeInteger(value.allPostCount)) return null;
  return {
    allPostCount: value.allPostCount,
    allReplyCount: isNonNegativeInteger(value.allReplyCount) ? value.allReplyCount : 0,
    weekActiveUserCount: isNonNegativeInteger(value.weekActiveUserCount) ? value.weekActiveUserCount : 0,
  };
};

const parseThread = (value: unknown): ProviderThreadPayload | null => {
  if (!isRecord(value) || typeof value.cid !== 'string' || !value.cid || !isRecord(value.raw)) return null;
  const { comment, commentUpdate } = value.raw;
  if (!isRecord(comment) || !isRecord(commentUpdate)) return null;
  return { cid: value.cid, raw: { comment, commentUpdate } };
};

/** Malformed rows are dropped one by one; only a response that is not a snapshot at all is rejected. */
export const parseStatsProviderSnapshot = (value: unknown, providerId: string): StatsProviderSnapshot | null => {
  if (!isRecord(value) || value.version !== 1 || !isNonNegativeInteger(value.generatedAt) || !Array.isArray(value.boards)) return null;

  const boards = new Map<string, ProviderBoard>();
  for (const board of value.boards) {
    if (!isRecord(board) || typeof board.address !== 'string' || !isBoardAddressShape(board.address) || boards.has(board.address)) continue;
    const threads = Array.isArray(board.threads) ? board.threads.map(parseThread).filter((thread) => thread !== null) : [];
    boards.set(board.address, { stats: parseStats(board.stats), threads });
  }

  return { boards, generatedAt: value.generatedAt, providerId };
};

const fetchSnapshot = async (provider: StatsProvider): Promise<StatsProviderSnapshot> => {
  const apiBase = provider.apiUrl.endsWith('/') ? provider.apiUrl : `${provider.apiUrl}/`;
  const response = await fetch(new URL(BOARDS_PATH, apiBase), {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Stats provider returned ${response.status}`);

  const snapshot = parseStatsProviderSnapshot(await response.json(), provider.id);
  if (!snapshot) throw new Error('Stats provider returned an invalid response');
  if (Date.now() / 1000 - snapshot.generatedAt > MAX_SNAPSHOT_AGE_SECONDS) throw new Error('Stats provider returned an outdated snapshot');
  return snapshot;
};

/** Each provider in order; null when none answers, so the caller falls back to pure P2P. */
const fetchSnapshotFromChain = async (providers: readonly StatsProvider[]): Promise<StatsProviderSnapshot | null> => {
  for (const provider of providers) {
    try {
      return await fetchSnapshot(provider);
    } catch {
      // Hand over to the next provider.
    }
  }
  return null;
};

// One request per page load: the home boxes freeze what they show until a refresh anyway.
let snapshotRequest: Promise<StatsProviderSnapshot | null> | undefined;
const popularPostsRequests = new Map<string, Promise<Comment[]>>();

export const getStatsProviderSnapshot = (): Promise<StatsProviderSnapshot | null> => {
  snapshotRequest ??= fetchSnapshotFromChain(STATS_PROVIDERS);
  return snapshotRequest;
};

const firstBoolean = (...values: unknown[]): boolean | undefined => values.find((value): value is boolean => typeof value === 'boolean');

/**
 * Renders a provider thread with the regular post components. The update's signed edit is applied
 * the way pkc-js builds a board's page comments, so an edited or author-deleted thread reads the
 * same as over P2P.
 */
const toProviderComment = (boardAddress: string, thread: ProviderThreadPayload): Comment => {
  const { comment, commentUpdate } = thread.raw;
  const update = { ...commentUpdate };
  // Nested reply pages are large and the home page never renders them.
  delete update.replies;
  const edit = isRecord(commentUpdate.edit) ? commentUpdate.edit : undefined;

  return {
    ...comment,
    ...update,
    author: { ...(isRecord(comment.author) ? comment.author : {}), ...(isRecord(commentUpdate.author) ? commentUpdate.author : {}) },
    cid: thread.cid,
    communityAddress: boardAddress,
    content: edit?.content || comment.content,
    deleted: edit?.deleted,
    flairs: commentUpdate.flairs || edit?.flairs || comment.flairs,
    nsfw: firstBoolean(commentUpdate.nsfw, edit?.nsfw) ?? comment.nsfw,
    postCid: thread.cid,
    raw: thread.raw,
    signature: comment.signature,
    spoiler: firstBoolean(commentUpdate.spoiler, edit?.spoiler) ?? comment.spoiler,
    state: 'succeeded',
  } as Comment;
};

const selectProviderPopularPosts = async (snapshot: StatsProviderSnapshot, boardRefs: ProviderBoardRef[], verifyThread: ProviderThreadVerifier): Promise<Comment[]> => {
  const boardRefsByAddress = new Map(boardRefs.map((board) => [board.address, board]));
  const boards = boardRefs.map(({ address }) => ({
    address,
    threads: snapshot.boards.get(address)?.threads.map((thread) => toProviderComment(address, thread)),
  }));
  const pool = getPopularThreadPool(getBoardTopThreads(boards, Math.floor(Date.now() / 1000)));
  const verified = await Promise.all(
    pool.map(({ post }) => {
      const board = boardRefsByAddress.get(post.communityAddress) ?? { address: post.communityAddress, publicKey: undefined };
      return verifyThread({ cid: post.cid, raw: post.raw as ProviderThreadPayload['raw'] }, board).catch(() => false);
    }),
  );

  return toPopularPosts(pool.filter((_, index) => verified[index]));
};

/**
 * The popular threads a provider's snapshot yields for these boards, picked like the P2P path picks
 * them, keeping only threads whose signatures and CID check out. An empty result means the provider
 * had nothing usable, and the caller falls back to pure P2P.
 */
export const getProviderPopularPosts = (snapshot: StatsProviderSnapshot, boardRefs: ProviderBoardRef[], verifyThread: ProviderThreadVerifier): Promise<Comment[]> => {
  const boardKeys = boardRefs.map(({ address, publicKey }) => `${address}=${publicKey ?? ''}`);
  const cacheKey = `${snapshot.providerId}:${boardKeys.sort().join(',')}`;
  let request = popularPostsRequests.get(cacheKey);
  if (!request) {
    request = selectProviderPopularPosts(snapshot, boardRefs, verifyThread).catch(() => []);
    popularPostsRequests.set(cacheKey, request);
  }
  return request;
};

export const clearStatsProviderRequestsForTest = () => {
  snapshotRequest = undefined;
  popularPostsRequests.clear();
};
