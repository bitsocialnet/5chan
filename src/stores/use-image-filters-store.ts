import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { forEachCachedImageDigests, getCachedImageDigests, getLoadedImageUrls, hashImage, rememberLoadedImage, type ImageDigests } from '../lib/image-digests';
import {
  addImageFilterLine,
  getImageFilterKey,
  getMatchingImageFilterHash,
  hasImageFilterLine,
  isImageFilterHash,
  isImageHashableMediaType,
  parseImageFilterKeys,
  removeImageFilterLines,
  replaceImageFilterLine,
  getImageFilterHashKinds,
  getImageHashingNeeds,
} from '../lib/utils/image-filter-utils';

// 4chan X's MD5 filter: hides every post whose file is on the viewer's list. See image-filter-utils for
// what a post's file is matched by.
interface ImageFiltersState {
  /** The list as written in settings, one image hash or link per line. */
  imageFilters: string;
  /** The keys of imageFilters, kept alongside it so each post only does a set lookup. */
  filterKeys: Set<string>;
  /**
   * Links whose image hashed to a listed hash, with that hash. Kept across reloads, so a filtered image
   * whose link carries no hash hides before it loads again instead of after it is hashed.
   */
  matchedLinks: Record<string, string>;
  /** Filtered posts the viewer chose to show anyway. Like 4chan X, a reload filters them again. */
  shownCids: Record<string, boolean>;
  /**
   * The open quick filter notice: the page it shows on, since 4chan X's notice goes with its page, and
   * the keys it added, which its undo removes.
   */
  quickFilterNotice: { pathname: string; keys: string[] } | null;
  setImageFilters: (imageFilters: string) => void;
  /** Adds a post's file to the list and opens the page's notice, or extends it. */
  quickFilter: (link: string, cid: string | undefined, pathname: string, mediaType: string | undefined) => void;
  /** Hashes an image that finished loading, when its hash could match the list. */
  hashLoadedImage: (link: string | undefined) => void;
  undoQuickFilters: () => void;
  closeQuickFilterNotice: () => void;
  setPostShown: (cid: string, shown: boolean) => void;
}

// zustand's persist writes storage on every set, even one that changes nothing, so the actions below
// read the state first and only set it when something changes.

// Enough for the filtered images a viewer meets again, while the stored list stays small.
const MAX_MATCHED_LINKS = 1000;

const withoutCid = (shownCids: Record<string, boolean>, cid: string | undefined) => {
  if (!cid || !shownCids[cid]) return shownCids;
  const { [cid]: _removed, ...rest } = shownCids;
  return rest;
};

const keepNewestMatches = (matchedLinks: Record<string, string>): Record<string, string> => {
  const entries = Object.entries(matchedLinks);
  return entries.length > MAX_MATCHED_LINKS ? Object.fromEntries(entries.slice(-MAX_MATCHED_LINKS)) : matchedLinks;
};

/** The matches for a list: earlier ones whose hash is still listed, plus links hashed this session that now match. */
const getMatchedLinks = (matchedLinks: Record<string, string>, filterKeys: Set<string>): Record<string, string> => {
  const nextMatchedLinks: Record<string, string> = {};
  let changed = false;
  for (const [link, hash] of Object.entries(matchedLinks)) {
    if (filterKeys.has(hash)) nextMatchedLinks[link] = hash;
    else changed = true;
  }
  forEachCachedImageDigests((link, digests) => {
    const hash = getMatchingImageFilterHash(digests, filterKeys);
    if (hash && !nextMatchedLinks[link]) {
      nextMatchedLinks[link] = hash;
      changed = true;
    }
  });
  return changed ? keepNewestMatches(nextMatchedLinks) : matchedLinks;
};

const withList = (state: Pick<ImageFiltersState, 'matchedLinks'>, imageFilters: string) => {
  const filterKeys = parseImageFilterKeys(imageFilters);
  return { imageFilters, filterKeys, matchedLinks: getMatchedLinks(state.matchedLinks, filterKeys) };
};

