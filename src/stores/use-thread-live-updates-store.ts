import type { Comment } from '@bitsocial/bitsocial-react-hooks';
import { create } from 'zustand';
import type { FaviconAlert } from '../lib/update-favicon';
import type { ThreadDeadReason } from '../lib/utils/thread-updater-utils';

// A port of 4chan's thread updater (ThreadUpdater in its extension.js) so Auto and Update behave
// the same: each empty automatic update waits one step longer, any new post returns to the first
// step, and a hidden tab polls no faster than the fifth step.
export const THREAD_UPDATE_DELAYS_SECONDS = [10, 15, 20, 30, 60, 90, 120, 180, 240, 300];
const HIDDEN_TAB_DELAY_INDEX = 4;
// A comment refresh against an unreachable community can stay pending indefinitely.
export const THREAD_UPDATE_TIMEOUT_MS = 60_000;
// Refreshed replies reach the rendered thread shortly after the post refresh resolves.
export const THREAD_REPLIES_SETTLE_MS = 500;
const AUTO_SESSION_STORAGE_KEY_PREFIX = '5chan-thread-auto-update:';

export type ThreadUpdaterStatus =
  | { type: 'idle' }
  | { type: 'countdown'; seconds: number }
  | { type: 'updating' }
  | { type: 'no-new-posts' }
  | { type: 'new-posts'; count: number }
  /** `error` is why the update failed, kept so the label can copy it. */
  | { type: 'error'; reason: 'connection'; error: unknown }
  | { type: 'error'; reason: ThreadDeadReason };

export type ThreadFaviconAlert = FaviconAlert;

/**
 * Resolves whether the thread refreshed, or rejects with why it could not. `force` is set for a manual Update.
 * `signal` aborts when the update stops waiting for this refresh: it timed out, or the thread closed.
 */
export type RefreshThread = (options: { force: boolean; signal: AbortSignal }) => Promise<boolean>;

type UpdateOutcome = { refreshed: true } | { refreshed: false; error: unknown };

export interface NewThreadReplies {
  count: number;
  /** Last reply shown before the new ones, where the unread marker goes. */
  lastReadReplyCid?: string;
  /** At least one new reply quotes or answers one of the viewer's posts. */
  quotesOwnPost: boolean;
}

interface ThreadLiveUpdatesState {
  threadCid: string | undefined;
  /** The thread page's post, so stats rendered outside the page show the same update. */
  threadPost: Comment | undefined;
  enabled: boolean;
  isUpdating: boolean;
  /** Set once the thread is archived or deleted; updates stop for good. */
  deadReason: ThreadDeadReason | undefined;
  status: ThreadUpdaterStatus;
  unreadCount: number;
  unreadMarkerCid: string | undefined;
  faviconAlert: ThreadFaviconAlert | undefined;
  updatesStarted: number;
  /** Counts finished updates that brought new posts, when 4chan dispatches 4chanThreadUpdated. */
  updatesWithNewPosts: number;
  openThread: (threadCid: string | undefined) => void;
  setRefreshThread: (refreshThread: RefreshThread | undefined) => void;
  setThreadPost: (post: Comment | undefined) => void;
  setEnabled: (enabled: boolean) => void;
  toggleEnabled: () => void;
  forceUpdate: () => void;
  recordNewReplies: (newReplies: NewThreadReplies) => void;
  clearUnread: () => void;
  handleVisibilityChange: () => void;
  markThreadDead: (reason: ThreadDeadReason, announce: boolean) => void;
  resetState: () => void;
}

const defaultState = {
  threadCid: undefined,
  threadPost: undefined,
  enabled: false,
  isUpdating: false,
  deadReason: undefined,
  status: { type: 'idle' } as ThreadUpdaterStatus,
  unreadCount: 0,
  unreadMarkerCid: undefined,
  faviconAlert: undefined,
  updatesStarted: 0,
  updatesWithNewPosts: 0,
};

const getAutoSessionKey = (threadCid: string) => `${AUTO_SESSION_STORAGE_KEY_PREFIX}${threadCid}`;

const readAutoSession = (threadCid: string): boolean => {
  try {
    return window.sessionStorage.getItem(getAutoSessionKey(threadCid)) === '1';
  } catch {
    return false;
  }
};

const writeAutoSession = (threadCid: string | undefined, enabled: boolean) => {
  if (!threadCid) return;
  try {
    if (enabled) {
      window.sessionStorage.setItem(getAutoSessionKey(threadCid), '1');
    } else {
      window.sessionStorage.removeItem(getAutoSessionKey(threadCid));
    }
  } catch {
    // Auto still works for this page view when session storage is unavailable.
  }
};

