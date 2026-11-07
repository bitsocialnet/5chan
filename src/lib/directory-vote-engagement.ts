import { getDirectoryCodeFromContestId } from './directory-vote-contest-id';
import { areSameBoardAddress } from './utils/route-utils';

interface DirectoryVoteRecord {
  contestId: string;
  community?: { name?: string; publicKey: string };
  refreshedAt?: number;
}

const isVotedBoard = (community: DirectoryVoteRecord['community'], boardIdentifier: string): boolean =>
  !!community && (community.publicKey === boardIdentifier || areSameBoardAddress(community.name, boardIdentifier));

/**
 * The directories, among those the user votes in, that a board route visits: the route's own
 * directory (`routeDirectoryCode`: the code itself, or the directory listing the board), and the
 * directory of a vote for this very board, since a challenger's supporters browse the challenger
 * rather than the board holding the code.
 */
export const getVisitedDirectoryCodes = (boardIdentifier: string, routeDirectoryCode: string | undefined, votes: Iterable<DirectoryVoteRecord>): string[] => {
  const codes = new Set<string>();
  for (const vote of votes) {
    const code = getDirectoryCodeFromContestId(vote.contestId);
    if (code && (code === routeDirectoryCode || isVotedBoard(vote.community, boardIdentifier))) codes.add(code);
  }
  return [...codes].sort();
};

/**
 * Whether a standing vote may be re-signed: the user cast it after the last refresh, or visited its
 * directory since. Refreshing on app activity alone would keep a board on top with the votes of
 * people who no longer visit it, however it changes, until they think to withdraw them.
 */
export const isDirectoryVoteEngaged = (vote: DirectoryVoteRecord, directoryVisits: Readonly<Record<string, number>>): boolean => {
  if (vote.refreshedAt === undefined) return true;
  const code = getDirectoryCodeFromContestId(vote.contestId);
  const visitedAt = code === undefined ? undefined : directoryVisits[code];
  return visitedAt !== undefined && visitedAt > vote.refreshedAt;
};
