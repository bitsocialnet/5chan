import { describe, expect, it } from 'vitest';
import {
  getDirectoryBoardEligibility,
  getDirectoryBoardRequirements,
  getDirectoryBoardRequirementSetting,
  getUnmetDirectoryBoardRequirements,
} from '../directory-board-requirements';

const modQueue = [{ type: 'mod-queue', pendingApproval: true }];

describe('getDirectoryBoardRequirements', () => {
  it('derives the checked settings from the directory features and always requires no galleries and a mod queue', () => {
    expect(getDirectoryBoardRequirements({ pseudonymityMode: 'per-post', safeForWork: true, requirePostLinkIsMedia: true, postsPerPage: 15, noUpvotes: true })).toEqual([
      { type: 'pseudonymityMode', mode: 'per-post' },
      { type: 'safeForWork', safeForWork: true },
      { type: 'requirePostLinkIsMedia' },
      { type: 'noGallery' },
      { type: 'pendingApproval' },
    ]);
  });

  it('requires only no galleries and a mod queue when the directory sets no checked features', () => {
    expect(getDirectoryBoardRequirements(undefined)).toEqual([{ type: 'noGallery' }, { type: 'pendingApproval' }]);
    expect(getDirectoryBoardRequirements({ requirePostLinkIsMedia: false })).toEqual([{ type: 'noGallery' }, { type: 'pendingApproval' }]);
  });

  it('requires the directory rules only when the directory has some', () => {
    expect(getDirectoryBoardRequirements(undefined, ['Stay on topic.'])).toEqual([
      { type: 'noGallery' },
      { type: 'pendingApproval' },
      { type: 'rules', rules: ['Stay on topic.'] },
    ]);
    expect(getDirectoryBoardRequirements(undefined, [])).toEqual([{ type: 'noGallery' }, { type: 'pendingApproval' }]);
  });
});

describe('directory rules requirement', () => {
  const directoryRules = ['Stay on topic.', 'No bots or AI posters.'];
  const requirements = getDirectoryBoardRequirements(undefined, directoryRules);
  const unmetRules = [{ type: 'rules', rules: directoryRules }];

  it('accepts a board that lists the directory rules first, word for word, with its own rules after', () => {
    expect(getUnmetDirectoryBoardRequirements(requirements, { challenges: modQueue, rules: directoryRules })).toEqual([]);
    expect(getUnmetDirectoryBoardRequirements(requirements, { challenges: modQueue, rules: [...directoryRules, 'No reaction images.'] })).toEqual([]);
    expect(getUnmetDirectoryBoardRequirements(requirements, { challenges: modQueue, rules: ['Stay on topic. ', '\nNo bots or AI posters.'] })).toEqual([]);
  });

  it('rejects a board whose rules miss, reword, reorder or come after its own', () => {
    expect(getUnmetDirectoryBoardRequirements(requirements, { challenges: modQueue })).toEqual(unmetRules);
    expect(getUnmetDirectoryBoardRequirements(requirements, { challenges: modQueue, rules: ['Stay on topic.'] })).toEqual(unmetRules);
    expect(getUnmetDirectoryBoardRequirements(requirements, { challenges: modQueue, rules: ['Stay on topic.', 'No bots.'] })).toEqual(unmetRules);
    expect(getUnmetDirectoryBoardRequirements(requirements, { challenges: modQueue, rules: [...directoryRules].reverse() })).toEqual(unmetRules);
    expect(getUnmetDirectoryBoardRequirements(requirements, { challenges: modQueue, rules: ['No reaction images.', ...directoryRules] })).toEqual(unmetRules);
    expect(getUnmetDirectoryBoardRequirements(requirements, { challenges: modQueue, rules: 'Stay on topic.' })).toEqual(unmetRules);
  });
});

