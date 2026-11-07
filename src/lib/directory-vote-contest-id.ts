// Testnet manifests use `5chan-dir-<code>-vote-test-<n>`; the mainnet manifest may drop `test-`.
const DIRECTORY_CONTEST_ID_PATTERN = /^5chan-dir-(.+)-vote-(?:test-)?\d+$/;

/**
 * The directory code a contest votes on, read from its `contestId`. Kept apart from the criteria
 * loader so the board routes can map a vote to its directory without loading pubsub-voting.
 */
export const getDirectoryCodeFromContestId = (contestId: string): string | undefined => DIRECTORY_CONTEST_ID_PATTERN.exec(contestId)?.[1];
