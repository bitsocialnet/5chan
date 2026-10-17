import { useMemo } from 'react';
import { type Comment, useAccount, useComments } from '@bitsocial/bitsocial-react-hooks';
import { isCommentArchived } from '../lib/utils/comment-moderation-utils';
import { sortCatalogFeedForDisplay, type CatalogSortType } from '../lib/utils/catalog-sort';
import { getCommentCommunityAddress } from '../lib/utils/comment-utils';
import useHiddenCatalogThreadsStore from '../stores/use-hidden-catalog-threads-store';
import { findDirectoryByAddress, normalizeBoardAddress, useDirectories, type DirectoryCommunity } from './use-directories';

type HiddenCatalogThreadsOptions = {
  candidateComments?: readonly Comment[];
  communityAddresses: readonly string[];
  sortType: CatalogSortType;
};

type HiddenCatalogThreadsResult = {
  hiddenCatalogThreads: Comment[];
  hiddenThreadCandidates: Comment[];
  isLoadingHiddenCatalogThreads: boolean;
  scopeKey: string;
};

const getHiddenCatalogThreadsScopeKey = (communityAddresses: readonly string[]): string => communityAddresses.filter(Boolean).slice().sort().join('\u0000');

const addAddressKeys = (keys: Set<string>, address: string | undefined) => {
  if (!address) {
    return;
  }

  keys.add(address);
  keys.add(normalizeBoardAddress(address));
};

export const getBoardAddressKeys = (address: string | undefined, directories: DirectoryCommunity[]): Set<string> => {
  const keys = new Set<string>();
  addAddressKeys(keys, address);

  const directory = findDirectoryByAddress(directories, address);
  if (directory) {
    addAddressKeys(keys, directory.address);
    addAddressKeys(keys, directory.name);
    addAddressKeys(keys, directory.publicKey);
    addAddressKeys(keys, directory.directoryCode);
  }

  keys.delete('');
  return keys;
};

const getScopeAddressKeys = (communityAddresses: readonly string[], directories: DirectoryCommunity[]): Set<string> => {
  const keys = new Set<string>();
  for (const communityAddress of communityAddresses) {
    for (const key of getBoardAddressKeys(communityAddress, directories)) {
      keys.add(key);
    }
  }
  return keys;
};

export const isBoardAddressInScope = (address: string | undefined, scopeAddressKeys: Set<string>, directories: DirectoryCommunity[]): boolean => {
  if (!address || scopeAddressKeys.size === 0) {
    return false;
  }

  for (const key of getBoardAddressKeys(address, directories)) {
    if (scopeAddressKeys.has(key)) {
      return true;
    }
  }

  return false;
};

const getBlockedCidList = (blockedCids: { [cid: string]: boolean | undefined } | undefined): string[] =>
  Object.entries(blockedCids || {})
    .filter(([, blocked]) => blocked)
    .map(([cid]) => cid)
    .sort();

const isThreadPost = (comment: Comment): boolean => {
  const { cid, parentCid, postCid } = comment || {};
  return Boolean(cid && !parentCid && (!postCid || postCid === cid));
};

// The board's feed drops the threads the viewer hid, so their place in bump order is unknown and
// last reply is the closest order for them. The other catalog orders apply as they are.
const sortHiddenThreads = (threads: Comment[], sortType: CatalogSortType): Comment[] =>
  sortCatalogFeedForDisplay(threads, sortType === 'active' ? 'lastReply' : sortType);

const getHiddenThreadCandidates = ({
  blockedCidList,
  comments,
  communityAddresses,
  directories,
}: {
  blockedCidList: readonly string[];
  comments: readonly (Comment | undefined)[];
  communityAddresses: readonly string[];
  directories: DirectoryCommunity[];
}): Comment[] => {
  if (blockedCidList.length === 0 || communityAddresses.length === 0) {
    return [];
  }

  const blockedCidSet = new Set(blockedCidList);
  const scopeAddressKeys = getScopeAddressKeys(communityAddresses, directories);
  const seenCids = new Set<string>();
  const candidates: Comment[] = [];

  for (const comment of comments) {
    const cid = comment?.cid;
    if (!comment || !cid || seenCids.has(cid) || !blockedCidSet.has(cid)) {
      continue;
    }
    if (!isThreadPost(comment)) {
      continue;
    }
    if (!isBoardAddressInScope(getCommentCommunityAddress(comment), scopeAddressKeys, directories)) {
      continue;
    }

    seenCids.add(cid);
    candidates.push(comment);
  }

  return candidates;
};

const mergeCommentsByCid = (comments: readonly (Comment | undefined)[], candidateComments: readonly Comment[]): (Comment | undefined)[] => {
  if (candidateComments.length === 0) {
    return [...comments];
  }

  const mergedComments = [...comments];
  const seenCids = new Set(comments.map((comment) => comment?.cid).filter((cid): cid is string => typeof cid === 'string'));
  for (const comment of candidateComments) {
    const cid = comment?.cid;
    if (!cid || seenCids.has(cid)) {
      continue;
    }
    seenCids.add(cid);
    mergedComments.push(comment);
  }
  return mergedComments;
};

const getHiddenCatalogThreads = (hiddenThreadCandidates: readonly Comment[], sortType: CatalogSortType): Comment[] =>
  sortHiddenThreads(
    hiddenThreadCandidates.filter((comment) => !isCommentArchived(comment)),
    sortType,
  );

const useHiddenCatalogThreads = ({ candidateComments = [], communityAddresses, sortType }: HiddenCatalogThreadsOptions): HiddenCatalogThreadsResult => {
  const account = useAccount();
  const directories = useDirectories();
  const hiddenCommentsByCid = useHiddenCatalogThreadsStore((state) => state.hiddenCommentsByCid);
  const blockedCidList = useMemo(() => getBlockedCidList(account?.blockedCids), [account?.blockedCids]);
  const { comments, state } = useComments({
    autoUpdate: false,
    commentCids: blockedCidList,
  });
  const rememberedHiddenComments = useMemo(
    () => blockedCidList.map((cid) => hiddenCommentsByCid[cid]).filter((comment): comment is Comment => Boolean(comment)),
    [blockedCidList, hiddenCommentsByCid],
  );
  const candidateCommentList = useMemo(
    () => mergeCommentsByCid(mergeCommentsByCid(comments, rememberedHiddenComments), candidateComments),
    [candidateComments, comments, rememberedHiddenComments],
  );
  const hiddenThreadCandidates = useMemo(
    () =>
      getHiddenThreadCandidates({
        blockedCidList,
        comments: candidateCommentList,
        communityAddresses,
        directories,
      }),
    [blockedCidList, candidateCommentList, communityAddresses, directories],
  );
  const hiddenCatalogThreads = useMemo(() => getHiddenCatalogThreads(hiddenThreadCandidates, sortType), [hiddenThreadCandidates, sortType]);
  const scopeKey = useMemo(() => getHiddenCatalogThreadsScopeKey(communityAddresses), [communityAddresses]);

  return useMemo(
    () => ({
      hiddenCatalogThreads,
      hiddenThreadCandidates,
      isLoadingHiddenCatalogThreads: blockedCidList.length > 0 && state !== 'succeeded',
      scopeKey,
    }),
    [blockedCidList.length, hiddenCatalogThreads, hiddenThreadCandidates, scopeKey, state],
  );
};

export default useHiddenCatalogThreads;
