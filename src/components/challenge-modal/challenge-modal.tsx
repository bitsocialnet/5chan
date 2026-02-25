import { useRef, useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Challenge as ChallengeType, useAccount, useComment } from '@plebbit/plebbit-react-hooks';
import { getPublicationPreview, getPublicationType, getVotePreview } from '../../lib/utils/challenge-utils';
import useIsMobile from '../../hooks/use-is-mobile';
import useChallengesStore from '../../stores/use-challenges-store';
import useTheme from '../../hooks/use-theme';
import styles from './challenge-modal.module.css';
import capitalize from 'lodash/capitalize';
import { useSpring, animated } from '@react-spring/web';
import { useDrag } from '@use-gesture/react';

const useParentAddress = (parentCid?: string) => {
  const parentComment = useComment({ commentCid: parentCid, onlyIfCached: true });
  return parentComment?.author?.shortAddress;
};

interface ChallengeProps {
  challenge: ChallengeType;
  closeModal: () => void;
}

const TextChallenge = ({ challenge }: { challenge: string }) => <div className={styles.challengeMedia}>{challenge}</div>;

const ImageChallenge = ({ challenge }: { challenge: string }) => <img alt='' className={styles.challengeMedia} src={`data:image/png;base64,${challenge}`} />;

interface IframeChallengeProps {
  challenge: string;
  shortSubplebbitAddress?: string;
  subplebbitAddress?: string;
  readableUrl: string;
  closeModal: () => void;
  onDone: () => void;
  publicationDetails: React.ReactNode;
}

const IframeChallenge = ({ challenge, shortSubplebbitAddress, subplebbitAddress, readableUrl, closeModal, onDone, publicationDetails }: IframeChallengeProps) => {
  const account = useAccount();
  const [theme] = useTheme();
  const [showIframeConfirmation, setShowIframeConfirmation] = useState(true);
  const [iframeUrlState, setIframeUrl] = useState('');
  const [iframeOrigin, setIframeOrigin] = useState('');
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const handleLoadIframe = useCallback(() => {
    const iframeUrl = challenge;
    if (!iframeUrl) return;

    const rawUserAddress = account?.author?.address?.trim();
    const requiresUserAddress = iframeUrl.includes('{userAddress}');

    if (requiresUserAddress && !rawUserAddress) {
      alert('Error: Unable to load challenge without your address. Please sign in and try again.');
      return;
    }

    const encodedAddress = rawUserAddress ? encodeURIComponent(rawUserAddress) : undefined;
    const replacedUrl = requiresUserAddress && encodedAddress ? iframeUrl.replace(/\{userAddress\}/g, encodedAddress) : iframeUrl;

    try {
      const validatedUrl = new URL(replacedUrl);
      if (validatedUrl.protocol !== 'https:') {
        throw new Error('Only HTTPS iframe challenges are supported');
      }
      validatedUrl.pathname = validatedUrl.pathname.replace(/\/{2,}/g, '/');
      validatedUrl.searchParams.set('theme', theme);
      const finalUrl = validatedUrl.toString();
      setIframeUrl(finalUrl);
      setIframeOrigin(validatedUrl.origin);
      setShowIframeConfirmation(false);
    } catch (error) {
      console.error('Invalid iframe challenge URL', { error });
      alert('Error: Invalid URL for authentication challenge');
      closeModal();
    }
  }, [account, challenge, closeModal, theme]);

  const sendThemeToIframe = useCallback(() => {
    if (!iframeRef.current || !iframeOrigin) return;
    try {
      iframeRef.current.contentWindow?.postMessage({ type: 'plebbit-theme', theme, source: 'plebbit-5chan' }, iframeOrigin);
    } catch (error) {
      console.warn('Could not send theme to iframe:', error);
    }
  }, [iframeOrigin, theme]);

  const handleIframeLoad = () => {
    sendThemeToIframe();
  };

  useEffect(() => {
    if (iframeRef.current && iframeUrlState && iframeOrigin && !showIframeConfirmation) {
      sendThemeToIframe();
    }
  }, [iframeOrigin, iframeUrlState, sendThemeToIframe, showIframeConfirmation]);

  if (showIframeConfirmation) {
    return (
      <>
        {publicationDetails}
        <div className={styles.challengeMediaWrapper}>
          <div className={`${styles.challengeMedia} ${styles.iframeChallengeWarning}`}>
            {shortSubplebbitAddress || subplebbitAddress || 'unknown board'} wants to open {readableUrl || 'an external site'}
          </div>
        </div>
        <div className={`${styles.challengeFooter} ${styles.iframeFooter}`}>
          <span className={styles.buttons}>
            <button onClick={handleLoadIframe}>Open</button>
            <button onClick={closeModal}>Cancel</button>
          </span>
        </div>
      </>
    );
  }

  return (
    <>
      <div className={`${styles.challengeMediaWrapper} ${styles.iframeWrapper}`}>
        <iframe
          ref={iframeRef}
          src={iframeUrlState}
          sandbox='allow-scripts allow-forms allow-popups allow-same-origin allow-top-navigation-by-user-activation'
          onLoad={handleIframeLoad}
          className={styles.iframe}
          title='Challenge authentication'
        />
      </div>
      <div className={`${styles.challengeFooter} ${styles.iframeFooter}`}>
        <div className={styles.iframeCloseButton}>
          <button onClick={onDone}>Done</button>
        </div>
      </div>
    </>
  );
};

