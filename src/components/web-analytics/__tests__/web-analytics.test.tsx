import { act, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { HashRouter, useNavigate, type NavigateFunction } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WebAnalytics from '../web-analytics';
import { getNonokoPendingRouteState, NONOKO_REPLY_ROUTE_STATE } from '../../../lib/utils/pending-post-route-state';
import { trackPageView } from '../../../lib/analytics';

vi.mock('../../../lib/analytics', () => ({ trackPageView: vi.fn() }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let navigate: NavigateFunction;
let root: Root;
let container: HTMLDivElement;
const Harness = () => {
  navigate = useNavigate();
  return <WebAnalytics />;
};
const render = () =>
  act(() =>
    root.render(
      <StrictMode>
        <HashRouter>
          <Harness />
        </HashRouter>
      </StrictMode>,
    ),
  );

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState(null, '', '/#/');
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('hash route pageviews', () => {
  it('tracks the landing route only once in StrictMode and ignores unrelated renders', async () => {
    await render();
    await render();
    expect(trackPageView).toHaveBeenCalledExactlyOnceWith('/');
  });

  it('tracks board, catalog, and distinct thread navigation while ignoring search and anchor-only changes', async () => {
    await render();
    await act(async () => {
      await navigate('/g');
    });
    await act(async () => {
      await navigate('/g/catalog');
    });
    await act(async () => {
      await navigate('/g/thread/first');
    });
    await act(async () => {
      await navigate('/g/thread/second');
    });
    await act(async () => {
      await navigate('/g/thread/second?query=private');
    });
    await act(async () => {
      await navigate('/g/thread/second?query=private#post-42');
    });
    expect(vi.mocked(trackPageView).mock.calls.map(([path]) => path)).toEqual(['/', '/g', '/g/catalog', '/g/thread/first', '/g/thread/second']);
  });

  it('records browser back and forward navigation', async () => {
    await render();
    await act(async () => {
      await navigate('/g');
    });
    await act(async () => {
      await navigate('/g/catalog');
    });
    await act(async () => {
      const popped = new Promise<void>((resolve) => window.addEventListener('popstate', () => resolve(), { once: true }));
      navigate(-1);
      await popped;
    });
    await act(async () => {
      const popped = new Promise<void>((resolve) => window.addEventListener('popstate', () => resolve(), { once: true }));
      navigate(1);
      await popped;
    });
    expect(vi.mocked(trackPageView).mock.calls.map(([path]) => path)).toEqual(['/', '/g', '/g/catalog', '/g', '/g/catalog']);
  });

  it('sends neither the pending page nor its redirect to the accepted thread', async () => {
    await render();
    await act(async () => {
      await navigate('/g');
    });
    await act(async () => {
      await navigate('/pending/upload');
    });
    await act(async () => {
      await navigate('/pending/7', { replace: true });
    });
    await act(async () => {
      await navigate('/g/thread/new-cid', { replace: true });
    });
    await act(async () => {
      await navigate('/g');
    });
    expect(vi.mocked(trackPageView).mock.calls.map(([path]) => path)).toEqual(['/', '/g', '/g']);
  });

  it('sends no view of the board index a nonoko reply or thread returns to', async () => {
    await render();
    await act(async () => {
      await navigate('/g/thread/cid');
    });
    await act(async () => {
      await navigate('/g', { state: NONOKO_REPLY_ROUTE_STATE });
    });
    await act(async () => {
      await navigate('/g/catalog');
    });
    await act(async () => {
      await navigate('/g', { state: getNonokoPendingRouteState(7) });
    });
    await act(async () => {
      await navigate('/g/catalog');
    });
    expect(vi.mocked(trackPageView).mock.calls.map(([path]) => path)).toEqual(['/', '/g/thread/cid', '/g/catalog', '/g/catalog']);
  });
});
