import type { DirectoryCommunity } from '../../hooks/use-directories';
import { getBoardPath, getSubplebbitAddress } from './route-utils';
import { QUOTE_NUMBER_REGEX } from './url-utils';

const CROSSBOARD_NUMBER_BOARD_PART = '(?:[a-zA-Z0-9]{1,10}|12D3KooW[a-zA-Z0-9]{44}|[a-zA-Z0-9\\-.]+)';

const CROSSBOARD_NUMBER_QUOTE_REGEX = new RegExp(`>>>\\/(${CROSSBOARD_NUMBER_BOARD_PART})\\/(\\d+)(?=[^\\d]|$)`, 'g');
export const CROSSBOARD_NUMBER_QUOTE_TOKEN_REGEX = new RegExp(`>>>\\/(${CROSSBOARD_NUMBER_BOARD_PART})\\/(\\d+)[.,:;!?]*`);

export type SameBoardExternalQuoteReference = {
  kind: 'same-board';
  number: number;
  raw: string;
  subplebbitAddress: string;
};

export type CrossBoardExternalQuoteReference = {
  kind: 'cross-board';
  boardIdentifier: string;
  number: number;
  raw: string;
};

export type ExternalQuoteReference = SameBoardExternalQuoteReference | CrossBoardExternalQuoteReference;

const getExternalQuoteKey = (reference: ExternalQuoteReference) =>
  reference.kind === 'cross-board'
    ? `${reference.kind}:${reference.boardIdentifier}:${reference.number}`
    : `${reference.kind}:${reference.subplebbitAddress}:${reference.number}`;

export const getExternalQuoteBoardAddress = (reference: ExternalQuoteReference, directories: DirectoryCommunity[]) =>
  reference.kind === 'cross-board' ? getSubplebbitAddress(reference.boardIdentifier, directories) : reference.subplebbitAddress;

export const getExternalQuoteBoardLabel = (reference: ExternalQuoteReference, directories: DirectoryCommunity[]) => {
  const address = getExternalQuoteBoardAddress(reference, directories);
  return getBoardPath(address, directories);
};

export const extractUnresolvedExternalQuoteReferences = ({
  content,
  scopedNumberToCid,
  subplebbitAddress,
}: {
  content?: string;
  scopedNumberToCid?: Record<number, string>;
  subplebbitAddress?: string;
}) => {
  if (!content) {
    return [] as ExternalQuoteReference[];
  }

  const references = new Map<string, ExternalQuoteReference>();

  if (subplebbitAddress) {
    for (const match of content.matchAll(new RegExp(QUOTE_NUMBER_REGEX.source, 'g'))) {
      const number = Number.parseInt(match[1], 10);
      if (Number.isNaN(number) || scopedNumberToCid?.[number]) {
        continue;
      }

      const reference: SameBoardExternalQuoteReference = {
        kind: 'same-board',
        number,
        raw: `>>${number}`,
        subplebbitAddress,
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
