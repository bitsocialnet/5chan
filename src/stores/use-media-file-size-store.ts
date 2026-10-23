import { create } from 'zustand';
import { fetchMediaFileSize } from '../lib/utils/media-utils';

interface MediaFileSizeState {
  // null marks a file whose host did not expose its size, so it is not asked again this session.
  fileSizes: Record<string, number | null>;
}

const useMediaFileSizeStore = create<MediaFileSizeState>(() => ({
  fileSizes: {},
}));

const pendingUrls = new Set<string>();

// Called from media and thumbnail load events, so posts whose media never shows (spoilers, failed loads)
// never trigger a read, and image reads can reuse the browser's cached copy.
export const requestMediaFileSize = (url: string | undefined) => {
  if (!url || pendingUrls.has(url) || Object.hasOwn(useMediaFileSizeStore.getState().fileSizes, url)) return;
  pendingUrls.add(url);
  void fetchMediaFileSize(url).then((fileSize) => {
    pendingUrls.delete(url);
    useMediaFileSizeStore.setState((state) => ({ fileSizes: { ...state.fileSizes, [url]: fileSize ?? null } }));
  });
};

export const useMediaFileSize = (url: string | undefined): number | undefined =>
  useMediaFileSizeStore((state) => (url ? (state.fileSizes[url] ?? undefined) : undefined));

export default useMediaFileSizeStore;
