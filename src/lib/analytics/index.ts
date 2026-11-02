import { isAnalyticsEnabled, type PostingAnalyticsEvent } from './shared';

export { isAnalyticsEnabled, type PostingAnalyticsEvent } from './shared';

let clientPromise: Promise<typeof import('./client')> | undefined;
const getClient = () => (clientPromise ??= import('./client'));

// Keep both the SDK and its route normalization out of the startup graph. Failed
// downloads/dispatches are ignored, so analytics cannot interrupt browsing/posting.
export const trackPageView = (pathname: string): void => {
  if (!isAnalyticsEnabled()) return;
  void getClient()
    .then((client) => client.trackPageView(pathname))
    .catch(() => {});
};

export const trackPostingEvent = (event: PostingAnalyticsEvent, context: { kind: 'thread' | 'reply' }): void => {
  if (!isAnalyticsEnabled()) return;
  void getClient()
    .then((client) => client.trackPostingEvent(event, context))
    .catch(() => {});
};
