/** A failed posting authorization must never fall back to another upload host. */
export class SpamBlockerAuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SpamBlockerAuthorizationError';
  }
}

/** A temporary posting/upload limit, not a failure of a particular upload host. */
export class SpamBlockerRateLimitError extends SpamBlockerAuthorizationError {
  readonly retryAt?: number;
  noticeShown = false;

  constructor(message: string, retryAt?: number) {
    super(message);
    this.name = 'SpamBlockerRateLimitError';
    this.retryAt = retryAt;
  }
}
