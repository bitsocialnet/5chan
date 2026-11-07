import { BOARD_CODE_GROUPS, getAllBoardCodes } from '../../constants/board-codes';
import type { DirectoryCommunity } from './directory-list-utils';
import { extractDirectoryFromTitle } from './route-utils';

const BUNDLED_BOARD_CODES: ReadonlySet<string> = new Set(getAllBoardCodes());

export interface BoardCodeGroups {
  /** The classic bracket groups, plus a trailing group when directories are missing from them. */
  groups: readonly (readonly string[])[];
  /** Every code across the groups. */
  codes: readonly string[];
  /** Directory codes outside the bundled groups, sorted. */
  publishedCodes: readonly string[];
}

/**
 * The bundled bracket layout only knows the boards that existed at build time. Directories published to
 * bitsocialnet/lists later arrive through useDirectories, so they get their own trailing group and older
 * releases still list them.
 */
export const getBoardCodeGroups = (directories: readonly DirectoryCommunity[]): BoardCodeGroups => {
  const publishedCodes = new Set<string>();
  for (const directory of directories) {
    const code = directory.directoryCode ?? extractDirectoryFromTitle(directory.title ?? '');
    if (code && !BUNDLED_BOARD_CODES.has(code)) publishedCodes.add(code);
  }

  const sortedPublishedCodes = [...publishedCodes].sort();
  const groups = sortedPublishedCodes.length > 0 ? [...BOARD_CODE_GROUPS, sortedPublishedCodes] : BOARD_CODE_GROUPS;
  return { groups, codes: groups.flat(), publishedCodes: sortedPublishedCodes };
};

/**
 * Which codes the boards bar shows. A selection that keeps every bundled board means "show all", so it also
 * shows boards published after it was saved; any narrower selection shows exactly what it lists.
 */
export const createBoardCodeVisibility = (visibleDirectories: ReadonlySet<string>, publishedCodes: readonly string[]): ((code: string) => boolean) => {
  const showsEveryBundledBoard = [...BUNDLED_BOARD_CODES].every((code) => visibleDirectories.has(code));
  const published = new Set(publishedCodes);
  return (code) => visibleDirectories.has(code) || (showsEveryBundledBoard && published.has(code));
};
