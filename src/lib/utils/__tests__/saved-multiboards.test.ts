import { beforeEach, describe, expect, it, vi } from 'vitest';

const testState = vi.hoisted(() => ({
  account: { id: 'account-1', name: 'Account 1', multiboards: undefined as unknown },
  setAccountCalls: [] as Array<Record<string, unknown>>,
}));

vi.mock('@bitsocial/bitsocial-react-hooks', () => ({
  // Like the real setAccount, the stored account changes only once the write is done.
  setAccount: vi.fn(async (account: Record<string, unknown>) => {
    await new Promise((resolve) => setTimeout(resolve, 5));
    testState.setAccountCalls.push(account);
    testState.account = account as typeof testState.account;
  }),
}));

vi.mock('../../bitsocial-internals/stores', () => ({
  accountsStore: { getState: () => ({ accounts: { [testState.account.id]: testState.account }, activeAccountId: testState.account.id }) },
}));

import { getSavedMultiboards } from '../board-category-utils';
import { createMultiboard, deleteMultiboard, setMultiboardHasBoard, updateMultiboard } from '../saved-multiboards';

describe('saved multiboards', () => {
  beforeEach(() => {
    testState.account = { id: 'account-1', name: 'Account 1', multiboards: undefined };
    testState.setAccountCalls = [];
  });

  it('skips malformed entries in the account', () => {
    expect(getSavedMultiboards([{ id: 'tech', name: 'Tech', boards: ['g'] }, { id: '', name: 'x', boards: [] }, { name: 'No id' }, 'junk'])).toEqual([
      { id: 'tech', name: 'Tech', boards: ['g'] },
    ]);
    expect(getSavedMultiboards(undefined)).toEqual([]);
  });

  it('saves a multiboard under an id made from its name, unique in the account', async () => {
    expect(await createMultiboard('Tech & Science!', ['g', 'sci'])).toBe('tech-science');
    expect(await createMultiboard('Tech & Science', ['diy'])).toBe('tech-science-2');
    expect(await createMultiboard('技術', ['jp'])).toBe('multiboard');
    expect(testState.account.multiboards).toEqual([
      { id: 'tech-science', name: 'Tech & Science!', boards: ['g', 'sci'] },
      { id: 'tech-science-2', name: 'Tech & Science', boards: ['diy'] },
      { id: 'multiboard', name: '技術', boards: ['jp'] },
    ]);
    // The rest of the account is kept.
    expect(testState.account.name).toBe('Account 1');
  });

  it('applies quick changes one after another, so none is lost', async () => {
    testState.account.multiboards = [{ id: 'tech', name: 'Tech', boards: ['g'] }];

    await Promise.all([setMultiboardHasBoard('tech', 'sci', true), setMultiboardHasBoard('tech', 'diy', true), setMultiboardHasBoard('tech', 'g', false)]);

    expect(testState.account.multiboards).toEqual([{ id: 'tech', name: 'Tech', boards: ['sci', 'diy'] }]);
  });

  it('renames, changes boards and deletes', async () => {
    testState.account.multiboards = [
      { id: 'tech', name: 'Tech', boards: ['g'] },
      { id: 'art', name: 'Art', boards: ['ic'] },
    ];

    await updateMultiboard('tech', { name: 'Technology', boards: ['g', 'diy'] });
    await deleteMultiboard('art');

    expect(testState.account.multiboards).toEqual([{ id: 'tech', name: 'Technology', boards: ['g', 'diy'] }]);
  });
});
