import { useLayoutEffect, useRef, useState } from 'react';
import { localForageLru } from '../lib/bitsocial-internals/utils';

const gifFrameDb = localForageLru.createInstance({ name: '5chanGifFrames', size: 500 });
type GifSource = string | File;
const failedUrls = new Set<GifSource>();
const pendingFrames = new Map<GifSource, Promise<Blob>>();

type GifFirstFrameStatus = 'idle' | 'loading' | 'ready' | 'failed';

interface GifFirstFrameState {
  frameUrl: string | null;
  status: GifFirstFrameStatus;
}

const IDLE_STATE: GifFirstFrameState = { frameUrl: null, status: 'idle' };
const LOADING_STATE: GifFirstFrameState = { frameUrl: null, status: 'loading' };
const FAILED_STATE: GifFirstFrameState = { frameUrl: null, status: 'failed' };

const fetchImage = (url: string): Promise<ArrayBuffer> => {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('GET', url, true);
    request.responseType = 'arraybuffer';
    request.onloadend = () => {
      if (request.response !== undefined && (request.status === 200 || request.status === 304)) {
        resolve(request.response);
      } else {
        reject(new Error(`XMLHttpRequest, ${request.statusText}`));
      }
    };
    request.send();
  });
};

const readImage = (file: File): Promise<ArrayBuffer> => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(reader.result as ArrayBuffer);
    };
    reader.readAsArrayBuffer(file);
  });
};

const parseGif = async (buf: ArrayBuffer): Promise<Blob> => {
  const image = new Image();
  const sourceUrl = URL.createObjectURL(new Blob([buf]));

  await new Promise((resolve, reject) => {
    image.onload = () => {
      URL.revokeObjectURL(sourceUrl);
      resolve(undefined);
    };
    image.onerror = () => {
      URL.revokeObjectURL(sourceUrl);
      reject(new Error('Failed to parse GIF'));
    };
    image.src = sourceUrl;
  });

  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d');
  if (ctx === null) throw new Error('Canvas Context null');
  ctx.drawImage(image, 0, 0, image.width, image.height);
  return await new Promise((resolve, reject) =>
    canvas.toBlob((blob) => {
      if (blob === null) {
        reject('Canvas Blob null');
      } else {
        resolve(blob);
      }
    }),
  );
};

const getGifFrame = (url: GifSource): Promise<Blob> => {
  const pendingFrame = pendingFrames.get(url);
  if (pendingFrame) return pendingFrame;

  let cacheWrite: Promise<unknown> | undefined;
  const frame = (async () => {
    let cachedFrame: Blob | string | null = null;
    // localforage coerces File keys to the same string; File previews use identity only.
    if (typeof url === 'string') {
      try {
        cachedFrame = await gifFrameDb.getItem(url);
      } catch {}
    }
    if (cachedFrame instanceof Blob) return cachedFrame;

    let blob: Blob | undefined;
    // Older entries held object URLs, which only remain valid in their original document.
    if (typeof cachedFrame === 'string') {
      try {
        const response = await fetch(cachedFrame);
        if (response.ok) blob = await response.blob();
      } catch {}
    }
    blob ??= await parseGif(typeof url === 'string' ? await fetchImage(url) : await readImage(url));

    if (typeof url === 'string') {
      cacheWrite = Promise.resolve()
        .then(() => gifFrameDb.setItem(url, blob))
        .catch((error) => {
          // Storage failures must not turn a successfully decoded thumbnail into an animated fallback.
          console.error('Failed to cache GIF frame:', error);
        });
    }
    return blob;
  })()
    .catch((error) => {
      failedUrls.add(url);
      console.error('Failed to load GIF frame:', error);
      throw error;
    })
    .finally(() => {
      // Deliver the frame immediately, sharing its resolved promise until persistence finishes.
      if (cacheWrite) void cacheWrite.then(() => pendingFrames.delete(url));
      else pendingFrames.delete(url);
    });

  pendingFrames.set(url, frame);
  return frame;
};

const useFetchGifFirstFrame = (url: GifSource | undefined) => {
  const retainedFrame = useRef<{ source: GifSource; blob: Blob } | undefined>(undefined);
  const [result, setResult] = useState<{ source: GifSource | undefined; state: GifFirstFrameState }>(() => ({
    source: url,
    state: url ? LOADING_STATE : IDLE_STATE,
  }));

  // Activity preserves refs while disconnecting effects. Recreate the URL from
  // retained bytes before a revealed feed paints, without repeating async loading.
  useLayoutEffect(() => {
    if (!url) {
      retainedFrame.current = undefined;
      setResult((prev) => (prev.source === undefined ? prev : { source: undefined, state: IDLE_STATE }));
      return;
    }

    let isActive = true;
    let objectUrl: string | undefined;
    const retainedBlob = retainedFrame.current?.source === url ? retainedFrame.current.blob : undefined;
    if (!retainedBlob) {
      retainedFrame.current = undefined;
      setResult((prev) => (prev.source === url && prev.state.status === 'loading' ? prev : { source: url, state: LOADING_STATE }));
    }

    const fetchFrame = async () => {
      if (!retainedBlob && failedUrls.has(url)) {
        setResult({ source: url, state: FAILED_STATE });
        return;
      }

      try {
        const blob = retainedBlob ?? (await getGifFrame(url));
        if (!isActive) return;
        retainedFrame.current = { source: url, blob };
        objectUrl = URL.createObjectURL(blob);
        setResult({ source: url, state: { frameUrl: objectUrl, status: 'ready' } });
      } catch {
        if (isActive) setResult({ source: url, state: FAILED_STATE });
      }
    };

    fetchFrame();

    return () => {
      isActive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);

  return !url ? IDLE_STATE : result.source === url ? result.state : LOADING_STATE;
};

export default useFetchGifFirstFrame;
