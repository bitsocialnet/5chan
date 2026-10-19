/**
 * Caches a function's results by its arguments, compared by identity, keeping the `max` most
 * recently used. Errors are not cached. It replaces memoizee, which with es5-ext was about 8 KB
 * of startup JavaScript (brotli) for these few helpers.
 */
export const memoize = <Args extends unknown[], Result>(fn: (...args: Args) => Result, { max }: { max: number }): ((...args: Args) => Result) => {
  type Entry = { args: Args; result: Result };
  // Entries are found by their first argument, then by the rest.
  const byFirstArgument = new Map<unknown, Entry[]>();
  // Least recently used first.
  const recent = new Set<Entry>();
  const matches = (entry: Entry, args: Args) => entry.args.length === args.length && entry.args.every((arg, i) => arg === args[i]);

  return (...args: Args) => {
    const entries = byFirstArgument.get(args[0]);
    const cached = entries?.find((entry) => matches(entry, args));
    if (cached) {
      recent.delete(cached);
      recent.add(cached);
      return cached.result;
    }

    const entry = { args, result: fn(...args) };
    byFirstArgument.set(args[0], entries ? [...entries, entry] : [entry]);
    recent.add(entry);
    if (recent.size > max) {
      const [oldest] = recent;
      recent.delete(oldest);
      const siblings = (byFirstArgument.get(oldest.args[0]) ?? []).filter((sibling) => sibling !== oldest);
      if (siblings.length > 0) {
        byFirstArgument.set(oldest.args[0], siblings);
      } else {
        byFirstArgument.delete(oldest.args[0]);
      }
    }
    return entry.result;
  };
};
