import * as React from 'react';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTripcodeDisplayName, getVerifiedTrip } from '../../../lib/tripcode-crypto';
import { parseTripcodeProof } from '../../../lib/utils/tripcode-utils';
import PosterTrip from '../poster-trip';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const act = (React as { act?: (cb: () => void | Promise<void>) => void | Promise<void> }).act as (cb: () => void | Promise<void>) => void | Promise<void>;

const BOARD_KEY = '12D3KooWBoardPublicKeyForTripcodeTests';
const fields = { communityPublicKey: BOARD_KEY, timestamp: 1_800_000_000, title: 'Thread', content: 'Body' };

let container: HTMLDivElement;
let root: Root;

const renderTrip = async (comment: unknown) => {
  await act(async () => {
    root.render(createElement(PosterTrip, { comment }));
  });
  // The verifier is imported on demand, and the trip shows once it has loaded.
  await vi.waitFor(async () => {
    await act(async () => {});
    expect(container.textContent).not.toBe('');
  });
};

describe('PosterTrip', () => {
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('shows the trip of a valid proof and nothing for a forged one', async () => {
    const displayName = await createTripcodeDisplayName({ name: 'Anon', secret: { normal: 'hunter2' }, fields });
    const trip = getVerifiedTrip(parseTripcodeProof(displayName)!, fields) as string;
    const comment = { ...fields, cid: 'QmPost', communityAddress: 'board.bso', author: { displayName } };

    await renderTrip(comment);
    expect(container.querySelector('span')?.textContent).toBe(trip);

    await act(async () => {
      root.render(createElement(PosterTrip, { comment: { ...comment, content: 'Forged body' } }));
    });
    expect(container.textContent).toBe('');
  });

  it("shows no trip once the name or gallery on screen differs from the comment's signed record", async () => {
    const gallery = [{ url: 'https://example.com/a.png' }];
    const displayName = await createTripcodeDisplayName({ name: 'Anon', secret: { normal: 'hunter2' }, fields: { ...fields, galleryUrls: [gallery[0].url] } });
    const record = { ...fields, gallery, author: { displayName } };
    const comment = { ...record, cid: 'QmPost', communityAddress: 'board.bso', raw: { comment: record } };

    await renderTrip(comment);
    expect(container.querySelector('span')?.textContent).toMatch(/^![./0-9A-Za-z]{10}$/);

    for (const changed of [{ author: { displayName: `Admin${displayName.slice('Anon'.length)}` } }, { gallery: [{ url: 'https://example.com/other.png' }] }]) {
      await act(async () => {
        root.render(createElement(PosterTrip, { comment: { ...comment, ...changed } }));
      });
      expect(container.textContent).toBe('');
    }
  });
});
