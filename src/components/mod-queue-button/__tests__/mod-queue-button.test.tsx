import * as React from 'react';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ModQueueButton } from '../mod-queue-button';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const act = (React as { act?: (cb: () => void | Promise<void>) => void | Promise<void> }).act as (cb: () => void | Promise<void>) => void | Promise<void>;

const testState = vi.hoisted(() => ({
  candidateCommunityAddresses: ['music-posting.eth', 'tech-posting.eth', 'subscribed.eth'],
  loaderCandidates: [] as string[][],
}));

vi.mock('@bitsocial/bitsocial-react-hooks', () => ({
  useCommunity: () => ({ state: 'succeeded', roles: {} }),
  useFeed: () => ({ feed: [] }),
}));

vi.mock('../../../hooks/use-moderated-community-addresses', () => ({
  useModeratedCommunityAddressInputs: () => ({
    accountAddress: 'account-address',
    accountCommunityAddresses: [],
    candidateCommunityAddresses: testState.candidateCommunityAddresses,
  }),
  useModeratedCommunityAddressesForInputs: () => [],
}));

vi.mock('../../../hooks/use-directories', () => ({
  useDirectories: () => [{ address: 'music-posting.eth', directoryCode: 'mu', title: '/mu/ - Music' }],
}));

vi.mock('../../../hooks/use-community-identifiers', () => ({
  useCommunityIdentifier: (address?: string) => (address ? { name: address } : undefined),
  useCommunityIdentifiers: (addresses?: string[]) => (addresses ?? []).map((address) => ({ name: address })),
}));

vi.mock('../../../hooks/use-current-time', () => ({ useCurrentTime: () => 1_704_067_210 }));

vi.mock('../../../hooks/use-locally-moderated-mod-queue-feed', () => ({ useLocallyModeratedModQueueFeed: (feed: unknown[]) => feed }));

vi.mock('../../../stores/use-mod-queue-store', () => ({
  default: (selector: (state: { getAlertThresholdSeconds: () => number }) => unknown) => selector({ getAlertThresholdSeconds: () => 300 }),
}));

vi.mock('../../mod-queue-community-metadata-loader', () => ({
  default: ({ candidateCommunityAddresses }: { candidateCommunityAddresses: string[] }) => {
    testState.loaderCandidates.push(candidateCommunityAddresses);
    return null;
  },
}));

let container: HTMLDivElement;
let root: Root;

const renderButton = async (boardIdentifier?: string) => {
  await act(async () => {
    root.render(createElement(MemoryRouter, {}, createElement(ModQueueButton, { boardIdentifier })));
  });
};

describe('ModQueueButton', () => {
  beforeEach(() => {
    testState.loaderCandidates = [];
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('does not look up every candidate board role on a board page', async () => {
    await renderButton('mu');
    expect(testState.loaderCandidates).toEqual([]);
  });

  it('looks up the candidate board roles when it counts every moderated board', async () => {
    await renderButton(undefined);
    expect(testState.loaderCandidates.at(-1)).toEqual(testState.candidateCommunityAddresses);
  });
});
