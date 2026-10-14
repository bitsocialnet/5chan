import { describe, expect, it } from 'vitest';
import { isPublishFileAttachment } from '../attached-media';

const picked = (name: string, mimeType: string) => ({ kind: 'picked' as const, id: name, name, mimeType, webPath: '' });

describe('isPublishFileAttachment', () => {
  it('accepts the image and video formats the pickers offer', () => {
    for (const mimeType of ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/webm']) {
      expect(isPublishFileAttachment(picked('file', mimeType))).toBe(true);
    }
  });

  it('rejects SWF and media types the board link checks would not count as a file', () => {
    expect(isPublishFileAttachment(picked('game.swf', 'application/x-shockwave-flash'))).toBe(false);
    expect(isPublishFileAttachment(picked('photo.heic', 'image/heic'))).toBe(false);
  });

  it('falls back to the file extension when no MIME type is reported', () => {
    expect(isPublishFileAttachment(picked('IMG_0001.JPG', ''))).toBe(true);
    expect(isPublishFileAttachment(picked('clip.webm', ''))).toBe(true);
    expect(isPublishFileAttachment(picked('game.swf', ''))).toBe(false);
    expect(isPublishFileAttachment(picked('unknown', ''))).toBe(false);
  });

  it('falls back to the file extension for a generic or nonstandard MIME type, but not for a SWF one', () => {
    expect(isPublishFileAttachment(picked('photo.png', 'application/octet-stream'))).toBe(true);
    expect(isPublishFileAttachment(picked('photo.jpg', 'image/jpg'))).toBe(true);
    expect(isPublishFileAttachment(picked('game.swf', 'application/octet-stream'))).toBe(false);
    expect(isPublishFileAttachment(picked('renamed.png', 'application/x-shockwave-flash'))).toBe(false);
  });
});
