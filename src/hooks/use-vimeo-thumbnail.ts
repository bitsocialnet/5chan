import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { type CommentMediaInfo, getVimeoThumbnailLookupUrl, getVimeoThumbnailUrlSnapshot, subscribeVimeoThumbnailUrl } from '../lib/utils/media-utils';

/** Adds the oEmbed thumbnail to a Vimeo embed that has none. Pass `enabled: false` to defer the lookup. */
export const useVimeoThumbnail = (commentMediaInfo: CommentMediaInfo | undefined, enabled = true): CommentMediaInfo | undefined => {
  const lookupUrl = useMemo(() => (enabled ? getVimeoThumbnailLookupUrl(commentMediaInfo) : undefined), [commentMediaInfo, enabled]);
  const subscribe = useCallback((listener: () => void) => subscribeVimeoThumbnailUrl(lookupUrl, listener), [lookupUrl]);
  const getSnapshot = useCallback(() => getVimeoThumbnailUrlSnapshot(lookupUrl), [lookupUrl]);
  const thumbnail = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  return useMemo(() => (commentMediaInfo && thumbnail ? { ...commentMediaInfo, thumbnail } : commentMediaInfo), [commentMediaInfo, thumbnail]);
};
