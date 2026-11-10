import * as React from 'react';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PostTransferModal from '../post-transfer-modal';
import { TRASH_BOARD_ADDRESS, TRASH_BOARD_PUBLIC_KEY, TRASH_BOARD_TITLE } from '../../../lib/special-boards';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const act = (React as { act?: (cb: () => void | Promise<void>) => void | Promise<void> }).act as (cb: () => void | Promise<void>) => void | Promise<void>;
const TRANSFER_MODAL_POSITION_SESSION_STORAGE_KEY = '5chan:transfer-modal-position';

const testState = vi.hoisted(() => ({
  addChallengeMock: vi.fn(),
  createAccountMock: vi.fn().mockResolvedValue(undefined),
  deleteAccountMock: vi.fn().mockResolvedValue(undefined),
  deleteCommentMock: vi.fn().mockResolvedValue(undefined),
  directories: [
    { address: 'music-posting.eth', directoryCode: 'mu', title: '/mu/ - Music' },
    { address: 'random-nsfw.bso', directoryCode: 'b', title: '/b/ - Random' },
  ] as Array<{ address: string; directoryCode?: string; title?: string }>,
  dragHandler: undefined as ((state: { active: boolean; event: Pick<Event, 'preventDefault'>; offset: [number, number] }) => void) | undefined,
  onCloseMock: vi.fn(),
  publishCommentMock: vi.fn().mockResolvedValue(undefined),
  publishCommentModerationMock: vi.fn().mockResolvedValue(undefined),
  springStartMock: vi.fn(),
  useSpringMock: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => (options ? `${key}:${JSON.stringify(options)}` : key),
  }),
}));

vi.mock('../../../hooks/use-directories', () => ({
  normalizeBoardAddress: (address: string) => address.replace(/\.(bso|eth)$/, ''),
  useDirectories: () => testState.directories,
}));

vi.mock('../../../stores/use-challenges-store', () => ({
  default: {
    getState: () => ({
      addChallenge: testState.addChallengeMock,
    }),
  },
}));

vi.mock('@bitsocial/bitsocial-react-hooks/dist/stores/accounts/index.js', () => ({
  default: <T,>(selector: (state: { accountsActions: Record<string, unknown> }) => T) =>
    selector({
      accountsActions: {
        createAccount: testState.createAccountMock,
        deleteAccount: testState.deleteAccountMock,
        deleteComment: testState.deleteCommentMock,
        publishComment: testState.publishCommentMock,
        publishCommentModeration: testState.publishCommentModerationMock,
      },
    }),
}));

vi.mock('@react-spring/web', async () => {
  const React = await vi.importActual<typeof import('react')>('react');
  const normalizeStyle = (style: Record<string, unknown> | undefined) =>
    style
      ? Object.fromEntries(
          Object.entries(style).map(([key, value]) => [
            key,
            typeof value === 'object' && value !== null && 'get' in value && typeof (value as { get: unknown }).get === 'function'
              ? (value as { get: () => unknown }).get()
              : value,
          ]),
        )
      : undefined;

  return {
    animated: {
      div: React.forwardRef(({ style, ...props }: any, ref) => React.createElement('div', { ...props, ref, style: normalizeStyle(style) })),
    },
    useSpring: testState.useSpringMock.mockImplementation(() => [
      {
        left: { get: () => 120 },
        top: { get: () => 80 },
      },
      {
        start: testState.springStartMock,
      },
    ]),
  };
});

vi.mock('@use-gesture/react', () => ({
  useDrag: (handler: (state: { active: boolean; event: Pick<Event, 'preventDefault'>; offset: [number, number] }) => void) => {
    testState.dragHandler = handler;
    return () => ({});
  },
}));

let container: HTMLDivElement;
let root: Root;

const baseComment = {
  author: { displayName: 'Alice' },
  cid: 'comment-1',
  content: 'Original content',
  communityAddress: 'music-posting.eth',
  number: 42,
  parentCid: undefined,
  postCid: 'post-1',
  title: 'Subject',
} as any;

const renderTransferModal = async (comment = baseComment, props: Partial<React.ComponentProps<typeof PostTransferModal>> = {}) => {
  await act(async () => {
    // The success message links to the new /trash/ thread, which needs a router.
    root.render(createElement(MemoryRouter, {}, createElement(PostTransferModal, { comment, onClose: testState.onCloseMock, ...props })));
  });
};

type ModerationOptions = {
  commentCid?: string;
  onChallenge: (...args: unknown[]) => Promise<void>;
  onChallengeVerification: (verification: unknown, moderation: unknown) => Promise<void>;
  onError: (error: Error) => void;
  onPublishingStateChange?: (publishingState: string) => void;
};

