import { describe, expect, it, vi } from 'vitest';
import { getPreferredOrder, getRandomOrder, getProviderOrder } from '../provider-order';

describe('provider-order', () => {
  describe('getPreferredOrder', () => {
    it('returns single-element array with preferred provider', () => {
      expect(getPreferredOrder('catbox')).toEqual(['catbox']);
      expect(getPreferredOrder('imgur')).toEqual(['imgur']);
      expect(getPreferredOrder('postimages')).toEqual(['postimages']);
    });
  });

  describe('getRandomOrder', () => {
    it('returns shuffled copy (Fisher-Yates) with default rng', () => {
      const providers = ['catbox', 'imgur', 'postimages'] as const;
      const result = getRandomOrder(providers);
      expect(result).toHaveLength(3);
      expect([...result].sort()).toEqual(['catbox', 'imgur', 'postimages']);
      expect(result).not.toBe(providers);
    });

    it('uses provided rng for deterministic shuffle', () => {
      const providers = ['catbox', 'imgur', 'postimages'] as const;
      const rng = vi.fn().mockReturnValue(0.5);
      const result = getRandomOrder(providers, rng);
      expect(rng).toHaveBeenCalled();
      expect(result).toHaveLength(3);
    });

    it('handles empty array', () => {
      expect(getRandomOrder([])).toEqual([]);
    });

    it('handles single element', () => {
      expect(getRandomOrder(['catbox'])).toEqual(['catbox']);
    });
  });

  describe('getProviderOrder', () => {
    it('returns empty array when mode is none', () => {
      expect(
        getProviderOrder({
          mode: 'none',
          preferredProvider: 'catbox',
          runtime: 'electron',
        }),
      ).toEqual([]);
    });

    it('returns preferred provider when mode is preferred and supported', () => {
      expect(
        getProviderOrder({
          mode: 'preferred',
          preferredProvider: 'catbox',
          runtime: 'web',
        }),
      ).toEqual(['catbox']);
      expect(
        getProviderOrder({
          mode: 'preferred',
          preferredProvider: 'imgur',
          runtime: 'electron',
        }),
      ).toEqual(['imgur']);
    });

    it('returns empty when preferred provider not supported on runtime', () => {
      expect(
        getProviderOrder({
          mode: 'preferred',
          preferredProvider: 'imgur',
          runtime: 'web',
        }),
      ).toEqual([]);
    });

    it('returns shuffled list when mode is random', () => {
      const order = getProviderOrder({
        mode: 'random',
        preferredProvider: 'catbox',
        runtime: 'electron',
      });
      expect(order).toHaveLength(3);
      expect([...order].sort()).toEqual(['catbox', 'imgur', 'postimages']);
    });

    it('filters by runtime for random mode', () => {
      const order = getProviderOrder({
        mode: 'random',
        preferredProvider: 'catbox',
        runtime: 'web',
      });
      expect(order).toHaveLength(1);
      expect(order).toEqual(['catbox']);
    });
  });
});
