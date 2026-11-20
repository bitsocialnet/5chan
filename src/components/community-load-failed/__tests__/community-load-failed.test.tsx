import * as React from 'react';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { communitiesStore } from '../../../lib/bitsocial-internals/stores';
import CommunityLoadFailed from '../community-load-failed';
import { getCommunityLoadFailureDetails } from '../community-load-failure-details';

// A plain store keeps the real hooks accounts store from initializing after the test environment is torn down
vi.mock('../../../lib/bitsocial-internals/stores', async () => {
  const { create } = await import('zustand');
  return { communitiesStore: create(() => ({ communities: {}, errors: {}, syncStatuses: {} })) };
});

const testState = vi.hoisted(() => ({
  copyToClipboardMock: vi.fn<(value: string) => Promise<void>>(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
  }),
}));

vi.mock('../../../lib/utils/clipboard-utils', () => ({
  copyToClipboard: (value: string) => testState.copyToClipboardMock(value),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const act = (React as { act?: (cb: () => void | Promise<void>) => void | Promise<void> }).act as (cb: () => void | Promise<void>) => void | Promise<void>;

let container: HTMLDivElement;
let root: Root;

describe('CommunityLoadFailed', () => {
  beforeEach(() => {
    communitiesStore.setState({ communities: {}, errors: {}, syncStatuses: {} });
    testState.copyToClipboardMock.mockReset();
    testState.copyToClipboardMock.mockResolvedValue(undefined);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('collects what is known about a failed board for its Failed label to copy', () => {
    const storedError = new Error('Community record signature is invalid');
    communitiesStore.setState({
      communities: { '12D3KooWPublicKey': { updatingState: 'waiting-retry', clients: { kuboRpcClients: { 'http://localhost:5001': { state: 'stopped' } } } } },
      errors: { '12D3KooWPublicKey': [storedError] },
      syncStatuses: { '12D3KooWPublicKey': { syncState: 'retrying', lastFetchAttemptAt: 1793481000 } },
    });

    const communityIdentifier = { name: 'board.bso', publicKey: '12D3KooWPublicKey' };
    expect(getCommunityLoadFailureDetails(communityIdentifier)).toMatchObject({
      message: 'Failed to load board',
      community: communityIdentifier,
      copiedAt: expect.any(String),
      updatingState: 'waiting-retry',
      syncStatus: { syncState: 'retrying', lastFetchAttemptAt: 1793481000 },
      errors: [storedError],
      clients: { kuboRpcClients: { 'http://localhost:5001': { state: 'stopped' } } },
    });
    // Unknown fields are left out rather than copied as "[undefined]"
    expect(Object.keys(getCommunityLoadFailureDetails(undefined))).toEqual(['message', 'copiedAt']);
  });

  it('copies the details of every board of a multi-board feed that failed', async () => {
    communitiesStore.setState({
      errors: { 'first-board.bso': [new Error('first board failed')], 'second-board.bso': [new Error('second board failed')] },
    });

    await act(async () => {
      root.render(createElement(CommunityLoadFailed, { communityIdentifier: [{ name: 'first-board.bso' }, { name: 'second-board.bso' }] }));
    });
    expect(container.textContent).toBe('failed');

    await act(async () => {
      container.querySelector('button')?.click();
    });

    const copied = JSON.parse(testState.copyToClipboardMock.mock.calls[0][0]);
    expect(copied).toEqual([
      expect.objectContaining({ community: { name: 'first-board.bso' }, errors: [expect.objectContaining({ message: 'first board failed' })] }),
      expect.objectContaining({ community: { name: 'second-board.bso' }, errors: [expect.objectContaining({ message: 'second board failed' })] }),
    ]);
  });
});
