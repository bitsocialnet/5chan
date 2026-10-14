import { useRef, useState } from 'react';
import { getMediaHostingRuntime } from '../../lib/media-hosting/show-upload-controls';
import { loadTegaki, TEGAKI_DRAWING_FILE_NAME, type TegakiGlobal } from '../../lib/oekaki/tegaki-loader';
import { OEKAKI_MOBILE_PORTRAIT_MESSAGE, OEKAKI_WEB_DOWNLOAD_MESSAGE } from '../../lib/oekaki/oekaki-copy';
import styles from './oekaki-drawing-controls.module.css';

const DEFAULT_DIMENSION = '400';
const MIN_DIMENSION = 1;
const MAX_DIMENSION = 2000;
const PNG_MIME_TYPE = 'image/png';

interface OekakiDrawingControlsProps {
  disabled?: boolean;
  className?: string;
  /** Attaches the finished drawing to the form; it is uploaded with the post, like a chosen file. */
  onAttachDrawing: (file: File) => void;
  /** Drops the drawing from the form if it is still the attachment. */
  onDetachDrawing: (file: File) => void;
}

const parseDimension = (value: string): number => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return Number.parseInt(DEFAULT_DIMENSION, 10);
  return Math.min(MAX_DIMENSION, Math.max(MIN_DIMENSION, parsed));
};

const makeDrawingFile = (blob: Blob): File => new File([blob], TEGAKI_DRAWING_FILE_NAME, { type: PNG_MIME_TYPE });

const isPhonePortraitViewport = (): boolean => {
  if (typeof window === 'undefined') return false;
  if (typeof window.matchMedia === 'function') {
    return window.matchMedia('(max-width: 640px) and (orientation: portrait)').matches;
  }
  return window.innerWidth <= 640 && window.innerHeight > window.innerWidth;
};

const canvasToBlob = (canvas: HTMLCanvasElement): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
        return;
      }
      reject(new Error('Could not export drawing'));
    }, PNG_MIME_TYPE);
  });

const downloadDrawing = (file: File): void => {
  const url = URL.createObjectURL(file);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = TEGAKI_DRAWING_FILE_NAME;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
};

const loadDrawingImage = (file: File | null): Promise<HTMLImageElement | null> =>
  new Promise((resolve, reject) => {
    if (!file) {
      resolve(null);
      return;
    }

    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not load drawing'));
    };
    image.src = url;
  });

const destroyTegaki = (tegaki: TegakiGlobal): void => {
  if (tegaki.bg && typeof tegaki.destroy === 'function') {
    tegaki.destroy();
  }
};

const OekakiDrawingControls = ({ disabled = false, className, onAttachDrawing, onDetachDrawing }: OekakiDrawingControlsProps) => {
  const [width, setWidth] = useState(DEFAULT_DIMENSION);
  const [height, setHeight] = useState(DEFAULT_DIMENSION);
  const [saveReplay, setSaveReplay] = useState(true);
  const [drawingFile, setDrawingFile] = useState<File | null>(null);
  const [isOpening, setIsOpening] = useState(false);
  const [isTegakiOpen, setIsTegakiOpen] = useState(false);
  const [isSavingDrawing, setIsSavingDrawing] = useState(false);
  const tegakiSessionOpenRef = useRef(false);
  const runtime = getMediaHostingRuntime();
  const isBusy = disabled || isOpening || isTegakiOpen || isSavingDrawing;
  const hasDrawing = drawingFile !== null;

  const closeTegakiSession = () => {
    tegakiSessionOpenRef.current = false;
    setIsTegakiOpen(false);
  };

  const handleDrawingFile = (file: File) => {
    setDrawingFile(file);

    if (runtime === 'web') {
      if (window.confirm(OEKAKI_WEB_DOWNLOAD_MESSAGE)) {
        downloadDrawing(file);
      }
      return;
    }

    onAttachDrawing(file);
  };

  const openTegaki = async () => {
    if (isBusy || tegakiSessionOpenRef.current) return;
    if (isPhonePortraitViewport()) {
      window.alert(OEKAKI_MOBILE_PORTRAIT_MESSAGE);
      return;
    }

    setIsOpening(true);
    try {
      const [tegaki, existingImage] = await Promise.all([loadTegaki(), loadDrawingImage(drawingFile)]);
      destroyTegaki(tegaki);
      tegakiSessionOpenRef.current = true;
      setIsTegakiOpen(true);
      tegaki.open({
        width: parseDimension(width),
        height: parseDimension(height),
        saveReplay,
        onDone: () => {
          const canvas = tegaki.flatten();
          setIsSavingDrawing(true);
          void canvasToBlob(canvas)
            .then(makeDrawingFile)
            .then((file) => {
              destroyTegaki(tegaki);
              closeTegakiSession();
              handleDrawingFile(file);
            })
            .catch((error) => {
              destroyTegaki(tegaki);
              closeTegakiSession();
              window.alert(error instanceof Error ? error.message : String(error));
            })
            .finally(() => {
              setIsSavingDrawing(false);
            });
        },
        onCancel: () => {
          destroyTegaki(tegaki);
          closeTegakiSession();
        },
      });
      if (existingImage && typeof tegaki.onOpenImageLoaded === 'function') {
        try {
          tegaki.onOpenImageLoaded.call(existingImage);
        } catch (error) {
          destroyTegaki(tegaki);
          throw error;
        }
      }
    } catch (error) {
      closeTegakiSession();
      window.alert(error instanceof Error ? error.message : String(error));
    } finally {
      setIsOpening(false);
    }
  };

  const clearDrawing = () => {
    if (drawingFile && runtime !== 'web') {
      onDetachDrawing(drawingFile);
    }
    setDrawingFile(null);
  };

  return (
    <div className={`${styles.controls} ${className ?? ''}`}>
      <span>Size</span>
      <input
        className={styles.sizeInput}
        type='text'
        inputMode='numeric'
        aria-label='Oekaki width'
        value={width}
        disabled={isBusy}
        onChange={(event) => setWidth(event.target.value)}
      />
      <span>×</span>
      <input
        className={styles.sizeInput}
        type='text'
        inputMode='numeric'
        aria-label='Oekaki height'
        value={height}
        disabled={isBusy}
        onChange={(event) => setHeight(event.target.value)}
      />
      <label className={styles.replayLabel}>
        <input
          type='checkbox'
          aria-label='Replay drawing'
          checked={saveReplay}
          disabled={isBusy || hasDrawing}
          onChange={(event) => setSaveReplay(event.target.checked)}
        />
        Replay
      </label>
      <button type='button' onClick={openTegaki} disabled={isBusy}>
        {hasDrawing ? 'Edit' : 'Draw'}
      </button>
      <button type='button' onClick={clearDrawing} disabled={isBusy || !hasDrawing}>
        Clear
      </button>
    </div>
  );
};

export default OekakiDrawingControls;
