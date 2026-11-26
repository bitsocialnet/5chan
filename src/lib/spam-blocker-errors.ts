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

/**
 * The spam blocker did not answer: the request failed, or something other than the server answered it (a dead
 * tunnel's or proxy's error page). Uploads stay blocked, since every upload host depends on its checks.
 */
export class SpamBlockerUnreachableError extends SpamBlockerAuthorizationError {
  readonly host: string;

  constructor(host: string) {
    super(`Bitsocial Spam Blocker (${host}) is unreachable right now, so files cannot be uploaded. Try again later.`);
    this.name = 'SpamBlockerUnreachableError';
    this.host = host;
  }
}
