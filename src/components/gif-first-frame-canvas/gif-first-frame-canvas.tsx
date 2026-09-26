import { type CSSProperties, useEffect, useEffectEvent, useRef } from 'react';

// Largest thumbnail box in the catalog and thread CSS; the canvas is never displayed larger.
const MAX_THUMBNAIL_SIZE = 250;

interface GifFirstFrameCanvasProps {
  src: string;
  style?: CSSProperties;
  onError?: () => void;
  onLoad?: () => void;
}

// Hosts without CORS headers block reading GIF bytes, so useFetchGifFirstFrame() cannot
// extract a still. The browser can still draw the cross-origin image to a canvas for
// display (only reading the pixels back is blocked), and drawImage() uses the first frame.
const GifFirstFrameCanvas = ({ src, style, onError, onLoad }: GifFirstFrameCanvasProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawnSrcRef = useRef<string | undefined>(undefined);
  const handleLoad = useEffectEvent(() => onLoad?.());
  const handleError = useEffectEvent(() => onError?.());

  useEffect(() => {
    // A revealed Activity keeps the drawn canvas, so skip reloading the same GIF.
    if (drawnSrcRef.current === src) return;

    const image = new Image();
    image.onload = () => {
      const canvas = canvasRef.current;
      const context = canvas?.getContext('2d');
      if (!canvas || !context) {
        handleError();
        return;
      }
      // Safari caps total canvas memory, so keep the bitmap near thumbnail size.
      const scale = Math.min(1, (MAX_THUMBNAIL_SIZE * window.devicePixelRatio) / Math.max(image.naturalWidth, image.naturalHeight));
      canvas.width = Math.round(image.naturalWidth * scale);
      canvas.height = Math.round(image.naturalHeight * scale);
      context.imageSmoothingQuality = 'high';
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      drawnSrcRef.current = src;
      handleLoad();
    };
    image.onerror = () => handleError();
    image.src = src;

    return () => {
      image.onload = null;
      image.onerror = null;
      image.src = '';
    };
  }, [src]);

  // Zero size until drawn, instead of the default 300x150 canvas box.
  return <canvas ref={canvasRef} width={0} height={0} style={style} />;
};

export default GifFirstFrameCanvas;
