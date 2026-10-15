import { describe, expect, it, vi } from 'vitest';
import { getFileDropHandlers, isPublishFileAttachment, type FileDragEvent } from '../attached-media';

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

describe('getFileDropHandlers', () => {
  const dragEvent = (types: string[], files: File[] = []) => {
    const preventDefault = vi.fn();
    const dataTransfer = { types, files, dropEffect: 'none' };
    return {
      event: { preventDefault, dataTransfer } as unknown as FileDragEvent,
      preventDefault,
      dataTransfer,
    };
  };

  it('attaches a dropped image', () => {
    const onDropFile = vi.fn();
    const file = new File(['x'], 'cat.png', { type: 'image/png' });
    const { event, preventDefault } = dragEvent(['Files'], [file]);

    getFileDropHandlers(onDropFile, true).onDrop(event);

    expect(preventDefault).toHaveBeenCalled();
    expect(onDropFile).toHaveBeenCalledWith({ kind: 'file', file, name: 'cat.png', mimeType: 'image/png' });
  });

  it('accepts a dropped .swf by extension', () => {
    const onDropFile = vi.fn();
    const file = new File(['x'], 'Game.SWF', { type: '' });

    getFileDropHandlers(onDropFile, true).onDrop(dragEvent(['Files'], [file]).event);

    expect(onDropFile).toHaveBeenCalledTimes(1);
  });

  it('reports an unsupported file instead of attaching it or letting the browser open it', () => {
    const onDropFile = vi.fn();
    const onUnsupportedFile = vi.fn();
    const { event, preventDefault } = dragEvent(['Files'], [new File(['x'], 'notes.pdf', { type: 'application/pdf' })]);

    getFileDropHandlers(onDropFile, true, onUnsupportedFile).onDrop(event);

    expect(preventDefault).toHaveBeenCalled();
    expect(onDropFile).not.toHaveBeenCalled();
    expect(onUnsupportedFile).toHaveBeenCalledTimes(1);
  });

  it('leaves text drags to the browser', () => {
    const onDropFile = vi.fn();
    const handlers = getFileDropHandlers(onDropFile, true);
    const over = dragEvent(['text/plain']);
    const drop = dragEvent(['text/plain']);

    handlers.onDragOver(over.event);
    handlers.onDrop(drop.event);

    expect(over.preventDefault).not.toHaveBeenCalled();
    expect(drop.preventDefault).not.toHaveBeenCalled();
    expect(onDropFile).not.toHaveBeenCalled();
  });

  it('accepts a dropped image the OS reports without a MIME type, by extension', () => {
    const onDropFile = vi.fn();
    const file = new File(['x'], 'photo.WEBP', { type: '' });

    getFileDropHandlers(onDropFile, true).onDrop(dragEvent(['Files'], [file]).event);

    expect(onDropFile).toHaveBeenCalledWith({ kind: 'file', file, name: 'photo.WEBP', mimeType: '' });
  });

  it('still cancels file drops while attaching is disabled, without attaching', () => {
    const onDropFile = vi.fn();
    const onUnsupportedFile = vi.fn();
    const handlers = getFileDropHandlers(onDropFile, false, onUnsupportedFile);
    const over = dragEvent(['Files']);
    const drop = dragEvent(['Files'], [new File(['x'], 'cat.png', { type: 'image/png' })]);
    const unsupportedDrop = dragEvent(['Files'], [new File(['x'], 'notes.pdf', { type: 'application/pdf' })]);

    handlers.onDragOver(over.event);
    handlers.onDrop(drop.event);
    handlers.onDrop(unsupportedDrop.event);

    expect(over.preventDefault).toHaveBeenCalled();
    expect(over.dataTransfer.dropEffect).toBe('none');
    expect(drop.preventDefault).toHaveBeenCalled();
    expect(unsupportedDrop.preventDefault).toHaveBeenCalled();
    expect(onDropFile).not.toHaveBeenCalled();
    expect(onUnsupportedFile).not.toHaveBeenCalled();
  });
});
