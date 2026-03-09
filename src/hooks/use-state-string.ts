import { useMemo } from 'react';
import { useClientsStates, useSubplebbit, useSubplebbitsStates } from '@bitsocialnet/bitsocial-react-hooks';
import debounce from 'lodash/debounce';
import getShortAddress from '../lib/get-short-address';

interface CommentOrSubplebbit {
  state?: string;
  publishingState?: string;
  updatingState?: string;
}

interface States {
  [key: string]: string[];
}

const friendlyStateNames: Record<string, string> = {
  'fetching-ipns': 'downloading board',
  'fetching-ipfs': 'downloading thread',
  'fetching-subplebbit-ipns': 'downloading board',
  'fetching-subplebbit-ipfs': 'downloading board',
  'fetching-update-ipfs': 'downloading update',
  'resolving-address': 'resolving address',
  'resolving-subplebbit-address': 'resolving board address',
  'resolving-author-address': 'resolving author address',
};

const getFriendlyStateName = (state: string): string => friendlyStateNames[state] || state.replaceAll('-', ' ');

const sanitizeSingleFeedLoadingState = (stateString?: string): string | undefined => {
  if (!stateString) {
    return stateString;
  }

  return stateString
    .replace(/\bDownloading thread\b/g, 'Downloading board')
    .replace(/\bdownloading thread\b/g, 'downloading board')
    .replace(/\bLoading thread\b/g, 'Loading board')
    .replace(/\bloading thread\b/g, 'loading board');
};

const useStateString = (commentOrSubplebbit: CommentOrSubplebbit): string | undefined => {
  const { states: rawStates } = useClientsStates({ comment: commentOrSubplebbit }) as { states: States };

  const debouncedStates = useMemo(() => {
    const debouncedValue = debounce((value: States) => value, 300);
    return debouncedValue(rawStates);
  }, [rawStates]);

  return useMemo(() => {
    let stateString: string | undefined = '';
    const resolvingParts: string[] = [];
    const downloadingParts: string[] = [];

    for (const state in debouncedStates) {
      if (debouncedStates[state].length === 0) continue;
      const friendlyName = getFriendlyStateName(state);
      if (state.includes('resolving')) {
        resolvingParts.push(friendlyName);
      } else {
        downloadingParts.push(friendlyName);
      }
    }

    if (resolvingParts.length) {
      stateString = resolvingParts.join(', ');
    }
    if (downloadingParts.length) {
      if (stateString) stateString += ', ';
      stateString += downloadingParts.join(', ') + ' via IPFS';
    }

    if (!stateString && commentOrSubplebbit?.state !== 'succeeded') {
      if (commentOrSubplebbit?.publishingState && commentOrSubplebbit?.publishingState !== 'stopped' && commentOrSubplebbit?.publishingState !== 'succeeded') {
        stateString = commentOrSubplebbit.publishingState;
      } else if (commentOrSubplebbit?.updatingState !== 'stopped' && commentOrSubplebbit?.updatingState !== 'succeeded') {
        stateString = commentOrSubplebbit?.updatingState;
      }
      if (stateString) {
        const isIpfsRelated = stateString.includes('ipfs') || stateString.includes('ipns');
        stateString = stateString
          .replaceAll('-', ' ')
          .replace('ipfs', 'thread')
          .replace('ipns', 'subplebbit')
          .replace('fetching', 'downloading')
          .replace('subplebbit subplebbit', 'board')
          .replace('downloading subplebbit', 'downloading board');
        if (isIpfsRelated) {
          stateString += ' via IPFS';
        }
      }
    }

    if (stateString) {
      stateString = stateString.charAt(0).toUpperCase() + stateString.slice(1);
    }

    return stateString === '' ? undefined : stateString;
  }, [debouncedStates, commentOrSubplebbit]);
};

export const useFeedStateString = (subplebbitAddresses?: string[]): string | undefined => {
  // single subplebbit feed state string
  const subplebbitAddress = subplebbitAddresses?.length === 1 ? subplebbitAddresses[0] : undefined;
  const subplebbit = useSubplebbit({ subplebbitAddress });
  const singleSubplebbitFeedStateString = sanitizeSingleFeedLoadingState(useStateString(subplebbit));

  // multiple subplebbit feed state string
  const { states } = useSubplebbitsStates({ subplebbitAddresses });

  const multipleSubplebbitsFeedStateString = useMemo(() => {
    if (subplebbitAddress) {
      return;
    }

    let stateString = '';

    if (states['resolving-address']) {
      const { subplebbitAddresses, clientUrls } = states['resolving-address'];
      if (subplebbitAddresses.length && clientUrls.length) {
        const count = subplebbitAddresses.length;
        stateString += `resolving ${count} board ${count === 1 ? 'address' : 'addresses'}`;
      }
    }

    const pagesStatesSubplebbitAddresses = new Set<string>();
    for (const state in states) {
      if (state.match('page')) {
        states[state].subplebbitAddresses.forEach((subplebbitAddress: string) => pagesStatesSubplebbitAddresses.add(subplebbitAddress));
      }
    }

    if (states['fetching-ipns'] || states['fetching-ipfs'] || pagesStatesSubplebbitAddresses.size) {
      if (stateString) stateString += ', ';
      stateString += 'downloading ';
      if (states['fetching-ipns']) {
        const count = states['fetching-ipns'].subplebbitAddresses.length;
        stateString += `${count} ${count === 1 ? 'board' : 'boards'}`;
        if (count <= 5) {
          stateString += ` (${states['fetching-ipns'].subplebbitAddresses.map((a: string) => getShortAddress(a) || a).join(', ')})`;
        }
      }
      if (states['fetching-ipfs']) {
        if (states['fetching-ipns']) stateString += ', ';
        const count = states['fetching-ipfs'].subplebbitAddresses.length;
        stateString += `${count} ${count === 1 ? 'thread' : 'threads'}`;
      }
      if (pagesStatesSubplebbitAddresses.size) {
        if (states['fetching-ipns'] || states['fetching-ipfs']) stateString += ', ';
        const count = pagesStatesSubplebbitAddresses.size;
        stateString += `${count} ${count === 1 ? 'page' : 'pages'}`;
      }
      stateString += ' via IPFS';
    }

    if (!stateString && subplebbitAddresses?.length) {
      const count = subplebbitAddresses.length;
      stateString = `downloading ${count} ${count === 1 ? 'board' : 'boards'}`;
      if (count <= 5) {
        stateString += ` (${subplebbitAddresses.map((a) => getShortAddress(a) || a).join(', ')})`;
      }
    }

    // capitalize first letter
    stateString = stateString.charAt(0).toUpperCase() + stateString.slice(1);

    // if string is empty, return undefined instead
    return stateString === '' ? undefined : stateString;
  }, [states, subplebbitAddress, subplebbitAddresses]);

  if (singleSubplebbitFeedStateString) {
    return singleSubplebbitFeedStateString;
  }
  return multipleSubplebbitsFeedStateString;
};

export default useStateString;
