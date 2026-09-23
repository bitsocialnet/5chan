import { useEffect, type RefObject } from 'react';

const HIGHLIGHT_NAME = 'search-match';
const MIN_TERM_LENGTH = 2;

/**
 * Only elements carrying this attribute inside the scope are painted, so chrome that repeats the
 * query (the footer's "catalog" button, the page links) stays plain while every result region is
 * covered, however late it mounts.
 */
export const SEARCH_HIGHLIGHT_REGION_ATTRIBUTE = 'data-search-highlight';

type HighlightRegistry = Map<string, Highlight>;

const getHighlightRegistry = (): HighlightRegistry | undefined => {
  if (typeof CSS === 'undefined' || typeof Highlight === 'undefined') return undefined;
  return (CSS as unknown as { highlights?: HighlightRegistry }).highlights;
};

const escapeRegExp = (term: string): string => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Matched case-insensitively with a regex over the original text: lowercasing first would shift the
 * offsets for characters whose lowercase form is longer (İ becomes two code units) and throw.
 */
const getSearchPattern = (query: string): RegExp | null => {
  const terms = [...new Set(query.split(/\s+/))].filter((term) => term.length >= MIN_TERM_LENGTH).sort((a, b) => b.length - a.length);
  if (terms.length === 0) return null;
  return new RegExp(terms.map(escapeRegExp).join('|'), 'giu');
};

const getMatchRanges = (scope: HTMLElement, pattern: RegExp): Range[] => {
  const ranges: Range[] = [];

  for (const region of scope.querySelectorAll<HTMLElement>(`[${SEARCH_HIGHLIGHT_REGION_ATTRIBUTE}]`)) {
    const walker = document.createTreeWalker(region, NodeFilter.SHOW_TEXT);

    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.nodeValue;
      if (!text) continue;

      pattern.lastIndex = 0;
      for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
        const range = document.createRange();
        range.setStart(node, match.index);
        range.setEnd(node, match.index + match[0].length);
        ranges.push(range);
      }
    }
  }

  return ranges;
};

/**
 * Paints the searched terms inside the result regions of the scope with the CSS custom highlight
 * API, which marks up the rendered posts without touching the post components or their DOM.
 * Browsers without the API simply render the results unhighlighted.
 */
const useSearchMatchHighlight = (scopeRef: RefObject<HTMLElement | null>, query: string): void => {
  useEffect(() => {
    const highlights = getHighlightRegistry();
    const scope = scopeRef.current;
    const pattern = getSearchPattern(query);
    if (!highlights || !scope || !pattern) return;

    let frame = 0;
    const paint = () => {
      frame = 0;
      highlights.set(HIGHLIGHT_NAME, new Highlight(...getMatchRanges(scope, pattern)));
    };
    // Results keep arriving after the first paint (the post feed resolves, media and replies load,
    // the indexer's board list lands), so the ranges are rebuilt whenever the scope changes.
    const observer = new MutationObserver(() => {
      if (frame) return;
      frame = requestAnimationFrame(paint);
    });

    paint();
    observer.observe(scope, { characterData: true, childList: true, subtree: true });

    return () => {
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
      highlights.delete(HIGHLIGHT_NAME);
    };
  }, [scopeRef, query]);
};

export default useSearchMatchHighlight;
