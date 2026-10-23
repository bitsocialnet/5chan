import * as React from 'react';
import { createElement } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Md5FilterSetting from '../md5-filter-setting';
import useImageFiltersStore from '../../../../stores/use-image-filters-store';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const act = (React as { act?: (cb: () => void | Promise<void>) => void | Promise<void> }).act as (cb: () => void | Promise<void>) => void | Promise<void>;

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const SHA256 = '2aa4fa20701cdd6d8d56046069001186b5267e3ee7d0ef618ad2f4a683723e11';

let root: Root;
let container: HTMLDivElement;
const scrollIntoView = vi.fn();

const render = (initialEntry: string) => {
  act(() => {
    root.render(createElement(MemoryRouter, { initialEntries: [initialEntry] }, createElement(Md5FilterSetting)));
  });
};

const getList = () => container.querySelector<HTMLTextAreaElement>('#md5-filter-list')!;

describe('Md5FilterSetting', () => {
  beforeEach(() => {
    localStorage.clear();
    useImageFiltersStore.setState({ imageFilters: '', filterKeys: new Set(), shownCids: {}, quickFilterNotice: null });
    scrollIntoView.mockReset();
    // jsdom has no layout, so it has no scrollIntoView.
    Element.prototype.scrollIntoView = scrollIntoView;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    delete (Element.prototype as Partial<Element>).scrollIntoView;
  });

  it('edits the filter list as it is typed', async () => {
    render('/b/settings?section=interface-settings');

    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(getList(), `# spam\n${SHA256}`);
      getList().dispatchEvent(new Event('input', { bubbles: true }));
    });

    expect(useImageFiltersStore.getState().imageFilters).toBe(`# spam\n${SHA256}`);
    expect([...useImageFiltersStore.getState().filterKeys]).toEqual([SHA256]);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('scrolls to the list when settings opens from the quick filter notice', () => {
    render('/b/settings?section=md5-filter');

    expect(scrollIntoView).toHaveBeenCalledOnce();
  });

  it('scrolls to the list for the legacy #md5-filter link too', () => {
    render('/b/settings#md5-filter');

    expect(scrollIntoView).toHaveBeenCalledOnce();
  });
});
