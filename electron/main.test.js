import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  state: null,
  startIpfs: {},
  pkcDataPath: '',
  buildMenu: (items) => ({
    items,
    insert(index, item) {
      this.items.splice(index, 0, item);
    },
  }),
}));

vi.mock('electron', async () => {
  const { EventEmitter } = await import('node:events');

  class BrowserWindow extends EventEmitter {
    constructor(options) {
      super();
      this.options = options;
      this.webContents = Object.assign(new EventEmitter(), {
        canGoBack: () => false,
        canGoForward: () => false,
        goBack: vi.fn(),
        goForward: vi.fn(),
        reload: vi.fn(),
        clearHistory: vi.fn(),
        getURL: () => '',
        setWindowOpenHandler: vi.fn(),
        session: {
          webRequest: { onBeforeSendHeaders: vi.fn(), onHeadersReceived: vi.fn() },
          setPermissionRequestHandler: vi.fn(),
        },
      });
      this.loadURL = vi.fn();
      this.show = vi.fn();
      this.hide = vi.fn();
      this.isVisible = () => true;
      this.destroy = vi.fn();
      this.openDevTools = vi.fn();
      h.state.windows.push(this);
    }

    // Like the user closing the window on macOS, where main.js adds no close-to-tray handler.
    close() {
      h.state.windows = h.state.windows.filter((window) => window !== this);
      this.emit('closed');
    }

    static getAllWindows() {
      return [...h.state.windows];
    }

    static fromWebContents() {
      return null;
    }
  }

  class MenuItem {
    constructor(options) {
      Object.assign(this, options);
    }
  }

  class Tray {
    setToolTip() {}
    setContextMenu() {}
    on() {}
  }

  return {
    app: {
      commandLine: { appendSwitch: vi.fn() },
      whenReady: () => h.state.ready,
      isReady: () => h.state.isReady,
      on: (event, listener) => h.state.app.on(event, listener),
      quit: vi.fn(),
      getPath: vi.fn(),
      setName: vi.fn(),
    },
    BrowserWindow,
    Menu: {
      getApplicationMenu: () => h.state.applicationMenu,
      setApplicationMenu: (menu) => {
        h.state.applicationMenu = menu;
      },
      buildFromTemplate: (template) => h.buildMenu(template),
    },
    MenuItem,
    Tray,
    shell: { openExternal: vi.fn() },
    dialog: { showErrorBox: (...args) => h.state.showErrorBox(...args) },
    nativeTheme: { shouldUseDarkColors: false },
    nativeImage: { createFromPath: () => ({ isEmpty: () => true }) },
    ipcMain: { on: vi.fn(), handle: vi.fn() },
    clipboard: { writeText: vi.fn() },
  };
});
vi.mock('./log.js', () => ({}));
vi.mock('./media-upload-automation.js', () => ({ automateUploadMedia: vi.fn() }));
vi.mock('./forge-turnstile.js', () => ({ getForgeTurnstileToken: vi.fn() }));
vi.mock('./strip-media-metadata.js', () => ({ prepareStrippedUploadFile: vi.fn() }));
vi.mock('./app-updater.js', () => ({ downloadAndInstallUpdate: vi.fn() }));
vi.mock('./node-reachability.js', () => ({ getNodeReachability: vi.fn() }));
vi.mock('electron-is-dev', () => ({ default: false }));
vi.mock('./start-ipfs.js', () => ({ default: h.startIpfs }));
vi.mock('./start-pkc-rpc.js', () => ({}));
vi.mock('./user-agent.js', () => ({ createFakeUserAgent: () => 'test-agent' }));
vi.mock('electron-context-menu', () => ({ default: vi.fn() }));
vi.mock('./pkc-paths.js', () => ({ getPkcDataPath: () => h.pkcDataPath }));

const flush = () => new Promise((resolve) => setImmediate(resolve));
const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');

