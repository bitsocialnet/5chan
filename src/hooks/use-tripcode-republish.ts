import { useCallback, useRef } from 'react';
import type { PublishCommentOptions } from '@bitsocial/bitsocial-react-hooks';
import type { TripcodeSecret } from '../lib/utils/tripcode-utils';
import useSignTripcode from './use-sign-tripcode';

interface RepublishTripcode {
  secret: TripcodeSecret;
  /** The name the proof signed, before the proof was added. */
  name: string | undefined;
}

/**
 * A tripcode's proof signs the post's timestamp, and after a wrong challenge answer the hooks publish the
 * post again with a new one, which would leave it without its trip. This keeps each signed post's password
 * in memory only, never in state or storage, until the board accepts the post, and signs the proof again
 * before each of its republishes. Posts are found by the proof they publish, so a publish that started
 * later in the same form cannot sign another post's republish.
 */
const useTripcodeRepublish = () => {
  const signTripcode = useSignTripcode();
  const tripcodesRef = useRef(new Map<string, RepublishTripcode>());

  /** Keeps the password of the post published with the proof displayName, for its republishes. */
  const keepTripcode = useCallback((displayName: string, tripcode: RepublishTripcode) => {
    tripcodesRef.current.set(displayName, tripcode);
  }, []);

  /** Drops a post's password once the board accepted it. */
  const forgetTripcode = useCallback((displayName: string | undefined) => {
    if (displayName) tripcodesRef.current.delete(displayName);
  }, []);

  /** The hooks' onBeforeRepublish: the options to republish with a proof signed over their new timestamp. */
  const onBeforeRepublish = useCallback(
    async (options: PublishCommentOptions): Promise<PublishCommentOptions> => {
      const displayName = options.author?.displayName;
      const tripcode = typeof displayName === 'string' ? tripcodesRef.current.get(displayName) : undefined;
      if (!tripcode) return options;
      tripcodesRef.current.delete(displayName);

      // The same object on every read, so signing does not take the options for changed ones.
      const unsignedOptions = { ...options, author: { ...options.author, displayName: tripcode.name } };
      let resignedOptions: PublishCommentOptions | undefined;
      await signTripcode({
        secret: tripcode.secret,
        readOptions: () => unsignedOptions,
        writeOptions: ({ displayName: resignedDisplayName, timestamp }) => {
          tripcodesRef.current.set(resignedDisplayName, tripcode);
          resignedOptions = { ...unsignedOptions, timestamp, author: { ...unsignedOptions.author, displayName: resignedDisplayName } };
        },
        // The hooks drop the result themselves when the publish was abandoned meanwhile.
        isActive: () => true,
      });
      // Republishing the old proof would show the post without its trip; failing reports the error instead.
      if (!resignedOptions) throw new Error('The tripcode was not signed again before the republish');
      return resignedOptions;
    },
    [signTripcode],
  );

  return { keepTripcode, forgetTripcode, onBeforeRepublish };
};

export default useTripcodeRepublish;
