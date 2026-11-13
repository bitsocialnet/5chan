import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// index.tsx, or a module it imports such as React, failed to download.
vi.mock('../index', () => {
  throw new TypeError('Importing a module script failed.');
});

describe('bootstrap', () => {
  const originalLocation = window.location;
  let reload: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // A production start: no React render collector or development tools.
    vi.stubEnv('DEV', false);
    reload = vi.fn();
    document.body.innerHTML = '<div id="root"><div data-static-shell>static frame</div></div>';
    Object.defineProperty(window, 'location', { configurable: true, value: { ...originalLocation, reload } });
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.unstubAllEnvs();
    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
  });

  it('offers a reload in place of the static frame when the app fails to download', async () => {
    await import('../bootstrap');

    const alert = await vi.waitFor(() => {
      const element = document.querySelector('#root [role="alert"]');
      expect(element).not.toBeNull();
      return element!;
    });
    expect(alert.textContent).toBe('Connection Error [Refresh]');
    expect(document.querySelector('[data-static-shell]')).toBeNull();

    alert.querySelector('button')!.click();
    expect(reload).toHaveBeenCalledOnce();
  });
});
