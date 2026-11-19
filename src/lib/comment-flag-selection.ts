import { getBoardFlagDefinition, getBoardFlagDefinitions, type BoardFlagKind } from './board-flags';
import type { ChallengeAnswersByIndex } from '@bitsocial/bitsocial-react-hooks';
import type { DirectoryCommunity } from './utils/directory-list-utils';

const GEOGRAPHIC_LOCATION_FLAG_VALUE = 'country:auto';
const NO_FLAG_VALUE = 'none';
const FLAG_CHALLENGE_ANSWER_PREFIX = 'bitsocial-flags:5chan:';
// How @bitsocial/flags-challenge describes itself in `community.challenges`, which exposes no challenge name.
const FLAGS_CHALLENGE_TYPE = 'url/iframe';
const FLAGS_CHALLENGE_DESCRIPTION = 'Add verified flag assertions to Bitsocial comments.';

export interface CommentFlagSelectOption {
  value: string;
  label: string;
}

export interface CommentFlagRequest {
  type: 'country' | BoardFlagKind;
  code: string;
  text: string;
}

interface CommentFlagChallengeRequest {
  challengeAnswers: ChallengeAnswersByIndex;
}

export interface CommentFlagPublishOptions {
  challengeRequest: CommentFlagChallengeRequest | undefined;
  flairs: CommentFlagRequest[] | undefined;
}

export type CommentFlagDirectory = Partial<Pick<DirectoryCommunity, 'directoryCode' | 'features' | 'title'>>;

const GEOGRAPHIC_LOCATION_OPTION: CommentFlagSelectOption = {
  value: GEOGRAPHIC_LOCATION_FLAG_VALUE,
  label: 'Geographic Location',
};

const NO_FLAG_OPTION: CommentFlagSelectOption = {
  value: NO_FLAG_VALUE,
  label: 'None',
};

/** Boards that always publish geographic location without showing a flag selector. */
const AUTO_GEOGRAPHIC_FLAG_DIRECTORY_CODES = new Set(['bant', 'int', 'sp']);

const getDirectoryCode = (directory: Pick<DirectoryCommunity, 'directoryCode' | 'title'> | undefined): string | undefined => {
  const directoryCode = directory?.directoryCode?.trim().toLowerCase();
  return directoryCode || directory?.title?.match(/^\/([^/]+)\//)?.[1]?.toLowerCase();
};

export const hasCommentFlagsForDirectory = (directory: CommentFlagDirectory | undefined): boolean => {
  return directory?.features?.hasFlags === true;
};

const getBoardFlagOptions = (kind: BoardFlagKind): CommentFlagSelectOption[] =>
  getBoardFlagDefinitions(kind).map((flag) => ({
    value: `${flag.kind}:${flag.code}`,
    label: flag.label,
  }));

export const getCommentFlagOptionsForDirectory = (directory: CommentFlagDirectory | undefined): CommentFlagSelectOption[] => {
  if (!hasCommentFlagsForDirectory(directory)) {
    return [];
  }

  const directoryCode = getDirectoryCode(directory);
  if (directoryCode && AUTO_GEOGRAPHIC_FLAG_DIRECTORY_CODES.has(directoryCode)) {
    return [];
  }

  if (directoryCode === 'mlp') {
    return [NO_FLAG_OPTION, ...getBoardFlagOptions('pony')];
  }

  if (directoryCode === 'pol') {
    return [GEOGRAPHIC_LOCATION_OPTION, ...getBoardFlagOptions('pol')];
  }

  return [GEOGRAPHIC_LOCATION_OPTION];
};

/** `challenges` is the board's `community.challenges`, where a country flag's pre-answer finds the flags challenge. */
export const getCommentFlagPublishOptionsForDirectory = (
  directory: CommentFlagDirectory | undefined,
  selectedValue?: string,
  challenges?: unknown,
): CommentFlagPublishOptions => {
  if (!hasCommentFlagsForDirectory(directory)) {
    return {
      challengeRequest: undefined,
      flairs: undefined,
    };
  }

  const directoryCode = getDirectoryCode(directory);
  if (directoryCode && AUTO_GEOGRAPHIC_FLAG_DIRECTORY_CODES.has(directoryCode)) {
    return getCommentFlagPublishOptionsFromSelection(GEOGRAPHIC_LOCATION_FLAG_VALUE, challenges);
  }

  const flagOptions = getCommentFlagOptionsForDirectory(directory);
  if (flagOptions.length === 0) {
    return {
      challengeRequest: undefined,
      flairs: undefined,
    };
  }

  return getCommentFlagPublishOptionsFromSelection(selectedValue ?? flagOptions[0]?.value, challenges);
};

export const getCommentFlagRequestFromSelection = (value: string | undefined): CommentFlagRequest | undefined => {
  if (!value || value === NO_FLAG_VALUE) {
    return undefined;
  }

  if (value === GEOGRAPHIC_LOCATION_FLAG_VALUE) {
    return {
      type: 'country',
      code: 'auto',
      text: 'flag:country:auto',
    };
  }

  const match = value.match(/^(pol|pony):([A-Z0-9]+)$/);
  if (!match) {
    return undefined;
  }

  const [, kind, code] = match;
  const flag = getBoardFlagDefinition(kind, code);
  return flag
    ? {
        type: flag.kind,
        code: flag.code,
        text: `flag:${flag.kind}:${flag.code}`,
      }
    : undefined;
};

/** The challenge index of each flags challenge in the board's `community.challenges`. */
const getFlagsChallengeIndexes = (challenges: unknown): number[] =>
  Array.isArray(challenges)
    ? challenges.flatMap((challenge, index) => (challenge?.type === FLAGS_CHALLENGE_TYPE && challenge?.description === FLAGS_CHALLENGE_DESCRIPTION ? [index] : []))
    : [];

/**
 * A country flag is also pre-answered to the flags challenge, which reads its own answer first. The answer goes
 * only under that challenge's index; without one on the board the challenge still reads the flag from `flairs`.
 */
const getCountryFlagChallengeRequest = (flag: CommentFlagRequest, challenges: unknown): CommentFlagChallengeRequest | undefined => {
  const flagsChallengeIndexes = getFlagsChallengeIndexes(challenges);
  if (flag.type !== 'country' || flagsChallengeIndexes.length === 0) return undefined;
  const answer = `${FLAG_CHALLENGE_ANSWER_PREFIX}${flag.text}`;
  return { challengeAnswers: Object.fromEntries(flagsChallengeIndexes.map((index) => [String(index), answer])) };
};

export const getCommentFlagPublishOptionsFromSelection = (value: string | undefined, challenges?: unknown): CommentFlagPublishOptions => {
  const flag = getCommentFlagRequestFromSelection(value);
  return flag
    ? {
        challengeRequest: getCountryFlagChallengeRequest(flag, challenges),
        flairs: [flag],
      }
    : {
        challengeRequest: undefined,
        flairs: undefined,
      };
};
