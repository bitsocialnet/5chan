import * as React from 'react';
import { createElement } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const act = (React as { act?: (cb: () => void | Promise<void>) => void | Promise<void> }).act as (cb: () => void | Promise<void>) => void | Promise<void>;

const SPAM_BLOCKER = '@bitsocial/spam-blocker-challenge';

const testState = vi.hoisted(() => ({
  pkcRpcClientsOptions: ['ws://localhost:9138'] as string[] | undefined,
  rpcState: 'connected',
  startMock: vi.fn(),
  rpcChallenges: {} as Record<string, unknown>,
  createCommunityMock: vi.fn(),
  subscribeMock: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => (options?.error ? `${key}:${options.error}` : key),
  }),
  Trans: ({ i18nKey }: { i18nKey: string }) => i18nKey,
}));

vi.mock('react-router-dom', async () => {
  const ReactModule = await vi.importActual<typeof import('react')>('react');
  return {
    Link: ({ to, children }: { to: string; children?: React.ReactNode }) => ReactModule.createElement('a', { href: to }, children),
    useLocation: () => ({ pathname: '/tech', search: '' }),
  };
});

vi.mock('@bitsocial/bitsocial-react-hooks', () => ({
  useAccount: () => ({ author: { address: 'creator-address' }, pkcOptions: { pkcRpcClientsOptions: testState.pkcRpcClientsOptions } }),
  usePkcRpcSettings: () => ({ state: testState.rpcState, pkcRpcSettings: { challenges: testState.rpcChallenges } }),
}));

vi.mock('../../../lib/bitsocial-internals/stores', () => ({
  accountsStore: (selector: (state: unknown) => unknown) =>
    selector({ accountsActions: { createCommunity: testState.createCommunityMock, subscribe: testState.subscribeMock } }),
}));

vi.mock('../../../hooks/use-directories', () => ({ useDirectories: () => [] }));
vi.mock('../../../lib/utils/route-utils', () => ({
  getBoardPath: (address: string) => address,
  getSettingsSectionPath: (pathname: string, section: string) => `${pathname}?section=${section}`,
}));

let root: Root;
let container: HTMLDivElement;

const render = async () => {
  const { default: CreateBoardModal } = await import('../create-board-modal');
  const { default: useCreateBoardModalStore } = await import('../../../stores/use-create-board-modal-store');
  useCreateBoardModalStore.getState().openCreateBoardModal();
  await act(async () => {
    root.render(createElement(CreateBoardModal));
  });
};

const setInputValue = async (element: HTMLInputElement | HTMLTextAreaElement | null, value: string) => {
  expect(element).toBeTruthy();
  await act(async () => {
    const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(element, value);
    element?.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

const submitForm = async () => {
  const form = container.querySelector('form');
  expect(form).toBeTruthy();
  await act(async () => {
    form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
};

describe('CreateBoardModal', () => {
  beforeEach(() => {
    vi.resetModules();
    testState.pkcRpcClientsOptions = ['ws://localhost:9138'];
    testState.rpcState = 'connected';
    testState.startMock.mockReset();
    testState.startMock.mockResolvedValue(undefined);
    testState.rpcChallenges = { 'text-math': { description: 'math' }, [SPAM_BLOCKER]: { description: 'spam blocker' } };
    testState.createCommunityMock.mockReset();
    testState.subscribeMock.mockReset();
    testState.subscribeMock.mockResolvedValue(undefined);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('explains that a node is required when no RPC is configured or the connection failed', async () => {
    testState.pkcRpcClientsOptions = undefined;
    testState.rpcState = 'initializing';
    await render();
    expect(container.textContent).toContain('create_board_requires_node');
    expect(container.querySelector('form')).toBeNull();

    act(() => root.unmount());
    root = createRoot(container);
    testState.pkcRpcClientsOptions = ['ws://localhost:9138'];
    testState.rpcState = 'failed';
    await render();
    expect(container.textContent).toContain('create_board_requires_node');
  });

  it('shows a loading line instead of the node notice while a configured RPC connects', async () => {
    testState.rpcState = 'initializing';
    await render();

    expect(container.textContent).toContain('loading');
    expect(container.textContent).not.toContain('create_board_requires_node');
    expect(container.querySelector('form')).toBeNull();
  });

  it('creates the board with the creator as owner, subscribes to it, and points to the board manager', async () => {
    testState.createCommunityMock.mockResolvedValue({ address: 'new-board-address', start: testState.startMock });
    await render();

    expect(container.querySelector<HTMLSelectElement>('#create-board-challenge')?.value).toBe(SPAM_BLOCKER);
    await setInputValue(container.querySelector<HTMLInputElement>('#create-board-title'), 'Tech');
    await setInputValue(container.querySelector<HTMLTextAreaElement>('#create-board-rules'), 'be nice\nno spam');
    await submitForm();

    expect(testState.createCommunityMock).toHaveBeenCalledTimes(1);
    const options = testState.createCommunityMock.mock.calls[0][0] as Record<string, unknown>;
    expect(options).toMatchObject({ title: 'Tech', rules: ['be nice', 'no spam'], roles: { 'creator-address': { role: 'owner' } } });
    expect((options.settings as { challenges: { name: string }[] }).challenges.map((challenge) => challenge.name)).toContain(SPAM_BLOCKER);
    expect(testState.startMock).toHaveBeenCalledTimes(1);
    expect(testState.subscribeMock).toHaveBeenCalledWith('new-board-address');
    expect(container.textContent).toContain('create_board_created');
    expect(container.textContent).not.toContain('create_board_start_failed');
    expect(container.textContent).toContain('5chan board add new-board-address --skip-apply-defaults');
    expect(container.textContent).toContain('board_manager_notice');
    expect(container.querySelector('form')).toBeNull();
  });

  it('keeps the form and shows the error when creation fails', async () => {
    testState.createCommunityMock.mockRejectedValue(new Error('challenge not installed'));
    await render();
    await submitForm();

    expect(container.textContent).toContain('create_board_failed:challenge not installed');
    expect(container.querySelector('form')).toBeTruthy();
    expect(testState.subscribeMock).not.toHaveBeenCalled();
  });
  it('still shows the created board when starting it fails', async () => {
    testState.startMock.mockRejectedValue(new Error('kubo offline'));
    testState.createCommunityMock.mockResolvedValue({ address: 'new-board-address', start: testState.startMock });
    await render();
    await submitForm();

    expect(container.textContent).toContain('create_board_created');
    expect(container.textContent).toContain('create_board_start_failed:kubo offline');
    expect(testState.subscribeMock).toHaveBeenCalledWith('new-board-address');
  });
});
