import * as React from 'react';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ReplyModal from '../reply-modal';
import { OEKAKI_WEB_WARNING_TEXT } from '../../../lib/oekaki/oekaki-copy';
import { POST_OPTIONS_VALIDATION_DELAY_MS } from '../../../lib/utils/post-options-utils';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const act = (React as { act?: (cb: () => void | Promise<void>) => void | Promise<void> }).act as (cb: () => void | Promise<void>) => void | Promise<void>;
const REPLY_MODAL_POSITION_SESSION_STORAGE_KEY = '5chan:reply-modal-position';

const testState = vi.hoisted(() => ({
  account: { author: { address: 'alice.eth', displayName: 'Alice' } } as { author?: { address?: string; displayName?: string } },
  closeModalMock: vi.fn(),
  directoryByAddress: {
    'music-posting.eth': {
      address: 'music-posting.eth',
      features: {},
      title: '/mu/ - Music',
    },
  } as Record<string, { address: string; directoryCode?: string; features?: Record<string, unknown>; title?: string }>,
  directoryListsByCode: {} as Record<
    string,
    {
      boards: Array<{ address: string; features?: Record<string, unknown>; publicKey?: string }>;
      directoryCode: string;
      features?: Record<string, unknown>;
      title?: string;
    }
  >,
  chooseFileMock: vi.fn(),
  uploadAttachmentMock: vi.fn(),
  precheckMock: vi.fn(),
  isMobile: false,
  mediaHostingRuntime: 'web' as 'web' | 'android' | 'electron',
  isResolvingExternalQuotes: false,
  uploadPhase: null as 'uploading' | 'checking' | null,
  navigateMock: vi.fn(),
  offlineTitle: '' as string | false,
  offlineStates: {} as Record<string, { isOffline: boolean; isOnlineStatusLoading: boolean; offlineTitle: string | false }>,
  offlineStatusLoading: false,
  offlineWarningVisible: false,
  openEmpty: false,
  locationDraftKey: '/mu/thread/post-1',
  replyDraft: undefined as { attachment?: unknown; content: string; flag?: string; link: string; options: string; spoiler: boolean } | undefined,
  updateDraftMock: vi.fn(),
  publishReplyMock: vi.fn(),
  publishReplyError: null as string | null,
  publishReplyStateMessage: null as string | null,
  quoteInsertNumber: undefined as number | undefined,
  quoteInsertRequestId: 0,
  quoteInsertSelectedText: '',
  dragHandler: undefined as ((state: { active: boolean; event: Pick<Event, 'preventDefault'>; offset: [number, number] }) => void) | undefined,
  replyIndex: undefined as number | undefined,
  resetPublishReplyOptionsMock: vi.fn(),
  resolvedCommunityAddress: undefined as string | undefined,
  rolesByCommunity: {} as Record<string, Record<string, { role?: string }>>,
  selectedText: 'selected text',
  setAccountMock: vi.fn(),
  setPublishReplyOptionsMock: vi.fn(),
  springStartMock: vi.fn(),
  useSpringMock: vi.fn(),
  communities: {
    'music-posting.eth': {
      address: 'music-posting.eth',
    },
  } as Record<string, { address: string; features?: Record<string, unknown> }>,
  fetchMock: vi.fn(),
  showLinkField: false,
  showUploadControls: true,
  uploadMode: 'always',
}));

vi.mock('react-i18next', () => ({
  Trans: ({ i18nKey, values }: { i18nKey: string; values?: Record<string, unknown> }) =>
    createElement('span', { 'data-testid': `trans-${i18nKey}` }, `${i18nKey}:${JSON.stringify(values || {})}`),
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      if (!options) {
        return key;
      }
      if (typeof options.no !== 'undefined') {
        return `${key}:${options.no}`;
      }
      if (typeof options.length !== 'undefined') {
        return `${key}:${options.length}`;
      }
      return `${key}:${JSON.stringify(options)}`;
    },
  }),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => testState.navigateMock,
  };
});

vi.mock('@bitsocial/bitsocial-react-hooks', async () => {
  const { getAvailablePostSortTypes, getPreloadedPostSortType } = await vi.importActual<typeof import('@bitsocial/bitsocial-react-hooks/dist/lib/page-sorts.js')>(
    '@bitsocial/bitsocial-react-hooks/dist/lib/page-sorts.js',
  );
  return {
    getAvailablePostSortTypes,
    getPreloadedPostSortType,
    setAccount: (account: unknown) => testState.setAccountMock(account),
    useAccount: () => testState.account,
    useCommunity: (options?: { community?: { name?: string; publicKey?: string } }) => {
      const communityKey = options?.community?.name ?? options?.community?.publicKey;
      return communityKey ? testState.communities[communityKey] : undefined;
    },
  };
});

vi.mock('@bitsocial/bitsocial-react-hooks/dist/stores/communities', () => ({
  default: <T,>(selector: (state: { communities: typeof testState.communities }) => T) =>
    selector({
      communities: testState.communities,
    }),
}));

vi.mock('../../../hooks/use-is-community-offline', () => ({
  default: (community?: { address?: string }) =>
    (community?.address ? testState.offlineStates[community.address] : undefined) || {
      isOffline: testState.offlineWarningVisible,
      isOnlineStatusLoading: testState.offlineStatusLoading,
      offlineTitle: testState.offlineTitle,
    },
}));

vi.mock('../../../stores/use-selected-text-store', () => ({
  default: () => ({
    selectedText: testState.selectedText,
  }),
}));

vi.mock('../../../stores/use-reply-modal-store', () => ({
  default: <T,>(
    selector?: (state: {
      modals: Record<
        string,
        {
          draft?: typeof testState.replyDraft;
          openEmpty: boolean;
          quoteInsertNumber?: number;
          quoteInsertRequestId: number;
          quoteInsertSelectedText: string;
        }
      >;
      updateDraft: typeof testState.updateDraftMock;
    }) => T,
  ) => {
    const state = {
      modals: {
        [testState.locationDraftKey]: {
          draft: testState.replyDraft,
          openEmpty: testState.openEmpty,
          quoteInsertNumber: testState.quoteInsertNumber,
          quoteInsertRequestId: testState.quoteInsertRequestId,
          quoteInsertSelectedText: testState.quoteInsertSelectedText,
        },
      },
      updateDraft: testState.updateDraftMock,
    };
    return selector ? selector(state) : (state as T);
  },
}));

vi.mock('../../../lib/media-hosting/show-upload-controls', () => ({
  getMediaHostingRuntime: () => testState.mediaHostingRuntime,
  getShowUploadControls: () => testState.showUploadControls,
  isWebRuntime: () => testState.mediaHostingRuntime === 'web',
}));

vi.mock('../../../stores/use-media-hosting-store', () => ({
  default: (selector: (state: { uploadMode: string; preferredProvider: string; showLinkField: boolean }) => unknown) =>
    selector({
      uploadMode: testState.uploadMode,
      preferredProvider: 'forge',
      showLinkField: testState.showLinkField,
    }),
}));

vi.mock('../../../hooks/use-directories', () => ({
  findDirectoryByAddress: (directories: Array<{ address: string; features?: Record<string, unknown>; title?: string }>, address: string | undefined) =>
    directories.find((entry) => entry.address === address),
  useDirectories: () => Object.values(testState.directoryByAddress),
  useDirectoryByAddress: (address: string) => testState.directoryByAddress[address],
  normalizeBoardAddress: (address: string) => address.replace(/\.(bso|eth)$/, ''),
}));

vi.mock('../../../hooks/use-directory-entry', async () => {
  const actual = await vi.importActual<typeof import('../../../hooks/use-directory-entry')>('../../../hooks/use-directory-entry');
  return {
    ...actual,
    useDirectoryEntry: (address: string | undefined, directoryCodeHint?: string) => {
      const list =
        testState.directoryListsByCode[directoryCodeHint ?? ''] ??
        Object.values(testState.directoryListsByCode).find((candidate) => candidate.boards.some((board) => board.address === address));
      return actual.getDirectoryEntryForAddress({
        address,
        directories: Object.values(testState.directoryByAddress),
        directoryCodeHint,
        list,
      });
    },
  };
});

vi.mock('../../../hooks/use-community-identifiers', () => ({
  useCommunityIdentifier: (address?: string) => (address ? { name: address } : undefined),
}));

vi.mock('../../../hooks/use-resolved-community-address', () => ({
  useResolvedCommunityAddress: () => testState.resolvedCommunityAddress,
}));

vi.mock('../../../hooks/use-stable-community', () => ({
  useCommunityField: <T,>(
    communityAddress: string | undefined,
    selector: (community?: { features?: Record<string, unknown>; roles?: Record<string, { role?: string }> }) => T,
  ) =>
    selector(
      communityAddress
        ? {
            ...testState.communities[communityAddress],
            roles: testState.rolesByCommunity[communityAddress],
          }
        : undefined,
    ),
}));

vi.mock('../../../hooks/use-publish-reply', async () => {
  const React = await vi.importActual<typeof import('react')>('react');

  return {
    default: function usePublishReplyMock() {
      const [, forceUpdate] = React.useReducer((value: number) => value + 1, 0);

      return {
        isResolvingExternalQuotes: testState.isResolvingExternalQuotes,
        publishReply: (options?: Record<string, unknown>) => {
          if (options) {
            testState.setPublishReplyOptionsMock(options);
          }
          const result = testState.publishReplyMock(options);
          forceUpdate();
          return result;
        },
        publishReplyError: testState.publishReplyError,
        publishReplyStateMessage: testState.publishReplyStateMessage,
        replyIndex: testState.replyIndex,
        resetPublishReplyOptions: testState.resetPublishReplyOptionsMock,
        setPublishReplyOptions: (options: Record<string, unknown>) => testState.setPublishReplyOptionsMock(options),
      };
    },
  };
});

vi.mock('../../../hooks/use-is-mobile', () => ({
  default: () => testState.isMobile,
}));

vi.mock('../../../hooks/use-spam-blocker-precheck', () => ({
  default: () => testState.precheckMock,
}));

vi.mock('../../../hooks/use-file-upload', () => ({
  useFileUpload: () => ({
    chooseFile: testState.chooseFileMock,
    uploadAttachment: testState.uploadAttachmentMock,
    isUploading: testState.uploadPhase !== null,
    uploadPhase: testState.uploadPhase,
  }),
}));

