import * as React from 'react';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import usePendingUploadPostStore from '../../../stores/use-pending-upload-post-store';
import PendingUploadFile from '../pending-upload-file';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const act = (React as { act?: (cb: () => void | Promise<void>) => void | Promise<void> }).act as (cb: () => void | Promise<void>) => void | Promise<void>;

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('../../comment-media', () => ({
  default: () => createElement('span', { 'data-testid': 'thumbnail' }),
}));

vi.mock('../../loading-ellipsis', () => ({
  default: ({ string }: { string: string }) => createElement('span', null, `${string}...`),
}));

let container: HTMLDivElement;
let root: Root;

const startUpload = () =>
  usePendingUploadPostStore.getState().startPendingUploadPost({
    attachment: { kind: 'file', file: new File([new Uint8Array(2048)], 'chosen.png', { type: 'image/png' }), name: 'chosen.png', mimeType: 'image/png' },
    boardChallenges: undefined,
    draftKey: '/mu',
    nonokoRedirectPath: null,
    post: {},
    publishOptions: {},
  });

const render = async (pendingUploadId: number, spoiler?: boolean) => {
  await act(async () => {
    root.render(createElement(PendingUploadFile, { pendingUploadId, spoiler }));
  });
};

describe('PendingUploadFile', () => {
  beforeEach(() => {
    usePendingUploadPostStore.setState({ pendingUploadPost: null });
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:local-preview'), revokeObjectURL: vi.fn() }));
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it('names the local file with its size while the spam blocker checks the post', async () => {
    const { id } = startUpload();
    await render(id);
    expect(container.textContent).toBe('file: chosen.png (2 KB)');
  });

  it('shows the upload and then the host checks after the file size', async () => {
    const { id } = startUpload();
    await render(id);

    act(() => usePendingUploadPostStore.getState().setPendingUploadPhase(id, 'uploading'));
    expect(container.textContent).toBe('file: chosen.png (2 KB) uploading...');

    act(() => usePendingUploadPostStore.getState().setPendingUploadPhase(id, 'checking'));
    expect(container.textContent).toBe('file: chosen.png (2 KB) running_automated_checks...');
  });

  it('hides the file name of a spoilered post and revokes the local preview when it unmounts', async () => {
    const { id } = startUpload();
    await render(id, true);
    expect(container.textContent).toBe('file: Spoiler (2 KB)');

    act(() => root.unmount());
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:local-preview');
    root = createRoot(container);
  });

  it('renders nothing for an upload that is no longer pending', async () => {
    await render(42);
    expect(container.textContent).toBe('');
  });
});
