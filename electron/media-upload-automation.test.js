/**
 * Unit tests for media-upload-automation (Electron).
 * Covers isDirectMediaUrl (URL extraction guard) and recipe usage.
 */
import { describe, expect, it } from 'vitest';
import { isDirectMediaUrl } from './media-upload-automation.js';
import { MEDIA_UPLOAD_RECIPES } from './media-upload-recipes.js';

describe('media-upload-automation', () => {
  describe('isDirectMediaUrl', () => {
    it('returns true for image extensions', () => {
      expect(isDirectMediaUrl('https://example.com/photo.jpg')).toBe(true);
      expect(isDirectMediaUrl('https://i.imgur.com/abc.png')).toBe(true);
      expect(isDirectMediaUrl('https://i.postimg.cc/xyz.webp')).toBe(true);
    });

    it('returns true for video extensions', () => {
      expect(isDirectMediaUrl('https://example.com/video.webm')).toBe(true);
      expect(isDirectMediaUrl('https://example.com/video.mp4')).toBe(true);
    });

    it('strips query strings before checking', () => {
      expect(isDirectMediaUrl('https://i.imgur.com/abc.png?size=large')).toBe(true);
      expect(isDirectMediaUrl('https://imgur.com/page.html?img=photo.jpg')).toBe(false);
    });

    it('returns false for non-direct URLs (guards against non-media pages)', () => {
      expect(isDirectMediaUrl('https://imgur.com/abc123')).toBe(false);
      expect(isDirectMediaUrl('https://imgur.com/upload')).toBe(false);
      expect(isDirectMediaUrl('https://postimages.org')).toBe(false);
      expect(isDirectMediaUrl('')).toBe(false);
    });

    it('returns false for invalid input', () => {
      expect(isDirectMediaUrl(null)).toBe(false);
      expect(isDirectMediaUrl(undefined)).toBe(false);
    });
  });
});

describe('media-upload-automation + recipes integration', () => {
  it('imgur and postimages success extractors target direct-media domains', () => {
    const imgurSelectors = MEDIA_UPLOAD_RECIPES.imgur.successExtractor.selectorCandidates;
    expect(imgurSelectors.some((s) => s.includes('i.imgur.com'))).toBe(true);

    const postimagesSelectors = MEDIA_UPLOAD_RECIPES.postimages.successExtractor.selectorCandidates;
    expect(postimagesSelectors.some((s) => s.includes('postimg') || s.includes('i.postimg'))).toBe(true);
  });

  it('all providers have fallback selector chains for file input and submit', () => {
    for (const [provider, recipe] of Object.entries(MEDIA_UPLOAD_RECIPES)) {
      expect(recipe.fileInputSelectorCandidates.length).toBeGreaterThanOrEqual(1);
      expect(recipe.submitSelectorCandidates.length).toBeGreaterThanOrEqual(1);
      expect(recipe.successExtractor.selectorCandidates.length).toBeGreaterThanOrEqual(1);
    }
  });
});
