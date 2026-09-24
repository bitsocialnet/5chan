import { describe, expect, it, vi } from 'vitest';
import { getPreferredOrder, getRandomOrder, getProviderOrder } from '../provider-order';

describe('provider-order', () => {
  describe('getPreferredOrder', () => {
    it('returns single-element array with preferred provider', () => {
      expect(getPreferredOrder('catbox')).toEqual(['catbox']);
      expect(getPreferredOrder('imgur')).toEqual(['imgur']);
      expect(getPreferredOrder('imgbb')).toEqual(['imgbb']);
    });
  });

  describe('getRandomOrder', () => {
    it('returns shuffled copy (Fisher-Yates) with default rng', () => {
      const providers = ['catbox', 'imgur', 'imgbb'] as const;
      const result = getRandomOrder(providers);
      expect(result).toHaveLength(3);
      expect([...result].sort()).toEqual(['catbox', 'imgbb', 'imgur']);
      expect(result).not.toBe(providers);
    });

    it('uses provided rng for deterministic shuffle', () => {
      const providers = ['catbox', 'imgur', 'imgbb'] as const;
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
          preferredProvider: 'forge',
          runtime: 'web',
        }),
      ).toEqual(['forge']);
      expect(
        getProviderOrder({
          mode: 'preferred',
          preferredProvider: 'imgur',
          runtime: 'android',
        }),
      ).toEqual(['imgur']);
      expect(
        getProviderOrder({
          mode: 'preferred',
          preferredProvider: 'imgur',
          runtime: 'electron',
        }),
      ).toEqual(['imgur']);
      expect(
        getProviderOrder({
          mode: 'preferred',
          preferredProvider: 'imgbb',
          runtime: 'android',
        }),
      ).toEqual(['imgbb']);
    });

    it('returns empty when preferred provider not supported on runtime', () => {
      expect(
        getProviderOrder({
          mode: 'preferred',
          preferredProvider: 'catbox',
          runtime: 'web',
        }),
      ).toEqual([]);
      expect(
        getProviderOrder({
          mode: 'preferred',
          preferredProvider: 'forge',
          runtime: 'electron',
        }),
      ).toEqual([]);
      expect(
        getProviderOrder({
          mode: 'preferred',
          preferredProvider: 'forge',
          runtime: 'android',
        }),
      ).toEqual([]);
      expect(
        getProviderOrder({
          mode: 'preferred',
          preferredProvider: 'imgur',
          runtime: 'web',
        }),
      ).toEqual([]);
      expect(
        getProviderOrder({
          mode: 'preferred',
          preferredProvider: 'imgbb',
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
      expect([...order].sort()).toEqual(['catbox', 'imgbb', 'imgur']);
    });

    it('filters unavailable providers from random mode', () => {
      const order = getProviderOrder({
        mode: 'random',
        preferredProvider: 'catbox',
        runtime: 'electron',
        availability: { imgur: 'unavailable' },
      });
      expect(order).toHaveLength(2);
      expect([...order].sort()).toEqual(['catbox', 'imgbb']);
    });

    it('returns empty when preferred provider is unavailable', () => {
      expect(
        getProviderOrder({
          mode: 'preferred',
          preferredProvider: 'imgbb',
          runtime: 'android',
          availability: { imgbb: 'unavailable' },
        }),
      ).toEqual([]);
    });

    it('uses only forge on web with the default persisted settings (random + catbox)', () => {
      expect(
        getProviderOrder({
          mode: 'random',
          preferredProvider: 'catbox',
          runtime: 'web',
        }),
      ).toEqual(['forge']);
    });

    it('returns empty on web when forge is unavailable from this network', () => {
      expect(
        getProviderOrder({
          mode: 'random',
          preferredProvider: 'catbox',
          runtime: 'web',
          availability: { forge: 'unavailable' },
        }),
      ).toEqual([]);
    });

    it('never includes forge in electron random mode', () => {
      const order = getProviderOrder({
        mode: 'random',
        preferredProvider: 'catbox',
        runtime: 'electron',
        availability: { forge: 'available' },
      });
      expect([...order].sort()).toEqual(['catbox', 'imgbb', 'imgur']);
    });

    it('uses catbox, imgur, and imgbb (never forge) for android random mode', () => {
      const order = getProviderOrder({
        mode: 'random',
        preferredProvider: 'catbox',
        runtime: 'android',
        availability: { forge: 'available' },
      });
      expect(order).toHaveLength(3);
      expect([...order].sort()).toEqual(['catbox', 'imgbb', 'imgur']);
    });
  });
});
