// Shared by scripts/changelog.mjs (CHANGELOG.md) and scripts/release-body.js (GitHub release notes).
// GitHub issue numbers are digits, but the parser's default `#` prefix takes any word after it, so a
// commit body mentioning a tripcode such as `Name#password` became a "closes" link to a fake issue.
export default {
  parserOpts: {
    issuePrefixes: [/#(?=\d)/],
  },
};
