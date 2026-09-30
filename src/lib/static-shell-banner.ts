// The static board frame (scripts/vite-static-shell.mjs) picks a banner before the app loads. The
// first board header takes the same one so React's first frame matches the frame already on screen;
// later headers pick their own.
declare global {
  interface Window {
    __FIVECHAN_SHELL_BANNER__?: string;
  }
}

export const takeStaticShellBanner = (): string | undefined => {
  if (typeof window === 'undefined') return undefined;
  const banner = window.__FIVECHAN_SHELL_BANNER__;
  delete window.__FIVECHAN_SHELL_BANNER__;
  return banner;
};
