// Mirrors the `boardSettings` of 5chan-board-manager's bundled preset
// (https://github.com/bitsocialnet/5chan-board-manager/blob/master/src/presets/community-defaults.jsonc)
// so a board created in the app behaves like one set up with `5chan board add --apply-defaults`.
// Challenge excludes use `roles`: pkc-js 0.0.101 rejects the preset's older `role` field, and older
// nodes ignore the unknown key instead of failing the whole edit.

export const SPAM_BLOCKER_CHALLENGE_NAME = '@bitsocial/spam-blocker-challenge';

const MOD_ROLES = ['moderator', 'admin', 'owner'];

export const MOD_ROLES_EXCLUDE = { roles: MOD_ROLES };

export const BOARD_DEFAULT_FEATURES = {
  noUpvotes: true,
  noDownvotes: true,
  requirePostLink: true,
  requirePostLinkIsMedia: true,
  requireReplyLink: false,
  requireReplyLinkIsMedia: true,
  pseudonymityMode: 'per-post',
};

export const BOARD_DEFAULT_SETTINGS = {
  // Lets clients size link-hosted media before it loads. The node fetches the links directly
  // unless settings.fetchThumbnailUrlsProxyUrl is also set.
  fetchThumbnailUrls: true,
};

export const BOARD_DEFAULT_FAIL_CHALLENGES = [
  {
    name: 'fail',
    description: 'Blocks authors with excessive failed captcha attempts.',
    options: { error: 'Too many failed attempts. Try again later.' },
    exclude: [MOD_ROLES_EXCLUDE, { rateLimit: 5, rateLimitChallengeSuccess: false }],
  },
  {
    name: 'fail',
    description: 'Disables CommentEdit publications on this board.',
    options: { error: 'Comment edits are disabled on this board.' },
    exclude: [MOD_ROLES_EXCLUDE, { publicationType: { post: true, reply: true, vote: true, commentModeration: true, communityEdit: true } }],
  },
];

const getSpamBlockerTrustExcludes = (rateLimit: number) => [
  { postCount: 10, firstCommentTimestamp: 604800, rateLimit, rateLimitChallengeSuccess: true },
  { replyCount: 20, firstCommentTimestamp: 604800, rateLimit, rateLimitChallengeSuccess: true },
];

export const BOARD_DEFAULT_SPAM_BLOCKER_CHALLENGES = [
  {
    name: SPAM_BLOCKER_CHALLENGE_NAME,
    description: 'Post spam-blocker for untrusted or rate-exceeded users.',
    pendingApproval: true,
    exclude: [{ publicationType: { reply: true } }, MOD_ROLES_EXCLUDE, ...getSpamBlockerTrustExcludes(3)],
  },
  {
    name: SPAM_BLOCKER_CHALLENGE_NAME,
    description: 'Reply spam-blocker for untrusted or rate-exceeded users.',
    pendingApproval: true,
    exclude: [{ publicationType: { post: true } }, MOD_ROLES_EXCLUDE, ...getSpamBlockerTrustExcludes(6)],
  },
];

export const BOARD_MANAGER_URL = 'https://github.com/bitsocialnet/5chan-board-manager';
