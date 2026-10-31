import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeChangelogSection } from '../changelog.mjs';

const previous = '## [1.0.1](compare) (2026-01-02)\n\n* old fix\n\n## [1.0.0](compare) (2026-01-01)\n\n* first\n';

test('prepends the new release with one blank line and keeps history byte-identical', () => {
  const { version, content } = mergeChangelogSection('## [1.0.2](compare) (2026-01-03)\n\n\n### Bug Fixes\n\n* new fix\n', previous);
  assert.equal(version, '1.0.2');
  assert.equal(content, `## [1.0.2](compare) (2026-01-03)\n\n\n### Bug Fixes\n\n* new fix\n\n${previous}`);
});

test('replaces the top section when rerun for the same version', () => {
  const first = mergeChangelogSection('## [1.0.2](compare) (2026-01-03)\n\n* draft\n', previous).content;
  const { content } = mergeChangelogSection('# [1.0.2](compare) (2026-01-03)\n\n* final\n', first);
  assert.equal(content, `# [1.0.2](compare) (2026-01-03)\n\n* final\n\n${previous}`);
});

test('rejects output without a release heading', () => {
  assert.throws(() => mergeChangelogSection('nothing\n', previous), /no release heading/);
});
