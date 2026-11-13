// Imports nothing, so bootstrap.ts can tell a failed download before React or the app has loaded.

// What a dynamic import rejects with when its module or one of the module's dependencies failed to
// download, in WebKit, Chromium and Firefox, and what Vite's preload helper throws for a stylesheet.
// An error the module itself throws while evaluating is not a failed download: a reload would only
// repeat it, so it reaches the root like any other error.
const DOWNLOAD_FAILURE_MESSAGES = [
  /^Importing a module script failed\.?$/,
  /^Failed to fetch dynamically imported module/,
  /^error loading dynamically imported module/,
  /^Unable to preload CSS for /,
];

// The error may arrive wrapped, with the browser's as its cause (as Vitest's module mocks do).
export const isDownloadFailure = (error: unknown, depth = 0): boolean =>
  error instanceof Error && (DOWNLOAD_FAILURE_MESSAGES.some((message) => message.test(error.message)) || (depth < 3 && isDownloadFailure(error.cause, depth + 1)));
