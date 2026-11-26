import { webcrypto } from 'node:crypto';
import { SpamBlockerRateLimitError } from '../../lib/spam-blocker-errors';
import * as React from 'react';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import * as cborg from 'cborg';
import { ed25519 } from '@noble/curves/ed25519.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useChallengesStore from '../../stores/use-challenges-store';
import useSpamBlockerPrecheck, { type SpamBlockerPrecheckResult } from '../use-spam-blocker-precheck';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const act = (React as { act?: (cb: () => void | Promise<void>) => void | Promise<void> }).act as (cb: () => void | Promise<void>) => void | Promise<void>;

const testState = vi.hoisted(() => ({
  account: undefined as { author?: { address?: string; name?: string }; signer?: { privateKey?: string; address?: string } } | undefined,
  accountComments: [] as Array<{ cid?: string; parentCid?: string; timestamp?: number }>,
  accountCommentsLookups: [] as unknown[],
}));

vi.mock('@bitsocial/bitsocial-react-hooks', () => ({
  useAccount: () => testState.account,
  useAccountComments: (lookup: unknown) => {
    testState.accountCommentsLookups.push(lookup);
    return { accountComments: testState.accountComments };
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const SERVER_URL = 'https://spamblocker.example/api/v1';
const CHALLENGES = [
  { type: 'url/iframe', challenge: `${SERVER_URL}/precheck` },
  { type: 'url/iframe', challenge: `${SERVER_URL}/precheck` },
];

let container: HTMLDivElement;
let root: Root;
let runPrecheck: ReturnType<typeof useSpamBlockerPrecheck>;

const Harness = () => {
  runPrecheck = useSpamBlockerPrecheck({ communityAddress: 'music-posting.eth' });
  return null;
};

const start = (challenges: unknown = CHALLENGES) => runPrecheck({ challenges, publication: { content: 'checked post', displayName: 'anon' } });

const flush = async () => {
  for (let i = 0; i < 5; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
};

/** Signing loads its module first, which takes longer than a few microtasks on a slow runner. */
const waitForModal = () => vi.waitFor(() => expect(useChallengesStore.getState().challenges).toHaveLength(1), { timeout: 4000 });

/** The challenge entry the pre-check put in the modal store: [challenge message, publication]. */
const getModalEntry = () => {
  const entry = useChallengesStore.getState().challenges[0]?.challenge as unknown as
    | [{ challenges: Record<string, { type: string; challenge: string }> }, { content?: string; publishChallengeAnswers: (answers: unknown) => void }]
    | undefined;
  return entry;
};

describe('useSpamBlockerPrecheck', () => {
  beforeEach(async () => {
    const privateKey = ed25519.utils.randomSecretKey();
    testState.account = { author: { address: 'author.bso' }, signer: { privateKey: btoa(String.fromCharCode(...privateKey)) } };
    testState.accountComments = [];
    testState.accountCommentsLookups = [];
    useChallengesStore.setState({ challenges: [] });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(createElement(Harness));
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it('skips boards without a spam blocker that takes a pass', async () => {
    await expect(start([{ type: 'text/plain', challenge: 'What is 2+2?' }])).resolves.toEqual({ status: 'skipped' });
    expect(useChallengesStore.getState().challenges).toHaveLength(0);
  });

  it.each(['author.bso', '12D3KooW-unverified-author'])('defers challenge-based exemptions for %s without contacting the spam blocker', async (address) => {
    testState.account!.author!.address = address;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const challenges = [
      { type: 'text/plain', description: 'Match publication properties against regex patterns.' },
      { type: 'text/plain', description: 'Whitelist author addresses.' },
      { ...CHALLENGES[0], challenge: `${SERVER_URL}/precheck?blockTor=true`, exclude: [{ challenges: [0] }, { challenges: [1] }] },
    ];
    // Observe the result without waiting forever on the buggy modal path.
    let result: SpamBlockerPrecheckResult | undefined;
    void start(challenges).then((value) => (result = value));
    await vi.waitFor(() => expect(result).toEqual({ status: 'skipped' }));
    expect(useChallengesStore.getState().challenges).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows the pre-check in the challenge modal and returns the pass once the spam blocker completes it', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ completed: true, status: 'completed' })));
    vi.stubGlobal('fetch', fetchMock);

    let result: SpamBlockerPrecheckResult | undefined;
    void start().then((value) => (result = value));
    await waitForModal();

    const entry = getModalEntry();
    // Shaped like a pkc-js CHALLENGE, which the modal reads: challenges keyed by challenge index.
    expect(Array.isArray(entry?.[0].challenges)).toBe(false);
    const iframeChallenge = entry?.[0].challenges[0];
    expect(iframeChallenge?.type).toBe('url/iframe');
    const sessionId = iframeChallenge?.challenge.match(/\/iframe\/(precheck-[^/]+)\/precheck#payload=./)?.[1];
    expect(iframeChallenge?.challenge.startsWith(`${SERVER_URL}/iframe/`)).toBe(true);
    expect(sessionId).toBeTruthy();
    expect(entry?.[1].content).toBe('checked post');
    expect(fetchMock).not.toHaveBeenCalled();

    await act(async () => {
      entry?.[1].publishChallengeAnswers({ challengeAnswers: { 0: '' } });
    });
    await flush();

    expect(fetchMock).toHaveBeenCalledWith(`${SERVER_URL}/challenge/status/${sessionId}`, expect.anything());
    expect(result).toEqual({ status: 'passed', challengeAnswers: { 0: sessionId, 1: sessionId } });
  });

  it('does not require account identity on boards without a precheck', async () => {
    testState.account = undefined;
    await act(async () => {
      root.render(createElement(Harness));
    });
    expect(await start([{ type: 'text/plain', challenge: 'Question' }])).toEqual({ status: 'skipped' });
  });

  it('verifies named exemptions before showing a challenge or authorizing an upload', async () => {
    testState.account!.author!.name = 'alice.bso';
    const policy = { version: 1, rules: [{ challengeIndex: 0, type: 'verified-author-name-suffix', suffix: '.bso' }] };
    const challenges = [
      { type: 'text/plain' },
      {
        type: 'url/iframe',
        challenge: `${SERVER_URL}/precheck?blockTor=true&precheckExemptions=${encodeURIComponent(JSON.stringify(policy))}`,
        exclude: [{ challenges: [0] }],
      },
    ];
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ exempt: true })));
    vi.stubGlobal('fetch', fetchMock);
    const result = await start(challenges);
    expect(result.status).toBe('exempt');
    expect(result.status === 'exempt' && result.authorizeForgeUpload).toBeTypeOf('function');
    expect(fetchMock).toHaveBeenCalledWith(`${SERVER_URL}/precheck/exemption`, expect.objectContaining({ method: 'POST' }));
    expect(useChallengesStore.getState().challenges).toHaveLength(0);
    expect('challengeAnswers' in result).toBe(false);
  });

  it.each(['Tor', 'Vpn', 'Proxy', 'Datacenter'])('keeps a non-exempt %s account stopped with the server category message', async (category) => {
    const policy = { version: 1, rules: [{ challengeIndex: 0, type: 'verified-author-name-suffix', suffix: '.bso' }] };
    const challenges = [
      { type: 'text/plain' },
      {
        type: 'url/iframe',
        challenge: `${SERVER_URL}/precheck?block${category}=true&precheckExemptions=${encodeURIComponent(JSON.stringify(policy))}`,
        exclude: [{ challenges: [0] }],
      },
    ];
    const message = `This community restricts posting through ${category.toLowerCase()} connections.`;
    const fetchMock = vi.fn(
      async (url: string) => new Response(JSON.stringify(url.endsWith('/exemption') ? { exempt: false } : { status: 'failed', outcome: { message } })),
    );
    vi.stubGlobal('fetch', fetchMock);
    const resultPromise = start(challenges);
    await waitForModal();
    expect(fetchMock).toHaveBeenCalledWith(`${SERVER_URL}/precheck/exemption`, expect.anything());
    await act(async () => {
      getModalEntry()?.[1].publishChallengeAnswers({ challengeAnswers: { 0: '' } });
    });
    await expect(resultPromise).resolves.toEqual({ status: 'stopped', message });
    expect(fetchMock.mock.calls.every(([url]) => !url.includes('/upload/'))).toBe(true);
  });

  it.each(['moderator', 'whitelist', '.bso'])('requires server verification for a %s exemption under the combined connection policy', async (exemption) => {
    testState.account!.author = { address: 'signer-address', ...(exemption === '.bso' ? { name: 'alice.bso' } : {}) };
    testState.account!.signer!.address = 'signer-address';
    const policy = { version: 1, rules: [{ challengeIndex: 0, type: 'verified-author-name-suffix', suffix: '.bso' }] };
    const challenges = [
      { type: 'text/plain' },
      {
        type: 'url/iframe',
        challenge: `${SERVER_URL}/precheck?blockTor=true&blockVpn=true&blockProxy=true&blockDatacenter=true&precheckExemptions=${encodeURIComponent(JSON.stringify(policy))}`,
        exclude: [{ challenges: [0] }, { roles: ['moderator'] }],
      },
    ];
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ exempt: true })));
    vi.stubGlobal('fetch', fetchMock);
    const result = await runPrecheck({ challenges, authorRole: exemption === 'moderator' ? 'moderator' : undefined, publication: { content: 'checked post' } });
    expect(fetchMock).toHaveBeenCalledWith(`${SERVER_URL}/precheck/exemption`, expect.objectContaining({ method: 'POST' }));
    expect(result.status).toBe('exempt');
    expect(result.status === 'exempt' && result.authorizeForgeUpload).toBeTypeOf('function');
    expect(useChallengesStore.getState().challenges).toHaveLength(0);
    expect('challengeAnswers' in result).toBe(false);
  });

  it('shows the known exemption-check retry time and stays stopped when the notice closes', async () => {
    const retryAt = Math.floor(Date.now() / 1000) + 60;
    const policy = { version: 1, rules: [{ challengeIndex: 0, type: 'verified-author-name-suffix', suffix: '.bso' }] };
    const challenges = [
      { type: 'text/plain' },
      { type: 'url/iframe', challenge: `${SERVER_URL}/precheck?blockVpn=true&precheckExemptions=${encodeURIComponent(JSON.stringify(policy))}` },
    ];
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ message: 'Too many checks', retryAt }), { status: 429 }));
    vi.stubGlobal('fetch', fetchMock);
    const resultPromise = start(challenges);
    await waitForModal();
    expect(getModalEntry()?.[0].challenges[0].challenge).toBe(`${SERVER_URL}/iframe/rate-limit?retryAt=${retryAt}`);
    await act(async () => {
      getModalEntry()?.[1].publishChallengeAnswers({ challengeAnswers: { 0: '' } });
    });
    await expect(resultPromise).resolves.toEqual({ status: 'stopped' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps a rate limit without a known expiry as a static error, without inventing a countdown', async () => {
    const policy = { version: 1, rules: [{ challengeIndex: 0, type: 'verified-author-name-suffix', suffix: '.bso' }] };
    const challenges = [
      { type: 'text/plain' },
      { type: 'url/iframe', challenge: `${SERVER_URL}/precheck?precheckExemptions=${encodeURIComponent(JSON.stringify(policy))}` },
    ];
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ message: 'Too many checks. Try again later.' }), { status: 429 })),
    );
    await expect(start(challenges)).resolves.toEqual({ status: 'stopped', message: 'Too many checks. Try again later.' });
    expect(useChallengesStore.getState().challenges).toHaveLength(0);
  });

  it('shows the upload-authorization countdown without minting proof or automatically retrying on close', async () => {
    vi.stubGlobal('crypto', webcrypto);
    const retryAt = Math.floor(Date.now() / 1000) + 60;
    const policy = { version: 1, rules: [{ challengeIndex: 0, type: 'verified-author-name-suffix', suffix: '.bso' }] };
    const challenges = [
      { type: 'text/plain' },
      { type: 'url/iframe', challenge: `${SERVER_URL}/precheck?precheckExemptions=${encodeURIComponent(JSON.stringify(policy))}` },
    ];
    const fetchMock = vi.fn(
      async (url: string) =>
        new Response(JSON.stringify(url.endsWith('/exemption') ? { exempt: true } : { message: 'Too many uploads', retryAt }), {
          status: url.endsWith('/exemption') ? 200 : 429,
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const result = await start(challenges);
    expect(result.status).toBe('exempt');
    if (result.status !== 'exempt') throw new Error('Expected verified exemption');
    const file = { size: 1, type: 'image/png', arrayBuffer: async () => new Uint8Array([1]).buffer } as File;
    const authorization = result.authorizeForgeUpload(file).catch((error: unknown) => error);
    await waitForModal();
    expect(getModalEntry()?.[0].challenges[0].challenge).toBe(`${SERVER_URL}/iframe/rate-limit?retryAt=${retryAt}`);
    await act(async () => {
      getModalEntry()?.[1].publishChallengeAnswers({ challengeAnswers: { 0: '' } });
    });
    const error = await authorization;
    expect(error).toBeInstanceOf(SpamBlockerRateLimitError);
    expect((error as SpamBlockerRateLimitError).noticeShown).toBe(true);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([`${SERVER_URL}/precheck/exemption`, `${SERVER_URL}/upload/authorize`]);
  });

  it('sends legacy .bso account names separately from their signer address', async () => {
    testState.account!.author = { address: 'legacy.bso' };
    testState.account!.signer!.address = 'signer-address';
    const policy = { version: 1, rules: [{ challengeIndex: 0, type: 'verified-author-name-suffix', suffix: '.bso' }] };
    const challenges = [
      { type: 'text/plain' },
      { type: 'url/iframe', challenge: `${SERVER_URL}/precheck?precheckExemptions=${encodeURIComponent(JSON.stringify(policy))}`, exclude: [{ challenges: [0] }] },
    ];
    const fetchMock = vi.fn(async (_url: string, request: RequestInit) => {
      const payload = cborg.decode(new Uint8Array(request.body as ArrayBuffer));
      expect(payload.publication.author).toMatchObject({ address: 'signer-address', name: 'legacy.bso' });
      return new Response(JSON.stringify({ exempt: true }));
    });
    vi.stubGlobal('fetch', fetchMock);
    expect((await start(challenges)).status).toBe('exempt');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('stops uploads if exemption verification is unavailable', async () => {
    const policy = { version: 1, rules: [{ challengeIndex: 0, type: 'verified-author-name-suffix', suffix: '.bso' }] };
    const challenges = [
      { type: 'text/plain' },
      { type: 'url/iframe', challenge: `${SERVER_URL}/precheck?precheckExemptions=${encodeURIComponent(JSON.stringify(policy))}`, exclude: [{ challenges: [0] }] },
    ];
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ code: 'unavailable', message: 'Unable to verify posting exemptions. Try again later.' }), { status: 503 })),
    );
    const result = await start(challenges);
    expect(result).toEqual({ status: 'stopped', message: 'Could not verify posting exemptions (503). Try again.' });
    expect(useChallengesStore.getState().challenges).toHaveLength(0);
  });

  it.each([
    ['cannot be reached', async () => Promise.reject(new TypeError('Failed to fetch'))],
    ['answers with a page that is not its own', async () => new Response('<html>error code: 1033</html>', { status: 530 })],
  ])('says the spam blocker is unreachable when it %s, before any upload', async (_name, implementation) => {
    testState.account!.author!.name = 'alice.bso';
    const policy = { version: 1, rules: [{ challengeIndex: 0, type: 'verified-author-name-suffix', suffix: '.bso' }] };
    const challenges = [
      { type: 'text/plain' },
      { type: 'url/iframe', challenge: `${SERVER_URL}/precheck?precheckExemptions=${encodeURIComponent(JSON.stringify(policy))}`, exclude: [{ challenges: [0] }] },
    ];
    const fetchMock = vi.fn<(url: string) => Promise<Response>>(implementation);
    vi.stubGlobal('fetch', fetchMock);
    const result = await start(challenges);
    expect(result).toEqual({ status: 'stopped', message: 'spam_blocker_unreachable_upload' });
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([`${SERVER_URL}/precheck/exemption`]);
    expect(useChallengesStore.getState().challenges).toHaveLength(0);
  });

  it('stops with the rejection when the spam blocker failed the pre-check', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ status: 'failed', outcome: { message: 'You are blocked from posting' } }))),
    );

    const resultPromise = start();
    await waitForModal();
    await act(async () => {
      getModalEntry()?.[1].publishChallengeAnswers({ challengeAnswers: { 0: '' } });
    });

    await expect(resultPromise).resolves.toEqual({ status: 'stopped', message: 'You are blocked from posting' });
  });

  it('stops uploads when the outcome cannot be read', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))),
    );

    const resultPromise = start();
    await waitForModal();
    await act(async () => {
      getModalEntry()?.[1].publishChallengeAnswers({ challengeAnswers: { 0: '' } });
    });

    await expect(resultPromise).resolves.toEqual({ status: 'stopped', message: 'spam_check_not_finished' });
  });

  it('pre-checks past a question challenge and pre-answers only the spam blocker, under its challenge index', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ status: 'completed' }))),
    );

    const resultPromise = runPrecheck({
      challenges: [{ type: 'text/plain', challenge: 'What is 2+2?' }, CHALLENGES[0]],
      publication: { content: 'post on a board that asks a question' },
    });
    await waitForModal();
    await act(async () => {
      getModalEntry()?.[1].publishChallengeAnswers({ challengeAnswers: { 0: '' } });
    });

    const result = await resultPromise;
    expect(result.status).toBe('passed');
    if (result.status !== 'passed') return;
    expect(Object.keys(result.challengeAnswers)).toEqual(['1']);
    expect(result.challengeAnswers[1]).toMatch(/^precheck-/);
  });

  it('skips a moderator whom the board excludes from its spam blocker', async () => {
    const challenges = [{ ...CHALLENGES[0], exclude: [{ roles: ['moderator', 'admin', 'owner'] }] }];
    await expect(runPrecheck({ authorRole: 'moderator', challenges, publication: {} })).resolves.toEqual({ status: 'skipped' });
    expect(useChallengesStore.getState().challenges).toHaveLength(0);
  });

  it('says the check did not finish when the author confirmed it early', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ status: 'pending' }))),
    );

    const resultPromise = start();
    await waitForModal();
    await act(async () => {
      getModalEntry()?.[1].publishChallengeAnswers({ challengeAnswers: { 0: '' } });
    });

    await expect(resultPromise).resolves.toEqual({ status: 'stopped', message: 'spam_check_not_finished' });
  });

  it('skips an author whose comments on the board earn the karma its spam blocker exempts', async () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    testState.accountComments = Array.from({ length: 10 }, (_, index) => ({ cid: `post-${index}`, timestamp: nowSeconds - 700_000 - index }));
    const challenges = [{ ...CHALLENGES[0], exclude: [{ postCount: 10, firstCommentTimestamp: 604800, rateLimit: 3, rateLimitChallengeSuccess: true }] }];
    await act(async () => {
      root.render(createElement(Harness));
    });

    await expect(runPrecheck({ challenges, publication: { content: 'trusted post' } })).resolves.toEqual({ status: 'skipped' });
    expect(testState.accountCommentsLookups.at(-1)).toEqual({ communityAddress: 'music-posting.eth' });
    expect(useChallengesStore.getState().challenges).toHaveLength(0);
  });

  it('stops without asking the server when the user closes the pre-check', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const resultPromise = start();
    await waitForModal();
    await act(async () => {
      await useChallengesStore.getState().abandonCurrentChallenge();
    });

    await expect(resultPromise).resolves.toEqual({ status: 'stopped' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
