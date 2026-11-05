import type { ChallengeVerification, Comment } from '@bitsocial/bitsocial-react-hooks';
import { getFallbackDirectoriesData } from './directories';
import { getCommentCommunityAddress } from './comment-utils';
import { getBoardPath } from './route-utils';
import { stripPostOptionMarkers } from './post-options-utils';

const resolveBoardIdentifier = (communityAddress: unknown): string => {
  if (typeof communityAddress !== 'string' || !communityAddress) {
    return 'unknown board';
  }

  const boardPath = getBoardPath(communityAddress, getFallbackDirectoriesData().communities);
  return boardPath === communityAddress ? communityAddress : `/${boardPath}/`;
};

type ChallengeAnswersInput = string[] | { challengeAnswers?: string[] };

// Optional integration contract with @bitsocial/ai-moderation-challenge. Providers that do not
// return this exact failure continue through 5chan's generic challenge-error handling.
const DUPLICATE_MEDIA_CHALLENGE_ERROR = 'This media was already posted recently.';

export type ChallengePublication = Partial<Omit<Comment, 'publishChallengeAnswers'>> & {
  author?: unknown;
  commentCid?: string;
  communityAddress?: string;
  communityEdit?: unknown;
  content?: string;
  link?: string;
  parentCid?: string;
  publishChallengeAnswers?: (challengeAnswers?: ChallengeAnswersInput) => Promise<void> | void;
  shortCommunityAddress?: string;
  title?: string;
  vote?: number;
};

export const publishPublicationChallengeAnswers = async (publication: ChallengePublication | undefined, challengeAnswers: string[]) => {
  const publishChallengeAnswers = publication?.publishChallengeAnswers;
  if (typeof publishChallengeAnswers !== 'function') return;
  await publishChallengeAnswers.call(publication, { challengeAnswers });
};

export const getChallengeVerificationErrorMessages = (challengeVerification: ChallengeVerification): string[] => {
  const errorMessages: string[] = [];
  if (challengeVerification?.challengeErrors) {
    if (
      typeof challengeVerification.challengeErrors === 'object' &&
      challengeVerification.challengeErrors !== null &&
      !Array.isArray(challengeVerification.challengeErrors)
    ) {
      errorMessages.push(...Object.values(challengeVerification.challengeErrors).filter((val): val is string => typeof val === 'string'));
    } else if (Array.isArray(challengeVerification.challengeErrors)) {
      errorMessages.push(...challengeVerification.challengeErrors.filter((val): val is string => typeof val === 'string'));
    }
  }

  if (typeof challengeVerification?.reason === 'string' && challengeVerification.reason) {
    errorMessages.push(challengeVerification.reason);
  }
  return errorMessages;
};

export const getDuplicateMediaChallengeError = (challengeVerification: ChallengeVerification): string | undefined => {
  if (challengeVerification?.challengeSuccess !== false) return undefined;
  return getChallengeVerificationErrorMessages(challengeVerification).find((message) => message === DUPLICATE_MEDIA_CHALLENGE_ERROR);
};

export const alertChallengeVerificationFailed = (challengeVerification: ChallengeVerification, publication: ChallengePublication | undefined) => {
  if (challengeVerification?.challengeSuccess === false) {
    console.warn('Challenge Verification Failed:', challengeVerification, 'Publication:', publication);

    const errorMessages = getChallengeVerificationErrorMessages(challengeVerification);
    if (challengeVerification?.challengeErrors) {
      if (typeof challengeVerification.challengeErrors !== 'object' || challengeVerification.challengeErrors === null) {
        console.warn('challengeVerification.challengeErrors is not an object or array:', challengeVerification.challengeErrors);
      }
    }

    const messages = [...new Set(errorMessages.map((message) => message.trim()).filter(Boolean))];
    const publicationCommunityAddress = getCommentCommunityAddress(publication);
    const boardIdentifier = resolveBoardIdentifier(publicationCommunityAddress);

    // Boards often run several challenges (e.g. a .bso name, a whitelist, the spam blocker), and each
    // failed one adds its own error; one per line keeps them readable instead of one run-on sentence.
    if (messages.length > 1) {
      alert(`Error from ${boardIdentifier}:\n${messages.map((message) => `- ${message}`).join('\n')}`);
    } else {
      alert(`Error from ${boardIdentifier}: ${messages[0] || 'unknown error'}`);
    }
  } else {
    console.log('Challenge verification succeeded:', challengeVerification);
  }
};

export const getPublicationType = (publication: ChallengePublication | undefined) => {
  if (!publication) {
    return;
  }
  if (typeof publication.vote === 'number') {
    return 'vote';
  }
  if (publication.parentCid) {
    return 'reply';
  }
  if (publication.commentCid) {
    return 'edit';
  }
  if (publication.communityEdit) {
    return 'board edit';
  }
  return 'post';
};

export const getVotePreview = (publication: ChallengePublication | undefined) => {
  if (typeof publication?.vote !== 'number') {
    return '';
  }
  let votePreview = '';
  if (publication.vote === -1) {
    votePreview += ' -1';
  } else {
    votePreview += ` +${publication.vote}`;
  }
  return votePreview;
};

export const getPublicationPreview = (publication: ChallengePublication | undefined) => {
  if (!publication) {
    return '';
  }
  let publicationPreview = '';
  if (publication.title) {
    publicationPreview += publication.title;
  }
  const content = publication.content ? stripPostOptionMarkers(publication.content) : '';
  if (content) {
    if (publicationPreview) {
      publicationPreview += ': ';
    }
    publicationPreview += content;
  }
  if (!publicationPreview && publication.link) {
    publicationPreview += publication.link;
  }

  if (publicationPreview.length > 50) {
    publicationPreview = publicationPreview.substring(0, 50) + '...';
  }
  return publicationPreview;
};
