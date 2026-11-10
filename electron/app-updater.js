import { app, shell } from 'electron';
import fs, { createWriteStream } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { spawn } from 'node:child_process';

const isTrustedGitHubHost = (hostname) => hostname === 'github.com' || hostname === 'githubusercontent.com' || hostname.endsWith('.githubusercontent.com');

const LOCAL_TEST_HOSTS = new Set(
  `${process.env.APP_UPDATE_ALLOWED_DOWNLOAD_HOSTS || ''}`
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean),
);

const logUpdateDebug = (...args) => {
  if (process.env.APP_UPDATE_DEBUG === '1') {
    const message = `[app-updater] ${args.map((value) => (typeof value === 'string' ? value : JSON.stringify(value))).join(' ')}`;
    console.log(message);
    const debugLogPath = process.env.APP_UPDATE_DEBUG_LOG_PATH;
    if (debugLogPath) {
      try {
        fs.appendFileSync(debugLogPath, `${message}\n`, 'utf8');
      } catch {
        // Ignore debug log write failures so they never affect the updater flow.
      }
    }
  }
};

const sanitizeFileName = (fileName) => {
  const safeName = `${fileName || ''}`.split(/[\\/]/).pop()?.trim();
  if (!safeName || safeName === '.' || safeName === '..') {
    return '5chan-update';
  }

  return safeName;
};

