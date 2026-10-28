import * as React from 'react';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import * as ed from '@noble/ed25519';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useChallengesStore from '../../stores/use-challenges-store';
import useSpamBlockerPrecheck, { type SpamBlockerPrecheckResult } from '../use-spam-blocker-precheck';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const act = (React as { act?: (cb: () => void | Promise<void>) => void | Promise<void> }).act as (cb: () => void | Promise<void>) => void | Promise<void>;

const testState = vi.hoisted(() => ({
  account: undefined as { author?: { address?: string }; signer?: { privateKey?: string } } | undefined,
}));

vi.mock('@bitsocial/bitsocial-react-hooks', () => ({
  useAccount: () => testState.account,
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
  runPrecheck = useSpamBlockerPrecheck();
  return null;
};

const start = (challenges: unknown = CHALLENGES) =>
  runPrecheck({ challenges, communityAddress: 'music-posting.eth', publication: { content: 'checked post', displayName: 'anon' } });

const flush = async () => {
  for (let i = 0; i < 5; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
};

/** The challenge entry the pre-check put in the modal store: [challenge message, publication]. */
const getModalEntry = () => {
  const entry = useChallengesStore.getState().challenges[0]?.challenge as unknown as
    | [{ challenges: Array<{ type: string; challenge: string }> }, { content?: string; publishChallengeAnswers: (answers: unknown) => void }]
    | undefined;
  return entry;
};

describe('useSpamBlockerPrecheck', () => {
  beforeEach(async () => {
    const privateKey = ed.utils.randomPrivateKey();
    testState.account = { author: { address: 'author.bso' }, signer: { privateKey: btoa(String.fromCharCode(...privateKey)) } };
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

  it('shows the pre-check in the challenge modal and returns the pass once the spam blocker completes it', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ completed: true, status: 'completed' })));
    vi.stubGlobal('fetch', fetchMock);

    let result: SpamBlockerPrecheckResult | undefined;
    void start().then((value) => (result = value));
    await flush();

    const entry = getModalEntry();
    const iframeChallenge = entry?.[0].challenges[0];
    expect(iframeChallenge?.type).toBe('url/iframe');
    const sessionId = iframeChallenge?.challenge.match(/\/iframe\/(precheck-[^/]+)\/precheck#payload=./)?.[1];
    expect(iframeChallenge?.challenge.startsWith(`${SERVER_URL}/iframe/`)).toBe(true);
    expect(sessionId).toBeTruthy();
    expect(entry?.[1].content).toBe('checked post');
    expect(fetchMock).not.toHaveBeenCalled();

    await act(async () => {
      entry?.[1].publishChallengeAnswers({ challengeAnswers: [''] });
    });
    await flush();

    expect(fetchMock).toHaveBeenCalledWith(`${SERVER_URL}/challenge/status/${sessionId}`, expect.anything());
    expect(result).toEqual({ status: 'passed', challengeAnswers: [sessionId, sessionId] });
  });

  it('stops with the rejection when the spam blocker failed the pre-check', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ status: 'failed', outcome: { message: 'You are blocked from posting' } }))),
    );

    const resultPromise = start();
    await flush();
    await act(async () => {
      getModalEntry()?.[1].publishChallengeAnswers({ challengeAnswers: [''] });
    });

    await expect(resultPromise).resolves.toEqual({ status: 'stopped', message: 'You are blocked from posting' });
  });

  it('falls back to the board checking the post when the outcome cannot be read', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))),
    );

    const resultPromise = start();
    await flush();
    await act(async () => {
      getModalEntry()?.[1].publishChallengeAnswers({ challengeAnswers: [''] });
    });

    await expect(resultPromise).resolves.toEqual({ status: 'skipped' });
  });

  it("keeps the post's other answers next to the pass", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ status: 'completed' }))),
    );

    const resultPromise = runPrecheck({
      challenges: [CHALLENGES[0]],
      communityAddress: 'music-posting.eth',
      otherAnswers: ['bitsocial-flags:5chan:flag:country:auto'],
      publication: { content: 'flagged post' },
    });
    await flush();
    await act(async () => {
      getModalEntry()?.[1].publishChallengeAnswers({ challengeAnswers: [''] });
    });

    const result = await resultPromise;
    expect(result.status === 'passed' && result.challengeAnswers[1]).toBe('bitsocial-flags:5chan:flag:country:auto');
    expect(result.status === 'passed' && result.challengeAnswers[0]).toMatch(/^precheck-/);
  });

  it('skips a moderator whom the board excludes from its spam blocker', async () => {
    const challenges = [{ ...CHALLENGES[0], exclude: [{ roles: ['moderator', 'admin', 'owner'] }] }];
    await expect(runPrecheck({ authorRole: 'moderator', challenges, communityAddress: 'music-posting.eth', publication: {} })).resolves.toEqual({ status: 'skipped' });
    expect(useChallengesStore.getState().challenges).toHaveLength(0);
  });

  it('stops without asking the server when the user closes the pre-check', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const resultPromise = start();
    await flush();
    await act(async () => {
      await useChallengesStore.getState().abandonCurrentChallenge();
    });

    await expect(resultPromise).resolves.toEqual({ status: 'stopped' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
