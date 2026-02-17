import * as React from 'react';
import { createElement } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MediaHostingSettings from '../media-hosting-settings';
import { MEDIA_HOSTING_PROVIDERS } from '../../../../stores/use-media-hosting-store';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const act = (React as { act?: (cb: () => void | Promise<void>) => void | Promise<void> }).act as (cb: () => void | Promise<void>) => void | Promise<void>;

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const mockSetSelectedProvider = vi.fn();
const selectedProviderRef = vi.hoisted(() => ({ value: 'catbox' as string }));
vi.mock('../../../../stores/use-media-hosting-store', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../../../stores/use-media-hosting-store')>();
  return {
    ...mod,
    default: (selector: (state: { selectedProvider: string; setSelectedProvider: (provider: string) => void }) => unknown) =>
      selector({
        selectedProvider: selectedProviderRef.value,
        setSelectedProvider: mockSetSelectedProvider,
      }),
  };
});

let root: Root;
let container: HTMLDivElement;

const render = () => {
  act(() => {
    root.render(createElement(MediaHostingSettings));
  });
};

describe('MediaHostingSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectedProviderRef.value = 'catbox';
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('renders None option and all providers', () => {
    render();
    const radios = container.querySelectorAll('input[type="radio"]');
    expect(radios.length).toBe(MEDIA_HOSTING_PROVIDERS.length + 1);
    expect(container.textContent).toContain('media_hosting_none');
    for (const provider of MEDIA_HOSTING_PROVIDERS) {
      expect(container.textContent).toContain(provider.name);
      expect(container.textContent).toContain(provider.url);
    }
  });

  it('default selected is catbox', () => {
    render();
    const catboxRadio = container.querySelector<HTMLInputElement>('input[value="catbox"]');
    expect(catboxRadio).not.toBeNull();
    expect(catboxRadio?.checked).toBe(true);
    const noneRadio = container.querySelector<HTMLInputElement>('input[value="none"]');
    expect(noneRadio?.checked).toBe(false);
  });

  it('clicking a radio updates store selection', async () => {
    render();
    const noneRadio = container.querySelector<HTMLInputElement>('input[value="none"]');
    expect(noneRadio).not.toBeNull();
    await act(async () => {
      noneRadio?.click();
    });
    expect(mockSetSelectedProvider).toHaveBeenCalledWith('none');

    mockSetSelectedProvider.mockClear();
    selectedProviderRef.value = 'none';
    render();

    const providerRadio = container.querySelector<HTMLInputElement>(`input[value="${MEDIA_HOSTING_PROVIDERS[0].id}"]`);
    expect(providerRadio).not.toBeNull();
    await act(async () => {
      providerRadio?.click();
    });
    expect(mockSetSelectedProvider).toHaveBeenCalledWith(MEDIA_HOSTING_PROVIDERS[0].id);
  });
});
