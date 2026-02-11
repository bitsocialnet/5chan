import { QUOTE_NUMBER_REGEX } from './url-utils';

export const getQuotedCidsFromContent = (content: string | undefined, numberToCid: Record<number, string>) => {
  if (!content) return undefined;
  const cids = new Set<string>();
  for (const match of content.matchAll(new RegExp(QUOTE_NUMBER_REGEX.source, 'g'))) {
    const num = parseInt(match[1], 10);
    const cid = numberToCid[num];
    if (cid) cids.add(cid);
  }
  return cids.size > 0 ? [...cids] : undefined;
};

export const mergeQuotedCids = (publishCommentOptions: Record<string, any> | undefined, quotedCids: string[] | undefined) => {
  if (!publishCommentOptions || !quotedCids?.length) return publishCommentOptions;
  const currentQuotedCids = publishCommentOptions.quotedCids ?? [];
  const mergedQuotedCids = [...new Set([...currentQuotedCids, ...quotedCids])];

  return {
    ...publishCommentOptions,
    quotedCids: mergedQuotedCids,
  };
};
