import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const scriptPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'pw-session.sh');

// A stand-in for playwright-cli so the lock can be exercised without launching
// real browser engines. `list` reports the session recorded in liveSession as
// `status: open`, mirroring the real `playwright-cli list --all` output.
const FAKE_CLI = `#!/bin/bash
state="$(dirname "$0")/live-session"
open_rc="$(dirname "$0")/open-exit-code"
if [ "\${1:-}" = "list" ]; then
  live="$(cat "$state")"
  [ "$live" = "__UNAVAILABLE__" ] && exit 3
  echo "### Browsers"
  if [ -n "$live" ]; then
    echo "- $live:"
    echo "  - status: open"
  fi
  echo "- already-closed:"
  echo "  - status: closed"
  exit 0
fi
session="\${1#-s=}"
case "\${2:-}" in
  open)
    rc="$(cat "$open_rc")"
    [ "$rc" = 0 ] && printf '%s' "$session" >"$state"
    exit "$rc"
    ;;
  close)
    [ "$(cat "$state")" = "$session" ] && printf '' >"$state"
    exit 0
    ;;
esac
exit 0
`;

let tempDir;

// Status and diagnostics are split across stdout and stderr, so assertions read
// both streams.
const runWithPath = (pathPrefix, ...args) => {
  const result = spawnSync(scriptPath, args, {
    encoding: 'utf8',
    // A script that never returns fails its test instead of hanging the run.
    timeout: 15_000,
    killSignal: 'SIGKILL',
    // PATH and HOME are named explicitly rather than relying on spreading
    // process.env, which vitest patches per environment.
    env: {
      PATH: `${pathPrefix}${process.env.PATH}`,
      HOME: process.env.HOME,
      PLAYWRIGHT_RESOURCE_LOCK_DIR: path.join(tempDir, 'slot.lock'),
      PLAYWRIGHT_CLI_BIN: path.join(tempDir, 'fake-playwright-cli'),
      PW_SESSION_POLL_SECONDS: '1',
    },
  });
  return { code: result.status, output: `${result.stdout}${result.stderr}` };
};
const run = (...args) => runWithPath('', ...args);

