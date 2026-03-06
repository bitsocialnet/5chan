import type { Comment } from '@bitsocialhq/bitsocial-react-hooks';

export const formatQuoteNumber = (number?: number) => `>>${number ?? '?'}`;

export const isUnavailableQuoteTarget = (comment?: Partial<Pick<Comment, 'deleted' | 'removed'>> | null) => Boolean(comment?.deleted || comment?.removed);

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
