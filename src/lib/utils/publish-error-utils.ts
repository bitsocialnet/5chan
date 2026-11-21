import type { PublishErrorInfo } from '@bitsocial/bitsocial-react-hooks';

/**
 * Wraps a publish `onError` so it runs only for an error that ended the publish.
 *
 * bitsocial-react-hooks calls `onError(error, publication, {final})`. `final: false` is an error pkc-js recovers from:
 * the publication keeps publishing and can still get a challenge and succeed, so counting a failed post, forgetting a
 * kept tripcode password, deleting a temporary account or showing a "failed" message would all be wrong for it. It is
 * only logged. A missing `info` counts as final, so a caller that does not pass it (an unexpected one, or a test)
 * still ends the publish rather than leaving it waiting for an end that never comes.
 */
export const onFinalPublishError =
  <Publication, Result>(handler: (error: Error, publication?: Publication, info?: PublishErrorInfo) => Result) =>
  (error: Error, publication?: Publication, info?: PublishErrorInfo): Result | undefined => {
    if (info?.final !== false) return handler(error, publication, info);
    console.warn('Publish error pkc-js recovers from, still publishing:', error);
    return undefined;
  };
