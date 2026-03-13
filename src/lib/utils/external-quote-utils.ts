import type { DirectoryCommunity } from '../../hooks/use-directories';
import { getBoardPath, getCommunityAddress, getSubplebbitAddress } from './route-utils';
import { QUOTE_NUMBER_REGEX } from './url-utils';

const CROSSBOARD_NUMBER_BOARD_PART = '(?:[a-zA-Z0-9]{1,10}|12D3KooW[a-zA-Z0-9]{44}|[a-zA-Z0-9\\-.]+)';

const CROSSBOARD_NUMBER_QUOTE_REGEX = new RegExp(`>>>\\/(${CROSSBOARD_NUMBER_BOARD_PART})\\/(\\d+)(?=[^\\d]|$)`, 'g');
export const CROSSBOARD_NUMBER_QUOTE_TOKEN_REGEX = new RegExp(`>>>\\/(${CROSSBOARD_NUMBER_BOARD_PART})\\/(\\d+)[.,:;!?]*`);

export type SameBoardExternalQuoteReference = {
  kind: 'same-board';
  number: number;
  raw: string;
  communityAddress?: string;
  // legacy compatibility alias
  subplebbitAddress?: string;
};

export type CrossBoardExternalQuoteReference = {
  kind: 'cross-board';
  boardIdentifier: string;
  number: number;
  raw: string;
};

export type ExternalQuoteReference = SameBoardExternalQuoteReference | CrossBoardExternalQuoteReference;

const getAddressForCanonicalReference = (reference: ExternalQuoteReference, directories: DirectoryCommunity[]): string => {
  if (reference.kind === 'cross-board') {
    return resolveLegacyCommunityAddress(reference.boardIdentifier, directories);
  }

  return resolveLegacyCommunityAddress(reference.communityAddress || reference.subplebbitAddress || '', directories);
};

const getExternalQuoteKey = (reference: ExternalQuoteReference) =>
  reference.kind === 'cross-board'
    ? `${reference.kind}:${reference.boardIdentifier}:${reference.number}`
    : `${reference.kind}:${reference.communityAddress || reference.subplebbitAddress}:${reference.number}`;

const resolveLegacyCommunityAddress = (boardIdentifier: string, communities: DirectoryCommunity[]) => {
  // Canonical resolver in route utils handles directory or address mapping.
  const address = getCommunityAddress(boardIdentifier, communities);
  if (address) {
    return address;
  }

  // Backward-compat helper alias if needed by callers with older util behavior.
  return getSubplebbitAddress(boardIdentifier, communities);
};

export const getExternalQuoteBoardAddress = (reference: ExternalQuoteReference, directories: DirectoryCommunity[]) =>
  getAddressForCanonicalReference(reference, directories);

export const getExternalQuoteBoardLabel = (reference: ExternalQuoteReference, directories: DirectoryCommunity[]) => {
  const address = getAddressForCanonicalReference(reference, directories);
  return getBoardPath(address, directories);
};

export const extractUnresolvedExternalQuoteReferences = ({
  content,
  scopedNumberToCid,
  communityAddress,
  subplebbitAddress,
}: {
  content?: string;
  scopedNumberToCid?: Record<number, string>;
  // canonical input
  communityAddress?: string;
  // backward-compatible input name
  subplebbitAddress?: string;
}) => {
  const effectiveCommunityAddress = communityAddress || subplebbitAddress;
  if (!content) {
    return [] as ExternalQuoteReference[];
  }

  const references = new Map<string, ExternalQuoteReference>();

  if (effectiveCommunityAddress) {
    for (const match of content.matchAll(new RegExp(QUOTE_NUMBER_REGEX.source, 'g'))) {
      const number = Number.parseInt(match[1], 10);
      if (Number.isNaN(number) || scopedNumberToCid?.[number]) {
        continue;
      }

      const reference: SameBoardExternalQuoteReference = {
        kind: 'same-board',
        number,
        raw: `>>${number}`,
        communityAddress: effectiveCommunityAddress,
        subplebbitAddress: effectiveCommunityAddress,
      };
      references.set(getExternalQuoteKey(reference), reference);
    }
  }

  for (const match of content.matchAll(new RegExp(CROSSBOARD_NUMBER_QUOTE_REGEX.source, 'g'))) {
    const boardIdentifier = match[1];
    const number = Number.parseInt(match[2], 10);

    if (!boardIdentifier || Number.isNaN(number)) {
      continue;
    }

    const reference: CrossBoardExternalQuoteReference = {
      kind: 'cross-board',
      boardIdentifier,
      number,
      raw: `>>>/${boardIdentifier}/${number}`,
    };
    references.set(getExternalQuoteKey(reference), reference);
  }

  return [...references.values()];
};

export type ExternalQuoteSearchStatus =
  | {
      phase: 'search-board';
      boardLabel: string;
      quoteDisplay: string;
    }
  | {
      phase: 'search-thread';
      boardLabel: string;
      currentThread: number;
      totalThreads: number;
      quoteDisplay: string;
    }
  | {
      phase: 'redirecting';
      boardLabel: string;
      quoteDisplay: string;
    };

export const getExternalQuoteStatusMessage = (t: (key: string, options?: Record<string, unknown>) => string, status: ExternalQuoteSearchStatus) => {
  switch (status.phase) {
    case 'search-board':
      return t('external_quote_search_board_feed', { board: status.boardLabel });
    case 'search-thread':
      return t('external_quote_search_thread', {
        board: status.boardLabel,
        current: status.currentThread,
        total: status.totalThreads,
      });
    case 'redirecting':
      return t('external_quote_redirecting_to_post', { board: status.boardLabel });
  }
};
