import * as React from 'react';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import type { Criteria } from '@bitsocial/pubsub-voting';
import { nextDirectoryVoteRecord, useDirectoryVote, type DirectoryVoteState } from '../use-directory-vote';
import type { VoteTallyState } from '../use-vote-tally';
import type { DirectoryBoardRequirement } from '../../lib/directory-board-requirements';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const act = (React as { act?: (cb: () => void | Promise<void>) => void | Promise<void> }).act as (cb: () => void | Promise<void>) => void | Promise<void>;

const testState = vi.hoisted(() => ({
  account: undefined as unknown,
  resolveDirectoryBoard: undefined as unknown as (address: string) => Promise<unknown>,
  publishDirectoryVote: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
}));

vi.mock('@bitsocial/bitsocial-react-hooks', () => ({ useAccount: () => testState.account }));

vi.mock('../../lib/directory-vote-signer', () => ({
  getAccountVoteSigner: (account: unknown) => (account ? { address: '0xvoter', signer: {} } : undefined),
}));

vi.mock('../use-pubsub-voter', () => ({
  getBrowserHeliaNode: (account: unknown) => (account ? {} : undefined),
  getBrowserNameResolvers: () => [],
}));

vi.mock('../../lib/pubsub-voter', () => ({
  getOrCreateBrowserPubsubVoter: () => ({}),
  isTestnetVotingChain: () => false,
}));

vi.mock('../../lib/directory-vote-publishing', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/directory-vote-publishing')>()),
  resolveDirectoryBoard: (address: string) => testState.resolveDirectoryBoard(address),
  publishDirectoryVote: (...args: unknown[]) => testState.publishDirectoryVote(...args),
}));

const criteria = { contestId: '5chan-dir-a-vote-test-1', blocksPerBucket: 1800, voteExpiryBuckets: 720 } as Criteria;
const base = { address: '0xabc', contestId: criteria.contestId, topic: 'topic-a' };
const board = { name: 'board.bso', publicKey: '12D3KooWBoard' };
const other = { name: 'other.bso', publicKey: '12D3KooWOther' };

describe('nextDirectoryVoteRecord', () => {
  it('stores a first vote without a re-sign flag', () => {
    expect(nextDirectoryVoteRecord(undefined, { ...base, community: board, blockNumber: 1800 }, criteria)).toEqual({ ...base, community: board, blockNumber: 1800 });
  });

  it('flags a board switch in the same bucket so it is re-signed in the next one', () => {
    const previous = { ...base, community: board, blockNumber: 1800 };

    expect(nextDirectoryVoteRecord(previous, { ...base, community: other, blockNumber: 1800 }, criteria)).toEqual({
      ...base,
      community: other,
      blockNumber: 1800,
      resignNextBucket: true,
    });
    expect(nextDirectoryVoteRecord(previous, { ...base, community: other, blockNumber: 3600 }, criteria)).toEqual({ ...base, community: other, blockNumber: 3600 });
  });

  it('keeps a same-bucket withdrawal pending and drops a later-bucket withdrawal', () => {
    const previous = { ...base, community: board, blockNumber: 1800 };

    expect(nextDirectoryVoteRecord(previous, { ...base, community: undefined, blockNumber: 1800 }, criteria)).toEqual({
      ...base,
      community: undefined,
      blockNumber: 1800,
      resignNextBucket: true,
    });
    expect(nextDirectoryVoteRecord(previous, { ...base, community: undefined, blockNumber: 3600 }, criteria)).toBeUndefined();
  });

  it('ignores a previous ballot on an older manifest topic', () => {
    const previous = { ...base, topic: 'old-topic', community: board, blockNumber: 1800 };

    expect(nextDirectoryVoteRecord(previous, { ...base, community: undefined, blockNumber: 1800 }, criteria)).toBeUndefined();
  });
});

