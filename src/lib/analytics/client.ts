import { inject, pageview, track, type BeforeSendEvent } from '@vercel/analytics';
import { SPECIAL_BOARDS } from '../special-boards';
import { normalizeBoardAddress } from '../utils/directory-list-lookup-utils';
import { vendoredDirectoryLists } from '../utils/vendored-directory-lists';
import { isAnalyticsEnabled, type PostingAnalyticsEvent } from './shared';

// Only codes from the bundled public directory may leave the client. Custom board
// addresses, public keys, thread IDs, search text and settings values stay local.
const publicBoards = new Map<string, string>();
for (const directory of vendoredDirectoryLists.directories) {
  publicBoards.set(directory.directoryCode, directory.directoryCode);
  for (const board of directory.boards) {
    publicBoards.set(normalizeBoardAddress(board.address), directory.directoryCode);
    if (board.publicKey) publicBoards.set(board.publicKey, directory.directoryCode);
  }
}
for (const board of SPECIAL_BOARDS) {
  for (const address of [board.directoryCode, board.address, board.publicKey, ...(board.aliases ?? [])]) {
    if (address) publicBoards.set(normalizeBoardAddress(address), board.directoryCode);
  }
}

export const getAnalyticsBoard = (address?: string): string => (address ? (publicBoards.get(normalizeBoardAddress(address)) ?? 'other') : 'other');

const publicPages = new Set(['faq', 'pass', 'rules', 'blotter', 'not-found', 'not-allowed']);
const aggregateBoards = new Set(['all', 'subs', 'mod']);

export const getAnalyticsPath = (pathname: string): string => {
  const parts = pathname.split(/[?#]/, 1)[0].split('/').filter(Boolean);
  if (parts.length === 0) return '/';
  if (parts[0] === 'settings') return '/settings';
  // Settings are a modal over several route types. Keep their identifiers private.
  const lastPart = parts[parts.length - 1];
  if (lastPart === 'settings' || lastPart === 'board-settings') return '/settings';
  if (parts[0] === 'pending') return '/pending';
  if (publicPages.has(parts[0])) return parts.length === 1 ? `/${parts[0]}` : '/not-found';
  if (parts[0] === 'search') {
    if (parts.length === 1) return '/search';
    return parts.length === 2 && ['catalog', 'directory'].includes(parts[1]) ? `/search/${parts[1]}` : '/not-found';
  }
  let boardIdentifier: string;
  try {
    boardIdentifier = decodeURIComponent(parts[0]);
  } catch {
    return '/not-found';
  }
  const board = aggregateBoards.has(boardIdentifier) ? boardIdentifier : getAnalyticsBoard(boardIdentifier);
  if (parts.length === 1) return `/${board}`;
  if (parts[1] === 'thread' && (parts.length === 2 || parts.length === 3)) return `/${board}/thread`;
  if (parts[1] === 'mod' && parts[2] === 'queue' && parts.length === 3) return '/mod/queue';
  if (board === 'mod' && parts[1] === 'queue' && parts.length === 2) return '/mod/queue';
  if (parts.length === 2 && ['catalog', 'archive', 'directory'].includes(parts[1])) return `/${board}/${parts[1]}`;
  if (parts.length === 2 && (/^\d+$/.test(parts[1]) || parts[1] === 'page')) return `/${board}/page`;
  return '/not-found';
};

export const sanitizeAnalyticsEvent = (event: BeforeSendEvent): BeforeSendEvent | null => {
  if (!isAnalyticsEnabled()) return null;
  try {
    const pathname = event.type === 'event' ? window.location.hash.slice(1) : new URL(event.url).pathname;
    return { ...event, url: new URL(getAnalyticsPath(pathname), window.location.origin).href };
  } catch {
    return null;
  }
};

let initialized = false;
const initialize = () => {
  if (initialized) return;
  inject({ disableAutoTrack: true, beforeSend: sanitizeAnalyticsEvent, mode: 'production' });
  initialized = true;
};

export const trackPageView = (pathname: string): void => {
  if (!isAnalyticsEnabled()) return;
  initialize();
  const path = getAnalyticsPath(pathname);
  pageview({ path, route: path });
};

export const trackPostingEvent = (event: PostingAnalyticsEvent, context: { kind: 'thread' | 'reply'; communityAddress?: string }): void => {
  if (!isAnalyticsEnabled()) return;
  initialize();
  const properties = { board: getAnalyticsBoard(context.communityAddress), kind: context.kind };
  track(event, properties);
};
