import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FRAMES_DESKTOP_QUERY } from '../../../constants/frames';
import useContentWidth from '../../../hooks/use-content-width';
import useFramesStore from '../../../stores/use-frames-store';
import FramesLayout from '../frames-layout';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.mock('../../frames-sidebar', () => ({
  default: () => (
    <nav aria-label='Boards'>
      <Link to='/g'>Technology</Link>
    </nav>
  ),
}));
vi.mock('../../../hooks/use-window-width', () => ({ default: () => 1000 }));

let desktop = true;
const listeners = new Set<() => void>();
let root: Root;
let container: HTMLDivElement;

const Content = () => {
  const [count, setCount] = useState(0);
  return (
    <button onClick={() => setCount(count + 1)}>
      {count}:{useContentWidth()}
    </button>
  );
};

const render = () =>
  act(() =>
    root.render(
      <MemoryRouter>
        <FramesLayout>
          <Content />
          <Routes>
            <Route path='/' element={<p>Home</p>} />
            <Route path='/g' element={<p>Technology board</p>} />
          </Routes>
        </FramesLayout>
      </MemoryRouter>,
    ),
  );

describe('desktop frames layout', () => {
  beforeEach(() => {
    desktop = true;
    listeners.clear();
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => {
        expect(query).toBe(FRAMES_DESKTOP_QUERY);
        return {
          matches: desktop,
          addEventListener: (_: string, listener: () => void) => listeners.add(listener),
          removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
        };
      }),
    );
    useFramesStore.setState({ useFrames: false });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it('reflows content without remounting it and preserves the sidebar across navigation', () => {
    render();
    const content = container.querySelector('button')!;
    act(() => content.click());
    expect(content.textContent).toBe('1:1000');
    act(() => useFramesStore.getState().setUseFrames(true));
    expect(container.querySelector('button')).toBe(content);
    expect(content.textContent).toBe('1:799');
    const sidebar = container.querySelector('nav');
    act(() => container.querySelector('a')!.click());
    expect(container.textContent).toContain('Technology board');
    expect(container.querySelector('nav')).toBe(sidebar);
    act(() => useFramesStore.getState().setUseFrames(false));
    expect(container.querySelector('nav')).toBeNull();
    expect(content.textContent).toBe('1:1000');
  });

  it('ignores a saved preference on mobile and restores it when a desktop becomes available', () => {
    desktop = false;
    useFramesStore.setState({ useFrames: true });
    render();
    expect(container.querySelector('nav')).toBeNull();
    expect(container.querySelector('button')?.textContent).toBe('0:1000');
    act(() => {
      desktop = true;
      listeners.forEach((listener) => listener());
    });
    expect(container.querySelector('nav')).not.toBeNull();
    expect(container.querySelector('button')?.textContent).toBe('0:799');
    act(() => {
      desktop = false;
      listeners.forEach((listener) => listener());
    });
    expect(container.querySelector('nav')).toBeNull();
    expect(useFramesStore.getState().useFrames).toBe(true);
  });
});