const runDetachedCommand = (command, args) => {
  const child = spawn(command, args, {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
};

const runCommand = (command, args) =>
  new Promise((resolve, reject) => {
    let stderr = '';
    const child = spawn(command, args, {
      stdio: ['ignore', 'ignore', 'pipe'],
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(stderr.trim() || `${command} exited with code ${code}`));
    });
  });

const isAllowedDownloadHost = (parsedUrl) => {
  const hostname = parsedUrl.hostname.toLowerCase();
  if (parsedUrl.protocol === 'https:' && isTrustedGitHubHost(hostname)) {
    return true;
  }

  return LOCAL_TEST_HOSTS.has(hostname) && (parsedUrl.protocol === 'https:' || parsedUrl.protocol === 'http:');
};

const validateDownloadUrl = (url) => {
  const parsedUrl = new URL(url);

  if (!isAllowedDownloadHost(parsedUrl)) {
    throw new Error('Only approved release asset hosts are supported');
  }

  return parsedUrl;
};

const downloadReleaseAsset = async ({ url, fileName }) => {
  logUpdateDebug('starting asset download', { url, fileName });
  validateDownloadUrl(url);

  const updatesDirectory = path.join(app.getPath('temp'), '5chan-updates');
  const targetPath = path.join(updatesDirectory, sanitizeFileName(fileName));
  const tempPath = `${targetPath}.download`;

  await fs.promises.mkdir(updatesDirectory, { recursive: true });
  await fs.promises.rm(tempPath, { force: true });

  const response = await fetch(url, {
    redirect: 'follow',
  });
  validateDownloadUrl(response.url);

  if (!response.ok || !response.body) {
    throw new Error(`Failed to download update (${response.status})`);
  }

  await pipeline(Readable.fromWeb(response.body), createWriteStream(tempPath));
  await fs.promises.rm(targetPath, { force: true });
  await fs.promises.rename(tempPath, targetPath);
  logUpdateDebug('downloaded release asset', { url: response.url, targetPath });

  return targetPath;
};

const findMacAppBundlePath = () => {
  let currentPath = process.execPath;

  while (currentPath && currentPath !== path.dirname(currentPath)) {
    if (currentPath.endsWith('.app')) {
      return currentPath;
    }

    currentPath = path.dirname(currentPath);
  }

  return null;
};

const findExtractedAppBundle = async (directoryPath) => {
  const entries = await fs.promises.readdir(directoryPath, {
    withFileTypes: true,
  });

  for (const entry of entries) {
    const entryPath = path.join(directoryPath, entry.name);

    if (entry.isDirectory() && entry.name.endsWith('.app')) {
      return entryPath;
    }

    if (entry.isDirectory()) {
      const nestedMatch = await findExtractedAppBundle(entryPath);
      if (nestedMatch) {
        return nestedMatch;
      }
    }
  }

  return null;
};

// The installer helper replaces the app after this process quits, so if it cannot write next to the app (a read-only
// or translocated macOS location, /Applications without admin rights, an AppImage in a system folder) the user is
// left with no app open. Check while the app can still report the error.
const assertInstallLocationWritable = async (appPath) => {
  const installDirectory = path.dirname(appPath);
  try {
    await fs.promises.access(installDirectory, fs.constants.W_OK);
  } catch {
    throw new Error(`Cannot install the update because ${installDirectory} is not writable. Move 5chan to a folder you can write to, then try again.`);
  }
};

const scheduleMacAppBundleInstall = async (zipPath) => {
  const currentAppBundlePath = findMacAppBundlePath();
  if (!currentAppBundlePath) {
    throw new Error('Could not resolve the current macOS app bundle');
  }
  await assertInstallLocationWritable(currentAppBundlePath);

  const stagingRoot = path.join(app.getPath('temp'), '5chan-updates', `staged-mac-${Date.now()}`);
  await fs.promises.mkdir(stagingRoot, { recursive: true });
  logUpdateDebug('extracting mac update zip', { zipPath, stagingRoot });
  await runCommand('/usr/bin/ditto', ['-x', '-k', zipPath, stagingRoot]);

  const stagedAppBundlePath = await findExtractedAppBundle(stagingRoot);
  if (!stagedAppBundlePath) {
    throw new Error('Downloaded update does not contain a macOS app bundle');
  }
  logUpdateDebug('resolved staged mac app bundle', { stagedAppBundlePath });

  const installerScriptPath = path.join(stagingRoot, 'install-update.sh');
  const script = `#!/bin/sh
set -eu
TARGET_APP="$1"
SOURCE_APP="$2"
CURRENT_PID="$3"
STAGED_TARGET="\${TARGET_APP}.new"
PREVIOUS_TARGET="\${TARGET_APP}.old"
OPENED=0

# The app has quit by now: if any step below fails, put the current app back and reopen it.
reopen_current_app() {
  if [ "$OPENED" = 1 ]; then
    return
  fi
  rm -rf "$STAGED_TARGET" || true
  if [ ! -e "$TARGET_APP" ] && [ -e "$PREVIOUS_TARGET" ]; then
    mv "$PREVIOUS_TARGET" "$TARGET_APP" || true
  fi
  /usr/bin/open -n "$TARGET_APP" || true
}
trap reopen_current_app EXIT

for _ in $(seq 1 120); do
  if ! kill -0 "$CURRENT_PID" 2>/dev/null; then
    break
  fi
  sleep 1
done

rm -rf "$STAGED_TARGET" "$PREVIOUS_TARGET"
/usr/bin/ditto "$SOURCE_APP" "$STAGED_TARGET"
if [ -e "$TARGET_APP" ]; then
  mv "$TARGET_APP" "$PREVIOUS_TARGET"
fi
if ! mv "$STAGED_TARGET" "$TARGET_APP"; then
  if [ -e "$PREVIOUS_TARGET" ]; then
    mv "$PREVIOUS_TARGET" "$TARGET_APP"
  fi
  exit 1
fi
/usr/bin/open -n "$TARGET_APP"
OPENED=1
rm -rf "$PREVIOUS_TARGET" "$(dirname "$SOURCE_APP")"
`;
  await fs.promises.writeFile(installerScriptPath, script, 'utf8');
  await fs.promises.chmod(installerScriptPath, 0o755);
  logUpdateDebug('wrote mac installer script', { installerScriptPath });

  runDetachedCommand('/bin/sh', [installerScriptPath, currentAppBundlePath, stagedAppBundlePath, `${process.pid}`]);
  logUpdateDebug('spawned mac installer helper', { currentAppBundlePath, stagedAppBundlePath, currentPid: process.pid });
};

const resolveCurrentLinuxAppImagePath = () => {
  if (typeof process.env.APPIMAGE === 'string' && process.env.APPIMAGE.trim().length > 0) {
    return process.env.APPIMAGE.trim();
  }

  return process.execPath.endsWith('.AppImage') ? process.execPath : null;
};

const scheduleLinuxAppImageInstall = async (installerPath) => {
  const currentAppImagePath = resolveCurrentLinuxAppImagePath();
  if (!currentAppImagePath) {
    throw new Error('Could not resolve the current AppImage path');
  }
  await assertInstallLocationWritable(currentAppImagePath);

  await fs.promises.chmod(installerPath, 0o755);

  const installerScriptPath = path.join(path.dirname(installerPath), `install-update-${Date.now()}.sh`);
  const script = `#!/bin/sh
set -eu
TARGET_APPIMAGE="$1"
DOWNLOADED_APPIMAGE="$2"
CURRENT_PID="$3"
LAUNCHED=0

# The app has quit by now: if replacing it fails, start the current AppImage again.
relaunch_current_app() {
  if [ "$LAUNCHED" = 0 ] && [ -e "$TARGET_APPIMAGE" ]; then
    "$TARGET_APPIMAGE" >/dev/null 2>&1 &
  fi
}
trap relaunch_current_app EXIT

for _ in $(seq 1 120); do
  if ! kill -0 "$CURRENT_PID" 2>/dev/null; then
    break
  fi
  sleep 1
done

mv "$DOWNLOADED_APPIMAGE" "$TARGET_APPIMAGE"
chmod 755 "$TARGET_APPIMAGE"
"$TARGET_APPIMAGE" >/dev/null 2>&1 &
LAUNCHED=1
rm -f "$0"
`;
  await fs.promises.writeFile(installerScriptPath, script, 'utf8');
  await fs.promises.chmod(installerScriptPath, 0o755);

  runDetachedCommand('/bin/sh', [installerScriptPath, currentAppImagePath, installerPath, `${process.pid}`]);
};

const openDownloadedUpdate = async (installerPath) => {
  if (process.platform === 'darwin' && installerPath.toLowerCase().endsWith('.zip')) {
    await scheduleMacAppBundleInstall(installerPath);
    return 'quit-and-relaunch';
  }

  if (installerPath.toLowerCase().endsWith('.appimage')) {
    await scheduleLinuxAppImageInstall(installerPath);
    return 'quit-and-relaunch';
  }

  const shellResult = await shell.openPath(installerPath);
  if (shellResult) {
    throw new Error(shellResult);
  }

  return 'external-installer';
};

const downloadAndInstallUpdate = async ({ url, fileName }) => {
  logUpdateDebug('received update install request', { url, fileName });
  if (typeof url !== 'string' || url.trim().length === 0) {
    throw new Error('Update url is required');
  }

  const installerPath = await downloadReleaseAsset({
    url: url.trim(),
    fileName,
  });

  const installMode = await openDownloadedUpdate(installerPath);
  logUpdateDebug('prepared update install', { installMode, installerPath });

  if (installMode === 'quit-and-relaunch') {
    setTimeout(() => {
      logUpdateDebug('quitting app for update');
      app.quit();
    }, 200);
  }
};

export { downloadAndInstallUpdate, sanitizeFileName };
