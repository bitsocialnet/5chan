// The directory files `yarn sync:directories` mirrors from bitsocialnet/lists, by path. A module of its own so
// the build puts it in the directory data chunk with the files and hands the data over as one binding rather
// than one per file (see scripts/load-perf/directory-data.mjs).
export const directoryModules = import.meta.glob<{ default: unknown }>('./5chan-directories/*.json', { eager: true });
