import { useMemo } from 'react';
import { useDirectoryDefaults } from './use-directories';
import { getDirectoryBoardRequirements, type DirectoryBoardRequirement } from '../lib/directory-board-requirements';
import type { DirectoryList } from '../lib/utils/directory-list-utils';

/**
 * A directory's hosting requirements from the latest directory defaults, so every client, an older
 * app release included, checks the same settings; the list's bundled features are the fallback.
 */
export const useDirectoryBoardRequirements = (list: DirectoryList | null | undefined): DirectoryBoardRequirement[] => {
  const defaults = useDirectoryDefaults();
  const features = (list && defaults.directories[list.directoryCode]?.features) || list?.features;
  return useMemo(() => getDirectoryBoardRequirements(features), [features]);
};
