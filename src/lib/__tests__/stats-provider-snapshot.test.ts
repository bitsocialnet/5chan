import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearStatsProviderRequestsForTest,
  getProviderPopularPosts,
  getStatsProviderSnapshot,
  parseStatsProviderSnapshot,
  type ProviderThreadPayload,
} from '../stats-provider-snapshot';

vi.mock('../stats-providers', () => ({
  STATS_PROVIDERS: [
    { apiUrl: 'https://first.example', id: 'first', name: 'first.example', siteUrl: 'https://first.example' },
    { apiUrl: 'https://second.example/', id: 'second', name: 'second.example', siteUrl: 'https://second.example' },
  ],
}));

const NOW = 1_800_000_000;

const createThread = (cid: string, replyCount: number, overrides: Record<string, unknown> = {}): ProviderThreadPayload => ({
  cid,
  raw: {
    comment: { content: `${cid} content`, link: `https://cdn.example/${cid}.jpg`, timestamp: NOW - 3600, title: `${cid} title`, ...overrides },
    commentUpdate: { cid, lastReplyTimestamp: NOW - 60, replyCount },
  },
});

const createSnapshotResponse = (boards: unknown[]) => ({ version: 1, generatedAt: NOW, boards });

const boardRefs = (...addresses: string[]) => addresses.map((address) => ({ address, publicKey: `${address}-key` }));

const httpStatus = (status: number) => ({ httpStatus: status });

const mockFetchResponses = (...responses: Array<unknown | Error>) => {
  const fetchMock = vi.fn();
  for (const response of responses) {
    if (response instanceof Error) {
      fetchMock.mockRejectedValueOnce(response);
    } else if (response && typeof response === 'object' && 'httpStatus' in response) {
      fetchMock.mockResolvedValueOnce({ ok: false, status: response.httpStatus, json: async () => ({}) });
    } else {
      fetchMock.mockResolvedValueOnce({ ok: true, json: async () => response });
    }
  }
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

describe('stats provider snapshot', () => {
  beforeEach(() => {
    clearStatsProviderRequestsForTest();
    vi.useFakeTimers({ now: NOW * 1000, toFake: ['Date'] });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('drops malformed boards and threads but keeps the rest of the snapshot', () => {
    const snapshot = parseStatsProviderSnapshot(
      createSnapshotResponse([
        { address: 'music.bso', stats: { allPostCount: 4, allReplyCount: 6, weekActiveUserCount: 2 }, threads: [createThread('a', 1), { cid: 'no-raw' }] },
        { address: 'not a board address', stats: null, threads: [] },
        { address: 'tech.bso', stats: { allPostCount: -1 }, threads: 'nope' },
        'not a board',
      ]),
      'first',
    );

    expect(snapshot?.providerId).toBe('first');
    expect([...(snapshot?.boards.keys() ?? [])]).toEqual(['music.bso', 'tech.bso']);
    expect(snapshot?.boards.get('music.bso')).toEqual({ stats: { allPostCount: 4, allReplyCount: 6, weekActiveUserCount: 2 }, threads: [createThread('a', 1)] });
    expect(snapshot?.boards.get('tech.bso')).toEqual({ stats: null, threads: [] });
  });

  it('rejects a response that is not a version 1 snapshot', () => {
    expect(parseStatsProviderSnapshot({ version: 2, generatedAt: NOW, boards: [] }, 'first')).toBeNull();
    expect(parseStatsProviderSnapshot({ version: 1, boards: [] }, 'first')).toBeNull();
    expect(parseStatsProviderSnapshot(null, 'first')).toBeNull();
  });

  it('fails over to the next provider and requests the snapshot once per page load', async () => {
    const fetchMock = mockFetchResponses(new Error('offline'), createSnapshotResponse([{ address: 'music.bso', stats: null, threads: [] }]));

    const snapshot = await getStatsProviderSnapshot();
    await getStatsProviderSnapshot();

    expect(snapshot?.providerId).toBe('second');
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual(['https://first.example/api/v1/5chan/boards', 'https://second.example/api/v1/5chan/boards']);
  });

  it('skips a provider that answers with an error status or an outdated snapshot', async () => {
    mockFetchResponses(httpStatus(502), { ...createSnapshotResponse([]), generatedAt: NOW - 2 * 3600 });

    await expect(getStatsProviderSnapshot()).resolves.toBeNull();
  });

  it('resolves to null when no provider answers, so the boxes fall back to P2P', async () => {
    mockFetchResponses(new Error('offline'), { version: 1 });

    await expect(getStatsProviderSnapshot()).resolves.toBeNull();
  });

  it('shows only threads that pass verification, one per board, most popular first', async () => {
    const snapshot = parseStatsProviderSnapshot(
      createSnapshotResponse([
        { address: 'music.bso', stats: null, threads: [createThread('music-top', 30), createThread('music-second', 20)] },
        { address: 'tech.bso', stats: null, threads: [createThread('tech-top', 50)] },
        { address: 'forged.bso', stats: null, threads: [createThread('forged-top', 90)] },
        { address: 'pinned.bso', stats: null, threads: [createThread('pinned-top', 80, { pinned: true })] },
      ]),
      'first',
    )!;
    const verifyThread = vi.fn(async (thread: ProviderThreadPayload) => thread.cid !== 'forged-top');

    const posts = await getProviderPopularPosts(snapshot, boardRefs('music.bso', 'tech.bso', 'forged.bso', 'pinned.bso'), verifyThread);

    expect(posts.map((post) => post.cid)).toEqual(['tech-top', 'music-top']);
    expect(posts[0]).toMatchObject({ communityAddress: 'tech.bso', postCid: 'tech-top', replyCount: 50, title: 'tech-top title' });
    expect(verifyThread).toHaveBeenCalledWith(createThread('tech-top', 50), { address: 'tech.bso', publicKey: 'tech.bso-key' });
  });

  it('applies the author edit the way a board page does', async () => {
    const edited = createThread('edited', 20);
    edited.raw.commentUpdate.edit = { content: 'edited content', spoiler: true };
    const authorDeleted = createThread('author-deleted', 90);
    authorDeleted.raw.commentUpdate.edit = { deleted: true };
    const snapshot = parseStatsProviderSnapshot(
      createSnapshotResponse([
        { address: 'music.bso', stats: null, threads: [edited] },
        { address: 'tech.bso', stats: null, threads: [authorDeleted] },
      ]),
      'first',
    )!;

    const posts = await getProviderPopularPosts(snapshot, boardRefs('music.bso', 'tech.bso'), async () => true);

    expect(posts.map((post) => post.cid)).toEqual(['edited']);
    expect(posts[0]).toMatchObject({ content: 'edited content', spoiler: true, title: 'edited title' });
  });

  it('treats a verifier error as a failed verification', async () => {
    const snapshot = parseStatsProviderSnapshot(createSnapshotResponse([{ address: 'music.bso', stats: null, threads: [createThread('music-top', 3)] }]), 'first')!;

    await expect(getProviderPopularPosts(snapshot, boardRefs('music.bso'), () => Promise.reject(new Error('no account')))).resolves.toEqual([]);
  });
});