const lockDir = () => path.join(tempDir, 'slot.lock');
const lockExists = () => fs.existsSync(lockDir());
// A negative age dates the slot in the future, as after the clock was set back.
const setLockAge = (ageSeconds) => {
  const taken = new Date(Date.now() - ageSeconds * 1000);
  fs.utimesSync(lockDir(), taken, taken);
};
// Ages the slot past the launch grace period, after which a slot without a running browser is stale.
const backdateLock = () => setLockAge(5 * 60);
// A reclaim mutex as left behind by a reclaimer that was killed `ageSeconds` ago.
const leaveReclaimMutex = (ageSeconds, { strayFile = false } = {}) => {
  const mutex = `${lockDir()}.reclaim`;
  fs.mkdirSync(mutex);
  if (strayFile) fs.writeFileSync(path.join(mutex, 'stray'), '');
  const created = new Date(Date.now() - ageSeconds * 1000);
  fs.utimesSync(mutex, created, created);
  return mutex;
};
const setLiveSession = (session) => fs.writeFileSync(path.join(tempDir, 'live-session'), session);
const liveSession = () => fs.readFileSync(path.join(tempDir, 'live-session'), 'utf8');
const setOpenExitCode = (code) => fs.writeFileSync(path.join(tempDir, 'open-exit-code'), String(code));

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-session-test-'));
  const fakeCli = path.join(tempDir, 'fake-playwright-cli');
  fs.writeFileSync(fakeCli, FAKE_CLI, { mode: 0o755 });
  setLiveSession('');
  setOpenExitCode(0);
});

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe('pw-session.sh', () => {
  it('reports an available slot and rejects malformed session names', () => {
    expect(run('status').output).toContain('browser slot is available');

    const rejected = run('open', 'bad name!');
    expect(rejected.code).toBe(1);
    expect(rejected.output).toContain('session must be 1-40');
  });

  it('acquires the slot, records the owner, and blocks a second live acquire with exit 75', () => {
    expect(run('open', 'verify-chrome', 'about:blank').output).toContain("acquired browser slot for 'verify-chrome'");
    expect(run('status').output).toContain('Browser: running');

    const blocked = run('open', 'verify-firefox', 'about:blank');
    expect(blocked.code).toBe(75);
    expect(blocked.output).toContain('do not bypass the lock');
  });

  it('refuses to release or steal a slot owned by another session', () => {
    run('open', 'verify-chrome', 'about:blank');

    const released = run('release', 'verify-firefox');
    expect(released.code).toBe(1);
    expect(released.output).toContain("cannot release the slot held by 'verify-chrome'");

    // Closing a different session must still stop that browser without
    // dropping someone else's lock.
    expect(run('close', 'verify-firefox').output).toContain("left the slot held by 'verify-chrome' untouched");
    expect(lockExists()).toBe(true);
  });

  it('releases the slot when the owner closes it', () => {
    run('open', 'verify-chrome', 'about:blank');

    expect(run('close', 'verify-chrome').output).toContain("released browser slot for 'verify-chrome'");
    expect(lockExists()).toBe(false);
  });

  it('reclaims a stale slot whose browser is gone instead of blocking forever', () => {
    run('open', 'verify-chrome', 'about:blank');
    setLiveSession(''); // the browser died without releasing the lock
    backdateLock();

    const status = run('status');
    expect(status.output).toContain('stale lock');
    expect(status.output).toContain('reclaims this slot automatically');

    const reclaimed = run('open', 'verify-firefox', 'about:blank');
    expect(reclaimed.code).toBe(0);
    expect(reclaimed.output).toContain("reclaimed stale slot from 'verify-chrome'");
  });

  it('does not reclaim a slot whose owner is still being written', () => {
    fs.mkdirSync(lockDir()); // taken an instant ago; its metadata is not written yet

    const blocked = run('open', 'verify-firefox', 'about:blank');
    expect(blocked.code).toBe(75);
    expect(blocked.output).toContain('browser starting');
    expect(lockExists()).toBe(true);
    expect(liveSession()).toBe('');
  });

  it('does not reclaim a fresh slot whose browser is not listed open yet', () => {
    run('open', 'verify-chrome', 'about:blank');
    setLiveSession(''); // playwright-cli lists a session only once its daemon is listening

    const blocked = run('open', 'verify-firefox', 'about:blank');
    expect(blocked.code).toBe(75);
    const status = run('status').output;
    expect(status).toContain('browser starting');
    expect(status).toContain('Session: verify-chrome');
  });

  it('reclaims an ownerless slot once the launch grace period has passed', () => {
    fs.mkdirSync(lockDir());
    backdateLock();

    const reclaimed = run('open', 'verify-firefox', 'about:blank');
    expect(reclaimed.code).toBe(0);
    expect(reclaimed.output).toContain("reclaimed stale slot from 'unknown'");
  });

  it('reclaims a dead slot dated far in the future instead of keeping it until that date', () => {
    run('open', 'verify-chrome', 'about:blank');
    setLiveSession('');
    setLockAge(-3600); // the clock was set back an hour after the slot was taken

    expect(run('status').output).toContain('stale lock');
    const reclaimed = run('open', 'verify-firefox', 'about:blank');
    expect(reclaimed.code).toBe(0);
    expect(reclaimed.output).toContain("reclaimed stale slot from 'verify-chrome'");
  });

  it('still counts a fresh slot as starting after the clock steps back a few seconds', () => {
    run('open', 'verify-chrome', 'about:blank');
    setLiveSession('');
    setLockAge(-10);

    const blocked = run('open', 'verify-firefox', 'about:blank');
    expect(blocked.code).toBe(75);
    expect(blocked.output).toContain('browser starting');
  });

  // The owner re-check catches a slot taken by another session, and the age re-check one taken
  // again under the stale owner's own session name.
  it.each(['fresh-owner', 'dead-one'])('does not delete a slot %s took after it was judged stale', (newOwner) => {
    run('open', 'dead-one', 'about:blank');
    setLiveSession(''); // dead-one's browser died
    backdateLock();
    // The first `stat` of the lock reports dead-one's old age, then another opener reclaims
    // it and takes the slot before this open acts on its verdict. Later calls use the real stat.
    const shimDir = path.join(tempDir, 'stat-shim');
    fs.mkdirSync(shimDir);
    fs.writeFileSync(
      path.join(shimDir, 'stat'),
      `#!/bin/bash
if [ "\${@: -1}" = ${JSON.stringify(lockDir())} ] && mkdir ${JSON.stringify(path.join(tempDir, 'stat-swapped'))} 2>/dev/null; then
  echo $(($(date +%s) - 300))
  rm -rf "\${@: -1}" && mkdir "\${@: -1}" && echo ${newOwner} >"\${@: -1}/owner"
  printf ${newOwner} >${JSON.stringify(path.join(tempDir, 'live-session'))}
  exit 0
fi
PATH="\${PATH#*:}" exec stat "$@"
`,
      { mode: 0o755 },
    );

    const blocked = runWithPath(`${shimDir}:`, 'open', 'verify-firefox', 'about:blank');
    expect(blocked.code).toBe(75);
    expect(blocked.output).not.toContain('reclaimed stale slot');
    expect(fs.readFileSync(path.join(lockDir(), 'owner'), 'utf8')).toBe(`${newOwner}\n`);
    expect(liveSession()).toBe(newOwner);
  });

  it('breaks a reclaim mutex left behind by a killed reclaimer', () => {
    run('open', 'dead-one', 'about:blank');
    setLiveSession('');
    backdateLock();
    const mutex = leaveReclaimMutex(60);

    const reclaimed = run('open', 'verify-firefox', 'about:blank');
    expect(reclaimed.code).toBe(0);
    expect(reclaimed.output).toContain("reclaimed stale slot from 'dead-one'");
    expect(fs.existsSync(mutex)).toBe(false);
  });

  it('still stops the browser when the lock was already lost', () => {
    run('open', 'verify-chrome', 'about:blank');
    fs.rmSync(path.join(tempDir, 'slot.lock'), { recursive: true });

    expect(run('close', 'verify-chrome').output).toContain("already free; closed 'verify-chrome' anyway");
    expect(liveSession()).toBe('');
  });

  it('releases the slot when the browser fails to start', () => {
    setOpenExitCode(1);

    const failed = run('open', 'verify-chrome', 'about:blank');
    expect(failed.code).toBe(1);
    expect(failed.output).toContain('released browser slot');
    expect(lockExists()).toBe(false);
  });

  it('leaves the lock alone when browser liveness cannot be verified', () => {
    run('open', 'verify-chrome', 'about:blank');
    setLiveSession('__UNAVAILABLE__'); // playwright-cli list fails

    expect(run('status').output).toContain('unverifiable');

    // Failing closed matters: a broken CLI must not silently disable the budget.
    const blocked = run('open', 'verify-firefox', 'about:blank');
    expect(blocked.code).toBe(75);
    expect(lockExists()).toBe(true);
  });

  it('polls for a busy slot with --wait and gives up with exit 75', () => {
    run('open', 'verify-chrome', 'about:blank');

    const timedOut = run('open', '--wait=2', 'verify-firefox', 'about:blank');
    expect(timedOut.code).toBe(75);
    expect(timedOut.output).toContain('gave up after 2s');
    expect(timedOut.output).toContain('retrying in 1s');

    const malformed = run('open', '--wait=soon', 'verify-firefox');
    expect(malformed.code).toBe(1);
    expect(malformed.output).toContain('whole number of seconds');
  });

  it('honours --wait after the session name instead of passing it to playwright-cli', () => {
    run('open', 'verify-chrome', 'about:blank');

    const afterSession = run('open', 'verify-firefox', '--wait=2', 'about:blank');
    expect(afterSession.code).toBe(75);
    expect(afterSession.output).toContain('gave up after 2s');
  });

  it('fails loudly instead of spinning when a stale lock cannot be removed', () => {
    run('open', 'verify-chrome', 'about:blank');
    setLiveSession(''); // stale, but the lock directory is not removable
    backdateLock();
    fs.chmodSync(tempDir, 0o500);

    try {
      const stuck = run('open', 'verify-firefox', 'about:blank');
      expect(stuck.code).toBe(75);
      expect(stuck.output).toContain('could not reclaim the stale slot');
    } finally {
      fs.chmodSync(tempDir, 0o700);
    }
  });

  it('fails loudly instead of spinning when a leftover reclaim mutex cannot be removed', () => {
    run('open', 'verify-chrome', 'about:blank');
    setLiveSession('');
    backdateLock();
    leaveReclaimMutex(60);
    fs.chmodSync(tempDir, 0o500);

    try {
      const stuck = run('open', 'verify-firefox', 'about:blank');
      expect(stuck.code).toBe(75);
      expect(stuck.output).toContain('could not take or break the reclaim mutex');
      expect(stuck.output).toContain('could not reclaim the stale slot');
    } finally {
      fs.chmodSync(tempDir, 0o700);
    }
  }, 30_000);

  it('fails loudly instead of spinning when a leftover reclaim mutex is not an empty directory', () => {
    run('open', 'verify-chrome', 'about:blank');
    setLiveSession('');
    backdateLock();
    leaveReclaimMutex(60, { strayFile: true });

    const stuck = run('open', 'verify-firefox', 'about:blank');
    expect(stuck.code).toBe(75);
    expect(stuck.output).toContain('could not take or break the reclaim mutex');
    expect(fs.readFileSync(path.join(lockDir(), 'owner'), 'utf8')).toBe('verify-chrome\n');
  }, 30_000);

  it('gives up waiting on a reclaim mutex dated in the future', () => {
    run('open', 'verify-chrome', 'about:blank');
    setLiveSession('');
    backdateLock();
    leaveReclaimMutex(-3600); // such as after the clock was set back
    // Each wait for the mutex sleeps 0.1s; skip the sleeps so the bounded wait runs quickly.
    const shimDir = path.join(tempDir, 'sleep-shim');
    fs.mkdirSync(shimDir);
    fs.writeFileSync(path.join(shimDir, 'sleep'), '#!/bin/bash\nexit 0\n', { mode: 0o755 });

    const stuck = runWithPath(`${shimDir}:`, 'open', 'verify-firefox', 'about:blank');
    expect(stuck.code).toBe(75);
    expect(stuck.output).toContain('could not take or break the reclaim mutex');
    expect(stuck.output).toContain('could not reclaim the stale slot');
  }, 30_000);

  it('opens with no extra playwright-cli arguments', () => {
    // Bash 3.2 errors on an empty array expansion under `set -u`, so the
    // no-arguments path needs its own guard.
    const opened = run('open', 'verify-chrome');
    expect(opened.code).toBe(0);
    expect(opened.output).toContain("acquired browser slot for 'verify-chrome'");
  });

  it('prints usage for an unknown subcommand', () => {
    const unknown = run('bogus');
    expect(unknown.code).toBe(1);
    expect(unknown.output).toContain('Usage:');
  });
});