const Challenge = ({ challenge, closeModal }: ChallengeProps) => {
  const { t } = useTranslation();

  const challenges = challenge?.[0]?.challenges;
  const publication = challenge?.[1];
  const publicationTarget = challenge?.[2];

  const publicationType = getPublicationType(publication);
  const publicationContent = publicationType === 'vote' ? getPublicationPreview(publicationTarget) : getPublicationPreview(publication);
  const votePreview = getVotePreview(publication);

  const { author, content, link, title, parentCid, shortSubplebbitAddress, subplebbitAddress } = publication || {};
  const { displayName } = author || {};
  const parentAddress = useParentAddress(parentCid);
  const subplebbit = shortSubplebbitAddress || subplebbitAddress;

  const [currentChallengeIndex, setCurrentChallengeIndex] = useState(0);
  const [answers, setAnswers] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const nodeRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();

  const [{ x, y }, api] = useSpring(() => ({
    x: window.innerWidth / 2 - 150,
    y: window.innerHeight / 2 - 200,
  }));

  const currentChallenge = challenges?.[currentChallengeIndex];
  const isTextChallenge = currentChallenge?.type === 'text/plain';
  const isImageChallenge = currentChallenge?.type === 'image/png';
  const isIframeChallenge = currentChallenge?.type === 'url/iframe';

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const bind = useDrag(
    ({ active, event, offset: [ox, oy] }) => {
      if (active) {
        event.preventDefault();
        document.body.style.userSelect = 'none';
        document.body.style.webkitUserSelect = 'none';
      } else {
        document.body.style.userSelect = '';
        document.body.style.webkitUserSelect = '';
      }
      api.start({ x: ox, y: oy, immediate: true });
    },
    {
      from: () => [x.get(), y.get()],
      filterTaps: true,
      bounds: undefined,
    },
  );

  const isValidAnswer = (index: number) => !!answers[index] && answers[index].trim() !== '';

  const onAnswersChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAnswers((prevAnswers) => {
      const updatedAnswers = [...prevAnswers];
      updatedAnswers[currentChallengeIndex] = e.target.value;
      return updatedAnswers;
    });
  };

  const onSubmit = () => {
    if (!publication) return;
    publication.publishChallengeAnswers(answers);
    setAnswers([]);
    closeModal();
  };

  const onIframeClose = useCallback(() => {
    if (!publication) return;
    publication.publishChallengeAnswers(['']);
    closeModal();
  }, [closeModal, publication]);

  const onEnterKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    if (!isValidAnswer(currentChallengeIndex)) return;
    if (challenges?.[currentChallengeIndex + 1]) {
      setCurrentChallengeIndex((prev) => prev + 1);
    } else {
      onSubmit();
    }
  };

  useEffect(() => {
    const onEscapeKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isIframeChallenge) {
          onIframeClose();
        } else {
          closeModal();
        }
      }
    };
    document.addEventListener('keydown', onEscapeKey);
    return () => document.removeEventListener('keydown', onEscapeKey);
  }, [closeModal, isIframeChallenge, onIframeClose]);

  const getChallengeUrl = useCallback(() => {
    try {
      const iframeUrl = currentChallenge?.challenge;
      if (!iframeUrl) return '';
      const url = new URL(iframeUrl);
      if (url.hostname === 'mintpass.org') return url.hostname;
      return url.href;
    } catch {
      return '';
    }
  }, [currentChallenge]);

  const readableUrl = (() => {
    const url = getChallengeUrl();
    if (!url) return '';
    try {
      return decodeURIComponent(url);
    } catch {
      return url;
    }
  })();

  if (!challenges?.length || !publication || !currentChallenge) {
    return null;
  }

  const isIframeVisible = isIframeChallenge;

  const containerClasses = [styles.container];
  if (isIframeVisible) {
    containerClasses.push(styles.iframeContainer);
  }

  const extraTitleParts: string[] = [];
  if (subplebbit) extraTitleParts.push(`p/${subplebbit}`);
  if (publicationType === 'vote' && votePreview) extraTitleParts.push(votePreview.trim());
  if (publication?.parentCid) extraTitleParts.push(parentAddress ? `reply ${parentAddress}` : 'reply');
  if (publicationContent && publicationType !== 'vote') extraTitleParts.push(publicationContent);

  const mobileX = isIframeVisible ? 5 : window.innerWidth / 2 - 150;
  const mobileY = isIframeVisible ? Math.max(10, (window.innerHeight - 600) / 2) : window.innerHeight / 2 - 200;

  return (
    <animated.div
      className={containerClasses.join(' ')}
      ref={nodeRef}
      style={{
        x: isMobile ? mobileX : x,
        y: isMobile ? mobileY : y,
        touchAction: 'none',
      }}
    >
      <div className={`challengeHandle ${styles.title}`} {...(!isMobile ? bind() : {})}>
        Challenge for {publicationType}
        <button className={styles.closeIcon} onClick={closeModal} title='close' />
      </div>
      <div className={styles.publication}>
        {isIframeChallenge ? (
          <IframeChallenge
            key={currentChallengeIndex}
            challenge={currentChallenge?.challenge ?? ''}
            shortSubplebbitAddress={shortSubplebbitAddress}
            subplebbitAddress={subplebbitAddress}
            readableUrl={readableUrl}
            closeModal={closeModal}
            onDone={onIframeClose}
            publicationDetails={
              <>
                <div className={styles.name}>
                  <input type='text' value={displayName || capitalize(t('anonymous'))} disabled />
                </div>
                {title && (
                  <div className={styles.subject}>
                    <input type='text' value={title} disabled />
                  </div>
                )}
                {content && (
                  <div className={styles.content}>
                    <textarea value={content} disabled cols={48} rows={4} wrap='soft' />
                  </div>
                )}
                {link && (
                  <div className={styles.link}>
                    <input type='text' value={link} disabled />
                  </div>
                )}
              </>
            }
          />
        ) : (
          <>
            <div className={styles.name}>
              <input type='text' value={displayName || capitalize(t('anonymous'))} disabled />
            </div>
            {title && (
              <div className={styles.subject}>
                <input type='text' value={title} disabled />
              </div>
            )}
            {content && (
              <div className={styles.content}>
                <textarea value={content} disabled cols={48} rows={4} wrap='soft' />
              </div>
            )}
            {link && (
              <div className={styles.link}>
                <input type='text' value={link} disabled />
              </div>
            )}
            <div className={styles.challengeContainer}>
              <input
                ref={inputRef}
                className={styles.challengeAnswer}
                type='text'
                autoComplete='off'
                autoCorrect='off'
                spellCheck='false'
                placeholder='TYPE THE ANSWER HERE AND PRESS ENTER'
                onKeyDown={onEnterKey}
                onChange={onAnswersChange}
                value={answers[currentChallengeIndex] || ''}
              />
              <div className={styles.challengeMediaWrapper}>
                {isTextChallenge && <TextChallenge challenge={currentChallenge?.challenge ?? ''} />}
                {isImageChallenge && <ImageChallenge challenge={currentChallenge?.challenge ?? ''} />}
              </div>
            </div>
            <div className={styles.challengeFooter}>
              <div className={styles.counter}>{t('challenge_counter', { index: currentChallengeIndex + 1, total: challenges?.length })}</div>
              <span className={styles.buttons}>
                {!challenges?.[currentChallengeIndex + 1] && (
                  <button onClick={onSubmit} disabled={!isValidAnswer(currentChallengeIndex)}>
                    {t('submit')}
                  </button>
                )}
                <button onClick={closeModal}>Cancel</button>
                {challenges?.length > 1 && (
                  <button disabled={!challenges?.[currentChallengeIndex - 1]} onClick={() => setCurrentChallengeIndex((prev) => prev - 1)}>
                    {t('previous')}
                  </button>
                )}
                {challenges?.[currentChallengeIndex + 1] && <button onClick={() => setCurrentChallengeIndex((prev) => prev + 1)}>{t('next')}</button>}
              </span>
            </div>
          </>
        )}
      </div>
    </animated.div>
  );
};

const ChallengeModal = () => {
  const { challenges, removeChallenge } = useChallengesStore();
  const isOpen = !!challenges.length;
  const closeModal = () => removeChallenge();
  const current = challenges[0];
  const challenge = current?.challenge;
  const challengeId = current?.id ?? 0;

  return isOpen && challenge ? <Challenge key={challengeId} challenge={challenge} closeModal={closeModal} /> : null;
};

export default ChallengeModal;
