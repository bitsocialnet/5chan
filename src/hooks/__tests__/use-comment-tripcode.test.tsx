import * as React from 'react';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const act = (React as { act?: (cb: () => void | Promise<void>) => void | Promise<void> }).act as (cb: () => void | Promise<void>) => void | Promise<void>;

const testState = vi.hoisted(() => ({ failedLoads: 0, failLoads: 0 }));

// The verifier chunk fails to download as many times as failLoads says, then loads.
vi.mock('../../lib/tripcode-crypto', async (importOriginal) => {
  if (testState.failedLoads < testState.failLoads) {
    testState.failedLoads++;
    throw new TypeError('Failed to fetch dynamically imported module: https://5chan.app/assets/tripcode-crypto.js');
  }
  return importOriginal();
});

type TripcodeCrypto = typeof import('../../lib/tripcode-crypto');

const BOARD_KEY = '12D3KooWBoardPublicKeyForTripcodeTests';
const fields = { communityPublicKey: BOARD_KEY, timestamp: 1_800_000_000, title: 'Thread', content: 'Body' };

let container: HTMLDivElement;
let root: Root;

describe('useCommentTripcode', () => {
  beforeEach(() => {
    vi.resetModules();
    testState.failedLoads = 0;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  it('offers a reload when the verifier fails to download, and shows the trips once a later post loads it', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    testState.failLoads = 1;
    const { createTripcodeDisplayName, getVerifiedTrip } = await vi.importActual<TripcodeCrypto>('../../lib/tripcode-crypto');
    const { parseTripcodeProof } = await import('../../lib/utils/tripcode-utils');
    const { default: PosterTrip, TripcodeVerifierImportError } = await import('../../components/poster-trip');
    const displayName = await createTripcodeDisplayName({ name: 'Anon', secret: { normal: 'hunter2' }, fields });
    const trip = getVerifiedTrip(parseTripcodeProof(displayName)!, fields) as string;
    const post = (cid: string) => createElement(PosterTrip, { key: cid, comment: { ...fields, cid, communityAddress: 'board.bso', author: { displayName } } });

    await act(async () => {
      root.render([createElement(TripcodeVerifierImportError, { key: 'error' }), post('QmFirst')]);
    });
    await vi.waitFor(async () => {
      await act(async () => {});
      expect(container.querySelector('[role="alert"]')).not.toBeNull();
    });
    expect(warn.mock.calls.filter(([message]) => message === 'Failed to load the tripcode verifier')).toHaveLength(1);
    expect(container.textContent).not.toContain(trip);

    // A post that mounts later loads the verifier again.
    await act(async () => {
      root.render([createElement(TripcodeVerifierImportError, { key: 'error' }), post('QmFirst'), post('QmSecond')]);
    });
    await vi.waitFor(async () => {
      await act(async () => {});
      expect(container.querySelectorAll('span')).toHaveLength(2);
    });
    expect([...container.querySelectorAll('span')].map((span) => span.textContent)).toEqual([trip, trip]);
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(testState.failedLoads).toBe(1);
  });
});
