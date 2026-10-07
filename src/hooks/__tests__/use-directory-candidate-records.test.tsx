import * as React from 'react';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { useDirectoryCandidateRecords } from '../use-directory-candidate-records';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const act = (React as { act?: (cb: () => void | Promise<void>) => void | Promise<void> }).act as (cb: () => void | Promise<void>) => void | Promise<void>;

const testState = vi.hoisted(() => ({
  boards: [] as Array<{ address: string; publicKey?: string }>,
  requested: [] as unknown[],
}));

vi.mock('@bitsocial/bitsocial-react-hooks', () => ({
  useCommunities: (options?: { communities?: unknown[] }) => {
    testState.requested.push(options?.communities);
    return { communities: [] };
  },
}));

vi.mock('../use-directories', () => ({
  useDirectories: () => [{ address: 'business-and-finance.bso', directoryCode: 'biz', title: '/biz/ - Business & Finance' }],
}));

vi.mock('../use-directory-list', () => ({
  useDirectoryList: (code?: string) => ({ list: code ? { directoryCode: code, boards: testState.boards } : null, loading: false, error: null }),
}));

vi.mock('../use-community-identifiers', () => ({
  useCommunityIdentifiers: (addresses?: string[]) => (addresses ?? []).map((address) => ({ name: address })),
}));

const render = async (boardIdentifier: string) => {
  testState.requested = [];
  const Harness = () => {
    useDirectoryCandidateRecords(boardIdentifier);
    return null;
  };
  const root = createRoot(document.createElement('div'));
  await act(async () => root.render(createElement(Harness)));
  act(() => root.unmount());
  return testState.requested.at(-1);
};

describe('useDirectoryCandidateRecords', () => {
  it('loads every candidate record of a directory with more than one candidate', async () => {
    testState.boards = [{ address: 'business-and-finance.bso', publicKey: '12D3KooWBusiness' }, { address: 'bizraelis.bso' }, { address: '12D3KooWRawKey' }];

    expect(await render('biz')).toEqual([{ name: 'business-and-finance.bso' }, { name: 'bizraelis.bso' }, { name: '12D3KooWRawKey' }]);
  });

  it('loads nothing for a single-candidate directory or a direct board address', async () => {
    testState.boards = [{ address: 'business-and-finance.bso', publicKey: '12D3KooWBusiness' }];

    expect(await render('biz')).toEqual([]);
    expect(await render('custom-board.bso')).toEqual([]);
  });
});
