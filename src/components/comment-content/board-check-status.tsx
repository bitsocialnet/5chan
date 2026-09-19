import { useCommunity } from '@bitsocial/bitsocial-react-hooks';
import { Trans, useTranslation } from 'react-i18next';
import { useCommunityIdentifier } from '../../hooks/use-community-identifiers';
import LoadingEllipsis from '../loading-ellipsis/loading-ellipsis';

const BoardCheckStatus = ({ communityAddress, verifyingAnswers }: { communityAddress?: string; verifyingAnswers: boolean }) => {
  const { t } = useTranslation();
  const communityIdentifier = useCommunityIdentifier(communityAddress);
  const community = useCommunity(communityIdentifier ? { community: communityIdentifier, onlyIfCached: true } : undefined);
  // Match the package's explicit public metadata, never board names or loose mentions of AI.
  // Customized/unknown descriptions deliberately fall back to the generic board-check message.
  const usesAiModeration =
    Boolean(communityIdentifier) &&
    Array.isArray(community.challenges) &&
    community.challenges.some((challenge) => challenge?.type === 'text/plain' && challenge.description === 'Moderate Bitsocial publications with AI.');

  return (
    <>
      <LoadingEllipsis string={verifyingAnswers ? t('waiting_board_challenge_verification') : t('waiting_board_post_check')} />
      {/* The initial wait may precede Spamblocker; submitted answers do not prove AI has started. */}
      {verifyingAnswers && usesAiModeration && (
        <>
          <br />
          <Trans
            i18nKey='board_uses_ai_moderation'
            components={{ 1: <a href='https://bitsocial.net/apps/ai-moderation-challenge' target='_blank' rel='noopener noreferrer' /> }}
          />
        </>
      )}
    </>
  );
};

export default BoardCheckStatus;
