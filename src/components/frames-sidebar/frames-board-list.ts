import { getAllBoardCodes } from '../../constants/board-codes';
import { deriveCommunityNsfw, type DirectoryCommunity, type DirectoryDefaultsData } from '../../lib/utils/directory-list-utils';
import { extractDirectoryFromTitle, getBoardNameFromDirectoryTitle } from '../../lib/utils/route-utils';

// These existing homepage placeholders do not yet have directory defaults.
const PLACEHOLDER_BOARDS: Record<string, { title: string; nsfw: boolean }> = {
  aco: { title: 'Adult Cartoons', nsfw: true },
  cgl: { title: 'Cosplay & EGL', nsfw: false },
  cm: { title: 'Cute/Male', nsfw: false },
  d: { title: 'Hentai/Alternative', nsfw: true },
  e: { title: 'Ecchi', nsfw: true },
  h: { title: 'Hentai', nsfw: true },
  hc: { title: 'Hardcore', nsfw: true },
  hm: { title: 'Handsome Men', nsfw: true },
  hr: { title: 'High Resolution', nsfw: true },
  lgbt: { title: 'LGBT', nsfw: false },
  s: { title: 'Sexy Beautiful Women', nsfw: true },
  u: { title: 'Yuri', nsfw: true },
  y: { title: 'Yaoi', nsfw: true },
};

export interface FramesBoard {
  code: string;
  title: string;
  address?: string;
  nsfw?: boolean;
}

export const getFramesBoards = (directories: DirectoryCommunity[], defaults: DirectoryDefaultsData): FramesBoard[] => {
  const directoriesByCode = new Map<string, DirectoryCommunity>();
  for (const directory of directories) {
    const code = directory.directoryCode ?? extractDirectoryFromTitle(directory.title ?? '');
    if (code && !directoriesByCode.has(code)) directoriesByCode.set(code, directory);
  }

  const codes = new Set([...getAllBoardCodes(), ...Object.keys(defaults.directories), ...directoriesByCode.keys()]);
  return [...codes].sort().map((code) => {
    const directory = directoriesByCode.get(code);
    const defaultsEntry = defaults.directories[code];
    const fallback = PLACEHOLDER_BOARDS[code];
    const title = directory?.title || defaultsEntry?.title || fallback?.title || `/${code}/`;
    return {
      code,
      title: getBoardNameFromDirectoryTitle(title),
      address: directory?.address,
      nsfw: deriveCommunityNsfw(defaultsEntry, directory) ?? fallback?.nsfw,
    };
  });
};
