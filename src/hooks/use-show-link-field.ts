import useMediaHostingStore from '../stores/use-media-hosting-store';
import { hasUsableUploadProvider } from '../lib/media-hosting/provider-order';
import { isPublishFileMediaLink } from '../lib/utils/media-link-validation-utils';
import { getMediaHostingRuntime, isWebRuntime } from '../lib/media-hosting/show-upload-controls';
import { useProviderAvailability } from './use-provider-availability';

/**
 * Whether a post or reply form shows its "Link To File" field. The setting hides it only while an
 * upload provider can take the file: with none enabled, or all known to be unreachable, pasting a
 * link is the only way left to attach media.
 */
export function useShowLinkField({ link, requireMediaLink, showOekakiControls }: { link: string; requireMediaLink: boolean; showOekakiControls: boolean }): boolean {
  const showLinkField = useMediaHostingStore((state) => state.showLinkField);
  const uploadMode = useMediaHostingStore((state) => state.uploadMode);
  const preferredProvider = useMediaHostingStore((state) => state.preferredProvider);
  // Reuses probes already run by the settings or an upload attempt instead of probing on every form open.
  const availability = useProviderAvailability();
  return (
    showLinkField ||
    // A board that accepts any link needs the field for links an upload cannot replace.
    !requireMediaLink ||
    // The File row cannot name a link that is not a media file (e.g. an uploaded .swf), so reveal it to be seen and fixed.
    (Boolean(link) && !isPublishFileMediaLink(link)) ||
    // Tegaki cannot auto-upload on web and tells the user to paste its image link into this field.
    (showOekakiControls && isWebRuntime()) ||
    !hasUsableUploadProvider({ mode: uploadMode, preferredProvider, runtime: getMediaHostingRuntime(), availability })
  );
}
