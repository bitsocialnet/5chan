import { describe, expect, it } from 'vitest';
import { getShowUploadControls } from '../show-upload-controls';

describe('getShowUploadControls', () => {
  it('returns false when uploadMode is none', () => {
    expect(getShowUploadControls('none')).toBe(false);
  });

  it('returns true when uploadMode is random or preferred', () => {
    expect(getShowUploadControls('random')).toBe(true);
    expect(getShowUploadControls('preferred')).toBe(true);
  });
});
