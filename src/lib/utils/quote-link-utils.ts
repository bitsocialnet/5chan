import type { Comment } from '@bitsocialhq/bitsocial-react-hooks';

type QuoteTargetAvailability = 'available' | 'unresolved' | 'unavailable';

export const formatQuoteNumber = (number?: number) => `>>${number ?? '?'}`;

export const getQuoteTargetAvailability = (comment?: Partial<Pick<Comment, 'deleted' | 'removed'>> | null): QuoteTargetAvailability => {
  if (!comment) {
    return 'unresolved';
  }

  return comment.deleted || comment.removed ? 'unavailable' : 'available';
};

export const isUnavailableQuoteTarget = (comment?: Partial<Pick<Comment, 'deleted' | 'removed'>> | null) => getQuoteTargetAvailability(comment) === 'unavailable';

export const shouldShowFloatingQuotePreview = ({
  hoveredCid,
  outOfViewCid,
  quoteCid,
  isUnavailable,
}: {
  hoveredCid: string | null;
  outOfViewCid: string | null;
  quoteCid?: string;
  isUnavailable?: boolean;
}) => Boolean(quoteCid && !isUnavailable && hoveredCid === quoteCid && outOfViewCid === quoteCid);