describe('no galleries requirement', () => {
  const requirements = getDirectoryBoardRequirements(undefined);

  it('accepts a board whose gallery limits are unset or 0', () => {
    expect(getUnmetDirectoryBoardRequirements(requirements, { challenges: modQueue })).toEqual([]);
    expect(getUnmetDirectoryBoardRequirements(requirements, { features: { maxPostGalleryItems: 0, maxReplyGalleryItems: 0 }, challenges: modQueue })).toEqual([]);
  });

  it('rejects a board that takes galleries in posts or replies', () => {
    expect(getUnmetDirectoryBoardRequirements(requirements, { features: { maxPostGalleryItems: 4 }, challenges: modQueue })).toEqual([{ type: 'noGallery' }]);
    expect(getUnmetDirectoryBoardRequirements(requirements, { features: { maxPostGalleryItems: 0, maxReplyGalleryItems: 1 }, challenges: modQueue })).toEqual([
      { type: 'noGallery' },
    ]);
    expect(getDirectoryBoardEligibility(requirements, { features: { maxPostGalleryItems: 4, maxReplyGalleryItems: 4 }, challenges: modQueue })).toBe('ineligible');
  });
});

describe('getUnmetDirectoryBoardRequirements', () => {
  const requirements = getDirectoryBoardRequirements({ pseudonymityMode: 'per-reply', safeForWork: true, requirePostLinkIsMedia: true });

  it('accepts a record that publishes every required setting', () => {
    const record = { features: { pseudonymityMode: 'per-reply', safeForWork: true, requirePostLinkIsMedia: true }, challenges: modQueue };

    expect(getUnmetDirectoryBoardRequirements(requirements, record)).toEqual([]);
    expect(getDirectoryBoardEligibility(requirements, record)).toBe('eligible');
  });

  it('lists each setting the record does not publish', () => {
    const record = { features: { pseudonymityMode: 'per-author', safeForWork: true }, challenges: [{ type: 'captcha' }] };

    expect(getUnmetDirectoryBoardRequirements(requirements, record)).toEqual([
      { type: 'pseudonymityMode', mode: 'per-reply' },
      { type: 'requirePostLinkIsMedia' },
      { type: 'pendingApproval' },
    ]);
    expect(getDirectoryBoardEligibility(requirements, record)).toBe('ineligible');
  });

  it('lets an NSFW board leave the safe-for-work flag unset but not claim it', () => {
    const nsfw = getDirectoryBoardRequirements({ safeForWork: false });

    expect(getUnmetDirectoryBoardRequirements(nsfw, { challenges: modQueue })).toEqual([]);
    expect(getUnmetDirectoryBoardRequirements(nsfw, { features: { safeForWork: false }, challenges: modQueue })).toEqual([]);
    expect(getUnmetDirectoryBoardRequirements(nsfw, { features: { safeForWork: true }, challenges: modQueue })).toEqual([{ type: 'safeForWork', safeForWork: false }]);
  });

  it('treats malformed record fields as unset', () => {
    // Unset gallery limits keep galleries off, so only that requirement is met.
    expect(getUnmetDirectoryBoardRequirements(requirements, { features: 'per-reply', challenges: { pendingApproval: true } })).toEqual(
      requirements.filter((requirement) => requirement.type !== 'noGallery'),
    );
  });
});

describe('getDirectoryBoardEligibility', () => {
  it('is unknown until the record has loaded', () => {
    expect(getDirectoryBoardEligibility([{ type: 'pendingApproval' }], undefined)).toBe('unknown');
  });
});

describe('getDirectoryBoardRequirementSetting', () => {
  it('names the record setting an owner changes', () => {
    expect(getDirectoryBoardRequirementSetting({ type: 'pseudonymityMode', mode: 'per-post' })).toBe('features.pseudonymityMode: per-post');
    expect(getDirectoryBoardRequirementSetting({ type: 'noGallery' })).toBe('features.maxPostGalleryItems, features.maxReplyGalleryItems: 0');
    expect(getDirectoryBoardRequirementSetting({ type: 'pendingApproval' })).toBe('challenges[].pendingApproval: true');
    expect(getDirectoryBoardRequirementSetting({ type: 'rules', rules: ['a'] })).toBe('rules[0]');
    expect(getDirectoryBoardRequirementSetting({ type: 'rules', rules: ['a', 'b', 'c'] })).toBe('rules[0..2]');
  });
});
