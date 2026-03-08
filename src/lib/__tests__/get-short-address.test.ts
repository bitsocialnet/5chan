import { describe, expect, it } from 'vitest';
import getShortAddress from '../get-short-address';

describe('getShortAddress', () => {
  it('returns an empty string for falsy or too-short non-domain addresses', () => {
    expect(getShortAddress('')).toBe('');
    expect(getShortAddress('short-address')).toBe('');
  });

  it('returns domain-style addresses unchanged', () => {
    expect(getShortAddress('music-posting.eth')).toBe('music-posting.eth');
    expect(getShortAddress('music-posting.bso')).toBe('music-posting.bso');
  });

  it('returns the middle slice for long hexadecimal addresses', () => {
    expect(getShortAddress('0x1234567890abcdef1234567890abcdef12345678')).toBe('7890abcdef12');
  });
});
