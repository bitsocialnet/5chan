import * as React from 'react';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BoardsBarEditModal from '../boards-bar-edit-modal';
import useBoardsBarEditModalStore from '../../../stores/use-boards-bar-edit-modal-store';
import useBoardsBarVisibilityStore from '../../../stores/use-boards-bar-visibility-store';
import { ALL_BOARDS_VISIBLE } from '../../../constants/board-codes';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const act = (React as { act?: (cb: () => void | Promise<void>) => void | Promise<void> }).act as (cb: () => void | Promise<void>) => void | Promise<void>;

const testState = vi.hoisted(() => ({
  directories: [
    { address: 'tv-posting.bso', title: '/tv/ - Television & Film' },
    { address: 'zines-posting.bso', title: '/zines/ - Zines' },
  ],
}));

vi.mock('../../../hooks/use-directories', () => ({
  useDirectories: () => testState.directories,
}));

vi.mock('@bitsocial/bitsocial-react-hooks', () => ({
  useAccount: () => ({
    subscriptions: ['custom.eth'],
  }),
}));

let container: HTMLDivElement;
let root: Root;

const renderModal = async () => {
  await act(async () => {
    root.render(createElement(MemoryRouter, { initialEntries: ['/tv/catalog'] }, createElement(BoardsBarEditModal)));
  });
};

describe('BoardsBarEditModal', () => {
  beforeEach(() => {
    localStorage.clear();
    useBoardsBarEditModalStore.setState({ showModal: true });
    useBoardsBarVisibilityStore.setState({
      visibleDirectories: new Set(['tv']),
      showSubscriptionsInBoardsBar: false,
    });

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    useBoardsBarEditModalStore.setState({ showModal: false });
    localStorage.clear();
  });

  it('keeps the modal open when typing spaces in the directory input', async () => {
    await renderModal();

    const input = container.querySelector<HTMLInputElement>('input[aria-label="Directory codes"]');
    expect(input).toBeTruthy();

    await act(async () => {
      input?.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    });

    expect(container.querySelector('dialog')).toBeTruthy();
    expect(useBoardsBarEditModalStore.getState().showModal).toBe(true);
  });

  it('saves typed directories published after this build, including ones not loaded yet', async () => {
    const saveInput = async (value: string) => {
      useBoardsBarEditModalStore.setState({ showModal: true });
      await renderModal();
      const input = container.querySelector<HTMLInputElement>('input[aria-label="Directory codes"]');
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value);
        input?.dispatchEvent(new Event('input', { bubbles: true }));
      });
      const saveButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Save');
      await act(async () => {
        saveButton?.click();
      });
      return useBoardsBarVisibilityStore.getState().visibleDirectories;
    };

    // diyaudio is not in the loaded directories yet
    let visibleDirectories = await saveInput('tv zines diyaudio');
    expect(visibleDirectories.has('tv')).toBe(true);
    expect(visibleDirectories.has('zines')).toBe(true);
    expect(visibleDirectories.has('diyaudio')).toBe(true);
    expect(visibleDirectories.has('g')).toBe(false);

    visibleDirectories = await saveInput('tv');
    expect(visibleDirectories.has('tv')).toBe(true);
    expect(visibleDirectories.has('zines')).toBe(false);
    expect(visibleDirectories.has('diyaudio')).toBe(false);
  });

  it('saves an empty list as all boards, and a narrower list clears that', async () => {
    const saveInput = async (value: string) => {
      useBoardsBarEditModalStore.setState({ showModal: true });
      await renderModal();
      const input = container.querySelector<HTMLInputElement>('input[aria-label="Directory codes"]');
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value);
        input?.dispatchEvent(new Event('input', { bubbles: true }));
      });
      const saveButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Save');
      await act(async () => {
        saveButton?.click();
      });
      return useBoardsBarVisibilityStore.getState().visibleDirectories;
    };

    expect((await saveInput('')).has(ALL_BOARDS_VISIBLE)).toBe(true);
    expect((await saveInput('tv')).has(ALL_BOARDS_VISIBLE)).toBe(false);
  });

  it('still closes when the backdrop itself handles keyboard activation', async () => {
    await renderModal();

    const backdrop = container.querySelector<HTMLElement>('button[aria-label="Close board list modal"]');
    expect(backdrop).toBeTruthy();

    await act(async () => {
      backdrop?.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    });

    expect(useBoardsBarEditModalStore.getState().showModal).toBe(false);
  });
});
