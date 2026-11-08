import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { mergeChangelogSection } from '../changelog.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

test('links numeric issue references only, not a word after # such as a tripcode password', () => {
  const repo = mkdtempSync(path.join(tmpdir(), '5chan-changelog-'));
  try {
    const git = (...args) =>
      execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...args], {
        cwd: repo,
      });
    writeFileSync(path.join(repo, 'package.json'), JSON.stringify({ name: 'fixture', version: '1.0.0', repository: 'https://github.com/bitsocialnet/5chan' }));
    git('init', '-q');
    git('add', 'package.json');
    git('commit', '-q', '-m', 'feat(posts): add tripcodes (#1281)', '-m', 'Name#password and Name##password sign posts.', '-m', 'Closes #12 and other/repo#34');

    const output = execFileSync(
      path.join(ROOT, 'node_modules', '.bin', 'conventional-changelog'),
      ['-p', 'angular', '-n', path.join(ROOT, 'scripts', 'conventional-changelog.config.mjs')],
      { cwd: repo, encoding: 'utf8' },
    );

    assert.match(output, /bitsocialnet\/5chan\/issues\/1281\)/);
    assert.match(output, /bitsocialnet\/5chan\/issues\/12\)/);
    assert.match(output, /other\/repo\/issues\/34\)/);
    assert.doesNotMatch(output, /password/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

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
