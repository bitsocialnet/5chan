import * as React from 'react';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AttachedMedia, UploadPhase } from '../../../lib/media-hosting/types';
import usePendingPostNavigationStore from '../../../stores/use-pending-post-navigation-store';
import usePendingUploadPostStore from '../../../stores/use-pending-upload-post-store';
import usePostFormDraftsStore from '../../../stores/use-post-form-drafts-store';
import PendingUploadPostPublisher from '../pending-upload-post-publisher';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const act = (React as { act?: (cb: () => void | Promise<void>) => void | Promise<void> }).act as (cb: () => void | Promise<void>) => void | Promise<void>;

type PublishPostOptions = {
  onPendingPost?: (accountCommentIndex: number, pendingPost: Record<string, unknown>) => void;
  onPublishAccepted?: () => void;
  onPublishError?: (error: Error) => void;
};

const testState = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  pathname: '/pending/upload',
  precheckMock: vi.fn(),
  precheckHookOptions: undefined as { communityAddress?: string } | undefined,
  publishPostMock: vi.fn(),
  publishPostOptions: undefined as PublishPostOptions | undefined,
  uploadAttachmentMock: vi.fn<(media: unknown, onPhaseChange?: (phase: UploadPhase) => void) => Promise<{ url: string; fileName: string } | null>>(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname: testState.pathname }),
  useNavigate: () => testState.navigateMock,
}));

vi.mock('../../../hooks/use-file-upload', () => ({
  useFileUpload: () => ({ uploadAttachment: testState.uploadAttachmentMock }),
}));

vi.mock('../../../hooks/use-spam-blocker-precheck', () => ({
  default: (options: { communityAddress?: string }) => {
    testState.precheckHookOptions = options;
    return testState.precheckMock;
  },
}));

vi.mock('../../../hooks/use-publish-post', () => ({
  default: (options: PublishPostOptions) => {
    testState.publishPostOptions = options;
    return { publishPost: testState.publishPostMock };
  },
}));

const attachment: AttachedMedia = { kind: 'file', file: new File(['png'], 'chosen.png', { type: 'image/png' }), name: 'chosen.png', mimeType: 'image/png' };
const challenges = [{ type: 'url/iframe', challenge: 'https://spamblocker.example/api/v1/precheck' }];
const publishOptions = { communityAddress: 'music-posting.eth', content: 'thread body', displayName: 'anon', title: 'subject' };
const publishedPost = { communityAddress: 'music-posting.eth', link: 'https://forgeimg.net/abc/chosen.png' };

let container: HTMLDivElement;
let root: Root;

