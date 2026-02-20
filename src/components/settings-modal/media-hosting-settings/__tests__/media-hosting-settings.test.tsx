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

const mockGetPlatform = vi.fn(() => 'web');
vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => mockGetPlatform() },
}));

const mockSetUploadMode = vi.fn();
const mockSetPreferredProvider = vi.fn();
const uploadModeRef = vi.hoisted(() => ({ value: 'random' as 'random' | 'preferred' | 'none' }));
const preferredProviderRef = vi.hoisted(() => ({
  value: 'catbox' as 'catbox' | 'imgur' | 'postimages',
}));
vi.mock('../../../../stores/use-media-hosting-store', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../../../stores/use-media-hosting-store')>();
  return {
    ...mod,
    default: (selector: (state: Record<string, unknown>) => unknown) =>
      selector({
        uploadMode: uploadModeRef.value,
        preferredProvider: preferredProviderRef.value,
        setUploadMode: mockSetUploadMode,
        setPreferredProvider: mockSetPreferredProvider,
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
    uploadModeRef.value = 'random';
    preferredProviderRef.value = 'catbox';
    mockGetPlatform.mockReturnValue('web');
    (window as unknown as { electronApi?: unknown }).electronApi = undefined;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('renders mode options: Random, Preferred, None', () => {
    render();
    const radios = container.querySelectorAll('input[name="media-hosting-provider"]');
    expect(radios.length).toBe(3);
    expect(container.textContent).toContain('media_hosting_random');
    expect(container.textContent).toContain('media_hosting_preferred');
    expect(container.textContent).toContain('media_hosting_none');
  });

  it('shows provider list when Preferred is selected', () => {
    uploadModeRef.value = 'preferred';
    render();
    for (const provider of MEDIA_HOSTING_PROVIDERS) {
      expect(container.textContent).toContain(provider.label);
      expect(container.textContent).toContain(provider.homepageUrl);
    }
  });

  it('default selected is random', () => {
    render();
    const randomRadio = container.querySelector<HTMLInputElement>('input[value="random"]');
    expect(randomRadio).not.toBeNull();
    expect(randomRadio?.checked).toBe(true);
  });

  it('clicking None updates store via setUploadMode', async () => {
    mockGetPlatform.mockReturnValue('android');
    render();
    const noneRadio = container.querySelector<HTMLInputElement>('input[value="none"]');
    expect(noneRadio).not.toBeNull();
    await act(async () => {
      noneRadio?.click();
    });
    expect(mockSetUploadMode).toHaveBeenCalledWith('none');
  });

  it('clicking provider in preferred mode calls setPreferredProvider', async () => {
    uploadModeRef.value = 'preferred';
    preferredProviderRef.value = 'catbox';
    mockGetPlatform.mockReturnValue('android');
    render();
    const imgurRadio = container.querySelector<HTMLInputElement>('input[value="imgur"]');
    expect(imgurRadio).not.toBeNull();
    expect(imgurRadio?.disabled).toBe(false);
    await act(async () => {
      imgurRadio?.click();
    });
    expect(mockSetPreferredProvider).toHaveBeenCalledWith('imgur');
  });

  it('clicking Random updates store via setUploadMode', async () => {
    uploadModeRef.value = 'preferred';
    mockGetPlatform.mockReturnValue('android');
    render();
    const randomRadio = container.querySelector<HTMLInputElement>('input[value="random"]');
    expect(randomRadio).not.toBeNull();
    await act(async () => {
      randomRadio?.click();
    });
    expect(mockSetUploadMode).toHaveBeenCalledWith('random');
  });

  it('clicking Preferred updates store via setUploadMode', async () => {
    mockGetPlatform.mockReturnValue('android');
    render();
    const preferredRadio = container.querySelector<HTMLInputElement>('input[value="preferred"]');
    expect(preferredRadio).not.toBeNull();
    await act(async () => {
      preferredRadio?.click();
    });
    expect(mockSetUploadMode).toHaveBeenCalledWith('preferred');
  });

  it('on web runtime, warning renders above mode radios and all radios are disabled', () => {
    uploadModeRef.value = 'preferred';
    mockGetPlatform.mockReturnValue('web');
    (window as unknown as { electronApi?: unknown }).electronApi = undefined;
    render();

    const warningDiv = Array.from(container.querySelectorAll('div')).find((d) => d.textContent?.includes('upload_not_supported_web_before_link'));
    expect(warningDiv).toBeTruthy();
    const firstModeRadio = container.querySelector<HTMLInputElement>('input[name="media-hosting-provider"]');
    expect(firstModeRadio).toBeTruthy();
    expect(warningDiv!.compareDocumentPosition(firstModeRadio!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    const modeRadios = container.querySelectorAll<HTMLInputElement>('input[name="media-hosting-provider"]');
    expect(modeRadios.length).toBe(3);
    for (const radio of modeRadios) {
      expect(radio.disabled).toBe(true);
    }

    const providerRadios = container.querySelectorAll<HTMLInputElement>('input[name="media-hosting-provider-provider"]');
    expect(providerRadios.length).toBe(MEDIA_HOSTING_PROVIDERS.length);
    for (const radio of providerRadios) {
      expect(radio.disabled).toBe(true);
    }

    expect(container.textContent).toContain('upload_not_supported_web_before_link');
    expect(container.textContent).toContain('upload_not_supported_web_link_text');
  });

  it('on web runtime, no Catbox-only web hint key is referenced', () => {
    mockGetPlatform.mockReturnValue('web');
    (window as unknown as { electronApi?: unknown }).electronApi = undefined;
    render();
    expect(container.textContent).not.toContain('media_hosting_provider_disabled_on_web');
  });

  it('on electron runtime, all radios are enabled and no CORS warning is shown', () => {
    uploadModeRef.value = 'preferred';
    mockGetPlatform.mockReturnValue('web');
    (window as unknown as { electronApi?: unknown }).electronApi = { isElectron: true };
    render();

    const modeRadios = container.querySelectorAll<HTMLInputElement>('input[name="media-hosting-provider"]');
    expect(modeRadios.length).toBe(3);
    for (const radio of modeRadios) {
      expect(radio.disabled).toBe(false);
    }

    const providerRadios = container.querySelectorAll<HTMLInputElement>('input[name="media-hosting-provider-provider"]');
    expect(providerRadios.length).toBe(MEDIA_HOSTING_PROVIDERS.length);
    for (const radio of providerRadios) {
      expect(radio.disabled).toBe(false);
    }

    expect(container.textContent).not.toContain('upload_not_supported_web_before_link');
  });
});
