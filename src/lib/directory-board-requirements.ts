import { isRecord, type DirectoryFeatures } from './utils/directory-list-utils';

/**
 * A setting a board must publish in its signed community record to host a 5chan directory. The
 * per-directory values come from the directory defaults in bitsocialnet/lists; every board also
 * needs a pending-approval challenge so new posters go through the mod queue, and must list the
 * directory's rules before its own. Whether rules are enforced, uptime and auto-archiving are not
 * in the record, so they cannot be checked here.
 */
export type DirectoryBoardRequirement =
  | { type: 'pseudonymityMode'; mode: string }
  | { type: 'safeForWork'; safeForWork: boolean }
  | { type: 'requirePostLinkIsMedia' }
  | { type: 'pendingApproval' }
  | { type: 'rules'; rules: string[] };

/** The public parts of a community record the requirements are checked against. */
export interface DirectoryBoardRecord {
  features?: unknown;
  challenges?: unknown;
  rules?: unknown;
}

export const getDirectoryBoardRequirements = (features: DirectoryFeatures | undefined, rules?: string[]): DirectoryBoardRequirement[] => [
  ...(typeof features?.pseudonymityMode === 'string' ? [{ type: 'pseudonymityMode' as const, mode: features.pseudonymityMode }] : []),
  ...(typeof features?.safeForWork === 'boolean' ? [{ type: 'safeForWork' as const, safeForWork: features.safeForWork }] : []),
  ...(features?.requirePostLinkIsMedia === true ? [{ type: 'requirePostLinkIsMedia' as const }] : []),
  { type: 'pendingApproval' },
  ...(rules && rules.length > 0 ? [{ type: 'rules' as const, rules }] : []),
];

const meetsRequirement = (requirement: DirectoryBoardRequirement, record: DirectoryBoardRecord): boolean => {
  const features = isRecord(record.features) ? record.features : {};
  switch (requirement.type) {
    case 'pseudonymityMode':
      return features.pseudonymityMode === requirement.mode;
    case 'safeForWork':
      // An NSFW board only has to not claim to be safe for work; leaving the flag unset is fine.
      return requirement.safeForWork ? features.safeForWork === true : features.safeForWork !== true;
    case 'requirePostLinkIsMedia':
      return features.requirePostLinkIsMedia === true;
    case 'pendingApproval':
      return Array.isArray(record.challenges) && record.challenges.some((challenge) => isRecord(challenge) && challenge.pendingApproval === true);
    case 'rules': {
      // Moderators, the AI moderation challenge included, enforce the board's own rules, so the
      // directory's rules must be among them. Listing them first and in order keeps "rule N" the same
      // rule on every board and on /rules#<code>.
      const boardRules = record.rules;
      return Array.isArray(boardRules) && requirement.rules.every((rule, index) => typeof boardRules[index] === 'string' && boardRules[index].trim() === rule.trim());
    }
  }
};

export const getUnmetDirectoryBoardRequirements = (requirements: DirectoryBoardRequirement[], record: DirectoryBoardRecord): DirectoryBoardRequirement[] =>
  requirements.filter((requirement) => !meetsRequirement(requirement, record));

/** `unknown` until the board's record has loaded. */
export type DirectoryBoardEligibility = 'eligible' | 'ineligible' | 'unknown';

export const getDirectoryBoardEligibility = (requirements: DirectoryBoardRequirement[], record: DirectoryBoardRecord | undefined): DirectoryBoardEligibility => {
  if (!record) return 'unknown';
  return getUnmetDirectoryBoardRequirements(requirements, record).length === 0 ? 'eligible' : 'ineligible';
};

/** The setting an owner changes to meet a requirement, as named in the community record. */
export const getDirectoryBoardRequirementSetting = (requirement: DirectoryBoardRequirement): string => {
  switch (requirement.type) {
    case 'pseudonymityMode':
      return `features.pseudonymityMode: ${requirement.mode}`;
    case 'safeForWork':
      return requirement.safeForWork ? 'features.safeForWork: true' : 'features.safeForWork: false';
    case 'requirePostLinkIsMedia':
      return 'features.requirePostLinkIsMedia: true';
    case 'pendingApproval':
      return 'challenges[].pendingApproval: true';
    case 'rules':
      return requirement.rules.length === 1 ? 'rules[0]' : `rules[0..${requirement.rules.length - 1}]`;
  }
};
