import * as React from 'react';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyCommunityWordfilters } from '../../lib/bitsocial-internals/utils';
import { createTripcodePublishOptions, getVerifiedTrip } from '../../lib/tripcode-crypto';
import { parseTripcodeProof } from '../../lib/utils/tripcode-utils';
import useTripcodeRepublish from '../use-tripcode-republish';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const act = (React as { act?: (cb: () => void | Promise<void>) => void | Promise<void> }).act as (cb: () => void | Promise<void>) => void | Promise<void>;

const BOARD_KEY = '12D3KooWBoardPublicKeyForTripcodeTests';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('../../lib/bitsocial-internals/stores', () => ({
  communitiesStore: { getState: () => ({ communities: { 'board.bso': { address: 'board.bso', publicKey: '12D3KooWBoardPublicKeyForTripcodeTests' } } }) },
}));

const secret = { normal: 'hunter2' };
const postOptions = { communityAddress: 'board.bso', title: 'subject', content: 'body', link: 'https://example.com/a.png' };

const verify = (options: { author?: { displayName?: string }; timestamp?: number }) => {
  const proof = parseTripcodeProof(options.author?.displayName);
  return proof
    ? getVerifiedTrip(proof, {
        communityPublicKey: BOARD_KEY,
        timestamp: options.timestamp as number,
        title: 'subject',
        content: 'body',
        link: 'https://example.com/a.png',
      })
    : undefined;
};

/** The options a tripcode post is first published with, as the post form signs them. */
const signFirstPublish = async () => {
  const signed = await createTripcodePublishOptions({
    publishOptions: { ...postOptions, author: { displayName: 'Anon' } },
    secret,
    community: { publicKey: BOARD_KEY },
    applyWordfilters: applyCommunityWordfilters,
  });
  return { ...postOptions, author: { displayName: signed.displayName }, timestamp: signed.timestamp };
};

let container: HTMLDivElement;
let root: Root;
let tripcodeRepublish: ReturnType<typeof useTripcodeRepublish>;

const HookHarness = () => {
  tripcodeRepublish = useTripcodeRepublish();
  return null;
};

describe('useTripcodeRepublish', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(1_800_000_000_000);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root.render(createElement(HookHarness)));
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('signs the proof again over each republish timestamp, keeping the trip', async () => {
    const published = await signFirstPublish();
    const trip = verify(published);
    expect(trip).toBeDefined();
    tripcodeRepublish.keepTripcode({ displayName: published.author.displayName, secret, name: 'Anon' });

    // The hooks republish a minute later, which the first proof does not sign.
    vi.setSystemTime(1_800_000_060_000);
    expect(verify({ ...published, timestamp: 1_800_000_060 })).toBeUndefined();
    const republished = await tripcodeRepublish.onBeforeRepublish({ ...published, timestamp: 1_800_000_060 });
    expect(republished).toMatchObject({ ...postOptions, timestamp: 1_800_000_060 });
    expect(republished.author.displayName).not.toBe(published.author.displayName);
    expect(verify(republished)).toBe(trip);

    // A second wrong answer republishes the republished options.
    vi.setSystemTime(1_800_000_120_000);
    const republishedAgain = await tripcodeRepublish.onBeforeRepublish({ ...republished, timestamp: 1_800_000_120 });
    expect(republishedAgain.timestamp).toBe(1_800_000_120);
    expect(verify(republishedAgain)).toBe(trip);
  });

  it('leaves a post alone once its publish ended, or when it has no kept tripcode', async () => {
    const published = await signFirstPublish();
    const unknown = { ...published, timestamp: 1_800_000_060 };
    await expect(tripcodeRepublish.onBeforeRepublish(unknown)).resolves.toBe(unknown);

    tripcodeRepublish.keepTripcode({ displayName: published.author.displayName, secret, name: 'Anon' });
    tripcodeRepublish.forgetTripcode();
    await expect(tripcodeRepublish.onBeforeRepublish(unknown)).resolves.toBe(unknown);
  });

  it("keeps only the latest post's password, and never signs an earlier post with it", async () => {
    const earlier = await signFirstPublish();
    vi.setSystemTime(1_800_000_010_000);
    const latest = await signFirstPublish();
    tripcodeRepublish.keepTripcode({ displayName: earlier.author.displayName, secret, name: 'Anon' });
    tripcodeRepublish.keepTripcode({ displayName: latest.author.displayName, secret: { normal: 'other' }, name: 'Anon' });

    vi.setSystemTime(1_800_000_060_000);
    const earlierRepublish = { ...earlier, timestamp: 1_800_000_060 };
    await expect(tripcodeRepublish.onBeforeRepublish(earlierRepublish)).resolves.toBe(earlierRepublish);
    const latestRepublished = await tripcodeRepublish.onBeforeRepublish({ ...latest, timestamp: 1_800_000_060 });
    expect(latestRepublished.author.displayName).not.toBe(latest.author.displayName);
  });

  it('rejects, rather than republishing the old proof, when the proof cannot be signed again', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const published = await signFirstPublish();
    // A board the client no longer has loaded cannot be signed for.
    const options = { ...published, communityAddress: 'gone.bso', timestamp: 1_800_000_060 };
    tripcodeRepublish.keepTripcode({ displayName: published.author.displayName, secret, name: 'Anon' });

    await expect(tripcodeRepublish.onBeforeRepublish(options)).rejects.toThrow('error: tripcode_sign_failed');
    // The failed publish ends there, and its password is not kept.
    await expect(tripcodeRepublish.onBeforeRepublish(options)).resolves.toBe(options);
  });
});