// A refresh that never settles has no error of its own, so record what the thread was doing instead.
const createUpdateTimeoutError = (threadPost: Comment | undefined) => {
  const details = {
    threadCid: threadPost?.cid,
    communityAddress: threadPost?.communityAddress,
    state: threadPost?.state,
    updatingState: threadPost?.updatingState,
    error: threadPost?.error,
  };
  // The clipboard serializer spells out undefined, so leave out what is not known.
  return Object.assign(new Error(`Thread update timed out after ${THREAD_UPDATE_TIMEOUT_MS / 1000} seconds`), {
    details: Object.fromEntries(Object.entries(details).filter(([, value]) => value !== undefined)),
  });
};

const isDocumentHidden = () => typeof document !== 'undefined' && document.hidden;

const isPageScrollable = () => typeof document !== 'undefined' && document.documentElement.scrollHeight > window.innerHeight;

const useThreadLiveUpdatesStore = create<ThreadLiveUpdatesState>((set, get) => {
  let refreshThread: RefreshThread | undefined;
  let delayIndex = 0;
  // The countdown runs against a deadline because hidden tabs throttle chained timers to about
  // one wake-up a minute, which would stretch a counted-down delay far past its length.
  let deadline = 0;
  let pulseTimer: ReturnType<typeof setTimeout> | undefined;
  let hadAuto = false;
  let updateForced = false;
  let newPostsInUpdate = 0;
  // Invalidates in-flight updates when the thread changes or the page unmounts.
  let updateToken = 0;
  // Aborts the refresh of the update in flight once nothing waits for it any more.
  let updateAbortController: AbortController | undefined;

  const abortUpdateInFlight = () => {
    updateAbortController?.abort();
    updateAbortController = undefined;
  };

  const clearPulse = () => {
    if (pulseTimer === undefined) return;
    clearTimeout(pulseTimer);
    pulseTimer = undefined;
  };

  const setDelay = (seconds: number) => {
    deadline = Date.now() + seconds * 1000;
  };

  const pulse = () => {
    pulseTimer = undefined;
    const msLeft = deadline - Date.now();
    if (msLeft <= 0) {
      update(false);
      return;
    }
    set({ status: { type: 'countdown', seconds: Math.ceil(msLeft / 1000) } });
    pulseTimer = setTimeout(pulse, msLeft % 1000 || 1000);
  };

  const restartPulse = () => {
    clearPulse();
    pulse();
  };

  const adjustDelay = (postCount: number) => {
    if (postCount === 0) {
      if (!updateForced && delayIndex < THREAD_UPDATE_DELAYS_SECONDS.length - 1) {
        delayIndex += 1;
      }
    } else {
      delayIndex = isDocumentHidden() ? HIDDEN_TAB_DELAY_INDEX : 0;
    }
    setDelay(THREAD_UPDATE_DELAYS_SECONDS[delayIndex]);
    if (get().enabled) {
      restartPulse();
    }
  };

  const finishUpdate = (postCount: number) => {
    set({ isUpdating: false });
    adjustDelay(postCount);
  };

  const update = (force: boolean) => {
    const { deadReason, isUpdating, updatesStarted } = get();
    if (isUpdating) return;
    if (deadReason) {
      if (force) set({ status: { type: 'error', reason: deadReason } });
      return;
    }
    const refresh = refreshThread;
    if (!refresh) {
      // The thread has not loaded yet; try again after the same delay.
      if (!force && get().enabled) {
        setDelay(THREAD_UPDATE_DELAYS_SECONDS[delayIndex]);
        restartPulse();
      }
      return;
    }

    clearPulse();
    const token = ++updateToken;
    updateForced = force;
    newPostsInUpdate = 0;
    set({ isUpdating: true, status: { type: 'updating' }, updatesStarted: updatesStarted + 1 });

    const abortController = new AbortController();
    updateAbortController = abortController;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<UpdateOutcome>((resolve) => {
      timeoutId = setTimeout(() => {
        abortController.abort();
        resolve({ refreshed: false, error: createUpdateTimeoutError(get().threadPost) });
      }, THREAD_UPDATE_TIMEOUT_MS);
    });
    const refreshOutcome = refresh({ force, signal: abortController.signal }).then(
      (refreshed): UpdateOutcome => (refreshed ? { refreshed } : { refreshed, error: new Error('Thread refresh failed') }),
      (error: unknown): UpdateOutcome => ({ refreshed: false, error }),
    );

    void Promise.race([refreshOutcome, timeout]).then((outcome) => {
      clearTimeout(timeoutId);
      if (updateAbortController === abortController) updateAbortController = undefined;
      if (token !== updateToken) return;

      if (!outcome.refreshed) {
        set({ status: { type: 'error', reason: 'connection', error: outcome.error } });
        finishUpdate(0);
        return;
      }

      setTimeout(() => {
        if (token !== updateToken) return;
        if (newPostsInUpdate === 0) {
          set({ status: { type: 'no-new-posts' } });
        } else {
          const { status, updatesWithNewPosts } = get();
          set({ updatesWithNewPosts: updatesWithNewPosts + 1, status: status.type === 'updating' ? { type: 'idle' } : status });
        }
        finishUpdate(newPostsInUpdate);
      }, THREAD_REPLIES_SETTLE_MS);
    });
  };

  const start = () => {
    const { deadReason, isUpdating, threadCid } = get();
    if (!threadCid) return;
    if (deadReason) {
      set({ status: { type: 'error', reason: deadReason } });
      return;
    }
    hadAuto = true;
    set({ enabled: true });
    writeAutoSession(threadCid, true);
    delayIndex = 0;
    setDelay(THREAD_UPDATE_DELAYS_SECONDS[0]);
    // An update already in flight starts the countdown when it finishes.
    if (!isUpdating) restartPulse();
  };

  const stop = () => {
    const { deadReason, faviconAlert, isUpdating, status, threadCid } = get();
    clearPulse();
    set({
      enabled: false,
      faviconAlert: deadReason ? faviconAlert : undefined,
      status: isUpdating ? status : { type: 'idle' },
    });
    writeAutoSession(threadCid, false);
  };

  const resetControllerState = () => {
    clearPulse();
    abortUpdateInFlight();
    updateToken += 1;
    delayIndex = 0;
    deadline = 0;
    hadAuto = false;
    updateForced = false;
    newPostsInUpdate = 0;
  };

  return {
    ...defaultState,
    openThread: (threadCid) => {
      if (get().threadCid === threadCid) return;
      resetControllerState();
      set({ ...defaultState, threadCid });
      if (threadCid && readAutoSession(threadCid)) start();
    },
    setRefreshThread: (nextRefreshThread) => {
      refreshThread = nextRefreshThread;
    },
    setThreadPost: (threadPost) => set({ threadPost }),
    setEnabled: (enabled) => {
      if (enabled === get().enabled) return;
      if (enabled) start();
      else stop();
    },
    toggleEnabled: () => get().setEnabled(!get().enabled),
    forceUpdate: () => update(true),
    recordNewReplies: ({ count, lastReadReplyCid, quotesOwnPost }) => {
      if (count <= 0) return;
      newPostsInUpdate += count;
      const { faviconAlert, isUpdating, unreadCount, unreadMarkerCid } = get();

      if (!updateForced && isPageScrollable()) {
        let nextFaviconAlert = faviconAlert;
        if (faviconAlert !== 'dead') {
          if (quotesOwnPost) nextFaviconAlert = 'new-replies';
          else if (unreadCount === 0) nextFaviconAlert = 'new-posts';
        }
        set({
          faviconAlert: nextFaviconAlert,
          unreadCount: unreadCount + count,
          unreadMarkerCid: unreadMarkerCid ?? lastReadReplyCid,
        });
      } else {
        set({ status: { type: 'new-posts', count: newPostsInUpdate } });
      }

      // Replies that reach the page after their update settled still reset the delay.
      if (!isUpdating) {
        const firstDelayIndex = isDocumentHidden() ? HIDDEN_TAB_DELAY_INDEX : 0;
        if (delayIndex > firstDelayIndex) {
          delayIndex = firstDelayIndex;
          deadline = Math.min(deadline, Date.now() + THREAD_UPDATE_DELAYS_SECONDS[delayIndex] * 1000);
          if (get().enabled) restartPulse();
        }
      }
    },
    clearUnread: () => {
      if (!hadAuto) return;
      const { deadReason, faviconAlert, unreadCount, unreadMarkerCid } = get();
      const nextFaviconAlert = deadReason ? faviconAlert : undefined;
      if (unreadCount === 0 && unreadMarkerCid === undefined && faviconAlert === nextFaviconAlert) return;
      set({ faviconAlert: nextFaviconAlert, unreadCount: 0, unreadMarkerCid: undefined });
    },
    handleVisibilityChange: () => {
      if (!get().enabled) return;
      delayIndex = isDocumentHidden() ? Math.max(delayIndex, HIDDEN_TAB_DELAY_INDEX) : 0;
      setDelay(THREAD_UPDATE_DELAYS_SECONDS[0]);
      if (!get().isUpdating) restartPulse();
    },
    markThreadDead: (reason, announce) => {
      const { deadReason, threadCid } = get();
      if (deadReason) return;
      clearPulse();
      updateToken += 1;
      set({
        deadReason: reason,
        enabled: false,
        isUpdating: false,
        // A thread found dead when it loads has no controls, so no countdown or update started before it loaded stays shown.
        status: announce ? { type: 'error', reason } : { type: 'idle' },
        ...(announce ? { faviconAlert: 'dead' as const } : {}),
      });
      writeAutoSession(threadCid, false);
    },
    resetState: () => {
      resetControllerState();
      refreshThread = undefined;
      set(defaultState);
    },
  };
});

export default useThreadLiveUpdatesStore;
