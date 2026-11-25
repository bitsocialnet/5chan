// Approved boundary for @bitsocial/bitsocial-react-hooks store internals.
//
// This directory is the ONLY place 5chan production code may import from
// `@bitsocial/bitsocial-react-hooks/dist/...`. Every other module must reach
// these stores through this adapter so that future upstream package-layout or
// API changes stay localized to one reviewable file instead of scattering
// across views, hooks, stores, components, and utils.

export { default as accountsStore } from '@bitsocial/bitsocial-react-hooks/dist/stores/accounts/index.js';
export { default as communitiesStore } from '@bitsocial/bitsocial-react-hooks/dist/stores/communities/index.js';
export { default as communitiesPagesStore } from '@bitsocial/bitsocial-react-hooks/dist/stores/communities-pages/index.js';
export { default as feedsStore } from '@bitsocial/bitsocial-react-hooks/dist/stores/feeds/index.js';
export { default as repliesStore, feedOptionsToFeedName } from '@bitsocial/bitsocial-react-hooks/dist/stores/replies/index.js';
export { default as repliesPagesStore } from '@bitsocial/bitsocial-react-hooks/dist/stores/replies-pages/index.js';
// Flips once the hooks' lazily loaded pseudonymity author tag check is ready; until then
// isAccountComment reads a post recognized only by its author tag as someone else's.
export { useAuthorTagCheckStore as authorTagCheckStore } from '@bitsocial/bitsocial-react-hooks/dist/lib/author-tag-check.js';
