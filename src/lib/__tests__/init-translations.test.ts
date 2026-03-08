import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_INTERFACE_LANGUAGE, INTERFACE_LANGUAGE_STORAGE_KEY } from '../constants';

const testState = vi.hoisted(() => {
  const i18next = {
    init: vi.fn(),
    use: vi.fn(),
  };
  i18next.use.mockImplementation(() => i18next);

  return {
    backendPlugin: { name: 'backend-plugin' },
    detectorPlugin: { name: 'detector-plugin' },
    i18next,
    reactPlugin: { name: 'react-plugin' },
  };
});

vi.mock('i18next', () => ({
  default: testState.i18next,
}));

vi.mock('i18next-http-backend', () => ({
  default: testState.backendPlugin,
}));

vi.mock('i18next-browser-languagedetector', () => ({
  default: testState.detectorPlugin,
}));

vi.mock('react-i18next', () => ({
  initReactI18next: testState.reactPlugin,
}));

describe('init-translations', () => {
  beforeEach(() => {
    vi.resetModules();
    testState.i18next.use.mockClear();
    testState.i18next.init.mockClear();
    testState.i18next.use.mockImplementation(() => testState.i18next);
  });

  it('initializes i18next with the backend, detector, react plugin, and supported languages', async () => {
    await import('../init-translations');

    expect(testState.i18next.use).toHaveBeenNthCalledWith(1, testState.backendPlugin);
    expect(testState.i18next.use).toHaveBeenNthCalledWith(2, testState.detectorPlugin);
    expect(testState.i18next.use).toHaveBeenNthCalledWith(3, testState.reactPlugin);
    expect(testState.i18next.init).toHaveBeenCalledWith(
      expect.objectContaining({
        fallbackLng: DEFAULT_INTERFACE_LANGUAGE,
        ns: ['default'],
        defaultNS: 'default',
        backend: { loadPath: './translations/{{lng}}/{{ns}}.json' },
        detection: {
          order: ['localStorage'],
          caches: ['localStorage'],
          lookupLocalStorage: INTERFACE_LANGUAGE_STORAGE_KEY,
        },
      }),
    );
    expect(testState.i18next.init.mock.calls[0]?.[0]?.supportedLngs).toContain('en');
    expect(testState.i18next.init.mock.calls[0]?.[0]?.supportedLngs).toContain('ja');
  });
});
