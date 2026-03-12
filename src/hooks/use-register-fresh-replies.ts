import { useEffect, useRef } from 'react';
import type { Comment } from '@bitsocialnet/bitsocial-react-hooks';
import usePostNumberStore from '../stores/use-post-number-store';

/**
 * Registers post and fresh replies with the post-number store so backlinks
 * and post numbers stay in sync when replies gain their number from account comments.
 * Uses a fingerprint (cidsKey) to avoid redundant registerComments calls.
 */
const useRegisterFreshReplies = (post: Comment | undefined, freshRepliesForRender: Comment[]) => {
  const registerComments = usePostNumberStore((s) => s.registerComments);
  const prevCidsRef = useRef<string>('');

  useEffect(() => {
    const all = post ? [post, ...freshRepliesForRender] : freshRepliesForRender;
    if (!all.length) return;

    const cidsKey = all
      .map((comment) => {
        const commentKey = comment?.cid ?? (typeof comment?.index === 'number' ? `index:${comment.index}` : `timestamp:${comment?.timestamp ?? ''}`);
        return `${comment?.subplebbitAddress ?? ''}:${commentKey}:${typeof comment?.number === 'number' ? comment.number : ''}`;
      })
      .sort()
      .join(',');

    if (cidsKey === prevCidsRef.current) return;
    prevCidsRef.current = cidsKey;
    registerComments(all);
  }, [post, freshRepliesForRender, registerComments]);
};

export default useRegisterFreshReplies;
