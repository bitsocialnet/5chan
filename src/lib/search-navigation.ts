export const MAX_SEARCH_QUERY_LENGTH = 200;
/** /search/ never runs empty: with no query in the URL it searches for 5chan itself. */
export const DEFAULT_SEARCH_QUERY = '5chan';
export const SEARCH_PATH = '/search';
export const SEARCH_CATALOG_PATH = '/search/catalog';
export const SEARCH_DIRECTORY_PATH = '/search/directory';
export type SearchPostStatus = 'active' | 'archived' | 'all';
export const DEFAULT_SEARCH_POST_STATUS: SearchPostStatus = 'active';

export const getSearchPostStatus = (value: string | null): SearchPostStatus => (value === 'archived' || value === 'all' ? value : DEFAULT_SEARCH_POST_STATUS);

export const getSearchPageHref = (
  basePath: string,
  query: string,
  page = 1,
  postStatus: SearchPostStatus = DEFAULT_SEARCH_POST_STATUS,
): { pathname: string; search: string } => {
  const params = new URLSearchParams({ q: query });
  if (page > 1) params.set('page', String(page));
  if (postStatus !== DEFAULT_SEARCH_POST_STATUS) params.set('status', postStatus);
  return { pathname: basePath, search: `?${params.toString()}` };
};

export const getSearchPath = (query: string, page = 1, postStatus: SearchPostStatus = DEFAULT_SEARCH_POST_STATUS): string => {
  const { pathname, search } = getSearchPageHref(SEARCH_PATH, query, page, postStatus);
  return `${pathname}${search}`;
};

/** Keeps the current query out of the provider directory URL while still allowing a return to it. */
export const getSearchDirectoryLinkState = (query: string, postStatus: SearchPostStatus = DEFAULT_SEARCH_POST_STATUS, basePath = SEARCH_PATH, page = 1) => {
  if (!query) return undefined;
  const { pathname, search } = getSearchPageHref(basePath, query, page, postStatus);
  return { returnPath: `${pathname}${search}` };
};

/**
 * The homepage bar submits its text as a search, whatever it looks like: a board code, name or
 * address is matched on the results page, listed above the posts, instead of being routed past it.
 * "lit" may as well be a word someone wants to find in posts.
 */
export const getSearchSubmitPath = (input: string): string | null => {
  const query = input.trim().slice(0, MAX_SEARCH_QUERY_LENGTH);
  return query ? getSearchPath(query) : null;
};
