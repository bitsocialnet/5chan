const STANDARD_YOUTUBE_HOSTS = new Set<string>(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be', 'www.youtu.be']);

export const youtubeHosts = new Set<string>([
  'youtube.com',
  'www.youtube.com',
  'youtu.be',
  'www.youtu.be',
  'm.youtube.com',
  'music.youtube.com',
  // working Invidious instances - https://docs.invidious.io/instances/ - https://uptime.invidious.io/
  'yewtu.be',
  'inv.nadeko.net',
  'yt.artemislena.eu',
  'invidious.nerdvpn.de',
]);

export const xHosts = new Set<string>(['twitter.com', 'www.twitter.com', 'x.com', 'www.x.com']);

export const getXTweetId = (parsedUrl: URL): string | undefined => {
  const pathParts = parsedUrl.pathname.split('/').filter(Boolean);
  const statusIndex = pathParts.findIndex((part) => part === 'status' || part === 'statuses');
  const statusId = statusIndex === -1 ? undefined : pathParts[statusIndex + 1];

  return statusId && /^\d+$/.test(statusId) ? statusId : undefined;
};

export const redditHosts = new Set<string>(['reddit.com', 'www.reddit.com', 'old.reddit.com']);
export const twitchHosts = new Set<string>(['twitch.tv', 'www.twitch.tv']);
export const tiktokHosts = new Set<string>(['tiktok.com', 'www.tiktok.com']);
export const instagramHosts = new Set<string>(['instagram.com', 'www.instagram.com']);
export const odyseeHosts = new Set<string>(['odysee.com', 'www.odysee.com']);
export const bitchuteHosts = new Set<string>(['bitchute.com', 'www.bitchute.com']);
export const streamableHosts = new Set<string>(['streamable.com', 'www.streamable.com']);
export const spotifyHosts = new Set<string>(['spotify.com', 'www.spotify.com', 'open.spotify.com']);
export const soundcloudHosts = new Set<string>(['soundcloud.com', 'www.soundcloud.com', 'on.soundcloud.com', 'api.soundcloud.com', 'w.soundcloud.com']);
export const vimeoHosts = new Set<string>(['vimeo.com', 'www.vimeo.com', 'player.vimeo.com']);

export interface VimeoVideo {
  id: string;
  // Unlisted videos only play when the embed carries their privacy hash.
  hash?: string;
}

// Covers vimeo.com/{id}, unlisted vimeo.com/{id}/{hash}, channels/{name}/{id},
// album|showcase/{id}/video/{id}, groups/{name}/videos/{id} and player.vimeo.com/video/{id}?h={hash}.
export const getVimeoVideo = (parsedUrl: URL): VimeoVideo | undefined => {
  if (!vimeoHosts.has(parsedUrl.host)) {
    return undefined;
  }

  const pathParts = parsedUrl.pathname.split('/').filter(Boolean);
  const videoKeywordIndex = Math.max(pathParts.lastIndexOf('video'), pathParts.lastIndexOf('videos'));
  const idIndex = videoKeywordIndex >= 0 ? videoKeywordIndex + 1 : pathParts[0] === 'channels' ? 2 : 0;
  const id = pathParts[idIndex];
  if (!id || !/^\d+$/.test(id)) {
    return undefined;
  }

  const hash = parsedUrl.searchParams.get('h') || pathParts[idIndex + 1];
  return hash && /^[\da-f]+$/i.test(hash) ? { id, hash } : { id };
};

const canEmbedHosts = new Set<string>([
  ...youtubeHosts,
  ...xHosts,
  ...redditHosts,
  ...twitchHosts,
  ...tiktokHosts,
  ...instagramHosts,
  ...odyseeHosts,
  ...bitchuteHosts,
  ...soundcloudHosts,
  ...streamableHosts,
  ...spotifyHosts,
  ...vimeoHosts,
]);

export const getYouTubeVideoId = (parsedUrl: URL): string | null => {
  if (parsedUrl.searchParams.has('list') && !parsedUrl.searchParams.get('v') && !parsedUrl.host.includes('youtu.be') && !parsedUrl.pathname.includes('/shorts/')) {
    return null;
  }

  const videoIdFromQuery = parsedUrl.searchParams.get('v');
  if (videoIdFromQuery) {
    return videoIdFromQuery;
  }

  if (parsedUrl.host.includes('youtu.be')) {
    return parsedUrl.pathname.slice(1).split('/')[0] || null;
  }

  if (parsedUrl.pathname.includes('/shorts/')) {
    return parsedUrl.pathname.split('/shorts/')[1]?.split('/')[0] || null;
  }

  const isInvidious = !STANDARD_YOUTUBE_HOSTS.has(parsedUrl.host) && (youtubeHosts.has(parsedUrl.host) || parsedUrl.host.startsWith('yt.'));
  if (isInvidious) {
    if (parsedUrl.pathname.startsWith('/watch')) {
      return parsedUrl.searchParams.get('v');
    }
    return parsedUrl.pathname.split('/').filter(Boolean).pop() || null;
  }

  return null;
};

export const canEmbed = (parsedUrl: URL): boolean => {
  if (xHosts.has(parsedUrl.host)) {
    return Boolean(getXTweetId(parsedUrl));
  }

  if (redditHosts.has(parsedUrl.host)) {
    // Reddit posts are not embeddable if the URL does not include '/comments/'
    return parsedUrl.pathname.includes('/comments/');
  }

  if (vimeoHosts.has(parsedUrl.host)) {
    return Boolean(getVimeoVideo(parsedUrl));
  }

  return canEmbedHosts.has(parsedUrl.host) || (parsedUrl.host.startsWith('yt.') && parsedUrl.searchParams.has('v'));
};
