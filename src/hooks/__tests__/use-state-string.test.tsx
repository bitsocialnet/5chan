import * as React from 'react';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useStateString, { useFeedStateString } from '../use-state-string';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const act = (React as { act?: (cb: () => void | Promise<void>) => void | Promise<void> }).act as (cb: () => void | Promise<void>) => void | Promise<void>;

const testState = vi.hoisted(() => ({
  clientsStates: {} as Record<string, string[]>,
  subplebbit: undefined as
    | {
        publishingState?: string;
        state?: string;
        updatingState?: string;
      }
    | undefined,
  subplebbitsStates: {} as Record<string, { clientUrls: string[]; subplebbitAddresses: string[] }>,
}));

vi.mock('@bitsocialnet/bitsocial-react-hooks', () => ({
  useClientsStates: () => ({
    states: testState.clientsStates,
  }),
  useSubplebbit: () => testState.subplebbit,
  useSubplebbitsStates: () => ({
    states: testState.subplebbitsStates,
  }),
}));

vi.mock('lodash/debounce', () => ({
  default: <T extends (...args: any[]) => unknown>(fn: T) => {
    const wrapped = ((...args: Parameters<T>) => fn(...args)) as T & { cancel: () => void };
    wrapped.cancel = () => undefined;
    return wrapped;
  },
}));

let container: HTMLDivElement;
let root: Root;
let latestValue: string | undefined;

const StateStringHarness = ({
  value,
}: {
  value: {
    publishingState?: string;
    state?: string;
    updatingState?: string;
  };
}) => {
  latestValue = useStateString(value);
  return null;
};

const FeedStateStringHarness = ({ addresses }: { addresses?: string[] }) => {
  latestValue = useFeedStateString(addresses);
  return null;
};

describe('use-state-string', () => {
  beforeEach(() => {
    latestValue = undefined;
    testState.clientsStates = {};
    testState.subplebbit = undefined;
    testState.subplebbitsStates = {};
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('formats client state strings with normalized hostnames', () => {
    testState.clientsStates = {
      'fetching-ipns': ['https://rpc.example.com/path', 'https://ipfs.io/api'],
      'resolving-address': ['https://ens.example.com'],
    };

    act(() => {
      root.render(createElement(StateStringHarness, { value: { state: 'updating' } }));
    });

    expect(latestValue).toBe('Fetching IPNS from rpc.example.com, ipfs.io, resolving address from ens.example.com');
  });

  it('falls back to publishing and updating states when no client states are available', () => {
    act(() => {
      root.render(createElement(StateStringHarness, { value: { publishingState: 'fetching-ipfs', state: 'publishing' } }));
    });
    expect(latestValue).toBe('Downloading thread');

    act(() => {
      root.render(createElement(StateStringHarness, { value: { state: 'updating', updatingState: 'fetching-ipns' } }));
    });
    expect(latestValue).toBe('Downloading board');
  });

  it('sanitizes single-board feed state strings to board wording', () => {
    testState.subplebbit = {
      state: 'updating',
      updatingState: 'fetching-ipfs',
    };

    act(() => {
      root.render(createElement(FeedStateStringHarness, { addresses: ['music-posting.eth'] }));
    });

    expect(latestValue).toBe('Downloading board');
  });

  it('aggregates multi-board feed states across address resolution, threads, and pages', () => {
    testState.subplebbitsStates = {
      'fetching-ipfs': {
        clientUrls: ['https://ipfs.io'],
        subplebbitAddresses: ['music-posting.eth'],
      },
      'fetching-ipns': {
        clientUrls: ['https://gateway.example.com'],
        subplebbitAddresses: ['music-posting.eth', 'tech-posting.eth'],
      },
      'page-1': {
        clientUrls: ['https://gateway.example.com', 'https://ipfs.io'],
        subplebbitAddresses: ['music-posting.eth'],
      },
      'resolving-address': {
        clientUrls: ['https://ens.example.com'],
        subplebbitAddresses: ['music-posting.eth', 'tech-posting.eth'],
      },
    };

    act(() => {
      root.render(createElement(FeedStateStringHarness, { addresses: ['music-posting.eth', 'tech-posting.eth'] }));
    });

    expect(latestValue).toBe('Resolving 2 addresses from ens.example.com, downloading 2 boards, 1 threads, 1 page from gateway.example.com, ipfs.io');
  });

  it('shows an immediate board-specific loading string before detailed multi-board states arrive', () => {
    act(() => {
      root.render(createElement(FeedStateStringHarness, { addresses: ['music-posting.eth', 'tech-posting.eth'] }));
    });

    expect(latestValue).toBe('Downloading 2 boards');
  });
});
