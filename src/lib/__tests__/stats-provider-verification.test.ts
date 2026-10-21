import { beforeEach, describe, expect, it, vi } from 'vitest';
import { validateComment } from '@bitsocial/bitsocial-react-hooks';
import { verifyProviderThread } from '../stats-provider-verification';

vi.mock('@bitsocial/bitsocial-react-hooks', () => ({
  validateComment: vi.fn(),
}));

const thread = {
  cid: 'thread-cid',
  raw: {
    comment: { communityPublicKey: 'board-key', content: 'content', depth: 0 },
    commentUpdate: { cid: 'thread-cid', replyCount: 3 },
  },
};

describe('verifyProviderThread', () => {
  beforeEach(() => {
    vi.mocked(validateComment).mockReset();
  });

  it('accepts a thread the hooks validation accepts on the board 5chan expects', async () => {
    vi.mocked(validateComment).mockResolvedValue({ valid: true });

    await expect(verifyProviderThread(thread, { address: 'board.bso', publicKey: 'board-key' })).resolves.toBe(true);
    expect(validateComment).toHaveBeenCalledWith(thread, { validateReplies: false });
  });

  it('rejects a thread the hooks validation rejects', async () => {
    vi.mocked(validateComment).mockResolvedValue({ valid: false, reason: 'comment.raw.comment hashes to another cid' });

    await expect(verifyProviderThread(thread, { address: 'board.bso', publicKey: 'board-key' })).resolves.toBe(false);
  });

  it('rejects a reply listed as a thread without validating it', async () => {
    const reply = { ...thread, raw: { ...thread.raw, comment: { ...thread.raw.comment, depth: 1 } } };

    await expect(verifyProviderThread(reply, { address: 'board.bso', publicKey: 'board-key' })).resolves.toBe(false);
    expect(validateComment).not.toHaveBeenCalled();
  });

  it('rejects a thread listed under a board it does not belong to without validating it', async () => {
    await expect(verifyProviderThread(thread, { address: 'other.bso', publicKey: 'other-key' })).resolves.toBe(false);
    await expect(verifyProviderThread(thread, { address: 'unknown.bso', publicKey: undefined })).resolves.toBe(false);
    expect(validateComment).not.toHaveBeenCalled();
  });
});
