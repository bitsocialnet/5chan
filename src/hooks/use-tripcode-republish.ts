import { useCallback, useRef } from 'react';
import type { PublishCommentOptions } from '@bitsocial/bitsocial-react-hooks';
import type { TripcodeSecret } from '../lib/utils/tripcode-utils';
import useSignTripcode from './use-sign-tripcode';

interface RepublishTripcode {
  /** The proof the post publishes now. */
  displayName: string;
  secret: TripcodeSecret;
  /** The name the proof signed, before the proof was added. */
  name: string | undefined;
}

/**
 * A tripcode's proof signs the post's timestamp, and after a wrong challenge answer the hooks publish the
 * post again with a new one, which would leave it without its trip. This keeps the signed post's password
 * in memory only, never in state or storage, and signs the proof again before each of its republishes.
 *
 * Like usePublishComment, it follows one publish at a time: keeping a new post's password replaces the
 * last one, and the caller forgets it when the publish ends (accepted, abandoned or failed). A board that
 * rejects the post outright ends the publish without an error, so its password stays until this hook keeps
 * another one or unmounts; once unmounted, nothing but the finished publish refers to it.
 */
const useTripcodeRepublish = () => {
  const signTripcode = useSignTripcode();
  const tripcodeRef = useRef<RepublishTripcode | undefined>(undefined);

  /** Keeps the password of the post just signed, for its republishes. */
  const keepTripcode = useCallback((tripcode: RepublishTripcode) => {
    tripcodeRef.current = tripcode;
  }, []);

  /** Drops the kept password once the publish ended. */
  const forgetTripcode = useCallback(() => {
    tripcodeRef.current = undefined;
  }, []);

  /** The hooks' onBeforeRepublish: the options to republish with a proof signed over their new timestamp. */
  const onBeforeRepublish = useCallback(
    async (options: PublishCommentOptions): Promise<PublishCommentOptions> => {
      const tripcode = tripcodeRef.current;
      // A post published before the kept one is not signed with its password.
      if (!tripcode || tripcode.displayName !== options.author?.displayName) return options;

      // The same object on every read, so signing does not take the options for changed ones.
      const unsignedOptions = { ...options, author: { ...options.author, displayName: tripcode.name } };
      let resignedOptions: PublishCommentOptions | undefined;
      try {
        await signTripcode({
          secret: tripcode.secret,
          readOptions: () => unsignedOptions,
          writeOptions: ({ displayName, timestamp }) => {
            // Not when the publish ended, or another post was kept, while this one was signed.
            if (tripcodeRef.current === tripcode) tripcodeRef.current = { ...tripcode, displayName };
            resignedOptions = { ...unsignedOptions, timestamp, author: { ...unsignedOptions.author, displayName } };
          },
          // The hooks drop the result themselves when the publish was abandoned meanwhile.
          isActive: () => true,
        });
      } catch (error) {
        // The hooks end the publish with this error.
        if (tripcodeRef.current === tripcode) tripcodeRef.current = undefined;
        throw error;
      }
      // Republishing the old proof would show the post without its trip; failing reports the error instead.
      if (!resignedOptions) throw new Error('The tripcode was not signed again before the republish');
      return resignedOptions;
    },
    [signTripcode],
  );

  return { keepTripcode, forgetTripcode, onBeforeRepublish };
};

export default useTripcodeRepublish;
