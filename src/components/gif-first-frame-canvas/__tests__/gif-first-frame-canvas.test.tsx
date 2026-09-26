import * as React from 'react';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import GifFirstFrameCanvas from '../gif-first-frame-canvas';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const act = (React as { act?: (cb: () => void | Promise<void>) => void | Promise<void> }).act as (cb: () => void | Promise<void>) => void | Promise<void>;

class MockImage {
  static instances: MockImage[] = [];
  crossOrigin: string | null = null;
  naturalHeight = 481;
  naturalWidth = 425;
  onerror: (() => void) | null = null;
  onload: (() => void) | null = null;
  src = '';

  constructor() {
    MockImage.instances.push(this);
  }
}

let container: HTMLDivElement;
let drawImageMock: ReturnType<typeof vi.fn>;
let root: Root;

const renderCanvas = async (props: React.ComponentProps<typeof GifFirstFrameCanvas>) => {
  await act(async () => {
    root.render(createElement(GifFirstFrameCanvas, props));
  });
};

describe('GifFirstFrameCanvas', () => {
  beforeEach(() => {
    MockImage.instances = [];
    drawImageMock = vi.fn();
    vi.stubGlobal('Image', MockImage);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({ drawImage: drawImageMock }) as unknown as CanvasRenderingContext2D);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('draws a still frame of a GIF loaded without CORS', async () => {
    const onLoad = vi.fn();
    await renderCanvas({ src: 'https://i.kym-cdn.com/source.gif', onLoad });

    const canvas = container.querySelector('canvas');
    const [image] = MockImage.instances;
    expect(canvas?.width).toBe(0);
    expect(image.src).toBe('https://i.kym-cdn.com/source.gif');
    expect(image.crossOrigin).toBeNull();

    await act(async () => image.onload?.());

    // Scaled to the 250px thumbnail box at devicePixelRatio 1.
    expect(canvas?.width).toBe(221);
    expect(canvas?.height).toBe(250);
    expect(drawImageMock).toHaveBeenCalledWith(image, 0, 0, 221, 250);
    expect(onLoad).toHaveBeenCalledTimes(1);
    expect(container.querySelector('img')).toBeNull();
  });

  it('reports load errors without drawing', async () => {
    const onError = vi.fn();
    const onLoad = vi.fn();
    await renderCanvas({ src: 'https://example.com/missing.gif', onError, onLoad });

    await act(async () => MockImage.instances[0].onerror?.());

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onLoad).not.toHaveBeenCalled();
    expect(drawImageMock).not.toHaveBeenCalled();
  });

  it('does not reload the GIF when rerendered with new callbacks', async () => {
    const src = 'https://example.com/source.gif';
    await renderCanvas({ src, onLoad: vi.fn() });
    await act(async () => MockImage.instances[0].onload?.());
    await renderCanvas({ src, onLoad: vi.fn() });

    expect(MockImage.instances).toHaveLength(1);
    expect(drawImageMock).toHaveBeenCalledTimes(1);
  });
});
