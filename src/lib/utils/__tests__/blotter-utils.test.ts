import { describe, expect, it } from 'vitest';
import { BLOTTER_PREVIEW_COUNT, formatBlotterDate, getBlotterPreview, isBlotterEntry, sortBlotterEntries } from '../blotter-utils';

describe('blotter-utils', () => {
  it('validates blotter entries and rejects malformed release entries', () => {
    expect(
      isBlotterEntry({
        id: 'release-1',
        kind: 'release',
        timestamp: 1_700_000_000,
        message: 'Released',
        version: '1.0.0',
      }),
    ).toBe(true);

    expect(isBlotterEntry({ id: '', kind: 'manual', timestamp: 1, message: 'note' })).toBe(false);
    expect(isBlotterEntry({ id: 'manual-1', kind: 'release', timestamp: 1, message: 'missing version' })).toBe(false);
    expect(isBlotterEntry({ id: 'manual-2', kind: 'manual', timestamp: -1, message: 'bad time' })).toBe(false);
  });

  it('sorts entries descending by timestamp and slices previews', () => {
    const entries = [
      { id: 'a', timestamp: 10 },
      { id: 'b', timestamp: 30 },
      { id: 'c', timestamp: 20 },
      { id: 'd', timestamp: 5 },
    ];

    expect(sortBlotterEntries(entries).map((entry) => entry.id)).toEqual(['b', 'c', 'a', 'd']);
    expect(getBlotterPreview(entries).length).toBe(BLOTTER_PREVIEW_COUNT);
    expect(getBlotterPreview(entries, 2).map((entry) => entry.id)).toEqual(['a', 'b']);
  });

  it('formats unix timestamps and rejects invalid values', () => {
    expect(formatBlotterDate(1_704_153_600)).toBe('01/02/24');
    expect(formatBlotterDate(-1)).toBe('');
    expect(formatBlotterDate(Number.NaN)).toBe('');
  });
});
