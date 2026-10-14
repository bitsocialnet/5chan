import { describe, expect, it, vi } from 'vitest';
import { getPreferredOrder, getRandomOrder, getProviderOrder, hasUsableUploadProvider, resolveUploadSettings } from '../provider-order';

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

  describe('resolveUploadSettings', () => {
    it('maps Random to Preferred when the runtime has a single provider', () => {
      expect(resolveUploadSettings({ mode: 'random', preferredProvider: 'catbox', runtime: 'web' })).toEqual({ mode: 'preferred', preferredProvider: 'forge' });
    });

    it('keeps Random when the runtime has several providers', () => {
      expect(resolveUploadSettings({ mode: 'random', preferredProvider: 'imgur', runtime: 'electron' })).toEqual({ mode: 'random', preferredProvider: 'imgur' });
    });

    it('keeps None', () => {
      expect(resolveUploadSettings({ mode: 'none', preferredProvider: 'forge', runtime: 'web' })).toEqual({ mode: 'none', preferredProvider: 'forge' });
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

    it("falls back to the runtime's first provider when the preferred one is not supported there", () => {
      expect(getProviderOrder({ mode: 'preferred', preferredProvider: 'catbox', runtime: 'web' })).toEqual(['forge']);
      expect(getProviderOrder({ mode: 'preferred', preferredProvider: 'imgbb', runtime: 'web' })).toEqual(['forge']);
    });

    it('honors a preferred forge on Electron and Android', () => {
      expect(getProviderOrder({ mode: 'preferred', preferredProvider: 'forge', runtime: 'electron' })).toEqual(['forge']);
      expect(getProviderOrder({ mode: 'preferred', preferredProvider: 'forge', runtime: 'android' })).toEqual(['forge']);
    });

    it('returns shuffled list when mode is random', () => {
      const order = getProviderOrder({
        mode: 'random',
        preferredProvider: 'catbox',
        runtime: 'electron',
      });
      expect(order).toHaveLength(4);
      expect([...order].sort()).toEqual(['catbox', 'forge', 'imgbb', 'imgur']);
    });

    it('filters unavailable providers from random mode', () => {
      const order = getProviderOrder({
        mode: 'random',
        preferredProvider: 'catbox',
        runtime: 'electron',
        availability: { imgur: 'unavailable' },
      });
      expect(order).toHaveLength(3);
      expect([...order].sort()).toEqual(['catbox', 'forge', 'imgbb']);
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

    it('includes forge with the automated providers in android random mode', () => {
      const order = getProviderOrder({
        mode: 'random',
        preferredProvider: 'catbox',
        runtime: 'android',
        availability: { forge: 'available' },
      });
      expect([...order].sort()).toEqual(['catbox', 'forge', 'imgbb', 'imgur']);
    });
  });

  describe('hasUsableUploadProvider', () => {
    it('is true while the default web provider can take uploads', () => {
      expect(hasUsableUploadProvider({ mode: 'random', preferredProvider: 'catbox', runtime: 'web' })).toBe(true);
      expect(hasUsableUploadProvider({ mode: 'random', preferredProvider: 'catbox', runtime: 'web', availability: { forge: 'available' } })).toBe(true);
    });

    it('is false when uploads are turned off', () => {
      expect(hasUsableUploadProvider({ mode: 'none', preferredProvider: 'forge', runtime: 'web' })).toBe(false);
    });

    it('is false when every enabled provider is unreachable', () => {
      expect(hasUsableUploadProvider({ mode: 'random', preferredProvider: 'catbox', runtime: 'web', availability: { forge: 'unavailable' } })).toBe(false);
      expect(
        hasUsableUploadProvider({
          mode: 'random',
          preferredProvider: 'catbox',
          runtime: 'electron',
          availability: { forge: 'unavailable', catbox: 'unavailable', imgur: 'unavailable', imgbb: 'unavailable' },
        }),
      ).toBe(false);
      expect(hasUsableUploadProvider({ mode: 'preferred', preferredProvider: 'imgur', runtime: 'android', availability: { imgur: 'unavailable' } })).toBe(false);
    });

    it('is true while random mode still has a reachable provider', () => {
      expect(
        hasUsableUploadProvider({ mode: 'random', preferredProvider: 'catbox', runtime: 'electron', availability: { catbox: 'unavailable', imgur: 'unavailable' } }),
      ).toBe(true);
    });
  });
});
