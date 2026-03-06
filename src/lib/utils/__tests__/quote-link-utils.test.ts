import { describe, expect, it } from 'vitest';
import { formatQuoteNumber, isUnavailableQuoteTarget, shouldShowFloatingQuotePreview } from '../quote-link-utils';

describe('quote-link-utils', () => {
  it('formats quote numbers with the expected prefix', () => {
    expect(formatQuoteNumber(123)).toBe('>>123');
    expect(formatQuoteNumber()).toBe('>>?');
  });

  it('marks deleted and removed comments as unavailable quote targets', () => {
    expect(isUnavailableQuoteTarget(undefined)).toBe(false);
    expect(isUnavailableQuoteTarget({ deleted: true, removed: false })).toBe(true);
    expect(isUnavailableQuoteTarget({ deleted: false, removed: true })).toBe(true);
    expect(isUnavailableQuoteTarget({ deleted: false, removed: false })).toBe(false);
  });

  it('only shows floating previews for available targets that are hovered out of view', () => {
    expect(
      shouldShowFloatingQuotePreview({
        hoveredCid: 'cid-1',
        outOfViewCid: 'cid-1',
        quoteCid: 'cid-1',
        isUnavailable: false,
      }),
    ).toBe(true);

    expect(
      shouldShowFloatingQuotePreview({
        hoveredCid: 'cid-1',
        outOfViewCid: 'cid-1',
        quoteCid: 'cid-1',
        isUnavailable: true,
      }),
    ).toBe(false);

    expect(
      shouldShowFloatingQuotePreview({
        hoveredCid: 'cid-1',
        outOfViewCid: 'cid-2',
        quoteCid: 'cid-1',
        isUnavailable: false,
      }),
    ).toBe(false);
  });
});
