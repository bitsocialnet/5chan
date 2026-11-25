// The board directory data `yarn sync:directories` mirrors from bitsocialnet/lists into
// src/data/5chan-directories/. The build gives it a chunk of its own (vite.config.js) so
// perf:startup-bytes can measure and limit it apart from the app's code.
export const DIRECTORY_DATA_CHUNK_NAME = 'directory-data';
// The mirrored files and src/data/5chan-directory-modules.ts, which globs them: with the glob inside the chunk,
// the data crosses into the app's code as one binding.
export const DIRECTORY_DATA_MODULE_PATTERN = /[\\/]src[\\/]data[\\/](?:5chan-directories[\\/]|5chan-directory-modules\.ts$)/;