// Submits the transfer and accepts the /trash/ copy, leaving the follow-up moderations for the test to settle.
const submitAndAcceptTrashCopy = async () => {
  const form = document.body.querySelector<HTMLFormElement>('form');
  await act(async () => {
    form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await Promise.resolve();
  });
  const [publishOptions] = testState.publishCommentMock.mock.calls[0] as [Record<string, unknown>, string];
  await act(async () => {
    void (publishOptions.onChallengeVerification as (verification: unknown, comment: unknown) => Promise<void>)(
      { challengeSuccess: true, commentUpdate: { cid: 'trash-copy', number: 7 } },
      { cid: 'trash-copy' },
    );
    await Promise.resolve();
  });
};

const getModerationOptions = (callIndex: number) => (testState.publishCommentModerationMock.mock.calls[callIndex] as [ModerationOptions])[0];

const settleModeration = async (callIndex: number, settle: (options: ModerationOptions) => Promise<void> | void) => {
  await act(async () => {
    await settle(getModerationOptions(callIndex));
    await Promise.resolve();
    await Promise.resolve();
  });
};

describe('PostTransferModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    testState.dragHandler = undefined;
    testState.springStartMock.mockReset();
    testState.useSpringMock.mockReset();
    testState.useSpringMock.mockImplementation(() => [
      {
        left: { get: () => 120 },
        top: { get: () => 80 },
      },
      {
        start: testState.springStartMock,
      },
    ]);
    window.sessionStorage.clear();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    document.body.innerHTML = '';
    window.sessionStorage.clear();
  });

  it('positions the draggable transfer modal with left/top styles instead of a transform layer', async () => {
    await renderTransferModal();

    const modal = document.body.querySelector<HTMLDivElement>('[role="dialog"]');

    expect(modal?.style.left).toBe('120px');
    expect(modal?.style.top).toBe('80px');
    expect(modal?.style.transform).toBe('');
  });

  it('renders the hidden trash board as the fixed transfer target', async () => {
    await renderTransferModal();

    expect(document.body.textContent).toContain(TRASH_BOARD_TITLE);
    expect(document.body.querySelector('select')).toBeNull();
  });

  it('publishes hidden trash board transfers with the canonical name and public key', async () => {
    await renderTransferModal();

    expect(document.body.querySelector('select')).toBeNull();

    const form = document.body.querySelector<HTMLFormElement>('form');
    expect(form).not.toBeNull();
    await act(async () => {
      form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    const [publishOptions] = testState.publishCommentMock.mock.calls[0] as [Record<string, unknown>, string];
    expect(publishOptions).toMatchObject({
      communityAddress: TRASH_BOARD_ADDRESS,
      communityName: TRASH_BOARD_ADDRESS,
      communityPublicKey: TRASH_BOARD_PUBLIC_KEY,
    });
  });

  it('unlocks after hidden trash board challenge verification fails', async () => {
    await renderTransferModal();

    const form = document.body.querySelector<HTMLFormElement>('form');
    expect(form).not.toBeNull();
    await act(async () => {
      form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    const [publishOptions] = testState.publishCommentMock.mock.calls[0] as [Record<string, unknown>, string];
    (publishOptions._onPendingCommentIndex as (index: number) => void)(12);
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
    await act(async () => {
      await (publishOptions.onChallengeVerification as (verification: unknown, comment: unknown) => Promise<void>)(
        { challengeSuccess: false, reason: 'try again' },
        { cid: 'challenge-comment' },
      );
      await Promise.resolve();
    });

    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(testState.deleteCommentMock).toHaveBeenCalledWith(12, expect.stringMatching(/^5chan-transfer-comment-/));
    expect(testState.deleteAccountMock).toHaveBeenCalledWith(expect.stringMatching(/^5chan-transfer-comment-/));
    expect(document.body.textContent).toContain('try again');
    const closeButton = Array.from(document.body.querySelectorAll<HTMLButtonElement>('button')).find((button) => button.textContent === 'close');
    const submitButton = Array.from(document.body.querySelectorAll<HTMLButtonElement>('button')).find((button) => button.type === 'submit');
    expect(closeButton?.disabled).toBe(false);
    expect(submitButton?.disabled).toBe(false);
    alertSpy.mockRestore();
  });

  it('reports success only after the source removal is verified', async () => {
    const onTransferSuccess = vi.fn();
    const onTransferStateChange = vi.fn();
    await renderTransferModal(baseComment, { onTransferStateChange, onTransferSuccess });

    await submitAndAcceptTrashCopy();

    // Both moderation publish actions resolve as soon as they are queued; neither is accepted yet.
    expect(getModerationOptions(0).commentCid).toBe('trash-copy');
    expect(getModerationOptions(1).commentCid).toBe('comment-1');
    expect(onTransferSuccess).not.toHaveBeenCalled();
    expect(onTransferStateChange).not.toHaveBeenCalledWith('succeeded');
    expect(document.body.textContent).not.toContain('modQueue.transferSuccess');
    // The temporary account is deleted before the wait, so a reload while waiting cannot leave it behind.
    expect(testState.deleteAccountMock).toHaveBeenCalledWith(expect.stringMatching(/^5chan-transfer-comment-/));

    await settleModeration(1, (options) => options.onChallengeVerification({ challengeSuccess: true }, { cid: 'comment-1' }));

    expect(testState.deleteAccountMock).toHaveBeenCalledTimes(1);
    expect(onTransferSuccess).toHaveBeenCalledTimes(1);
    expect(onTransferStateChange).toHaveBeenLastCalledWith('succeeded');
    expect(document.body.textContent).toContain('modQueue.transferSuccess');
  });

  it('reports a finalization failure when the source removal is rejected', async () => {
    const onTransferSuccess = vi.fn();
    const onTransferStateChange = vi.fn();
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
    await renderTransferModal(baseComment, { onTransferStateChange, onTransferSuccess });

    await submitAndAcceptTrashCopy();
    await settleModeration(1, (options) => options.onChallengeVerification({ challengeSuccess: false, reason: 'not a moderator' }, { cid: 'comment-1' }));

    expect(onTransferSuccess).not.toHaveBeenCalled();
    expect(onTransferStateChange).toHaveBeenLastCalledWith('finalizationFailed');
    expect(document.body.textContent).toContain('not a moderator');
    expect(document.body.textContent).not.toContain('modQueue.transferSuccess');
    expect(testState.deleteAccountMock).toHaveBeenCalledWith(expect.stringMatching(/^5chan-transfer-comment-/));
    alertSpy.mockRestore();
  });

  it('reports a finalization failure when the source removal challenge is closed', async () => {
    const onTransferSuccess = vi.fn();
    const onTransferStateChange = vi.fn();
    await renderTransferModal(baseComment, { onTransferStateChange, onTransferSuccess });

    await submitAndAcceptTrashCopy();
    await settleModeration(1, (options) => options.onChallenge({ challenges: [] }, { cid: 'comment-1' }));
    const abandonModerationChallenge = testState.addChallengeMock.mock.calls.at(-1)?.[1] as () => Promise<void>;
    await act(async () => {
      await abandonModerationChallenge();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onTransferSuccess).not.toHaveBeenCalled();
    expect(onTransferStateChange).toHaveBeenLastCalledWith('finalizationFailed');
  });

  it('reports a finalization failure when the source removal challenge answer fails to publish', async () => {
    const onTransferSuccess = vi.fn();
    const onTransferStateChange = vi.fn();
    await renderTransferModal(baseComment, { onTransferStateChange, onTransferSuccess });

    await submitAndAcceptTrashCopy();
    await settleModeration(1, (options) => options.onChallenge({ challenges: [] }, { cid: 'comment-1' }));
    // A challenge answer that fails to publish only moves the publishing state to 'failed'; no error or verification follows.
    await settleModeration(1, (options) => options.onPublishingStateChange?.('failed'));

    expect(onTransferSuccess).not.toHaveBeenCalled();
    expect(onTransferStateChange).toHaveBeenLastCalledWith('finalizationFailed');
    const closeButton = Array.from(document.body.querySelectorAll<HTMLButtonElement>('button')).find((button) => button.textContent === 'close');
    expect(closeButton?.disabled).toBe(false);
  });

  it('keeps the source removal error that follows a failed publishing state before any challenge', async () => {
    const onTransferStateChange = vi.fn();
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await renderTransferModal(baseComment, { onTransferStateChange });

    await submitAndAcceptTrashCopy();
    // Before a challenge, pkc-js moves the publishing state to 'failed' first and the error reaches onError afterwards.
    await settleModeration(1, (options) => options.onPublishingStateChange?.('failed'));
    expect(onTransferStateChange).not.toHaveBeenCalledWith('finalizationFailed');

    await settleModeration(1, (options) => options.onError(new Error('source board unreachable')));

    expect(onTransferStateChange).toHaveBeenLastCalledWith('finalizationFailed');
    expect(document.body.textContent).toContain('source board unreachable');
    consoleErrorSpy.mockRestore();
  });

  it('removes the source post even when the /trash/ target marker is rejected', async () => {
    // Any moderator of the source board can move a post, but only /trash/ moderators can publish the marker.
    const onTransferSuccess = vi.fn();
    const onTransferStateChange = vi.fn();
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
    await renderTransferModal(baseComment, { onTransferStateChange, onTransferSuccess });

    await submitAndAcceptTrashCopy();
    await settleModeration(0, (options) => options.onChallengeVerification({ challengeSuccess: false, reason: 'not a moderator' }, { cid: 'trash-copy' }));

    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(testState.publishCommentModerationMock).toHaveBeenCalledTimes(2);
    expect(getModerationOptions(1).commentCid).toBe('comment-1');
    expect(onTransferStateChange).not.toHaveBeenCalledWith('finalizationFailed');

    await settleModeration(1, (options) => options.onChallengeVerification({ challengeSuccess: true }, { cid: 'comment-1' }));

    expect(onTransferSuccess).toHaveBeenCalledTimes(1);
    expect(onTransferStateChange).toHaveBeenLastCalledWith('succeeded');
    expect(document.body.textContent).toContain('modQueue.transferSuccess');
    alertSpy.mockRestore();
  });

  it('disables submission when the hidden trash board is the transfer source', async () => {
    await renderTransferModal({ ...baseComment, communityAddress: TRASH_BOARD_ADDRESS });

    expect(document.body.textContent).toContain(TRASH_BOARD_TITLE);
    expect(document.body.querySelector('select')).toBeNull();
    const submitButton = Array.from(document.body.querySelectorAll<HTMLButtonElement>('button')).find((button) => button.type === 'submit');
    expect(submitButton?.disabled).toBe(true);

    const form = document.body.querySelector<HTMLFormElement>('form');
    expect(form).not.toBeNull();
    await act(async () => {
      form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(testState.publishCommentMock).not.toHaveBeenCalled();
    expect(testState.publishCommentModerationMock).not.toHaveBeenCalled();
  });

  it('disables submission when the transfer source uses the trash public key alias', async () => {
    await renderTransferModal({ ...baseComment, communityAddress: TRASH_BOARD_PUBLIC_KEY });

    expect(document.body.textContent).toContain(TRASH_BOARD_TITLE);
    expect(document.body.querySelector('select')).toBeNull();
    const submitButton = Array.from(document.body.querySelectorAll<HTMLButtonElement>('button')).find((button) => button.type === 'submit');
    expect(submitButton?.disabled).toBe(true);
  });

  it('reopens desktop transfer modals at the last dragged session position', async () => {
    await renderTransferModal();

    await act(async () => {
      testState.dragHandler?.({
        active: true,
        event: { preventDefault: vi.fn() },
        offset: [232.4, 146.6],
      });
      testState.dragHandler?.({
        active: false,
        event: { preventDefault: vi.fn() },
        offset: [232.4, 146.6],
      });
    });

    expect(JSON.parse(window.sessionStorage.getItem(TRANSFER_MODAL_POSITION_SESSION_STORAGE_KEY) ?? '{}')).toEqual({ left: 232, top: 147 });

    await act(async () => {
      root.render(createElement(React.Fragment));
    });

    testState.springStartMock.mockClear();
    testState.useSpringMock.mockClear();
    await renderTransferModal({ ...baseComment, cid: 'comment-2', number: 43 });

    const [configFactory] = testState.useSpringMock.mock.calls[0] as [() => Record<string, unknown>, unknown[]];
    expect(configFactory()).toEqual({
      from: {
        left: 232,
        top: 147,
      },
    });
    expect(testState.springStartMock).not.toHaveBeenCalled();
  });

  it('ignores the stored desktop position when first opened in a mobile viewport', async () => {
    const originalInnerWidth = window.innerWidth;
    const originalInnerHeight = window.innerHeight;
    window.sessionStorage.setItem(TRANSFER_MODAL_POSITION_SESSION_STORAGE_KEY, JSON.stringify({ left: 500, top: 210 }));
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 760 });

    try {
      await renderTransferModal();

      const [configFactory] = testState.useSpringMock.mock.calls[0] as [() => Record<string, unknown>, unknown[]];
      expect(configFactory()).toEqual({
        from: {
          left: 10,
          top: 380,
        },
      });
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalInnerWidth });
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: originalInnerHeight });
    }
  });
});
