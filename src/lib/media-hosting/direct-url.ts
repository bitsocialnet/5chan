/** File extensions that denote direct media URLs (images + videos) */
const DIRECT_MEDIA_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.webm', '.mp4', '.mov', '.avi', '.mkv', '.gifv'] as const;

/** Returns true if the URL appears to point to a direct media file (image or video) */
export function isDirectMediaUrl(url: string): boolean {
  try {
    const normalized = url.split('?')[0].split('#')[0].toLowerCase();
    return DIRECT_MEDIA_EXTENSIONS.some((ext) => normalized.endsWith(ext));
  } catch {
    return false;
  }
}
