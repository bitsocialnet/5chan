import * as React from 'react';
import { createElement } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const act = (React as { act?: (cb: () => void | Promise<void>) => void | Promise<void> }).act as (cb: () => void | Promise<void>) => void | Promise<void>;

const testState = vi.hoisted(() => ({
  rpcUrls: ['ws://localhost:9138'] as string[] | undefined,
  hostedCommunities: { 'hosted-board': { settings: {} }, 'remote-board': {} } as Record<string, Record<string, unknown>>,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('../../../hooks/use-active-account-field', () => ({
  useActiveAccountField: <T,>(selector: (account: unknown) => T) => selector({ pkcOptions: { pkcRpcClientsOptions: testState.rpcUrls } }),
}));

vi.mock('../../../hooks/use-stable-community', () => ({
  useCommunityField: <T,>(address: string | undefined, selector: (community: unknown) => T) =>
    address && testState.hostedCommunities[address] ? selector(testState.hostedCommunities[address]) : undefined,
}));

let root: Root;
let container: HTMLDivElement;
let getNodeReachability: ReturnType<typeof vi.fn>;

const render = async (communityAddress: string) => {
  const { default: BoardReachabilityAlert } = await import('../board-reachability-alert');
  await act(async () => {
    root.render(createElement(BoardReachabilityAlert, { className: 'alert', communityAddress }));
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};

const remount = () => {
  act(() => root.unmount());
  root = createRoot(container);
};

describe('BoardReachabilityAlert', () => {
  beforeEach(() => {
    vi.resetModules();
    testState.rpcUrls = ['ws://localhost:9138'];
    getNodeReachability = vi.fn().mockResolvedValue('private');
    window.electronApi = { isElectron: true, getNodeReachability } as unknown as typeof window.electronApi;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    window.electronApi = undefined;
  });

  it('warns the owner when the node hosting this board is not reachable from the internet', async () => {
    await render('hosted-board');

    expect(container.textContent).toBe('board_unreachable_from_browsers');
    expect(getNodeReachability).toHaveBeenCalledTimes(1);
  });

  it('keeps the warning when the post form remounts on navigation, without asking the node again', async () => {
    await render('hosted-board');
    remount();

    await act(async () => {
      const { default: BoardReachabilityAlert } = await import('../board-reachability-alert');
      root.render(createElement(BoardReachabilityAlert, { className: 'alert', communityAddress: 'hosted-board' }));
    });

    expect(container.textContent).toBe('board_unreachable_from_browsers');
    expect(getNodeReachability).toHaveBeenCalledTimes(1);
  });

  it.each(['public', 'unknown'])('stays hidden when the node reachability is %s', async (reachability) => {
    getNodeReachability.mockResolvedValue(reachability);
    await render('hosted-board');

    expect(getNodeReachability).toHaveBeenCalledTimes(1);
    expect(container.textContent).toBe('');
  });

  it('does not check boards hosted elsewhere or accounts using another node', async () => {
    await render('remote-board');
    expect(container.textContent).toBe('');

    testState.rpcUrls = ['ws://203.0.113.5:9138/secret'];
    await render('hosted-board');
    expect(container.textContent).toBe('');
    expect(getNodeReachability).not.toHaveBeenCalled();
  });

  it('does nothing outside the desktop app', async () => {
    window.electronApi = undefined;
    await render('hosted-board');

    expect(container.textContent).toBe('');
  });
});