vi.mock('../../loading-ellipsis/loading-ellipsis', () => ({
  default: ({ string }: { string: string }) => createElement('span', { 'data-testid': 'loading-ellipsis' }, string),
}));

vi.mock('../../../lib/mathjax/mathjax-typeset', () => ({
  clearMathElement: () => undefined,
  preloadMathJax: () => undefined,
  typesetMathElement: () => Promise.resolve(),
}));

vi.mock('lodash/debounce', () => ({
  default: <T extends (...args: any[]) => void>(fn: T, wait = 0) => {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const wrapped = ((...args: Parameters<T>) => {
      if (timeout) {
        clearTimeout(timeout);
      }
      timeout = setTimeout(() => fn(...args), wait);
    }) as T & { cancel: () => void };
    wrapped.cancel = () => {
      if (timeout) {
        clearTimeout(timeout);
      }
      timeout = undefined;
    };
    return wrapped;
  },
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

const flushEffects = async (count = 4) => {
  for (let i = 0; i < count; i += 1) {
    await act(async () => {
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
};

const renderReplyModal = async (initialEntry = '/mu/thread/post-1', communityAddress = 'music-posting.eth') => {
  testState.locationDraftKey = initialEntry;
  await act(async () => {
    root.render(
      createElement(
        MemoryRouter,
        { initialEntries: [initialEntry] },
        createElement(ReplyModal, {
          closeModal: testState.closeModalMock,
          locationDraftKey: initialEntry,
          parentCid: 'parent-cid',
          parentNumber: 42,
          postCid: 'post-cid',
          scrollY: 120,
          showReplyModal: true,
          communityAddress,
          threadNumber: 42,
        }),
      ),
    );
  });
  await flushEffects();
};

const rerenderReplyModal = async (initialEntry = '/mu/thread/post-1') => {
  await renderReplyModal(initialEntry);
};

const dispatchInput = async (element: HTMLInputElement | HTMLTextAreaElement, value: string) => {
  await act(async () => {
    const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
    descriptor?.set?.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  });
};

const waitForOptionsValidation = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, POST_OPTIONS_VALIDATION_DELAY_MS + 20));
  });
};

const waitForContentLengthValidation = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 1020));
  });
};

