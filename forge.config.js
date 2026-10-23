import { downloadIpfsClients } from './electron/before-pack.js';

// Sign and notarize the mac app only when Apple credentials are present (CI release
// builds); local builds without the certificate stay unsigned and keep working.
const shouldSignMac = process.platform === 'darwin' && !!process.env.APPLE_ID && !!process.env.APPLE_APP_SPECIFIC_PASSWORD && !!process.env.APPLE_TEAM_ID;

// Package only the top-level entries the app loads at runtime. Anything else in the
// checkout (docs, agent tooling, local caches, sockets like .codegraph/daemon.sock that
// fail the copy with ERR_FS_CP_SOCKET) stays out of the bundle.
const packagedRootEntries = new Set(['/package.json', '/LICENSE', '/electron', '/build', '/bin', '/node_modules']);

// Files dropped inside the packaged entries. A function `ignore` replaces @electron/packager's
// default ignores, so its node_modules/.bin, object file, node_gyp_bins and .git rules are repeated here.
const ignoredPackagedPaths = [
  // Build-time, signing, and test files that sit next to the Electron runtime code
  /^\/electron\/(before-pack\.js|download-ipfs\.js|build-docker\.sh|entitlements\.plist|preload\.mjs|vite-config\.js|vite\.preload\.config\.js)$/,
  /^\/electron\/.*\.test\.js$/,
  /\.map$/,
  /\.md$/,
  /\.ts$/,
  /tsconfig\.json$/,
  /\.env$/,
  /\.DS_Store$/,
  /yarn\.lock$/,
  // .bin directories contain symlinks that escape the app directory
  /^\/node_modules\/(.*\/)?\.bin($|\/)/,
  // Tool caches and Yarn metadata (.cache, .vite, .vitest-cache, .yarn-state.yml); package names never start with a dot
  /^\/node_modules\/\.[^/]+($|\/)/,
  /\.o(bj)?$/,
  /\/node_gyp_bins($|\/)/,
  /\/\.git($|\/)/,
];

const shouldIgnorePackagePath = (file) => {
  // The packager also filters the app root itself, as an empty path.
  if (!file) return false;
  const rootEntry = file.match(/^\/[^/]+/)?.[0];
  return !packagedRootEntries.has(rootEntry) || ignoredPackagedPaths.some((pattern) => pattern.test(file));
};

const config = {
  packagerConfig: {
    name: '5chan',
    executableName: '5chan',
    appBundleId: '5chan.desktop',
    icon: './public/icon', // electron-forge adds the correct extension per platform

    // Keep Squirrel from processing the deeply nested dependency tree as loose files.
    // Kubo and native modules still need real filesystem paths at runtime.
    asar: {
      // Use forward slashes so minimatch also recognizes the glob on Windows.
      unpackDir: 'bin/**/*',
    },

    ignore: shouldIgnorePackagePath,

    ...(shouldSignMac && {
      osxSign: {
        // identity is auto-discovered from the keychain (the only Developer ID
        // Application identity present, both locally and in the CI temp keychain)
        optionsForFile: () => ({
          hardenedRuntime: true,
          entitlements: './electron/entitlements.plist',
        }),
      },
      osxNotarize: {
        appleId: process.env.APPLE_ID,
        appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
        teamId: process.env.APPLE_TEAM_ID,
      },
    }),
  },

  rebuildConfig: {
    // Only better-sqlite3 is intentionally prepared and verified before packaging.
    // Using `onlyModules` prevents Forge from rebuilding unrelated optional addons
    // that inflate Windows package times.
    onlyModules: ['better-sqlite3'],
  },

  hooks: {
    // Download IPFS/Kubo binaries before packaging
    generateAssets: async () => {
      console.log('Downloading IPFS clients...');
      await downloadIpfsClients();
      console.log('IPFS clients downloaded.');
    },
  },

  plugins: [
    {
      name: '@electron-forge/plugin-auto-unpack-natives',
      config: {},
    },
  ],

  makers: [
    // macOS
    {
      name: '@electron-forge/maker-dmg',
      platforms: ['darwin'],
      config: {
        name: '5chan',
        icon: './public/icon.icns',
        format: 'ULFO',
      },
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin'],
    },
    // Windows
    {
      name: '@electron-forge/maker-squirrel',
      platforms: ['win32'],
      config: {
        name: '5chan',
        setupIcon: './public/windows-icon.ico',
      },
    },
    // Linux
    {
      name: '@reforged/maker-appimage',
      platforms: ['linux'],
      config: {
        options: {
          name: '5chan',
          icon: './public/icon.png',
          categories: ['Network'],
        },
      },
    },
  ],
};

export default config;
