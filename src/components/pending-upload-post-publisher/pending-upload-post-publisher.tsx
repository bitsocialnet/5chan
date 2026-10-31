import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import type { Comment } from '@bitsocial/bitsocial-react-hooks';
import { useFileUpload } from '../../hooks/use-file-upload';
import usePublishPost from '../../hooks/use-publish-post';
import useSpamBlockerPrecheck from '../../hooks/use-spam-blocker-precheck';
import type { AttachedMedia } from '../../lib/media-hosting/types';
import { getShownPendingUploadId, isPendingUploadPostPath } from '../../lib/utils/pending-post-route-state';
import { getNonokoPendingRouteState } from '../../lib/utils/post-options-utils';
import usePendingPostNavigationStore from '../../stores/use-pending-post-navigation-store';
import usePendingUploadPostStore, { isPendingUploadPost, type PendingUploadPost } from '../../stores/use-pending-upload-post-store';
import usePostFormDraftsStore from '../../stores/use-post-form-drafts-store';
import { createPublishPostStore } from '../../stores/use-publish-post-store';

/**
 * The board's form draft while it still holds this post: its file, or the link the upload put in its place.
 * The author can reopen the form during the upload and start another post, which the steps must not touch.
 */
const getDraftHoldingPost = ({ attachment, draftKey, link }: { attachment: AttachedMedia; draftKey: string; link: string | undefined }) => {
  const draft = usePostFormDraftsStore.getState().forms[draftKey]?.draft;
  if (!draft) return undefined;
  const holdsPost = draft.attachment ? draft.attachment === attachment : link !== undefined && draft.link === link;
  return holdsPost ? draft : undefined;
};

/**
 * Runs a submitted new thread's steps: the board's spam blocker check, then the upload, then the publish.
 * It lives at the app root because the form that submitted the post unmounts when the pending page opens.
 */
