import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ tempDir: '', spawn: null }));

vi.mock('electron', () => ({
  app: {
    getPath: () => h.tempDir,
    quit: vi.fn(),
  },
  shell: {
    openPath: vi.fn(),
  },
}));
vi.mock('node:child_process', () => ({ spawn: (...args) => h.spawn(...args) }));

const { spawnSync } = await vi.importActual('node:child_process');
const { app } = await import('electron');
const { downloadAndInstallUpdate, sanitizeFileName } = await import('./app-updater.js');

describe('app-updater', () => {
  it('falls back for empty and parent-directory file names', () => {
    expect(sanitizeFileName('')).toBe('5chan-update');
    expect(sanitizeFileName('.')).toBe('5chan-update');
    expect(sanitizeFileName('..')).toBe('5chan-update');
    expect(sanitizeFileName('../..')).toBe('5chan-update');
    expect(sanitizeFileName('nested/..')).toBe('5chan-update');
  });

  it('keeps a normal asset name', () => {
    expect(sanitizeFileName('5chan-darwin-arm64-v0.7.3.zip')).toBe('5chan-darwin-arm64-v0.7.3.zip');
  });
});

describe('downloadAndInstallUpdate', () => {
  const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
  const originalExecPath = process.execPath;
  const originalAppImage = process.env.APPIMAGE;
  // Root can write anywhere, so a read-only folder cannot be simulated.
  const canSimulateReadOnlyFolder = process.getuid?.() !== 0;
  let workDir;
  let installDir;

  const write = (filePath, content, mode = 0o644) => {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
    fs.chmodSync(filePath, mode);
  };
  const readLines = (filePath) => (fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8').trim().split('\n') : []);
  // A PID that is no longer running, so the helper does not wait for the app to quit.
  const exitedPid = () => `${spawnSync('/bin/sh', ['-c', 'exit 0']).pid}`;
  const serveUpdate = (fileName, content) => {
    const url = `https://github.com/bitsocialnet/5chan/releases/download/v9.9.9/${fileName}`;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, url, body: new Response(content).body })),
    );
    return { url, fileName };
  };
  // Installs like the renderer does, then waits for the app to quit for the update.
  const installUpdate = async (update) => {
    await downloadAndInstallUpdate(update);
    await vi.waitFor(() => expect(app.quit).toHaveBeenCalled());
  };
  const helperCall = () => h.spawn.mock.calls.find(([command, , options]) => command === '/bin/sh' && options?.detached);

  // A fake AppImage that records each start in launches.log.
  const fakeAppImage = (name) => `#!/bin/sh\necho ${name} >> "${installDir}/launches.log"\n`;
  const useAppImage = () => {
    const appImagePath = path.join(installDir, '5chan.AppImage');
    write(appImagePath, fakeAppImage('old'), 0o755);
    process.env.APPIMAGE = appImagePath;
    return appImagePath;
  };
  const runLinuxHelper = () => {
    const [, [scriptPath, targetPath, downloadedPath]] = helperCall();
    return spawnSync('/bin/sh', [scriptPath, targetPath, downloadedPath, exitedPid()]);
  };
  const waitForLaunches = async () => {
    await vi.waitFor(() => expect(readLines(path.join(installDir, 'launches.log')).length).toBeGreaterThan(0), { timeout: 3000 });
    // Leave time for a second, unwanted start to show up.
    await new Promise((resolve) => setTimeout(resolve, 300));
    return readLines(path.join(installDir, 'launches.log'));
  };

  const useMacApp = () => {
    const appBundlePath = path.join(installDir, '5chan.app');
    write(path.join(appBundlePath, 'Contents', 'version'), 'old');
    Object.defineProperty(process, 'platform', { ...originalPlatform, value: 'darwin' });
    process.execPath = path.join(appBundlePath, 'Contents', 'MacOS', '5chan');
    return appBundlePath;
  };
  // Runs the macOS helper with ditto and open replaced by shims, since the real ones are macOS-only.
  const runMacHelper = ({ dittoSucceeds }) => {
    const [, [scriptPath, targetPath, stagedPath]] = helperCall();
    const shimDir = path.join(workDir, 'shims');
    write(path.join(shimDir, 'ditto'), dittoSucceeds ? '#!/bin/sh\ncp -R "$1" "$2"\n' : '#!/bin/sh\necho "ditto: Permission denied" >&2\nexit 1\n', 0o755);
    // printf, not echo: dash (/bin/sh on Linux) reads open's -n flag as an echo option and drops it.
    write(path.join(shimDir, 'open'), `#!/bin/sh\nprintf '%s\\n' "$*" >> "${shimDir}/open.log"\n`, 0o755);
    const script = fs.readFileSync(scriptPath, 'utf8').replaceAll('/usr/bin/ditto', path.join(shimDir, 'ditto')).replaceAll('/usr/bin/open', path.join(shimDir, 'open'));
    fs.writeFileSync(scriptPath, script);
    const result = spawnSync('/bin/sh', [scriptPath, targetPath, stagedPath, exitedPid()]);
    return { status: result.status, opened: readLines(path.join(shimDir, 'open.log')) };
  };

  beforeEach(() => {
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), '5chan-app-updater-test-'));
    installDir = path.join(workDir, 'install');
    fs.mkdirSync(installDir);
    h.tempDir = path.join(workDir, 'temp');
    h.spawn = vi.fn((command, args) => {
      if (command === '/usr/bin/ditto') {
        // ditto -x -k <zip> <stagingRoot>: unpack a new app bundle.
        write(path.join(args[3], '5chan.app', 'Contents', 'version'), 'new');
        const child = new EventEmitter();
        child.stderr = new EventEmitter();
        process.nextTick(() => child.emit('close', 0));
        return child;
      }
      return { unref: vi.fn() };
    });
    vi.mocked(app.quit).mockClear();
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', originalPlatform);
    process.execPath = originalExecPath;
    if (originalAppImage === undefined) delete process.env.APPIMAGE;
    else process.env.APPIMAGE = originalAppImage;
    vi.unstubAllGlobals();
    fs.chmodSync(installDir, 0o755);
    fs.rmSync(workDir, { recursive: true, force: true });
  });

  it('hands a macOS app to the installer helper and quits', async () => {
    const appBundlePath = useMacApp();

    await installUpdate(serveUpdate('5chan-darwin-arm64-v9.9.9.zip', 'zip'));

    const [, [scriptPath, targetPath, stagedPath]] = helperCall();
    expect(targetPath).toBe(appBundlePath);
    expect(fs.readFileSync(path.join(stagedPath, 'Contents', 'version'), 'utf8')).toBe('new');
    expect(fs.readFileSync(scriptPath, 'utf8')).toContain('STAGED_TARGET="${TARGET_APP}.new"');
  });

  it.skipIf(!canSimulateReadOnlyFolder)('refuses a macOS update when the app folder is not writable, without quitting', async () => {
    useMacApp();
    fs.chmodSync(installDir, 0o555);

    await expect(downloadAndInstallUpdate(serveUpdate('5chan-darwin-arm64-v9.9.9.zip', 'zip'))).rejects.toThrow(/not writable/);

    expect(h.spawn).not.toHaveBeenCalled();
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(app.quit).not.toHaveBeenCalled();
  });

  it.skipIf(!canSimulateReadOnlyFolder)('refuses an AppImage update when the AppImage folder is not writable, without quitting', async () => {
    useAppImage();
    fs.chmodSync(installDir, 0o555);

    await expect(downloadAndInstallUpdate(serveUpdate('5chan-9.9.9.AppImage', fakeAppImage('new')))).rejects.toThrow(/not writable/);

    expect(h.spawn).not.toHaveBeenCalled();
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(app.quit).not.toHaveBeenCalled();
  });

  it('reopens the current macOS app when copying the update next to it fails', async () => {
    const appBundlePath = useMacApp();
    await installUpdate(serveUpdate('5chan-darwin-arm64-v9.9.9.zip', 'zip'));

    const { status, opened } = runMacHelper({ dittoSucceeds: false });

    expect(status).not.toBe(0);
    expect(opened).toEqual([`-n ${appBundlePath}`]);
    expect(fs.readFileSync(path.join(appBundlePath, 'Contents', 'version'), 'utf8')).toBe('old');
    expect(fs.existsSync(`${appBundlePath}.new`)).toBe(false);
  });

  it('opens the new macOS app once after replacing the current one', async () => {
    const appBundlePath = useMacApp();
    await installUpdate(serveUpdate('5chan-darwin-arm64-v9.9.9.zip', 'zip'));

    const { status, opened } = runMacHelper({ dittoSucceeds: true });

    expect(status).toBe(0);
    expect(opened).toEqual([`-n ${appBundlePath}`]);
    expect(fs.readFileSync(path.join(appBundlePath, 'Contents', 'version'), 'utf8')).toBe('new');
    expect(fs.existsSync(`${appBundlePath}.old`)).toBe(false);
  });

  it('starts the current AppImage again when replacing it fails', async () => {
    useAppImage();
    await installUpdate(serveUpdate('5chan-9.9.9.AppImage', fakeAppImage('new')));
    // Make the swap fail: the downloaded AppImage is gone by the time the helper runs.
    fs.rmSync(helperCall()[1][2]);

    const { status } = runLinuxHelper();

    expect(status).not.toBe(0);
    expect(await waitForLaunches()).toEqual(['old']);
  });

  it('starts the new AppImage once after replacing the current one', async () => {
    useAppImage();
    await installUpdate(serveUpdate('5chan-9.9.9.AppImage', fakeAppImage('new')));

    const { status } = runLinuxHelper();

    expect(status).toBe(0);
    expect(await waitForLaunches()).toEqual(['new']);
  });
});