// Loads main.js fresh, as Electron does at launch, on the given platform.
const loadMain = async (platform) => {
  vi.resetModules();
  let resolveReady;
  h.state = {
    windows: [],
    app: new EventEmitter(),
    isReady: false,
    ready: new Promise((resolve) => {
      resolveReady = resolve;
    }),
    applicationMenu: h.buildMenu([{ role: 'appMenu' }, { role: 'fileMenu' }, { role: 'help' }]),
    showErrorBox: vi.fn(),
  };
  Object.defineProperty(process, 'platform', { ...originalPlatform, value: platform });
  await import('./main.js');

  const becomeReady = async () => {
    h.state.isReady = true;
    resolveReady();
    await flush();
  };
  const currentWindow = () => h.state.windows[0];
  const reopenWindowOnMac = () => {
    currentWindow().close();
    h.state.app.emit('activate');
  };
  const menuLabels = () => h.state.applicationMenu.items.map((item) => item.label ?? item.role);
  return { becomeReady, currentWindow, reopenWindowOnMac, menuLabels, showErrorBox: h.state.showErrorBox };
};

beforeAll(() => {
  h.pkcDataPath = fs.mkdtempSync(path.join(os.tmpdir(), '5chan-main-test-'));
  fs.writeFileSync(path.join(h.pkcDataPath, 'auth-key'), 'test-auth-key');
});

afterEach(() => {
  Object.defineProperty(process, 'platform', originalPlatform);
});

afterAll(() => {
  fs.rmSync(h.pkcDataPath, { recursive: true, force: true });
});

describe('main window lifecycle', () => {
  it('keeps one set of navigation items in the macOS menu when the window is reopened', async () => {
    const { becomeReady, currentWindow, reopenWindowOnMac, menuLabels } = await loadMain('darwin');
    await becomeReady();
    expect(menuLabels()).toEqual(['appMenu', '←', '→', '⟳', 'fileMenu', 'help']);

    reopenWindowOnMac();
    reopenWindowOnMac();
    expect(menuLabels()).toEqual(['appMenu', '←', '→', '⟳', 'fileMenu', 'help']);

    // The one set of items acts on the window that is open now.
    const reopenedWindow = currentWindow();
    h.state.applicationMenu.items.find((item) => item.label === '←').click();
    h.state.applicationMenu.items.find((item) => item.label === '→').click();
    expect(reopenedWindow.webContents.goBack).toHaveBeenCalledTimes(1);
    expect(reopenedWindow.webContents.goForward).toHaveBeenCalledTimes(1);
  });

  it('puts the navigation items first and drops the help menu on other platforms', async () => {
    const { becomeReady, menuLabels } = await loadMain('linux');
    await becomeReady();
    expect(menuLabels()).toEqual(['←', '→', '⟳', 'appMenu', 'fileMenu']);
  });
});

describe('IPFS warning', () => {
  it.each(['darwin', 'linux'])('shows an error from before the app is ready once, when the window is ready (%s)', async (platform) => {
    const { becomeReady, currentWindow, showErrorBox } = await loadMain(platform);
    h.startIpfs.onError(new Error('kubo failed'));
    expect(showErrorBox).not.toHaveBeenCalled();

    await becomeReady();
    currentWindow().emit('ready-to-show');
    expect(showErrorBox).toHaveBeenCalledTimes(1);
    expect(showErrorBox).toHaveBeenCalledWith('IPFS warning', 'kubo failed');

    // The restart loop reports the same failure again every second.
    h.startIpfs.onError(new Error('kubo failed'));
    expect(showErrorBox).toHaveBeenCalledTimes(1);
  });

  it('does not show the warning again for a window reopened on macOS', async () => {
    const { becomeReady, currentWindow, reopenWindowOnMac, showErrorBox } = await loadMain('darwin');
    await becomeReady();
    currentWindow().emit('ready-to-show');
    h.startIpfs.onError(new Error('kubo failed'));
    expect(showErrorBox).toHaveBeenCalledTimes(1);

    reopenWindowOnMac();
    currentWindow().emit('ready-to-show');
    expect(showErrorBox).toHaveBeenCalledTimes(1);
  });
});
