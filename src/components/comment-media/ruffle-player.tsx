import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SKIP_MEDIA_SUSPENSION_ATTRIBUTE } from '../../lib/utils/media-playback-utils';
import styles from './comment-media.module.css';
import { createRuffleFrameNonce, fetchOk, fetchRuffleScripts, getRuffleFrameDocument, getRufflePublicPath, isRuffleWasmFileName } from './ruffle-player-frame';

/** By the frame's load event its scripts have run or failed; this bounds the wait for its ready message after that. */
const FRAME_READY_TIMEOUT_MS = 10_000;

interface RufflePlayerProps {
  url: string;
  onLoad?: () => void;
}

type RufflePlayerStatus = 'loading' | 'ready' | 'failed';

interface RuffleFrameMessage {
  type?: unknown;
  id?: unknown;
  fileName?: unknown;
  message?: unknown;
}

/**
 * Plays an SWF with Ruffle inside a sandboxed frame that cannot make network requests
 * (see ruffle-player-frame.ts). This page fetches the SWF and Ruffle's scripts and wasm module for it.
 */
const RufflePlayer = ({ url, onLoad }: RufflePlayerProps) => {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLSpanElement>(null);
  const [status, setStatus] = useState<RufflePlayerStatus>('loading');
  const handleLoad = useEffectEvent(() => onLoad?.());

  useEffect(() => {
    const mountNode = containerRef.current;
    if (!mountNode) {
      return;
    }

    const controller = new AbortController();
    const { signal } = controller;
    const publicPath = getRufflePublicPath();
    const frame = document.createElement('iframe');
    let failed = false;
    let frameReady = false;
    let wasmRequested = false;
    let readyTimeoutId: ReturnType<typeof setTimeout> | undefined;

    const fail = (error: unknown) => {
      if (signal.aborted || failed) {
        return;
      }
      failed = true;
      console.error('Error loading SWF with Ruffle:', error);
      setStatus('failed');
    };
    const post = (message: unknown, transfer: Transferable[] = []) => frame.contentWindow?.postMessage(message, '*', transfer);

    const swf = fetchOk(url, { credentials: 'omit', referrerPolicy: 'no-referrer', signal }).then((response) => response.arrayBuffer());
    const scripts = fetchRuffleScripts(publicPath, signal);
    const downloads = Promise.all([swf, scripts]);
    downloads.catch(fail);

    window.addEventListener(
      'message',
      (event: MessageEvent<RuffleFrameMessage | null>) => {
        // contentWindow is null until the frame is mounted, and a null source must not pass for it.
        if (!frame.contentWindow || event.source !== frame.contentWindow || !event.data) {
          return;
        }
        const { type, id, fileName } = event.data;
        if (type === 'ruffle-frame-ready' && !frameReady) {
          frameReady = true;
          downloads.then(
            ([bytes, { runtimeScripts }]) => post({ type: 'ruffle-load', swf: bytes, scripts: runtimeScripts }, [bytes]),
            () => undefined,
          );
        } else if (type === 'ruffle-wasm-request' && !wasmRequested && typeof fileName === 'string' && isRuffleWasmFileName(fileName)) {
          // Only Ruffle's own module, once, so the frame cannot use this page to fetch anything else.
          wasmRequested = true;
          fetchOk(new URL(fileName, publicPath).href, { signal })
            .then((response) => response.arrayBuffer())
            .then((bytes) => post({ type: 'ruffle-wasm', id, bytes }, [bytes]))
            .catch((error: unknown) => {
              post({ type: 'ruffle-wasm', id });
              fail(error);
            });
        } else if (type === 'ruffle-loaded') {
          setStatus('ready');
          handleLoad();
        } else if (type === 'ruffle-failed') {
          fail(event.data.message);
        }
      },
      { signal },
    );

    frame.addEventListener(
      'load',
      () => {
        clearTimeout(readyTimeoutId);
        readyTimeoutId = setTimeout(() => {
          if (!frameReady) {
            fail(new Error('Ruffle frame scripts did not load'));
          }
        }, FRAME_READY_TIMEOUT_MS);
      },
      { signal },
    );

    frame.className = styles.rufflePlayerElement;
    frame.title = 'SWF';
    frame.referrerPolicy = 'no-referrer';
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.setAttribute('data-testid', 'ruffle-player');
    // Blanking the frame offscreen would restart the SWF; the in-page Ruffle element it replaces was never suspended either.
    frame.setAttribute(SKIP_MEDIA_SUSPENSION_ATTRIBUTE, '');
    setStatus('loading');
    scripts
      .then(({ frameScript }) => {
        if (signal.aborted) {
          return;
        }
        frame.srcdoc = getRuffleFrameDocument(publicPath, frameScript, createRuffleFrameNonce());
        mountNode.appendChild(frame);
      })
      .catch(fail);

    return () => {
      controller.abort();
      clearTimeout(readyTimeoutId);
      frame.remove();
    };
  }, [url]);

  return (
    <span className={styles.rufflePlayer}>
      <span className={status === 'ready' ? styles.rufflePlayerMount : styles.rufflePlayerMountHidden} ref={containerRef} />
      {status === 'failed' ? (
        <span className={styles.ruffleFallback}>
          {t('media_failed_to_load')}.{' '}
          <a href={url} target='_blank' rel='noopener noreferrer'>
            {t('media_failed_to_load_open_source')}
          </a>
        </span>
      ) : status === 'loading' ? (
        <span className={styles.ruffleLoading}>{t('loading')} SWF</span>
      ) : null}
    </span>
  );
};

export default RufflePlayer;
