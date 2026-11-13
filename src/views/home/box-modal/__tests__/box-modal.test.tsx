import * as React from 'react';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const act = (React as { act?: (cb: () => void | Promise<void>) => void | Promise<void> }).act as (cb: () => void | Promise<void>) => void | Promise<void>;

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

let container: HTMLDivElement;
let root: Root;

/** Loads the menu the way a page load does, so its options are read from what earlier visits saved. */
const renderFreshBoxModal = async () => {
  vi.resetModules();
  const { default: BoxModal } = await import('../box-modal');
  await act(async () => {
    root.render(createElement(BoxModal));
  });
};

const button = (label: string) => Array.from(container.querySelectorAll('button')).find((element) => element.textContent?.startsWith(label)) as HTMLButtonElement;

const click = (label: string) =>
  act(() => {
    button(label).dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });

const selectedOptions = () =>
  Array.from(container.querySelectorAll('button'))
    .filter((element) => element.className.includes('selected'))
    .map((element) => element.textContent);

describe('BoxModal', () => {
  beforeEach(() => {
    localStorage.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    localStorage.clear();
  });

  it('highlights one option after a reload when the worksafe-only and nsfw-only options were both saved as on', async () => {
    localStorage.setItem('showWorksafeContentOnly', 'true');
    localStorage.setItem('showNsfwContentOnly', 'true');
    await renderFreshBoxModal();

    await click('options');

    expect(selectedOptions()).toEqual(['show_worksafe_content_only']);
  });

  it('switches between the filters and clears the selected one when it is chosen again', async () => {
    await renderFreshBoxModal();

    await click('options');
    expect(selectedOptions()).toEqual(['show_worksafe_content_only']);

    await click('show_nsfw_content_only');
    await click('options');
    expect(selectedOptions()).toEqual(['show_nsfw_content_only']);

    await click('show_nsfw_content_only');
    await click('options');
    expect(selectedOptions()).toEqual(['show_all_content']);
  });
});
