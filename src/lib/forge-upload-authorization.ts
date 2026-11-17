import { SpamBlockerAuthorizationError } from './spam-blocker-errors';
import { postSignedSpamBlockerRequest } from './spam-blocker-precheck';
/** Called with the exact metadata-stripped bytes that Forge will receive. */
export type ForgeUploadAuthorizer = (file: File) => Promise<string>;

export const createForgeUploadAuthorizer =
  ({
    serverUrl,
    communityAddress,
    authorAddress,
    authorName,
    privateKey,
    precheckSessionId,
    parentCid,
  }: {
    serverUrl: string;
    communityAddress: string;
    authorAddress: string;
    authorName?: string;
    privateKey: string;
    precheckSessionId?: string;
    parentCid?: string;
  }): ForgeUploadAuthorizer =>
  async (file) => {
    try {
      const { createSignedUploadAuthorizationPayload } = await import('./spam-blocker-precheck-signature');
      const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()));
      const upload = {
        sha256: Array.from(hash, (byte) => byte.toString(16).padStart(2, '0')).join(''),
        byteLength: file.size,
        mimeType: file.type || 'application/octet-stream',
      };
      const body = createSignedUploadAuthorizationPayload({ privateKey, communityAddress, authorAddress, authorName, precheckSessionId, parentCid, upload });
      const { ok, body: result } = await postSignedSpamBlockerRequest({ url: `${serverUrl}/upload/authorize`, body });
      if (!ok || !result || typeof result !== 'object' || !('token' in result) || typeof result.token !== 'string') {
        const message =
          result && typeof result === 'object' && 'message' in result && typeof result.message === 'string'
            ? result.message
            : 'Could not authorize the upload. Try again.';
        throw new Error(message);
      }
      return btoa(JSON.stringify({ token: result.token, ...upload }))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
    } catch (error) {
      if (error instanceof SpamBlockerAuthorizationError) throw error;
      throw new SpamBlockerAuthorizationError(error instanceof Error ? error.message : 'Could not authorize the upload. Try again.');
    }
  };
