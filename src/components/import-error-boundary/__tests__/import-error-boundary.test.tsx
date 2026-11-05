import * as React from 'react';
import { createElement, Suspense } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { lazyImport } from '../../../lib/import-failures';
import ImportErrorBoundary from '../import-error-boundary';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const act = (React as { act?: (cb: () => void | Promise<void>) => void | Promise<void> }).act as (cb: () => void | Promise<void>) => void | Promise<void>;

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

let container: HTMLDivElement;
let root: Root;

const renderLazy = async (error: Error, fallback?: React.ReactNode) => {
  const Lazy = lazyImport(() => Promise.reject(error));
  await act(async () => {
    root.render(
      <ImportErrorBoundary fallback={fallback}>
        <Suspense fallback={<span>loading</span>}>
          <Lazy />
        </Suspense>
      </ImportErrorBoundary>,
    );
  });
  await act(async () => {
    await Promise.resolve();
  });
};

describe('ImportErrorBoundary', () => {
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('renders its fallback when a lazy component fails to download', async () => {
    await renderLazy(new TypeError('Failed to fetch dynamically imported module: https://5chan.app/assets/tooltip.js'), createElement('span', null, 'plain icon'));

    expect(container.textContent).toBe('plain icon');
  });

  it('offers a reload by default when a lazy component fails to download', async () => {
    await renderLazy(new TypeError('Importing a module script failed.'));

    expect(container.querySelector('[role="alert"]')?.textContent).toContain('refresh');
  });

  it('lets other errors through', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(renderLazy(new Error('the module threw while evaluating'), createElement('span', null, 'plain icon'))).rejects.toThrow(
      'the module threw while evaluating',
    );
    expect(container.textContent).not.toContain('plain icon');
    consoleError.mockRestore();
  });
});
