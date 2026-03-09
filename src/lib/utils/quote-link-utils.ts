import type { Comment } from '@bitsocialnet/bitsocial-react-hooks';

type QuoteTargetAvailability = 'available' | 'unresolved' | 'unavailable';

export const formatQuoteNumber = (number?: number) => `>>${number ?? '?'}`;

type QuoteTargetComment = Partial<Pick<Comment, 'deleted' | 'removed' | 'commentModeration'>>;

export const getQuoteTargetAvailability = (comment?: QuoteTargetComment | null): QuoteTargetAvailability => {
  if (!comment) {
    return 'unresolved';
  }

  return comment.deleted || comment.removed || comment.commentModeration?.purged ? 'unavailable' : 'available';
};

export const isUnavailableQuoteTarget = (comment?: QuoteTargetComment | null) => getQuoteTargetAvailability(comment) === 'unavailable';

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
