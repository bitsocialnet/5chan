import { useEffect, useRef, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';
import { setAccount, useAccount } from '@plebbit/plebbit-react-hooks';
import { useSubplebbitField } from '../../hooks/use-stable-subplebbit';
import { formatMarkdown } from '../../lib/utils/post-utils';
import { getFormattedTimeAgo } from '../../lib/utils/time-utils';
import { isValidURL } from '../../lib/utils/url-utils';
import { isAllView, isSubscriptionsView } from '../../lib/utils/view-utils';
import useSelectedTextStore from '../../stores/use-selected-text-store';
import useReplyModalStore from '../../stores/use-reply-modal-store';
import usePublishReply from '../../hooks/use-publish-reply';
import useIsMobile from '../../hooks/use-is-mobile';
import styles from './reply-modal.module.css';
import { LinkTypePreviewer } from '../post-form';
import _ from 'lodash';
import FileUploader from '../../plugins/file-uploader';
import { Capacitor } from '@capacitor/core';
import { useSpring, animated } from '@react-spring/web';
import { useDrag } from '@use-gesture/react';

const isAndroid = Capacitor.getPlatform() === 'android';

interface ReplyModalProps {
  closeModal: () => void;
  showReplyModal: boolean;
  parentCid: string;
  parentNumber: number | null;
  threadNumber: number | null;
  postCid: string;
  scrollY: number;
  subplebbitAddress: string;
}

const ReplyModal = ({ closeModal, showReplyModal, parentCid, parentNumber, threadNumber, postCid, scrollY, subplebbitAddress }: ReplyModalProps) => {
  const { t } = useTranslation();
  const { setPublishReplyOptions, publishReply, resetPublishReplyOptions, replyIndex } = usePublishReply({
    cid: parentCid,
    subplebbitAddress,
    postCid,
  });
  const account = useAccount();
  const { displayName } = account?.author || {};
  const [url, setUrl] = useState('');
  const textRef = useRef<HTMLTextAreaElement | null>(null);
  const urlRef = useRef<HTMLInputElement>(null);
  const lastSelectionStartRef = useRef(0);
  const lastSelectionEndRef = useRef(0);
  const lastProcessedQuoteInsertRequestIdRef = useRef(0);
  const { selectedText } = useSelectedTextStore();
  const quoteInsertRequestId = useReplyModalStore((state) => state.quoteInsertRequestId);
  const quoteInsertNumber = useReplyModalStore((state) => state.quoteInsertNumber);
  const quoteInsertSelectedText = useReplyModalStore((state) => state.quoteInsertSelectedText);

  const [error, setError] = useState<string | null>(null);
  const [lengthError, setLengthError] = useState<string | null>(null);

  const checkContentLength = useRef(
    _.debounce((content: string, t: Function) => {
      const length = content.trim().length;
      if (length > 2000) {
        setError(null);
        setLengthError(`${t('error')}: ${t('comment_field_too_long', { length })}`);
      } else {
        setLengthError(null);
      }
    }, 1000),
  ).current;

  const onPublishReply = () => {
    const currentContent = textRef.current?.value.slice(contentPrefix.length).trim() || '';
    const currentUrl = urlRef.current?.value.trim() || '';

    if (!currentContent && !currentUrl) {
      setError(t('error') + ': ' + t('empty_comment_alert'));
      return;
    }

    if (currentUrl && !isValidURL(currentUrl)) {
      setError(t('error') + ': ' + t('invalid_url_alert'));
      return;
    }

    checkContentLength.cancel();
    setLengthError(null);

    if (currentContent.length > 2000) {
      setError(t('error') + ': ' + t('field_too_long'));
      return;
    }

    setError(null);
    publishReply();
  };

  useEffect(() => {
    if (typeof replyIndex === 'number') {
      resetPublishReplyOptions();
      closeModal();
    }
  }, [replyIndex, resetPublishReplyOptions, closeModal]);

  const nodeRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();

  const [{ x, y }, api] = useSpring(() => ({
    x: window.innerWidth / 2 - 150,
    y: window.innerHeight / 2 - 200,
  }));

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

  useEffect(() => {
    if (nodeRef.current && isMobile) {
      const viewportHeight = window.innerHeight;
      const centeredPosition = scrollY + viewportHeight / 2 - 300;
      api.start({ y: centeredPosition, immediate: true });
    }
  }, [isMobile, scrollY, api]);

  const parentCidRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (parentCidRef.current && parentCidRef.current) {
      const cidWidth = parentCidRef.current.offsetWidth;
      parentCidRef.current.style.width = `${cidWidth}px`;
    }
  }, [parentCid]);

  const location = useLocation();
  const isInAllView = isAllView(location.pathname);
  const isInSubscriptionsView = isSubscriptionsView(location.pathname, useParams());
  // Only subscribe to updatedAt to avoid rerenders from updatingState changes
  const updatedAt = useSubplebbitField(subplebbitAddress, (subplebbit) => subplebbit?.updatedAt);
  const isBoardOffline = updatedAt && updatedAt < Date.now() / 1000 - 60 * 60;
  const offlineAlert = updatedAt
    ? isBoardOffline && (
        <div className={styles.offlineBoard}>
          {t('warning')}: <Trans i18nKey='posts_last_synced_info' values={{ time: getFormattedTimeAgo(updatedAt) }} />
        </div>
      )
    : t('subplebbit_offline_info');

  useEffect(() => {
    if (showReplyModal && !isMobile) {
      setTimeout(() => {
        if (textRef.current) {
          textRef.current.focus();
        }
      }, 0);

      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          closeModal();
        }
      };
      document.addEventListener('keydown', handleEscape);

      return () => {
        document.removeEventListener('keydown', handleEscape);
      };
    }
  }, [showReplyModal, closeModal, isMobile]);

  useEffect(() => {
    if (textRef.current) {
      const len = textRef.current.value.length;
      textRef.current.setSelectionRange(len, len);
    }
  }, []);

  const contentPrefix = `>>${parentNumber ?? '?'}\n`;

  // enable spellcheck after the prefix is set
  useEffect(() => {
    if (showReplyModal && textRef.current) {
      textRef.current.spellcheck = false;
      textRef.current.value = contentPrefix + (selectedText || '');
      const len = textRef.current.value.length;
      lastSelectionStartRef.current = len;
      lastSelectionEndRef.current = len;

      setTimeout(() => {
        if (textRef.current) {
          textRef.current.spellcheck = true;
        }
      }, 100);
    }
  }, [showReplyModal, contentPrefix, selectedText]);

  const handleContentInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const { value } = e.target;
    if (!value.startsWith(contentPrefix)) {
      e.target.value = contentPrefix + value.slice(contentPrefix.length);
    }
    lastSelectionStartRef.current = e.target.selectionStart ?? e.target.value.length;
    lastSelectionEndRef.current = e.target.selectionEnd ?? lastSelectionStartRef.current;
  };

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const contentWithoutPrefix = e.target.value.slice(contentPrefix.length);
    const formattedContent = formatMarkdown(contentWithoutPrefix);
    if (textRef.current && textRef.current.value !== formattedContent) {
      setPublishReplyOptions({ content: formattedContent });
      checkContentLength(formattedContent, t);
    }
  };

  useEffect(() => {
    const canInsertQuote = showReplyModal && quoteInsertRequestId !== 0 && !!textRef.current;

    const textarea = textRef.current;
    if (!canInsertQuote || !textarea) {
      return;
    }

    // Guard: skip if we already processed this exact request id.
    // setPublishReplyOptions identity changes after each call (store update -> new content -> new useCallback),
    // which re-triggers this effect. Without this guard, that creates an infinite update loop.
    if (quoteInsertRequestId === lastProcessedQuoteInsertRequestIdRef.current) {
      return;
    }
    lastProcessedQuoteInsertRequestIdRef.current = quoteInsertRequestId;

    const quote = `>>${quoteInsertNumber ?? '?'}`;
    const selectedQuote = quoteInsertSelectedText?.trimEnd() || '';
    const isFocused = document.activeElement === textarea;
    const rawStart = isFocused ? (textarea.selectionStart ?? textarea.value.length) : lastSelectionStartRef.current;
    const selectionEnd = isFocused ? (textarea.selectionEnd ?? rawStart) : lastSelectionEndRef.current;
    const minStart = contentPrefix.length;
    const start = Math.max(rawStart, minStart);
    const end = Math.max(selectionEnd, minStart);
    const before = textarea.value.slice(0, start);
    const after = textarea.value.slice(end);
    const needsLeadingNewline = before.length > minStart && !before.endsWith('\n');
    let insertion = `${needsLeadingNewline ? '\n' : ''}${quote}\n`;
    if (selectedQuote) {
      insertion += `${selectedQuote}\n`;
    }
    const nextValue = `${before}${insertion}${after}`;

    textarea.value = nextValue;
    const nextCursor = before.length + insertion.length;
    textarea.focus();
    textarea.setSelectionRange(nextCursor, nextCursor);
    lastSelectionStartRef.current = nextCursor;
    lastSelectionEndRef.current = nextCursor;

    const contentWithoutPrefix = nextValue.slice(contentPrefix.length);
    const formattedContent = formatMarkdown(contentWithoutPrefix);
    setPublishReplyOptions({ content: formattedContent });
    checkContentLength(formattedContent, t);
  }, [showReplyModal, quoteInsertRequestId, quoteInsertNumber, quoteInsertSelectedText, contentPrefix, setPublishReplyOptions, checkContentLength, t]);

  // on android, auto upload file to image hosting sites with open api
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const handleUpload = async () => {
    try {
      setIsUploading(true);
      const result = await FileUploader.pickAndUploadMedia();
      console.log('Upload result:', result);
      if (result.url) {
        setUrl(result.url);
        if (urlRef.current) {
          urlRef.current.value = result.url;
        }
        setPublishReplyOptions({ link: result.url || undefined });
        if (result.fileName) {
          setUploadedFileName(result.fileName);
        }
      }
    } catch (error) {
      console.error('Upload failed, ', error);
      if (error instanceof Error && error.message !== 'File selection cancelled') {
        setError(`${t('upload_failed')}, ${error.message}`);
      } else if (typeof error === 'string' && error !== 'File selection cancelled') {
        setError(`${t('upload_failed')}, ${error}`);
      }
    } finally {
      setIsUploading(false);
    }
  };

  const hasInitializedDisplayName = useRef(false);
  useEffect(() => {
    if (displayName && !hasInitializedDisplayName.current) {
      hasInitializedDisplayName.current = true;
      setPublishReplyOptions({ displayName });
    }
  }, [displayName, setPublishReplyOptions]);

  const modalContent = (
    <animated.div
      className={styles.container}
      ref={nodeRef}
      style={{
        x,
        y,
        touchAction: 'none',
      }}
    >
      <div className={`replyModalHandle ${styles.title}`} {...(!isMobile ? bind() : {})}>
        {t('reply_to_no', { no: threadNumber ?? '?' })}
        <button
          className={styles.closeIcon}
          onClick={(e) => {
            e.stopPropagation();
            closeModal();
          }}
          title='close'
        />
      </div>
      <div className={styles.replyForm}>
        <div className={styles.name}>
          <input
            type='text'
            defaultValue={displayName}
            placeholder={displayName ? undefined : _.capitalize(t('name'))}
            onChange={(e) => {
              setAccount({ ...account, author: { ...account?.author, displayName: e.target.value } });
              setPublishReplyOptions({ displayName: e.target.value });
            }}
          />
        </div>
        <div className={styles.link}>
          <input
            type='text'
            ref={urlRef}
            placeholder={_.capitalize(t('link'))}
            onChange={(e) => {
              setUrl(e.target.value);
              setPublishReplyOptions({ link: e.target.value });
            }}
          />
        </div>
        <div className={styles.content}>
          <textarea
            cols={48}
            rows={4}
            wrap='soft'
            ref={textRef}
            spellCheck={true}
            onInput={handleContentInput}
            onChange={handleContentChange}
            onSelect={(e) => {
              lastSelectionStartRef.current = e.currentTarget.selectionStart ?? e.currentTarget.value.length;
              lastSelectionEndRef.current = e.currentTarget.selectionEnd ?? lastSelectionStartRef.current;
            }}
            onBlur={(e) => {
              lastSelectionStartRef.current = e.currentTarget.selectionStart ?? e.currentTarget.value.length;
              lastSelectionEndRef.current = e.currentTarget.selectionEnd ?? lastSelectionStartRef.current;
            }}
          />
        </div>
        <div className={styles.footer}>
          {url && !isAndroid && (
            <>
              {t('link_type')}: <LinkTypePreviewer link={url} />
            </>
          )}
          {isAndroid && (
            <span className={styles.uploadContainer}>
              <span className={styles.uploadButton}>
                <button onClick={handleUpload} disabled={isUploading}>
                  {isUploading ? t('uploading') : t('choose_file')}
                </button>
              </span>
              <span className={styles.uploadFileName} title={uploadedFileName ? uploadedFileName : t('no_file_chosen')}>
                {uploadedFileName ? uploadedFileName : t('no_file_chosen')}
              </span>
            </span>
          )}
          <span className={styles.spoilerButton}>
            [
            <label>
              <input type='checkbox' onChange={(e) => setPublishReplyOptions({ spoiler: e.target.checked })} />
              {_.capitalize(t('spoiler'))}?
            </label>
            ]
          </span>
          <button className={styles.publishButton} onClick={onPublishReply}>
            {t('post')}
          </button>
        </div>
        {lengthError ? <div className={styles.error}>{lengthError}</div> : error && <div className={styles.error}>{error}</div>}
        {!(isInAllView || isInSubscriptionsView) && offlineAlert}
      </div>
    </animated.div>
  );

  return showReplyModal && modalContent;
};

export default ReplyModal;
