import * as React from 'react';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useExpandedTimeFilter, { clearExpandedTimeFilters } from '../use-expanded-time-filter';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const act = (React as { act?: (cb: () => void | Promise<void>) => void | Promise<void> }).act as (cb: () => void | Promise<void>) => void | Promise<void>;

vi.mock('@bitsocial/bitsocial-react-hooks', () => ({
  useAccount: () => ({ id: 'account-1' }),
}));

const DAY_IN_SECONDS = 24 * 60 * 60;
const WEEK_IN_SECONDS = 7 * DAY_IN_SECONDS;
const allFeedOptions = {
  communities: [{ name: 'music-posting.eth' }, { name: 'tech.eth', publicKey: 'tech-public-key' }],
  filter: { filter: () => true, key: 'exclude-archived' },
  newerThan: DAY_IN_SECONDS,
  postsPerPage: 25,
  sortType: 'active',
};

type HookResult = ReturnType<typeof useExpandedTimeFilter>;
let latestResult: HookResult | undefined;

const Harness = ({ expandTimeWindow, feedOptions }: { expandTimeWindow: (newerThan?: number) => Promise<void>; feedOptions: typeof allFeedOptions }) => {
  latestResult = useExpandedTimeFilter({ expandTimeWindow, feedOptions, timeFilterName: '24h', timeFilterSeconds: DAY_IN_SECONDS });
  return null;
};

let container: HTMLDivElement;
let root: Root;

const render = async (props: React.ComponentProps<typeof Harness>) => {
  await act(async () => {
    root.render(createElement(Harness, props));
  });
};

describe('useExpandedTimeFilter', () => {
  beforeEach(() => {
    latestResult = undefined;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    clearExpandedTimeFilters();
  });

  it('keeps the widened window when the view remounts on a feed that is still widened', async () => {
    const expandTimeWindow = vi.fn(async () => undefined);
    await render({ expandTimeWindow, feedOptions: allFeedOptions });

    await act(async () => {
      await latestResult?.expandSuggestionTimeWindow({ i18nKey: 'more_threads_last_week', timeFilterName: '1w' });
    });

    expect(expandTimeWindow).toHaveBeenCalledWith(WEEK_IN_SECONDS);
    expect(latestResult?.currentTimeFilterName).toBe('1w');

    // The feed cache unmounts the view; the hooks store keeps the feed widened under the same options.
    act(() => root.unmount());
    root = createRoot(container);
    await render({ expandTimeWindow, feedOptions: { ...allFeedOptions, communities: [...allFeedOptions.communities].reverse() } });

    expect(latestResult?.currentTimeFilterName).toBe('1w');
    expect(latestResult?.currentTimeFilterSeconds).toBe(WEEK_IN_SECONDS);
  });

  it('starts from the requested window when the view switches to a feed made from other options', async () => {
    const expandTimeWindow = vi.fn(async () => undefined);
    await render({ expandTimeWindow, feedOptions: allFeedOptions });

    await act(async () => {
      await latestResult?.expandSuggestionTimeWindow({ i18nKey: 'more_threads_last_week', timeFilterName: '1w' });
    });
    expect(latestResult?.currentTimeFilterName).toBe('1w');

    await render({ expandTimeWindow, feedOptions: { ...allFeedOptions, postsPerPage: 50 } });

    expect(latestResult?.currentTimeFilterName).toBe('24h');
    expect(latestResult?.currentTimeFilterSeconds).toBe(DAY_IN_SECONDS);
  });
});
