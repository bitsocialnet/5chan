import { useCallback, useMemo, useState } from 'react';
import { useAccount, type UseFeedOptions } from '@bitsocial/bitsocial-react-hooks';
import { getTimeFilterSeconds, type TimeFilterSuggestion } from '../lib/utils/time-filter-utils';

type ExpandableFeedOptions = Pick<UseFeedOptions, 'communities' | 'filter' | 'newerThan' | 'postsPerPage' | 'sortType'>;

interface UseExpandedTimeFilterOptions {
  /** The options passed to useFeed, which identify the feed whose window is widened. */
  feedOptions: ExpandableFeedOptions;
  timeFilterName: string;
  timeFilterSeconds: number | undefined;
  expandTimeWindow: (newerThan?: number) => Promise<void>;
}

// useFeed keeps one feed per set of options for the whole session and widens its window in place, so the
// widened window is remembered per feed too: a cached view that remounts still names the window its feed
// has, and a feed made from other options starts from the requested window.
const expandedTimeFilterNames = new Map<string, string>();

export const clearExpandedTimeFilters = () => {
  expandedTimeFilterNames.clear();
};

const getFeedKey = (accountId: string | undefined, { communities = [], filter, newerThan, postsPerPage, sortType }: ExpandableFeedOptions) =>
  JSON.stringify([accountId, sortType, [...new Set(communities.map((community) => community.publicKey || community.name))].sort(), postsPerPage, filter?.key, newerThan]);

const useExpandedTimeFilter = ({ feedOptions, timeFilterName, timeFilterSeconds, expandTimeWindow }: UseExpandedTimeFilterOptions) => {
  const accountId = useAccount()?.id;
  const feedKey = useMemo(() => getFeedKey(accountId, feedOptions), [accountId, feedOptions]);
  const [, setExpandedTimeFilterVersion] = useState(0);
  const expandedTimeFilterName = expandedTimeFilterNames.get(feedKey);
  const currentTimeFilterName = expandedTimeFilterName ?? timeFilterName;
  const currentTimeFilterSeconds = expandedTimeFilterName ? getTimeFilterSeconds(expandedTimeFilterName) : timeFilterSeconds;

  const expandSuggestionTimeWindow = useCallback(
    async (suggestion: TimeFilterSuggestion | null) => {
      if (!suggestion) {
        return;
      }

      const nextTimeFilterSeconds = getTimeFilterSeconds(suggestion.timeFilterName);
      if (typeof nextTimeFilterSeconds !== 'number') {
        return;
      }

      await expandTimeWindow(nextTimeFilterSeconds);
      expandedTimeFilterNames.set(feedKey, suggestion.timeFilterName);
      setExpandedTimeFilterVersion((version) => version + 1);
    },
    [expandTimeWindow, feedKey],
  );

  return {
    currentTimeFilterName,
    currentTimeFilterSeconds,
    expandSuggestionTimeWindow,
  };
};

export default useExpandedTimeFilter;
