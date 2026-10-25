import { useMemo } from 'react';
import { useDirectoryDefaults } from './use-directories';
import { getDirectoryBoardRequirements, type DirectoryBoardRequirement } from '../lib/directory-board-requirements';
import type { DirectoryList } from '../lib/utils/directory-list-utils';

/**
 * A directory's hosting requirements from the latest directory defaults, so every client, an older
 * app release included, checks the same settings; the list's bundled features are the fallback. Rules
 * come only from the defaults, the same source /rules shows, so a board is never held to rules it can't read.
 */
export const useDirectoryBoardRequirements = (list: DirectoryList | null | undefined): DirectoryBoardRequirement[] => {
  const defaults = useDirectoryDefaults();
  const entry = list ? defaults.directories[list.directoryCode] : undefined;
  const features = entry?.features || list?.features;
  const rules = entry?.rules;
  return useMemo(() => getDirectoryBoardRequirements(features, rules), [features, rules]);
};