const clickButtonByText = async (text: string) => {
  const button = Array.from(container.querySelectorAll('button')).find((candidate) => candidate.textContent === text);
  await act(async () => {
    button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};

describe('ReplyModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testState.account = { author: { address: 'alice.eth', displayName: 'Alice' } };
    testState.closeModalMock.mockReset();
    testState.directoryByAddress = {
      'music-posting.eth': {
        address: 'music-posting.eth',
        features: {},
        title: '/mu/ - Music',
      },
      'politically-incorrect.bso': {
        address: 'politically-incorrect.bso',
        directoryCode: 'pol',
        features: { hasFlags: true },
        title: '/pol/ - Politically Incorrect',
      },
      'international-nsfw.bso': {
        address: 'international-nsfw.bso',
        directoryCode: 'bant',
        features: { hasFlags: true },
        title: '/bant/ - International/Random',
      },
      'international-sfw.bso': {
        address: 'international-sfw.bso',
        directoryCode: 'int',
        features: { hasFlags: true },
        title: '/int/ - International',
      },
      'sports-posting.bso': {
        address: 'sports-posting.bso',
        directoryCode: 'sp',
        features: { hasFlags: true },
        title: '/sp/ - Sports',
      },
      'random-nsfw.bso': {
        address: 'random-nsfw.bso',
        features: {},
        title: '/b/ - Random',
      },
      'silly-stuff.bso': {
        address: 'silly-stuff.bso',
        features: {},
        title: '/s5s/ - Silly Stuff',
      },
      'traditional-games.bso': {
        address: 'traditional-games.bso',
        features: {},
        title: '/tg/ - Traditional Games',
      },
    };
    testState.directoryListsByCode = {};
    testState.chooseFileMock.mockReset();
    testState.chooseFileMock.mockResolvedValue(null);
    testState.uploadAttachmentMock.mockReset();
    testState.precheckMock.mockReset();
    testState.precheckMock.mockResolvedValue({ status: 'skipped' });
    testState.isMobile = false;
    testState.isResolvingExternalQuotes = false;
    testState.uploadPhase = null;
    testState.navigateMock.mockReset();
    testState.offlineTitle = '';
    testState.offlineStates = {};
    testState.offlineStatusLoading = false;
    testState.offlineWarningVisible = false;
    testState.openEmpty = false;
    testState.locationDraftKey = '/mu/thread/post-1';
    testState.replyDraft = undefined;
    testState.updateDraftMock.mockReset();
    testState.publishReplyMock.mockReset();
    testState.publishReplyError = null;
    testState.publishReplyStateMessage = null;
    testState.quoteInsertNumber = undefined;
    testState.quoteInsertRequestId = 0;
    testState.quoteInsertSelectedText = '';
    testState.dragHandler = undefined;
    testState.replyIndex = undefined;
    testState.resetPublishReplyOptionsMock.mockReset();
    testState.resolvedCommunityAddress = undefined;
    testState.rolesByCommunity = {};
    testState.selectedText = 'selected text';
    testState.setAccountMock.mockReset();
    testState.setPublishReplyOptionsMock.mockReset();
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
    testState.communities = {
      'music-posting.eth': {
        address: 'music-posting.eth',
      },
      'traditional-games.bso': {
        address: 'traditional-games.bso',
      },
    };
    testState.fetchMock.mockReset();
    testState.fetchMock.mockResolvedValue({
      headers: {
        get: (name: string) => (name.toLowerCase() === 'content-length' ? '12345' : null),
      },
      ok: true,
    });
    vi.stubGlobal('fetch', testState.fetchMock);
    testState.showLinkField = false;
    testState.showUploadControls = true;
    testState.uploadMode = 'always';
    testState.mediaHostingRuntime = 'web';
    window.sessionStorage.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    document.body.style.userSelect = '';
    document.body.style.webkitUserSelect = '';
    window.sessionStorage.clear();
    vi.unstubAllGlobals();
  });

  it('initializes quoted content, display name, upload controls, and shared offline warning on board routes', async () => {
    testState.offlineTitle = 'posts_last_synced_info:{"time":"ago:1000"}';
    testState.offlineWarningVisible = true;

    await renderReplyModal('/mu/thread/post-1');

    const nameInput = container.querySelectorAll<HTMLInputElement>('input[type="text"]')[0];
    const optionsInput = container.querySelectorAll<HTMLInputElement>('input[type="text"]')[1];
    const linkInput = container.querySelectorAll<HTMLInputElement>('input[type="text"]')[2];
    const textarea = container.querySelector<HTMLTextAreaElement>('textarea');

    expect(optionsInput).toBeTruthy();
    expect(linkInput).toBeTruthy();
    expect(textarea).toBeTruthy();
    expect(nameInput?.value).toBe('Alice');
    expect(optionsInput?.getAttribute('placeholder')).toBe('Options');
    expect(linkInput?.getAttribute('placeholder')).toContain('Link');
    expect(textarea?.value).toBe('>>42\nselected text');
    expect(Boolean(optionsInput!.compareDocumentPosition(textarea!) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
    expect(Boolean(textarea!.compareDocumentPosition(linkInput!) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
    expect(container.textContent).toContain('choose_file');
    expect(container.textContent).toContain('Spoiler?');
    expect(container.textContent).toContain('posts_last_synced_info:{"time":"ago:1000"}');
    expect(testState.setPublishReplyOptionsMock).toHaveBeenCalledWith({ content: '>>42\nselected text' });
  });

  it('publishes without the previous account display name after switching to an anonymous account', async () => {
    await renderReplyModal('/mu/thread/post-1');

    testState.account = { author: { address: 'anonymous-account' } };
    await rerenderReplyModal('/mu/thread/post-1');

    const nameInput = container.querySelectorAll<HTMLInputElement>('input[type="text"]')[0];
    const textarea = container.querySelector<HTMLTextAreaElement>('textarea') as HTMLTextAreaElement;
    expect(nameInput.value).toBe('');

    await dispatchInput(textarea, 'Account switch regression');
    await clickButtonByText('post');

    expect(testState.publishReplyMock).toHaveBeenCalledWith(expect.objectContaining({ displayName: undefined }));
  });

  it('shows Oekaki draw controls on /i/ replies', async () => {
    testState.directoryByAddress['oekaki-posting.bso'] = {
      address: 'oekaki-posting.bso',
      directoryCode: 'i',
      features: { requireReplyLink: true, requireReplyLinkIsMedia: true },
      title: '/i/ - Oekaki',
    };
    testState.communities['oekaki-posting.bso'] = { address: 'oekaki-posting.bso' };

    await renderReplyModal('/i/thread/post-1', 'oekaki-posting.bso');

    expect(container.textContent).toContain('Size');
    expect(container.textContent).toContain('Replay');
    expect(Array.from(container.querySelectorAll('span')).some((span) => span.textContent === '×')).toBe(true);
    expect(container.textContent).toContain(OEKAKI_WEB_WARNING_TEXT);
    expect(Array.from(container.querySelectorAll('button')).some((button) => button.textContent === 'Draw')).toBe(true);
    expect((Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Clear') as HTMLButtonElement | undefined)?.disabled).toBe(true);

    testState.mediaHostingRuntime = 'android';
    await renderReplyModal('/i/thread/post-1', 'oekaki-posting.bso');

    expect(container.textContent).not.toContain(OEKAKI_WEB_WARNING_TEXT);
  });

  it('opens the TeX preview modal from the /sci/ reply modal button', async () => {
    testState.directoryByAddress['science-and-math.bso'] = {
      address: 'science-and-math.bso',
      directoryCode: 'sci',
      features: {},
      title: '/sci/ - Science & Math',
    };
    testState.communities['science-and-math.bso'] = { address: 'science-and-math.bso' };

    await renderReplyModal('/sci/thread/post-1', 'science-and-math.bso');

    const texButton = container.querySelector<HTMLButtonElement>('button[aria-label="preview_tex_equations"]');
    expect(texButton?.textContent).toBe('TEX');
    expect(texButton?.querySelector('sub')?.textContent).toBe('E');

    await act(async () => {
      texButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const texPreview = container.querySelector('dialog[aria-labelledby="tex-preview-title"]');
    expect(texPreview).toBeTruthy();
    expect(texPreview?.textContent).toContain('tex_preview_title');
  });

  it('clears TeX button focus after closing the TeX preview with Escape', async () => {
    testState.directoryByAddress['science-and-math.bso'] = {
      address: 'science-and-math.bso',
      directoryCode: 'sci',
      features: {},
      title: '/sci/ - Science & Math',
    };
    testState.communities['science-and-math.bso'] = { address: 'science-and-math.bso' };

    await renderReplyModal('/sci/thread/post-1', 'science-and-math.bso');

    const texButton = container.querySelector<HTMLButtonElement>('button[aria-label="preview_tex_equations"]');
    expect(texButton).toBeTruthy();

    await act(async () => {
      texButton?.focus();
      texButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(document.activeElement).toBe(texButton);

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Escape' }));
    });

    expect(document.activeElement).not.toBe(texButton);
  });

  it('shows a flag selector on flag boards and publishes the default geographic request', async () => {
    await renderReplyModal('/pol/thread/post-1', 'politically-incorrect.bso');

    const flagSelect = container.querySelector<HTMLSelectElement>('select[aria-label="flag"]');

    expect(flagSelect).toBeTruthy();
    expect(flagSelect?.value).toBe('country:auto');
    expect(
      Array.from(flagSelect?.options || [])
        .slice(0, 3)
        .map((option) => option.textContent),
    ).toEqual(['Geographic Location', 'Anarcho-Capitalist', 'Anarchist']);
    const linkInput = container.querySelectorAll<HTMLInputElement>('input[type="text"]')[2];
    expect(Boolean(linkInput!.compareDocumentPosition(flagSelect!) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);

    await clickButtonByText('post');

    expect(testState.publishReplyMock).toHaveBeenCalledWith({
      content: '>>42\nselected text',
      displayName: 'Alice',
      challengeRequest: {
        challengeAnswers: ['bitsocial-flags:5chan:flag:country:auto'],
      },
      flairs: [{ type: 'country', code: 'auto', text: 'flag:country:auto' }],
    });
  });

  it('shows the /pol/ flag selector for replies on a non-primary directory candidate board', async () => {
    testState.directoryListsByCode.pol = {
      directoryCode: 'pol',
      features: { hasFlags: true },
      title: '/pol/ - Politically Incorrect',
      boards: [{ address: 'politically-incorrect.bso' }, { address: 'nothing-is-beyond-our-reach.bso' }],
    };

    await renderReplyModal('/pol/thread/post-1', 'nothing-is-beyond-our-reach.bso');

    const flagSelect = container.querySelector<HTMLSelectElement>('select[aria-label="flag"]');

    expect(flagSelect).toBeTruthy();
    expect(flagSelect?.value).toBe('country:auto');

    await clickButtonByText('post');

    expect(testState.publishReplyMock).toHaveBeenCalledWith({
      content: '>>42\nselected text',
      displayName: 'Alice',
      challengeRequest: {
        challengeAnswers: ['bitsocial-flags:5chan:flag:country:auto'],
      },
      flairs: [{ type: 'country', code: 'auto', text: 'flag:country:auto' }],
    });
  });

  it.each([
    { boardPath: '/bant/thread/post-1', communityAddress: 'international-nsfw.bso' },
    { boardPath: '/int/thread/post-1', communityAddress: 'international-sfw.bso' },
    { boardPath: '/sp/thread/post-1', communityAddress: 'sports-posting.bso' },
  ])('publishes geographic location on country-only boards without showing a flag selector', async ({ boardPath, communityAddress }) => {
    await renderReplyModal(boardPath, communityAddress);

    expect(container.querySelector<HTMLSelectElement>('select[aria-label="flag"]')).toBeNull();

    await clickButtonByText('post');

    expect(testState.publishReplyMock).toHaveBeenCalledWith({
      content: '>>42\nselected text',
      displayName: 'Alice',
      challengeRequest: {
        challengeAnswers: ['bitsocial-flags:5chan:flag:country:auto'],
      },
      flairs: [{ type: 'country', code: 'auto', text: 'flag:country:auto' }],
    });
  });

  it('publishes selected political flags from the reply modal', async () => {
    await renderReplyModal('/pol/thread/post-1', 'politically-incorrect.bso');

    const flagSelect = container.querySelector<HTMLSelectElement>('select[aria-label="flag"]');
    await dispatchInput(container.querySelector<HTMLTextAreaElement>('textarea') as HTMLTextAreaElement, 'reply body');
    await act(async () => {
      if (flagSelect) {
        flagSelect.value = 'pol:AC';
        flagSelect.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    await clickButtonByText('post');

    expect(testState.publishReplyMock).toHaveBeenCalledWith({
      challengeRequest: undefined,
      content: 'reply body',
      displayName: 'Alice',
      flairs: [{ type: 'pol', code: 'AC', text: 'flag:pol:AC' }],
    });
  });

  it('uses the shared loading ellipsis while a reply upload is running', async () => {
    testState.uploadPhase = 'uploading';

    await renderReplyModal('/mu/thread/post-1');

    expect(container.querySelector('[data-testid="loading-ellipsis"]')?.textContent).toBe('uploading');
  });

  it('shows the automated checks in place of the file and spoiler controls, then restores them unchanged', async () => {
    const hasChooseFileButton = () => [...container.querySelectorAll('button')].some((button) => button.textContent === 'choose_file');
    testState.openEmpty = true;
    testState.selectedText = '';
    testState.replyDraft = { content: 'reply', link: '', options: '', spoiler: true };
    testState.uploadPhase = 'checking';

    await renderReplyModal('/mu/thread/post-1');

    expect(container.querySelector('[data-testid="loading-ellipsis"]')?.textContent).toBe('running_automated_checks');
    expect(hasChooseFileButton()).toBe(false);
    expect(container.querySelector('input[type="checkbox"]')).toBeNull();

    testState.uploadPhase = null;
    await rerenderReplyModal('/mu/thread/post-1');

    expect(container.querySelector('[data-testid="loading-ellipsis"]')).toBeNull();
    expect(hasChooseFileButton()).toBe(true);
    expect(container.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked).toBe(true);
  });

  it('does not render an offline warning when the shared offline hook reports the board as online', async () => {
    await renderReplyModal('/mu/thread/post-1');

    expect(container.querySelector('[class*="offlineBoard"]')).toBeNull();
    expect(container.textContent).not.toContain('community_offline_info');
  });

  it('prefers the resolved board entry when the modal prop address uses a different alias', async () => {
    testState.offlineTitle = 'community_offline_info';
    testState.offlineWarningVisible = true;
    testState.resolvedCommunityAddress = 'music-posting.eth';
    testState.communities = {
      'music-posting.eth': {
        address: 'music-posting.eth',
      },
    };
    testState.offlineStates = {
      'music-posting.eth': {
        isOffline: false,
        isOnlineStatusLoading: false,
        offlineTitle: '',
      },
    };

    await renderReplyModal('/mu/thread/post-1', 'music-posting.bso');

    expect(container.querySelector('[class*="offlineBoard"]')).toBeNull();
    expect(container.textContent).not.toContain('community_offline_info');
  });

  it('restores the draft fields saved for the current location', async () => {
    testState.openEmpty = true;
    testState.selectedText = '';
    testState.replyDraft = {
      content: 'saved reply draft',
      flag: 'pol:AC',
      link: 'https://example.com/saved.png',
      options: 'nonoko',
      spoiler: true,
    };

    await renderReplyModal('/pol/thread/post-1', 'politically-incorrect.bso');

    expect(container.querySelector<HTMLTextAreaElement>('textarea')?.value).toBe('saved reply draft');
    expect(container.querySelector<HTMLInputElement>('[aria-label="options"]')?.value).toBe('nonoko');
    expect(container.querySelector<HTMLInputElement>('[aria-label="link"]')?.value).toBe('https://example.com/saved.png');
    expect(container.querySelector<HTMLSelectElement>('[aria-label="flag"]')?.value).toBe('pol:AC');
    expect(container.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked).toBe(true);
    expect(testState.setPublishReplyOptionsMock).toHaveBeenCalledWith({
      content: 'saved reply draft',
      link: 'https://example.com/saved.png',
      spoiler: true,
    });
  });

  it('preserves the caret when a live draft update rerenders the modal', async () => {
    testState.openEmpty = true;
    testState.selectedText = '';
    testState.replyDraft = {
      content: 'saved reply draft',
      link: '',
      options: '',
      spoiler: false,
    };

    await renderReplyModal('/mu/thread/post-1');

    const textarea = container.querySelector<HTMLTextAreaElement>('textarea') as HTMLTextAreaElement;
    const nextContent = 'saved edited reply draft';
    await act(async () => {
      const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
      descriptor?.set?.call(textarea, nextContent);
      textarea.setSelectionRange(7, 7);
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      textarea.dispatchEvent(new Event('change', { bubbles: true }));
    });
    testState.replyDraft = {
      ...testState.replyDraft,
      content: nextContent,
    };
    await rerenderReplyModal('/mu/thread/post-1');

    expect(textarea.value).toBe(nextContent);
    expect(textarea.selectionStart).toBe(7);
    expect(textarea.selectionEnd).toBe(7);
  });

  it('validates empty and invalid replies, then publishes once the payload is valid', async () => {
    testState.openEmpty = true;
    testState.selectedText = '';

    await renderReplyModal('/mu/thread/post-1');

    await clickButtonByText('post');
    expect(container.textContent).toContain('error: empty_comment_alert');
    expect(testState.publishReplyMock).not.toHaveBeenCalled();

    const linkInput = container.querySelectorAll<HTMLInputElement>('input[type="text"]')[2];
    const spoilerCheckbox = container.querySelector<HTMLInputElement>('input[type="checkbox"]');
    await dispatchInput(linkInput, 'not-a-url');
    await act(async () => {
      spoilerCheckbox?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await clickButtonByText('post');

    expect(container.textContent).toContain('error: invalid_url_alert');
    expect(testState.setPublishReplyOptionsMock).toHaveBeenCalledWith({ spoiler: true });

    await dispatchInput(linkInput, 'https://temp.sh/example.png');
    await clickButtonByText('post');

    expect(container.textContent).toContain('error: expiring_media_link_alert:{"domain":"temp.sh"}');
    expect(testState.publishReplyMock).not.toHaveBeenCalled();

    await dispatchInput(linkInput, 'https://media.example.com/file.png?X-Amz-Expires=3600&X-Amz-Signature=signature');
    await clickButtonByText('post');

    expect(container.textContent).toContain('error: expiring_media_link_alert:{"domain":"media.example.com"}');
    expect(testState.publishReplyMock).not.toHaveBeenCalled();

    await dispatchInput(linkInput, 'https://example.com/file.png');
    await clickButtonByText('post');

    expect(container.textContent).toContain('file.png');
    expect(testState.setPublishReplyOptionsMock).toHaveBeenCalledWith({ link: 'https://example.com/file.png' });
    expect(testState.publishReplyMock).toHaveBeenCalledTimes(1);
  });

  it('does not require a reply link when only live community features require post links', async () => {
    testState.openEmpty = true;
    testState.selectedText = 'Reply body';
    testState.communities['music-posting.eth'] = {
      address: 'music-posting.eth',
      features: { requirePostLink: true },
    };

    await renderReplyModal('/mu/thread/post-1');

    await clickButtonByText('post');

    expect(container.textContent).not.toContain('post_link_required_alert');
    expect(testState.publishReplyMock).toHaveBeenCalledTimes(1);
  });

  it('requires a link when live community features require reply links', async () => {
    testState.openEmpty = true;
    testState.selectedText = 'Reply body';
    testState.communities['music-posting.eth'] = {
      address: 'music-posting.eth',
      features: { requireReplyLink: true },
    };

    await renderReplyModal('/mu/thread/post-1');

    await clickButtonByText('post');

    expect(container.textContent).toContain('error: reply_link_required_alert');
    const linkRequiredError = Array.from(container.querySelectorAll('div')).find((element) => element.textContent === 'error: reply_link_required_alert');
    expect(linkRequiredError?.className).toContain('error');
    expect(testState.publishReplyMock).not.toHaveBeenCalled();

    const linkInput = container.querySelectorAll<HTMLInputElement>('input[type="text"]')[2];
    await dispatchInput(linkInput, 'https://example.com/reply');
    await clickButtonByText('post');

    expect(testState.setPublishReplyOptionsMock).toHaveBeenCalledWith({ link: 'https://example.com/reply' });
    expect(testState.publishReplyMock).toHaveBeenCalledTimes(1);
  });

  it('requires a media link when live community features require reply links to be media', async () => {
    testState.openEmpty = true;
    testState.selectedText = 'Reply body';
    testState.communities['music-posting.eth'] = {
      address: 'music-posting.eth',
      features: { requireReplyLink: true, requireReplyLinkIsMedia: true },
    };

    await renderReplyModal('/mu/thread/post-1');

    await clickButtonByText('post');

    expect(container.textContent).toContain('error: reply_media_link_required_alert');
    const mediaRequiredError = Array.from(container.querySelectorAll('div')).find((element) => element.textContent === 'error: reply_media_link_required_alert');
    expect(mediaRequiredError?.className).toContain('error');
    expect(testState.publishReplyMock).not.toHaveBeenCalled();

    const linkInput = container.querySelectorAll<HTMLInputElement>('input[type="text"]')[2];
    await dispatchInput(linkInput, 'https://example.com/page');
    await clickButtonByText('post');

    expect(container.textContent).toContain('error: link_not_image_or_video_alert');
    expect(testState.publishReplyMock).not.toHaveBeenCalled();

    await dispatchInput(linkInput, 'https://example.com/reply.png');
    await clickButtonByText('post');

    expect(testState.setPublishReplyOptionsMock).toHaveBeenCalledWith({ link: 'https://example.com/reply.png' });
    expect(testState.publishReplyMock).toHaveBeenCalledTimes(1);
  });

  it('does not require an empty link when only media links are constrained', async () => {
    testState.openEmpty = true;
    testState.selectedText = 'Reply body';
    testState.communities['music-posting.eth'] = {
      address: 'music-posting.eth',
      features: { requireReplyLink: false, requireReplyLinkIsMedia: true },
    };

    await renderReplyModal('/mu/thread/post-1');

    await clickButtonByText('post');

    expect(container.textContent).not.toContain('reply_media_link_required_alert');
    expect(testState.publishReplyMock).toHaveBeenCalledTimes(1);

    testState.publishReplyMock.mockClear();
    const linkInput = container.querySelectorAll<HTMLInputElement>('input[type="text"]')[2];
    await dispatchInput(linkInput, 'https://example.com/page');
    await clickButtonByText('post');

    expect(container.textContent).toContain('error: link_not_image_or_video_alert');
    expect(testState.publishReplyMock).not.toHaveBeenCalled();
  });

  it('rejects reply links when live community features disallow reply links', async () => {
    testState.openEmpty = true;
    testState.selectedText = 'Reply body';
    testState.communities['music-posting.eth'] = {
      address: 'music-posting.eth',
      features: { noReplyLinks: true },
    };

    await renderReplyModal('/mu/thread/post-1');

    const linkInput = container.querySelectorAll<HTMLInputElement>('input[type="text"]')[2];
    expect(linkInput.disabled).toBe(true);

    linkInput.disabled = false;
    await dispatchInput(linkInput, 'https://example.com/reply.png');
    await clickButtonByText('post');

    expect(container.textContent).toContain('error: reply_links_not_allowed_alert');
    expect(testState.publishReplyMock).not.toHaveBeenCalled();
  });

  it('publishes twimg query-format reply links with a path extension', async () => {
    testState.openEmpty = true;
    testState.selectedText = 'reply body';

    await renderReplyModal('/mu/thread/post-1');

    const linkInput = container.querySelectorAll<HTMLInputElement>('input[type="text"]')[2];

    // The publish path normalizes the raw `?format=` link even without blurring the field.
    await dispatchInput(linkInput, 'https://pbs.twimg.com/media/HKUAehoXUAAXkMb?format=jpg&name=4096x4096');
    expect(linkInput.value).toBe('https://pbs.twimg.com/media/HKUAehoXUAAXkMb?format=jpg&name=4096x4096');
    await clickButtonByText('post');

    expect(testState.publishReplyMock).toHaveBeenCalledTimes(1);
    expect(testState.publishReplyMock).toHaveBeenCalledWith(expect.objectContaining({ link: 'https://pbs.twimg.com/media/HKUAehoXUAAXkMb.jpg' }));
  });

  it('rewrites twimg query-format reply links to their path-extension form on blur', async () => {
    testState.openEmpty = true;
    testState.selectedText = 'reply body';

    await renderReplyModal('/mu/thread/post-1');

    const linkInput = container.querySelectorAll<HTMLInputElement>('input[type="text"]')[2];

    await dispatchInput(linkInput, 'https://pbs.twimg.com/media/HKUAehoXUAAXkMb?format=jpg&name=4096x4096');
    expect(linkInput.value).toBe('https://pbs.twimg.com/media/HKUAehoXUAAXkMb?format=jpg&name=4096x4096');

    await act(async () => {
      linkInput.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    });

    expect(linkInput.value).toBe('https://pbs.twimg.com/media/HKUAehoXUAAXkMb.jpg');
  });

  it('moves YouTube links into reply content and publishes the thumbnail link on media-only boards', async () => {
    const youtubeLink = 'https://youtu.be/reply123';
    const thumbnailLink = 'https://img.youtube.com/vi/reply123/maxresdefault.jpg';
    testState.openEmpty = true;
    testState.selectedText = 'reply body';
    testState.directoryByAddress['music-posting.eth'] = {
      address: 'music-posting.eth',
      features: { requireReplyLinkIsMedia: true },
      title: '/mu/ - Music',
    };

    await renderReplyModal('/mu/thread/post-1');

    const textarea = container.querySelector<HTMLTextAreaElement>('textarea') as HTMLTextAreaElement;
    const linkInput = container.querySelectorAll<HTMLInputElement>('input[type="text"]')[2];
    const linkContainer = linkInput.parentElement as HTMLElement;
    const getConversionNotice = () =>
      Array.from(container.querySelectorAll<HTMLDivElement>('div'))
        .reverse()
        .find((element) => element.textContent?.includes('youtube_thumbnail_link_conversion_notice'));

    const insertionPoint = 'reply'.length;
    textarea.setSelectionRange(insertionPoint, insertionPoint);

    await dispatchInput(linkInput, youtubeLink);

    expect(linkInput.value).toBe(youtubeLink);
    expect(container.textContent).toContain('youtube_thumbnail_link_conversion_notice:{"count":3}');
    expect(linkContainer.textContent).not.toContain('youtube_thumbnail_link_conversion_notice');
    expect(getConversionNotice()?.className).toContain('error');

    await clickButtonByText('post');

    expect(linkInput.value).toBe(thumbnailLink);
    expect(textarea.value).toBe(`reply ${youtubeLink} body`);
    expect(testState.publishReplyMock).toHaveBeenCalledWith({
      challengeRequest: undefined,
      content: `reply ${youtubeLink} body`,
      displayName: 'Alice',
      flairs: undefined,
      link: thumbnailLink,
    });
  });

  it('moves Vimeo links into reply content and publishes the oEmbed thumbnail as a jpg file link', async () => {
    const vimeoLink = 'https://vimeo.com/1070224898';
    const thumbnailLink = 'https://i.vimeocdn.com/video/1998712625-bf894a18-d_1280.jpg';
    testState.fetchMock.mockImplementation(async (url: string) =>
      url.startsWith('https://vimeo.com/api/oembed.json?')
        ? { ok: true, json: async () => ({ thumbnail_url: 'https://i.vimeocdn.com/video/1998712625-bf894a18-d_640?region=us' }) }
        : { ok: false, status: 404 },
    );
    testState.openEmpty = true;
    testState.selectedText = 'reply body';
    testState.directoryByAddress['music-posting.eth'] = {
      address: 'music-posting.eth',
      features: { requireReplyLinkIsMedia: true },
      title: '/mu/ - Music',
    };

    await renderReplyModal('/mu/thread/post-1');

    const textarea = container.querySelector<HTMLTextAreaElement>('textarea') as HTMLTextAreaElement;
    const linkInput = container.querySelectorAll<HTMLInputElement>('input[type="text"]')[2];
    textarea.setSelectionRange('reply'.length, 'reply'.length);

    await dispatchInput(linkInput, vimeoLink);

    expect(container.textContent).toContain('vimeo_thumbnail_link_conversion_notice:{"count":3}');

    await clickButtonByText('post');

    expect(testState.fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('https://vimeo.com/api/oembed.json?url=https%3A%2F%2Fvimeo.com%2F1070224898'),
      expect.anything(),
    );
    expect(linkInput.value).toBe(thumbnailLink);
    expect(textarea.value).toBe(`reply ${vimeoLink} body`);
    expect(testState.publishReplyMock).toHaveBeenCalledWith(expect.objectContaining({ content: `reply ${vimeoLink} body`, link: thumbnailLink }));
  });

  it('automatically moves YouTube links into reply content when reply media links are optional', async () => {
    const youtubeLink = 'https://youtu.be/replyoptional';
    const thumbnailLink = 'https://img.youtube.com/vi/replyoptional/maxresdefault.jpg';
    testState.openEmpty = true;
    testState.selectedText = 'reply body';

    await renderReplyModal('/mu/thread/post-1');

    const textarea = container.querySelector<HTMLTextAreaElement>('textarea') as HTMLTextAreaElement;
    const linkInput = container.querySelectorAll<HTMLInputElement>('input[type="text"]')[2];

    vi.useFakeTimers();
    try {
      await dispatchInput(linkInput, youtubeLink);

      expect(linkInput.value).toBe(youtubeLink);
      expect(linkInput.disabled).toBe(true);
      expect(container.textContent).toContain('youtube_thumbnail_link_conversion_notice:{"count":3}');

      await act(async () => {
        vi.advanceTimersByTime(1000);
        await Promise.resolve();
      });
      expect(container.textContent).toContain('youtube_thumbnail_link_conversion_notice:{"count":2}');
      expect(linkInput.disabled).toBe(true);

      await act(async () => {
        vi.advanceTimersByTime(1000);
        await Promise.resolve();
      });
      expect(container.textContent).toContain('youtube_thumbnail_link_conversion_notice:{"count":1}');
      expect(linkInput.disabled).toBe(true);

      await act(async () => {
        vi.advanceTimersByTime(1000);
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(linkInput.value).toBe(thumbnailLink);
      expect(linkInput.disabled).toBe(false);
      expect(textarea.value).toBe(`reply body ${youtubeLink}`);
      expect(container.textContent).not.toContain('youtube_thumbnail_link_conversion_notice');
      expect(testState.setPublishReplyOptionsMock).toHaveBeenCalledWith({ link: thumbnailLink });
      expect(testState.setPublishReplyOptionsMock).toHaveBeenCalledWith({ content: `reply body ${youtubeLink}` });
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it('rejects unresolved YouTube links on media-only reply modal boards', async () => {
    const youtubeLink = 'https://youtu.be/replymissing';
    testState.fetchMock.mockResolvedValue({
      headers: {
        get: () => null,
      },
      ok: false,
    });
    testState.openEmpty = true;
    testState.selectedText = 'reply body';
    testState.directoryByAddress['music-posting.eth'] = {
      address: 'music-posting.eth',
      features: { requireReplyLinkIsMedia: true },
      title: '/mu/ - Music',
    };

    await renderReplyModal('/mu/thread/post-1');

    const linkInput = container.querySelectorAll<HTMLInputElement>('input[type="text"]')[2];

    await dispatchInput(linkInput, youtubeLink);
    await clickButtonByText('post');
    await flushEffects(8);

    expect(testState.fetchMock).toHaveBeenCalled();
    expect(container.textContent).toContain('error: link_not_image_or_video_alert');
    expect(linkInput.value).toBe(youtubeLink);
    expect(testState.publishReplyMock).not.toHaveBeenCalled();
  });

  it('ignores duplicate reply clicks while youtube thumbnail resolution is pending', async () => {
    const youtubeLink = 'https://youtu.be/replyslow';
    const thumbnailLink = 'https://img.youtube.com/vi/replyslow/maxresdefault.jpg';
    let resolveFetch: (response: unknown) => void = () => {};
    const fetchPromise = new Promise((resolve) => {
      resolveFetch = resolve;
    });
    testState.fetchMock.mockReturnValue(fetchPromise);
    testState.openEmpty = true;
    testState.selectedText = 'reply body';
    testState.directoryByAddress['music-posting.eth'] = {
      address: 'music-posting.eth',
      features: { requireReplyLinkIsMedia: true },
      title: '/mu/ - Music',
    };

    await renderReplyModal('/mu/thread/post-1');

    const linkInput = container.querySelectorAll<HTMLInputElement>('input[type="text"]')[2];
    const postButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'post') as HTMLButtonElement;

    await dispatchInput(linkInput, youtubeLink);

    await clickButtonByText('post');
    expect(postButton.disabled).toBe(true);

    await clickButtonByText('post');
    expect(testState.fetchMock).toHaveBeenCalledTimes(1);
    expect(testState.publishReplyMock).not.toHaveBeenCalled();

    await act(async () => {
      resolveFetch({
        headers: {
          get: (name: string) => (name.toLowerCase() === 'content-length' ? '12345' : null),
        },
        ok: true,
      });
      await fetchPromise;
      await Promise.resolve();
    });

    expect(testState.publishReplyMock).toHaveBeenCalledTimes(1);
    expect(testState.publishReplyMock).toHaveBeenCalledWith({
      challengeRequest: undefined,
      content: `reply body ${youtubeLink}`,
      displayName: 'Alice',
      flairs: undefined,
      link: thumbnailLink,
    });
  });

  it('validates unsupported options and keeps fortune output out of preview state until reply publish', async () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.25);
    testState.openEmpty = true;
    testState.selectedText = '';

    await renderReplyModal('/b/thread/post-1', 'random-nsfw.bso');

    const optionsInput = container.querySelectorAll<HTMLInputElement>('input[type="text"]')[1];
    const textarea = container.querySelector<HTMLTextAreaElement>('textarea');

    await dispatchInput(optionsInput, 'x y z');
    expect(container.textContent).not.toContain('Unsupported options');

    await waitForOptionsValidation();
    expect(container.textContent).toContain('Unsupported options: x, y, z.');
    const delayedOptionsError = Array.from(container.querySelectorAll('div')).find((element) => element.textContent === 'Unsupported options: x, y, z.');
    expect(delayedOptionsError?.className).toContain('error');

    await dispatchInput(textarea as HTMLTextAreaElement, 'reply body');
    await clickButtonByText('post');

    expect(testState.publishReplyMock).not.toHaveBeenCalled();

    await dispatchInput(optionsInput, 'fortune');

    expect(container.textContent).not.toContain('Unsupported options');
    expect(testState.setPublishReplyOptionsMock).toHaveBeenCalledWith({
      content: 'reply body',
    });

    await clickButtonByText('post');

    expect(testState.publishReplyMock).toHaveBeenCalledTimes(1);
    expect(testState.publishReplyMock).toHaveBeenCalledWith({
      challengeRequest: undefined,
      content: 'reply body[fortune color=#fd4d32]Excellent Luck[/fortune]',
      displayName: 'Alice',
      flairs: undefined,
    });
    randomSpy.mockRestore();
  });

  it('counts hidden fortune output in reply length validation without revealing it', async () => {
    testState.openEmpty = true;
    testState.selectedText = '';

    await renderReplyModal('/b/thread/post-1', 'random-nsfw.bso');

    const optionsInput = container.querySelectorAll<HTMLInputElement>('input[type="text"]')[1];
    const textarea = container.querySelector<HTMLTextAreaElement>('textarea') as HTMLTextAreaElement;
    const longContent = 'x'.repeat(1930);

    await dispatchInput(optionsInput, 'fortune');
    await dispatchInput(textarea, longContent);
    await waitForContentLengthValidation();

    expect(testState.setPublishReplyOptionsMock).toHaveBeenCalledWith({ content: longContent });
    expect(container.textContent).toContain('comment_field_too_long:2001');
    expect(container.textContent).not.toContain('[fortune color=');
    expect(testState.publishReplyMock).not.toHaveBeenCalled();
  });

  it('links the unsupported sage option to its FAQ entry in reply modal', async () => {
    testState.openEmpty = true;
    testState.selectedText = '';

    await renderReplyModal('/b/thread/post-1', 'random-nsfw.bso');

    const optionsInput = container.querySelectorAll<HTMLInputElement>('input[type="text"]')[1];

    await dispatchInput(optionsInput, 'sage');
    await waitForOptionsValidation();

    expect(container.textContent).toContain('Unsupported options: sage [learn why].');
    expect(container.querySelector<HTMLAnchorElement>('a[href="/faq#sage"]')?.textContent).toBe('learn why');
  });

  it('publishes sage and nonokosage replies with the marker line on boards whose bump order skips sage', async () => {
    testState.openEmpty = true;
    testState.selectedText = '';
    testState.communities['random-nsfw.bso'] = {
      ...testState.communities['random-nsfw.bso'],
      pageSorts: { posts: { active: { name: '@pkcprotocol/active-page-sort', publicOptions: { noBumpKeywords: 'sage' } } } },
      posts: { pages: { active: { comments: [], nextCid: 'next' } }, pageCids: { active: 'first' } },
    } as (typeof testState.communities)[string];

    await renderReplyModal('/b/thread/post-1', 'random-nsfw.bso');

    const optionsInput = container.querySelectorAll<HTMLInputElement>('input[type="text"]')[1];
    const textarea = container.querySelector<HTMLTextAreaElement>('textarea');

    await dispatchInput(optionsInput, 'nonokosage');
    await waitForOptionsValidation();

    expect(container.textContent).not.toContain('Unsupported options');

    await dispatchInput(textarea as HTMLTextAreaElement, 'quiet reply');
    await clickButtonByText('post');

    expect(testState.publishReplyMock).toHaveBeenCalledTimes(1);
    expect(testState.publishReplyMock).toHaveBeenCalledWith(expect.objectContaining({ content: 'quiet reply\nsage' }));
  });

  it('supports fortune on the /s5s/ route when directory metadata is not loaded', async () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.25);
    testState.openEmpty = true;
    testState.selectedText = '';
    delete testState.directoryByAddress['silly-stuff.bso'];

    await renderReplyModal('/s5s/thread/post-1', 'silly-stuff.bso');

    const optionsInput = container.querySelectorAll<HTMLInputElement>('input[type="text"]')[1];
    const textarea = container.querySelector<HTMLTextAreaElement>('textarea');

    await dispatchInput(optionsInput, 'fortune');
    await waitForOptionsValidation();

    expect(container.textContent).not.toContain('Unsupported options');

    await dispatchInput(textarea as HTMLTextAreaElement, 'silly reply');
    await clickButtonByText('post');

    expect(testState.publishReplyMock).toHaveBeenCalledTimes(1);
    expect(testState.publishReplyMock).toHaveBeenCalledWith({
      challengeRequest: undefined,
      content: 'silly reply[fortune color=#fd4d32]Excellent Luck[/fortune]',
      displayName: 'Alice',
      flairs: undefined,
    });
    expect(testState.setPublishReplyOptionsMock).toHaveBeenCalledWith({ content: 'silly reply' });
    randomSpy.mockRestore();
  });

  it('stores dice rolls in reply content on dice-enabled boards', async () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.25);
    testState.openEmpty = true;
    testState.selectedText = '';

    await renderReplyModal('/tg/thread/post-1', 'traditional-games.bso');

    const optionsInput = container.querySelectorAll<HTMLInputElement>('input[type="text"]')[1];
    const textarea = container.querySelector<HTMLTextAreaElement>('textarea');

    await dispatchInput(optionsInput, 'dice+2d6');
    await waitForOptionsValidation();

    expect(container.textContent).not.toContain('Unsupported options');

    await dispatchInput(textarea as HTMLTextAreaElement, 'dice reply');
    await clickButtonByText('post');

    expect(testState.publishReplyMock).toHaveBeenCalledTimes(1);
    expect(testState.setPublishReplyOptionsMock).toHaveBeenCalledWith({
      content: '<b>Rolled 2, 2 = 4 (2d6)<br><br></b>dice reply',
    });
    randomSpy.mockRestore();
  });

  it('treats dice rolls as unsupported outside /tg/ and /qst/ in reply modal', async () => {
    testState.openEmpty = true;
    testState.selectedText = '';

    await renderReplyModal('/b/thread/post-1', 'random-nsfw.bso');

    const optionsInput = container.querySelectorAll<HTMLInputElement>('input[type="text"]')[1];
    const textarea = container.querySelector<HTMLTextAreaElement>('textarea');

    await dispatchInput(optionsInput, 'dice+1d6');
    expect(container.textContent).not.toContain('Unsupported options');

    await waitForOptionsValidation();
    expect(container.textContent).toContain('Unsupported options: dice+1d6. Option "dice+1d6" is supported on: /qst/, /tg/.');
    expect(container.querySelector<HTMLAnchorElement>('a[href="/qst"]')?.textContent).toBe('/qst/');
    expect(container.querySelector<HTMLAnchorElement>('a[href="/tg"]')?.textContent).toBe('/tg/');

    await dispatchInput(textarea as HTMLTextAreaElement, 'plain dice reply');
    await clickButtonByText('post');

    expect(testState.publishReplyMock).not.toHaveBeenCalled();
    expect(testState.setPublishReplyOptionsMock).toHaveBeenCalledWith({ content: 'plain dice reply' });
  });

  it('treats fortune as unsupported outside /b/ and /s5s/ in reply modal', async () => {
    testState.openEmpty = true;
    testState.selectedText = '';

    await renderReplyModal('/mu/thread/post-1', 'music-posting.eth');

    const optionsInput = container.querySelectorAll<HTMLInputElement>('input[type="text"]')[1];
    const textarea = container.querySelector<HTMLTextAreaElement>('textarea');

    await dispatchInput(optionsInput, 'fortune');
    expect(container.textContent).not.toContain('Unsupported options');

    await waitForOptionsValidation();
    expect(container.textContent).toContain('Unsupported options: fortune. Option "fortune" is supported on: /b/, /s5s/.');
    expect(container.querySelector<HTMLAnchorElement>('a[href="/b"]')?.textContent).toBe('/b/');
    expect(container.querySelector<HTMLAnchorElement>('a[href="/s5s"]')?.textContent).toBe('/s5s/');

    await dispatchInput(textarea as HTMLTextAreaElement, 'plain reply');
    await clickButtonByText('post');

    expect(testState.publishReplyMock).not.toHaveBeenCalled();
    expect(testState.setPublishReplyOptionsMock).toHaveBeenCalledWith({ content: 'plain reply' });
  });

  it('shows BBCode controls only for board mods and inserts tags into the reply textarea', async () => {
    testState.account = { author: { address: 'mod.eth', displayName: 'Alice' } };
    testState.rolesByCommunity = {
      'music-posting.eth': {
        'mod.eth': { role: 'admin' },
      },
    };

    await renderReplyModal('/mu/thread/post-1');

    const textarea = container.querySelector<HTMLTextAreaElement>('textarea');
    const redButton = container.querySelector<HTMLButtonElement>('button[aria-label="Red text"]');
    const linkButton = container.querySelector<HTMLButtonElement>('button[aria-label="Link"]');
    expect(textarea).toBeTruthy();
    expect(redButton).toBeTruthy();
    expect(linkButton).toBeTruthy();
    expect(container.querySelector('select[aria-label="Text color"]')).toBeNull();
    expect(container.textContent).not.toContain('mods only');
    expect(container.textContent).not.toContain('Mod editor');
    expect(container.textContent).toContain('warning: posting as admin');
    const moderatorWarning = Array.from(container.querySelectorAll('div')).find((element) => element.textContent === 'warning: posting as admin');
    expect(moderatorWarning?.className).toContain('error');
    expect(container.querySelector('button[aria-label="Quote"]')).toBeNull();

    const selectionStart = textarea?.value.indexOf('selected text') ?? 0;
    textarea?.setSelectionRange(selectionStart, selectionStart + 'selected text'.length);
    await act(async () => {
      redButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(textarea?.value).toBe('>>42\n[color=red]selected text[/color]');
    expect(testState.setPublishReplyOptionsMock).toHaveBeenCalledWith({ content: '>>42\n[color=red]selected text[/color]' });

    testState.rolesByCommunity = {};
    await rerenderReplyModal('/mu/thread/post-1');

    expect(container.querySelector('button[aria-label="Red text"]')).toBeNull();
    expect(container.textContent).not.toContain('mods only');
    expect(container.textContent).not.toContain('warning: posting as admin');
  });

  it('renders [code] blocks in the BBCode reply preview on /q/', async () => {
    testState.account = { author: { address: 'mod.eth', displayName: 'Alice' } };
    testState.directoryByAddress['site-feedback.bso'] = {
      address: 'site-feedback.bso',
      directoryCode: 'q',
      features: {},
      title: '/q/ - 5chan Feedback',
    };
    testState.rolesByCommunity = {
      'site-feedback.bso': {
        'mod.eth': { role: 'admin' },
      },
    };
    testState.openEmpty = true;
    testState.selectedText = '';

    await renderReplyModal('/q/thread/post-1', 'site-feedback.bso');

    const textarea = container.querySelector<HTMLTextAreaElement>('textarea');
    await dispatchInput(textarea as HTMLTextAreaElement, 'test [code]bitsocial[/code]');
    await clickButtonByText('Preview');

    const preview = container.querySelector('[aria-label="BBCode preview"]');
    const code = preview?.querySelector('code');
    expect(code?.textContent).toBe('bitsocial');
    expect(preview?.textContent).toContain('test');
    expect(preview?.textContent).not.toContain('[code]');
  });

  it('updates account state, applies upload completions, and closes once publishing succeeds', async () => {
    await renderReplyModal('/mu/thread/post-1');

    const nameInput = container.querySelectorAll<HTMLInputElement>('input[type="text"]')[0];
    const linkInput = container.querySelectorAll<HTMLInputElement>('input[type="text"]')[2];

    await dispatchInput(nameInput, 'Alicia');
    expect(testState.setAccountMock).toHaveBeenCalledWith({
      author: { address: 'alice.eth', displayName: 'Alicia' },
    });
    expect(testState.setPublishReplyOptionsMock).toHaveBeenCalledWith({ displayName: 'Alicia' });

    await dispatchInput(linkInput, 'https://cdn.example/pasted.png');
    expect(testState.setPublishReplyOptionsMock).toHaveBeenCalledWith({ link: 'https://cdn.example/pasted.png' });

    testState.replyIndex = 3;
    await rerenderReplyModal('/mu/thread/post-1');

    expect(testState.resetPublishReplyOptionsMock).toHaveBeenCalledTimes(1);
    expect(testState.closeModalMock).toHaveBeenCalledTimes(1);
  });

  it('redirects to the board index after a reply when nonoko is used', async () => {
    testState.openEmpty = true;
    testState.selectedText = '';
    testState.publishReplyMock.mockImplementation(() => {
      testState.replyIndex = 3;
    });

    await renderReplyModal('/mu/thread/post-1');

    const optionsInput = container.querySelectorAll<HTMLInputElement>('input[type="text"]')[1];
    const textarea = container.querySelector<HTMLTextAreaElement>('textarea');

    await dispatchInput(optionsInput, 'nonoko');
    await dispatchInput(textarea as HTMLTextAreaElement, 'reply body');
    await clickButtonByText('post');
    await flushEffects();
    await rerenderReplyModal('/mu/thread/post-1');

    expect(testState.publishReplyMock).toHaveBeenCalledTimes(1);
    expect(testState.resetPublishReplyOptionsMock).toHaveBeenCalledTimes(1);
    expect(testState.closeModalMock).toHaveBeenCalledTimes(1);
    expect(testState.navigateMock).toHaveBeenCalledWith('/mu');
  });

  it('inserts quote requests only once and keeps the textarea content stable across rerenders', async () => {
    testState.isMobile = true;
    testState.openEmpty = true;
    testState.selectedText = 'Existing line';

    await renderReplyModal('/mu/thread/post-1');

    const textarea = container.querySelector<HTMLTextAreaElement>('textarea');
    expect(textarea?.value).toBe('Existing line');

    testState.quoteInsertNumber = 77;
    testState.quoteInsertRequestId = 1;
    testState.quoteInsertSelectedText = 'Quoted line';
    await rerenderReplyModal('/mu/thread/post-1');

    expect(textarea?.value).toBe('Existing line\n>>77\nQuoted line\n');
    expect(testState.setPublishReplyOptionsMock).toHaveBeenCalledWith({
      content: 'Existing line\n>>77\nQuoted line\n',
    });

    await rerenderReplyModal('/mu/thread/post-1');
    expect(textarea?.value).toBe('Existing line\n>>77\nQuoted line\n');
  });

  it('does not replay a saved quote request when its location remounts', async () => {
    testState.isMobile = true;
    testState.openEmpty = true;
    testState.replyDraft = {
      content: 'Existing line\n>>77\nQuoted line\n',
      link: '',
      options: '',
      spoiler: false,
    };
    testState.quoteInsertNumber = 77;
    testState.quoteInsertRequestId = 1;
    testState.quoteInsertSelectedText = 'Quoted line';

    await renderReplyModal('/mu/thread/post-1');

    expect(container.querySelector<HTMLTextAreaElement>('textarea')?.value).toBe('Existing line\n>>77\nQuoted line\n');
    expect(testState.updateDraftMock).not.toHaveBeenCalled();
  });

  it('uses file-link placeholder defaults in all view and hides board-specific warnings or spoiler controls when disabled', async () => {
    testState.directoryByAddress = {
      'music-posting.eth': {
        address: 'music-posting.eth',
        features: { noSpoilerReplies: true },
      },
    };

    await renderReplyModal('/all/thread/post-1');

    const linkInput = container.querySelectorAll<HTMLInputElement>('input[type="text"]')[2];
    expect(linkInput?.getAttribute('placeholder')).toBe('https://website.com/image.jpg');
    expect(container.textContent).not.toContain('warning');
    expect(container.textContent).not.toContain('Spoiler?');
  });

  describe('attached files', () => {
    const emptyDraft = { content: '', link: '', options: '', spoiler: false };
    const pngFile = new File(['png'], 'chosen.png', { type: 'image/png' });
    const pngAttachment = { kind: 'file', file: pngFile, name: 'chosen.png', mimeType: 'image/png' };
    const linkInput = () => container.querySelector<HTMLInputElement>('input[aria-label="link_to_file"]') as HTMLInputElement;

    beforeEach(() => {
      testState.uploadMode = 'random';
      // The mocked draft store is static, so write drafts back and rerender like the real store would.
      testState.updateDraftMock.mockImplementation((_locationKey: string, nextDraft: Record<string, unknown>) => {
        testState.replyDraft = { ...emptyDraft, ...testState.replyDraft, ...nextDraft };
      });
    });

    const chooseFile = async () => {
      await clickButtonByText('choose_file');
      await rerenderReplyModal('/all/thread/post-1');
    };

    it('hides the link field, uploads only on submit, then publishes the uploaded link', async () => {
      testState.chooseFileMock.mockResolvedValue(pngAttachment);
      testState.uploadAttachmentMock.mockImplementation(async () => {
        expect(testState.publishReplyMock).not.toHaveBeenCalled();
        return { url: 'https://forgeimg.net/abc/uploaded.png', fileName: 'chosen.png' };
      });
      await renderReplyModal('/all/thread/post-1');
      expect((linkInput().parentElement as HTMLElement).hidden).toBe(true);

      await chooseFile();
      expect(container.textContent).toContain('chosen.png');
      expect(testState.uploadAttachmentMock).not.toHaveBeenCalled();

      await dispatchInput(container.querySelector('textarea') as HTMLTextAreaElement, 'uploaded reply');
      await clickButtonByText('post');

      expect(testState.uploadAttachmentMock).toHaveBeenCalledWith(pngAttachment);
      expect(testState.publishReplyMock).toHaveBeenCalledWith(expect.objectContaining({ link: 'https://forgeimg.net/abc/uploaded.png' }));
      expect(testState.updateDraftMock).toHaveBeenCalledWith(expect.any(String), { attachment: undefined });
    });

    it('runs the spam blocker check before uploading, then publishes the reply with the pass', async () => {
      testState.chooseFileMock.mockResolvedValue(pngAttachment);
      testState.precheckMock.mockImplementation(async () => {
        expect(testState.uploadAttachmentMock).not.toHaveBeenCalled();
        return { status: 'passed', challengeAnswers: ['precheck-pass'] };
      });
      testState.uploadAttachmentMock.mockResolvedValue({ url: 'https://forgeimg.net/abc/uploaded.png', fileName: 'chosen.png' });
      await renderReplyModal('/all/thread/post-1');
      await chooseFile();

      await dispatchInput(container.querySelector('textarea') as HTMLTextAreaElement, 'checked reply');
      await clickButtonByText('post');

      expect(testState.precheckMock).toHaveBeenCalledWith(expect.objectContaining({ publication: expect.objectContaining({ content: 'checked reply' }) }));
      expect(testState.uploadAttachmentMock).toHaveBeenCalledWith(pngAttachment);
      expect(testState.publishReplyMock).toHaveBeenCalledWith(
        expect.objectContaining({ link: 'https://forgeimg.net/abc/uploaded.png', challengeRequest: { challengeAnswers: ['precheck-pass'] } }),
      );
    });

    it('passes the flag answer to the spam blocker check and publishes the answers it returns on flag boards', async () => {
      const flagAnswer = 'bitsocial-flags:5chan:flag:country:auto';
      testState.chooseFileMock.mockResolvedValue(pngAttachment);
      testState.precheckMock.mockResolvedValue({ status: 'passed', challengeAnswers: [flagAnswer, 'precheck-pass'] });
      testState.uploadAttachmentMock.mockResolvedValue({ url: 'https://forgeimg.net/abc/uploaded.png', fileName: 'chosen.png' });
      await renderReplyModal('/pol/thread/post-1', 'politically-incorrect.bso');
      await clickButtonByText('choose_file');
      await renderReplyModal('/pol/thread/post-1', 'politically-incorrect.bso');

      await clickButtonByText('post');

      expect(testState.precheckMock).toHaveBeenCalledWith(expect.objectContaining({ otherAnswers: [flagAnswer] }));
      expect(testState.publishReplyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          challengeRequest: { challengeAnswers: [flagAnswer, 'precheck-pass'] },
          flairs: [{ type: 'country', code: 'auto', text: 'flag:country:auto' }],
        }),
      );
    });

    it('neither uploads nor publishes a reply the spam blocker check stops', async () => {
      testState.chooseFileMock.mockResolvedValue(pngAttachment);
      testState.precheckMock.mockResolvedValue({ status: 'stopped', message: 'You are blocked from posting' });
      await renderReplyModal('/all/thread/post-1');
      await chooseFile();

      await dispatchInput(container.querySelector('textarea') as HTMLTextAreaElement, 'blocked reply');
      await clickButtonByText('post');

      expect(testState.uploadAttachmentMock).not.toHaveBeenCalled();
      expect(testState.publishReplyMock).not.toHaveBeenCalled();
      expect(container.textContent).toContain('error: You are blocked from posting');
    });

    it('clears a visible link field when a file is attached, and a typed link replaces the file', async () => {
      testState.showLinkField = true;
      testState.chooseFileMock.mockResolvedValue(pngAttachment);
      await renderReplyModal('/all/thread/post-1');

      await dispatchInput(linkInput(), 'https://example.com/typed.png');
      await chooseFile();

      expect(linkInput().disabled).toBe(false);
      expect(linkInput().value).toBe('');
      expect(testState.setPublishReplyOptionsMock).toHaveBeenLastCalledWith({ link: '' });

      // After a failed upload the revealed field must still work as the fallback.
      await dispatchInput(linkInput(), 'https://example.com/fallback.png');
      await rerenderReplyModal('/all/thread/post-1');
      expect(testState.replyDraft?.attachment).toBeUndefined();
      expect(container.textContent).not.toContain('chosen.png');

      await dispatchInput(container.querySelector('textarea') as HTMLTextAreaElement, 'fallback reply');
      await clickButtonByText('post');
      expect(testState.uploadAttachmentMock).not.toHaveBeenCalled();
      expect(testState.publishReplyMock).toHaveBeenCalledTimes(1);
      expect(testState.setPublishReplyOptionsMock).toHaveBeenCalledWith({ link: 'https://example.com/fallback.png' });
    });

    it('replaces the attached file when another one is chosen', async () => {
      const gifAttachment = { kind: 'file', file: new File(['gif'], 'second.gif', { type: 'image/gif' }), name: 'second.gif', mimeType: 'image/gif' };
      testState.chooseFileMock.mockResolvedValueOnce(pngAttachment).mockResolvedValueOnce(gifAttachment);
      testState.uploadAttachmentMock.mockResolvedValue({ url: 'https://forgeimg.net/abc/second.gif', fileName: 'second.gif' });
      await renderReplyModal('/all/thread/post-1');

      await chooseFile();
      await chooseFile();
      expect(container.textContent).toContain('second.gif');
      expect(container.textContent).not.toContain('chosen.png');
      expect(container.querySelector('button[aria-label="remove"]')).toBeNull();

      await clickButtonByText('post');
      expect(testState.uploadAttachmentMock).toHaveBeenCalledTimes(1);
      expect(testState.uploadAttachmentMock).toHaveBeenCalledWith(gifAttachment);
    });

    const dropFile = async (file: File) => {
      const drop = new Event('drop', { bubbles: true, cancelable: true });
      Object.defineProperty(drop, 'dataTransfer', { value: { types: ['Files'], files: [file], dropEffect: 'none' } });
      await act(async () => {
        (container.querySelector('textarea') as HTMLTextAreaElement).dispatchEvent(drop);
      });
      await rerenderReplyModal('/all/thread/post-1');
      return drop;
    };

    it('attaches a file dropped on the modal, then uploads it once the reply is submitted', async () => {
      testState.uploadAttachmentMock.mockResolvedValue({ url: 'https://forgeimg.net/abc/dropped.png', fileName: 'chosen.png' });
      await renderReplyModal('/all/thread/post-1');

      const drop = await dropFile(pngFile);
      expect(drop.defaultPrevented).toBe(true);
      expect(container.textContent).toContain('chosen.png');
      expect(testState.chooseFileMock).not.toHaveBeenCalled();

      await dispatchInput(container.querySelector('textarea') as HTMLTextAreaElement, 'dropped reply');
      await clickButtonByText('post');

      expect(testState.uploadAttachmentMock).toHaveBeenCalledWith(pngAttachment);
      expect(testState.publishReplyMock).toHaveBeenCalledWith(expect.objectContaining({ link: 'https://forgeimg.net/abc/dropped.png' }));
    });

    it('reports a dropped file of an unsupported type until a supported one is attached', async () => {
      await renderReplyModal('/all/thread/post-1');

      await dropFile(new File(['pdf'], 'notes.pdf', { type: 'application/pdf' }));
      expect(container.textContent).toContain('error: unsupported_file_type_alert');
      expect(testState.replyDraft?.attachment).toBeUndefined();

      await dropFile(pngFile);
      expect(container.textContent).not.toContain('unsupported_file_type_alert');
      expect(container.textContent).toContain('chosen.png');
    });

    it('validates the reply before uploading the attached file', async () => {
      testState.chooseFileMock.mockResolvedValue({
        kind: 'file',
        file: new File(['FWS'], 'movie.swf', { type: 'application/x-shockwave-flash' }),
        name: 'movie.swf',
        mimeType: 'application/x-shockwave-flash',
      });
      await renderReplyModal('/all/thread/post-1');
      await chooseFile();
      await clickButtonByText('post');

      expect(container.textContent).toContain('error: link_not_image_or_video_alert');
      expect(testState.uploadAttachmentMock).not.toHaveBeenCalled();
      expect(testState.publishReplyMock).not.toHaveBeenCalled();
    });

    it('does not publish an upload that finishes after the modal closed', async () => {
      let finishUpload: (value: { url: string; fileName: string }) => void = () => undefined;
      testState.chooseFileMock.mockResolvedValue(pngAttachment);
      testState.uploadAttachmentMock.mockImplementation(
        () =>
          new Promise((resolve) => {
            finishUpload = resolve;
          }),
      );
      await renderReplyModal('/all/thread/post-1');
      await chooseFile();
      await clickButtonByText('post');

      await act(async () => {
        root.render(
          createElement(
            MemoryRouter,
            { initialEntries: ['/all/thread/post-1'] },
            createElement(ReplyModal, {
              closeModal: testState.closeModalMock,
              locationDraftKey: '/all/thread/post-1',
              parentCid: 'parent-cid',
              parentNumber: 42,
              postCid: 'post-cid',
              scrollY: 120,
              showReplyModal: false,
              communityAddress: 'music-posting.eth',
              threadNumber: 42,
            }),
          ),
        );
      });
      testState.setPublishReplyOptionsMock.mockClear();
      await act(async () => {
        finishUpload({ url: 'https://forgeimg.net/abc/late.png', fileName: 'chosen.png' });
      });

      expect(testState.publishReplyMock).not.toHaveBeenCalled();
      expect(testState.setPublishReplyOptionsMock).not.toHaveBeenCalled();
    });

    it('ignores an attachment once the board turns out to disallow reply links', async () => {
      testState.replyDraft = { ...emptyDraft, content: 'text only', attachment: pngAttachment };
      testState.communities['music-posting.eth'] = { address: 'music-posting.eth', features: { noReplyLinks: true } };
      await renderReplyModal('/all/thread/post-1');

      expect(container.textContent).not.toContain('chosen.png');
      expect(Array.from(container.querySelectorAll('button')).some((button) => button.textContent === 'choose_file')).toBe(false);

      await dispatchInput(container.querySelector('textarea') as HTMLTextAreaElement, 'text only');
      await clickButtonByText('post');
      expect(container.textContent).not.toContain('reply_links_not_allowed_alert');
      expect(testState.uploadAttachmentMock).not.toHaveBeenCalled();
      expect(testState.publishReplyMock).toHaveBeenCalledTimes(1);
    });

    it('ignores an attachment once uploads are turned off', async () => {
      testState.chooseFileMock.mockResolvedValue(pngAttachment);
      await renderReplyModal('/all/thread/post-1');
      await chooseFile();

      testState.uploadMode = 'none';
      testState.showUploadControls = false;
      await rerenderReplyModal('/all/thread/post-1');

      expect(container.textContent).not.toContain('chosen.png');
      expect(linkInput().disabled).toBe(false);
      await dispatchInput(container.querySelector('textarea') as HTMLTextAreaElement, 'text only');
      await clickButtonByText('post');
      expect(testState.uploadAttachmentMock).not.toHaveBeenCalled();
      expect(testState.publishReplyMock).toHaveBeenCalledTimes(1);
    });

    it('locks the reply fields while the attachment uploads', async () => {
      testState.uploadPhase = 'uploading';
      await renderReplyModal('/all/thread/post-1');

      expect(container.querySelector('fieldset')?.disabled).toBe(true);
      expect(container.querySelector('textarea')?.matches(':disabled')).toBe(true);
    });

    it('keeps the attachment and does not publish when its upload fails', async () => {
      testState.chooseFileMock.mockResolvedValue(pngAttachment);
      testState.uploadAttachmentMock.mockResolvedValue(null);
      await renderReplyModal('/all/thread/post-1');
      await chooseFile();
      await clickButtonByText('post');

      expect(testState.uploadAttachmentMock).toHaveBeenCalledTimes(1);
      expect(testState.publishReplyMock).not.toHaveBeenCalled();
      expect(testState.replyDraft?.attachment).toBe(pngAttachment);
    });
  });

  it('shows the link to file field when the setting is on, no upload provider is enabled, or Tegaki runs on web', async () => {
    const isLinkFieldHidden = () => (container.querySelector<HTMLInputElement>('input[aria-label="link_to_file"]')?.parentElement as HTMLElement | null)?.hidden;
    testState.uploadMode = 'random';
    testState.showLinkField = true;
    await renderReplyModal('/all/thread/post-1');
    expect(isLinkFieldHidden()).toBe(false);

    testState.showLinkField = false;
    testState.uploadMode = 'none';
    testState.showUploadControls = false;
    await rerenderReplyModal('/all/thread/post-1');
    expect(isLinkFieldHidden()).toBe(false);

    testState.uploadMode = 'random';
    testState.showUploadControls = true;
    testState.directoryByAddress['oekaki-posting.bso'] = {
      address: 'oekaki-posting.bso',
      directoryCode: 'i',
      features: { requireReplyLink: true, requireReplyLinkIsMedia: true },
      title: '/i/ - Oekaki',
    };
    testState.communities['oekaki-posting.bso'] = { address: 'oekaki-posting.bso' };
    await renderReplyModal('/i/thread/post-1', 'oekaki-posting.bso');
    expect(isLinkFieldHidden()).toBe(false);
  });

  it('only shows pasted link filenames after media-only links are confirmed as files', async () => {
    await renderReplyModal('/all/thread/post-1');

    const linkInput = container.querySelectorAll<HTMLInputElement>('input[type="text"]')[2];

    await dispatchInput(linkInput, 'https://imgur.com/8EJ2T76');

    expect(container.textContent).toContain('no_file_chosen');
    expect(container.textContent).not.toContain('8EJ2T76');

    await dispatchInput(linkInput, 'https://imgur.com/8EJ2T76.jpg');

    expect(container.textContent).toContain('8EJ2T76.jpg');
  });

  it('positions the draggable modal with left/top styles instead of a transform layer', async () => {
    await renderReplyModal('/mu/thread/post-1');

    const modal = container.querySelector<HTMLDivElement>('[class*="container"]');

    expect(modal?.style.left).toBe('120px');
    expect(modal?.style.top).toBe('80px');
    expect(modal?.style.transform).toBe('');
    expect(modal?.style.touchAction).toBe('none');
  });

  it('reopens desktop reply modals at the last dragged session position', async () => {
    await renderReplyModal('/mu/thread/post-1');

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

    expect(JSON.parse(window.sessionStorage.getItem(REPLY_MODAL_POSITION_SESSION_STORAGE_KEY) ?? '{}')).toEqual({ left: 232, top: 147 });

    await act(async () => {
      root.render(createElement(React.Fragment));
    });

    testState.useSpringMock.mockClear();
    await renderReplyModal('/b/thread/post-2', 'random-nsfw.bso');

    const [configFactory] = testState.useSpringMock.mock.calls[0] as [() => Record<string, unknown>, unknown[]];
    expect(configFactory()).toEqual({
      from: {
        left: 232,
        top: 147,
      },
    });
  });

  it('ignores the stored desktop position when first opened in a mobile viewport', async () => {
    const originalInnerWidth = window.innerWidth;
    const originalInnerHeight = window.innerHeight;
    testState.isMobile = true;
    window.sessionStorage.setItem(REPLY_MODAL_POSITION_SESSION_STORAGE_KEY, JSON.stringify({ left: 500, top: 210 }));
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 760 });

    try {
      await renderReplyModal('/mu/thread/post-1');

      const [configFactory] = testState.useSpringMock.mock.calls[0] as [() => Record<string, unknown>, unknown[]];
      expect(configFactory()).toEqual({
        from: {
          left: 45,
          top: 180,
        },
      });
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalInnerWidth });
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: originalInnerHeight });
    }
  });

  it('closes with Escape from the document on desktop', async () => {
    await renderReplyModal('/mu/thread/post-1');

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
    });

    expect(testState.closeModalMock).toHaveBeenCalledTimes(1);
  });

  it('restores body selection styles if unmounted during a drag', async () => {
    document.body.style.userSelect = 'text';
    document.body.style.webkitUserSelect = 'auto';

    await renderReplyModal('/mu/thread/post-1');

    await act(async () => {
      testState.dragHandler?.({
        active: true,
        event: { preventDefault: vi.fn() },
        offset: [140, 100],
      });
    });

    expect(document.body.style.userSelect).toBe('none');
    expect(document.body.style.webkitUserSelect).toBe('none');

    await act(async () => {
      root.render(createElement(React.Fragment));
    });

    expect(document.body.style.userSelect).toBe('text');
    expect(document.body.style.webkitUserSelect).toBe('auto');
  });

  it('initializes the drag spring once so typing rerenders do not recenter the modal', async () => {
    await renderReplyModal('/mu/thread/post-1');

    expect(testState.useSpringMock).toHaveBeenCalledWith(expect.any(Function), []);

    const [configFactory, deps] = testState.useSpringMock.mock.calls[0] as [() => Record<string, unknown>, unknown[]];
    expect(deps).toEqual([]);
    expect(configFactory()).toEqual({
      from: {
        left: expect.any(Number),
        top: expect.any(Number),
      },
    });
  });
});
