import { useEffect, useMemo } from 'react';
import { getVisitedDirectoryCodes } from '../lib/directory-vote-engagement';
import { recordDirectoryVoteVisits } from '../lib/directory-vote-visits';
import { getDirectoryCodeForBoardAddress } from '../lib/utils/directory-list-lookup-utils';
import { isDirectoryRoute } from '../lib/utils/route-utils';
import useDirectoryVotesStore from '../stores/use-directory-votes-store';
import { useDirectories } from './use-directories';
import { useCommunityField } from './use-stable-community';

/**
 * Records a visit to each directory the user votes in that this board route belongs to, on arrival
 * and whenever the tab comes back into view, so those votes keep being refreshed (see
 * refreshDueDirectoryVotes).
 */
export const useDirectoryVoteVisits = (boardIdentifier: string | undefined): void => {
  const directories = useDirectories();
  const votes = useDirectoryVotesStore((state) => state.votes);
  // The key of the record the board view loads, read from the store without fetching, so a vote
  // cast by key alone still counts visits to the board's name route.
  const boardPublicKey = useCommunityField(boardIdentifier, (community) => (typeof community.publicKey === 'string' ? community.publicKey : undefined));
  // Joined into a string so a vote refresh, which leaves the codes unchanged, does not record again.
  const visitedCodes = useMemo(() => {
    if (!boardIdentifier) return '';
    const routeDirectoryCode = isDirectoryRoute(boardIdentifier, directories) ? boardIdentifier : getDirectoryCodeForBoardAddress(boardIdentifier);
    return getVisitedDirectoryCodes(boardIdentifier, routeDirectoryCode, Object.values(votes), boardPublicKey).join(' ');
  }, [boardIdentifier, boardPublicKey, directories, votes]);

  useEffect(() => {
    if (!visitedCodes) return;
    const codes = visitedCodes.split(' ');
    const recordWhenVisible = () => {
      if (document.visibilityState === 'visible') recordDirectoryVoteVisits(codes);
    };
    recordDirectoryVoteVisits(codes);
    document.addEventListener('visibilitychange', recordWhenVisible);
    return () => document.removeEventListener('visibilitychange', recordWhenVisible);
  }, [visitedCodes]);
};
