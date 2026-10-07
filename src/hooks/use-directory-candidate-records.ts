import { useMemo } from 'react';
import { useCommunities } from '@bitsocial/bitsocial-react-hooks';
import { useDirectories } from './use-directories';
import { useDirectoryList } from './use-directory-list';
import { useCommunityIdentifiers } from './use-community-identifiers';
import { isDirectoryRoute } from '../lib/utils/route-utils';

/**
 * Keep every candidate's record loading for a directory with more than one candidate, so the
 * winner can move past a board that misses the requirements to one whose record shows it qualifies.
 */
export const useDirectoryCandidateRecords = (boardIdentifier: string | undefined): void => {
  const directories = useDirectories();
  const isCode = !!boardIdentifier && isDirectoryRoute(boardIdentifier, directories);
  const { list } = useDirectoryList(isCode ? boardIdentifier : undefined);
  const addresses = useMemo(() => (list && list.boards.length > 1 ? list.boards.map((board) => board.address) : undefined), [list]);
  // The same identifiers the board views and directory rows use, so each record is loaded once.
  const communities = useCommunityIdentifiers(addresses);
  useCommunities({ communities });
};
