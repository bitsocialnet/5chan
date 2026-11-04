import assert from 'node:assert/strict';
import test from 'node:test';
import { releaseNotesFromBlotter, syncGradleVersion, versionNameToCode } from '../sync-android-release.mjs';

const gradle = '    defaultConfig {\n        versionCode 1003\n        versionName "0.10.3"\n    }\n';

test('derives the versionCode used by the Android build', () => {
  assert.equal(versionNameToCode('0.10.4'), 1004);
  assert.equal(versionNameToCode('v1.2.3-beta.1'), 10203);
  assert.equal(versionNameToCode('2.0'), 20000);
});

test('rewrites only the literal version lines F-Droid reads', () => {
  assert.equal(syncGradleVersion(gradle, '0.11.0', 1100), '    defaultConfig {\n        versionCode 1100\n        versionName "0.11.0"\n    }\n');
  assert.equal(syncGradleVersion(gradle, '0.10.3', 1003), gradle);
});

test('rejects a build.gradle without literal version lines', () => {
  assert.throws(() => syncGradleVersion('versionCode resolvedVersionCode\n', '0.10.4', 1004), /no literal/);
});

test('uses the blotter release message without its version prefix', () => {
  const entries = [
    { kind: 'manual', message: 'Maintenance tonight' },
    { kind: 'release', version: '0.10.4', message: 'v0.10.4: Board pagination, spoiler tags' },
  ];
  assert.equal(releaseNotesFromBlotter(entries, '0.10.4'), 'Board pagination, spoiler tags');
  assert.equal(releaseNotesFromBlotter(entries, '0.10.5'), null);
});