const flush = async () => {
  for (let i = 0; i < 6; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
};

const submitPost = async (overrides: { nonokoRedirectPath?: string | null; publishOptions?: Record<string, unknown> } = {}) => {
  usePostFormDraftsStore.getState().updateDraft('/mu', { attachment, content: 'thread body' });
  usePostFormDraftsStore.getState().closeForm('/mu');
  const pendingUploadPost = usePendingUploadPostStore.getState().startPendingUploadPost({
    attachment,
    boardChallenges: challenges,
    boardPath: 'mu',
    draftKey: '/mu',
    nonokoRedirectPath: overrides.nonokoRedirectPath ?? null,
    post: { communityAddress: 'music-posting.eth', content: 'thread body' },
    publishOptions: overrides.publishOptions ?? publishOptions,
  });
  await act(async () => {
    root.render(createElement(PendingUploadPostPublisher));
  });
  await flush();
  return pendingUploadPost;
};

describe('PendingUploadPostPublisher', () => {
  beforeEach(() => {
    testState.navigateMock.mockReset();
    testState.pathname = '/pending/upload';
    testState.precheckMock.mockReset();
    testState.precheckMock.mockResolvedValue({ status: 'passed', challengeAnswers: ['precheck-pass'] });
    testState.publishPostMock.mockReset();
    // Like the real publish, the pending comment exists by the time publishPost resolves.
    testState.publishPostMock.mockImplementation(async () => testState.publishPostOptions?.onPendingPost?.(7, publishedPost));
    testState.publishPostOptions = undefined;
    testState.uploadAttachmentMock.mockReset();
    usePendingUploadPostStore.setState({ pendingUploadPost: null });
    usePostFormDraftsStore.setState({ forms: {} });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    usePendingPostNavigationStore.getState().clearPendingPostNavigation();
  });

  it('checks the post with the spam blocker, then uploads its file, then publishes it with the link and the pass', async () => {
    const phases: string[] = [];
    const unsubscribe = usePendingUploadPostStore.subscribe((state) => state.pendingUploadPost && phases.push(state.pendingUploadPost.phase));
    testState.precheckMock.mockImplementation(async () => {
      expect(testState.uploadAttachmentMock).not.toHaveBeenCalled();
      return { status: 'passed', challengeAnswers: ['precheck-pass', 'precheck-pass'] };
    });
    testState.uploadAttachmentMock.mockImplementation(async (_media, onPhaseChange) => {
      onPhaseChange?.('uploading');
      onPhaseChange?.('checking');
      return { url: 'https://forgeimg.net/abc/chosen.png', fileName: 'chosen.png' };
    });

    await submitPost();
    unsubscribe();

    expect(testState.precheckHookOptions).toEqual({ communityAddress: 'music-posting.eth' });
    expect(testState.precheckMock).toHaveBeenCalledWith({
      challenges,
      publication: { content: 'thread body', displayName: 'anon', flairs: undefined, spoiler: undefined, title: 'subject' },
    });
    expect(testState.uploadAttachmentMock).toHaveBeenCalledWith(attachment, expect.any(Function));
    expect(phases).toEqual(['spam_check', 'uploading', 'checking']);
    expect(testState.publishPostMock).toHaveBeenCalledWith({
      ...publishOptions,
      link: 'https://forgeimg.net/abc/chosen.png',
      challengeRequest: { challengeAnswers: ['precheck-pass', 'precheck-pass'] },
    });
    // Posting again from the form publishes the uploaded link instead of uploading the file again.
    expect(usePostFormDraftsStore.getState().forms['/mu']?.draft).toMatchObject({ attachment: undefined, link: 'https://forgeimg.net/abc/chosen.png' });
  });

  it('publishes without a pass on a board whose spam blocker takes none', async () => {
    testState.precheckMock.mockResolvedValue({ status: 'skipped' });
    testState.uploadAttachmentMock.mockResolvedValue({ url: 'https://forgeimg.net/abc/chosen.png', fileName: 'chosen.png' });

    await submitPost();

    expect(testState.publishPostMock).toHaveBeenCalledWith({ ...publishOptions, link: 'https://forgeimg.net/abc/chosen.png' });
  });

  it('opens the published post and stops showing the upload once the post has an account comment', async () => {
    testState.uploadAttachmentMock.mockResolvedValue({ url: 'https://forgeimg.net/abc/chosen.png', fileName: 'chosen.png' });
    await submitPost();

    expect(testState.navigateMock).toHaveBeenCalledTimes(1);
    expect(testState.navigateMock).toHaveBeenCalledWith('/pending/7', { replace: true, state: { boardPath: 'mu', pendingPost: publishedPost } });
    expect(usePendingPostNavigationStore.getState().pendingPostNavigationIndex).toBe(7);
    expect(usePendingUploadPostStore.getState().pendingUploadPost).toBeNull();

    act(() => testState.publishPostOptions?.onPublishAccepted?.());
    expect(usePostFormDraftsStore.getState().forms['/mu']).toBeUndefined();
  });

  it('does not pull a user who left the pending page back to the published post', async () => {
    let finishUpload: (value: { url: string; fileName: string }) => void = () => undefined;
    testState.uploadAttachmentMock.mockImplementation(() => new Promise((resolve) => (finishUpload = resolve)));
    await submitPost();
    testState.pathname = '/biz';
    await act(async () => {
      root.render(createElement(PendingUploadPostPublisher));
    });

    await act(async () => finishUpload({ url: 'https://forgeimg.net/abc/chosen.png', fileName: 'chosen.png' }));
    await flush();

    expect(testState.publishPostMock).toHaveBeenCalledTimes(1);
    expect(testState.navigateMock).not.toHaveBeenCalled();
    expect(usePendingUploadPostStore.getState().pendingUploadPost).toBeNull();
  });

  it('returns to the form with the file still attached when the spam blocker stops the post, without uploading', async () => {
    testState.precheckMock.mockResolvedValue({ status: 'stopped', message: 'You are blocked from posting' });

    await submitPost();

    expect(testState.uploadAttachmentMock).not.toHaveBeenCalled();
    expect(testState.publishPostMock).not.toHaveBeenCalled();
    expect(usePostFormDraftsStore.getState().forms['/mu']).toMatchObject({
      isOpen: true,
      submissionError: 'error: You are blocked from posting',
      draft: { attachment },
    });
    expect(testState.navigateMock).toHaveBeenCalledWith('/mu', { replace: true });
    expect(usePendingUploadPostStore.getState().pendingUploadPost).toBeNull();
  });

  it("keeps the post's country flag answer in the answers that carry the pass", async () => {
    const flagChallengeRequest = { challengeAnswers: ['bitsocial-flags:5chan:flag:country:auto'] };
    testState.precheckMock.mockResolvedValue({ status: 'passed', challengeAnswers: ['bitsocial-flags:5chan:flag:country:auto', '', 'precheck-pass'] });
    testState.uploadAttachmentMock.mockResolvedValue({ url: 'https://forgeimg.net/abc/chosen.png', fileName: 'chosen.png' });

    await submitPost({ publishOptions: { ...publishOptions, challengeRequest: flagChallengeRequest } });

    expect(testState.precheckMock).toHaveBeenCalledWith(expect.objectContaining({ otherAnswers: flagChallengeRequest.challengeAnswers }));
    expect(testState.publishPostMock).toHaveBeenCalledWith(
      expect.objectContaining({ challengeRequest: { challengeAnswers: ['bitsocial-flags:5chan:flag:country:auto', '', 'precheck-pass'] } }),
    );
  });

  it('returns to the form with the reason when the publish fails before the post has an account comment', async () => {
    testState.uploadAttachmentMock.mockResolvedValue({ url: 'https://forgeimg.net/abc/chosen.png', fileName: 'chosen.png' });
    testState.publishPostMock.mockImplementation(async () => testState.publishPostOptions?.onPublishError?.(new Error('Your address could not be verified')));

    await submitPost();

    expect(usePostFormDraftsStore.getState().forms['/mu']).toMatchObject({
      isOpen: true,
      submissionError: 'error: Your address could not be verified',
      draft: { attachment: undefined, link: 'https://forgeimg.net/abc/chosen.png' },
    });
    expect(testState.navigateMock).toHaveBeenCalledWith('/mu', { replace: true });
    expect(usePendingUploadPostStore.getState().pendingUploadPost).toBeNull();
  });

  it('returns to the form when the publish ends without creating the pending post', async () => {
    testState.uploadAttachmentMock.mockResolvedValue({ url: 'https://forgeimg.net/abc/chosen.png', fileName: 'chosen.png' });
    testState.publishPostMock.mockResolvedValue(undefined);

    await submitPost();

    expect(usePostFormDraftsStore.getState().forms['/mu']?.isOpen).toBe(true);
    expect(testState.navigateMock).toHaveBeenCalledWith('/mu', { replace: true });
    expect(usePendingUploadPostStore.getState().pendingUploadPost).toBeNull();
  });

  it('returns to the form when a step throws', async () => {
    testState.precheckMock.mockRejectedValue(new Error('randomUUID is not available'));

    await submitPost();

    expect(testState.uploadAttachmentMock).not.toHaveBeenCalled();
    expect(usePostFormDraftsStore.getState().forms['/mu']?.submissionError).toBe('error: randomUUID is not available');
    expect(usePendingUploadPostStore.getState().pendingUploadPost).toBeNull();
  });

  it('returns to the form without publishing when the upload fails', async () => {
    testState.uploadAttachmentMock.mockResolvedValue(null);

    await submitPost();

    expect(testState.publishPostMock).not.toHaveBeenCalled();
    expect(usePostFormDraftsStore.getState().forms['/mu']).toMatchObject({ isOpen: true, draft: { attachment } });
    expect(testState.navigateMock).toHaveBeenCalledWith('/mu', { replace: true });
    expect(usePendingUploadPostStore.getState().pendingUploadPost).toBeNull();
  });
});
