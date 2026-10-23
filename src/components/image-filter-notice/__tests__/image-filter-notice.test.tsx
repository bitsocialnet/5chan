import * as React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useImageFiltersStore from '../../../stores/use-image-filters-store';
import ImageFilterNotice from '../image-filter-notice';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const act = (React as { act?: (cb: () => void | Promise<void>) => void | Promise<void> }).act as (cb: () => void | Promise<void>) => void | Promise<void>;

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { count?: number }) => (options?.count === undefined ? key : `${key}:${options.count}`),
  }),
}));

const SHA256 = '2aa4fa20701cdd6d8d56046069001186b5267e3ee7d0ef618ad2f4a683723e11';
let navigateTo: ((path: string) => void) | undefined;

const LocationProbe = () => {
  const location = useLocation();
  navigateTo = useNavigate();
  return <span data-testid='location'>{`${location.pathname}${location.search}`}</span>;
};

let container: HTMLDivElement;
let root: Root;

const render = async (route: string) => {
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={[route]}>
        <ImageFilterNotice />
        <LocationProbe />
      </MemoryRouter>,
    ),
  );
};
const notice = () => container.querySelector('output');
const clickButton = (text: string) =>
  act(async () => {
    [...container.querySelectorAll('button')].find((button) => button.textContent === text)?.click();
  });

describe('ImageFilterNotice', () => {
  beforeEach(() => {
    useImageFiltersStore.setState({ imageFilters: SHA256, filterKeys: new Set([SHA256]), shownCids: {}, quickFilterNotice: { pathname: '/b', keys: [SHA256] } });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('shows only on the page where the image was filtered', async () => {
    await render('/b');
    expect(notice()?.textContent).toContain('md5_filtered');

    await act(async () => navigateTo?.('/a'));
    expect(notice()).toBeNull();
    await act(async () => navigateTo?.('/b/settings'));
    expect(notice()).toBeNull();
  });

  it('counts several quick filters on the same page', async () => {
    useImageFiltersStore.setState({ quickFilterNotice: { pathname: '/b', keys: [SHA256, 'https://i.imgur.com/YpB7qfa.jpg'] } });
    await render('/b');
    expect(notice()?.textContent).toContain('x_md5s_filtered:2');
  });

  it('opens the image filter settings of the current page and closes', async () => {
    await render('/b/thread/thread-1?q=1');
    expect(notice()).toBeNull();
    await act(async () => {
      useImageFiltersStore.setState({ quickFilterNotice: { pathname: '/b/thread/thread-1', keys: [SHA256] } });
    });
    await clickButton('show');

    expect(container.querySelector('[data-testid="location"]')?.textContent).toBe('/b/thread/thread-1/settings?q=1&section=md5-filter');
    expect(useImageFiltersStore.getState().quickFilterNotice).toBeNull();
  });

  it('undoes the quick filters and closes', async () => {
    await render('/b');
    await clickButton('undo');

    expect(useImageFiltersStore.getState().imageFilters).toBe('');
    expect(notice()).toBeNull();
  });
});