const Publisher = ({ pendingUploadPost }: { pendingUploadPost: PendingUploadPost }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { pathname, state: locationState } = useLocation();
  const { id, attachment, authorRole, boardChallenges, boardPath, draftKey, nonokoRedirectPath, publishOptions } = pendingUploadPost;
  const { uploadAttachment } = useFileUpload();
  const runSpamBlockerPrecheck = useSpamBlockerPrecheck({ communityAddress: publishOptions.communityAddress });
  // Its own publish options store: the post form's shared one would hand this post's title, link and pass
  // to the form's next post, and a form open meanwhile would overwrite them.
  const [publishPostStore] = useState(createPublishPostStore);
  const startedRef = useRef(false);
  const pendingIndexRef = useRef<number | null>(null);
  const uploadedLinkRef = useRef<string | undefined>(undefined);
  // The draft as submitted; once accepted, the form is cleared only if the author has not edited it since.
  const [submittedDraft] = useState(() => usePostFormDraftsStore.getState().forms[draftKey]?.draft);
  // Whether the upload page shows this post. Read by the steps after their awaits, so they never pull someone
  // who left it, or who is watching another post upload, back to this one.
  const shownPendingUploadId = usePendingUploadPostStore((state) =>
    getShownPendingUploadId(
      state.pendingUploadPosts.map((post) => post.id),
      locationState,
    ),
  );
  const isShownRef = useRef(false);
  useEffect(() => {
    isShownRef.current = isPendingUploadPostPath(pathname) && shownPendingUploadId === id;
  }, [id, pathname, shownPendingUploadId]);

  const returnToForm = useCallback(
    (message?: string) => {
      if (!isPendingUploadPost(id)) return;
      if (getDraftHoldingPost({ attachment, draftKey, link: uploadedLinkRef.current })) {
        const { openForm, showSubmissionError } = usePostFormDraftsStore.getState();
        if (message) {
          showSubmissionError(draftKey, `${t('error')}: ${message}`);
        } else {
          openForm(draftKey);
        }
      }
      if (isShownRef.current) {
        navigate(draftKey, { replace: true });
      }
      usePendingUploadPostStore.getState().clearPendingUploadPost(id);
    },
    [attachment, draftKey, id, navigate, t],
  );

  const onPendingPost = useCallback(
    (accountCommentIndex: number, pendingPost: Comment) => {
      pendingIndexRef.current = accountCommentIndex;
      // Committed before the upload is cleared: the upload page would otherwise render without its post first and
      // send the author to the board. The form's own hand-off does the same.
      if (isShownRef.current) {
        if (nonokoRedirectPath) {
          flushSync(() => navigate(nonokoRedirectPath, { flushSync: true, replace: true, state: getNonokoPendingRouteState(accountCommentIndex) }));
        } else {
          usePendingPostNavigationStore.getState().beginPendingPostNavigation(accountCommentIndex);
          flushSync(() =>
            navigate(`/pending/${accountCommentIndex}`, {
              flushSync: true,
              replace: true,
              state: { ...(boardPath ? { boardPath } : {}), pendingPost },
            }),
          );
        }
      }
      usePendingUploadPostStore.getState().clearPendingUploadPost(id);
    },
    [boardPath, id, navigate, nonokoRedirectPath],
  );

  // The publish keeps calling these after the publisher unmounts, as the form's own publish did.
  const onAbandonPost = useCallback(() => {
    const pendingIndex = pendingIndexRef.current;
    const pendingNavigation = usePendingPostNavigationStore.getState();
    // Only an author looking at this post goes back to its form: its upload page, or its pending page while that
    // is still on screen. One who moved on stays where they are; the post is abandoned either way.
    const showsThisPost = pendingIndex === null ? isShownRef.current : pendingNavigation.visiblePendingPostIndex === pendingIndex;
    if (pendingIndex !== null) pendingNavigation.clearPendingPostNavigation(pendingIndex);
    if (showsThisPost) navigate(draftKey, { replace: true });
  }, [draftKey, navigate]);

  const onDuplicateMediaRejected = useCallback(
    (error: string) => {
      if (!getDraftHoldingPost({ attachment, draftKey, link: uploadedLinkRef.current })) return;
      usePostFormDraftsStore.getState().showSubmissionError(draftKey, `${t('error')}: ${error}`);
    },
    [attachment, draftKey, t],
  );

  const onPublishAccepted = useCallback(() => {
    const draft = getDraftHoldingPost({ attachment, draftKey, link: uploadedLinkRef.current });
    if (draft && draft.content === submittedDraft?.content && draft.title === submittedDraft?.title) {
      usePostFormDraftsStore.getState().clearForm(draftKey);
    }
  }, [attachment, draftKey, submittedDraft]);

  const onPublishError = useCallback(
    (error: Error) => {
      const pendingIndex = pendingIndexRef.current;
      if (pendingIndex !== null) {
        usePendingPostNavigationStore.getState().clearPendingPostHandoff(pendingIndex);
        return;
      }
      // It failed before the post had an account comment, so the pending page would never leave the upload.
      returnToForm(error.message);
    },
    [returnToForm],
  );

  const { publishPost } = usePublishPost({
    communityAddress: publishOptions.communityAddress,
    onAbandonPost,
    onDuplicateMediaRejected,
    onPendingPost,
    onPublishAccepted,
    onPublishError,
    publishPostStore,
  });

  useEffect(() => {
    // Strict Mode runs effects twice on mount; the steps must run once per submitted post.
    if (startedRef.current) return;
    startedRef.current = true;

    const runSteps = async () => {
      const precheck = await runSpamBlockerPrecheck({
        authorRole,
        challenges: boardChallenges,
        otherAnswers: publishOptions.challengeRequest?.challengeAnswers,
        publication: {
          content: publishOptions.content,
          displayName: publishOptions.displayName,
          flairs: publishOptions.flairs,
          spoiler: publishOptions.spoiler,
          title: publishOptions.title,
        },
      });
      if (precheck.status === 'stopped') {
        returnToForm(precheck.message);
        return;
      }
      if (!isPendingUploadPost(id)) return;

      const { setPendingUploadPhase } = usePendingUploadPostStore.getState();
      const uploaded = await uploadAttachment(attachment, (phase) => setPendingUploadPhase(id, phase));
      if (!uploaded) {
        returnToForm();
        return;
      }
      if (!isPendingUploadPost(id)) return;
      // A post the board rejects returns to the form with this link, so posting again does not upload again.
      uploadedLinkRef.current = uploaded.url;
      if (usePostFormDraftsStore.getState().forms[draftKey]?.draft.attachment === attachment) {
        usePostFormDraftsStore.getState().updateDraft(draftKey, { attachment: undefined, link: uploaded.url });
      }

      await publishPost({
        ...publishOptions,
        link: uploaded.url,
        // The pre-check's answers keep the post's other answers, such as its country flag.
        ...(precheck.status === 'passed' ? { challengeRequest: { challengeAnswers: precheck.challengeAnswers } } : {}),
      });
      // The pending comment exists once the publish starts; a publish that never got there leaves the upload page.
      returnToForm();
    };
    runSteps().catch((error: unknown) => returnToForm(error instanceof Error ? error.message : String(error)));
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- runs once for the post this publisher was mounted for
  }, []);

  return null;
};

const PendingUploadPostPublisher = () => {
  const pendingUploadPosts = usePendingUploadPostStore((state) => state.pendingUploadPosts);
  return pendingUploadPosts.map((pendingUploadPost) => <Publisher key={pendingUploadPost.id} pendingUploadPost={pendingUploadPost} />);
};

export default PendingUploadPostPublisher;
