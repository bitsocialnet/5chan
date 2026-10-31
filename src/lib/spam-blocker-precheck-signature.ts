import { ed25519 } from '@noble/curves/ed25519.js';
import * as cborg from 'cborg';
import type { PrecheckPublication } from './spam-blocker-precheck';

// Loaded only when a pre-check runs, so the signing code stays out of the board's startup bundle.

const base64ToBytes = (base64: string) => Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));

const bytesToBase64Url = (bytes: Uint8Array) => {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

/** CBOR encodes undefined as a value of its own, which the server would then sign over too. */
const withoutUndefined = <T extends object>(value: T): T => Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;

/**
 * The pre-check request, signed by the author's key so the spam blocker scores the author who will publish.
 * Returned as the base64url CBOR payload the pre-check iframe reads from its URL fragment.
 */
export const createSignedPrecheckPayload = ({
  communityAddress,
  privateKey,
  publication,
  sessionId,
  timestamp,
}: {
  communityAddress: string;
  privateKey: string;
  publication: PrecheckPublication;
  sessionId: string;
  timestamp: number;
}) => {
  const privateKeyBytes = base64ToBytes(privateKey);
  const propsToSign = {
    sessionId,
    communityAddress,
    publication: withoutUndefined({ ...publication, author: withoutUndefined(publication.author) }),
    timestamp,
  };
  // noble only accepts a plain Uint8Array, which cborg's output is not when it is a Buffer.
  const signedBytes = Uint8Array.from(cborg.encode(propsToSign));
  const signature = ed25519.sign(signedBytes, privateKeyBytes);
  const publicKey = ed25519.getPublicKey(privateKeyBytes);
  const payload = { ...propsToSign, signature: { signature, publicKey, type: 'ed25519', signedPropertyNames: Object.keys(propsToSign) } };
  return bytesToBase64Url(cborg.encode(payload));
};
