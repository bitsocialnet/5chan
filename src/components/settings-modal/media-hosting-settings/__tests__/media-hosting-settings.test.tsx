import * as React from 'react';
import { createElement } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MediaHostingSettings from '../media-hosting-settings';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const act = (React as { act?: (cb: () => void | Promise<void>) => void | Promise<void> }).act as (cb: () => void | Promise<void>) => void | Promise<void>;

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const mockGetPlatform = vi.fn(() => 'web');
vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => mockGetPlatform() },
}));

const providerAvailabilityRef = vi.hoisted(() => ({
  value: {} as Record<string, 'unknown' | 'checking' | 'available' | 'unavailable'>,
}));
vi.mock('../../../../hooks/use-provider-availability', () => ({
  useProviderAvailability: () => providerAvailabilityRef.value,
}));

const mockSetUploadMode = vi.fn();
const mockSetPreferredProvider = vi.fn();
const mockSetShowLinkField = vi.fn();
const showLinkFieldRef = vi.hoisted(() => ({ value: false }));
const uploadModeRef = vi.hoisted(() => ({ value: 'random' as 'random' | 'preferred' | 'none' }));
const preferredProviderRef = vi.hoisted(() => ({
  value: 'catbox' as 'forge' | 'catbox' | 'imgur' | 'imgbb',
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
        showLinkField: showLinkFieldRef.value,
        setShowLinkField: mockSetShowLinkField,
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
    providerAvailabilityRef.value = {};
    showLinkFieldRef.value = false;
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
    mockGetPlatform.mockReturnValue('android');
    render();
    const radios = container.querySelectorAll('input[name="media-hosting-provider"]');
    expect(radios.length).toBe(3);
    expect(container.textContent).toContain('media_hosting_random');
    expect(container.textContent).toContain('media_hosting_preferred');
    expect(container.textContent).toContain('media_hosting_none');
  });

  it('shows provider list with hostname links when Preferred is selected', () => {
    uploadModeRef.value = 'preferred';
    mockGetPlatform.mockReturnValue('android');
    render();
    const links = Array.from(container.querySelectorAll('a'));
    expect(links.map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
      ['catbox.moe', 'https://catbox.moe'],
      ['imgur.com', 'https://imgur.com'],
      ['imgbb.com', 'https://imgbb.com'],
    ]);
    expect(container.textContent).not.toContain('https://');
  });

  it('default selected is random', () => {
    mockGetPlatform.mockReturnValue('android');
    render();
    const randomRadio = container.querySelector<HTMLInputElement>('input[value="random"]');
    expect(randomRadio).not.toBeNull();
    expect(randomRadio?.checked).toBe(true);
  });

  it('on web runtime, hides Random and shows the default settings as Preferred with Forge Images', () => {
    render();
    expect(container.querySelector('input[value="random"]')).toBeNull();
    expect(container.textContent).not.toContain('media_hosting_random');
    expect(container.querySelector<HTMLInputElement>('input[value="preferred"]')?.checked).toBe(true);

    const providerRadios = Array.from(container.querySelectorAll<HTMLInputElement>('input[name="media-hosting-provider-provider"]'));
    expect(providerRadios.map((radio) => [radio.value, radio.checked, radio.disabled])).toEqual([['forge', true, false]]);
    const link = container.querySelector('a');
    expect(link?.textContent).toBe('images.bitsocialforge.com');
    expect(link?.getAttribute('href')).toBe('https://images.bitsocialforge.com');
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

  it('enables Imgur on Android', async () => {
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

  it('clicking supported provider in preferred mode calls setPreferredProvider', async () => {
    uploadModeRef.value = 'preferred';
    preferredProviderRef.value = 'imgur';
    mockGetPlatform.mockReturnValue('android');
    render();
    const catboxRadio = container.querySelector<HTMLInputElement>('input[value="catbox"]');
    expect(catboxRadio).not.toBeNull();
    expect(catboxRadio?.disabled).toBe(false);
    await act(async () => {
      catboxRadio?.click();
    });
    expect(mockSetPreferredProvider).toHaveBeenCalledWith('catbox');
  });

  it('enables ImgBB on Android', async () => {
    uploadModeRef.value = 'preferred';
    preferredProviderRef.value = 'catbox';
    mockGetPlatform.mockReturnValue('android');
    render();
    const imgbbRadio = container.querySelector<HTMLInputElement>('input[value="imgbb"]');
    expect(imgbbRadio).not.toBeNull();
    expect(imgbbRadio?.disabled).toBe(false);
    await act(async () => {
      imgbbRadio?.click();
    });
    expect(mockSetPreferredProvider).toHaveBeenCalledWith('imgbb');
  });

  it('disables providers that are unavailable from this network', async () => {
    uploadModeRef.value = 'preferred';
    preferredProviderRef.value = 'catbox';
    providerAvailabilityRef.value = { imgbb: 'unavailable' };
    mockGetPlatform.mockReturnValue('android');
    render();
    const imgbbRadio = container.querySelector<HTMLInputElement>('input[value="imgbb"]');
    expect(imgbbRadio).not.toBeNull();
    expect(imgbbRadio?.disabled).toBe(true);
    expect(imgbbRadio?.closest('label')?.title).toBe('media_hosting_provider_unavailable');
    expect(container.textContent).toContain('media_hosting_provider_unavailable');
    await act(async () => {
      imgbbRadio?.click();
    });
    expect(mockSetPreferredProvider).not.toHaveBeenCalled();
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

  it('on web runtime, lists only Forge Images and None alongside Preferred', async () => {
    uploadModeRef.value = 'preferred';
    mockGetPlatform.mockReturnValue('web');
    (window as unknown as { electronApi?: unknown }).electronApi = undefined;
    render();

    const modeRadios = Array.from(container.querySelectorAll<HTMLInputElement>('input[name="media-hosting-provider"]'));
    expect(modeRadios.map((radio) => [radio.value, radio.disabled])).toEqual([
      ['preferred', false],
      ['none', false],
    ]);

    const providerRadios = Array.from(container.querySelectorAll<HTMLInputElement>('input[name="media-hosting-provider-provider"]'));
    expect(providerRadios.map((radio) => [radio.value, radio.disabled])).toEqual([['forge', false]]);
    expect(container.textContent).not.toContain('Catbox');
    expect(container.textContent).not.toContain('Imgur');
    expect(container.textContent).not.toContain('ImgBB');
  });

  it('on web runtime, disables forge when it is unavailable from this network', () => {
    uploadModeRef.value = 'preferred';
    providerAvailabilityRef.value = { forge: 'unavailable' };
    mockGetPlatform.mockReturnValue('web');
    render();

    const forgeRadio = container.querySelector<HTMLInputElement>('input[value="forge"]');
    expect(forgeRadio?.disabled).toBe(true);
    expect(container.textContent).toContain('media_hosting_provider_unavailable');
  });

  it('on web runtime, no Catbox-only web hint key is referenced', () => {
    mockGetPlatform.mockReturnValue('web');
    (window as unknown as { electronApi?: unknown }).electronApi = undefined;
    render();
    expect(container.textContent).not.toContain('media_hosting_provider_disabled_on_web');
  });

  it('on electron runtime, mode radios and electron providers are enabled; web-only forge is not listed', () => {
    uploadModeRef.value = 'preferred';
    mockGetPlatform.mockReturnValue('web');
    (window as unknown as { electronApi?: unknown }).electronApi = { isElectron: true };
    render();

    const modeRadios = container.querySelectorAll<HTMLInputElement>('input[name="media-hosting-provider"]');
    expect(modeRadios.length).toBe(3);
    for (const radio of modeRadios) {
      expect(radio.disabled).toBe(false);
    }

    const providerRadios = Array.from(container.querySelectorAll<HTMLInputElement>('input[name="media-hosting-provider-provider"]'));
    expect(providerRadios.map((radio) => [radio.value, radio.disabled])).toEqual([
      ['catbox', false],
      ['imgur', false],
      ['imgbb', false],
    ]);
    expect(container.textContent).not.toContain('Forge Images');
  });

  describe('show link field checkbox', () => {
    const getCheckbox = () => container.querySelector<HTMLInputElement>('input[type="checkbox"][aria-label="media_hosting_show_link_field"]');

    it('is unchecked by default while Forge Images can take uploads, and toggles the setting', async () => {
      render();

      const checkbox = getCheckbox();
      expect(checkbox?.checked).toBe(false);
      expect(checkbox?.disabled).toBe(false);
      expect(container.textContent).toContain('media_hosting_show_link_field_tip');

      await act(async () => {
        checkbox?.click();
      });
      expect(mockSetShowLinkField).toHaveBeenCalledWith(true);
    });

    it('reflects the stored setting', () => {
      showLinkFieldRef.value = true;
      render();

      expect(getCheckbox()?.checked).toBe(true);
      expect(getCheckbox()?.disabled).toBe(false);
    });

    it('is checked and locked when no provider is enabled', () => {
      uploadModeRef.value = 'none';
      render();

      expect(getCheckbox()?.checked).toBe(true);
      expect(getCheckbox()?.disabled).toBe(true);
    });

    it('is checked and locked when every enabled provider is unavailable', () => {
      providerAvailabilityRef.value = { forge: 'unavailable' };
      render();

      expect(getCheckbox()?.checked).toBe(true);
      expect(getCheckbox()?.disabled).toBe(true);
    });
  });
});
