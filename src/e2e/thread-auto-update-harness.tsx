import { useEffect, useMemo, useRef, useState } from 'react';
import type { Comment } from '@bitsocial/bitsocial-react-hooks';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AutoButton, ThreadUpdateStatus, UpdateButton } from '../components/board-buttons';
import { QuotePreviewPostProvider } from '../components/post';
import PostDesktop from '../components/post-desktop';
import PostMobile from '../components/post-mobile';
import useIsMobile from '../hooks/use-is-mobile';
import useThreadUpdater from '../hooks/use-thread-updater';
import { updateFavicon } from '../lib/update-favicon';
import useThreadLiveUpdatesStore from '../stores/use-thread-live-updates-store';

// Renders the real thread controls, updater, and reply list against a scripted server so the
// browser check can add replies, fail refreshes, and fast-forward the Auto countdown.

const THREAD_CID = 'thread-root';
const BOARD_ADDRESS = 'music-posting.eth';
const INITIAL_REPLY_COUNT = 30;
const REFRESH_DELAY_MS = 300;
const NOOP = async () => {};

type ThreadAutoUpdateHarnessApi = {
  addReplies: (count: number) => void;
  setRefreshFails: (fails: boolean) => void;
  getRefreshCount: () => number;
};

declare global {
  interface Window {
    __THREAD_AUTO_UPDATE_E2E__?: ThreadAutoUpdateHarnessApi;
  }
}

const buildReply = (index: number): Comment =>
  ({
    author: { address: `0x${index.toString(16).padStart(4, '0')}`, shortAddress: index.toString(16).padStart(4, '0') },
    cid: `reply-${index}`,
    communityAddress: BOARD_ADDRESS,
    content: `Reply ${index} to the scripted thread.`,
    number: index + 1,
    parentCid: THREAD_CID,
    postCid: THREAD_CID,
    state: 'succeeded',
    timestamp: 1700000000 + index * 60,
    updatedAt: 1700000000 + index * 60,
  }) as Comment;

const buildReplies = (count: number) => Array.from({ length: count }, (_, index) => buildReply(index + 1));

const buildPost = (replyCount: number, updatedAt: number): Comment =>
  ({
    author: { address: '0xop', shortAddress: '0xop' },
    cid: THREAD_CID,
    communityAddress: BOARD_ADDRESS,
    content: 'Scripted thread for the Auto and Update controls.',
    number: 1,
    postCid: THREAD_CID,
    replyCount,
    state: 'succeeded',
    timestamp: 1699999000,
    title: 'Thread Auto Update E2E',
    updatedAt,
  }) as Comment;

const Harness = () => {
  const isMobile = useIsMobile();
  const serverRepliesRef = useRef(buildReplies(INITIAL_REPLY_COUNT));
  const refreshFailsRef = useRef(false);
  const refreshCountRef = useRef(0);
  const [replies, setReplies] = useState(serverRepliesRef.current);
  const [postVersion, setPostVersion] = useState(1);
  const post = useMemo(() => buildPost(replies.length, postVersion), [postVersion, replies.length]);
  const unreadCount = useThreadLiveUpdatesStore((state) => state.unreadCount);
  const faviconAlert = useThreadLiveUpdatesStore((state) => state.faviconAlert);

  const refreshThread = useMemo(
    () => async () => {
      refreshCountRef.current += 1;
      await new Promise((resolve) => setTimeout(resolve, REFRESH_DELAY_MS));
      if (refreshFailsRef.current) return false;
      setReplies(serverRepliesRef.current);
      setPostVersion((version) => version + 1);
      return true;
    },
    [],
  );

  useThreadUpdater({ post, refreshThread });

  useEffect(() => {
    document.body.classList.add('yotsuba');
    window.__THREAD_AUTO_UPDATE_E2E__ = {
      addReplies: (count) => {
        const start = serverRepliesRef.current.length + 1;
        serverRepliesRef.current = [...serverRepliesRef.current, ...Array.from({ length: count }, (_, index) => buildReply(start + index))];
      },
      setRefreshFails: (fails) => {
        refreshFailsRef.current = fails;
      },
      getRefreshCount: () => refreshCountRef.current,
    };
    return () => {
      delete window.__THREAD_AUTO_UPDATE_E2E__;
    };
  }, []);

  useEffect(() => {
    document.title = `${unreadCount > 0 ? `(${unreadCount}) ` : ''}Thread Auto Update E2E`;
  }, [unreadCount]);

  useEffect(() => {
    updateFavicon('default', faviconAlert);
  }, [faviconAlert]);

  const replyPaginationOverride = useMemo(() => ({ hasMore: false, loadMore: NOOP, replies }), [replies]);
  const ThreadPost = isMobile ? PostMobile : PostDesktop;

  return (
    <main>
      <h1>Thread Auto Update E2E</h1>
      <div data-testid='thread-controls'>
        {isMobile ? (
          <>
            <UpdateButton /> <AutoButton />
            <ThreadUpdateStatus isMobile={true} />
          </>
        ) : (
          <>
            [<UpdateButton />] [<AutoButton />] <ThreadUpdateStatus />
          </>
        )}
      </div>
      <div data-testid='visible-replies-count'>{replies.length}</div>
      <MemoryRouter initialEntries={[`/mu/thread/${THREAD_CID}`]}>
        <Routes>
          <Route
            path='/:boardIdentifier/thread/:commentCid'
            element={
              <QuotePreviewPostProvider>
                <ThreadPost post={post} replyPaginationOverride={replyPaginationOverride} roles={{} as never} showAllReplies={true} showReplies={true} />
              </QuotePreviewPostProvider>
            }
          />
        </Routes>
      </MemoryRouter>
    </main>
  );
};

export default Harness;
