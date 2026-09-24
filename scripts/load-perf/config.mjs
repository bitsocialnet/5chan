// Production class names are CSS-module hashes (`_<local>_<hash>_<line>`), so regions
// match on the stable local name.
export default {
  viewport: { width: 1280, height: 900 },
  // A cold load must commit within commitTimeoutMs; layout changes are then observed for settleMs.
  commitTimeoutMs: 90000,
  settleMs: 5000,
  regions: {
    logo: '[class*="_logo_"]',
    searchBar: '[class*="_searchBar_"]',
    infoBox: '[class*="_infoBox_"]',
    boards: '[class*="_boardsContent_"]',
    popularThreads: '[class*="_popularThreads_"]',
    boardsBar: '[class*="_boardsBar_"]',
    boardHeader: '[class*="_boardHeader_"], [class*="_banner_"]',
    postForm: '[class*="_postForm_"]',
    threads: '[class*="_thread_"]',
  },
  // `storage` seeds localStorage before the app loads; `viewport` and `locale` override the defaults.
  // `staticShell: true` routes must show scripts/vite-static-shell.mjs's shell, identical to React's
  // first frame; `staticShell: false` routes must not show it.
  routes: [
    { name: 'home', hash: '/', staticShell: true, content: '[class*="_popularThreads_"] a[href*="/thread/"]' },
    { name: 'home-mobile', hash: '/', staticShell: true, viewport: { width: 375, height: 812 } },
    { name: 'home-intro-closed', hash: '/', staticShell: false, storage: { 'homepage-introduction': '{"state":{"showIntroduction":false},"version":0}' } },
    { name: 'home-german', hash: '/', staticShell: false, storage: { '5chan-interface-language': 'de' } },
    { name: 'board', hash: '/biz', staticShell: false, content: '[class*="_thread_"]' },
  ],
};