describe('useDirectoryVote submitBoard', () => {
  const requirements: DirectoryBoardRequirement[] = [{ type: 'pseudonymityMode', mode: 'per-reply' }, { type: 'pendingApproval' }];
  const voteTally = { state: 'joining', criteria: { ...criteria, bucketChainId: 84532 } } as VoteTallyState;

  const resolved = async (address: string) => ({ status: 'resolved', target: { name: address, publicKey: '12D3KooWNewBoard' } });

  const mount = async (getCommunity: (target: unknown) => Promise<unknown>, resolveBoard = resolved) => {
    testState.account = { pkc: { getCommunity: vi.fn(getCommunity) } };
    testState.resolveDirectoryBoard = resolveBoard;
    testState.publishDirectoryVote.mockReset();
    testState.publishDirectoryVote.mockResolvedValue({ status: 'published', topic: 'topic-a', blockNumber: 1800 });
    let state: DirectoryVoteState | undefined;
    const Harness = ({ tally }: { tally: VoteTallyState }) => {
      state = useDirectoryVote(tally);
      return null;
    };
    const root = createRoot(document.createElement('div'));
    await act(async () => root.render(createElement(Harness, { tally: voteTally })));
    return {
      submitBoard: () => state!.submitBoard('new-board.bso', requirements),
      switchDirectory: (tally: VoteTallyState) => act(async () => root.render(createElement(Harness, { tally }))),
      unmount: () => act(() => root.unmount()),
    };
  };

  const submit = async (getCommunity: (target: unknown) => Promise<unknown>) => {
    const { submitBoard, unmount } = await mount(getCommunity);
    let outcome: unknown;
    await act(async () => {
      outcome = await submitBoard();
    });
    unmount();
    return outcome;
  };

  it('votes for a board whose loaded record meets the requirements', async () => {
    const outcome = await submit(async () => ({ features: { pseudonymityMode: 'per-reply' }, challenges: [{ pendingApproval: true }] }));

    expect((testState.account as { pkc: { getCommunity: ReturnType<typeof vi.fn> } }).pkc.getCommunity).toHaveBeenCalledWith({
      name: 'new-board.bso',
      publicKey: '12D3KooWNewBoard',
      abortSignal: expect.any(AbortSignal),
    });
    expect(testState.publishDirectoryVote).toHaveBeenCalledTimes(1);
    expect(outcome).toEqual({ status: 'voted' });
  });

  it('rejects a board whose record misses a requirement without publishing a vote', async () => {
    const outcome = await submit(async () => ({ features: { pseudonymityMode: 'per-author' }, challenges: [{ pendingApproval: true }] }));

    expect(testState.publishDirectoryVote).not.toHaveBeenCalled();
    expect(outcome).toEqual({ status: 'board-ineligible', unmet: [{ type: 'pseudonymityMode', mode: 'per-reply' }] });
  });

  it('rejects a board whose record cannot be loaded without publishing a vote', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const outcome = await submit(async () => {
      throw new Error('ERR_GET_COMMUNITY_TIMED_OUT');
    });

    expect(testState.publishDirectoryVote).not.toHaveBeenCalled();
    expect(outcome).toEqual({ status: 'board-unreachable' });
    warn.mockRestore();
  });

  it('cancels the check without voting when the directory is left while the record loads', async () => {
    let resolveRecord: (record: unknown) => void = () => {};
    let abortSignal: AbortSignal | undefined;
    const { submitBoard, unmount } = await mount(
      (args) =>
        new Promise((resolve) => {
          abortSignal = (args as { abortSignal: AbortSignal }).abortSignal;
          resolveRecord = resolve;
        }),
    );

    const pending = submitBoard();
    await act(async () => {});
    unmount();
    expect(abortSignal?.aborted).toBe(true);
    resolveRecord({ features: { pseudonymityMode: 'per-reply' }, challenges: [{ pendingApproval: true }] });

    expect(await pending).toEqual({ status: 'cancelled' });
    expect(testState.publishDirectoryVote).not.toHaveBeenCalled();
  });

  it('cancels without checking or voting when the user moves to another directory while the board resolves', async () => {
    let finishResolving: () => void = () => {};
    const getCommunity = async () => ({ features: { pseudonymityMode: 'per-reply' }, challenges: [{ pendingApproval: true }] });
    const { submitBoard, switchDirectory, unmount } = await mount(
      getCommunity,
      (address) =>
        new Promise((resolve) => {
          finishResolving = () => resolve({ status: 'resolved', target: { name: address, publicKey: '12D3KooWNewBoard' } });
        }),
    );

    const pending = submitBoard();
    await switchDirectory({ state: 'joining', criteria: { ...criteria, contestId: '5chan-dir-pol-vote-test-1', bucketChainId: 84532 } } as VoteTallyState);
    finishResolving();

    expect(await pending).toEqual({ status: 'cancelled' });
    expect((testState.account as { pkc: { getCommunity: ReturnType<typeof vi.fn> } }).pkc.getCommunity).not.toHaveBeenCalled();
    expect(testState.publishDirectoryVote).not.toHaveBeenCalled();
    unmount();
  });
});