const useImageFiltersStore = create<ImageFiltersState>()(
  persist(
    (set, get) => {
      const recordDigests = (link: string, digests: ImageDigests) => {
        const state = get();
        const hash = getMatchingImageFilterHash(digests, state.filterKeys);
        if (!hash || state.matchedLinks[link] === hash) return;
        set({ matchedLinks: keepNewestMatches({ ...state.matchedLinks, [link]: hash }) });
      };

      const hashForList = (link: string) => {
        const needs = getImageHashingNeeds(link, get().filterKeys);
        if (!needs) return;
        void hashImage(link, needs).then((digests) => {
          if (digests) recordDigests(link, digests);
        });
      };

      // Images that loaded while the list needed less hashing were left unhashed, such as copies of a
      // file on the page when its hash is first listed, so they are hashed once the list needs it.
      const hashLoadedImagesForNewNeeds = (previousKeys: Set<string>) => {
        const before = getImageFilterHashKinds(previousKeys);
        const after = getImageFilterHashKinds(get().filterKeys);
        if ((after.sha256 && !before.sha256) || (after.md5 && !before.md5)) getLoadedImageUrls().forEach(hashForList);
      };

      // Lists the hash in place of the link a quick filter added before the image was hashed, the way
      // 4chan X lists a file's hash, so the same image is filtered wherever it is posted.
      const replaceQuickFilterLink = (line: string, hash: string) => {
        const state = get();
        // The filter was undone or the line edited away before hashing finished.
        if (!hasImageFilterLine(state.imageFilters, line)) return;
        const alreadyListed = state.filterKeys.has(hash);
        const imageFilters = alreadyListed ? removeImageFilterLines(state.imageFilters, [line]) : replaceImageFilterLine(state.imageFilters, line, hash);
        const notice = state.quickFilterNotice;
        const noticeKeys = notice?.keys.flatMap((key) => (key !== line ? [key] : alreadyListed ? [] : [hash])) ?? [];
        set({ ...withList(state, imageFilters), quickFilterNotice: notice && noticeKeys.length > 0 ? { ...notice, keys: noticeKeys } : null });
        hashLoadedImagesForNewNeeds(state.filterKeys);
      };

      return {
        imageFilters: '',
        filterKeys: new Set<string>(),
        matchedLinks: {},
        shownCids: {},
        quickFilterNotice: null,
        setImageFilters: (imageFilters) => {
          const state = get();
          set(withList(state, imageFilters));
          hashLoadedImagesForNewNeeds(state.filterKeys);
        },
        quickFilter: (link, cid, pathname, mediaType) => {
          const lineKey = getImageFilterKey(link);
          if (!lineKey) return;
          // A Forge link carries its SHA-256; any other image is filtered by its SHA-256 once hashed.
          const key = getCachedImageDigests(link)?.sha256 ?? lineKey;
          const state = get();
          const shownCids = withoutCid(state.shownCids, cid);
          const matchedHash = state.matchedLinks[link];
          // Already filtered: the post was shown anyway, so filtering it again only hides it.
          if (state.filterKeys.has(key) || state.filterKeys.has(lineKey) || (matchedHash && state.filterKeys.has(matchedHash))) {
            if (shownCids !== state.shownCids) set({ shownCids });
            return;
          }
          const noticeKeys = state.quickFilterNotice?.pathname === pathname ? state.quickFilterNotice.keys : [];
          set({ ...withList(state, addImageFilterLine(state.imageFilters, key)), shownCids, quickFilterNotice: { pathname, keys: [...noticeKeys, key] } });
          hashLoadedImagesForNewNeeds(state.filterKeys);
          // Not hashed yet: the link hides the post at once, and its hash replaces it when ready.
          if (!isImageFilterHash(key) && isImageHashableMediaType(mediaType)) {
            void hashImage(link).then((digests) => {
              if (digests) replaceQuickFilterLink(key, digests.sha256);
            });
          }
        },
        hashLoadedImage: (link) => {
          if (!link) return;
          rememberLoadedImage(link);
          hashForList(link);
        },
        undoQuickFilters: () => {
          const state = get();
          if (!state.quickFilterNotice) return;
          set({ ...withList(state, removeImageFilterLines(state.imageFilters, state.quickFilterNotice.keys)), quickFilterNotice: null });
        },
        closeQuickFilterNotice: () => {
          if (get().quickFilterNotice) set({ quickFilterNotice: null });
        },
        setPostShown: (cid, shown) => {
          const { shownCids } = get();
          if (Boolean(shownCids[cid]) === shown) return;
          set({ shownCids: shown ? { ...shownCids, [cid]: true } : withoutCid(shownCids, cid) });
        },
      };
    },
    {
      name: 'image-filters-store',
      partialize: (state) => ({ imageFilters: state.imageFilters, matchedLinks: state.matchedLinks }),
      merge: (persisted, current) => {
        const { imageFilters, matchedLinks } = (persisted ?? {}) as { imageFilters?: unknown; matchedLinks?: unknown };
        if (typeof imageFilters !== 'string') return current;
        const storedMatches =
          matchedLinks && typeof matchedLinks === 'object' && !Array.isArray(matchedLinks)
            ? Object.fromEntries(Object.entries(matchedLinks).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
            : {};
        return { ...current, ...withList({ matchedLinks: storedMatches }, imageFilters) };
      },
    },
  ),
);

export default useImageFiltersStore;
