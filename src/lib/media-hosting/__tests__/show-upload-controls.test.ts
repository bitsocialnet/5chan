import { describe, expect, it } from 'vitest';
import { getShowUploadControls } from '../show-upload-controls';

describe('getShowUploadControls', () => {
  it('returns true on web regardless of uploadMode', () => {
    expect(getShowUploadControls('none', true)).toBe(true);
    expect(getShowUploadControls('random', true)).toBe(true);
    expect(getShowUploadControls('preferred', true)).toBe(true);
  });

  it('returns false on non-web when uploadMode is none', () => {
    expect(getShowUploadControls('none', false)).toBe(false);
  });

  it('returns true on non-web when uploadMode is random or preferred', () => {
    expect(getShowUploadControls('random', false)).toBe(true);
    expect(getShowUploadControls('preferred', false)).toBe(true);
  });
});
